# HomeServe ecosystem API regression tests (auth, catalog, cart/checkout, booking lifecycle, partner, admin, role isolation)
import os
import time
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"
CUST_PHONE, PARTNER_PHONE, OTP = "9999999999", "9000000001", "1234"
import random
NEW_PARTNER = f"91{random.randint(10000000, 99999999)}"
ADMIN = {"email": "admin@homeserve.in", "password": "Admin@123"}


def otp_login(phone, role):
    r = requests.post(f"{API}/auth/otp/verify", json={"phone": phone, "otp": OTP, "role": role})
    assert r.status_code == 200, r.text
    return r.json()["token"]


def H(t):
    return {"Authorization": f"Bearer {t}"}


@pytest.fixture(scope="module")
def ctok():
    return otp_login(CUST_PHONE, "customer")


@pytest.fixture(scope="module")
def ptok():
    return otp_login(PARTNER_PHONE, "partner")


@pytest.fixture(scope="module")
def atok():
    r = requests.post(f"{API}/auth/admin/login", json=ADMIN)
    assert r.status_code == 200, r.text
    return r.json()["token"]


# ---------- Auth ----------
class TestAuth:
    def test_wrong_otp(self):
        r = requests.post(f"{API}/auth/otp/verify", json={"phone": CUST_PHONE, "otp": "0000", "role": "customer"})
        assert r.status_code == 400 and "OTP" in r.json()["detail"]

    def test_invalid_phone(self):
        r = requests.post(f"{API}/auth/otp/send", json={"phone": "12345", "role": "customer"})
        assert r.status_code == 400

    def test_customer_me(self, ctok):
        r = requests.get(f"{API}/auth/me", headers=H(ctok))
        assert r.status_code == 200 and r.json()["phone"] == CUST_PHONE and "password_hash" not in r.json()

    def test_admin_wrong_password(self):
        r = requests.post(f"{API}/auth/admin/login", json={"email": "TEST_nobody@x.in", "password": "bad"})
        assert r.status_code == 401

    def test_admin_login(self, atok):
        r = requests.get(f"{API}/auth/me", headers=H(atok))
        assert r.json()["role"] == "admin"


# ---------- Role isolation ----------
class TestRoles:
    def test_customer_blocked_from_admin_partner(self, ctok):
        assert requests.get(f"{API}/admin/dashboard", headers=H(ctok)).status_code == 403
        assert requests.get(f"{API}/partner/dashboard", headers=H(ctok)).status_code == 403

    def test_partner_blocked_from_admin(self, ptok):
        assert requests.get(f"{API}/admin/bookings", headers=H(ptok)).status_code == 403

    def test_no_token(self):
        assert requests.get(f"{API}/customer/cart").status_code == 401

    def test_other_customer_booking_404(self, ctok, atok):
        bs = requests.get(f"{API}/admin/bookings", headers=H(atok)).json()["bookings"]
        other = next(b for b in bs if b["customer_id"] != "usr_demo_customer")
        assert requests.get(f"{API}/customer/bookings/{other['id']}", headers=H(ctok)).status_code == 404


# ---------- Catalog & coupons ----------
class TestCatalogCoupons:
    def test_home(self):
        d = requests.get(f"{API}/catalog/home").json()
        assert len(d["categories"]) >= 8 and d["banners"] and d["trending"]

    def test_service_detail_city_price(self):
        d = requests.get(f"{API}/catalog/services/serv_ac_01", params={"pincode": "226001"}).json()
        assert d["city_price"] == 499 and d["addons"]

    def test_search(self):
        d = requests.get(f"{API}/catalog/services", params={"q": "ac"}).json()
        assert any(s["id"] == "serv_ac_01" for s in d)

    def test_coupons_and_pricing(self, ctok):
        requests.delete(f"{API}/customer/cart", headers=H(ctok))
        requests.post(f"{API}/customer/cart/items", headers=H(ctok), json={"service_id": "serv_ac_01", "qty": 2})
        base = requests.get(f"{API}/customer/cart", headers=H(ctok), params={"address_id": "addr_demo_home"}).json()
        p = base["pricing"]
        assert p["subtotal"] == 998.0
        assert p["surge_multiplier"] in (1.2, 1.3)
        assert abs(p["gst"] - round(p["taxable"] * 0.18, 2)) < 0.02
        s = requests.get(f"{API}/customer/cart", headers=H(ctok), params={"address_id": "addr_demo_home", "coupon_code": "SAVE100"}).json()
        assert s["coupon_error"] is None and s["pricing"]["discount"] == 100
        f = requests.get(f"{API}/customer/cart", headers=H(ctok), params={"address_id": "addr_demo_home", "coupon_code": "FIRST50"}).json()
        assert f["coupon_error"] == "Valid on first order only"
        a = requests.get(f"{API}/customer/cart", headers=H(ctok), params={"address_id": "addr_demo_home", "coupon_code": "ACFEST"}).json()
        assert a["coupon_error"] is None and a["pricing"]["discount"] > 0
        requests.delete(f"{API}/customer/cart", headers=H(ctok))


