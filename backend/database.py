from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

SQLALCHEMY_DATABASE_URL = "postgresql://postgres:6002@localhost:5432/healthiot"

engine = create_engine(
    SQLALCHEMY_DATABASE_URL  # <- use this variable, not DATABASE_URL
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()
