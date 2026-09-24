# HTH-CS-02: Risk-Tiered Secure Authentication Platform
## 24-Hour MVP Implementation Plan

---

## 🎯 Tech Stack Summary

| Layer | Technology |
|-------|------------|
| **Backend** | Python 3.11+ + FastAPI + Uvicorn |
| **Database** | SQLite (SQLModel/SQLAlchemy) |
| **Auth & Crypto** | `passlib[bcrypt]` (Argon2id), `pyotp`, `qrcode[pil]` |
| **Rate Limiting** | `slowapi` (Redis + in-memory fallback) |
| **Session/JWT** | `python-jose[cryptography]` |
| **Frontend** | React 18 + TypeScript + Vite + Tailwind CSS + Framer Motion |
| **State/Forms** | TanStack Query + React Hook Form + Zod |
| **Charts/Vis** | Recharts (session analytics) |
| **Testing** | pytest (backend) + Vitest + React Testing Library (frontend) |

---

## 🏗️ Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        React Dashboard (Port 5173)              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐              │
│  │ Login Page  │  │ MFA Setup   │  │ Admin Panel │              │
│  │ + Step-Up   │  │ (QR + OTP)  │  │ (Sessions)  │              │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘              │
└─────────┼────────────────┼────────────────┼─────────────────────┘
          │                │                │
          ▼                ▼                ▼
┌─────────────────────────────────────────────────────────────────┐
│                     FastAPI Backend (Port 8000)                 │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐              │
│  │ Auth Router │  │ Risk Engine │  │ Session Mgr │              │
│  │ (login,     │  │ (device,    │  │ (create,    │              │
│  │  register,  │  │  geo, IP,   │  │  list,      │              │
│  │  mfa,       │  │  anomaly)   │  │  revoke)    │              │
│  │  step-up)   │  │             │  │             │              │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘              │
└─────────┼────────────────┼────────────────┼─────────────────────┘
          │                │                │
          ▼                ▼                ▼
