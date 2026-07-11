import asyncio
import contextlib
import numpy as np
from fastapi import FastAPI, HTTPException, Depends, status, UploadFile, File, Form, WebSocket, WebSocketDisconnect, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel, Field
from typing import List, Dict, Any, Optional
import base64
import hashlib
import os
import shutil
import time
import random
from datetime import datetime, timedelta
from jose import jwt, JWTError
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
from cryptography.hazmat.primitives import padding as aes_padding
from cryptography.hazmat.backends import default_backend

from sqlalchemy.orm import Session
from database import engine, Base, get_db
import models
from auth import (
    get_password_hash,
    verify_password,
    create_access_token,
    get_current_user,
    RoleChecker,
    SECRET_KEY,
    ALGORITHM
)

def get_optional_current_user(
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db)
) -> models.User:
    guest_user = db.query(models.User).filter(models.User.username == "guest").first()
    if not authorization:
        return guest_user
    try:
        parts = authorization.split(" ")
        if len(parts) != 2 or parts[0].lower() != "bearer":
            return guest_user
        token = parts[1]
        if token == "guest-token":
            return guest_user
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username:
            user = db.query(models.User).filter(models.User.username == username).first()
            if user:
                return user
    except Exception:
        pass
    return guest_user

# Initialize database tables
Base.metadata.create_all(bind=engine)

# Seed default users on startup (modern lifespan handler)
def _seed_data():
    db = next(get_db())
    try:
        user_count = db.query(models.User).count()
        if user_count == 0:
            admin_user = models.User(
                username="admin",
                password_hash=get_password_hash("admin123"),
                role="admin",
                full_name="Portal Administrator",
                subscription_tier="enterprise"
            )
            regular_user = models.User(
                username="user",
                password_hash=get_password_hash("user123"),
                role="user",
                full_name="Quantum Operator",
                subscription_tier="free"
            )
            guest_user = models.User(
                username="guest",
                password_hash=get_password_hash("guest123"),
                role="guest",
                full_name="Visant Guest",
                subscription_tier="free"
            )
            org_user = models.User(
                username="orgadmin",
                password_hash=get_password_hash("org123"),
                role="organization",
                full_name="Organization Manager",
                organization_id="ORG-983",
                subscription_tier="enterprise"
            )
            db.add_all([admin_user, regular_user, guest_user, org_user])
            db.commit()
            log = models.AuditLog(
                action="system_seed",
                details="Initial default accounts created: admin, user, guest, organization manager."
            )
            db.add(log)
            db.commit()
    except Exception as e:
        print(f"Error seeding database: {e}")
    finally:
        db.close()

@contextlib.asynccontextmanager
async def lifespan(app_instance):
    """FastAPI lifespan: seed DB on startup."""
    _seed_data()
    yield

app = FastAPI(title="Quantum Cryptography Enterprise Portal API", lifespan=lifespan)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Pydantic Schemas
class SimulationConfig(BaseModel):
    key_length: int = Field(default=32, ge=8, le=256)
    noise_level: float = Field(default=0.0, ge=0.0, le=1.0)
    eavesdropper: bool = Field(default=False)
    simulator_mode: str = Field(default="numerical") # numerical or qiskit

class UserRegister(BaseModel):
    username: str = Field(..., min_length=3, max_length=50)
    password: str = Field(..., min_length=6)
    full_name: Optional[str] = None
    organization_id: Optional[str] = None

class UserLogin(BaseModel):
    username: str
    password: str
    otp_code: Optional[str] = None

class UserProfileUpdate(BaseModel):
    full_name: Optional[str] = None
    password: Optional[str] = None
    organization_id: Optional[str] = None

class EncryptRequest(BaseModel):
    message: str
    quantum_key: str

class DecryptRequest(BaseModel):
    ciphertext: str
    quantum_key: str
    signature: Optional[str] = None
    public_key: Optional[str] = None

class Setup2FAVerify(BaseModel):
    token: str

class ShareFileRequest(BaseModel):
    password: Optional[str] = None
    expiry_hours: Optional[int] = None

class SignMessageRequest(BaseModel):
    message: str

class VerifySignatureRequest(BaseModel):
    message: str
    signature: str
    public_key: str

# ----------------- SECURITY HELPERS -----------------
def verify_totp(secret: str, code: str) -> bool:
    """Helper to verify a custom TOTP token from a secret key using timestamps."""
    time_block = int(time.time() / 30)
    for offset in [-1, 0, 1]:
        h = hashlib.sha256(f"{secret}-{time_block + offset}".encode('utf-8')).hexdigest()
        generated_code = str(int(h, 16) % 1000000).zfill(6)
        if generated_code == code:
            return True
    return False

def get_polarization(bit: int, basis: int) -> str:
    # Bases: 0 = Rectilinear (+), 1 = Diagonal (x)
    if basis == 0:
        return "→" if bit == 0 else "↑"
    else:
        return "↗" if bit == 0 else "↖"

def measure_qubit(alice_bit: int, alice_basis: int, measurement_basis: int, noise_level: float) -> int:
    if np.random.random() < noise_level:
        return np.random.randint(0, 2)
    if alice_basis == measurement_basis:
        return alice_bit
    else:
        return np.random.randint(0, 2)

def derive_key_stream(quantum_key: str, length: int) -> bytes:
    key_bytes = quantum_key.encode('utf-8')
    key_stream = b''
    counter = 0
    while len(key_stream) < length:
        h = hashlib.sha256(key_bytes + f"-{counter}".encode('utf-8'))
        key_stream += h.digest()
        counter += 1
    return key_stream[:length]

def derive_aes_key(quantum_key: str) -> bytes:
    """Derive a 256-bit AES key from the quantum key using SHA-256."""
    return hashlib.sha256(quantum_key.encode('utf-8')).digest()

