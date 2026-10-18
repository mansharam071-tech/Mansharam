from datetime import timedelta, datetime
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from core import db, NOID, iso, now, new_id, r2, require_role, IST
from logic import (find_offer_for_partner, offer_view, enrich_booking, push_timeline, assert_booking, cod_blocked,
                   commission_rate_for, finalize, wallet_txn, ist_date, ACTIVE_STATUSES)

router = APIRouter(prefix="/api/partner", tags=["partner"])
partner = require_role("partner")
DOC_TYPES = ["aadhaar", "pan", "dl", "police"]


class StatusIn(BaseModel):
    is_online: bool
    location: Optional[dict] = None


class ProfileIn(BaseModel):
    name: Optional[str] = None
    skills: Optional[List[str]] = None
    sub_skills: Optional[List[str]] = None
    bank: Optional[dict] = None
    shift: Optional[dict] = None
    city_id: Optional[str] = None


class DocIn(BaseModel):
    type: str
    number: str
    expiry_date: Optional[str] = None
    file: Optional[str] = None


class OtpIn(BaseModel):
    otp: str


class ExtraIn(BaseModel):
    name: str
    amount: float


class AmountIn(BaseModel):
    amount: float


class SosIn(BaseModel):
    location: Optional[dict] = None
    booking_id: Optional[str] = None


def doc_alerts(p):
    alerts = []
    for t in ("dl", "police"):
        d = (p.get("documents") or {}).get(t)
        if d and d.get("expiry_date"):
            days = (datetime.fromisoformat(d["expiry_date"]).date() - now().astimezone(IST).date()).days
            if days <= 30:
                alerts.append({"type": t, "days_left": days, "expiry_date": d["expiry_date"],
                               "level": "danger" if days <= 7 else "warning"})
    return alerts


def kyc_status(docs):
    st = [docs.get(t, {}).get("status") for t in DOC_TYPES]
    if all(s == "approved" for s in st):
        return "approved"
    if any(s == "rejected" for s in st):
        return "rejected"
    if any(s in ("pending", "resubmit") for s in st):
        return "pending"
    return "not_submitted"


async def me(uid):
    return await db.users.find_one({"id": uid}, {"_id": 0, "password_hash": 0})


async def active_job(pid):
    b = await db.bookings.find_one({"partner_id": pid, "status": {"$in": ["en_route", "in_progress"]}}, NOID)
    if not b:
        b = await db.bookings.find_one({"partner_id": pid, "status": "assigned"}, NOID, sort=[("created_at", 1)])
    return b


@router.get("/dashboard")
async def dashboard(user=Depends(partner)):
    p = await me(user["id"])
    today = now().astimezone(IST).strftime("%Y-%m-%d")
    done = await db.bookings.find({"partner_id": p["id"], "status": "completed"}, {"_id": 0, "completed_at": 1,
                                                                                   "partner_earning": 1, "tip": 1}).to_list(5000)
    today_done = [b for b in done if b.get("completed_at") and ist_date(b["completed_at"]) == today]
    job = await active_job(p["id"])
    upcoming = await db.bookings.count_documents({"partner_id": p["id"], "status": "assigned"})
    offer = await find_offer_for_partner(p)
    return {"profile": p, "cod": {"cash": p.get("cod_cash", 0), "limit": p.get("cod_limit", 3000), "blocked": cod_blocked(p)},
            "today": {"jobs": len(today_done), "earnings": r2(sum((b.get("partner_earning") or 0) + (b.get("tip") or 0) for b in today_done))},
            "active_job": await enrich_booking(job, "partner") if job else None, "upcoming": upcoming,
            "doc_alerts": doc_alerts(p), "offer": await offer_view(offer, p) if offer else None}


@router.get("/offer")
async def poll_offer(user=Depends(partner)):
    p = await me(user["id"])
    offer = await find_offer_for_partner(p)
    return {"offer": await offer_view(offer, p) if offer else None}


