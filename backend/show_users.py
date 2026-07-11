from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
import database
import models

def print_all_users():
    # Bind to engine config from database.py
    engine = database.engine
    SessionLocal = sessionmaker(bind=engine)
    db = SessionLocal()
    
    try:
        users = db.query(models.User).all()
        print("\n=== REGISTERED DATABASE USERS ===")
        print(f"{'ID':<5} | {'Username':<15} | {'Role':<12} | {'Email':<20} | {'Password Hash (Bcrypt)':<30}")
        print("-" * 95)
        for u in users:
            email_val = u.email if hasattr(u, 'email') and u.email else "N/A"
            print(f"{u.id:<5} | {u.username:<15} | {u.role:<12} | {email_val:<20} | {u.password_hash[:30]}...")
        print("=================================\n")
    except Exception as e:
        print(f"Error querying users: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    print_all_users()
