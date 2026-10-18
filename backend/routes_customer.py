import random
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from core import db, NOID, iso, now, new_id, r2, haversine_km, require_role, get_current_user
from logic import (build_quote, city_for_pincode, enrich_booking, wallet_txn, push_timeline, assert_booking,
                   finalize, refresh_partner_rating, CANCEL_FEES, CANCELLATION_POLICY, GST_RATE)

from routes_payments import create_order, enabled as payments_enabled

router = APIRouter(prefix="/api", tags=["customer"])
customer = require_role("customer")


class AddressIn(BaseModel):
    label: str = "Home"
    line: str
    pincode: str
    city: Optional[str] = None
    landmark: Optional[str] = None
    location: Optional[dict] = None
    audio_note: Optional[str] = None
    is_default: bool = False


class CartItem(BaseModel):
    service_id: str
    qty: int = 1
    addon_ids: List[str] = []


class QuoteIn(BaseModel):
    address_id: Optional[str] = None
    coupon_code: Optional[str] = None


class BookingIn(BaseModel):
    address_id: str
    mode: str = "instant"
    slot_date: Optional[str] = None
    slot_time: Optional[str] = None
    payment_method: str
    coupon_code: Optional[str] = None


class RateIn(BaseModel):
    rating: int
    review: Optional[str] = None
    tip: float = 0


class TextIn(BaseModel):
    text: str


class TicketIn(BaseModel):
    subject: str
    message: str
    booking_id: Optional[str] = None


# ---------- public catalog ----------
@router.get("/catalog/home")
async def catalog_home():
    cats = await db.categories.find({}, NOID).sort("order", 1).to_list(50)
    banners = await db.banners.find({}, NOID).to_list(20)
    trending = await db.services.find({"trending": True}, {"_id": 0, "reviews": 0}).to_list(20)
    return {"categories": cats, "banners": banners, "trending": trending}


@router.get("/catalog/services")
async def list_services(category_id: Optional[str] = None, q: Optional[str] = None):
    f = {}
    if category_id:
        f["category_id"] = category_id
    if q:
        f["name"] = {"$regex": q, "$options": "i"}
    return await db.services.find(f, {"_id": 0, "reviews": 0}).to_list(200)


@router.get("/catalog/services/{sid}")
async def get_service(sid: str, pincode: Optional[str] = None):
    s = await db.services.find_one({"id": sid}, NOID)
    if not s:
        raise HTTPException(404, "Service not found")
    city = await city_for_pincode(pincode)
    if city:
        cp = next((a["city_price"] for a in city.get("assigned_services", []) if a["service_id"] == sid), None)
        if cp:
            s["city_price"] = cp
    return s


@router.get("/locate")
async def locate(lat: float, lng: float):
    cities = await db.cities.find({"is_active": True}, NOID).to_list(100)
    best = min(cities, key=lambda c: haversine_km({"lat": lat, "lng": lng}, c["center"]), default=None)
    if not best:
        return {"serviceable": False}
    dist = haversine_km({"lat": lat, "lng": lng}, best["center"])
    return {"serviceable": dist <= 60, "city": best["city_name"], "city_id": best["id"],
            "pincode": best["pincodes"][0] if best["pincodes"] else None, "pincodes": best["pincodes"], "distance_km": dist}


@router.get("/serviceability/{pincode}")
async def serviceability(pincode: str):
    c = await city_for_pincode(pincode)
    return {"serviceable": bool(c), "city": c["city_name"] if c else None, "city_id": c["id"] if c else None}


@router.get("/policy/cancellation")
async def policy():
    return {"rules": CANCELLATION_POLICY, "fees": CANCEL_FEES}


# ---------- addresses ----------
@router.get("/customer/addresses")
async def addresses(user=Depends(customer)):
    return await db.addresses.find({"user_id": user["id"]}, NOID).sort("created_at", 1).to_list(50)


@router.post("/customer/addresses")
async def add_address(body: AddressIn, user=Depends(customer)):
    c = await city_for_pincode(body.pincode)
    doc = {"id": new_id("addr_"), "user_id": user["id"], **body.model_dump(), "created_at": iso()}
    doc["city"] = body.city or (c["city_name"] if c else "")
    if not doc["location"] and c:
        doc["location"] = {"lat": c["center"]["lat"] + random.uniform(-0.01, 0.01), "lng": c["center"]["lng"] + random.uniform(-0.01, 0.01)}
    if body.is_default or await db.addresses.count_documents({"user_id": user["id"]}) == 0:
        await db.addresses.update_many({"user_id": user["id"]}, {"$set": {"is_default": False}})
        doc["is_default"] = True
    await db.addresses.insert_one(dict(doc))
    doc.pop("_id", None)
    return {**doc, "serviceable": bool(c)}


