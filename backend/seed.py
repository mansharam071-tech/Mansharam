import os
import random
from datetime import timedelta
from core import db, now, iso, new_id, hash_password, verify_password, r2
from logic import finalize

IMG = {
    "cat_ac": "https://images.unsplash.com/photo-1621905251918-48416bd8575a?crop=entropy&cs=srgb&fm=jpg&w=800&q=80",
    "cat_clean": "https://images.unsplash.com/photo-1660330590022-9f4ff56b63f6?crop=entropy&cs=srgb&fm=jpg&w=800&q=80",
    "cat_elec": "https://images.unsplash.com/photo-1660330589693-99889d60181e?crop=entropy&cs=srgb&fm=jpg&w=800&q=80",
    "cat_plumb": "https://images.pexels.com/photos/7220892/pexels-photo-7220892.jpeg?auto=compress&cs=tinysrgb&w=800",
    "cat_salon": "https://images.pexels.com/photos/29555480/pexels-photo-29555480.jpeg?auto=compress&cs=tinysrgb&w=800",
    "cat_paint": "https://images.unsplash.com/photo-1688372199140-cade7ae820fe?crop=entropy&cs=srgb&fm=jpg&w=800&q=80",
    "cat_pest": "https://images.pexels.com/photos/4176541/pexels-photo-4176541.jpeg?auto=compress&cs=tinysrgb&w=800",
    "cat_appl": "https://images.unsplash.com/photo-1662220984920-3bd1f88e846f?crop=entropy&cs=srgb&fm=jpg&w=800&q=80",
}
AVATARS = [
    "https://images.unsplash.com/photo-1540569014015-19a7be504e3a?crop=entropy&cs=srgb&fm=jpg&w=200&q=80",
    "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?crop=entropy&cs=srgb&fm=jpg&w=200&q=80",
]

CATEGORIES = [
    ("cat_ac", "AC Repair", "AirVent"), ("cat_clean", "Cleaning", "Sparkles"),
    ("cat_elec", "Electrician", "Zap"), ("cat_plumb", "Plumbing", "Wrench"),
    ("cat_salon", "Salon", "Scissors"), ("cat_paint", "Painting", "PaintRoller"),
    ("cat_pest", "Pest Control", "Bug"), ("cat_appl", "Appliance Repair", "WashingMachine"),
]

S = lambda id_, cat, name, price, mins, rating, rc, inc, exc, addons, trending=False: {
    "id": id_, "category_id": cat, "name": name, "price": price, "duration_min": mins, "rating": rating,
    "reviews_count": rc, "inclusions": inc, "exclusions": exc, "trending": trending, "image": IMG[cat],
    "addons": [{"id": f"{id_}_a{i}", "name": n, "price": p} for i, (n, p) in enumerate(addons)],
    "reviews": [{"name": "Priya M.", "rating": 5, "text": "On time, neat and professional."},
                {"name": "Rahul S.", "rating": 4, "text": "Good work, fair pricing."}],
}