@router.post("/offers/{bid}/accept")
async def accept(bid: str, user=Depends(partner)):
    grace = iso(now() - timedelta(seconds=3))
    res = await db.bookings.update_one(
        {"id": bid, "status": "pending", "offered_to": user["id"], "offer_expires_at": {"$gt": grace}},
        {"$set": {"status": "assigned", "partner_id": user["id"], "offered_to": None, "assigned_at": iso()},
         "$push": {"timeline": {"status": "assigned", "at": iso()}}})
    if not res.modified_count:
        raise HTTPException(400, "Offer expired or no longer available")
    await db.users.update_one({"id": user["id"]}, {"$set": {"consecutive_rejections": 0}})
    return {"ok": True, "booking_id": bid}


@router.post("/offers/{bid}/decline")
async def decline(bid: str, user=Depends(partner)):
    res = await db.bookings.update_one({"id": bid, "offered_to": user["id"], "status": "pending"},
                                       {"$set": {"offered_to": None, "offer_expires_at": None}, "$addToSet": {"rejected_by": user["id"]}})
    if not res.modified_count:
        raise HTTPException(400, "This job was not offered to you")
    await db.users.update_one({"id": user["id"]}, {"$inc": {"consecutive_rejections": 1}})
    p = await me(user["id"])
    if p["consecutive_rejections"] and p["consecutive_rejections"] % 3 == 0:
        await db.penalties.insert_one({"id": new_id("pen_"), "partner_id": p["id"], "amount": 50,
                                       "reason": "Consecutive job rejections", "settled": False, "created_at": iso()})
    return {"ok": True, "consecutive_rejections": p["consecutive_rejections"]}


@router.post("/status")
async def set_status(body: StatusIn, user=Depends(partner)):
    p = await me(user["id"])
    if body.is_online and p.get("kyc_status") != "approved":
        raise HTTPException(400, "Complete KYC verification before going online")
    upd = {"is_online": body.is_online}
    if body.location:
        upd["location"] = body.location
    await db.users.update_one({"id": user["id"]}, {"$set": upd})
    await db.attendance.insert_one({"partner_id": user["id"], "event": "online" if body.is_online else "offline", "at": iso()})
    return {"ok": True, "is_online": body.is_online}


@router.put("/profile")
async def update_profile(body: ProfileIn, user=Depends(partner)):
    upd = {k: v for k, v in body.model_dump().items() if v is not None}
    if upd:
        await db.users.update_one({"id": user["id"]}, {"$set": upd})
    return await me(user["id"])


@router.get("/documents")
async def documents(user=Depends(partner)):
    p = await me(user["id"])
    return {"documents": p.get("documents", {}), "kyc_status": p.get("kyc_status"), "alerts": doc_alerts(p)}


@router.post("/documents")
async def upload_doc(body: DocIn, user=Depends(partner)):
    if body.type not in DOC_TYPES:
        raise HTTPException(400, "Invalid document type")
    if body.type in ("dl", "police") and not body.expiry_date:
        raise HTTPException(400, "Expiry date is required for this document")
    if body.file and len(body.file) > 3_000_000:
        raise HTTPException(400, "File too large (max ~2MB)")
    p = await me(user["id"])
    docs = p.get("documents") or {}
    docs[body.type] = {"number": body.number, "expiry_date": body.expiry_date, "status": "pending", "note": "",
                       "has_file": bool(body.file), "uploaded_at": iso()}
    if body.file:
        await db.kyc_files.update_one({"partner_id": p["id"], "type": body.type},
                                      {"$set": {"file": body.file, "uploaded_at": iso()}}, upsert=True)
    await db.users.update_one({"id": p["id"]}, {"$set": {"documents": docs, "kyc_status": kyc_status(docs)}})
    return {"documents": docs, "kyc_status": kyc_status(docs)}


@router.get("/jobs")
async def jobs(scope: str = "active", user=Depends(partner)):
    st = {"active": ACTIVE_STATUSES, "upcoming": ["assigned"], "history": ["completed", "cancelled"]}.get(scope, ACTIVE_STATUSES)
    bs = await db.bookings.find({"partner_id": user["id"], "status": {"$in": st}},
                                {"_id": 0, "start_otp": 0, "end_otp": 0}).sort("created_at", -1).to_list(300)
    return bs


