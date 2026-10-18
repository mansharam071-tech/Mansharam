# Auth Testing Playbook (HomeServe)
- Admin: POST /api/auth/admin/login {email, password} -> {token, user}. Bearer token in Authorization header (no cookies). 5 failed attempts -> 15 min lockout (login_attempts collection).
- Customer/Partner: POST /api/auth/otp/send {phone, role} then POST /api/auth/otp/verify {phone, otp:"1234", role} -> {token, user, is_new}.
- GET /api/auth/me with Bearer token returns user without password_hash.
- Role guard: customer token on /api/admin/* must return 403; partner token on /api/customer/* must return 403.
- Admin bcrypt hash in db.users (role admin) starts with $2b$.
