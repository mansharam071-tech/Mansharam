# Razorpay payments (demo fallback when keys empty) + new payment endpoints + user language persistence
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"
OTP = "1234"


def login(phone, role):
    r = requests.post(f"{API}/auth/otp/verify", json={"phone": phone, "otp": OTP, "role": role})
    assert r.status_code == 200, r.text
    return r.json()["token"]


def H(t):
    return {"Authorization": f"Bearer {t}"}


@pytest.fixture(scope="module")
def ctok():
    return login("9999999999", "customer")


@pytest.fixture(scope="module")
def ptok():
    return login("9000000001", "partner")


def _book(ctok, method):
    requests.delete(f"{API}/customer/cart", headers=H(ctok))
    requests.post(f"{API}/customer/cart/items", headers=H(ctok), json={"service_id": "serv_paint_01", "qty": 1})
    r = requests.post(f"{API}/customer/bookings", headers=H(ctok), json={"address_id": "addr_demo_home", "payment_method": method})
    return r


# Payment config
class TestConfig:
    def test_config_disabled(self):
        r = requests.get(f"{API}/payments/config")
        assert r.status_code == 200
        assert r.json() == {"enabled": False, "key_id": None}


# Demo fallback for booking & wallet
class TestDemoFallback:
    created = []

    @pytest.mark.parametrize("method", ["upi", "card"])
    def test_online_booking_demo(self, ctok, method):
        r = _book(ctok, method)
        assert r.status_code == 200, r.text
        b = r.json()
        TestDemoFallback.created.append(b["id"])
        assert b["status"] == "pending"
        assert b["payment_status"] == "paid"
        assert b["payment_mode"] == "demo"
        assert "razorpay" not in b
        assert b["amount_paid"] == b["pricing"]["total"]
        g = requests.get(f"{API}/customer/bookings/{b['id']}", headers=H(ctok)).json()
        assert g["payment_mode"] == "demo" and g["status"] == "pending"
        cart = requests.get(f"{API}/customer/cart", headers=H(ctok)).json()
        assert not cart.get("lines") and not cart.get("items")

    def test_cancel_created_bookings(self, ctok):
        for bid in TestDemoFallback.created:
            r = requests.post(f"{API}/customer/bookings/{bid}/cancel", headers=H(ctok))
            assert r.status_code == 200, r.text
            assert r.json()["ok"] is True and r.json()["refund"] > 0
            g = requests.get(f"{API}/customer/bookings/{bid}", headers=H(ctok)).json()
            assert g["status"] == "cancelled" and g["payment_status"] == "refunded"

    def test_topup_demo(self, ctok):
        w0 = requests.get(f"{API}/customer/wallet", headers=H(ctok)).json()["balance"]
        r = requests.post(f"{API}/customer/wallet/topup", headers=H(ctok), params={"amount": 100})
        assert r.status_code == 200 and r.json() == {"ok": True}
        w = requests.get(f"{API}/customer/wallet", headers=H(ctok)).json()
        assert abs(w["balance"] - (w0 + 100)) < 0.01
        assert w["transactions"][0]["description"] if "description" in w["transactions"][0] else True

    def test_topup_bounds(self, ctok):
        assert requests.post(f"{API}/customer/wallet/topup", headers=H(ctok), params={"amount": 0}).status_code == 400
        assert requests.post(f"{API}/customer/wallet/topup", headers=H(ctok), params={"amount": 20000}).status_code == 400


# Payment endpoints error handling
class TestPaymentEndpoints:
    def test_verify_unknown_404(self, ctok):
        r = requests.post(f"{API}/payments/verify", headers=H(ctok),
                          json={"razorpay_order_id": "order_TEST_x", "razorpay_payment_id": "pay_x", "razorpay_signature": "sig"})
        assert r.status_code == 404

    def test_verify_requires_auth(self):
        r = requests.post(f"{API}/payments/verify",
                          json={"razorpay_order_id": "order_TEST_x", "razorpay_payment_id": "pay_x", "razorpay_signature": "sig"})
        assert r.status_code == 401

    def test_verify_validation_422(self, ctok):
        assert requests.post(f"{API}/payments/verify", headers=H(ctok), json={}).status_code == 422

    def test_cancel_unknown_ok(self, ctok):
        r = requests.post(f"{API}/payments/cancel", headers=H(ctok), json={"order_id": "order_TEST_x"})
        assert r.status_code == 200 and r.json() == {"ok": True}

    def test_pay_balance_400(self, ctok):
        bs = requests.get(f"{API}/customer/bookings", headers=H(ctok)).json()
        bs = bs if isinstance(bs, list) else bs.get("bookings", [])
        b = next(x for x in bs if x.get("payment_status") != "balance_due")
        r = requests.post(f"{API}/customer/bookings/{b['id']}/pay-balance", headers=H(ctok))
        assert r.status_code == 400 and "balance" in r.json()["detail"].lower()

    def test_pay_balance_unknown_404(self, ctok):
        assert requests.post(f"{API}/customer/bookings/bk_TEST_nope/pay-balance", headers=H(ctok)).status_code == 404

    def test_webhook_503(self):
        r = requests.post(f"{API}/payments/razorpay/webhook", json={"event": "payment.captured"})
        assert r.status_code == 503


# Language persistence via /auth/me
class TestLanguage:
    @pytest.mark.parametrize("who", ["customer", "partner"])
    def test_language_roundtrip(self, ctok, ptok, who):
        t = ctok if who == "customer" else ptok
        r = requests.put(f"{API}/auth/me", headers=H(t), json={"language": "hi"})
        assert r.status_code == 200, r.text
        assert requests.get(f"{API}/auth/me", headers=H(t)).json()["language"] == "hi"
        r = requests.put(f"{API}/auth/me", headers=H(t), json={"language": "en"})
        assert requests.get(f"{API}/auth/me", headers=H(t)).json()["language"] == "en"
