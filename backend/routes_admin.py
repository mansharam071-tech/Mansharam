import re
from datetime import timedelta
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from core import db, NOID, iso, now, new_id, r2, require_role, haversine_km, IST
from logic import enrich_booking, push_timeline, ist_date, cod_blocked, wallet_txn
from routes_partner import kyc_status, DOC_TYPES

router = APIRouter(prefix="/api/admin", tags=["admin"])
admin = require_role("admin")


class CityIn(BaseModel):
    city_name: str
    state: str
    is_active: bool = True
    pincodes: List[str] = []
    polygon: List[List[float]] = []
    center: Optional[dict] = None
    surge_pricing: dict = {"is_active": False, "multiplier": 1.0, "reason": ""}
    assigned_services: List[dict] = []


class CsvIn(BaseModel):
    csv_text: str


class SurgeIn(BaseModel):
    name: str
    trigger: str
    multiplier: float
    city_id: str = "all"
    start_hour: Optional[int] = None
    end_hour: Optional[int] = None
    weather: Optional[str] = None
    is_active: bool = True


class CouponIn(BaseModel):
    code: str
    description: str = ""
    discount_type: str = "percent"
    value: float
    max_discount: Optional[float] = None
    min_order: float = 0
    city_ids: List[str] = []
    category_ids: List[str] = []
    usage_limit: Optional[int] = None
    first_order_only: bool = False
    valid_till: Optional[str] = None
    is_active: bool = True


class ReassignIn(BaseModel):
    partner_id: str
    reason: Optional[str] = None


class KycAction(BaseModel):
    action: str
    note: Optional[str] = None


class CommissionIn(BaseModel):
    default_rate: float
    category_rates: dict = {}


PINCODE = re.compile(r"\b\d{6}\b")


def center_of(poly, fallback=None):
    if poly:
        return {"lat": sum(p[0] for p in poly) / len(poly), "lng": sum(p[1] for p in poly) / len(poly)}
    return fallback or {"lat": 22.97, "lng": 78.65}


# ---------- dashboard & alerts ----------
async def compute_alerts():
    alerts = []
    week = iso(now() - timedelta(days=7))
    low = await db.bookings.find({"rating": {"$lte": 2, "$gte": 1}, "completed_at": {"$gte": week}}, NOID).sort("completed_at", -1).to_list(20)
    pmap = {p["id"]: p for p in await db.users.find({"role": "partner"}, {"_id": 0, "documents": 0}).to_list(1000)}
    for b in low:
        alerts.append({"id": f"rate_{b['id']}", "type": "low_rating", "severity": "high",
                       "title": f"{b['rating']}★ rating on {b['booking_no']}",
                       "detail": f"Partner {pmap.get(b.get('partner_id'), {}).get('name', '-')} · {b['lines'][0]['name']}",
                       "at": b.get("completed_at"), "ref": b["id"]})
    for p in pmap.values():
        if p.get("consecutive_rejections", 0) >= 3:
            alerts.append({"id": f"rej_{p['id']}", "type": "consecutive_rejections", "severity": "medium",
                           "title": f"{p['name']} rejected {p['consecutive_rejections']} jobs in a row",
                           "detail": "Possible cherry-picking or availability issue", "at": iso(), "ref": p["id"]})
        if cod_blocked(p):
            alerts.append({"id": f"cod_{p['id']}", "type": "cod_limit", "severity": "high",
                           "title": f"{p['name']} holds ₹{p['cod_cash']:,.0f} un-remitted COD",
                           "detail": f"Limit ₹{p.get('cod_limit', 3000):,.0f} exceeded · new COD jobs paused", "at": iso(), "ref": p["id"]})
    for s in await db.sos_alerts.find({"status": "open"}, NOID).to_list(20):
        alerts.insert(0, {"id": f"sos_{s['id']}", "type": "sos", "severity": "critical", "title": f"SOS from {s['partner_name']}",
                          "detail": f"Phone {s.get('phone')} · tap to resolve", "at": s["created_at"], "ref": s["id"]})
    return alerts


