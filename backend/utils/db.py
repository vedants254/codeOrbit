from motor.motor_asyncio import AsyncIOMotorClient
from beanie import init_beanie
from dotenv import load_dotenv
import os
import logging

# import all your Beanie models here
from models.user import User  
from models.repository import Repository 
from models.chat import Conversation, ChatSession, UserApiKey

# Singleton for the database client
client: AsyncIOMotorClient = None

# Set up logger
logger = logging.getLogger("db")
logger.setLevel(logging.INFO)
handler = logging.StreamHandler()
formatter = logging.Formatter("[%(asctime)s] [%(levelname)s] - %(message)s")
handler.setFormatter(formatter)
logger.addHandler(handler)

load_dotenv()

# Singleton for the database client
client: AsyncIOMotorClient = None

class Database:
    def __init__(self):
        self.client: AsyncIOMotorClient = None

    async def init_db(self):
        if self.client is None:
            try:
                mongo_uri = os.getenv("MONGO_URI", "mongodb://localhost:27017")
                print(f"Connecting to MongoDB at {mongo_uri}...")
                db_name = os.getenv("MONGODB_DB_NAME", "default_db")
                self.client = AsyncIOMotorClient(mongo_uri)
                await init_beanie(database=self.client[db_name], document_models=[User, Repository, Conversation, ChatSession, UserApiKey])
                logger.info("✅ Connected to MongoDB and initialized Beanie.")
            except Exception as e:
                logger.error(f"❌ Failed to initialize database: {e}")
        else:
            logger.info("ℹ️ Database already initialized, skipping.")

    async def close_db(self):
        if self.client:
            self.client.close()
            logger.info("✅ Closed MongoDB connection.")
        else:
            logger.warning("ℹ️ No MongoDB connection to close.")

# Create a singleton instance
db_instance = Database()