import asyncio, os
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
load_dotenv("/app/backend/.env")

async def main():
    db = AsyncIOMotorClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]
    r = await db.users.update_many({"$or": [{"email": "admin@homeserve.in"}, {"phone": {"$in": ["9999999999", "9000000001"]}}]}, {"$set": {"language": "en"}})
    print("lang reset", r.modified_count)
    print("partner offline", (await db.users.update_one({"phone": "9000000001", "role": "partner"}, {"$set": {"is_online": False}})).matched_count)
    print("wallet", (await db.users.update_one({"id": "usr_demo_customer"}, {"$set": {"wallet_balance": 250}})).matched_count)
    print("txns deleted", (await db.wallet_txns.delete_many({"user_id": "usr_demo_customer"})).deleted_count)
    print("coupon deleted", (await db.coupons.delete_many({"code": "TESTHI10"})).deleted_count)
    for u in await db.users.find({"$or": [{"email": "admin@homeserve.in"}, {"phone": {"$in": ["9999999999", "9000000001"]}}]}, {"_id": 0, "phone": 1, "email": 1, "language": 1, "is_online": 1, "wallet_balance": 1, "role": 1}).to_list(10):
        print(u)

asyncio.run(main())