@router.put("/customer/addresses/{aid}")
async def update_address(aid: str, body: AddressIn, user=Depends(customer)):
    upd = body.model_dump()
    if body.is_default:
        await db.addresses.update_many({"user_id": user["id"]}, {"$set": {"is_default": False}})
    if not upd["location"]:
        upd.pop("location")
    res = await db.addresses.update_one({"id": aid, "user_id": user["id"]}, {"$set": upd})
    if not res.matched_count:
        raise HTTPException(404, "Address not found")
    return await db.addresses.find_one({"id": aid}, NOID)


@router.delete("/customer/addresses/{aid}")
async def delete_address(aid: str, user=Depends(customer)):
    await db.addresses.delete_one({"id": aid, "user_id": user["id"]})
    return {"ok": True}


# ---------- cart ----------
async def get_cart_items(uid):
    c = await db.carts.find_one({"user_id": uid}, NOID)
    return (c or {}).get("items", [])


async def save_cart(uid, items):
    await db.carts.update_one({"user_id": uid}, {"$set": {"items": items, "updated_at": iso()}}, upsert=True)


async def default_pincode(uid, address_id=None):
    q = {"user_id": uid, "id": address_id} if address_id else {"user_id": uid, "is_default": True}
    a = await db.addresses.find_one(q, NOID)
    return a


@router.get("/customer/cart")
async def get_cart(address_id: Optional[str] = None, coupon_code: Optional[str] = None, user=Depends(customer)):
    items = await get_cart_items(user["id"])
    addr = await default_pincode(user["id"], address_id)
    quote = await build_quote(user["id"], items, addr["pincode"] if addr else None, coupon_code)
    quote.pop("city", None)
    return {"items": items, "address": addr, **quote}


@router.post("/customer/cart/items")
async def add_cart(body: CartItem, user=Depends(customer)):
    if not await db.services.find_one({"id": body.service_id}):
        raise HTTPException(404, "Service not found")
    items = await get_cart_items(user["id"])
    ex = next((i for i in items if i["service_id"] == body.service_id), None)
    if ex:
        ex["qty"] += max(1, body.qty)
        if body.addon_ids:
            ex["addon_ids"] = body.addon_ids
    else:
        items.append(body.model_dump())
    await save_cart(user["id"], items)
    return {"items": items, "count": sum(i["qty"] for i in items)}


@router.put("/customer/cart/items/{sid}")
async def set_cart(sid: str, body: CartItem, user=Depends(customer)):
    items = [i for i in await get_cart_items(user["id"]) if i["service_id"] != sid]
    if body.qty > 0:
        items.append({"service_id": sid, "qty": body.qty, "addon_ids": body.addon_ids})
    await save_cart(user["id"], items)
    return {"items": items, "count": sum(i["qty"] for i in items)}


@router.delete("/customer/cart")
async def clear_cart(user=Depends(customer)):
    await save_cart(user["id"], [])
    return {"items": []}


@router.get("/customer/coupons")
async def coupons(user=Depends(customer)):
    return await db.coupons.find({"is_active": True}, {"_id": 0, "used_count": 0}).to_list(50)