@router.get("/dashboard")
async def dashboard(user=Depends(admin)):
    since = iso(now() - timedelta(days=60))
    bs = await db.bookings.find({"created_at": {"$gte": since}}, {"_id": 0, "created_at": 1, "completed_at": 1, "status": 1,
                                                                  "pricing.total": 1, "commission": 1, "lines": 1}).to_list(20000)
    today = now().astimezone(IST).date()
    t, y = today.isoformat(), (today - timedelta(days=1)).isoformat()
    for b in bs:
        b["d"] = ist_date(b["created_at"])
        b["cd"] = ist_date(b["completed_at"]) if b.get("completed_at") else None
    tb = sum(1 for b in bs if b["d"] == t)
    yb = sum(1 for b in bs if b["d"] == y)
    comp_today = [b for b in bs if b["status"] == "completed" and b["cd"] == t]
    daily = []
    for i in range(13, -1, -1):
        d = (today - timedelta(days=i)).isoformat()
        daily.append({"label": (today - timedelta(days=i)).strftime("%d %b"), "bookings": sum(1 for b in bs if b["d"] == d),
                      "revenue": r2(sum(b["pricing"]["total"] for b in bs if b["status"] == "completed" and b["cd"] == d))})
    weekly = []
    for w in range(7, -1, -1):
        s = today - timedelta(days=today.weekday() + 7 * w)
        e = (s + timedelta(days=6)).isoformat()
        weekly.append({"label": s.strftime("%d %b"), "bookings": sum(1 for b in bs if s.isoformat() <= b["d"] <= e),
                       "revenue": r2(sum(b["pricing"]["total"] for b in bs if b["status"] == "completed" and b["cd"] and s.isoformat() <= b["cd"] <= e))})
    cats = {}
    for b in bs:
        if b["status"] == "completed":
            for l in b["lines"]:
                cats[l["category_name"]] = cats.get(l["category_name"], 0) + l["line_total"]
    live = await db.bookings.count_documents({"status": {"$in": ["en_route", "in_progress"]}})
    online = await db.users.count_documents({"role": "partner", "is_online": True})
    total_p = await db.users.count_documents({"role": "partner", "kyc_status": "approved"})
    return {"kpis": {"today_bookings": tb, "yesterday_bookings": yb,
                     "bookings_change_pct": round((tb - yb) / yb * 100, 1) if yb else None,
                     "active_live_jobs": live, "assigned_jobs": await db.bookings.count_documents({"status": "assigned"}),
                     "pending_jobs": await db.bookings.count_documents({"status": "pending"}),
                     "today_revenue": r2(sum(b["pricing"]["total"] for b in comp_today)),
                     "today_commission": r2(sum(b.get("commission") or 0 for b in comp_today)),
                     "online_partners": online, "total_partners": total_p},
            "daily": daily, "weekly": weekly,
            "category_breakdown": [{"name": k, "value": r2(v)} for k, v in sorted(cats.items(), key=lambda x: -x[1])],
            "alerts": await compute_alerts()}


@router.get("/alerts")
async def alerts(user=Depends(admin)):
    return await compute_alerts()


@router.get("/search")
async def search(q: str, user=Depends(admin)):
    rx = {"$regex": re.escape(q), "$options": "i"}
    bookings = await db.bookings.find({"booking_no": rx}, {"_id": 0, "id": 1, "booking_no": 1, "status": 1}).to_list(5)
    users = await db.users.find({"$or": [{"name": rx}, {"phone": rx}], "role": {"$in": ["customer", "partner"]}},
                                {"_id": 0, "id": 1, "name": 1, "phone": 1, "role": 1}).to_list(8)
    cities = await db.cities.find({"$or": [{"city_name": rx}, {"pincodes": rx}]}, {"_id": 0, "id": 1, "city_name": 1}).to_list(5)
    return {"bookings": bookings, "users": users, "cities": cities}


# ---------- cities / geofencing ----------
@router.get("/cities")
async def cities(user=Depends(admin)):
    return await db.cities.find({}, NOID).sort("created_at", 1).to_list(200)


