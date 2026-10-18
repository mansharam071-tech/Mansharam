# Supplementary HomeServe regression tests: decline penalty, en_route fee, coupons, settlements/payouts, partner admin actions, auth playbook
import os
import time
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"


def otp_login(phone, role):
    r = requests.post(f"{API}/auth/otp/verify", json={"phone": phone, "otp": "1234", "role": role})
    assert r.status_code == 200, r.text
    return r.json()["token"]


def H(t):
    return {"Authorization": f"Bearer {t}"}


@pytest.fixture(scope="module")
def ctok():
    return otp_login("9999999999", "customer")


@pytest.fixture(scope="module")
def ptok():
    t = otp_login("9000000001", "partner")
    yield t
    requests.post(f"{API}/partner/status", headers=H(t), json={"is_online": False})


@pytest.fixture(scope="module")
def atok():
    r = requests.post(f"{API}/auth/admin/login", json={"email": "admin@homeserve.in", "password": "Admin@123"})
    assert r.status_code == 200
    return r.json()["token"]


def book(ctok, sid="serv_elec_01", method="upi", qty=1, coupon=None):
    requests.delete(f"{API}/customer/cart", headers=H(ctok))
    requests.post(f"{API}/customer/cart/items", headers=H(ctok), json={"service_id": sid, "qty": qty})
    body = {"address_id": "addr_demo_home", "payment_method": method}
    if coupon:
        body["coupon_code"] = coupon
    return requests.post(f"{API}/customer/bookings", headers=H(ctok), json=body)


def wait_offer(ptok, bid, tries=6):
    for _ in range(tries):
        o = requests.get(f"{API}/partner/offer", headers=H(ptok)).json()["offer"]
        if o and o["booking_id"] == bid:
            return o
        if o:
            requests.post(f"{API}/partner/offers/{o['booking_id']}/decline", headers=H(ptok))
        time.sleep(1)
    return None


# Coupons via cart quote
class TestCoupons:
    def test_first50_rejected_for_repeat_user(self, ctok):
        requests.delete(f"{API}/customer/cart", headers=H(ctok))
        requests.post(f"{API}/customer/cart/items", headers=H(ctok), json={"service_id": "serv_elec_01", "qty": 1})
        r = requests.get(f"{API}/customer/cart", headers=H(ctok), params={"coupon_code": "FIRST50"}).json()
        assert r["coupon_error"] and "first" in r["coupon_error"].lower()

    def test_save100_min_order(self, ctok):
        r = requests.get(f"{API}/customer/cart", headers=H(ctok), params={"coupon_code": "SAVE100"}).json()
        sub = r["pricing"]["subtotal"] + r["pricing"]["surge_amount"]
        if sub < 999:
            assert r["coupon_error"]
        requests.put(f"{API}/customer/cart/items/serv_elec_01", headers=H(ctok), json={"service_id": "serv_elec_01", "qty": 10})
        r = requests.get(f"{API}/customer/cart", headers=H(ctok), params={"coupon_code": "SAVE100"}).json()
        assert r["coupon_error"] is None and r["pricing"]["discount"] == 100
        p = r["pricing"]
        assert abs(p["gst"] - round(p["taxable"] * 0.18, 2)) < 0.02
        assert p["surge_multiplier"] >= 1.2  # Lucknow city surge
        requests.delete(f"{API}/customer/cart", headers=H(ctok))

    def test_acfest_needs_ac(self, ctok):
        requests.post(f"{API}/customer/cart/items", headers=H(ctok), json={"service_id": "serv_elec_01", "qty": 1})
        r = requests.get(f"{API}/customer/cart", headers=H(ctok), params={"coupon_code": "ACFEST"}).json()
        assert r["coupon_error"]
        requests.delete(f"{API}/customer/cart", headers=H(ctok))


