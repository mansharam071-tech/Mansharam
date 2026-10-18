# HomeServe – Home Service Application Ecosystem (PRD)

## Original problem statement
Act as a Senior Full-Stack Mobile & Web Application Architect. Build a comprehensive, enterprise-grade "Home Service Application Ecosystem" comprising three core modules: Customer App (OTP login, GPS/address manager with audio landmark notes, discovery + multi-service cart, service details & slot booking, live tracking with real-time extra charge approval, start/end OTP, payments/wallet/cancellation/GST invoices, history/rating/tip/support), Partner App (OTP + KYC docs with expiry tracking, skills, bank, shifts, online/offline, COD threshold ₹3000, 15-sec incoming job modal, calendar, 4-step job execution with extras & OTPs, earnings bar chart, withdraw, commission/penalty, SOS), Admin Panel (240px sidebar + header; KPIs, charts, fraud alerts; polygon geofencing + pincode chips + CSV; city launch modal; surge rules; coupon engine; live bookings table + re-assignment; KYC queue; commission 15–20%; weekly settlements + GST invoices). Colors #1E3A8A / #F59E0B / #22C55E / #EAB308 / #EF4444 / #F8FAFC / #0F172A; Inter/Roboto. City config JSON sample (Lucknow, pincodes, surge_pricing, assigned_services). "iska comon database aur api banao" (make a common database and API for it).

User choices: all 3 modules on web (customer & partner as mobile-style phone-frame web screens); Demo OTP 1234; OpenStreetMap/Leaflet; mock UPI/Card with real wallet + COD logic; seeded admin email+password JWT.

## Architecture
- Backend: FastAPI + MongoDB (single common DB/API). Files: core.py (db, JWT, role guard), logic.py (pricing, surge, coupons, GST, pull-dispatch, live location interpolation), routes_auth/customer/partner/admin.py, seed.py.
- Collections: users (admin/customer/partner), addresses, categories, services, cities, surge_rules, coupons, banners, carts, bookings, wallet_txns, messages, tickets, penalties, payouts, settlements, sos_alerts, kyc_files, settings, counters, login_attempts, attendance, cod_remittances.
- Frontend: React + Tailwind + shadcn + Recharts + react-leaflet. Routes: / (portal), /app/* (customer), /partner/*, /admin/*. Tokens per role in localStorage (hs_customer/hs_partner/hs_admin).

## User personas
Customer (books home services), Partner/technician (executes jobs), Ops admin (manages cities, pricing, partners, finance).

## Implemented (2026-10-18) — iteration 3
- Hindi admin panel (frontend/src/lib/i18n_admin.js + toggle in the admin profile menu; saved on the admin user).
- Dates and calendars follow the active locale: getLocale() → hi-IN / en-IN, used by fmtDT/fmtDate, checkout date chips, partner calendar month title and weekday headers, and chart axis labels. Brand text is opted out with translate="no".
- Demo customer wallet reset to ₹250 with no transactions.
- Testing iteration_3: frontend ~95%, all requested flows pass; review fixes applied afterwards.

## Implemented (2026-10-18) — iteration 2
- Razorpay Standard Checkout (backend/routes_payments.py + frontend/src/lib/razorpay.js): UPI/Card bookings, wallet top-up and post-job balance for approved extras. Server-side order creation, HMAC signature verification, idempotent fulfilment, cancel on dismiss/failure, optional webhook (RAZORPAY_WEBHOOK_SECRET), refund to wallet if a payment lands after cancellation. Bookings stay `payment_pending` until verified, and only then can they be dispatched.
- Keys are read from RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET in backend/.env. They are currently EMPTY, so the app automatically falls back to demo payments and checkout shows a "Demo payment mode" note.
- Hindi interface (frontend/src/lib/i18n.js): a dictionary plus patterns, applied through a MutationObserver when user.language === "hi". Covers the customer and partner apps (partner language selector added in KYC & Profile). Noto Sans Devanagari font added. Admin stays English.
- Testing iteration_2: backend 59/59, frontend ~95%; post-test fixes applied (cancel stale payment_pending bookings, late-capture refund, more Hindi strings, nav/Apply wrapping).

## Implemented (2026-10-18)
- All modules and flows above working end-to-end (testing agent iteration_1: backend 44/44, frontend ~95%).
- Post-test fixes: brute-force lockout keyed on email, decline validates offer, prepaid extras balance collected (wallet debit), coupon usage restored on cancel, settlement period from earliest job, candidates exclude nameless partners, expiring approved DL/Police can be re-uploaded, city delete clears selection, bookings search stale-response guard, location sheet inside phone frame, negative ₹ formatting.

## Mocked
OTP fixed 1234; UPI/Card payments simulated; masked calling returns placeholder number; chatbot rule-based; seller GSTIN/address are placeholders.

## Backlog
- P1: Real SMS OTP (Twilio), real payments (Razorpay/Stripe), WebSocket push instead of polling, object storage for KYC files/audio notes.
- P2: shadcn Select/Calendar instead of native selects/date inputs; AlertDialog for cancel confirm; settlement netting with COD cash; CORS explicit origins; push notifications.

## Next tasks
- Real payment gateway + SMS OTP when user is ready; Hindi UI translation.