SERVICES = [
    S("serv_ac_01", "cat_ac", "AC Service & Repair (Split/Window)", 549, 60, 4.8, 12840,
      ["Jet-pump filter & coil cleaning", "Cooling & gas pressure check", "Drain pipe flush", "30-day service warranty"],
      ["Gas refill (available as add-on)", "Spare parts cost", "Wall/stand mounting"],
      [("Gas Refill (R32/R22)", 1499), ("Anti-rust Coil Coating", 299)], True),
    S("serv_ac_02", "cat_ac", "AC Installation / Uninstallation", 1199, 90, 4.7, 5210,
      ["Indoor & outdoor unit fitting", "Vacuum & leak test", "Up to 3 ft copper pipe"],
      ["Extra copper pipe", "Stand / bracket", "Civil work"], [("Extra Copper Pipe (per ft)", 250)]),
    S("serv_clean_02", "cat_clean", "Full Home Deep Cleaning", 899, 240, 4.8, 9870,
      ["Kitchen & bathroom degreasing", "Floor scrubbing & mopping", "Fan, window & switchboard wiping", "Eco-safe chemicals"],
      ["Wall washing", "Carpet shampoo", "Balcony pressure wash"], [("Sofa Shampoo (5 seats)", 599), ("Fridge Cleaning", 249)], True),
    S("serv_clean_03", "cat_clean", "Bathroom Intense Cleaning", 449, 75, 4.7, 7420,
      ["Tile & grout scrubbing", "Hard-water stain removal", "Fixture polishing"],
      ["Tile replacement", "Plumbing repairs"], [("Exhaust Fan Cleaning", 99)]),
    S("serv_elec_01", "cat_elec", "Fan / Light Installation & Repair", 149, 30, 4.7, 15320,
      ["Fault diagnosis", "Installation of fan or light", "Safety check of wiring point"],
      ["New fan / light cost", "Concealed wiring"], [("Regulator Replacement", 199)], True),
    S("serv_elec_02", "cat_elec", "Switchboard & Wiring Repair", 199, 45, 4.6, 8110,
      ["Switch & socket repair", "MCB check", "Loose connection fix"], ["Full house rewiring"], [("New Modular Switch", 89)]),
    S("serv_plumb_01", "cat_plumb", "Tap, Leak & Blockage Fix", 199, 45, 4.7, 11030,
      ["Leak detection", "Tap / washer replacement", "Drain unclogging"], ["Pipe replacement > 2 ft", "Spare parts cost"],
      [("New Tap Fitting", 349)], True),
    S("serv_plumb_02", "cat_plumb", "Water Tank Cleaning", 599, 90, 4.6, 3980,
      ["Sludge removal", "Anti-bacterial wash", "UV treatment"], ["Tank repair"], [("Second Tank", 399)]),
    S("serv_salon_01", "cat_salon", "Haircut & Grooming at Home", 399, 45, 4.8, 21300,
      ["Haircut by certified stylist", "Beard trim & styling", "Disposable kit"], ["Hair colour"], [("Head Massage (15 min)", 199)], True),
    S("serv_salon_02", "cat_salon", "Facial & Cleanup", 799, 60, 4.7, 9650,
      ["Skin analysis", "Cleanup + facial", "Single-use products"], ["Bridal makeup"], [("De-tan Pack", 299)]),
    S("serv_paint_01", "cat_paint", "Room Painting (1 BHK wall)", 2999, 480, 4.6, 1840,
      ["Wall putty touch-up", "2 coats premium emulsion", "Furniture covering & cleanup"], ["Texture / wallpaper", "Waterproofing"],
      [("Ceiling Painting", 999)]),
    S("serv_pest_01", "cat_pest", "Cockroach & Ant Control", 699, 60, 4.7, 6720,
      ["Odourless gel treatment", "Kitchen & bathroom coverage", "90-day warranty"], ["Termite treatment"], [("Bed Bug Spray", 499)]),
    S("serv_appl_01", "cat_appl", "Washing Machine Repair", 299, 60, 4.6, 7300,
      ["Diagnosis & visit", "Minor repairs", "Drum & motor check"], ["Spare parts cost"], [("Inlet Pipe Replacement", 199)], True),
    S("serv_appl_02", "cat_appl", "Refrigerator Repair", 349, 60, 4.6, 5100,
      ["Cooling diagnosis", "Thermostat check", "Minor repairs"], ["Compressor replacement"], [("Gas Charging", 1799)]),
]


def poly(lat, lng, d=0.06):
    return [[lat + d, lng - d], [lat + d * 0.8, lng + d], [lat - d * 0.7, lng + d * 1.1], [lat - d, lng - d * 0.6]]