# ---------- Full lifecycle: book -> offer -> accept -> navigate -> start -> extra -> complete -> rate ----------
class TestLifecycle:
    state = {}

    def test_full_flow(self, ctok, ptok, atok):
        w0 = requests.get(f"{API}/customer/wallet", headers=H(ctok)).json()["balance"]
        requests.delete(f"{API}/customer/cart", headers=H(ctok))
        requests.post(f"{API}/customer/cart/items", headers=H(ctok), json={"service_id": "serv_elec_01", "qty": 1})
        r = requests.post(f"{API}/customer/bookings", headers=H(ctok), json={"address_id": "addr_demo_home", "payment_method": "upi"})
        assert r.status_code == 200, r.text
        b = r.json()
        bid = b["id"]
        assert b["status"] == "pending" and b["start_otp"] and b["payment_status"] == "paid"
        # partner online & poll
        assert requests.post(f"{API}/partner/status", headers=H(ptok), json={"is_online": True}).status_code == 200
        offer = None
        for _ in range(6):
            offer = requests.get(f"{API}/partner/offer", headers=H(ptok)).json()["offer"]
            if offer and offer["booking_id"] == bid:
                break
            if offer:  # some other offer - decline? accept only ours
                break
            time.sleep(1)
        assert offer and offer["booking_id"] == bid, offer
        assert offer["est_earning"] > 0
        assert requests.post(f"{API}/partner/offers/{bid}/accept", headers=H(ptok)).status_code == 200
        cb = requests.get(f"{API}/customer/bookings/{bid}", headers=H(ctok)).json()
        assert cb["status"] == "assigned" and cb["partner"]["name"]
        pj = requests.get(f"{API}/partner/jobs/{bid}", headers=H(ptok)).json()
        assert "start_otp" not in pj and "end_otp" not in pj
        assert requests.post(f"{API}/partner/jobs/{bid}/navigate", headers=H(ptok)).status_code == 200
        assert requests.post(f"{API}/partner/jobs/{bid}/start", headers=H(ptok), json={"otp": cb["start_otp"]}).status_code == 400
        assert requests.post(f"{API}/partner/jobs/{bid}/arrived", headers=H(ptok)).status_code == 200
        assert requests.post(f"{API}/partner/jobs/{bid}/start", headers=H(ptok), json={"otp": "0000"}).status_code == 400
        assert requests.post(f"{API}/partner/jobs/{bid}/start", headers=H(ptok), json={"otp": cb["start_otp"]}).status_code == 200
        ex = requests.post(f"{API}/partner/jobs/{bid}/extras", headers=H(ptok), json={"name": "TEST_capacitor", "amount": 350}).json()
        r = requests.post(f"{API}/partner/jobs/{bid}/complete", headers=H(ptok), json={"otp": cb["end_otp"]})
        assert r.status_code == 400 and "approval" in r.json()["detail"]
        r = requests.post(f"{API}/customer/bookings/{bid}/extras/{ex['id']}", headers=H(ctok), params={"approve": "true"})
        assert r.status_code == 200 and r.json()["pricing"]["extras_total"] == 350
        r = requests.post(f"{API}/partner/jobs/{bid}/complete", headers=H(ptok), json={"otp": cb["end_otp"]})
        assert r.status_code == 200, r.text
        assert r.json()["invoice_no"].startswith("GST/")
        inv = requests.get(f"{API}/bookings/{bid}/invoice", headers=H(ctok)).json()
        assert inv["pricing"]["extras_total"] == 350 and inv["extras"][0]["name"] == "TEST_capacitor"
        assert requests.post(f"{API}/customer/bookings/{bid}/rate", headers=H(ctok), json={"rating": 5, "tip": 20}).status_code == 200
        assert requests.post(f"{API}/customer/bookings/{bid}/rate", headers=H(ctok), json={"rating": 5}).status_code == 400
        w1 = requests.get(f"{API}/customer/wallet", headers=H(ctok)).json()["balance"]
        assert w1 > w0  # cashback credited
        TestLifecycle.state["bid"] = bid

    def test_rebook(self, ctok):
        bid = TestLifecycle.state.get("bid")
        if not bid:
            pytest.skip("no booking")
        r = requests.post(f"{API}/customer/bookings/{bid}/rebook", headers=H(ctok))
        assert r.status_code == 200 and r.json()["count"] >= 1
        requests.delete(f"{API}/customer/cart", headers=H(ctok))


