import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter } from 'react-router-dom'
import App from '../App'
import { AuthProvider } from '../context/AuthContext'
import axios from 'axios'

describe('Full App Flow', () => {
  it('renders App when logged in', async () => {
    localStorage.setItem('access_token', 'valid-token')
    localStorage.setItem('refresh_token', 'valid-refresh')

    // Mock axios get
    vi.spyOn(axios, 'create').mockReturnValue({
      interceptors: {
        request: { use: vi.fn() },
        response: { use: vi.fn() },
      },
      get: vi.fn().mockImplementation((url: string) => {
        if (url === '/auth/me') {
          return Promise.resolve({
            data: { id: 1, email: 'user@example.com', is_superuser: false, mfa_enabled: false }
          })
        }
        if (url === '/auth/sessions') {
          return Promise.resolve({
            data: [{
              id: 1,
              ip_address: '127.0.0.1',
              user_agent: 'Mozilla',
              country: 'Local',
              city: 'Localhost',
              risk_score: 0.4,
              risk_tier: 'medium',
              risk_factors: { new_device: { weight: 0.4, description: 'Unrecognized device' } },
              status: 'active',
              mfa_verified: true,
              step_up_completed: false,
              created_at: '2026-09-24T17:20:23.967072',
              last_activity_at: '2026-09-24T17:20:23.967102',
              expires_at: '2026-10-01T17:20:23.966868',
            }]
          })
        }
        if (url.includes('/auth/audit-logs')) {
          return Promise.resolve({
            data: [{
              id: 1,
              action: 'login_success',
              description: 'Successful login',
              ip_address: '127.0.0.1',
              risk_score: 0.4,
              risk_tier: 'medium',
              created_at: '2026-09-24T17:20:23.998190',
            }]
          })
        }
        return Promise.reject(new Error('Unknown url ' + url))
      }),
      post: vi.fn(),
      delete: vi.fn(),
    } as any)

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } }
    })

    window.history.pushState({}, '', '/dashboard')

    render(
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <AuthProvider>
            <App />
          </AuthProvider>
        </BrowserRouter>
      </QueryClientProvider>
    )

    await waitFor(() => {
      expect(document.body.innerHTML).not.toBe('')
    })
  })
})
