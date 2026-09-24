import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter } from 'react-router-dom'
import { AuthProvider } from '../context/AuthContext'
import { DashboardPage } from '../pages/DashboardPage'
import { AdminDashboard } from '../pages/AdminDashboard'

vi.mock('../services/api', () => ({
  authApi: {
    getMe: vi.fn().mockResolvedValue({ data: { id: 1, email: 'test@example.com', is_superuser: false, mfa_enabled: false } }),
    getSessions: vi.fn().mockResolvedValue({
      data: [{
        id: 1,
        ip_address: '127.0.0.1',
        user_agent: 'Mozilla',
        country: 'Local',
        city: 'Localhost',
        risk_score: 0.2,
        risk_tier: 'low',
        risk_factors: {},
        status: 'active',
        created_at: '2026-09-24T10:00:00Z',
        last_activity_at: '2026-09-24T10:00:00Z',
        expires_at: '2026-10-01T10:00:00Z',
      }]
    }),
    getUserAuditLogs: vi.fn().mockResolvedValue({ data: [] }),
    logout: vi.fn().mockResolvedValue({}),
    logoutAll: vi.fn().mockResolvedValue({}),
  },
  adminApi: {
    getSessions: vi.fn().mockResolvedValue({ data: [] }),
    getRiskStats: vi.fn().mockResolvedValue({ data: { risk_distribution: { low: 1 } } }),
    getSessionDetail: vi.fn().mockResolvedValue({ data: {} }),
  }
}))

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 1, email: 'test@example.com', is_superuser: false, mfa_enabled: false },
    token: { access_token: 'fake', refresh_token: 'fake', token_type: 'bearer', expires_in: 900 },
    isLoading: false,
    isAuthenticated: true,
    login: vi.fn(),
    logout: vi.fn(),
    logoutAll: vi.fn(),
    refreshUser: vi.fn(),
    setTokens: vi.fn(),
    clearAuth: vi.fn(),
  }),
  AuthProvider: ({ children }: any) => <div>{children}</div>
}))

describe('Dashboard Rendering', () => {
  it('renders DashboardPage without crashing', () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <DashboardPage />
        </BrowserRouter>
      </QueryClientProvider>
    )
  })

  it('renders AdminDashboard without crashing', () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <AdminDashboard />
        </BrowserRouter>
      </QueryClientProvider>
    )
  })
})
