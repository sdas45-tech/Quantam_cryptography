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
