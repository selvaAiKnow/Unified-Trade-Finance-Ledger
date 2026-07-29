from fastapi import Depends
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session
from sqlalchemy.exc import OperationalError
from sqlalchemy.ext.declarative import declarative_base
from typing import Annotated
from urllib.parse import quote_plus
from .helpers.helper import get_env_value
import os

# Environment variables
host = get_env_value("HOST")
username = get_env_value("DB_USERNAME")
password = get_env_value("DB_PASSWORD")
database_name = get_env_value("DATABASE_NAME")

# URL encode the password
encoded_password = quote_plus(str(password))

# Construct the correct connection string
SQLALCHEMY_DATABASE_URL = f"postgresql://{username}:{encoded_password}@{host}:5432/{database_name}"

# Create the engine using SQLAlchemy
engine = create_engine(SQLALCHEMY_DATABASE_URL)

# Create a scoped session factory for managing database sessions
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Base model for declarative class definitions
Base = declarative_base()

# Create tables if they don't exist
Base.metadata.create_all(bind=engine)

# Function to test database connection
def test_db_connection():
    try:
        with engine.connect() as connection:
            print("Database connection successful.")
            return True
    except OperationalError as e:
        print("Database connection failed.")
        print(f"Error: {e}")
        return False

# Dependency to get the database session
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# Dependency injection for FastAPI
db_dependency = Annotated[Session, Depends(get_db)]

# Main block to test database connection
# if __name__ == "__main__":
    # test_db_connection()