@router.get("/calendar")
async def calendar(month: str, user=Depends(partner)):
    bs = await db.bookings.find({"partner_id": user["id"], "slot_date": {"$regex": f"^{month}"}},
                                {"_id": 0, "id": 1, "booking_no": 1, "slot_date": 1, "slot_time": 1, "status": 1,
                                 "lines": 1}).to_list(1000)
    return bs


@router.get("/jobs/{bid}")
async def job(bid: str, user=Depends(partner)):
    return await enrich_booking(await assert_booking(bid, user, "partner_id"), "partner")


@router.post("/jobs/{bid}/navigate")
async def navigate(bid: str, user=Depends(partner)):
    b = await assert_booking(bid, user, "partner_id")
    if b["status"] != "assigned":
        raise HTTPException(400, "Navigation can start only for assigned jobs")
    if await db.bookings.count_documents({"partner_id": user["id"], "status": {"$in": ["en_route", "in_progress"]}}):
        raise HTTPException(400, "Finish your current live job first")
    p = await me(user["id"])
    await push_timeline(bid, "en_route", {"status": "en_route", "en_route_at": iso(), "partner_origin": p.get("location")})
    return {"ok": True}


@router.post("/jobs/{bid}/arrived")
async def arrived(bid: str, user=Depends(partner)):
    b = await assert_booking(bid, user, "partner_id")
    if b["status"] not in ("assigned", "en_route"):
        raise HTTPException(400, "Invalid job state")
    p = await me(user["id"])
    await push_timeline(bid, "arrived", {"status": "en_route", "arrived_at": iso(), "en_route_at": b.get("en_route_at") or iso(),
                                          "partner_origin": b.get("partner_origin") or p.get("location")})
    return {"ok": True}


@router.post("/jobs/{bid}/start")
async def start(bid: str, body: OtpIn, user=Depends(partner)):
    b = await assert_booking(bid, user, "partner_id")
    if not b.get("arrived_at") or b["status"] != "en_route":
        raise HTTPException(400, "Mark 'Arrived at location' first")
    if body.otp != b["start_otp"]:
        raise HTTPException(400, "Incorrect start OTP")
    await push_timeline(bid, "in_progress", {"status": "in_progress", "started_at": iso()})
    return {"ok": True}


@router.post("/jobs/{bid}/extras")
async def add_extra(bid: str, body: ExtraIn, user=Depends(partner)):
    b = await assert_booking(bid, user, "partner_id")
    if b["status"] != "in_progress":
        raise HTTPException(400, "Extras can be added only while job is in progress")
    if body.amount <= 0 or not body.name.strip():
        raise HTTPException(400, "Enter part name and a positive amount")
    ex = {"id": new_id("ex_"), "name": body.name.strip(), "amount": r2(body.amount), "status": "pending", "requested_at": iso()}
    await db.bookings.update_one({"id": bid}, {"$push": {"extras": ex}})
    return ex


@router.post("/jobs/{bid}/complete")
async def complete(bid: str, body: OtpIn, user=Depends(partner)):
    b = await assert_booking(bid, user, "partner_id")
    if b["status"] != "in_progress":
        raise HTTPException(400, "Job is not in progress")
    if any(e["status"] == "pending" for e in b["extras"]):
        raise HTTPException(400, "Waiting for customer approval on extra charges")
    if body.otp != b["end_otp"]:
        raise HTTPException(400, "Incorrect end OTP")
    p = finalize(b["pricing"])
    rate = await commission_rate_for(b["lines"])
    commission = r2(p["taxable"] * rate)
    earning = r2(p["taxable"] - commission)
    seq = await db.counters.find_one_and_update({"id": "invoice"}, {"$inc": {"seq": 1}}, upsert=True, return_document=True)
    inv = f"GST/{now().year}/{10000 + (seq or {}).get('seq', 1)}"
    balance = r2(p["total"] - (b.get("amount_paid") or 0)) if b["payment_method"] != "cod" else 0
    if balance > 0 and b["payment_method"] == "wallet":
        await wallet_txn(b["customer_id"], -balance, f"Approved extras for {b['booking_no']}", bid)
    upd = {"status": "completed", "completed_at": iso(), "pricing": p, "commission_rate": rate, "commission": commission,
           "partner_earning": earning, "invoice_no": inv, "payment_status": "paid", "amount_paid": p["total"],
           "balance_collected": max(0, balance)}
    await push_timeline(bid, "completed", upd)
    inc = {"pending_earnings": earning, "jobs_done": 1}
    if b["payment_method"] == "cod":
        inc["cod_cash"] = p["total"]
    await db.users.update_one({"id": user["id"]}, {"$inc": inc})
    if b["payment_method"] != "cod":
        cashback = r2(min(50, p["total"] * 0.05))
        await wallet_txn(b["customer_id"], cashback, f"5% cashback on {b['booking_no']}", bid)
    return {"ok": True, "invoice_no": inv, "pricing": p, "partner_earning": earning}