┌─────────────────────────────────────────────────────────────────┐
│                        SQLite Database                          │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐              │
│  │   Users     │  │  Sessions   │  │ Audit Logs  │              │
│  │ (password,  │  │ (device_fp, │  │ (action,    │              │
│  │  totp_secret,│  │  ip, risk,  │  │  timestamp, │              │
│  │  risk_profile)│  │  revoked)   │  │  metadata)  │              │
│  └─────────────┘  └─────────────┘  └─────────────┘              │
└─────────────────────────────────────────────────────────────────┘
```

---

## 📋 Detailed Task Breakdown

### Phase 1: Foundation & Core Auth (Hours 0-6)

#### 1.1 Project Setup (Hour 0-1)
- [ ] Initialize FastAPI project with `pyproject.toml` (Poetry/uv)
- [ ] Configure SQLite + SQLModel models (User, Session, AuditLog, DeviceFingerprint)
- [ ] Set up Alembic for migrations (even with SQLite)
- [ ] Configure `slowapi` with dual backend (Redis + in-memory)
- [ ] Set up logging, CORS, security headers middleware
- [ ] Create `.env.example` with all config options

#### 1.2 User Registration & Password Security (Hour 1-2)
- [ ] `POST /auth/register` - email, password, device fingerprint
- [ ] Argon2id hashing via `passlib` (memory_cost=65536, time_cost=3, parallelism=4)
- [ ] Password strength validation (zxcvbn or custom rules)
- [ ] Email normalization, uniqueness check
- [ ] Rate limit: 5 req/min per IP on register

#### 1.3 Login & JWT Session Creation (Hour 2-3)
- [ ] `POST /auth/login` - email, password, device_fp, ip, user_agent
- [ ] Verify Argon2id hash, constant-time comparison
- [ ] Generate JWT access token (15min) + refresh token (7 days)
- [ ] Create Session record with device_fp, IP, risk_score=0
- [ ] Set HttpOnly Secure cookies for tokens
- [ ] Rate limit: 10 req/min per IP, 5 req/min per email

#### 1.4 TOTP MFA Implementation (Hour 3-4)
- [ ] `POST /auth/mfa/setup` - returns QR code (base64 PNG) + secret + manual entry code
- [ ] `POST /auth/mfa/verify` - code verification, enables MFA on user
- [ ] `POST /auth/mfa/disable` - requires current code
- [ ] Store TOTP secret encrypted (AES-GCM with master key from env)
- [ ] Backup codes generation (10 codes, hashed with bcrypt)

#### 1.5 MFA-Enforced Login Flow (Hour 4-5)
- [ ] Modify login: if MFA enabled → return `mfa_required: true` + session_id
- [ ] `POST /auth/mfa/challenge` - verify TOTP code, issue tokens
- [ ] `POST /auth/mfa/backup` - verify backup code, invalidate it
- [ ] Rate limit MFA attempts: 5 req/min per session

#### 1.6 Token Refresh & Logout (Hour 5-6)
- [ ] `POST /auth/refresh` - rotate refresh token, detect reuse (revoke chain)
- [ ] `POST /auth/logout` - revoke current session
- [ ] `POST /auth/logout-all` - revoke all user sessions (requires password/MFA)
- [ ] JWT blacklist in SQLite for immediate revocation

---

### Phase 2: Risk Engine & Step-Up Auth (Hours 6-12)

#### 2.1 Device Fingerprinting (Hour 6-7)
- [ ] Client-side fingerprint script (Canvas, WebGL, fonts, screen, timezone, language)
- [ ] `POST /auth/device/fingerprint` - receive and hash fingerprint (SHA-256)
- [ ] Store known devices per user (nickname, last_seen, trusted boolean)
- [ ] Device trust scoring: trusted=0.0, known=0.3, unknown=0.7

#### 2.2 Geo/IP Risk Scoring (Hour 7-8)
- [ ] Integrate `ipapi.co` or `ipinfo.io` (free tier) for IP geolocation
- [ ] Cache results in Redis (24hr TTL)
- [ ] Risk factors:
  - New country: +0.4
  - New city: +0.2
  - VPN/Proxy/Tor detection: +0.5
  - Impossible travel (time since last login < flight time): +0.8

#### 2.3 Behavioral Anomaly Detection (Hour 8-9)
- [ ] Track login patterns per user: typical hours, days, session duration
- [ ] Statistical anomaly: login at unusual hour (+0.3), unusual day (+0.2)
- [ ] Session velocity: >3 logins/hour from different IPs (+0.5)
- [ ] Failed login streak: >5 failures in 15min (+0.6)

#### 2.4 Risk Tier Classification (Hour 9-10)
| Tier | Score Range | Action |
|------|-------------|--------|
| **Low** | 0.0 - 0.3 | Allow, log only |
| **Medium** | 0.3 - 0.6 | Require MFA (if not done), email alert |
| **High** | 0.6 - 0.8 | Step-up: MFA + device approval email |
| **Critical** | 0.8 - 1.0 | Block + admin alert + lock account 15min |

#### 2.5 Step-Up Authentication Flow (Hour 10-11)
- [ ] `POST /auth/step-up` - triggered by risk engine
- [ ] Challenge types: TOTP, Email OTP (6-digit, 10min), Device approval link
- [ ] `POST /auth/step-up/verify` - verify challenge, update session risk
- [ ] `GET /auth/step-up/status/:session_id` - polling for device approval
- [ ] Email templates for step-up challenges

#### 2.6 Risk Engine Integration & Testing (Hour 11-12)
- [ ] Wire risk engine into login flow (after password, before token issuance)
- [ ] Create test accounts with simulated risk scenarios
- [ ] Unit tests for each risk factor
- [ ] Integration test: new device → medium → MFA challenge
- [ ] Integration test: impossible travel → critical → block

---

### Phase 3: Session Governance Dashboard (Hours 12-18)

#### 3.1 React Project Setup (Hour 12-13)
- [ ] `npm create vite@latest frontend -- --template react-ts`
- [ ] Install: Tailwind CSS, Framer Motion, TanStack Query, React Hook Form, Zod, Recharts, Lucide React, Sonner (toasts)
- [ ] Configure path aliases, ESLint, Prettier
- [ ] Set up API client with Axios + interceptors (auto-refresh)
- [ ] Auth context + protected routes

#### 3.2 Login Page with Animations (Hour 13-14)
- [ ] Animated form transitions (Framer Motion)
- [ ] Password strength meter (zxcvbn)
- [ ] Device fingerprint collection on mount
- [ ] "Remember device" checkbox
- [ ] Error states with shake animation
- [ ] Loading skeletons during auth

#### 3.3 MFA Setup & Challenge Pages (Hour 14-15)
- [ ] QR code display with animated SVG
- [ ] Manual entry fallback (copy button, animated secret reveal)
- [ ] TOTP verification with 30s countdown timer (animated progress ring)
- [ ] Backup codes display (copy all, download .txt)
- [ ] Step-up challenge page (MFA / Email OTP / Device approval)

#### 3.4 Admin Dashboard - Session Management (Hour 15-17)
- [ ] **Sessions Table** (TanStack Table):
  - Columns: User, Device, IP, Location, Risk Tier, Status, Last Activity, Actions
  - Real-time updates via WebSocket/SSE
  - Row expansion for details (fingerprint, risk factors, timeline)
- [ ] **Bulk Actions**: Revoke selected, Revoke all for user, Export CSV
- [ ] **Filters**: Risk tier, date range, user search, device type
- [ ] **Session Detail Modal**: Map (Leaflet), device info, risk breakdown, audit trail

#### 3.5 Admin Dashboard - Analytics & Audit (Hour 17-18)
- [ ] **Risk Distribution Chart** (Recharts donut)
- [ ] **Login Timeline** (area chart: success/failed/step-up)
- [ ] **Geo Heatmap** (world map with login concentrations)
- [ ] **Audit Log Table**: pagination, search, export
- [ ] **Real-time Alerts Panel**: slide-in notifications for high-risk events
- [ ] Keyboard shortcuts (Cmd+K command palette)

---

### Phase 4: Polish, Testing & Demo Prep (Hours 18-24)

#### 4.1 Backend Testing (Hour 18-20)
- [ ] Unit tests: hashing, TOTP, risk scoring, rate limiting
- [ ] Integration tests: full login flows, MFA, step-up, session revocation
- [ ] Load test rate limiting (locust/k6): 100 req/s burst
- [ ] Security tests: timing attacks, SQL injection, XSS in audit logs
- [ ] Coverage target: >80%

#### 4.2 Frontend Testing (Hour 20-21)
- [ ] Component tests: forms, tables, modals, animations
- [ ] E2E tests (Playwright): login → MFA → dashboard → revoke session
- [ ] Visual regression (Chromatic or manual)
- [ ] Accessibility audit (axe-core)

#### 4.3 Demo Data & Scenarios (Hour 21-22)
- [ ] Seed script: 10 users, 50 sessions, varied risk profiles
- [ ] Scenario 1: Normal login (low risk)
- [ ] Scenario 2: New device login (medium → MFA)
- [ ] Scenario 3: Impossible travel (critical → block)
- [ ] Scenario 4: Brute force attempt (rate limit trigger)
- [ ] Scenario 5: Admin revokes all sessions during "incident"

#### 4.4 Documentation & Runbook (Hour 22-23)
- [ ] README with architecture diagram, setup, run commands
- [ ] API docs (FastAPI auto-generated `/docs`)
- [ ] Demo script with exact commands and expected outputs
- [ ] Troubleshooting guide

#### 4.5 Final Polish & Rehearsal (Hour 23-24)
- [ ] End-to-end demo run
- [ ] Fix any flaky tests
- [ ] Performance optimization (query indexing, bundle size)
- [ ] Prepare presentation slides (5 min)

---

## ⚠️ Risk Mitigation

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Rate limiting not effective in demo | Medium | High | Pre-test with locust; show live metrics |
| SQLite concurrency issues | Low | Medium | Use WAL mode; connection pooling |
| TOTP time sync issues | Low | High | Allow ±1 window; show server time |
| Frontend animations too heavy | Medium | Medium | Reduce motion prefers-reduced-motion |
| Email service not working | Medium | Medium | Mock email service; log to console |
| Redis unavailable | Low | Medium | In-memory fallback auto-enabled |

---

## 📦 Deliverables Checklist

- [ ] **Backend API** (`/auth/*`, `/admin/*`, `/risk/*`)
- [ ] **Frontend Dashboard** (login, MFA, admin panel)
- [ ] **SQLite Database** with seed data
- [ ] **Docker Compose** (backend, frontend, Redis)
- [ ] **Test Suite** (backend + frontend)
- [ ] **README + Demo Script**
- [ ] **Architecture Diagram** (Mermaid in README)

---

## 🚀 Quick Start Commands

```bash
# Backend
cd backend
cp .env.example .env
poetry install  # or uv sync
poetry run alembic upgrade head
poetry run uvicorn app.main:app --reload --port 8000

# Frontend
cd frontend
npm install
npm run dev  # Port 5173

# Demo
docker compose up -d  # Starts Redis + backend + frontend
```

---

## 🎬 Demo Script (5 Minutes)

1. **Register** new user → see password strength → MFA setup (QR + manual)
2. **Login** with MFA → see session created in dashboard
3. **Simulate new device** (clear fingerprint) → step-up challenge
4. **Admin dashboard** → filter high-risk → revoke session → see real-time update
5. **Brute force** demo → rate limit kicks in → show logs
6. **Audit log** → export CSV

---

## ❓ Open Questions (Resolved)

| Question | Decision |
|----------|----------|
| Backend language | Python + FastAPI |
| Database | SQLite |
| Frontend | React + Tailwind + Framer Motion |
| TOTP library | pyotp |
| QR codes | Yes (QR + manual entry) |
| Rate limiting | Redis + in-memory (configurable) |
| Testing | Unit + integration + E2E |

---

**Ready to start?** Say "start" and I'll begin implementation with Phase 1.