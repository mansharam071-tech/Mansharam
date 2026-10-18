import os
import logging
from core import client
from fastapi import FastAPI
from starlette.middleware.cors import CORSMiddleware
from routes_auth import router as auth_router
from routes_customer import router as customer_router
from routes_partner import router as partner_router
from routes_admin import router as admin_router
from routes_payments import router as payments_router
from seed import seed_admin, seed_data, ensure_indexes

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")

app = FastAPI(title="HomeServe Common API", version="1.0")


@app.get("/api/")
async def root():
    return {"message": "HomeServe common API", "modules": ["customer", "partner", "admin"]}


for r in (auth_router, customer_router, partner_router, admin_router, payments_router):
    app.include_router(r)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup():
    await ensure_indexes()
    await seed_admin()
    await seed_data()


@app.on_event("shutdown")
async def shutdown():
    client.close()
