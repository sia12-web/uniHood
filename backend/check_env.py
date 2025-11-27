import os
from dotenv import load_dotenv

# Load .env file
load_dotenv()

# Check what POSTGRES_URL and DATABASE_URL are set to
print(f"POSTGRES_URL from env: {os.getenv('POSTGRES_URL')}")
print(f"DATABASE_URL from env: {os.getenv('DATABASE_URL')}")

# Now load settings
from app.settings import settings
print(f"settings.postgres_url: {settings.postgres_url}")
print(f"settings.postgres_ssl: {settings.postgres_ssl}")
