import { Session, User, AuditLog, SessionDetail, RiskTier, SessionStatus } from '../types';
import { getCurrentTOTP, verifyTOTPCode, buildTOTPUri, generateQRCodeSvgDataUri } from '../utils/totp';

interface StoredData {

  currentUser: User | null;
  users: User[];
  sessions: Session[];
  auditLogs: AuditLog[];
}

const STORAGE_KEY = 'hth_auth_mock_db';

/**
 * Generate standard Argon2id password hash format matching FastAPI / argon2-cffi:
 * $argon2id$v=19$m=65536,t=3,p=4$<salt>$<hash>
 */
export function generateArgon2idHash(password: string): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let seed = 0;
  for (let i = 0; i < password.length; i++) {
    seed = (seed * 31 + password.charCodeAt(i)) >>> 0;
  }
  let salt = '';
  for (let i = 0; i < 22; i++) {
    salt += chars.charAt((seed + i * 11) % chars.length);
  }
  let hash = '';
  for (let i = 0; i < 43; i++) {
    hash += chars.charAt((seed * (i + 3) + 19) % chars.length);
  }
  return `$argon2id$v=19$m=65536,t=3,p=4$${salt}$${hash}`;
}

function getInitialData(): StoredData {
  const now = new Date().toISOString();
  const past = new Date(Date.now() - 3600000).toISOString();

  const sudoUser: User = {
    id: 1,
    email: 'sudouser@gmail.com',
    full_name: 'Supreme Administrator',
    is_active: true,
    is_superuser: true,
    mfa_enabled: false,
    created_at: past,
    last_login_at: now,
    password_hash: '$argon2id$v=19$m=65536,t=3,p=4$q6Zp3P8vX1yW2zR4tU6oPq$F8e/Q4X6k5zY19bL7vWwJ1mH0q9R2sT4uV8xY1aB2c',
  };

  const demoUser: User = {
    id: 2,
    email: 'user1@example.com',
    full_name: 'Alice Demo User',
    is_active: true,
    is_superuser: false,
    mfa_enabled: true,
    created_at: past,
    last_login_at: now,
    password_hash: '$argon2id$v=19$m=65536,t=3,p=4$c29tZXNhbHQxMjM0NTY3OA$K3jL8nO1pQ2rS4tU5vW6xY7zA8bC9dE0fG1hI2jK3l',
  };

  const user2: User = {
    id: 3,
    email: 'user2@example.com',
    full_name: 'Bob Tiered User',
    is_active: true,
    is_superuser: false,
    mfa_enabled: false,
    created_at: past,
    last_login_at: now,
    password_hash: '$argon2id$v=19$m=65536,t=3,p=4$YW5vdGhlcnNhbHQxMjM0NQ$Z4xY9wV2uT7sR5qP3oM1kI8hF6dC4bA2zX0vU8tS6r',
  };

  const user3: User = {
    id: 4,
    email: 'user3@example.com',
    full_name: 'Charlie Secure User',
    is_active: true,
    is_superuser: false,
    mfa_enabled: true,
    created_at: past,
    last_login_at: now,
    password_hash: '$argon2id$v=19$m=65536,t=3,p=4$dGhpcmRzYWx0ODk3NjU0MzI$M9kL5jH2gF8dC1aB4zX7vU0tS3rQ6oP9nM2kJ5hG8e',
  };

  const initialSessions: Session[] = [
    {
      id: 1,
      user_id: 1,
      device_fingerprint_id: 1,
      ip_address: '192.168.1.105',
      user_agent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/122.0',
      country: 'United States',
      city: 'San Francisco',
      risk_score: 0.12,
      risk_tier: 'low',
      risk_factors: {},
      status: 'active',
      mfa_verified: true,
      step_up_completed: true,
      created_at: past,
      last_activity_at: now,
      expires_at: new Date(Date.now() + 86400000 * 7).toISOString(),
      revoked_at: null,
      revoked_reason: null,
    },
    {
      id: 2,
      user_id: 1,
      device_fingerprint_id: 2,
      ip_address: '10.10.54.104',
      user_agent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_3 like Mac OS X)',
      country: 'United States',
      city: 'San Jose',
      risk_score: 0.25,
      risk_tier: 'low',
      risk_factors: {},
      status: 'active',
      mfa_verified: true,
      step_up_completed: true,
      created_at: past,
      last_activity_at: now,
      expires_at: new Date(Date.now() + 86400000 * 7).toISOString(),
      revoked_at: null,
      revoked_reason: null,
    },
    {
      id: 3,
      user_id: 2,
      device_fingerprint_id: 3,
      ip_address: '198.51.100.42',
      user_agent: 'Mozilla/5.0 (Linux; Android 14) Chrome/121.0',
      country: 'Germany',
      city: 'Frankfurt',
      risk_score: 0.72,
      risk_tier: 'high',
      risk_factors: { new_country: { weight: 0.4 }, unusual_hour: { weight: 0.3 } },
      status: 'step_up_required',
      mfa_verified: false,
      step_up_completed: false,
      created_at: now,
      last_activity_at: now,
      expires_at: new Date(Date.now() + 86400000 * 7).toISOString(),
      revoked_at: null,
      revoked_reason: null,
    },
  ];

  const initialAuditLogs: AuditLog[] = [
    {
      id: 1,
      action: 'login_success',
      description: 'Successful authentication for sudouser@gmail.com',
      ip_address: '192.168.1.105',
      user_agent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      risk_score: 0.12,
      risk_tier: 'low',
      metadata: {},
      created_at: past,
    },
    {
      id: 2,
      action: 'step_up_challenge',
      description: 'High risk login triggered step-up challenge',
      ip_address: '198.51.100.42',
      user_agent: 'Mozilla/5.0 (Linux; Android 14)',
      risk_score: 0.72,
      risk_tier: 'high',
      metadata: {},
      created_at: now,
    },
  ];

  return {
    currentUser: null,
    users: [sudoUser, demoUser, user2, user3],
    sessions: initialSessions,
    auditLogs: initialAuditLogs,
  };
}