@router.post("/cities")
async def create_city(body: CityIn, user=Depends(admin)):
    doc = {"id": new_id("city_"), **body.model_dump(), "created_at": iso()}
    doc["pincodes"] = sorted(set(p for p in doc["pincodes"] if PINCODE.fullmatch(p)))
    doc["center"] = body.center or center_of(body.polygon)
    await db.cities.insert_one(dict(doc))
    doc.pop("_id", None)
    return doc


@router.put("/cities/{cid}")
async def update_city(cid: str, body: CityIn, user=Depends(admin)):
    upd = body.model_dump()
    upd["pincodes"] = sorted(set(p for p in upd["pincodes"] if PINCODE.fullmatch(p)))
    upd["center"] = body.center or center_of(body.polygon)
    res = await db.cities.update_one({"id": cid}, {"$set": upd})
    if not res.matched_count:
        raise HTTPException(404, "City not found")
    return await db.cities.find_one({"id": cid}, NOID)


@router.delete("/cities/{cid}")
async def delete_city(cid: str, user=Depends(admin)):
    await db.cities.delete_one({"id": cid})
    return {"ok": True}


@router.post("/cities/{cid}/pincodes/bulk")
async def bulk_pincodes(cid: str, body: CsvIn, user=Depends(admin)):
    c = await db.cities.find_one({"id": cid}, NOID)
    if not c:
        raise HTTPException(404, "City not found")
    found = PINCODE.findall(body.csv_text)
    merged = sorted(set(c["pincodes"]) | set(found))
    await db.cities.update_one({"id": cid}, {"$set": {"pincodes": merged}})
    return {"added": len(set(found) - set(c["pincodes"])), "pincodes": merged}


@router.get("/services")
async def services(user=Depends(admin)):
    return await db.services.find({}, {"_id": 0, "reviews": 0}).to_list(500)


# ---------- surge & coupons ----------
@router.get("/surge-rules")
async def surge_rules(user=Depends(admin)):
    return await db.surge_rules.find({}, NOID).sort("created_at", 1).to_list(200)


def check_surge(body):
    if not 1.0 <= body.multiplier <= 3.0:
        raise HTTPException(400, "Multiplier must be between 1.0x and 3.0x")
    if body.trigger not in ("weather", "peak_hours", "high_demand"):
        raise HTTPException(400, "Invalid trigger")


@router.post("/surge-rules")
async def create_surge(body: SurgeIn, user=Depends(admin)):
    check_surge(body)
    doc = {"id": new_id("surge_"), **body.model_dump(), "created_at": iso()}
    await db.surge_rules.insert_one(dict(doc))
    doc.pop("_id", None)
    return doc


@router.put("/surge-rules/{rid}")
async def update_surge(rid: str, body: SurgeIn, user=Depends(admin)):
    check_surge(body)
    await db.surge_rules.update_one({"id": rid}, {"$set": body.model_dump()})
    return await db.surge_rules.find_one({"id": rid}, NOID)


@router.delete("/surge-rules/{rid}")
async def delete_surge(rid: str, user=Depends(admin)):
    await db.surge_rules.delete_one({"id": rid})
    return {"ok": True}


@router.get("/coupons")
async def coupons(user=Depends(admin)):
    return await db.coupons.find({}, NOID).sort("created_at", 1).to_list(200)


@router.post("/coupons")
async def create_coupon(body: CouponIn, user=Depends(admin)):
    code = body.code.strip().upper()
    if not re.fullmatch(r"[A-Z0-9]{3,20}", code):
        raise HTTPException(400, "Code must be 3-20 letters/numbers")
    if await db.coupons.find_one({"code": code}):
        raise HTTPException(400, "Coupon code already exists")
    doc = {"id": new_id("cpn_"), **body.model_dump(), "code": code, "used_count": 0, "created_at": iso()}
    await db.coupons.insert_one(dict(doc))
    doc.pop("_id", None)
    return doc


