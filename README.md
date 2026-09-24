# Risk-Tiered Secure Authentication Platform with Session Governance

A production-ready authentication platform featuring adaptive multi-factor authentication (MFA), risk-based step-up authentication, and an enterprise session governance dashboard.

## Features

### Core Authentication
- **Argon2id Password Hashing** - Memory-hard, side-channel resistant
- **JWT Access + Refresh Tokens** - Short-lived access (15min), rotating refresh (7 days)
- **TOTP MFA** - QR code + manual entry + 10 backup codes
- **Device Fingerprinting** - Canvas, WebGL, fonts, audio, battery, navigator
- **HttpOnly Secure Cookies** - XSS-resistant token storage

### Risk Engine
- **Device Recognition** - New/known/trusted device scoring
- **Geo-IP Analysis** - Country/city changes, VPN/Proxy/Tor detection
- **Impossible Travel** - Physics-based travel time validation
- **Behavioral Anomalies** - Unusual hours, days, login velocity
- **4-Tier Risk Classification** - Low/Medium/High/Critical with automated responses

### Step-Up Authentication
- **TOTP Challenge** - For enrolled users
- **Email OTP** - 6-digit codes (mocked for demo)
- **Device Approval** - Push notification simulation

### Session Governance Dashboard
- **Real-time Session Table** - Sortable, filterable, paginated
- **Bulk Revocation** - Select multiple sessions, one-click revoke
- **Session Detail Modal** - Risk breakdown, device info, audit trail
- **Risk Analytics** - Distribution charts, geo heatmap, login timeline
- **Audit Log** - Complete action history with search/export

### Security Features
- **Rate Limiting** - Redis-backed with in-memory fallback (configurable)
- **Brute Force Protection** - Per-IP and per-email limits
- **Token Rotation** - Refresh token reuse detection
- **Audit Logging** - All security events with risk context

## Tech Stack

| Layer | Technology |
|-------|------------|
| Backend | Python 3.11 + FastAPI + SQLModel |
| Database | SQLite (dev) / PostgreSQL (prod) |
| Auth | Argon2id, pyotp, python-jose |
| Rate Limiting | slowapi + Redis / In-memory |
| Frontend | React 18 + TypeScript + Vite |
| Styling | Tailwind CSS + Framer Motion |
| State | TanStack Query + React Hook Form |
| Charts | Recharts |

## Quick Start (One Command Execution)

The platform comes with a unified runner and 1-click batch scripts:

### 1. Launch Platform (Backend + Frontend + Seeding)
```bash
python run.py
# Or on Windows, double-click: start.bat
```
This automatically:
- Sets up `.env` from `.env.example` if needed
- Checks for Redis/Docker; gracefully falls back to built-in in-memory rate limiting if Docker/Redis is not running
- Seeds demo users, devices, and sessions
- Launches FastAPI backend at `http://localhost:8000`
- Launches Vite React frontend at `http://localhost:5173`

### 2. Run Automated Test Suite
```bash
python run.py --test
# Or on Windows, double-click: test.bat
```
Runs both:
- **Backend Tests (`pytest`):** 33/33 integration, TOTP, and security tests passing
- **Frontend Tests (`vitest`):** 22/22 component, utility, and auth context tests passing
- **Total:** 55/55 tests passing cleanly

### 3. Run Security & Rate-Limiting Simulation
```bash
python run.py --bruteforce
```
Simulates brute force attacks and validates per-IP, per-email, and login rate limiting.

### 4. Run Interactive Demo
```bash
python run.py --demo
# Or on Windows, double-click: demo.bat
```

### 5. Build Frontend Production Bundle
```bash
python run.py --build
```

## Demo Accounts

After seeding:
| Email | Password | MFA | Role |
|-------|----------|-----|------|
| user1@example.com | Password123! | ✅ | Admin |
| user2@example.com | Password123! | ✅ | User |
| user3@example.com | Password123! | ✅ | User |
| user4@example.com | Password123! | ✅ | User |
| user5@example.com | Password123! | ✅ | User |
| user6-10@example.com | Password123! | ❌ | User |

## Demo Scenarios

1. **Normal Login** - user1: Low risk, direct access
2. **New Device** - user2: Medium risk → MFA challenge
3. **VPN + New Country** - user3: High risk → Step-up required
4. **Impossible Travel** - user4: Critical risk → Blocked
5. **Brute Force** - Rapid failed logins → Rate limited

## API Endpoints