function loadData(): StoredData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed: StoredData = JSON.parse(raw);
      let updated = false;
      parsed.users.forEach(u => {
        if (!u.password_hash) {
          u.password_hash = generateArgon2idHash(u.email === 'sudouser@gmail.com' ? 'supremeuser' : 'Password123!');
          updated = true;
        }
      });
      if (parsed.currentUser && !parsed.currentUser.password_hash) {
        parsed.currentUser.password_hash = generateArgon2idHash(parsed.currentUser.email === 'sudouser@gmail.com' ? 'supremeuser' : 'Password123!');
        updated = true;
      }
      if (updated) saveData(parsed);
      return parsed;
    }
  } catch {
    // fallback
  }
  const initial = getInitialData();
  saveData(initial);
  return initial;
}

function saveData(data: StoredData) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // ignore
  }
}

export function getMockOTP(secret: string = 'JBSWY3DPEHPK3PXP') {
  return getCurrentTOTP(secret);
}

export function normalizeApiUrl(url: string): string {
  if (!url) return '';
  let clean = url.replace(/^[a-zA-Z]+:\/\/[^/]+/, '');
  clean = clean.split('?')[0];
  clean = clean.replace(/^\/?api\/v1\/?/, '/');
  if (!clean.startsWith('/')) clean = '/' + clean;
  if (clean.endsWith('/') && clean.length > 1) clean = clean.slice(0, -1);
  return clean.toLowerCase();
}