# ---------- bookings ----------
@router.post("/customer/bookings")
async def create_booking(body: BookingIn, user=Depends(customer)):
    if body.payment_method not in ("upi", "card", "wallet", "cod"):
        raise HTTPException(400, "Invalid payment method")
    items = await get_cart_items(user["id"])
    if not items:
        raise HTTPException(400, "Cart is empty")
    addr = await default_pincode(user["id"], body.address_id)
    if not addr:
        raise HTTPException(400, "Select a valid address")
    q = await build_quote(user["id"], items, addr["pincode"], body.coupon_code)
    if not q["serviceable"]:
        raise HTTPException(400, f"Sorry, we don't serve pincode {addr['pincode']} yet")
    if body.coupon_code and q["coupon_error"]:
        raise HTTPException(400, q["coupon_error"])
    if body.mode == "scheduled" and not (body.slot_date and body.slot_time):
        raise HTTPException(400, "Pick a date and time slot")
    p = q["pricing"]
    if body.payment_method == "wallet":
        fresh = await db.users.find_one({"id": user["id"]}, {"_id": 0, "wallet_balance": 1})
        if fresh.get("wallet_balance", 0) < p["total"]:
            raise HTTPException(400, "Insufficient wallet balance")
    city = q["city"]
    bid = new_id("bk_")
    created = iso()
    online = body.payment_method in ("upi", "card") and payments_enabled()
    b = {"id": bid, "booking_no": f"HS{random.randint(100000, 999999)}", "customer_id": user["id"], "partner_id": None,
         "lines": q["lines"], "category_ids": list({l["category_id"] for l in q["lines"]}),
         "address": {k: addr.get(k) for k in ("id", "label", "line", "pincode", "city", "location", "landmark", "audio_note")},
         "city_id": city["id"], "city_name": city["city_name"], "mode": body.mode,
         "slot_date": body.slot_date if body.mode == "scheduled" else created[:10],
         "slot_time": body.slot_time if body.mode == "scheduled" else "ASAP (30-45 min)",
         "pricing": p, "surge_reasons": q["surge_reasons"], "payment_method": body.payment_method,
         "payment_status": "awaiting_payment" if online else ("pending" if body.payment_method == "cod" else "paid"),
         "amount_paid": 0 if online or body.payment_method == "cod" else p["total"],
         "status": "payment_pending" if online else "pending",
         "payment_mode": "razorpay" if online else ("demo" if body.payment_method in ("upi", "card") else body.payment_method),
         "start_otp": f"{random.randint(1000, 9999)}", "end_otp": f"{random.randint(1000, 9999)}", "extras": [],
         "timeline": [{"status": "payment_pending" if online else "pending", "at": created}], "rating": None, "review": None, "tip": 0,
         "commission_rate": None, "commission": None, "partner_earning": None, "invoice_no": None, "offered_to": None,
         "offer_expires_at": None, "rejected_by": [], "settlement_id": None, "created_at": created, "completed_at": None,
         "partner_origin": None, "en_route_at": None, "arrived_at": None}
    await db.bookings.insert_one(dict(b))
    if online:
        order = await create_order(user, p["total"], "booking", bid, b["booking_no"])
        return {**await enrich_booking(b, "customer"), "razorpay": order}
    if body.payment_method == "wallet":
        await wallet_txn(user["id"], -p["total"], f"Payment for booking {b['booking_no']}", bid)
    if p.get("coupon_code"):
        await db.coupons.update_one({"code": p["coupon_code"]}, {"$inc": {"used_count": 1}})
    await save_cart(user["id"], [])
    return await enrich_booking(b, "customer")


@router.get("/customer/bookings")
async def my_bookings(user=Depends(customer)):
    bs = await db.bookings.find({"customer_id": user["id"]}, NOID).sort("created_at", -1).to_list(200)
    return bs


@router.get("/customer/bookings/{bid}")
async def my_booking(bid: str, user=Depends(customer)):
    return await enrich_booking(await assert_booking(bid, user, "customer_id"), "customer")


@router.post("/customer/bookings/{bid}/cancel")
async def cancel_booking(bid: str, user=Depends(customer)):
    b = await assert_booking(bid, user, "customer_id")
    if b["status"] not in CANCEL_FEES:
        raise HTTPException(400, "This booking can no longer be cancelled")
    fee = CANCEL_FEES[b["status"]]
    refund = 0
    if b["payment_status"] == "paid":
        refund = r2(max(0, b["amount_paid"] - fee))
        if refund:
            await wallet_txn(user["id"], refund, f"Refund for cancelled booking {b['booking_no']}", bid)
    elif fee:
        bal = (await db.users.find_one({"id": user["id"]}, {"_id": 0, "wallet_balance": 1})).get("wallet_balance", 0)
        if bal > 0:
            await wallet_txn(user["id"], -min(bal, fee), f"Cancellation fee {b['booking_no']}", bid)
    if b["pricing"].get("coupon_code"):
        await db.coupons.update_one({"code": b["pricing"]["coupon_code"], "used_count": {"$gt": 0}}, {"$inc": {"used_count": -1}})
    await push_timeline(bid, "cancelled", {"status": "cancelled", "offered_to": None,
                                            "cancellation": {"fee": fee, "refund": refund, "by": "customer", "at": iso()},
                                            "payment_status": "refunded" if refund else b["payment_status"]})
    return {"ok": True, "fee": fee, "refund": refund}