def aes_encrypt(plaintext: bytes, quantum_key: str) -> bytes:
    """Encrypt plaintext using AES-256-CBC. Returns IV (16 bytes) + ciphertext."""
    aes_key = derive_aes_key(quantum_key)
    iv = os.urandom(16)
    padder = aes_padding.PKCS7(128).padder()
    padded = padder.update(plaintext) + padder.finalize()
    cipher = Cipher(algorithms.AES(aes_key), modes.CBC(iv), backend=default_backend())
    encryptor = cipher.encryptor()
    encrypted = encryptor.update(padded) + encryptor.finalize()
    return iv + encrypted

def aes_decrypt(ciphertext_with_iv: bytes, quantum_key: str) -> bytes:
    """Decrypt AES-256-CBC ciphertext (first 16 bytes are IV)."""
    if len(ciphertext_with_iv) < 17:
        raise ValueError("Ciphertext too short — missing IV or payload.")
    aes_key = derive_aes_key(quantum_key)
    iv = ciphertext_with_iv[:16]
    ciphertext = ciphertext_with_iv[16:]
    cipher = Cipher(algorithms.AES(aes_key), modes.CBC(iv), backend=default_backend())
    decryptor = cipher.decryptor()
    padded_plaintext = decryptor.update(ciphertext) + decryptor.finalize()
    unpadder = aes_padding.PKCS7(128).unpadder()
    return unpadder.update(padded_plaintext) + unpadder.finalize()

# PQC constants
PQC_PRIVATE_SALT = "CRYSTALS_DILITHIUM_PRIVATE_SALT_KEY_v1"

def pqc_sign(data_hash: str, username: str) -> tuple[str, str]:
    """Simulate CRYSTALS-Dilithium signing. Returns (signature, public_key)."""
    private_seed = hashlib.sha256(f"{PQC_PRIVATE_SALT}:{username}".encode()).hexdigest()
    signature = hashlib.sha256(f"{data_hash}:{private_seed}".encode()).hexdigest()
    public_key = hashlib.sha256(f"PUBLIC:{username}".encode()).hexdigest()[:32]
    return signature, public_key

def pqc_verify(data_hash: str, signature: str, public_key: str, db: Session) -> bool:
    """Simulate CRYSTALS-Dilithium signature verification by looking up the key owner."""
    signer_username = None
    
    try:
        # Check all registered database users
        users = db.query(models.User).all()
        for u in users:
            derived_pub = hashlib.sha256(f"PUBLIC:{u.username}".encode()).hexdigest()[:32]
            if derived_pub == public_key:
                signer_username = u.username
                break
    except Exception:
        pass
        
    # Fallback/default check for guest
    if not signer_username:
        derived_pub = hashlib.sha256(f"PUBLIC:guest".encode()).hexdigest()[:32]
        if derived_pub == public_key:
            signer_username = "guest"
            
    if not signer_username:
        return False
        
    private_seed = hashlib.sha256(f"{PQC_PRIVATE_SALT}:{signer_username}".encode()).hexdigest()
    expected_signature = hashlib.sha256(f"{data_hash}:{private_seed}".encode()).hexdigest()
    return signature == expected_signature

# WebSocket Connection Manager
class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        self.active_connections.remove(websocket)

    async def broadcast(self, message: dict):
        for connection in self.active_connections:
            try:
                await connection.send_json(message)
            except:
                pass

ws_manager = ConnectionManager()

# ----------------- AUTHENTICATION ROUTES -----------------
@app.get("/")
def read_root():
    return {
        "status": "online",
        "message": "Quantum Cryptography Enterprise Portal API is running.",
        "documentation": "/docs"
    }

@app.post("/api/auth/register")
def register(user_in: UserRegister, db: Session = Depends(get_db)):
    db_user = db.query(models.User).filter(models.User.username == user_in.username).first()
    if db_user:
        raise HTTPException(status_code=400, detail="Username already registered")
        
    hashed_password = get_password_hash(user_in.password)
    # Generate random secret key for 2FA setup fallback
    otp_secret = base64.b32encode(os.urandom(10)).decode('utf-8')
    
    new_user = models.User(
        username=user_in.username,
        password_hash=hashed_password,
        role="organization" if user_in.organization_id else "user",
        full_name=user_in.full_name,
        organization_id=user_in.organization_id,
        otp_secret=otp_secret
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    
    # Audit log
    audit_log = models.AuditLog(
        user_id=new_user.id,
        action="user_registered",
        details=f"New user registered: {new_user.username}. Organization: {user_in.organization_id or 'None'}."
    )
    db.add(audit_log)
    db.commit()
    
    # Simulated SMS/Email OTP code
    simulated_otp = str(random.randint(100000, 999999))
    
    return {
        "message": "Registration successful",
        "username": new_user.username,
        "simulated_otp": simulated_otp
    }

@app.post("/api/auth/login")
def login(credentials: UserLogin, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.username == credentials.username).first()
    if not user:
        raise HTTPException(status_code=400, detail="Incorrect username or password")
        
    # Check Lockout status
    if user.locked_until and user.locked_until > datetime.utcnow():
        seconds_left = int((user.locked_until - datetime.utcnow()).total_seconds())
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Account locked due to intrusion suspicion. Try again in {seconds_left} seconds."
        )

    if not verify_password(credentials.password, user.password_hash):
        # Record failed login history
        fail_log = models.LoginHistory(
            user_id=user.id,
            login_time=datetime.utcnow(),
            ip_address="127.0.0.1",
            device="Web Browser",
            status="failed"
        )
        db.add(fail_log)
        
        # Increment failed count
        user.failed_login_attempts += 1
        if user.failed_login_attempts >= 3:
            user.locked_until = datetime.utcnow() + timedelta(minutes=5)
            user.failed_login_attempts = 0
            db.commit()
            
            # Intrusion detection audit
            audit_log = models.AuditLog(
                user_id=user.id,
                action="intrusion_lockout",
                details=f"Intrusion alarm: Username '{user.username}' locked out due to 3 failed attempts."
            )
            db.add(audit_log)
            db.commit()
            raise HTTPException(status_code=400, detail="Intrusion warning: 3 failed attempts. Account locked for 5 minutes.")
        db.commit()
        raise HTTPException(status_code=400, detail="Incorrect username or password")
        
    # Login GPS Alerts Simulation
    simulated_gps_locations = [
        "Mumbai, India", "London, UK", "New York, USA", "Tokyo, Japan", "Berlin, Germany"
    ]
    random_loc = random.choice(simulated_gps_locations)
    
    # Reset failed counters
    user.failed_login_attempts = 0
    db.commit()
 
    # 2FA Verification Challenge
    if user.two_factor_enabled:
        if not credentials.otp_code:
            return {
                "status": "requires_2fa",
                "message": "Two-Factor Verification Code required.",
                "username": user.username
            }
        
        # Verify OTP
        if not verify_totp(user.otp_secret, credentials.otp_code):
            # Record failed OTP login history
            fail_log = models.LoginHistory(
                user_id=user.id,
                login_time=datetime.utcnow(),
                ip_address="127.0.0.1",
                device="Web Browser",
                status="failed (OTP invalid)"
            )
            db.add(fail_log)
            db.commit()
            raise HTTPException(status_code=400, detail="Invalid authenticator verification code.")
 
    access_token = create_access_token(data={"sub": user.username})
    
    # Update last login timestamp in database
    user.last_login = datetime.utcnow()
    
    # Record successful login history
    success_log = models.LoginHistory(
        user_id=user.id,
        login_time=datetime.utcnow(),
        ip_address="127.0.0.1",
        device="Web Browser",
        status="success"
    )
    db.add(success_log)
    
    # Audit log
    audit_log = models.AuditLog(
        user_id=user.id,
        action="user_login",
        details=f"User successfully logged in. Geo-Location: {random_loc}."
    )
    db.add(audit_log)
    db.commit()
    
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": {
            "username": user.username,
            "role": user.role,
            "full_name": user.full_name,
            "organization_id": user.organization_id,
            "subscription_tier": user.subscription_tier
        },
        "gps_alert": f"Login detected from {random_loc}"
    }

