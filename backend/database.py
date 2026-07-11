from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

# Toggle database configuration (True for PostgreSQL, False for local SQLite)
USE_POSTGRES = False

if USE_POSTGRES:
    # Connection URL format: postgresql://username:password@hostname:port/database_name
    DATABASE_URL = "postgresql://postgres:postgres123@localhost:5432/quantum_cryptography"
    engine = create_engine(DATABASE_URL)
else:
    DATABASE_URL = "sqlite:///./quantum.db"
    # connect_args={"check_same_thread": False} is required only for SQLite
    engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
