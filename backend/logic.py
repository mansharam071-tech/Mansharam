from datetime import timedelta
from fastapi import HTTPException
from core import db, NOID, now, iso, new_id, r2, haversine_km, IST

GST_RATE = 0.18
OFFER_SECONDS = 15
TRAVEL_SECONDS = 180
CANCEL_FEES = {"pending": 0, "assigned": 49, "en_route": 99}
ACTIVE_STATUSES = ["assigned", "en_route", "in_progress"]
CANCELLATION_POLICY = [
    "Free cancellation while we are finding a partner (Pending).",
    "₹49 fee once a partner is assigned.",
    "₹99 fee once the partner is en route.",
    "Cancellation not allowed after the job has started.",
    "Prepaid amounts are refunded instantly to your in-app wallet minus the fee.",
]


async def city_for_pincode(pincode):
    if not pincode:
        return None
    return await db.cities.find_one({"pincodes": pincode, "is_active": True}, NOID)


async def surge_for_city(city):
    mult, reasons = 1.0, []
    if not city:
        return mult, reasons
    sp = city.get("surge_pricing") or {}
    if sp.get("is_active"):
        mult = float(sp.get("multiplier", 1))
        reasons.append(sp.get("reason", "City surge"))
    hour = now().astimezone(IST).hour
    rules = await db.surge_rules.find({"is_active": True, "city_id": {"$in": ["all", city["id"]]}}, NOID).to_list(100)
    for r in rules:
        if r["trigger"] == "peak_hours" and not (r.get("start_hour", 0) <= hour < r.get("end_hour", 24)):
            continue
        if r["multiplier"] > mult:
            mult = float(r["multiplier"])
        reasons.append(r["name"])
    return mult, reasons


async def price_items(items, city):
    ids = [i["service_id"] for i in items]
    services = {s["id"]: s for s in await db.services.find({"id": {"$in": ids}}, NOID).to_list(200)}
    cats = {c["id"]: c["name"] for c in await db.categories.find({}, NOID).to_list(100)}
    city_prices = {a["service_id"]: a["city_price"] for a in (city or {}).get("assigned_services", [])}
    lines = []
    for it in items:
        s = services.get(it["service_id"])
        if not s:
            continue
        unit = float(city_prices.get(s["id"], s["price"]))
        addons = [a for a in s.get("addons", []) if a["id"] in (it.get("addon_ids") or [])]
        qty = max(1, int(it.get("qty", 1)))
        lines.append({
            "service_id": s["id"], "name": s["name"], "category_id": s["category_id"],
            "category_name": cats.get(s["category_id"], ""), "image": s.get("image"),
            "qty": qty, "unit_price": unit, "addons": addons,
            "line_total": r2((unit + sum(a["price"] for a in addons)) * qty),
        })
    return lines


async def evaluate_coupon(code, user_id, city, lines, amount):
    c = await db.coupons.find_one({"code": code.strip().upper(), "is_active": True}, NOID)
    if not c:
        return 0, "Invalid or inactive coupon"
    if c.get("usage_limit") and c.get("used_count", 0) >= c["usage_limit"]:
        return 0, "Coupon usage limit reached"
    if c.get("valid_till") and c["valid_till"] < iso()[:10]:
        return 0, "Coupon expired"
    if c.get("city_ids") and (not city or city["id"] not in c["city_ids"]):
        return 0, "Coupon not valid in this city"
    if c.get("category_ids") and not any(l["category_id"] in c["category_ids"] for l in lines):
        return 0, "Coupon not valid for these services"
    if amount < c.get("min_order", 0):
        return 0, f"Minimum order ₹{c['min_order']} required"
    if c.get("first_order_only"):
        n = await db.bookings.count_documents({"customer_id": user_id, "status": {"$ne": "cancelled"}})
        if n > 0:
            return 0, "Valid on first order only"
    if c["discount_type"] == "percent":
        d = amount * c["value"] / 100
        if c.get("max_discount"):
            d = min(d, c["max_discount"])
    else:
        d = c["value"]
    return r2(min(d, amount)), None


def finalize(p):
    extras = p.get("extras_total", 0)
    taxable = r2(p["subtotal"] + p["surge_amount"] - p["discount"] + extras)
    gst = r2(taxable * GST_RATE)
    p.update({"taxable": taxable, "gst": gst, "cgst": r2(gst / 2), "sgst": r2(gst / 2),
              "total": r2(taxable + gst)})
    return p


async def build_quote(user_id, items, pincode, coupon_code=None):
    city = await city_for_pincode(pincode)
    lines = await price_items(items, city)
    subtotal = r2(sum(l["line_total"] for l in lines))
    mult, reasons = await surge_for_city(city)
    surge_amount = r2(subtotal * (mult - 1))
    discount, coupon_error = 0, None
    if coupon_code:
        discount, coupon_error = await evaluate_coupon(coupon_code, user_id, city, lines, subtotal + surge_amount)
    pricing = finalize({
        "subtotal": subtotal, "surge_multiplier": mult, "surge_amount": surge_amount,
        "discount": discount, "coupon_code": coupon_code.upper() if coupon_code and not coupon_error else None,
        "extras_total": 0,
    })
    return {"lines": lines, "city": city, "serviceable": bool(city), "pricing": pricing,
            "coupon_error": coupon_error, "surge_reasons": reasons}


async def commission_rate_for(lines):
    s = await db.settings.find_one({"id": "commission"}, NOID) or {}
    default = s.get("default_rate", 0.18)
    rates = s.get("category_rates", {})
    if not lines:
        return default
    return max(rates.get(l["category_id"], default) for l in lines)


