import re
from datetime import timedelta
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from core import db, NOID, DEMO_OTP, iso, now, new_id, verify_password, create_token, public_user, get_current_user

router = APIRouter(prefix="/api/auth", tags=["auth"])


class AdminLogin(BaseModel):
    email: str
    password: str


class OtpSend(BaseModel):
    phone: str
    role: str


class OtpVerify(BaseModel):
    phone: str
    otp: str
    role: str
    name: Optional[str] = None


class ProfileUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    language: Optional[str] = None
    notifications: Optional[dict] = None
    avatar: Optional[str] = None


def check_phone_role(phone, role):
    if role not in ("customer", "partner"):
        raise HTTPException(400, "Role must be customer or partner")
    if not re.fullmatch(r"[6-9]\d{9}", phone or ""):
        raise HTTPException(400, "Enter a valid 10-digit Indian mobile number")


@router.post("/admin/login")
async def admin_login(body: AdminLogin, request: Request):
    email = body.email.strip().lower()
    ident = f"admin:{email}"
    att = await db.login_attempts.find_one({"identifier": ident})
    if att and att.get("count", 0) >= 5 and att.get("locked_until", "") > iso():
        raise HTTPException(429, "Too many failed attempts. Try again in 15 minutes.")
    user = await db.users.find_one({"email": email, "role": "admin"})
    if not user or not verify_password(body.password, user["password_hash"]):
        cnt = (att or {}).get("count", 0) + 1
        await db.login_attempts.update_one({"identifier": ident}, {"$set": {
            "count": cnt, "locked_until": iso(now() + timedelta(minutes=15)) if cnt >= 5 else ""}}, upsert=True)
        raise HTTPException(401, "Invalid email or password")
    await db.login_attempts.delete_one({"identifier": ident})
    return {"token": create_token(user), "user": public_user(user)}


@router.post("/otp/send")
async def otp_send(body: OtpSend):
    check_phone_role(body.phone, body.role)
    return {"sent": True, "demo_otp": DEMO_OTP, "message": "Demo mode: use OTP 1234"}


@router.post("/otp/verify")
async def otp_verify(body: OtpVerify):
    check_phone_role(body.phone, body.role)
    if body.otp != DEMO_OTP:
        raise HTTPException(400, "Incorrect OTP")
    user = await db.users.find_one({"phone": body.phone, "role": body.role}, NOID)
    is_new = user is None
    if is_new:
        base = {"id": new_id("usr_"), "role": body.role, "phone": body.phone, "name": body.name or "",
                "avatar": None, "language": "en", "notifications": {"push": True, "sms": True, "offers": True},
                "wallet_balance": 0.0, "created_at": iso()}
        if body.role == "partner":
            base.update({"skills": [], "sub_skills": [], "city_id": "city_lucknow", "is_online": False,
                         "kyc_status": "not_submitted", "documents": {}, "cod_cash": 0.0, "cod_limit": 3000,
                         "rating": 0, "jobs_done": 0, "pending_earnings": 0.0, "consecutive_rejections": 0,
                         "location": {"lat": 26.8467, "lng": 80.9462},
                         "shift": {"start": "09:00", "end": "19:00", "off_days": ["Sun"]}, "bank": {}})
        await db.users.insert_one(dict(base))
        user = base
    return {"token": create_token(user), "user": public_user(user), "is_new": is_new}


@router.get("/me")
async def me(user: dict = Depends(get_current_user)):
    return user


@router.put("/me")
async def update_me(body: ProfileUpdate, user: dict = Depends(get_current_user)):
    upd = {k: v for k, v in body.model_dump().items() if v is not None}
    if upd:
        await db.users.update_one({"id": user["id"]}, {"$set": upd})
    return await db.users.find_one({"id": user["id"]}, {"_id": 0, "password_hash": 0})