# ---------- Cancellation fee policy ----------
class TestCancel:
    def _book(self, ctok, method="upi"):
        requests.delete(f"{API}/customer/cart", headers=H(ctok))
        requests.post(f"{API}/customer/cart/items", headers=H(ctok), json={"service_id": "serv_pest_01", "qty": 1})
        r = requests.post(f"{API}/customer/bookings", headers=H(ctok), json={"address_id": "addr_demo_home", "payment_method": method})
        assert r.status_code == 200, r.text
        return r.json()

    def test_pending_free(self, ctok):
        b = self._book(ctok)
        r = requests.post(f"{API}/customer/bookings/{b['id']}/cancel", headers=H(ctok)).json()
        assert r["fee"] == 0 and r["refund"] == b["pricing"]["total"]

    def test_assigned_49_via_admin(self, ctok, atok):
        b = self._book(ctok)
        assert requests.post(f"{API}/admin/bookings/{b['id']}/reassign", headers=H(atok), json={"partner_id": "usr_p3"}).status_code == 200
        r = requests.post(f"{API}/customer/bookings/{b['id']}/cancel", headers=H(ctok)).json()
        assert r["fee"] == 49 and r["refund"] == round(b["pricing"]["total"] - 49, 2)

    def test_admin_cancel_full_refund(self, ctok, atok):
        b = self._book(ctok)
        r = requests.post(f"{API}/admin/bookings/{b['id']}/cancel", headers=H(atok)).json()
        assert r["refund"] == b["pricing"]["total"]

    def test_wallet_insufficient(self, ctok):
        requests.delete(f"{API}/customer/cart", headers=H(ctok))
        requests.post(f"{API}/customer/cart/items", headers=H(ctok), json={"service_id": "serv_paint_01", "qty": 99})  # large qty so total always exceeds accumulated demo wallet
        r = requests.post(f"{API}/customer/bookings", headers=H(ctok), json={"address_id": "addr_demo_home", "payment_method": "wallet"})
        assert r.status_code == 400
        requests.delete(f"{API}/customer/cart", headers=H(ctok))


# ---------- Partner misc ----------
class TestPartner:
    def test_dashboard(self, ptok):
        d = requests.get(f"{API}/partner/dashboard", headers=H(ptok)).json()
        assert d["cod"]["limit"] == 3000 and any(a["type"] == "dl" for a in d["doc_alerts"])

    def test_earnings(self, ptok):
        d = requests.get(f"{API}/partner/earnings", headers=H(ptok)).json()
        assert len(d["daily"]) == 7 and "wallet_balance" in d

    def test_new_partner_cannot_go_online(self):
        t = otp_login(NEW_PARTNER, "partner")
        r = requests.post(f"{API}/partner/status", headers=H(t), json={"is_online": True})
        assert r.status_code == 400

    def test_withdraw_over_balance(self, ptok):
        assert requests.post(f"{API}/partner/withdraw", headers=H(ptok), json={"amount": 9999999}).status_code == 400

    def test_go_offline(self, ptok):
        r = requests.post(f"{API}/partner/status", headers=H(ptok), json={"is_online": False})
        assert r.json()["is_online"] is False