@router.put("/coupons/{cid}")
async def update_coupon(cid: str, body: CouponIn, user=Depends(admin)):
    upd = body.model_dump()
    upd["code"] = body.code.strip().upper()
    await db.coupons.update_one({"id": cid}, {"$set": upd})
    return await db.coupons.find_one({"id": cid}, NOID)


@router.delete("/coupons/{cid}")
async def delete_coupon(cid: str, user=Depends(admin)):
    await db.coupons.delete_one({"id": cid})
    return {"ok": True}


# ---------- bookings ----------
@router.get("/bookings")
async def bookings(status: Optional[str] = None, q: Optional[str] = None, user=Depends(admin)):
    f = {}
    if status and status != "all":
        f["status"] = status
    if q:
        cust = await db.users.find({"phone": {"$regex": re.escape(q)}, "role": "customer"}, {"_id": 0, "id": 1}).to_list(50)
        f["$or"] = [{"booking_no": {"$regex": re.escape(q), "$options": "i"}}, {"customer_id": {"$in": [c["id"] for c in cust]}}]
    bs = await db.bookings.find(f, NOID).sort("created_at", -1).to_list(150)
    users = {u["id"]: u for u in await db.users.find({"id": {"$in": list({b["customer_id"] for b in bs} | {b.get("partner_id") for b in bs})}},
                                                     {"_id": 0, "id": 1, "name": 1, "phone": 1}).to_list(1000)}
    counts = {}
    for row in await db.bookings.aggregate([{"$group": {"_id": "$status", "n": {"$sum": 1}}}]).to_list(20):
        counts[row["_id"]] = row["n"]
    for b in bs:
        b["customer"] = users.get(b["customer_id"])
        b["partner_name"] = users.get(b.get("partner_id"), {}).get("name")
        b.pop("start_otp", None)
        b.pop("end_otp", None)
    return {"bookings": bs, "counts": counts}


@router.get("/bookings/{bid}")
async def booking(bid: str, user=Depends(admin)):
    b = await db.bookings.find_one({"id": bid}, NOID)
    if not b:
        raise HTTPException(404, "Booking not found")
    return await enrich_booking(b, "admin")


@router.get("/bookings/{bid}/candidates")
async def candidates(bid: str, user=Depends(admin)):
    b = await db.bookings.find_one({"id": bid}, NOID)
    if not b:
        raise HTTPException(404, "Booking not found")
    ps = await db.users.find({"role": "partner", "kyc_status": "approved", "name": {"$nin": ["", None]}},
                             {"_id": 0, "documents": 0}).to_list(500)
    out = []
    for p in ps:
        out.append({"id": p["id"], "name": p["name"], "phone": p["phone"], "rating": p.get("rating"), "is_online": p.get("is_online"),
                    "skill_match": any(c in p.get("skills", []) for c in b["category_ids"]),
                    "distance_km": haversine_km(p.get("location"), b["address"].get("location")),
                    "cod_blocked": cod_blocked(p), "current": p["id"] == b.get("partner_id")})
    return sorted(out, key=lambda x: (not x["skill_match"], not x["is_online"], x["distance_km"]))


@router.post("/bookings/{bid}/reassign")
async def reassign(bid: str, body: ReassignIn, user=Depends(admin)):
    b = await db.bookings.find_one({"id": bid}, NOID)
    if not b or b["status"] in ("completed", "cancelled", "in_progress"):
        raise HTTPException(400, "Only pending, assigned or en-route jobs can be reassigned")
    p = await db.users.find_one({"id": body.partner_id, "role": "partner", "kyc_status": "approved"}, NOID)
    if not p:
        raise HTTPException(400, "Partner not found or not KYC approved")
    await push_timeline(bid, "assigned", {"status": "assigned", "partner_id": p["id"], "offered_to": None, "en_route_at": None,
                                           "arrived_at": None, "partner_origin": None, "reassigned_by_admin": True,
                                           "reassign_reason": body.reason, "assigned_at": iso()})
    return {"ok": True}