def ist_date(dt_iso):
    from datetime import datetime
    return datetime.fromisoformat(dt_iso).astimezone(IST).strftime("%Y-%m-%d")


def live_location(b):
    dest = b["address"].get("location")
    origin = b.get("partner_origin") or dest
    if b["status"] == "en_route" and not b.get("arrived_at") and b.get("en_route_at"):
        from datetime import datetime
        elapsed = (now() - datetime.fromisoformat(b["en_route_at"])).total_seconds()
        frac = min(1.0, max(0.0, elapsed / TRAVEL_SECONDS))
        loc = {"lat": origin["lat"] + (dest["lat"] - origin["lat"]) * frac,
               "lng": origin["lng"] + (dest["lng"] - origin["lng"]) * frac}
        return loc, max(1, round((1 - frac) * TRAVEL_SECONDS / 60 * 4))
    if b.get("arrived_at") or b["status"] in ("in_progress", "completed"):
        return dest, 0
    return origin, None


async def partner_brief(pid):
    if not pid:
        return None
    p = await db.users.find_one({"id": pid}, {"_id": 0, "id": 1, "name": 1, "avatar": 1, "rating": 1,
                                             "kyc_status": 1, "phone": 1, "jobs_done": 1, "location": 1})
    if p:
        p["verified"] = p.get("kyc_status") == "approved"
        p["masked_phone"] = "+91 80XXXX" + p.get("phone", "0000")[-4:]
        p.pop("phone", None)
    return p


async def enrich_booking(b, viewer_role):
    b = dict(b)
    b["partner"] = await partner_brief(b.get("partner_id"))
    loc, eta = live_location(b)
    b["live_location"], b["eta_min"] = loc, eta
    if viewer_role == "partner":
        b.pop("start_otp", None)
        b.pop("end_otp", None)
        cust = await db.users.find_one({"id": b["customer_id"]}, {"_id": 0, "name": 1, "phone": 1})
        b["customer"] = {"name": (cust or {}).get("name", "Customer"),
                         "masked_phone": "+91 80XXXX" + (cust or {}).get("phone", "0000")[-4:]}
    if viewer_role == "admin":
        cust = await db.users.find_one({"id": b["customer_id"]}, {"_id": 0, "name": 1, "phone": 1})
        b["customer"] = cust
    return b


async def wallet_txn(user_id, amount, reason, booking_id=None, field="wallet_balance"):
    await db.users.update_one({"id": user_id}, {"$inc": {field: r2(amount)}})
    await db.wallet_txns.insert_one({"id": new_id("txn_"), "user_id": user_id, "amount": r2(amount),
                                     "type": "credit" if amount >= 0 else "debit", "reason": reason,
                                     "booking_id": booking_id, "created_at": iso()})


async def push_timeline(bid, status, extra=None):
    upd = {"$push": {"timeline": {"status": status, "at": iso()}}}
    if extra:
        upd["$set"] = extra
    await db.bookings.update_one({"id": bid}, upd)


async def partner_has_live_job(pid):
    return await db.bookings.count_documents({"partner_id": pid, "status": {"$in": ["en_route", "in_progress"]}}) > 0


def cod_blocked(p):
    return p.get("cod_cash", 0) >= p.get("cod_limit", 3000)


async def find_offer_for_partner(p):
    nowiso = iso()
    b = await db.bookings.find_one({"offered_to": p["id"], "status": "pending", "offer_expires_at": {"$gt": nowiso}}, NOID)
    if b:
        return b
    if not p.get("is_online") or p.get("kyc_status") != "approved" or await partner_has_live_job(p["id"]):
        return None
    q = {"status": "pending", "rejected_by": {"$ne": p["id"]}, "category_ids": {"$in": p.get("skills", [])},
         "$or": [{"offered_to": None}, {"offer_expires_at": {"$lt": nowiso}}]}
    if cod_blocked(p):
        q["payment_method"] = {"$ne": "cod"}
    from pymongo import ReturnDocument
    return await db.bookings.find_one_and_update(
        q, {"$set": {"offered_to": p["id"], "offer_expires_at": iso(now() + timedelta(seconds=OFFER_SECONDS))}},
        projection=NOID, sort=[("created_at", 1)], return_document=ReturnDocument.AFTER)


async def offer_view(b, p):
    rate = await commission_rate_for(b["lines"])
    return {"booking_id": b["id"], "booking_no": b["booking_no"], "expires_at": b["offer_expires_at"],
            "services": [f"{l['name']} x{l['qty']}" for l in b["lines"]],
            "category": b["lines"][0]["category_name"] if b["lines"] else "",
            "distance_km": haversine_km(p.get("location"), b["address"].get("location")),
            "est_earning": r2(b["pricing"]["taxable"] * (1 - rate)), "payment_method": b["payment_method"],
            "mode": b["mode"], "slot_date": b.get("slot_date"), "slot_time": b.get("slot_time"),
            "area": b["address"].get("line", "")}


async def assert_booking(bid, user, field):
    b = await db.bookings.find_one({"id": bid}, NOID)
    if not b or (user["role"] != "admin" and b.get(field) != user["id"]):
        raise HTTPException(404, "Booking not found")
    return b


async def refresh_partner_rating(pid):
    rated = await db.bookings.find({"partner_id": pid, "rating": {"$ne": None}}, {"_id": 0, "rating": 1}).to_list(5000)
    if rated:
        avg = round(sum(x["rating"] for x in rated) / len(rated), 2)
        await db.users.update_one({"id": pid}, {"$set": {"rating": avg}})