# ---------- Admin ----------
class TestAdmin:
    def test_dashboard(self, atok):
        d = requests.get(f"{API}/admin/dashboard", headers=H(atok)).json()
        assert "today_bookings" in d["kpis"] and len(d["daily"]) == 14
        types = {a["type"] for a in d["alerts"]}
        assert "consecutive_rejections" in types and "cod_limit" in types

    def test_bookings_filter_search(self, atok):
        d = requests.get(f"{API}/admin/bookings", headers=H(atok), params={"q": CUST_PHONE}).json()
        assert d["bookings"] and all(b["customer_id"] == "usr_demo_customer" for b in d["bookings"])
        assert "start_otp" not in d["bookings"][0]

    def test_city_crud(self, atok):
        r = requests.post(f"{API}/admin/cities", headers=H(atok), json={"city_name": "TEST_City", "state": "UP",
                          "pincodes": ["999001", "bad"], "polygon": [[26.0, 80.0], [26.1, 80.1], [26.0, 80.2]]})
        assert r.status_code == 200
        c = r.json()
        assert c["pincodes"] == ["999001"]
        r = requests.post(f"{API}/admin/cities/{c['id']}/pincodes/bulk", headers=H(atok), json={"csv_text": "pincode\n999002\n999003"})
        assert r.json()["added"] == 2
        assert requests.delete(f"{API}/admin/cities/{c['id']}", headers=H(atok)).status_code == 200
        assert not any(x["id"] == c["id"] for x in requests.get(f"{API}/admin/cities", headers=H(atok)).json())

    def test_surge_crud(self, atok):
        assert requests.post(f"{API}/admin/surge-rules", headers=H(atok), json={"name": "TEST_s", "trigger": "weather", "multiplier": 3.5}).status_code == 400
        r = requests.post(f"{API}/admin/surge-rules", headers=H(atok), json={"name": "TEST_s", "trigger": "weather", "multiplier": 1.1, "is_active": False})
        sid = r.json()["id"]
        requests.delete(f"{API}/admin/surge-rules/{sid}", headers=H(atok))

    def test_coupon_crud_duplicate(self, atok):
        body = {"code": "TESTCPN1", "value": 10}
        r = requests.post(f"{API}/admin/coupons", headers=H(atok), json=body)
        assert r.status_code == 200
        assert requests.post(f"{API}/admin/coupons", headers=H(atok), json=body).status_code == 400
        requests.delete(f"{API}/admin/coupons/{r.json()['id']}", headers=H(atok))

    def test_commission_bounds(self, atok):
        cur = requests.get(f"{API}/admin/commission", headers=H(atok)).json()
        assert requests.put(f"{API}/admin/commission", headers=H(atok), json={"default_rate": 0.25}).status_code == 400
        r = requests.put(f"{API}/admin/commission", headers=H(atok), json={"default_rate": cur["default_rate"], "category_rates": cur.get("category_rates", {})})
        assert r.status_code == 200

    def test_kyc_flow_new_partner(self, atok):
        t = otp_login(NEW_PARTNER, "partner")
        for d in ["aadhaar", "pan", "dl", "police"]:
            body = {"type": d, "number": "TEST123", "expiry_date": "2030-01-01" if d in ("dl", "police") else None}
            assert requests.post(f"{API}/partner/documents", headers=H(t), json=body).status_code == 200
        q = requests.get(f"{API}/admin/kyc", headers=H(atok)).json()
        p = next(x for x in q if x["phone"] == NEW_PARTNER)
        st = None
        for d in ["aadhaar", "pan", "dl", "police"]:
            st = requests.post(f"{API}/admin/kyc/{p['id']}/{d}", headers=H(atok), json={"action": "approve"}).json()["kyc_status"]
        assert st == "approved"
        assert requests.post(f"{API}/partner/status", headers=H(t), json={"is_online": True}).status_code == 200
        requests.post(f"{API}/partner/status", headers=H(t), json={"is_online": False})

    def test_sos_flow(self, ptok, atok):
        s = requests.post(f"{API}/partner/sos", headers=H(ptok), json={}).json()
        assert any(x["id"] == s["id"] for x in requests.get(f"{API}/admin/sos", headers=H(atok)).json())
        requests.post(f"{API}/admin/sos/{s['id']}/resolve", headers=H(atok))

    def test_invoices(self, atok):
        assert isinstance(requests.get(f"{API}/admin/invoices", headers=H(atok)).json(), list)
