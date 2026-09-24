import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import { Token, User, Session, SessionDetail, AuditLog, RiskAssessment, GeoIP, MFASetupResponse, StepUpStatus, DeviceFingerprint } from '../types';

const API_URL = import.meta.env.VITE_API_URL || '/api/v1';

const api = axios.create({
  baseURL: API_URL,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = localStorage.getItem('access_token');
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

let isRefreshing = false;
let failedQueue: Array<{ resolve: (value: unknown) => void; reject: (reason: unknown) => void }> = [];

const processQueue = (error: unknown, token: string | null = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });
  failedQueue = [];
};

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

    const isAuthEndpoint = originalRequest.url?.includes('/auth/login') || 
                           originalRequest.url?.includes('/auth/register') || 
                           originalRequest.url?.includes('/auth/refresh');

    if (error.response?.status === 401 && !originalRequest._retry && !isAuthEndpoint) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then((token) => {
            if (originalRequest.headers) {
              originalRequest.headers.Authorization = `Bearer ${token}`;
            }
            return api(originalRequest);
          })
          .catch((err) => Promise.reject(err));
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const refreshToken = localStorage.getItem('refresh_token');
        if (!refreshToken) {
          throw new Error('No refresh token');
        }

        const response = await axios.post(`${API_URL}/auth/refresh`, { refresh_token: refreshToken }, { withCredentials: true });
        const { access_token, refresh_token } = response.data;

        localStorage.setItem('access_token', access_token);
        localStorage.setItem('refresh_token', refresh_token);

        processQueue(null, access_token);

        if (originalRequest.headers) {
          originalRequest.headers.Authorization = `Bearer ${access_token}`;
        }

        return api(originalRequest);
      } catch (err) {
        processQueue(err, null);
        localStorage.removeItem('access_token');
        localStorage.removeItem('refresh_token');
        window.location.href = '/login';
        return Promise.reject(err);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);

export const authApi = {
  getMe: () => api.get<User>('/auth/me'),

  register: (data: { email: string; password: string; full_name?: string; device_fingerprint?: object }) =>
    api.post<User>('/auth/register', data),

  login: (data: { email: string; password: string; device_fingerprint?: object; remember_device?: boolean }) =>
    api.post<Token>('/auth/login', data),

  setupMFA: () => api.post<MFASetupResponse>('/auth/mfa/setup'),

  verifyMFA: (code: string) => api.post('/auth/mfa/verify', { code }),

  disableMFA: (code: string) => api.post('/auth/mfa/disable', { code }),

  mfaChallenge: (code: string, sessionId?: string) => api.post<Token>('/auth/mfa/challenge', { code, session_id: sessionId }),

  backupCode: (code: string, sessionId: string) => api.post<Token>('/auth/mfa/backup', { code, session_id: sessionId }),

  refresh: (refreshToken: string) => api.post<Token>('/auth/refresh', { refresh_token: refreshToken }),

  logout: () => api.post('/auth/logout'),

  logoutAll: () => api.post('/auth/logout-all'),

  getSessions: () => api.get<Session[]>('/auth/sessions'),

  getSession: (id: number) => api.get<SessionDetail>(`/auth/sessions/${id}`),

  revokeSession: (id: number, reason?: string) =>
    api.post(`/auth/sessions/${id}/revoke`, { reason }),

  stepUp: (sessionId: number, challengeType: string, code?: string) =>
    api.post<Token>('/auth/step-up', { session_id: sessionId, challenge_type: challengeType, code }),

  stepUpStatus: (sessionId: number) => api.get<StepUpStatus>(`/auth/step-up/status/${sessionId}`),

  getUserAuditLogs: (params?: { limit?: number }) =>
    api.get<AuditLog[]>('/auth/audit-logs', { params }),
};

export const adminApi = {
  getUsers: (params?: { limit?: number; offset?: number; search?: string }) =>
    api.get<User[]>('/admin/users', { params }),

  getSessions: (params?: { status?: string; risk_tier?: string; user_id?: number; limit?: number; offset?: number }) =>
    api.get<Session[]>('/admin/sessions', { params }),

  getSessionDetail: (id: number) => api.get<SessionDetail>(`/admin/sessions/${id}`),

  revokeSessions: (sessionIds: number[], reason: string) =>
    api.post('/admin/sessions/revoke', { session_ids: sessionIds, reason }),

  revokeAllUserSessions: (userId: number, reason: string) =>
    api.post(`/admin/users/${userId}/revoke-all`, { reason }),

  getAuditLogs: (params?: { limit?: number; offset?: number; action?: string; risk_tier?: string; user_id?: number }) =>
    api.get<AuditLog[]>('/admin/audit-logs', { params }),

  getRiskStats: () => api.get('/admin/risk/stats'),

  lookupGeo: (ip: string) => api.get<GeoIP>(`/admin/geo/${ip}`),

  assessRisk: (data: { user_id: number; ip: string; user_agent: string; device_fingerprint: object }) =>
    api.post<RiskAssessment>('/admin/risk/assess', data),
};

export const deviceApi = {
  registerFingerprint: (fingerprint: object) =>
    api.post<DeviceFingerprint>('/device/fingerprint', { fingerprint }),

  getFingerprints: () => api.get<DeviceFingerprint[]>('/device/fingerprints'),

  trustDevice: (id: number) => api.post(`/device/fingerprints/${id}/trust`),

  removeDevice: (id: number) => api.delete(`/device/fingerprints/${id}`),
};

export default api;