export function handleMockRequest(url: string, method: string = 'GET', data?: any): { status: number; data: any } | null {
  const cleanUrl = normalizeApiUrl(url);
  const db = loadData();

  // Helper response wrapper
  const ok = (responseData: any) => ({ status: 200, data: responseData });
  const created = (responseData: any) => ({ status: 201, data: responseData });
  const badRequest = (detail: string) => ({ status: 400, data: { detail } });
  const unauthorized = (detail: string) => ({ status: 401, data: { detail } });
  const notFound = (detail: string) => ({ status: 404, data: { detail } });

  // 1. /auth/demo-otp
  if (cleanUrl === '/auth/demo-otp') {
    return ok(getMockOTP());
  }

  // 2. /auth/login
  if (cleanUrl === '/auth/login' && method.toUpperCase() === 'POST') {
    const { email, password } = data || {};
    const lowerEmail = (email || '').toLowerCase().trim();

    // Default Super Admin: sudouser@gmail.com / supremeuser
    if (lowerEmail === 'sudouser@gmail.com') {
      if (password !== 'supremeuser') {
        return unauthorized('Invalid credentials');
      }
      let sudo = db.users.find(u => u.email === 'sudouser@gmail.com');
      if (!sudo) {
        sudo = {
          id: 1,
          email: 'sudouser@gmail.com',
          full_name: 'Supreme Admin',
          is_active: true,
          is_superuser: true,
          mfa_enabled: false,
          created_at: new Date().toISOString(),
          last_login_at: new Date().toISOString(),
        };
        db.users.push(sudo);
      }
      db.currentUser = sudo;

      const newSession: Session = {
        id: db.sessions.length + 1,
        user_id: sudo.id,
        device_fingerprint_id: 1,
        ip_address: '127.0.0.1 (Netlify Demo)',
        user_agent: navigator.userAgent,
        country: 'Global',
        city: 'Netlify Edge',
        risk_score: 0.05,
        risk_tier: 'low',
        risk_factors: {},
        status: sudo.mfa_enabled ? 'step_up_required' : 'active',
        mfa_verified: !sudo.mfa_enabled,
        step_up_completed: !sudo.mfa_enabled,
        created_at: new Date().toISOString(),
        last_activity_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 86400000 * 7).toISOString(),
        revoked_at: null,
        revoked_reason: null,
      };
      db.sessions.unshift(newSession);
      saveData(db);

      if (sudo.mfa_enabled) {
        return ok({
          access_token: '',
          refresh_token: '',
          token_type: 'bearer',
          expires_in: 0,
          mfa_required: true,
          session_id: String(newSession.id),
          step_up_type: 'totp',
        });
      }

      return ok({
        access_token: 'mock-token-sudo-' + Date.now(),
        refresh_token: 'mock-refresh-sudo-' + Date.now(),
        token_type: 'bearer',
        expires_in: 3600,
        mfa_required: false,
        session_id: String(newSession.id),
      });
    }

    // Demo Normal User: user1@example.com / Password123!
    if (lowerEmail === 'user1@example.com') {
      if (password !== 'Password123!') {
        return unauthorized('Invalid credentials');
      }
      let user1 = db.users.find(u => u.email === 'user1@example.com');
      if (!user1) {
        user1 = {
          id: 2,
          email: 'user1@example.com',
          full_name: 'Alice Demo User',
          is_active: true,
          is_superuser: false,
          mfa_enabled: true,
          created_at: new Date().toISOString(),
          last_login_at: new Date().toISOString(),
        };
        db.users.push(user1);
      }
      db.currentUser = user1;

      const pendingSession: Session = {
        id: db.sessions.length + 1,
        user_id: user1.id,
        device_fingerprint_id: 4,
        ip_address: '198.51.100.99',
        user_agent: navigator.userAgent,
        country: 'United States',
        city: 'New York',
        risk_score: 0.65,
        risk_tier: 'medium',
        risk_factors: { new_device: { weight: 0.4 } },
        status: 'step_up_required',
        mfa_verified: false,
        step_up_completed: false,
        created_at: new Date().toISOString(),
        last_activity_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 86400000 * 7).toISOString(),
        revoked_at: null,
        revoked_reason: null,
      };
      db.sessions.unshift(pendingSession);
      saveData(db);

      return ok({
        access_token: '',
        refresh_token: '',
        token_type: 'bearer',
        expires_in: 0,
        mfa_required: true,
        session_id: String(pendingSession.id),
        step_up_type: 'device_approval',
      });
    }

    // Other users: if password is valid (non-empty), log in as normal user
    if (password && password.length >= 6) {
      let u = db.users.find(x => x.email.toLowerCase() === lowerEmail);
      if (!u) {
        u = {
          id: db.users.length + 1,
          email: lowerEmail,
          full_name: lowerEmail.split('@')[0],
          is_active: true,
          is_superuser: false,
          mfa_enabled: false,
          created_at: new Date().toISOString(),
          last_login_at: new Date().toISOString(),
        };
        db.users.push(u);
      }
      db.currentUser = u;

      const newSess: Session = {
        id: db.sessions.length + 1,
        user_id: u.id,
        device_fingerprint_id: null,
        ip_address: '127.0.0.1 (Netlify)',
        user_agent: navigator.userAgent,
        country: 'Global',
        city: 'Local Edge',
        risk_score: 0.1,
        risk_tier: 'low',
        risk_factors: {},
        status: u.mfa_enabled ? 'step_up_required' : 'active',
        mfa_verified: !u.mfa_enabled,
        step_up_completed: !u.mfa_enabled,
        created_at: new Date().toISOString(),
        last_activity_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 86400000 * 7).toISOString(),
        revoked_at: null,
        revoked_reason: null,
      };
      db.sessions.unshift(newSess);
      saveData(db);

      if (u.mfa_enabled) {
        return ok({
          access_token: '',
          refresh_token: '',
          token_type: 'bearer',
          expires_in: 0,
          mfa_required: true,
          session_id: String(newSess.id),
          step_up_type: 'totp',
        });
      }

      return ok({
        access_token: 'mock-token-' + u.id + '-' + Date.now(),
        refresh_token: 'mock-refresh-' + u.id + '-' + Date.now(),
        token_type: 'bearer',
        expires_in: 3600,
        mfa_required: false,
        session_id: String(newSess.id),
      });
    }

    return unauthorized('Invalid credentials');
  }

  // 3. /auth/register
  if (cleanUrl === '/auth/register' && method.toUpperCase() === 'POST') {
    const { email, password, full_name } = data || {};
    if (!email || !password) return badRequest('Email and password required');
    const newUser: User = {
      id: db.users.length + 1,
      email,
      full_name: full_name || email.split('@')[0],
      is_active: true,
      is_superuser: false,
      mfa_enabled: false,
      created_at: new Date().toISOString(),
      last_login_at: null,
      password_hash: generateArgon2idHash(password),
    };
    db.users.push(newUser);
    saveData(db);
    return created(newUser);
  }

  // 4. /auth/me
  if (cleanUrl === '/auth/me') {
    const user = db.currentUser || db.users[0]; // fallback to super admin if logged in
    return ok(user);
  }

  // 5. /auth/refresh
  if (cleanUrl === '/auth/refresh') {
    return ok({
      access_token: 'mock-token-refreshed-' + Date.now(),
      refresh_token: 'mock-refresh-token-' + Date.now(),
      token_type: 'bearer',
      expires_in: 3600,
    });
  }

  // 6. /auth/logout or /auth/logout-all
  if (cleanUrl === '/auth/logout' || cleanUrl === '/auth/logout-all') {
    db.currentUser = null;
    saveData(db);
    return ok({ message: 'Logged out successfully' });
  }

  // 7. /auth/pending-approvals
  if (cleanUrl === '/auth/pending-approvals') {
    const currentUserId = db.currentUser?.id || 1;
    const pending = db.sessions.filter(s => s.status === 'step_up_required' && (s.user_id === currentUserId || db.currentUser?.is_superuser));
    return ok(pending);
  }

  // 8. /auth/pending-approvals/:id/approve
  const approveMatch = cleanUrl.match(/^\/auth\/pending-approvals\/(\d+)\/approve$/);
  if (approveMatch) {
    const sid = parseInt(approveMatch[1], 10);
    const target = db.sessions.find(s => s.id === sid);
    if (target) {
      target.status = 'active';
      target.mfa_verified = true;
      target.step_up_completed = true;
      saveData(db);
      return ok({ status: 'approved', session_id: sid });
    }
    return notFound('Session not found');
  }

  // 9. /auth/pending-approvals/:id/deny
  const denyMatch = cleanUrl.match(/^\/auth\/pending-approvals\/(\d+)\/deny$/);
  if (denyMatch) {
    const sid = parseInt(denyMatch[1], 10);
    const target = db.sessions.find(s => s.id === sid);
    if (target) {
      target.status = 'blocked';
      target.revoked_reason = 'Denied by user';
      saveData(db);
      return ok({ status: 'denied', session_id: sid });
    }
    return notFound('Session not found');
  }

  // 10. /auth/step-up
  if (cleanUrl === '/auth/step-up') {
    const sid = data?.session_id;
    const target = db.sessions.find(s => s.id === Number(sid));
    if (target) {
      target.status = 'active';
      target.mfa_verified = true;
      target.step_up_completed = true;
      saveData(db);
    }
    return ok({
      access_token: 'mock-token-stepup-' + Date.now(),
      refresh_token: 'mock-refresh-stepup-' + Date.now(),
      token_type: 'bearer',
      expires_in: 3600,
    });
  }

  // 11. /auth/step-up/status/:id
  const statusMatch = cleanUrl.match(/^\/auth\/step-up\/status\/(\d+)$/);
  if (statusMatch) {
    const sid = parseInt(statusMatch[1], 10);
    const s = db.sessions.find(x => x.id === sid);
    return ok({
      session_id: String(sid),
      status: s?.status === 'step_up_required' ? 'pending' : (s?.status === 'blocked' ? 'denied' : 'approved'),
      challenge_type: 'device_approval',
      expires_at: new Date(Date.now() + 300000).toISOString(),
    });
  }

  // 12. /auth/sessions
  if (cleanUrl === '/auth/sessions') {
    const currentUserId = db.currentUser?.id || 1;
    const userSessions = db.sessions.filter(s => s.user_id === currentUserId);
    return ok(userSessions.length > 0 ? userSessions : db.sessions);
  }

  // 13. /auth/sessions/:id/revoke
  const revokeMatch = cleanUrl.match(/^\/auth\/sessions\/(\d+)\/revoke$/);
  if (revokeMatch) {
    const sid = parseInt(revokeMatch[1], 10);
    const s = db.sessions.find(x => x.id === sid);
    if (s) {
      s.status = 'revoked';
      s.revoked_at = new Date().toISOString();
      s.revoked_reason = data?.reason || 'User revoked';
      saveData(db);
      return ok({ message: 'Session revoked' });
    }
    return notFound('Session not found');
  }

  // 14. /auth/audit-logs
  if (cleanUrl === '/auth/audit-logs') {
    return ok(db.auditLogs);
  }

  // 15. /admin/sessions
  if (cleanUrl === '/admin/sessions') {
    return ok(db.sessions);
  }

  // 16. /admin/users or /auth/database-users
  if (cleanUrl === '/admin/users' || cleanUrl === '/auth/database-users') {
    return ok(db.users);
  }

  if (cleanUrl === '/auth/database-reset' && method.toUpperCase() === 'POST') {
    const initial = getInitialData();
    saveData(initial);
    return ok({ message: 'Database reset to initial state', users: initial.users });
  }

  // 17. /admin/risk/stats
  if (cleanUrl === '/admin/risk/stats') {
    const active = db.sessions.filter(s => s.status === 'active').length;
    const critical = db.sessions.filter(s => s.risk_tier === 'critical').length;
    const high = db.sessions.filter(s => s.risk_tier === 'high').length;
    const medium = db.sessions.filter(s => s.risk_tier === 'medium').length;
    const low = db.sessions.filter(s => s.risk_tier === 'low').length;
    return ok({
      total_sessions: db.sessions.length,
      active_sessions: active,
      risk_breakdown: { critical, high, medium, low },
      avg_risk_score: 0.28,
      blocked_count: db.sessions.filter(s => s.status === 'blocked').length,
    });
  }

  // 18. /admin/audit-logs
  if (cleanUrl === '/admin/audit-logs') {
    return ok(db.auditLogs);
  }

  // 19. /admin/sessions/revoke
  if (cleanUrl === '/admin/sessions/revoke') {
    const targetIds = (data?.session_ids || []).map((x: any) => String(x));
    let revokedCount = 0;
    db.sessions.forEach(s => {
      if (targetIds.includes(String(s.id))) {
        s.status = 'revoked';
        s.revoked_at = new Date().toISOString();
        s.revoked_reason = data?.reason || 'Admin revoked';
        revokedCount++;
      }
    });
    db.auditLogs.unshift({
      id: db.auditLogs.length + 1,
      action: 'session_revoked',
      description: `Session(s) revoked by administrator: ${data?.reason || 'Admin revoked'}`,
      ip_address: '127.0.0.1 (Netlify)',
      user_agent: navigator.userAgent,
      risk_score: 0.1,
      risk_tier: 'low',
      metadata: { session_ids: data?.session_ids },
      created_at: new Date().toISOString(),
    });
    saveData(db);
    return ok({ message: 'Sessions revoked', revoked: revokedCount });
  }

  // 20. /admin/users/:id/revoke-all or /admin/users/:id/revoke
  const revokeAllUserMatch = cleanUrl.match(/^\/admin\/users\/(\d+)\/(revoke-all|revoke)$/);
  if (revokeAllUserMatch) {
    const uid = String(revokeAllUserMatch[1]);
    let revokedCount = 0;
    db.sessions.forEach(s => {
      if (String(s.user_id) === uid) {
        s.status = 'revoked';
        s.revoked_at = new Date().toISOString();
        s.revoked_reason = data?.reason || 'Admin revoked all user sessions';
        revokedCount++;
      }
    });
    const targetUser = db.users.find(u => String(u.id) === uid);
    if (targetUser && !targetUser.is_superuser) {
      targetUser.is_active = false;
    }
    db.auditLogs.unshift({
      id: db.auditLogs.length + 1,
      action: 'user_revoked',
      description: `All sessions revoked for user #${uid} by administrator`,
      ip_address: '127.0.0.1 (Netlify)',
      user_agent: navigator.userAgent,
      risk_score: 0.1,
      risk_tier: 'low',
      metadata: { user_id: uid },
      created_at: new Date().toISOString(),
    });
    saveData(db);
    return ok({ message: 'All user sessions revoked', revoked: revokedCount });
  }

  // 21. /admin/sessions/:id (detail)
  const sessionDetailMatch = cleanUrl.match(/^\/admin\/sessions\/(\d+)$/);
  if (sessionDetailMatch) {
    const sid = String(sessionDetailMatch[1]);
    const s = db.sessions.find(sess => String(sess.id) === sid);
    if (s) {
      const u = db.users.find(user => String(user.id) === String(s.user_id));
      const audits = db.auditLogs.filter(a => String((a as any).session_id) === sid);
      return ok({
        ...s,
        user: u || null,
        audit_logs: audits,
      });
    }
    return notFound('Session not found');
  }

  // 21. MFA setup / verify / disable / challenge / backup
  if (cleanUrl === '/auth/mfa/setup') {
    const user = db.currentUser || db.users[0];
    const userEmail = user?.email || 'user@example.com';
    const secret = 'JBSWY3DPEHPK3PXP';
    const qrUri = buildTOTPUri(secret, userEmail, 'RiskAuth');
    const qrCode = generateQRCodeSvgDataUri(qrUri);
    const backupCodes = ['A1B2-C3D4', 'E5F6-G7H8', 'J9K0-L1M2', 'N3P4-Q5R6', 'P7R8-S9T0', 'U1V2-W3X4'];

    return ok({
      secret,
      qr_code: qrCode,
      manual_entry_key: secret,
      backup_codes: backupCodes,
    });
  }

  if (cleanUrl === '/auth/mfa/verify' && method.toUpperCase() === 'POST') {
    const code = data?.code;
    const secret = 'JBSWY3DPEHPK3PXP';
    const isValid =
      verifyTOTPCode(secret, code) ||
      code === getMockOTP(secret).code ||
      (typeof code === 'string' && code.trim().length === 6);

    if (!isValid) {
      return badRequest('Invalid verification code. Please enter the current 6-digit code.');
    }

    if (db.currentUser) {
      db.currentUser.mfa_enabled = true;
    }
    const currentId = db.currentUser?.id;
    const currentEmail = db.currentUser?.email?.toLowerCase();
    db.users.forEach(u => {
      if (u.id === currentId || (currentEmail && u.email.toLowerCase() === currentEmail)) {
        u.mfa_enabled = true;
      }
    });

    db.auditLogs.unshift({
      id: db.auditLogs.length + 1,
      action: 'mfa_enabled',
      description: `Two-factor authentication enabled for ${db.currentUser?.email || 'user'}`,
      ip_address: '127.0.0.1 (Netlify Edge)',
      user_agent: navigator.userAgent,
      risk_score: 0.05,
      risk_tier: 'low',
      metadata: {},
      created_at: new Date().toISOString(),
    });

    saveData(db);
    return ok({ message: 'MFA enabled successfully' });
  }

  if (cleanUrl === '/auth/mfa/disable' && method.toUpperCase() === 'POST') {
    if (db.currentUser) {
      db.currentUser.mfa_enabled = false;
    }
    const currentId = db.currentUser?.id;
    const currentEmail = db.currentUser?.email?.toLowerCase();
    db.users.forEach(u => {
      if (u.id === currentId || (currentEmail && u.email.toLowerCase() === currentEmail)) {
        u.mfa_enabled = false;
      }
    });

    db.auditLogs.unshift({
      id: db.auditLogs.length + 1,
      action: 'mfa_disabled',
      description: `Two-factor authentication disabled for ${db.currentUser?.email || 'user'}`,
      ip_address: '127.0.0.1 (Netlify Edge)',
      user_agent: navigator.userAgent,
      risk_score: 0.1,
      risk_tier: 'low',
      metadata: {},
      created_at: new Date().toISOString(),
    });

    saveData(db);
    return ok({ message: 'MFA disabled successfully' });
  }

  if (cleanUrl === '/auth/mfa/challenge' && method.toUpperCase() === 'POST') {
    const code = data?.code;
    const secret = 'JBSWY3DPEHPK3PXP';
    const isValid =
      verifyTOTPCode(secret, code) ||
      code === getMockOTP(secret).code ||
      (typeof code === 'string' && code.trim().length === 6);

    if (!isValid) {
      return unauthorized('Invalid MFA code');
    }
    const sid = data?.session_id;
    if (sid) {
      const target = db.sessions.find(s => String(s.id) === String(sid));
      if (target) {
        target.status = 'active';
        target.mfa_verified = true;
        target.step_up_completed = true;
      }
    }
    saveData(db);
    return ok({
      access_token: 'mock-token-mfa-' + Date.now(),
      refresh_token: 'mock-refresh-mfa-' + Date.now(),
      token_type: 'bearer',
      expires_in: 3600,
      mfa_required: false,
    });
  }

  if (cleanUrl === '/auth/mfa/backup' && method.toUpperCase() === 'POST') {
    const sid = data?.session_id;
    if (sid) {
      const target = db.sessions.find(s => String(s.id) === String(sid));
      if (target) {
        target.status = 'active';
        target.mfa_verified = true;
        target.step_up_completed = true;
      }
    }
    saveData(db);
    return ok({
      access_token: 'mock-token-backup-' + Date.now(),
      refresh_token: 'mock-refresh-backup-' + Date.now(),
      token_type: 'bearer',
      expires_in: 3600,
      mfa_required: false,
    });
  }

  // 22. Devices
  if (cleanUrl === '/device/fingerprints') {
    return ok([]);
  }

  // 23. Generic safety fallback for static Netlify hosting:
  // Guarantees no auth or admin endpoint ever resolves to null / HTML
  if (cleanUrl.startsWith('/auth/') || cleanUrl.startsWith('/admin/') || cleanUrl.startsWith('/device/')) {
    if (method.toUpperCase() === 'GET') {
      if (cleanUrl.endsWith('s') || cleanUrl.includes('logs') || cleanUrl.includes('list')) {
        return ok([]);
      }
      return ok({});
    }
    return ok({ success: true, message: 'Simulated action succeeded' });
  }

  return null;
}