@router.get("/earnings")
async def earnings(user=Depends(partner)):
    p = await me(user["id"])
    done = await db.bookings.find({"partner_id": p["id"], "status": "completed"},
                                  {"_id": 0, "completed_at": 1, "partner_earning": 1, "tip": 1, "commission": 1,
                                   "pricing.taxable": 1}).to_list(5000)
    today = now().astimezone(IST).date()
    by_day = {}
    for b in done:
        d = ist_date(b["completed_at"])
        by_day[d] = by_day.get(d, 0) + (b.get("partner_earning") or 0) + (b.get("tip") or 0)
    daily = []
    for i in range(6, -1, -1):
        d = today - timedelta(days=i)
        daily.append({"label": d.strftime("%a"), "date": d.isoformat(), "amount": r2(by_day.get(d.isoformat(), 0))})
    weekly = []
    for w in range(5, -1, -1):
        start = today - timedelta(days=today.weekday() + 7 * w)
        amt = sum(v for k, v in by_day.items() if start.isoformat() <= k <= (start + timedelta(days=6)).isoformat())
        weekly.append({"label": start.strftime("%d %b"), "amount": r2(amt)})
    pens = await db.penalties.find({"partner_id": p["id"]}, NOID).sort("created_at", -1).to_list(100)
    payouts = await db.payouts.find({"partner_id": p["id"]}, NOID).sort("created_at", -1).to_list(50)
    return {"daily": daily, "weekly": weekly,
            "summary": {"gross": r2(sum((b.get("pricing") or {}).get("taxable", 0) for b in done)),
                        "commission": r2(sum(b.get("commission") or 0 for b in done)),
                        "tips": r2(sum(b.get("tip") or 0 for b in done)),
                        "penalties": r2(sum(x["amount"] for x in pens)),
                        "net": r2(sum((b.get("partner_earning") or 0) + (b.get("tip") or 0) for b in done) - sum(x["amount"] for x in pens)),
                        "jobs": len(done)},
            "wallet_balance": p.get("wallet_balance", 0), "pending_earnings": p.get("pending_earnings", 0),
            "cod_cash": p.get("cod_cash", 0), "penalties": pens, "payouts": payouts}


@router.post("/withdraw")
async def withdraw(body: AmountIn, user=Depends(partner)):
    p = await me(user["id"])
    if body.amount <= 0 or body.amount > p.get("wallet_balance", 0):
        raise HTTPException(400, "Amount exceeds withdrawable balance")
    if not (p.get("bank") or {}).get("account_no"):
        raise HTTPException(400, "Add bank account details first")
    await wallet_txn(p["id"], -body.amount, "Withdrawal to bank")
    po = {"id": new_id("po_"), "partner_id": p["id"], "partner_name": p.get("name"), "amount": r2(body.amount),
          "bank": p["bank"], "status": "requested", "created_at": iso()}
    await db.payouts.insert_one(dict(po))
    po.pop("_id", None)
    return po


@router.post("/sos")
async def sos(body: SosIn, user=Depends(partner)):
    p = await me(user["id"])
    s = {"id": new_id("sos_"), "partner_id": p["id"], "partner_name": p.get("name"), "phone": p.get("phone"),
         "location": body.location or p.get("location"), "booking_id": body.booking_id, "status": "open", "created_at": iso()}
    await db.sos_alerts.insert_one(dict(s))
    s.pop("_id", None)
    return s
