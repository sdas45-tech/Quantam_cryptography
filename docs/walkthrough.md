# Walkthrough - Production Scaling: Docker, Testing & CI/CD

Successfully containerized the QKD security portal and integrated production-ready configurations: Multi-stage Docker builds, PostgreSQL persistence, Redis caching, Nginx routing on port 80, automated Pytest coverage, and a GitHub Actions CI/CD pipeline.

---

## 🛠️ Files Created / Modified

### 1. Database & Cache Configuration
* **Modified** [database.py](file:///c:/Users/Sibam%20Das/OneDrive/Desktop/quantam_cryptography/backend/database.py): Updates the SQLAlchemy engine creation to load `DATABASE_URL` dynamically from environment variables, defaulting to local SQLite if none is provided.
* **Modified** [requirements.txt](file:///c:/Users/Sibam%20Das/OneDrive/Desktop/quantam_cryptography/backend/requirements.txt): Added testing (`pytest`, `httpx`), caching (`redis`), and migration (`alembic`) packages.

### 2. Reverse Proxy & Networking
* **New** [nginx.conf](file:///c:/Users/Sibam%20Das/OneDrive/Desktop/quantam_cryptography/nginx.conf):
  - Listens on port `80` to route incoming web traffic.
  - Routes `/api/` and `/docs` -> `http://backend:8000` (FastAPI).
  - Routes `/api/ws` -> `http://backend:8000/api/ws` with proper `Upgrade` & `Connection` headers for WebSockets.
  - Routes all other traffic -> `http://frontend:3000` (Next.js Next server).
* **Modified** [docker-compose.yml](file:///c:/Users/Sibam%20Das/OneDrive/Desktop/quantam_cryptography/docker-compose.yml):
  - Integrates **Nginx** reverse proxy service mapping port `80:80`.
  - Integrates **Redis** container (`redis:7-alpine`) mapping port `6379:6379`.
  - Modifies `NEXT_PUBLIC_API_URL` to `/api` so that Next.js queries backend API endpoints relatively through Nginx, bypassing CORS constraints.

### 3. Backend Test Suite
* **New** [test_main.py](file:///c:/Users/Sibam%20Das/OneDrive/Desktop/quantam_cryptography/backend/tests/test_main.py): Automatically tests API root health, QKD BB84 simulation outputs, AES-256 padding and encryption, and CRYSTALS-Dilithium signature signing integrity checks. All 4 tests compiled and passed locally.

### 4. GitHub Actions CI/CD Pipeline
* **New** [ci-cd.yml](file:///c:/Users/Sibam%20Das/OneDrive/Desktop/quantam_cryptography/.github/workflows/ci-cd.yml):
  - Automatically runs upon pushes/pull requests to the `main` branch.
  - Spins up Python 3.11 environment, installs dependencies, and runs `pytest`.
  - Audits that the Docker Compose configuration builds cleanly.

---

## 🌐 Networking Config

Inside `docker-compose.yml`, the network is set up as follows:
* **Host Resolution:** The FastAPI backend connects to Postgres using host `db` (the service name defined in compose) and to Redis using host `redis`.
* **Relative Queries:** The frontend Next.js app queries `/api`, allowing Nginx to route it to `backend:8000` dynamically.
* **Volume Persistence:** Persistent storage maps to the volumes `postgres_data` and `redis_data`.


---

## 🚀 CI/CD & Deployment Questions

### 1. Which files should be created now to make CI/CD easier later?
* We created the `.dockerignore` file, `Dockerfile`s, and `docker-compose.yml` now. In the future, a `.github/workflows/ci-cd.yml` config will be created to run automated testing, linting, and deploy scripts upon every push.

### 2. Which files should NOT be touched now?
* Do not touch business logic modules (`main.py`, `models.py`, `auth.py`, `page.tsx`) that manage key distributions and cryptographic pipelines. Keep them stable.

### 3. Which files will GitHub Actions vs Docker vs Developers use?
* **GitHub Actions will use:** `.github/workflows/ci-cd.yml`.
* **Docker will use:** `Dockerfile`s, `docker-compose.yml`, `.dockerignore`.
* **Developers edit regularly:** Source code files inside `frontend/src/app/` and `backend/*.py`.
* **Only for deployment:** `vercel.json` (serverless routing configurations) and production environment variables.

### 4. How the deployment workflow will work after every Git push:
1. Developer runs `git push origin main`.
2. GitHub Actions wakes up, checks out the code, and runs Python syntax/linter checks and Next.js builds.
3. If tests pass, GitHub Actions builds the Docker images and pushes them to a registry (like Docker Hub or GitHub Packages).
4. GitHub Actions SSHs into the remote deployment server (e.g. Render, AWS EC2, or VPS) and runs:
   ```bash
   docker compose pull
   docker compose up -d --remove-orphans
   ```
 5. The containerized app updates instantly without downtime.

---

## 🛠️ Recommended Stack Additions (OAuth, S3, SMTP, PWA)

We integrated the remaining recommended technologies, all equipped with **failover/local development modes** so that developers can test them offline without needing secret tokens or production hosting APIs:

1. **PWA Support:**
   - Added [manifest.json](file:///c:/Users/Sibam%20Das/OneDrive/Desktop/quantam_cryptography/frontend/public/manifest.json) containing metadata for standalone progressive installation.
   - Linked the manifest file in [layout.tsx](file:///c:/Users/Sibam%20Das/OneDrive/Desktop/quantam_cryptography/frontend/src/app/layout.tsx) so browser clients display installation promotions.

2. **SMTP Email Verification:**
   - Added a `send_otp_email` helper using `smtplib` and MIME HTML layouts.
   - If `SMTP_HOST` environment configurations are missing, it falls back to printing the registration verification code to the console for developers.

3. **AWS S3 File Storage:**
   - Implemented `boto3` integration in the upload and download routes.
   - If AWS credentials or bucket variables (`AWS_S3_BUCKET`) are set, files upload directly to S3.
   - **Fallback:** If keys are unset, it falls back to saving base64 ciphertexts directly in SQLite/PostgreSQL columns.

4. **Google OAuth Verification:**
   - Created `/api/auth/google` POST endpoint in FastAPI.
   - Added a **Sign in with Google** button in the React UI Auth modal.
    - **Fallback:** Prompts developers for their email address and authenticates instantly under mock settings when developer keys are offline.

---

## 💎 Optional Stack Extensions (Payments, Search, SMS, Analytics)

We integrated the optional SaaS extensions requested, complete with simulated developer fallbacks:

1. **Stripe & Razorpay Payment Gateways:**
   - Implemented checkout sessions creation at `/api/payments/stripe/create-session` and `/api/payments/razorpay/create-order`.
   - Wired payment method choices inside the frontend profile billing checkout terminal modal.
   - **Fallback:** Simulates successful checkouts and redirects users directly to `/api/payments/confirm` upgrading subscription tier status to **Pro** or **Enterprise** instantly.

2. **Elasticsearch & Meilisearch Index Lookup:**
   - Created `/api/files/search` endpoint performing fuzzy name and tag lookup matching score indices.
   - Replaced basic frontend search filters with index-based querying logic when search queries are typed.
   - **Fallback:** Conducts native database index search operations when search servers are offline.

3. **Twilio SMS Alerts:**
   - Configured `send_sms_alert` helper triggered when simulator QBER exceeds secure limits (indicating eavesdropping).
   - **Fallback:** Prints SMS warning alert details directly to standard output logging console.

4. **Analytics Tracking (Clarity & Google Analytics):**
   - Embedded script loading tags inside [layout.tsx](file:///c:/Users/Sibam%20Das/OneDrive/Desktop/quantam_cryptography/frontend/src/app/layout.tsx).
   - Activates conditionally when `NEXT_PUBLIC_GA_ID` or `NEXT_PUBLIC_CLARITY_ID` are configured.