CITIES = [
    {"id": "city_lucknow", "city_name": "Lucknow", "state": "Uttar Pradesh", "is_active": True,
     "pincodes": ["226001", "226010", "226016"], "center": {"lat": 26.8467, "lng": 80.9462},
     "surge_pricing": {"is_active": True, "multiplier": 1.2, "reason": "Rain / Peak Demand"},
     "assigned_services": [{"service_id": "serv_ac_01", "city_price": 499}, {"service_id": "serv_clean_02", "city_price": 799}]},
    {"id": "city_delhi", "city_name": "New Delhi", "state": "Delhi", "is_active": True,
     "pincodes": ["110001", "110016", "110019"], "center": {"lat": 28.6139, "lng": 77.2090},
     "surge_pricing": {"is_active": False, "multiplier": 1.0, "reason": ""},
     "assigned_services": [{"service_id": "serv_ac_01", "city_price": 599}, {"service_id": "serv_clean_02", "city_price": 999}]},
    {"id": "city_bengaluru", "city_name": "Bengaluru", "state": "Karnataka", "is_active": True,
     "pincodes": ["560001", "560034", "560102"], "center": {"lat": 12.9716, "lng": 77.5946},
     "surge_pricing": {"is_active": False, "multiplier": 1.0, "reason": ""},
     "assigned_services": [{"service_id": "serv_ac_01", "city_price": 579}]},
]

ALL_DOCS = ["aadhaar", "pan", "dl", "police"]


def docs(status, dl_days=400, police_days=300, numbers=True):
    d = {}
    for t in ALL_DOCS:
        exp = None
        if t == "dl":
            exp = (now() + timedelta(days=dl_days)).strftime("%Y-%m-%d")
        if t == "police":
            exp = (now() + timedelta(days=police_days)).strftime("%Y-%m-%d")
        d[t] = {"number": {"aadhaar": "XXXX-XXXX-4821", "pan": "ABCPK1234F", "dl": "UP32-2019-0045123",
                           "police": "PVC/LKO/88213"}[t] if numbers else "",
                "expiry_date": exp, "status": status, "note": "", "has_file": False, "uploaded_at": iso()}
    return d


def partner(pid, phone, name, skills, city, online, cod=0, rej=0, kyc="approved", dl_days=400, avatar=0):
    c = next(x for x in CITIES if x["id"] == city)["center"]
    return {"id": pid, "role": "partner", "phone": phone, "name": name, "avatar": AVATARS[avatar % 2],
            "skills": skills, "sub_skills": [], "city_id": city, "is_online": online, "kyc_status": kyc,
            "documents": docs("approved" if kyc == "approved" else "pending", dl_days=dl_days),
            "cod_cash": cod, "cod_limit": 3000, "rating": 4.7, "jobs_done": 0, "wallet_balance": 0.0,
            "pending_earnings": 0.0, "consecutive_rejections": rej,
            "location": {"lat": c["lat"] + random.uniform(-0.02, 0.02), "lng": c["lng"] + random.uniform(-0.02, 0.02)},
            "shift": {"start": "09:00", "end": "19:00", "off_days": ["Sun"]},
            "bank": {"holder": name, "account_no": "XXXXXX" + phone[-4:], "ifsc": "SBIN0001234", "bank_name": "State Bank of India"},
            "created_at": iso()}


async def seed_admin():
    email = os.environ["ADMIN_EMAIL"].lower()
    pw = os.environ["ADMIN_PASSWORD"]
    ex = await db.users.find_one({"email": email})
    if not ex:
        await db.users.insert_one({"id": new_id("usr_"), "role": "admin", "email": email, "name": "Ops Admin",
                                   "password_hash": hash_password(pw), "created_at": iso()})
    elif not verify_password(pw, ex["password_hash"]):
        await db.users.update_one({"email": email}, {"$set": {"password_hash": hash_password(pw)}})


