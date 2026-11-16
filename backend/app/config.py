"""
VERIDACT — Application Configuration
Cybersecurity Incident Reporting and Management System.
Reads all environment variables with sensible defaults.
"""
import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[1] / ".env")


# Application
APP_NAME = os.getenv("APP_NAME", "VERIDACT")
APP_VERSION = os.getenv("APP_VERSION", "1.0.0")
DEBUG = os.getenv("DEBUG", "true").lower() == "true"
ENVIRONMENT = os.getenv("ENVIRONMENT", "development")

# Server
HOST = os.getenv("HOST", "127.0.0.1")
PORT = int(os.getenv("PORT", "8000"))

# Database
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./veridact.db")

# JWT Authentication
JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY", "your_very_long_random_secret_key_change_this_before_use")
JWT_ALGORITHM = os.getenv("JWT_ALGORITHM", "HS256")
JWT_EXPIRE_HOURS = int(os.getenv("JWT_EXPIRE_HOURS", "8"))

# File Upload
UPLOAD_DIR = os.getenv("UPLOAD_DIR", "../uploads")
MAX_FILE_SIZE_MB = int(os.getenv("MAX_FILE_SIZE_MB", "100"))
ALLOWED_ORIGINS = os.getenv("ALLOWED_ORIGINS", "http://localhost:5173").split(",")
CLOUDINARY_URL = os.getenv("CLOUDINARY_URL", "").strip()
CLOUDINARY_URL_EXPIRY_SECONDS = int(os.getenv("CLOUDINARY_URL_EXPIRY_SECONDS", "900"))
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "").strip()
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-3.5-flash-lite").strip()
GEMINI_REQUEST_TIMEOUT_SECONDS = int(os.getenv("GEMINI_REQUEST_TIMEOUT_SECONDS", "60"))

# Report Generation
REPORT_DIR = os.getenv("REPORT_DIR", "../uploads/reports")

# Security
BCRYPT_ROUNDS = int(os.getenv("BCRYPT_ROUNDS", "12"))
RATE_LIMIT_CITIZEN_TRACK = os.getenv("RATE_LIMIT_CITIZEN_TRACK", "10/minute")

# Demo
AUTO_SEED_ON_STARTUP = os.getenv("AUTO_SEED_ON_STARTUP", "true").lower() == "true"