@router.post("/bookings/{bid}/cancel")
async def admin_cancel(bid: str, user=Depends(admin)):
    b = await db.bookings.find_one({"id": bid}, NOID)
    if not b or b["status"] in ("completed", "cancelled"):
        raise HTTPException(400, "Cannot cancel this booking")
    refund = b["amount_paid"] if b["payment_status"] == "paid" else 0
    if refund:
        await wallet_txn(b["customer_id"], refund, f"Full refund – cancelled by support {b['booking_no']}", bid)
    await push_timeline(bid, "cancelled", {"status": "cancelled", "offered_to": None,
                                            "cancellation": {"fee": 0, "refund": refund, "by": "admin", "at": iso()}})
    return {"ok": True, "refund": refund}


# ---------- partners / KYC ----------
@router.get("/partners")
async def partners(user=Depends(admin)):
    ps = await db.users.find({"role": "partner"}, {"_id": 0}).sort("created_at", 1).to_list(1000)
    for p in ps:
        p["cod_blocked"] = cod_blocked(p)
    return ps


@router.post("/partners/{pid}/settle-cod")
async def settle_cod(pid: str, user=Depends(admin)):
    p = await db.users.find_one({"id": pid, "role": "partner"}, NOID)
    if not p:
        raise HTTPException(404, "Partner not found")
    await db.cod_remittances.insert_one({"id": new_id("rem_"), "partner_id": pid, "amount": p.get("cod_cash", 0), "at": iso()})
    await db.users.update_one({"id": pid}, {"$set": {"cod_cash": 0.0}})
    return {"ok": True, "remitted": p.get("cod_cash", 0)}


@router.post("/partners/{pid}/reset-rejections")
async def reset_rejections(pid: str, user=Depends(admin)):
    await db.users.update_one({"id": pid}, {"$set": {"consecutive_rejections": 0}})
    return {"ok": True}


@router.get("/kyc")
async def kyc_queue(user=Depends(admin)):
    return await db.users.find({"role": "partner", "kyc_status": {"$in": ["pending", "rejected"]}}, {"_id": 0}).to_list(500)


@router.get("/kyc/{pid}/{doc_type}/file")
async def kyc_file(pid: str, doc_type: str, user=Depends(admin)):
    f = await db.kyc_files.find_one({"partner_id": pid, "type": doc_type}, NOID)
    return {"file": (f or {}).get("file")}


@router.post("/kyc/{pid}/{doc_type}")
async def kyc_action(pid: str, doc_type: str, body: KycAction, user=Depends(admin)):
    if doc_type not in DOC_TYPES or body.action not in ("approve", "reject", "resubmit"):
        raise HTTPException(400, "Invalid action")
    p = await db.users.find_one({"id": pid, "role": "partner"}, NOID)
    if not p or doc_type not in (p.get("documents") or {}):
        raise HTTPException(404, "Document not found")
    docs = p["documents"]
    docs[doc_type]["status"] = {"approve": "approved", "reject": "rejected", "resubmit": "resubmit"}[body.action]
    docs[doc_type]["note"] = body.note or ""
    docs[doc_type]["reviewed_at"] = iso()
    st = kyc_status(docs)
    await db.users.update_one({"id": pid}, {"$set": {"documents": docs, "kyc_status": st}})
    return {"ok": True, "kyc_status": st, "documents": docs}


# ---------- financials ----------
@router.get("/commission")
async def get_commission(user=Depends(admin)):
    return await db.settings.find_one({"id": "commission"}, NOID)


@router.put("/commission")
async def set_commission(body: CommissionIn, user=Depends(admin)):
    for r in [body.default_rate, *body.category_rates.values()]:
        if not 0.15 <= float(r) <= 0.20:
            raise HTTPException(400, "Commission rates must be between 15% and 20%")
    await db.settings.update_one({"id": "commission"}, {"$set": body.model_dump()}, upsert=True)
    return await db.settings.find_one({"id": "commission"}, NOID)


@router.get("/settlements")
async def settlements(user=Depends(admin)):
    return await db.settlements.find({}, NOID).sort("created_at", -1).to_list(300)