### Authentication
```
POST   /api/v1/auth/register          # Register new user
POST   /api/v1/auth/login             # Login (returns MFA challenge if needed)
POST   /api/v1/auth/mfa/setup         # Get MFA QR code + secret
POST   /api/v1/auth/mfa/verify        # Verify MFA code
POST   /api/v1/auth/mfa/challenge     # Verify MFA during login
POST   /api/v1/auth/mfa/backup        # Use backup code
POST   /api/v1/auth/refresh           # Refresh access token
POST   /api/v1/auth/logout            # Revoke current session
POST   /api/v1/auth/logout-all        # Revoke all sessions
GET    /api/v1/auth/sessions          # List user sessions
GET    /api/v1/auth/sessions/{id}     # Get session details
POST   /api/v1/auth/step-up           # Complete step-up challenge
GET    /api/v1/auth/step-up/status/{id} # Check step-up status
```

### Admin (requires superuser)
```
GET    /api/v1/admin/users            # List users
GET    /api/v1/admin/sessions         # List all sessions (with filters)
GET    /api/v1/admin/sessions/{id}    # Session details + audit logs
POST   /api/v1/admin/sessions/revoke  # Bulk revoke sessions
POST   /api/v1/admin/users/{id}/revoke-all # Revoke all user sessions
GET    /api/v1/admin/audit-logs       # Audit logs (with filters)
GET    /api/v1/admin/risk/stats       # Risk statistics
GET    /api/v1/admin/geo/{ip}         # Geo-IP lookup
POST   /api/v1/admin/risk/assess      # Manual risk assessment
```

### Device Management
```
POST   /api/v1/device/fingerprint     # Register device fingerprint
GET    /api/v1/device/fingerprints    # List known devices
POST   /api/v1/device/fingerprints/{id}/trust # Mark device trusted
DELETE /api/v1/device/fingerprints/{id}       # Remove device
```

## Configuration

Key environment variables (`.env`):

```bash
# Security (CHANGE IN PRODUCTION!)
SECRET_KEY=your-32-char-secret
ENCRYPTION_KEY=your-32-char-key

# Database
DATABASE_URL=sqlite+aiosqlite:///./auth.db

# Rate Limiting
REDIS_URL=redis://localhost:6379  # Optional
RATE_LIMIT_LOGIN=10/minute
RATE_LIMIT_REGISTER=5/minute

# MFA
TOTP_ISSUER=MyApp
BACKUP_CODES_COUNT=10

# Risk Engine
RISK_ENABLED=true
RISK_LOW_THRESHOLD=0.3
RISK_MEDIUM_THRESHOLD=0.6
RISK_HIGH_THRESHOLD=0.8
```

## Testing

```bash
# Backend tests
cd backend
pytest -v --cov=app

# Frontend tests
cd frontend
npm test
```

## Project Structure

```
backend/
├── app/
│   ├── api/           # Route handlers
│   ├── core/          # Configuration
│   ├── db/            # Database session
│   ├── models/        # SQLModel models
│   ├── schemas/       # Pydantic schemas
│   ├── services/      # Business logic
│   └── utils/         # Security, rate limit, geo, device
├── seed.py            # Demo data generator
└── pyproject.toml

frontend/
├── src/
│   ├── components/    # Reusable UI components
│   ├── context/       # React context providers
│   ├── hooks/         # Custom hooks
│   ├── pages/         # Page components
│   ├── services/      # API clients
│   ├── types/         # TypeScript types
│   └── utils/         # Helpers
├── package.json
└── tailwind.config.js
```

## Security Considerations

- Passwords hashed with Argon2id (OWASP recommended)
- Tokens in HttpOnly cookies, not localStorage
- Rate limiting on all auth endpoints
- CSRF protection via SameSite cookies
- Security headers (CSP, HSTS, etc.)
- Input validation with Pydantic/Zod
- SQL injection prevention via SQLModel
- XSS prevention via React's auto-escaping

## Production Deployment

1. Set strong `SECRET_KEY` and `ENCRYPTION_KEY`
2. Use PostgreSQL: `DATABASE_URL=postgresql+asyncpg://user:pass@host/db`
3. Enable Redis: `REDIS_URL=redis://redis:6379`
4. Set `SESSION_COOKIE_SECURE=true`
5. Configure real SMTP for email OTP
6. Use reverse proxy (nginx) with TLS
7. Enable audit log retention policy

## License

MIT License - See LICENSE file for details.
>>>>>>> 784c6e1 (Initial commit:Risk-Tiered-Secure-Authentication-Platform-with-Session-Governance)