@router.post("/customer/bookings/{bid}/extras/{eid}")
async def respond_extra(bid: str, eid: str, approve: bool, user=Depends(customer)):
    b = await assert_booking(bid, user, "customer_id")
    ex = next((e for e in b["extras"] if e["id"] == eid and e["status"] == "pending"), None)
    if not ex:
        raise HTTPException(404, "No pending request")
    ex["status"] = "approved" if approve else "rejected"
    ex["responded_at"] = iso()
    p = b["pricing"]
    p["extras_total"] = r2(sum(e["amount"] for e in b["extras"] if e["status"] == "approved"))
    finalize(p)
    await db.bookings.update_one({"id": bid}, {"$set": {"extras": b["extras"], "pricing": p}})
    return {"ok": True, "pricing": p}


@router.post("/customer/bookings/{bid}/rate")
async def rate(bid: str, body: RateIn, user=Depends(customer)):
    b = await assert_booking(bid, user, "customer_id")
    if b["status"] != "completed":
        raise HTTPException(400, "You can rate only completed jobs")
    if b.get("rating"):
        raise HTTPException(400, "Already rated")
    if not 1 <= body.rating <= 5 or body.tip < 0:
        raise HTTPException(400, "Invalid rating or tip")
    await db.bookings.update_one({"id": bid}, {"$set": {"rating": body.rating, "review": body.review, "tip": r2(body.tip),
                                                       "rated_at": iso()}})
    if body.tip and b.get("partner_id"):
        await db.users.update_one({"id": b["partner_id"]}, {"$inc": {"pending_earnings": r2(body.tip)}})
    if b.get("partner_id"):
        await refresh_partner_rating(b["partner_id"])
    return {"ok": True}


@router.post("/customer/bookings/{bid}/rebook")
async def rebook(bid: str, user=Depends(customer)):
    b = await assert_booking(bid, user, "customer_id")
    items = await get_cart_items(user["id"])
    for l in b["lines"]:
        ex = next((i for i in items if i["service_id"] == l["service_id"]), None)
        if ex:
            ex["qty"] += l["qty"]
        else:
            items.append({"service_id": l["service_id"], "qty": l["qty"], "addon_ids": [a["id"] for a in l.get("addons", [])]})
    await save_cart(user["id"], items)
    return {"items": items, "count": sum(i["qty"] for i in items)}


# ---------- shared booking utilities ----------
async def booking_for_any(bid, user):
    b = await db.bookings.find_one({"id": bid}, NOID)
    if not b or (user["role"] == "customer" and b["customer_id"] != user["id"]) or \
            (user["role"] == "partner" and b.get("partner_id") != user["id"]):
        raise HTTPException(404, "Booking not found")
    return b


@router.get("/bookings/{bid}/invoice")
async def invoice(bid: str, user=Depends(get_current_user)):
    b = await booking_for_any(bid, user)
    if not b.get("invoice_no"):
        raise HTTPException(400, "Invoice is generated after job completion")
    cust = await db.users.find_one({"id": b["customer_id"]}, {"_id": 0, "name": 1, "phone": 1, "email": 1})
    city = await db.cities.find_one({"id": b["city_id"]}, {"_id": 0, "state": 1})
    return {"invoice_no": b["invoice_no"], "date": b.get("completed_at"), "booking_no": b["booking_no"],
            "seller": {"name": "HomeServe Technologies Pvt. Ltd.", "gstin": "[GSTIN placeholder]",
                       "address": "[Registered office address placeholder]"},
            "buyer": {**(cust or {}), "address": b["address"]["line"], "pincode": b["address"]["pincode"]},
            "place_of_supply": (city or {}).get("state", ""), "sac": "998533", "gst_rate": GST_RATE,
            "lines": b["lines"], "extras": [e for e in b["extras"] if e["status"] == "approved"],
            "pricing": b["pricing"], "tip": b.get("tip", 0), "payment_method": b["payment_method"]}


@router.get("/bookings/{bid}/messages")
async def messages(bid: str, user=Depends(get_current_user)):
    await booking_for_any(bid, user)
    return await db.messages.find({"booking_id": bid}, NOID).sort("created_at", 1).to_list(500)


@router.post("/bookings/{bid}/messages")
async def send_message(bid: str, body: TextIn, user=Depends(get_current_user)):
    await booking_for_any(bid, user)
    if not body.text.strip():
        raise HTTPException(400, "Empty message")
    m = {"id": new_id("msg_"), "booking_id": bid, "sender_role": user["role"], "sender_name": user.get("name") or user["role"],
         "text": body.text.strip()[:1000], "created_at": iso()}
    await db.messages.insert_one(dict(m))
    return m


