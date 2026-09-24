export interface User {
  id: number;
  email: string;
  full_name: string | null;
  is_active: boolean;
  is_superuser: boolean;
  mfa_enabled: boolean;
  created_at: string;
  last_login_at: string | null;
}

export interface Token {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
  mfa_required: boolean;
  session_id: string | null;
}

export interface DeviceFingerprint {
  id: number;
  fingerprint_hash: string;
  nickname: string | null;
  is_trusted: boolean;
  user_agent: string;
  created_at: string;
  last_seen_at: string;
}

export type RiskTier = 'low' | 'medium' | 'high' | 'critical';
export type SessionStatus = 'active' | 'revoked' | 'expired' | 'step_up_required' | 'blocked';

export interface Session {
  id: number;
  device_fingerprint_id: number | null;
  ip_address: string;
  user_agent: string;
  country: string | null;
  city: string | null;
  risk_score: number;
  risk_tier: RiskTier;
  risk_factors: Record<string, unknown>;
  status: SessionStatus;
  mfa_verified: boolean;
  step_up_completed: boolean;
  created_at: string;
  last_activity_at: string;
  expires_at: string;
  revoked_at: string | null;
  revoked_reason: string | null;
}

export interface SessionDetail extends Session {
  device_fingerprint: DeviceFingerprint | null;
  user: User | null;
  audit_logs: AuditLog[];
}

export interface AuditLog {
  id: number;
  action: string;
  description: string;
  ip_address: string;
  user_agent: string;
  risk_score: number;
  risk_tier: RiskTier;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface RiskAssessment {
  risk_score: number;
  risk_tier: RiskTier;
  risk_factors: Record<string, unknown>;
  requires_step_up: boolean;
  step_up_type: string | null;
}

export interface GeoIP {
  ip: string;
  country: string | null;
  country_code: string | null;
  city: string | null;
  region: string | null;
  latitude: number | null;
  longitude: number | null;
  isp: string | null;
  org: string | null;
  asn: string | null;
  timezone: string | null;
  is_vpn: boolean;
  is_proxy: boolean;
  is_tor: boolean;
}

export interface MFASetupResponse {
  secret: string;
  qr_code: string;
  manual_entry_key: string;
  backup_codes: string[];
}

export interface StepUpStatus {
  session_id: string;
  status: 'pending' | 'approved' | 'denied' | 'expired';
  challenge_type: string;
  expires_at: string;
}