import os
import asyncio
from typing import Optional
import razorpay
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from core import db, NOID, iso, new_id, r2, require_role
from logic import wallet_txn, push_timeline

router = APIRouter(prefix="/api/payments", tags=["payments"])
customer = require_role("customer")


class VerifyIn(BaseModel):
    razorpay_order_id: str
    razorpay_payment_id: str
    razorpay_signature: str


class CancelIn(BaseModel):
    order_id: str
    reason: Optional[str] = None


def enabled():
    return bool(os.environ.get("RAZORPAY_KEY_ID") and os.environ.get("RAZORPAY_KEY_SECRET"))


def client():
    if not enabled():
        raise HTTPException(503, "Online payments are not configured")
    return razorpay.Client(auth=(os.environ["RAZORPAY_KEY_ID"], os.environ["RAZORPAY_KEY_SECRET"]))


async def create_order(user, amount, purpose, booking_id=None, receipt=""):
    paise = int(round(float(amount) * 100))
    if paise < 100:
        raise HTTPException(400, "Minimum online payment is ₹1")
    try:
        o = await asyncio.to_thread(client().order.create, {
            "amount": paise, "currency": "INR", "receipt": (receipt or purpose)[:40], "payment_capture": 1,
            "notes": {"purpose": purpose, "booking_id": booking_id or "", "user_id": user["id"]}})
    except Exception as e:
        raise HTTPException(502, f"Razorpay error: {e}")
    await db.payments.insert_one({"id": new_id("pay_"), "order_id": o["id"], "purpose": purpose, "booking_id": booking_id,
                                  "user_id": user["id"], "amount": r2(amount), "status": "created", "created_at": iso()})
    return {"order_id": o["id"], "amount": o["amount"], "currency": "INR", "key_id": os.environ["RAZORPAY_KEY_ID"],
            "purpose": purpose, "booking_id": booking_id}


async def fulfil(order_id, payment_id):
    pay = await db.payments.find_one_and_update({"order_id": order_id, "status": {"$in": ["created", "failed", "signature_failed"]}},
                                                {"$set": {"status": "paid", "payment_id": payment_id, "paid_at": iso()}},
                                                projection=NOID)
    if not pay:
        return await db.payments.find_one({"order_id": order_id}, NOID)
    if pay["purpose"] == "wallet":
        await wallet_txn(pay["user_id"], pay["amount"], "Wallet top-up (Razorpay)")
    elif pay["purpose"] == "booking":
        b = await db.bookings.find_one({"id": pay["booking_id"]}, NOID)
        if b["status"] != "payment_pending":
            await wallet_txn(pay["user_id"], pay["amount"], f"Refund: payment received after cancelling {b['booking_no']}", b["id"])
            return {**pay, "status": "paid"}
        await push_timeline(b["id"], "pending", {"status": "pending", "payment_status": "paid", "amount_paid": b["pricing"]["total"],
                                                 "razorpay_payment_id": payment_id})
        if b["pricing"].get("coupon_code"):
            await db.coupons.update_one({"code": b["pricing"]["coupon_code"]}, {"$inc": {"used_count": 1}})
        await db.carts.update_one({"user_id": pay["user_id"]}, {"$set": {"items": [], "updated_at": iso()}})
    elif pay["purpose"] == "balance":
        b = await db.bookings.find_one({"id": pay["booking_id"]}, NOID)
        await db.bookings.update_one({"id": b["id"]}, {"$set": {"payment_status": "paid", "amount_paid": b["pricing"]["total"],
                                                                "balance_collected": pay["amount"]}})
    return {**pay, "status": "paid"}


@router.get("/config")
async def config():
    return {"enabled": enabled(), "key_id": os.environ.get("RAZORPAY_KEY_ID") if enabled() else None}


@router.post("/verify")
async def verify(body: VerifyIn, user=Depends(customer)):
    pay = await db.payments.find_one({"order_id": body.razorpay_order_id, "user_id": user["id"]}, NOID)
    if not pay:
        raise HTTPException(404, "Payment order not found")
    try:
        client().utility.verify_payment_signature(body.model_dump())
    except razorpay.errors.SignatureVerificationError:
        await db.payments.update_one({"order_id": body.razorpay_order_id}, {"$set": {"status": "signature_failed"}})
        raise HTTPException(400, "Payment verification failed")
    res = await fulfil(body.razorpay_order_id, body.razorpay_payment_id)
    return {"ok": True, "purpose": res["purpose"], "booking_id": res.get("booking_id")}


@router.post("/cancel")
async def cancel(body: CancelIn, user=Depends(customer)):
    pay = await db.payments.find_one_and_update({"order_id": body.order_id, "user_id": user["id"], "status": "created"},
                                                {"$set": {"status": "failed", "failure_reason": body.reason}}, projection=NOID)
    if pay and pay["purpose"] == "booking":
        await push_timeline(pay["booking_id"], "cancelled", {"status": "cancelled", "payment_status": "failed",
                                                             "cancellation": {"fee": 0, "refund": 0, "by": "payment_failed", "at": iso()}})
    return {"ok": True}


@router.post("/razorpay/webhook")
async def webhook(request: Request):
    secret = os.environ.get("RAZORPAY_WEBHOOK_SECRET")
    if not secret:
        raise HTTPException(503, "Webhook secret not configured")
    raw = (await request.body()).decode()
    try:
        client().utility.verify_webhook_signature(raw, request.headers.get("X-Razorpay-Signature", ""), secret)
    except razorpay.errors.SignatureVerificationError:
        raise HTTPException(400, "Invalid signature")
    evt = await request.json()
    if evt.get("event") in ("payment.captured", "order.paid"):
        ent = evt["payload"]["payment"]["entity"]
        await fulfil(ent["order_id"], ent["id"])
    return {"ok": True}