@router.post("/settlements/generate")
async def generate_settlements(user=Depends(admin)):
    bs = await db.bookings.find({"status": "completed", "settlement_id": None, "partner_id": {"$ne": None}}, NOID).to_list(20000)
    groups = {}
    for b in bs:
        groups.setdefault(b["partner_id"], []).append(b)
    today = now().astimezone(IST).date()
    created = []
    seq = await db.settlements.count_documents({})
    for pid, items in groups.items():
        p = await db.users.find_one({"id": pid}, {"_id": 0, "name": 1, "bank": 1})
        pens = await db.penalties.find({"partner_id": pid, "settled": False}, NOID).to_list(100)
        earnings = r2(sum(b["partner_earning"] or 0 for b in items))
        tips = r2(sum(b.get("tip") or 0 for b in items))
        commission = r2(sum(b["commission"] or 0 for b in items))
        penalties = r2(sum(x["amount"] for x in pens))
        seq += 1
        sid = new_id("stl_")
        s = {"id": sid, "partner_id": pid, "partner_name": (p or {}).get("name"), "bank": (p or {}).get("bank"),
             "period_start": min(ist_date(b["completed_at"]) for b in items), "period_end": today.isoformat(), "jobs": len(items),
             "gross": r2(sum(b["pricing"]["taxable"] for b in items)), "commission": commission,
             "commission_gst": r2(commission * 0.18), "tips": tips, "penalties": penalties, "earnings": earnings,
             "net_payable": r2(earnings + tips - penalties), "gst_invoice_no": f"COMM/{today.year}/{5000 + seq}",
             "status": "pending", "created_at": iso()}
        await db.settlements.insert_one(dict(s))
        await db.bookings.update_many({"id": {"$in": [b["id"] for b in items]}}, {"$set": {"settlement_id": sid}})
        await db.penalties.update_many({"id": {"$in": [x["id"] for x in pens]}}, {"$set": {"settled": True, "settlement_id": sid}})
        s.pop("_id", None)
        created.append(s)
    return {"created": len(created), "settlements": created}


@router.post("/settlements/{sid}/release")
async def release(sid: str, user=Depends(admin)):
    s = await db.settlements.find_one({"id": sid, "status": "pending"}, NOID)
    if not s:
        raise HTTPException(400, "Settlement not found or already released")
    await db.settlements.update_one({"id": sid}, {"$set": {"status": "released", "released_at": iso()}})
    await db.users.update_one({"id": s["partner_id"]}, {"$inc": {"pending_earnings": -r2(s["earnings"] + s["tips"])}})
    await wallet_txn(s["partner_id"], s["net_payable"], f"Weekly settlement {s['gst_invoice_no']}")
    return {"ok": True}


@router.get("/payouts")
async def payouts(user=Depends(admin)):
    return await db.payouts.find({}, NOID).sort("created_at", -1).to_list(300)


@router.post("/payouts/{pid}/pay")
async def pay(pid: str, user=Depends(admin)):
    res = await db.payouts.update_one({"id": pid, "status": "requested"},
                                      {"$set": {"status": "paid", "paid_at": iso(), "utr": f"UTR{new_id()[:10].upper()}"}})
    if not res.modified_count:
        raise HTTPException(400, "Payout not found or already paid")
    return {"ok": True}


@router.get("/invoices")
async def invoices(user=Depends(admin)):
    return await db.bookings.find({"invoice_no": {"$ne": None}}, {"_id": 0, "id": 1, "booking_no": 1, "invoice_no": 1,
                                                                  "completed_at": 1, "pricing": 1, "city_name": 1,
                                                                  "payment_method": 1}).sort("completed_at", -1).to_list(100)


@router.get("/sos")
async def sos_list(user=Depends(admin)):
    return await db.sos_alerts.find({}, NOID).sort("created_at", -1).to_list(100)


@router.post("/sos/{sid}/resolve")
async def sos_resolve(sid: str, user=Depends(admin)):
    await db.sos_alerts.update_one({"id": sid}, {"$set": {"status": "resolved", "resolved_at": iso()}})
    return {"ok": True}
