# ⚛️ Post-Quantum Cryptography & QKD Visualizer Portal

An enterprise-grade security portal combining **Quantum Key Distribution (QKD)** and **Post-Quantum Cryptography (PQC)** into a unified, secure messaging and file storage pipeline.

---

## 🚀 Key Features

* **BB84 QKD Visualizer:** Live simulation of the BB84 protocol (Rectilinear & Diagonal polarizations) with real-time Quantum Bit Error Rate (QBER) and eavesdropper (Eve) detection.
* **Hybrid Cryptographic Pipeline:** 
  1. Key generation via **BB84 QKD**.
  2. Symmetric encryption using **AES-256-CBC** (proper Initialization Vectors + PKCS7 padding).
  3. Digital integrity hashing via **SHA-256**.
  4. Post-quantum signing via **CRYSTALS-Dilithium** lattice-based signature scheme.
* **Secure File Locker:** Vault for storing files with hierarchical folders, version control, favorite tagging, expiration sweep, and PQC digital signatures.
* **TOTP 2FA & Locking Security:** Multi-factor authentication with 2FA, automatic account lockouts after 3 failed login attempts, and GPS alerts simulation.
* **AI Security Assistant:** Embedded chatbot assistant helping users understand QKD, QBER, PQC, and Key Management Systems (KMS).
* **Real-time Telemetry:** Streaming performance stats (CPU, RAM, latency, socket count) over WebSockets.

---

## 📐 Pipeline Architecture Flow

```
                 USER SENDER SIDE
                        │
                        ▼
           Enter Message / Select File
                        │
                        ▼
           BB84 Quantum Key Generation
                        │
                        ▼
          AES-256-CBC Encrypts Payload
                        │
                        ▼
              Generate SHA-256 Hash
                        │
                        ▼
         Sign Hash using PQC Private Key
               (CRYSTALS-Dilithium)
                        │
                        ▼
           Store / Send Encrypted Data
                        │
       ─────────────────┼─────────────────►
                        │
                 RECEIVER SIDE
                        │
                        ▼
         Verify CRYSTALS-Dilithium Sig
              using PQC Public Key
                        │
             ┌──────────┴──────────┐
             │                     │
      Signature Valid       Signature Invalid
             │                     │
             ▼                     ▼
     Decrypt via AES-256    [ABORT PROCESS]
      using shared key
```

---

## 🛠️ Tech Stack

* **Backend:** FastAPI (Python 3.11+), SQLAlchemy, SQLite (with PostgreSQL toggle support), PyJWT, Bcrypt, Cryptography, Websockets.
* **Frontend:** Next.js 16 (App Router), React 19, TypeScript, Vanilla CSS (Premium Glassmorphic Dark Design).

---

## 💻 Local Installation & Setup

### 1. Prerequisites
Ensure you have **Python 3.11+** and **Node.js 18+** installed.

### 2. Backend Setup
1. Navigate to the backend directory:
   ```bash
   cd backend
   ```
2. Create and activate a virtual environment:
   ```bash
   python -m venv venv
   # On Windows:
   .\venv\Scripts\activate
   # On macOS/Linux:
   source venv/bin/activate
   ```
3. Install dependencies:
   ```bash
   pip install -r requirements.txt
   pip install cryptography websockets psycopg2-binary
   ```
4. Run the FastAPI development server:
   ```bash
   python main.py
   ```
   *The backend will run on `http://127.0.0.1:8000`.*

### 3. Frontend Setup
1. Navigate to the frontend directory:
   ```bash
   cd ../frontend
   ```
2. Install npm packages:
   ```bash
   npm install
   ```
3. Start the Next.js development server:
   ```bash
   npm run dev
   ```
   *The frontend will run on `http://localhost:3000`.*

---

## 🗄️ Database Configurations

You can toggle between **SQLite** and **PostgreSQL** inside `backend/database.py`:
```python
# Toggle database configuration
USE_POSTGRES = False  # Set to True to use PostgreSQL
```
When `USE_POSTGRES = True`, update the `DATABASE_URL` string with your PostgreSQL connection parameters.

---

## ☁️ Vercel Deployment

The frontend contains a `vercel.json` optimized for deploying Next.js apps with custom security headers (`X-Frame-Options`, `X-Content-Type-Options`, and `Referrer-Policy`) to block clickjacking and mime sniffing.