# Dispatch decline & en_route cancellation
class TestDispatch:
    def test_decline_increments_and_penalty(self, ctok, ptok, atok):
        assert requests.post(f"{API}/partner/status", headers=H(ptok), json={"is_online": True}).status_code == 200
        pid = requests.get(f"{API}/auth/me", headers=H(ptok)).json()["id"]
        requests.post(f"{API}/admin/partners/{pid}/reset-rejections", headers=H(atok))
        pens0 = len(requests.get(f"{API}/partner/earnings", headers=H(ptok)).json()["penalties"])
        bids = []
        for i in range(3):
            r = book(ctok)
            assert r.status_code == 200, r.text
            bid = r.json()["id"]
            bids.append(bid)
            o = wait_offer(ptok, bid)
            assert o, "offer not received"
            d = requests.post(f"{API}/partner/offers/{bid}/decline", headers=H(ptok)).json()
            assert d["consecutive_rejections"] == i + 1
        pens1 = len(requests.get(f"{API}/partner/earnings", headers=H(ptok)).json()["penalties"])
        assert pens1 == pens0 + 1
        # declined booking should not be re-offered to same partner
        o = requests.get(f"{API}/partner/offer", headers=H(ptok)).json()["offer"]
        assert not o or o["booking_id"] not in bids
        for b in bids:
            requests.post(f"{API}/customer/bookings/{b}/cancel", headers=H(ctok))
        r = requests.post(f"{API}/admin/partners/{pid}/reset-rejections", headers=H(atok))
        assert r.status_code == 200

    def test_en_route_cancel_99(self, ctok, ptok):
        r = book(ctok)
        bid = r.json()["id"]
        total = r.json()["pricing"]["total"]
        assert wait_offer(ptok, bid)
        assert requests.post(f"{API}/partner/offers/{bid}/accept", headers=H(ptok)).status_code == 200
        assert requests.post(f"{API}/partner/jobs/{bid}/navigate", headers=H(ptok)).status_code == 200
        cb = requests.get(f"{API}/customer/bookings/{bid}", headers=H(ctok)).json()
        assert cb["status"] == "en_route" and cb["live_location"] and cb["eta_min"]
        c = requests.post(f"{API}/customer/bookings/{bid}/cancel", headers=H(ctok)).json()
        assert c["fee"] == 99 and abs(c["refund"] - round(total - 99, 2)) < 0.01
        requests.post(f"{API}/partner/status", headers=H(ptok), json={"is_online": False})


# Admin finance & partner ops
class TestAdminOps:
    def test_settlement_generate_release(self, atok):
        r = requests.post(f"{API}/admin/settlements/generate", headers=H(atok))
        assert r.status_code == 200
        st = requests.get(f"{API}/admin/settlements", headers=H(atok)).json()
        pend = [s for s in st if s["status"] == "pending"]
        if not pend:
            pytest.skip("no pending settlements")
        r = requests.post(f"{API}/admin/settlements/{pend[0]['id']}/release", headers=H(atok))
        assert r.status_code == 200
        r = requests.post(f"{API}/admin/settlements/{pend[0]['id']}/release", headers=H(atok))
        assert r.status_code == 400

    def test_withdraw_and_payout(self, ptok, atok):
        e = requests.get(f"{API}/partner/earnings", headers=H(ptok)).json()
        assert e["wallet_balance"] >= 1
        r = requests.post(f"{API}/partner/withdraw", headers=H(ptok), json={"amount": 1})
        assert r.status_code == 200, r.text
        po = r.json()
        assert any(p["id"] == po["id"] for p in requests.get(f"{API}/admin/payouts", headers=H(atok)).json())
        assert requests.post(f"{API}/admin/payouts/{po['id']}/pay", headers=H(atok)).status_code == 200
        assert requests.post(f"{API}/admin/payouts/{po['id']}/pay", headers=H(atok)).status_code == 400

    def test_kyc_queue_seeded(self, atok):
        q = requests.get(f"{API}/admin/kyc", headers=H(atok)).json()
        phones = [p.get("phone") for p in q]
        assert "9000000006" in phones and "9000000007" in phones

    def test_settle_cod(self, atok):
        ps = requests.get(f"{API}/admin/partners", headers=H(atok)).json()
        assert len(ps) >= 7
        r = requests.post(f"{API}/admin/partners/{ps[0]['id']}/settle-cod", headers=H(atok))
        assert r.status_code == 200

    def test_alerts_and_search(self, atok):
        r = requests.get(f"{API}/admin/alerts", headers=H(atok))
        assert r.status_code == 200
        r = requests.get(f"{API}/admin/search", headers=H(atok), params={"q": "9999"})
        assert r.status_code == 200


# Auth playbook checks
class TestAuthPlaybook:
    def test_cors_credentials(self):
        r = requests.options(f"{API}/auth/admin/login", headers={"Origin": "https://evil.example.com",
                                                                   "Access-Control-Request-Method": "POST"})
        print("ACAO:", r.headers.get("access-control-allow-origin"), "ACAC:", r.headers.get("access-control-allow-credentials"))
        assert r.status_code in (200, 204, 400)