@router.post("/bookings/{bid}/call")
async def masked_call(bid: str, user=Depends(get_current_user)):
    await booking_for_any(bid, user)
    return {"masked_number": "+91 80 4718 2290", "pin": bid[-4:].upper(),
            "note": "Demo: calls are bridged via a virtual number so real numbers stay private."}


# ---------- wallet ----------
@router.get("/customer/wallet")
async def wallet(user=Depends(customer)):
    u = await db.users.find_one({"id": user["id"]}, {"_id": 0, "wallet_balance": 1})
    txns = await db.wallet_txns.find({"user_id": user["id"]}, NOID).sort("created_at", -1).to_list(100)
    return {"balance": u.get("wallet_balance", 0), "transactions": txns}


@router.post("/customer/bookings/{bid}/pay-balance")
async def pay_balance(bid: str, user=Depends(customer)):
    b = await assert_booking(bid, user, "customer_id")
    due = r2(b["pricing"]["total"] - (b.get("amount_paid") or 0))
    if b.get("payment_status") != "balance_due" or due <= 0:
        raise HTTPException(400, "No balance due on this booking")
    return {"razorpay": await create_order(user, due, "balance", bid, f"{b['booking_no']}-bal")}


@router.post("/customer/wallet/topup")
async def topup(amount: float, user=Depends(customer)):
    if not 1 <= amount <= 10000:
        raise HTTPException(400, "Amount must be between ₹1 and ₹10,000")
    if payments_enabled():
        return {"razorpay": await create_order(user, amount, "wallet", None, "wallet-topup")}
    await wallet_txn(user["id"], amount, "Wallet top-up (demo UPI)")
    return {"ok": True}


# ---------- support ----------
BOT = [
    (("refund", "money back"), "Refunds for cancelled prepaid bookings are credited instantly to your in-app wallet."),
    (("cancel",), "You can cancel from the booking screen. It's free until a partner is assigned; ₹49 after assignment, ₹99 once en route."),
    (("invoice", "gst", "bill"), "Your GST invoice is generated automatically when the job completes. Open the booking and tap 'Invoice'."),
    (("late", "delay", "where"), "Open the live tracking screen to see your partner's location and ETA. You can also call or chat with them."),
    (("coupon", "promo", "offer"), "Try FIRST50 for 50% off (up to ₹100) on your first booking, or SAVE100 on orders above ₹999."),
    (("wallet", "cashback"), "Your wallet holds refunds, cashbacks and promo rewards. You can pay with it at checkout."),
]


@router.post("/support/chatbot")
async def chatbot(body: TextIn, user=Depends(get_current_user)):
    t = body.text.lower()
    for keys, reply in BOT:
        if any(k in t for k in keys):
            return {"reply": reply, "suggest_ticket": False}
    return {"reply": "I couldn't find an instant answer. Would you like to raise a support ticket? Our team replies within 2 hours.",
            "suggest_ticket": True}


@router.get("/support/tickets")
async def tickets(user=Depends(get_current_user)):
    f = {} if user["role"] == "admin" else {"user_id": user["id"]}
    return await db.tickets.find(f, NOID).sort("created_at", -1).to_list(200)


@router.post("/support/tickets")
async def create_ticket(body: TicketIn, user=Depends(get_current_user)):
    t = {"id": new_id("tkt_"), "ticket_no": f"TKT{random.randint(10000, 99999)}", "user_id": user["id"], "user_role": user["role"],
         "user_name": user.get("name"), "subject": body.subject, "booking_id": body.booking_id, "status": "open",
         "messages": [{"from": user["role"], "text": body.message, "at": iso()}], "created_at": iso()}
    await db.tickets.insert_one(dict(t))
    return t


@router.post("/support/tickets/{tid}/messages")
async def ticket_reply(tid: str, body: TextIn, user=Depends(get_current_user)):
    f = {"id": tid} if user["role"] == "admin" else {"id": tid, "user_id": user["id"]}
    res = await db.tickets.update_one(f, {"$push": {"messages": {"from": user["role"], "text": body.text, "at": iso()}}})
    if not res.matched_count:
        raise HTTPException(404, "Ticket not found")
    return await db.tickets.find_one({"id": tid}, NOID)