def make_booking(cust, prt, lines, addr, city, status, created, rating=None, method="upi"):
    sub = r2(sum(l["line_total"] for l in lines))
    mult = city["surge_pricing"]["multiplier"] if city["surge_pricing"]["is_active"] else 1.0
    p = finalize({"subtotal": sub, "surge_multiplier": mult, "surge_amount": r2(sub * (mult - 1)), "discount": 0,
                  "coupon_code": None, "extras_total": 0})
    rate = 0.18
    b = {"id": new_id("bk_"), "booking_no": f"HS{random.randint(100000, 999999)}", "customer_id": cust["id"],
         "partner_id": prt["id"] if prt and status != "pending" else None, "lines": lines,
         "category_ids": list({l["category_id"] for l in lines}), "address": addr, "city_id": city["id"],
         "city_name": city["city_name"], "mode": "instant", "slot_date": created[:10], "slot_time": "ASAP (30-45 min)",
         "pricing": p, "payment_method": method, "payment_status": "paid" if method != "cod" or status == "completed" else "pending",
         "amount_paid": p["total"] if method != "cod" or status == "completed" else 0, "status": status,
         "start_otp": f"{random.randint(1000, 9999)}", "end_otp": f"{random.randint(1000, 9999)}", "extras": [],
         "timeline": [{"status": "pending", "at": created}], "rating": rating, "review": None, "tip": 0,
         "commission_rate": rate, "commission": r2(p["taxable"] * rate), "partner_earning": r2(p["taxable"] * (1 - rate)),
         "invoice_no": f"GST/{created[:4]}/{random.randint(10000, 99999)}" if status == "completed" else None,
         "offered_to": None, "rejected_by": [], "settlement_id": None, "created_at": created,
         "completed_at": created if status == "completed" else None, "partner_origin": prt["location"] if prt else None,
         "en_route_at": iso(now() - timedelta(seconds=60)) if status == "en_route" else None,
         "arrived_at": created if status == "in_progress" else None}
    return b