@app.get("/api/auth/profile")
def get_profile(current_user: models.User = Depends(get_current_user)):
    return {
        "username": current_user.username,
        "role": current_user.role,
        "full_name": current_user.full_name,
        "created_at": current_user.created_at,
        "organization_id": current_user.organization_id,
        "two_factor_enabled": current_user.two_factor_enabled,
        "otp_secret": current_user.otp_secret,
        "subscription_tier": current_user.subscription_tier
    }

@app.post("/api/auth/profile/update")
def update_profile(
    profile_update: UserProfileUpdate,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if profile_update.full_name is not None:
        current_user.full_name = profile_update.full_name
    if profile_update.organization_id is not None:
        current_user.organization_id = profile_update.organization_id
    if profile_update.password is not None and profile_update.password != "":
        current_user.password_hash = get_password_hash(profile_update.password)
        
    db.commit()
    
    # Audit log
    audit_log = models.AuditLog(
        user_id=current_user.id,
        action="profile_update",
        details=f"User updated profile details."
    )
    db.add(audit_log)
    db.commit()
    
    return {"message": "Profile updated successfully"}

@app.post("/api/auth/2fa/setup")
def setup_2fa(current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    if not current_user.otp_secret:
        current_user.otp_secret = base64.b32encode(os.urandom(10)).decode('utf-8')
        db.commit()
        
    totp_uri = f"otpauth://totp/QuantumPortal:{current_user.username}?secret={current_user.otp_secret}&issuer=QuantumPortal"
    
    # Generate simulated QR Code (inline SVG)
    qr_svg = f"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='180' height='180' viewBox='0 0 4 4'><rect width='4' height='4' fill='white'/><rect x='0' y='0' width='1' height='1' fill='black'/><rect x='3' y='0' width='1' height='1' fill='black'/><rect x='0' y='3' width='1' height='1' fill='black'/><rect x='1' y='1' width='2' height='2' fill='black'/></svg>"
    
    # Generate currently valid simulated token
    time_block = int(time.time() / 30)
    h = hashlib.sha256(f"{current_user.otp_secret}-{time_block}".encode('utf-8')).hexdigest()
    valid_code = str(int(h, 16) % 1000000).zfill(6)

    return {
        "secret": current_user.otp_secret,
        "totp_uri": totp_uri,
        "qr_code": qr_svg,
        "simulated_code": valid_code
    }

@app.post("/api/auth/2fa/verify")
def verify_2fa(verify_in: Setup2FAVerify, current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    if verify_totp(current_user.otp_secret, verify_in.token):
        current_user.two_factor_enabled = True
        db.commit()
        
        # Log event
        audit_log = models.AuditLog(
            user_id=current_user.id,
            action="2fa_enabled",
            details="User successfully configured and enabled Two-Factor Authentication."
        )
        db.add(audit_log)
        db.commit()
        return {"message": "Two-Factor Authentication activated successfully."}
    else:
        raise HTTPException(status_code=400, detail="Invalid verification code. Authentication failed.")

@app.post("/api/auth/2fa/disable")
def disable_2fa(current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    current_user.two_factor_enabled = False
    db.commit()
    
    # Log event
    audit = models.AuditLog(
        user_id=current_user.id,
        action="2fa_disabled",
        details="User disabled 2FA."
    )
    db.add(audit)
    db.commit()
    return {"message": "Two-Factor Authentication deactivated."}

class UpgradeSubscriptionRequest(BaseModel):
    tier: str
    card_number: str
    card_expiry: str
    card_cvv: str
    card_name: str

@app.post("/api/auth/subscription/upgrade")
def upgrade_subscription(
    req: UpgradeSubscriptionRequest,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if current_user.role == "guest":
        raise HTTPException(status_code=403, detail="Guests cannot purchase subscriptions")
    if req.tier not in ["pro", "enterprise"]:
        raise HTTPException(status_code=400, detail="Invalid subscription tier requested")
    clean_card = req.card_number.replace(" ", "").replace("-", "")
    if len(clean_card) != 16 or not clean_card.isdigit():
        raise HTTPException(status_code=400, detail="Payment processing failed: Invalid Card Number")
    current_user.subscription_tier = req.tier
    current_user.subscription_expires_at = datetime.utcnow() + timedelta(days=30)
    db.commit()
    audit = models.AuditLog(
        user_id=current_user.id,
        action="subscription_upgrade",
        details=f"User upgraded to {req.tier.upper()} subscription tier."
    )
    db.add(audit)
    db.commit()
    return {
        "message": f"Successfully upgraded to {req.tier.upper()} tier!",
        "subscription_tier": req.tier
    }

# ----------------- SIMULATION ROUTE (QISKIT & NUMERICAL) -----------------
@app.post("/api/simulate")
async def simulate_bb84(
    config: SimulationConfig,
    current_user: models.User = Depends(get_optional_current_user),
    db: Session = Depends(get_db)
):
    n = config.key_length
    noise = config.noise_level
    has_eve = config.eavesdropper
    mode = config.simulator_mode # "qiskit" or "numerical"
    
    if mode == "qiskit" and current_user.subscription_tier == "free" and current_user.role != "admin":
        raise HTTPException(status_code=403, detail="IBM Qiskit Simulator requires Pro or Enterprise subscription.")
        
    # Simulate IBM Quantum backend circuit behaviour or standard state simulation
    # In 'qiskit' mode we mock the IBM Qiskit backend execution delays and circuit noise
    if mode == "qiskit":
        # Add tiny delay simulating IBM device queue
        await asyncio.sleep(0.4)
        
    # 1. Alice generates random bits and bases
    alice_bits = np.random.randint(0, 2, n).tolist()
    alice_bases = np.random.randint(0, 2, n).tolist()
    alice_qubits_polarization = [get_polarization(bit, basis) for bit, basis in zip(alice_bits, alice_bases)]
    
    # 2. Transmission through Quantum Channel (with optional Eve)
    eve_bases = []
    eve_measured_bits = []
    eve_qubits_polarization = []
    
    current_bits = list(alice_bits)
    current_bases = list(alice_bases)
    
    if has_eve:
        eve_bases = np.random.randint(0, 2, n).tolist()
        for i in range(n):
            # Qiskit simulator measure introduces collapse disturbance
            eve_bit = measure_qubit(alice_bits[i], alice_bases[i], eve_bases[i], noise)
            eve_measured_bits.append(eve_bit)
            eve_qubits_polarization.append(get_polarization(eve_bit, eve_bases[i]))
            current_bits[i] = eve_bit
            current_bases[i] = eve_bases[i]
            
    # 3. Bob receives and measures
    bob_bases = np.random.randint(0, 2, n).tolist()
    bob_measured_bits = []
    
    for i in range(n):
        bob_bit = measure_qubit(current_bits[i], current_bases[i], bob_bases[i], noise if not has_eve else 0.0)
        bob_measured_bits.append(bob_bit)
        
    bob_qubits_polarization = [get_polarization(bit, basis) for bit, basis in zip(bob_measured_bits, bob_bases)]
    
    # 4. Sifting
    basis_matches = [alice_bases[i] == bob_bases[i] for i in range(n)]
    alice_sifted = [alice_bits[i] for i in range(n) if basis_matches[i]]
    bob_sifted = [bob_measured_bits[i] for i in range(n) if basis_matches[i]]
    sifted_indices = [i for i in range(n) if basis_matches[i]]
    
    # 5. QBER Calculation
    total_matching = len(alice_sifted)
    errors = 0
    error_indices = []
    
    for idx, (a_val, b_val) in enumerate(zip(alice_sifted, bob_sifted)):
        if a_val != b_val:
            errors += 1
            error_indices.append(sifted_indices[idx])
            
    qber = (errors / total_matching) if total_matching > 0 else 0.0
    eve_detected = qber > 0.15
    final_key = "".join(map(str, alice_sifted))
    
    steps = []
    for i in range(n):
        step_log = {
            "index": i,
            "alice_bit": alice_bits[i],
            "alice_basis": "+" if alice_bases[i] == 0 else "x",
            "alice_polarization": alice_qubits_polarization[i],
            "bob_basis": "+" if bob_bases[i] == 0 else "x",
            "bob_measured": bob_measured_bits[i],
            "bob_polarization": bob_qubits_polarization[i],
            "basis_match": basis_matches[i],
            "is_error": i in error_indices
        }
        if has_eve:
            step_log.update({
                "eve_basis": "+" if eve_bases[i] == 0 else "x",
                "eve_measured": eve_measured_bits[i],
                "eve_polarization": eve_qubits_polarization[i],
            })
        steps.append(step_log)
        
    audit_log = models.AuditLog(
        action="simulation",
        details=f"QKD simulated ({mode} mode). Qubits: {n}, Noise: {noise}, Eve: {has_eve}. QBER: {round(qber*100, 2)}%. Detected: {eve_detected}."
    )
    db.add(audit_log)
    db.commit()
        
    return {
        "config": {"key_length": n, "noise_level": noise, "eavesdropper": has_eve, "simulator_mode": mode},
        "summary": {
            "total_sent": n,
            "sifted_length": total_matching,
            "errors": errors,
            "qber_percent": round(qber * 100, 2),
            "eve_detected": eve_detected,
            "aborted": eve_detected
        },
        "keys": {
            "alice_sifted": "".join(map(str, alice_sifted)),
            "bob_sifted": "".join(map(str, bob_sifted)),
            "final_shared_key": final_key if not eve_detected else None
        },
        "steps": steps
    }

# ----------------- MESSAGE ENCRYPT/DECRYPT ROUTES -----------------
@app.post("/api/encrypt")
def encrypt_message(req: EncryptRequest, current_user: models.User = Depends(get_optional_current_user)):
    if not req.quantum_key:
        raise HTTPException(status_code=400, detail="A valid quantum key is required.")
    try:
        # Step 1: AES-256-CBC encrypt the message using BB84 quantum key
        msg_bytes = req.message.encode('utf-8')
        encrypted_bytes = aes_encrypt(msg_bytes, req.quantum_key)
        ciphertext_b64 = base64.b64encode(encrypted_bytes).decode('utf-8')
        
        # Step 2: SHA-256 hash the ciphertext
        ciphertext_hash = hashlib.sha256(encrypted_bytes).hexdigest()
        
        # Step 3: PQC sign the hash
        username = current_user.username if current_user else "guest"
        signature, public_key = pqc_sign(ciphertext_hash, username)
        
        return {
            "ciphertext": ciphertext_b64,
            "hash": ciphertext_hash,
            "signature": signature,
            "public_key": public_key,
            "algorithm": "AES-256-CBC + CRYSTALS-Dilithium",
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/decrypt")
def decrypt_message(req: DecryptRequest, db: Session = Depends(get_db), current_user: models.User = Depends(get_optional_current_user)):
    if not req.quantum_key:
        raise HTTPException(status_code=400, detail="A valid quantum key is required.")
    
    # Allow optional signature verification if signature/public_key provided
    signature = getattr(req, 'signature', None)
    public_key = getattr(req, 'public_key', None)
    
    try:
        encrypted_bytes = base64.b64decode(req.ciphertext)
        
        # Step 1: Verify PQC signature if provided
        if signature and public_key:
            ciphertext_hash = hashlib.sha256(encrypted_bytes).hexdigest()
            is_valid = pqc_verify(ciphertext_hash, signature, public_key, db)
            if not is_valid:
                raise HTTPException(status_code=400, detail="❌ Signature Verification Failed: Ciphertext integrity compromised. Decryption aborted.")
        
        # Step 2: AES-256-CBC decrypt
        decrypted_bytes = aes_decrypt(encrypted_bytes, req.quantum_key)
        return {
            "decrypted_message": decrypted_bytes.decode('utf-8', errors='replace'),
            "signature_verified": bool(signature and public_key),
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ----------------- DIGITAL SIGNATURES ROUTE -----------------
@app.post("/api/signatures/sign")
def sign_message(req: SignMessageRequest, current_user: models.User = Depends(get_optional_current_user)):
    # Hash the message then sign with CRYSTALS-Dilithium simulation
    msg_hash = hashlib.sha256(req.message.encode('utf-8')).hexdigest()
    signature, public_key = pqc_sign(msg_hash, current_user.username)
    
    return {
        "signature": signature,
        "public_key": public_key,
        "message_hash": msg_hash,
        "algorithm": "CRYSTALS-Dilithium / SHA-256 Hybrid",
        "signer": current_user.username,
    }

@app.post("/api/signatures/verify")
def verify_signature(req: VerifySignatureRequest, db: Session = Depends(get_db)):
    msg_hash = hashlib.sha256(req.message.encode('utf-8')).hexdigest()
    is_valid = pqc_verify(msg_hash, req.signature, req.public_key, db)
    return {
        "valid": is_valid,
        "algorithm": "CRYSTALS-Dilithium / SHA-256 Hybrid",
        "verified_at": datetime.utcnow()
    }


# ----------------- SECURE FILE LOCKER ROUTES -----------------
@app.post("/api/files/upload")
def upload_file(
    file: UploadFile = File(...),
    quantum_key: str = Form(...),
    tags: str = Form(""),
    parent_folder: str = Form("/"),
    expiry_hours: Optional[int] = Form(None),
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if current_user.role == "guest":
        raise HTTPException(status_code=403, detail="Guests cannot upload files")
    if not quantum_key:
        raise HTTPException(status_code=400, detail="Quantum key is required for file encryption.")
        
    # Check subscription tier upload counts
    existing_files_count = db.query(models.EncryptedFile).filter(models.EncryptedFile.owner_id == current_user.id).count()
    if current_user.subscription_tier == "free" and current_user.role != "admin":
        if existing_files_count >= 2:
            raise HTTPException(status_code=403, detail="Free subscription is limited to 2 files. Upgrade to Pro or Enterprise.")
    elif current_user.subscription_tier == "pro" and current_user.role != "admin":
        if existing_files_count >= 10:
            raise HTTPException(status_code=403, detail="Pro subscription is limited to 10 files. Upgrade to Enterprise.")
            
    try:
        file_content = file.file.read()
        
        # Check size limits
        size = len(file_content)
        if current_user.subscription_tier == "free" and current_user.role != "admin" and size > 1_000_000:
            raise HTTPException(status_code=403, detail="Free subscription is limited to 1MB files. Upgrade to Pro or Enterprise.")
        if current_user.subscription_tier == "pro" and current_user.role != "admin" and size > 10_000_000:
            raise HTTPException(status_code=403, detail="Pro subscription is limited to 10MB files. Upgrade to Enterprise.")
        
        # Calculate SHA-256 Integrity check hash of PLAINTEXT
        sha256_hash = hashlib.sha256(file_content).hexdigest()
        
        # Step 1: AES-256-CBC encrypt contents using BB84 quantum key
        encrypted_content = aes_encrypt(file_content, quantum_key)
        b64_ciphertext = base64.b64encode(encrypted_content).decode('utf-8')
        
        # Step 2: SHA-256 hash the ciphertext
        ciphertext_hash = hashlib.sha256(encrypted_content).hexdigest()
        
        # Step 3: PQC sign the ciphertext hash (CRYSTALS-Dilithium simulation)
        pqc_sig, pqc_pub = pqc_sign(ciphertext_hash, current_user.username)
        
        # Expiry Calculations
        expires_at = None
        if expiry_hours:
            expires_at = datetime.utcnow() + timedelta(hours=expiry_hours)
            
        # Check Version History
        existing_count = db.query(models.EncryptedFile).filter(
            models.EncryptedFile.filename == file.filename,
            models.EncryptedFile.parent_folder == parent_folder,
            models.EncryptedFile.owner_id == current_user.id
        ).count()
        new_version = existing_count + 1
        
        # Save file model with PQC signature metadata
        db_file = models.EncryptedFile(
            filename=file.filename,
            ciphertext=b64_ciphertext,
            quantum_key=quantum_key,
            owner_id=current_user.id,
            tags=tags,
            expires_at=expires_at,
            parent_folder=parent_folder,
            version=new_version,
            file_hash=sha256_hash,
            pqc_signature=pqc_sig,
            pqc_public_key=pqc_pub,
        )
        db.add(db_file)
        db.commit()
        db.refresh(db_file)
        
        # Log event
        audit_log = models.AuditLog(
            user_id=current_user.id,
            action="file_upload",
            details=f"Uploaded encrypted file: {file.filename} v{new_version}. Folder: {parent_folder}. Size: {len(file_content)} bytes. Hash: {sha256_hash[:8]}..."
        )
        db.add(audit_log)
        db.commit()
        
        return {
            "message": f"File '{file.filename}' uploaded and encrypted successfully.", 
            "id": db_file.id,
            "hash": sha256_hash,
            "version": new_version
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"File upload failed: {str(e)}")

@app.get("/api/files/list")
def list_files(
    folder: str = "/",
    search: Optional[str] = None,
    tag: Optional[str] = None,
    favorites_only: bool = False,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if current_user.role == "guest":
        return []
        
    # Auto Expiry Sweep check
    now = datetime.utcnow()
    expired_files = db.query(models.EncryptedFile).filter(models.EncryptedFile.expires_at < now).all()
    if expired_files:
        for f in expired_files:
            db.delete(f)
        db.commit()
    
    # Query builder
    query = db.query(models.EncryptedFile)
    if current_user.role != "admin":
        query = query.filter(models.EncryptedFile.owner_id == current_user.id)
        
    query = query.filter(models.EncryptedFile.parent_folder == folder)
    
    if search:
        query = query.filter(models.EncryptedFile.filename.like(f"%{search}%"))
        
    if tag:
        query = query.filter(models.EncryptedFile.tags.like(f"%{tag}%"))
        
    if favorites_only:
        query = query.filter(models.EncryptedFile.is_favorite == True)
        
    files = query.all()
    
    return [
        {
            "id": f.id,
            "filename": f.filename,
            "created_at": f.created_at,
            "owner": db.query(models.User).filter(models.User.id == f.owner_id).first().username,
            "tags": f.tags,
            "is_favorite": f.is_favorite,
            "version": f.version,
            "file_hash": f.file_hash,
            "expires_at": f.expires_at,
            "has_share_link": f.sharing_expires_at is not None and f.sharing_expires_at > now,
            "pqc_signed": f.pqc_signature is not None,
        }
        for f in files
    ]

@app.get("/api/files/download/{id}")
def download_file(
    id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if current_user.role == "guest":
        raise HTTPException(status_code=403, detail="Guests cannot download files")
        
    db_file = db.query(models.EncryptedFile).filter(models.EncryptedFile.id == id).first()
    if not db_file:
        raise HTTPException(status_code=404, detail="File not found")
        
    if current_user.role != "admin" and db_file.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Permission denied to access this file")
        
    # Log event
    audit_log = models.AuditLog(
        user_id=current_user.id,
        action="file_download",
        details=f"Downloaded encrypted file: {db_file.filename} v{db_file.version}."
    )
    db.add(audit_log)
    db.commit()
        
    return {
        "id": db_file.id,
        "filename": db_file.filename,
        "ciphertext": db_file.ciphertext,
        "suggested_key": db_file.quantum_key,
        "file_hash": db_file.file_hash
    }

@app.get("/api/files/download-decrypted/{id}")
def download_decrypted_file(
    id: int,
    key: str,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if current_user.role == "guest":
        raise HTTPException(status_code=403, detail="Guests cannot download files")
        
    db_file = db.query(models.EncryptedFile).filter(models.EncryptedFile.id == id).first()
    if not db_file:
        raise HTTPException(status_code=404, detail="File not found")
        
    if current_user.role != "admin" and db_file.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Permission denied")
        
    if key != db_file.quantum_key:
        raise HTTPException(status_code=400, detail="Incorrect quantum key. Decryption failed.")
        
    try:
        from io import BytesIO
        encrypted_bytes = base64.b64decode(db_file.ciphertext)
        
        # Step 1: Verify PQC Dilithium signature of the ciphertext
        if db_file.pqc_signature and db_file.pqc_public_key:
            ciphertext_hash = hashlib.sha256(encrypted_bytes).hexdigest()
            # Find original uploader username for verification
            uploader = db.query(models.User).filter(models.User.id == db_file.owner_id).first()
            uploader_name = uploader.username if uploader else "guest"
            sig_valid = pqc_verify(ciphertext_hash, db_file.pqc_signature, db_file.pqc_public_key, uploader_name)
            if not sig_valid:
                raise HTTPException(
                    status_code=400,
                    detail="❌ CRYSTALS-Dilithium Signature Verification FAILED. File integrity compromised — decryption aborted."
                )
        
        # Step 2: AES-256-CBC decrypt using the BB84 quantum key
        decrypted_bytes = aes_decrypt(encrypted_bytes, db_file.quantum_key)
        
        file_stream = BytesIO(decrypted_bytes)
        
        audit_log = models.AuditLog(
            user_id=current_user.id,
            action="file_decrypt_download",
            details=f"Decrypted and downloaded file: {db_file.filename}."
        )
        db.add(audit_log)
        db.commit()
        
        return StreamingResponse(
            file_stream,
            media_type="application/octet-stream",
            headers={"Content-Disposition": f"attachment; filename={db_file.filename}"}
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Decryption failed: {str(e)}")

@app.delete("/api/files/{id}")
def delete_file(
    id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if current_user.role == "guest":
        raise HTTPException(status_code=403, detail="Guests cannot delete files")
        
    db_file = db.query(models.EncryptedFile).filter(models.EncryptedFile.id == id).first()
    if not db_file:
        raise HTTPException(status_code=404, detail="File not found")
        
    if current_user.role != "admin" and db_file.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Permission denied")
        
    filename = db_file.filename
    db.delete(db_file)
    db.commit()
    
    # Log event
    audit_log = models.AuditLog(
        user_id=current_user.id,
        action="file_delete",
        details=f"Deleted file: {filename}."
    )
    db.add(audit_log)
    db.commit()
    
    return {"message": "File deleted successfully"}

@app.post("/api/files/favorite/{id}")
def toggle_favorite(id: int, current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    db_file = db.query(models.EncryptedFile).filter(models.EncryptedFile.id == id).first()
    if not db_file:
        raise HTTPException(status_code=404, detail="File not found")
        
    if current_user.role != "admin" and db_file.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Permission denied")
        
    db_file.is_favorite = not db_file.is_favorite
    db.commit()
    return {"is_favorite": db_file.is_favorite}

@app.post("/api/files/share/{id}")
def share_file(req: ShareFileRequest, id: int, current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    db_file = db.query(models.EncryptedFile).filter(models.EncryptedFile.id == id).first()
    if not db_file:
        raise HTTPException(status_code=404, detail="File not found")
        
    if current_user.role != "admin" and db_file.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Permission denied")
        
    hours = req.expiry_hours or 24
    db_file.sharing_password = req.password
    db_file.sharing_expires_at = datetime.utcnow() + timedelta(hours=hours)
    db.commit()
    
    # Simulated expiring link
    share_url = f"/api/files/shared-download/{db_file.id}"
    return {
        "share_link": share_url,
        "expires_at": db_file.sharing_expires_at,
        "password_protected": req.password is not None
    }

@app.get("/api/files/shared-download/{id}")
def get_shared_file(id: int, password: Optional[str] = None, db: Session = Depends(get_db)):
    db_file = db.query(models.EncryptedFile).filter(models.EncryptedFile.id == id).first()
    if not db_file or not db_file.sharing_expires_at:
        raise HTTPException(status_code=404, detail="File share link not found or expired.")
        
    if db_file.sharing_expires_at < datetime.utcnow():
        raise HTTPException(status_code=400, detail="This file sharing link has expired.")
        
    if db_file.sharing_password and db_file.sharing_password != password:
        raise HTTPException(status_code=401, detail="Incorrect password. Unauthorized download access.")
        
    return {
        "filename": db_file.filename,
        "ciphertext": db_file.ciphertext,
        "file_hash": db_file.file_hash,
        "quantum_key": db_file.quantum_key
    }

@app.get("/api/files/versions/{filename}")
def get_file_versions(filename: str, current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    query = db.query(models.EncryptedFile).filter(models.EncryptedFile.filename == filename)
    if current_user.role != "admin":
        query = query.filter(models.EncryptedFile.owner_id == current_user.id)
        
    versions = query.order_by(models.EncryptedFile.version.desc()).all()
    return [
        {
            "id": v.id,
            "version": v.version,
            "created_at": v.created_at,
            "file_hash": v.file_hash
        }
        for v in versions
    ]

class ChatbotRequest(BaseModel):
    message: str

@app.post("/api/chatbot")
def chat_with_assistant(req: ChatbotRequest):
    msg = req.message.lower().strip()
    
    if "bb84" in msg or "protocol" in msg:
        reply = (
            "The **BB84 protocol** is a Quantum Key Distribution (QKD) scheme developed by Charles Bennett and Gilles Brassard in 1984. "
            "It uses conjugate states of photons (typically polarization states: rectilinear and diagonal) to transmit key bits. "
            "Any eavesdropping attempt (Eve) introduces measurable disturbance due to the Heisenberg Uncertainty Principle, allowing Alice and Bob to detect the intrusion."
        )
    elif "qber" in msg or "error rate" in msg or "noise" in msg:
        reply = (
            "**QBER (Quantum Bit Error Rate)** is the ratio of incorrect qubits received by Bob to the total qubits measured. "
            "In standard channel conditions, some QBER is expected due to natural fiber noise. "
            "However, if QBER exceeds the security threshold (typically **11% to 15%** depending on the proof details), "
            "Alice and Bob abort the key generation since an eavesdropper (Eve) may have intercepted the qubits, introducing high QBER."
        )
    elif "eavesdropper" in msg or "eve" in msg:
        reply = (
            "An **Eavesdropper (Eve)** attempts to intercept qubits in transit. "
            "Because quantum states cannot be measured without altering them (No-Cloning Theorem), Eve's measurements inevitably disturb the polarizations. "
            "Alice and Bob detect this by comparing a random sample of their sifted keys; if the mismatch (QBER) is too high, Eve's presence is revealed!"
        )
    elif "xor" in msg or "one-time pad" in msg or "otp" in msg:
        reply = (
            "**XOR One-Time Pad (OTP)** is a mathematically unbreakable encryption algorithm. "
            "It works by taking the binary message bits and applying an exclusive-OR (XOR) operation with a random key stream of the exact same length. "
            "As long as the key is truly random, used only once, and kept secret (which QKD guarantees), the ciphertext contains zero information about the plaintext."
        )
    elif "signature" in msg or "pqc" in msg or "dilithium" in msg:
        reply = (
            "This portal implements simulated **Dilithium post-quantum digital signatures**. "
            "Unlike RSA or ECC, which are vulnerable to Shor's algorithm on quantum computers, Dilithium relies on the hardness of lattice-based cryptography. "
            "This ensures that digital files cannot be forged, even in a future post-quantum environment."
        )
    elif "kms" in msg or "rotate" in msg or "key management" in msg:
        reply = (
            "The **Key Management System (KMS)** manages the lifecycle of your quantum keys. "
            "It supports **Quantum Key Rotation** (generating fresh keys to replace older ones) and **Key Revocation** (discarding keys that are compromised or have high error rates). "
            "This ensures that keys used for file locker encryption remain secure."
        )
    elif "help" in msg or "features" in msg or "capabilities" in msg:
        reply = (
            "I can assist you with understanding:\n"
            "- **BB84 QKD Visualizer** & measuring QBER\n"
            "- **XOR OTP Cryptography** and Messenger encryption\n"
            "- **Secure File Locker** folders, tags, versions, and share links\n"
            "- **Intrusion lockout and lockout safety checks**\n"
            "- **TOTP 2FA Verification and subscription tiers**\n\n"
            "Try asking me: *'How does BB84 work?'* or *'What is QBER?'*"
        )
    else:
        reply = (
            "Greetings, Operator. I am the Quantum Security Assistant. "
            "I can explain QKD, BB84 simulation channels, XOR OTP cryptography, and the Smart File Locker features. "
            "Try asking me about **BB84**, **QBER**, **XOR**, or type **help** for a list of topics."
        )
        
    return {"reply": reply}

# ----------------- WEBSOCKET ALERTS STREAM -----------------
@app.websocket("/api/ws")
async def websocket_endpoint(websocket: WebSocket):
    await ws_manager.connect(websocket)
    try:
        # Send initial success greeting
        await websocket.send_json({"type": "connect", "message": "Connected to Quantum Real-Time WebSocket stream."})
        
        while True:
            # Receive ping/pong and broadcast active system monitoring telemetry
            await websocket.receive_text()
            cpu_val = round(random.uniform(5.0, 30.0), 1)
            ram_val = round(random.uniform(30.0, 60.0), 1)
            await websocket.send_json({
                "type": "telemetry",
                "cpu": cpu_val,
                "ram": ram_val,
                "latency": round(random.uniform(5.0, 20.0), 1),
                "active_sockets": len(ws_manager.active_connections),
                "timestamp": datetime.utcnow().strftime("%H:%M:%S")
            })
            await asyncio.sleep(2.5)
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket)
    except Exception:
        ws_manager.disconnect(websocket)

# ----------------- ADMIN / AUDIT ROUTES -----------------
@app.get("/api/admin/logs")
def get_audit_logs(
    current_user: models.User = Depends(RoleChecker(["admin", "organization"])),
    db: Session = Depends(get_db)
):
    logs = db.query(models.AuditLog).order_by(models.AuditLog.timestamp.desc()).limit(100).all()
    output = []
    for log in logs:
        username = "System/Anonymous"
        if log.user_id:
            usr = db.query(models.User).filter(models.User.id == log.user_id).first()
            if usr:
                username = usr.username
        output.append({
            "id": log.id,
            "username": username,
            "action": log.action,
            "details": log.details,
            "timestamp": log.timestamp
        })
    return output

@app.get("/api/admin/stats")
def get_stats(
    current_user: models.User = Depends(RoleChecker(["admin", "user", "organization"])),
    db: Session = Depends(get_db)
):
    total_users = db.query(models.User).count()
    total_files = db.query(models.EncryptedFile).count()
    
    sim_logs = db.query(models.AuditLog).filter(models.AuditLog.action == "simulation").all()
    total_simulations = len(sim_logs)
    
    avg_qber = 0.0
    eve_detections = 0
    if total_simulations > 0:
        total_qber = 0.0
        for log in sim_logs:
            try:
                if "QBER:" in log.details:
                    qber_str = log.details.split("QBER:")[1].split("%")[0].strip()
                    total_qber += float(qber_str)
                if "Detected: True" in log.details:
                    eve_detections += 1
            except:
                pass
        avg_qber = round(total_qber / total_simulations, 2)
        
    return {
        "users": total_users,
        "files": total_files,
        "simulations": total_simulations,
        "avg_qber_percent": avg_qber,
        "eve_detections": eve_detections
    }

@app.get("/api/admin/metrics")
def get_monitoring_metrics(current_user: models.User = Depends(RoleChecker(["admin", "organization"]))):
    """Real-time mock resource telemetry endpoint for monitoring dashboard charts."""
    return {
        "system": {
            "cpu_percent": round(random.uniform(8.0, 22.0), 1),
            "ram_percent": round(random.uniform(41.0, 55.0), 1),
            "disk_percent": 68.2,
            "api_latency_ms": round(random.uniform(6.0, 15.0), 1),
            "active_sockets": len(ws_manager.active_connections)
        },
        "qkd_channel": {
            "qubit_transfer_rate_hz": 1200,
            "average_qber_percent": 2.4,
            "key_generation_rate_bps": 240
        },
        "timestamp": datetime.utcnow()
    }

@app.get("/api/admin/backup")
def download_backup(
    current_user: models.User = Depends(RoleChecker(["admin", "organization"])),
    db: Session = Depends(get_db)
):
    if current_user.subscription_tier != "enterprise" and current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Database backup requires Enterprise subscription.")
    if not os.path.exists("./quantum.db"):
        raise HTTPException(status_code=404, detail="Database file not found")
        
    # Log event
    audit_log = models.AuditLog(
        user_id=current_user.id,
        action="database_backup",
        details=f"Admin initiated SQLite database backup."
    )
    db.add(audit_log)
    db.commit()
    
    return FileResponse(
        path="./quantum.db",
        filename=f"quantum_db_backup_{datetime.now().strftime('%Y%m%d_%H%M%S')}.db",
        media_type="application/x-sqlite3"
    )

@app.post("/api/admin/restore")
def restore_backup(
    file: UploadFile = File(...),
    current_user: models.User = Depends(RoleChecker(["admin", "organization"])),
    db: Session = Depends(get_db)
):
    if current_user.subscription_tier != "enterprise" and current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Database restoration requires Enterprise subscription.")
    if not file.filename.endswith(".db"):
        raise HTTPException(status_code=400, detail="Invalid backup file type. Must be a '.db' SQLite file.")
        
    try:
        temp_path = "./quantum_restore_temp.db"
        with open(temp_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
            
        shutil.copyfile(temp_path, "./quantum.db")
        if os.path.exists(temp_path):
            os.remove(temp_path)
            
        restored_db = next(get_db())
        audit_log = models.AuditLog(
            user_id=current_user.id,
            action="database_restore",
            details=f"Admin successfully restored database from file: {file.filename}."
        )
        restored_db.add(audit_log)
        restored_db.commit()
        restored_db.close()
        
        return {"message": "Database restored successfully."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database restore failed: {str(e)}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)
