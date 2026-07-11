from sqlalchemy import Column, Integer, String, ForeignKey, DateTime, Text, Boolean
from sqlalchemy.orm import relationship
from datetime import datetime
from database import Base

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True, nullable=False)
    password_hash = Column(String, nullable=False)
    role = Column(String, default="user", nullable=False)  # admin, user, guest, organization
    full_name = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # 2FA & Security Columns
    two_factor_enabled = Column(Boolean, default=False, nullable=False)
    otp_secret = Column(String, nullable=True)
    failed_login_attempts = Column(Integer, default=0, nullable=False)
    locked_until = Column(DateTime, nullable=True)
    organization_id = Column(String, nullable=True)
    subscription_tier = Column(String, default="free", nullable=False)  # free, pro, enterprise
    subscription_expires_at = Column(DateTime, nullable=True)
    last_login = Column(DateTime, nullable=True)  # Store previous login date/time
    email = Column(String, unique=True, nullable=True)

    # Relationships
    files = relationship("EncryptedFile", back_populates="owner", cascade="all, delete-orphan")
    logs = relationship("AuditLog", back_populates="user")
    login_history = relationship("LoginHistory", back_populates="user", cascade="all, delete-orphan")

class EncryptedFile(Base):
    __tablename__ = "encrypted_files"

    id = Column(Integer, primary_key=True, index=True)
    filename = Column(String, nullable=False)
    ciphertext = Column(Text, nullable=False)  # Base64 ciphertext
    quantum_key = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    owner_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    
    # Advanced metadata
    tags = Column(String, default="", nullable=False)  # comma-separated tags
    is_favorite = Column(Boolean, default=False, nullable=False)
    expires_at = Column(DateTime, nullable=True)
    parent_folder = Column(String, default="/", nullable=False)
    version = Column(Integer, default=1, nullable=False)
    file_hash = Column(String, nullable=True)  # SHA-256 integrity hash
    sharing_password = Column(String, nullable=True)
    sharing_expires_at = Column(DateTime, nullable=True)
    # PQC Dilithium Signature fields
    pqc_signature = Column(String, nullable=True)   # Simulated Dilithium signature of ciphertext hash
    pqc_public_key = Column(String, nullable=True)  # Simulated public key for verification

    # Relationships
    owner = relationship("User", back_populates="files")

class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    action = Column(String, nullable=False)  # login, simulation, file_upload, etc.
    details = Column(String, nullable=False)
    timestamp = Column(DateTime, default=datetime.utcnow)

    # Relationships
    user = relationship("User", back_populates="logs")

class LoginHistory(Base):
    __tablename__ = "login_history"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    login_time = Column(DateTime, default=datetime.utcnow, nullable=False)
    logout_time = Column(DateTime, nullable=True)
    ip_address = Column(String, nullable=True)
    device = Column(String, nullable=True)
    status = Column(String, nullable=False)  # success, failed

    user = relationship("User", back_populates="login_history")
