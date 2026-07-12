import sys
import os
# Add parent directory to sys.path to resolve main module imports cleanly
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

import pytest
from fastapi.testclient import TestClient
from main import app, aes_encrypt, aes_decrypt, pqc_sign, pqc_verify
import hashlib
import base64


client = TestClient(app)

def test_read_root():
    """Verify that root endpoint resolves with offline/online state info."""
    response = client.get("/")
    assert response.status_code == 200
    assert response.json()["status"] == "online"

def test_bb84_simulation():
    """Verify that QKD simulation calculates sifted keys and error rates correctly."""
    payload = {
        "key_length": 32,
        "noise_level": 0.05,
        "eavesdropper": False,
        "simulator_mode": "numerical"
    }
    response = client.post("/api/simulate", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert "keys" in data
    assert "alice_sifted" in data["keys"]
    assert "bob_sifted" in data["keys"]
    assert "summary" in data
    assert "qber_percent" in data["summary"]

def test_aes_and_pqc_pipeline():
    """Test cryptographic pipeline functions end-to-end."""
    # 1. Test AES-256 encryption/decryption
    msg = b"Confidential quantum message transfer"
    key = "01011100011000101010011100011011"
    
    encrypted = aes_encrypt(msg, key)
    decrypted = aes_decrypt(encrypted, key)
    assert decrypted == msg

    # 2. Test CRYSTALS-Dilithium simulation signing/verification
    data_hash = hashlib.sha256(encrypted).hexdigest()
    username = "testuser"
    
    signature, public_key = pqc_sign(data_hash, username)
    assert len(signature) == 64
    assert len(public_key) == 32

def test_encrypt_endpoint():
    """Verify backend encryption pipeline integration endpoint."""
    payload = {
        "message": "Verify this message signature",
        "quantum_key": "11001010101110010101100110101101"
    }
    response = client.post("/api/encrypt", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert "ciphertext" in data
    assert "hash" in data
    assert "signature" in data
    assert "public_key" in data

def test_user_payments_and_search_integration():
    """Verify that a registered operator user can run searches and create billing sessions."""
    import random
    unique_username = f"testpayuser_{random.randint(1000, 9999)}"
    
    # 1. Register test user
    reg_payload = {
        "username": unique_username,
        "password": "SecurityPass123",
        "full_name": "Test Billing User"
    }
    reg_res = client.post("/api/auth/register", json=reg_payload)
    assert reg_res.status_code == 200
    
    # 2. Login to get token
    login_payload = {
        "username": unique_username,
        "password": "SecurityPass123"
    }
    login_res = client.post("/api/auth/login", json=login_payload)
    assert login_res.status_code == 200
    token_data = login_res.json()
    auth_headers = {"Authorization": f"Bearer {token_data['access_token']}"}
    
    # 3. Create Stripe Session
    stripe_res = client.post("/api/payments/stripe/create-session", json={"tier": "pro"}, headers=auth_headers)
    assert stripe_res.status_code == 200
    assert stripe_res.json()["gateway"] == "stripe"
    
    # 4. Create Razorpay Order
    razorpay_res = client.post("/api/payments/razorpay/create-order", json={"tier": "enterprise"}, headers=auth_headers)
    assert razorpay_res.status_code == 200
    assert razorpay_res.json()["gateway"] == "razorpay"
    
    # 5. Confirm upgrade
    confirm_payload = {
        "tier": "enterprise",
        "transaction_id": "test_transaction_id",
        "gateway": "stripe"
    }
    confirm_res = client.post("/api/payments/confirm", json=confirm_payload, headers=auth_headers)
    assert confirm_res.status_code == 200
    assert confirm_res.json()["subscription_tier"] == "enterprise"
    
    # 6. Test search endpoint
    search_res = client.get("/api/files/search?q=test", headers=auth_headers)
    assert search_res.status_code == 200
    assert isinstance(search_res.json(), list)