async def seed_data():
    if await db.categories.count_documents({}) > 0:
        return
    random.seed(7)
    await db.categories.insert_many([{"id": i, "name": n, "icon": ic, "image": IMG[i], "order": k}
                                     for k, (i, n, ic) in enumerate(CATEGORIES)])
    await db.services.insert_many([dict(s) for s in SERVICES])
    for c in CITIES:
        await db.cities.insert_one({**c, "polygon": poly(c["center"]["lat"], c["center"]["lng"]), "created_at": iso()})
    await db.surge_rules.insert_many([
        {"id": "surge_peak", "name": "Evening Peak Hours", "trigger": "peak_hours", "multiplier": 1.3, "city_id": "all",
         "start_hour": 18, "end_hour": 21, "is_active": True, "created_at": iso()},
        {"id": "surge_rain", "name": "Monsoon Rain Surge", "trigger": "weather", "multiplier": 1.5, "city_id": "city_lucknow",
         "weather": "Rain", "is_active": False, "created_at": iso()},
        {"id": "surge_demand", "name": "High Demand – Saket Zone", "trigger": "high_demand", "multiplier": 1.2,
         "city_id": "city_delhi", "is_active": False, "created_at": iso()},
    ])
    await db.coupons.insert_many([
        {"id": "cpn_first50", "code": "FIRST50", "description": "50% off up to ₹100 on your first booking",
         "discount_type": "percent", "value": 50, "max_discount": 100, "min_order": 0,
         "city_ids": ["city_lucknow", "city_delhi"], "category_ids": [], "usage_limit": 1000, "used_count": 128,
         "first_order_only": True, "valid_till": "2027-12-31", "is_active": True, "created_at": iso()},
        {"id": "cpn_save100", "code": "SAVE100", "description": "Flat ₹100 off on orders above ₹999",
         "discount_type": "flat", "value": 100, "max_discount": None, "min_order": 999, "city_ids": [], "category_ids": [],
         "usage_limit": 5000, "used_count": 412, "first_order_only": False, "valid_till": "2027-12-31", "is_active": True,
         "created_at": iso()},
        {"id": "cpn_acfest", "code": "ACFEST", "description": "20% off up to ₹300 on AC services",
         "discount_type": "percent", "value": 20, "max_discount": 300, "min_order": 0, "city_ids": [],
         "category_ids": ["cat_ac"], "usage_limit": 2000, "used_count": 77, "first_order_only": False,
         "valid_till": "2027-12-31", "is_active": True, "created_at": iso()},
    ])
    await db.banners.insert_many([
        {"id": "bn1", "title": "50% OFF your first booking", "subtitle": "Use code FIRST50 · up to ₹100", "code": "FIRST50",
         "image": IMG["cat_clean"], "category_id": "cat_clean"},
        {"id": "bn2", "title": "Summer-ready AC service", "subtitle": "20% off with ACFEST", "code": "ACFEST",
         "image": IMG["cat_ac"], "category_id": "cat_ac"},
        {"id": "bn3", "title": "Salon at home from ₹399", "subtitle": "Certified stylists, single-use kits", "code": None,
         "image": IMG["cat_salon"], "category_id": "cat_salon"},
    ])
    await db.settings.insert_one({"id": "commission", "default_rate": 0.18,
                                  "category_rates": {"cat_salon": 0.20, "cat_paint": 0.15, "cat_ac": 0.18}})

    lko = CITIES[0]
    demo_c = {"id": "usr_demo_customer", "role": "customer", "phone": "9999999999", "name": "Aarav Sharma",
              "email": "aarav@example.com", "avatar": None, "language": "en",
              "notifications": {"push": True, "sms": True, "offers": True}, "wallet_balance": 250.0, "created_at": iso()}
    customers = [demo_c] + [{"id": f"usr_c{i}", "role": "customer", "phone": f"98000000{i:02d}", "name": n, "wallet_balance": 0.0,
                             "language": "en", "notifications": {"push": True, "sms": True, "offers": True}, "created_at": iso()}
                            for i, n in enumerate(["Meera Iyer", "Kabir Mehta", "Sana Ali", "Rohan Das", "Ishita Rao"], 1)]
    await db.users.insert_many([dict(c) for c in customers])
    home = {"id": "addr_demo_home", "user_id": demo_c["id"], "label": "Home", "line": "B-14, Hazratganj, Lucknow",
            "pincode": "226001", "city": "Lucknow", "location": {"lat": 26.8505, "lng": 80.9462}, "audio_note": None,
            "landmark": "Opposite Sahu Cinema", "is_default": True, "created_at": iso()}
    office = {"id": "addr_demo_office", "user_id": demo_c["id"], "label": "Office", "line": "Summit Building, Vibhuti Khand, Gomti Nagar",
              "pincode": "226010", "city": "Lucknow", "location": {"lat": 26.8636, "lng": 81.0030}, "audio_note": None,
              "landmark": "3rd floor, Tower B", "is_default": False, "created_at": iso()}
    await db.addresses.insert_many([dict(home), dict(office)])

    core_skills = ["cat_ac", "cat_clean", "cat_elec", "cat_plumb", "cat_appl"]
    partners = [
        partner("usr_demo_partner", "9000000001", "Ramesh Kumar", core_skills, "city_lucknow", False, cod=1200, dl_days=20),
        partner("usr_p2", "9000000002", "Suresh Yadav", ["cat_ac", "cat_elec"], "city_lucknow", True, cod=3450, avatar=1),
        partner("usr_p3", "9000000003", "Imran Khan", ["cat_plumb", "cat_clean"], "city_lucknow", True, rej=4),
        partner("usr_p4", "9000000004", "Pooja Verma", ["cat_salon"], "city_lucknow", True, avatar=1),
        partner("usr_p5", "9000000005", "Vikram Singh", core_skills, "city_delhi", True),
        partner("usr_p6", "9000000006", "Anil Gupta", ["cat_paint", "cat_pest"], "city_lucknow", False, kyc="pending"),
        partner("usr_p7", "9000000007", "Neha Singh", ["cat_salon"], "city_delhi", False, kyc="pending", avatar=1),
    ]
    await db.users.insert_many([dict(p) for p in partners])
    await db.penalties.insert_many([
        {"id": new_id("pen_"), "partner_id": "usr_demo_partner", "amount": 50, "reason": "Late arrival (> 20 min)",
         "settled": False, "created_at": iso(now() - timedelta(days=2))},
        {"id": new_id("pen_"), "partner_id": "usr_p3", "amount": 50, "reason": "Consecutive job rejections",
         "settled": False, "created_at": iso(now() - timedelta(days=1))},
    ])

    svc = {s["id"]: s for s in SERVICES}
    cat_name = {i: n for i, n, _ in CATEGORIES}

    def line(sid, qty=1):
        s = svc[sid]
        price = next((a["city_price"] for a in lko["assigned_services"] if a["service_id"] == sid), s["price"])
        return {"service_id": sid, "name": s["name"], "category_id": s["category_id"], "category_name": cat_name[s["category_id"]],
                "image": s["image"], "qty": qty, "unit_price": price, "addons": [], "line_total": price * qty}

    approved_lko = [p for p in partners if p["kyc_status"] == "approved" and p["city_id"] == "city_lucknow"]
    bookings = []
    for day in range(13, -1, -1):
        for _ in range(random.randint(6, 13) if day else 5):
            created = iso(now() - timedelta(days=day, hours=random.randint(0, 9), minutes=random.randint(0, 59)))
            sid = random.choice(list(svc))
            cat = svc[sid]["category_id"]
            cands = [p for p in approved_lko if cat in p["skills"]] or approved_lko
            prt = random.choice(cands)
            if random.random() < 0.45 and cat in core_skills:
                prt = partners[0]
            status = "cancelled" if random.random() < 0.08 else "completed"
            rating = random.choice([5, 5, 4, 5, 4, 3]) if status == "completed" else None
            if status == "completed" and day <= 3 and random.random() < 0.12:
                rating = random.choice([1, 2])
            addr = {**home, "user_id": None} if random.random() < 0.3 else {**office, "user_id": None}
            b = make_booking(random.choice(customers), prt, [line(sid, random.choice([1, 1, 2]))], addr, lko, status, created,
                             rating, random.choice(["upi", "upi", "card", "cod", "wallet"]))
            if day >= 7 and status == "completed":
                b["settlement_id"] = "legacy"
            bookings.append(b)
    live = [("serv_ac_01", partners[1], "en_route"), ("serv_plumb_01", partners[2], "in_progress"),
            ("serv_elec_01", partners[1], "assigned"), ("serv_salon_01", None, "pending"), ("serv_paint_01", None, "pending")]
    for sid, prt, st in live:
        bookings.append(make_booking(customers[random.randint(1, 5)], prt, [line(sid)], {**office, "user_id": None}, lko, st,
                                     iso(now() - timedelta(minutes=random.randint(5, 40))), method="cod" if st == "pending" else "upi"))
    await db.bookings.insert_many(bookings)
    for p in partners:
        done = [b for b in bookings if b["partner_id"] == p["id"] and b["status"] == "completed"]
        pend = sum(b["partner_earning"] for b in done if not b["settlement_id"])
        await db.users.update_one({"id": p["id"]}, {"$set": {"jobs_done": len(done), "pending_earnings": r2(pend),
                                                             "wallet_balance": 1850.0 if p["id"] == "usr_demo_partner" else 0.0}})
    from logic import refresh_partner_rating
    for p in partners:
        await refresh_partner_rating(p["id"])


async def ensure_indexes():
    await db.users.create_index("id", unique=True)
    await db.users.create_index([("phone", 1), ("role", 1)])
    await db.bookings.create_index("id", unique=True)
    await db.bookings.create_index([("status", 1), ("created_at", 1)])
    await db.bookings.create_index("customer_id")
    await db.bookings.create_index("partner_id")
    await db.login_attempts.create_index("identifier")
