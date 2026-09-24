import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter } from 'react-router-dom'
import { AuthProvider, useAuth } from '../context/AuthContext'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { Badge } from '../components/ui/Badge'
import { Progress } from '../components/ui/Progress'
import { formatDate, formatRelativeTime, cn, getRiskTierColor, getRiskTierBg } from '../utils/fingerprint'


const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } }
  })
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>{children}</AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  )
}


describe('UI Components', () => {
  describe('Button', () => {
    it('renders children', () => {
      render(<Button>Click me</Button>, { wrapper: createWrapper() })
      expect(screen.getByRole('button', { name: 'Click me' })).toBeInTheDocument()
    })

    it('applies variant classes', () => {
      render(<Button variant="destructive">Delete</Button>, { wrapper: createWrapper() })
      const btn = screen.getByRole('button')
      expect(btn).toHaveClass('bg-red-600')
    })

    it('applies size classes', () => {
      render(<Button size="lg">Large</Button>, { wrapper: createWrapper() })
      const btn = screen.getByRole('button')
      expect(btn).toHaveClass('px-6', 'py-3', 'text-lg')
    })

    it('shows loading spinner', () => {
      render(<Button loading>Loading</Button>, { wrapper: createWrapper() })
      expect(screen.getByRole('button')).toBeDisabled()
      expect(screen.getByTestId('spinner')).toBeInTheDocument()
    })
  })

  describe('Input', () => {
    it('renders label and input', () => {
      render(<Input label="Email" placeholder="you@example.com" />, { wrapper: createWrapper() })
      expect(screen.getByLabelText('Email')).toBeInTheDocument()
      expect(screen.getByPlaceholderText('you@example.com')).toBeInTheDocument()
    })

    it('shows error message', () => {
      render(<Input label="Email" error="Invalid email" />, { wrapper: createWrapper() })
      expect(screen.getByText('Invalid email')).toBeInTheDocument()
      expect(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true')
    })

    it('shows helper text', () => {
      render(<Input label="Password" helperText="Must be 8+ chars" />, { wrapper: createWrapper() })
      expect(screen.getByText('Must be 8+ chars')).toBeInTheDocument()
    })
  })

  describe('Badge', () => {
    it('renders risk tier badge', () => {
      render(<Badge variant="risk" riskTier="high" />, { wrapper: createWrapper() })
      expect(screen.getByText('High')).toBeInTheDocument()
      expect(screen.getByText('High')).toHaveClass('bg-risk-high/10')
    })

    it('renders status badge', () => {
      render(<Badge variant="status" status="active" />, { wrapper: createWrapper() })
      expect(screen.getByText('Active')).toBeInTheDocument()
    })

    it('renders default badge', () => {
      render(<Badge>Default</Badge>, { wrapper: createWrapper() })
      expect(screen.getByText('Default')).toBeInTheDocument()
    })
  })

  describe('Progress', () => {
    it('renders progress bar', () => {
      render(<Progress value={50} max={100} />, { wrapper: createWrapper() })
      const bar = screen.getByRole('progressbar')
      expect(bar).toHaveAttribute('aria-valuenow', '50')
      expect(bar).toHaveAttribute('aria-valuemax', '100')
    })

    it('applies color variants', () => {
      const { rerender } = render(<Progress value={50} color="success" />, { wrapper: createWrapper() })
      expect(screen.getByRole('progressbar')).toHaveClass('bg-green-500')
      
      rerender(<Progress value={50} color="danger" />)
      expect(screen.getByRole('progressbar')).toHaveClass('bg-red-500')
    })
  })
})


describe('Utility Functions', () => {
  describe('cn', () => {
    it('joins class names', () => {
      expect(cn('a', 'b', 'c')).toBe('a b c')
    })

    it('filters falsy values', () => {
      expect(cn('a', false, null, undefined, '', 'b')).toBe('a b')
    })
  })

  describe('formatDate', () => {
    it('formats ISO date string', () => {
      const result = formatDate('2024-01-15T10:30:00Z')
      expect(result).toContain('Jan')
      expect(result).toContain('15')
      expect(result).toContain('2024')
    })
  })

  describe('formatRelativeTime', () => {
    it('formats recent time', () => {
      const now = new Date()
      const result = formatRelativeTime(now.toISOString())
      expect(result).toBe('Just now')
    })

    it('formats minutes ago', () => {
      const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000)
      const result = formatRelativeTime(fiveMinAgo.toISOString())
      expect(result).toBe('5m ago')
    })

    it('formats hours ago', () => {
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000)
      const result = formatRelativeTime(twoHoursAgo.toISOString())
      expect(result).toBe('2h ago')
    })

    it('formats days ago', () => {
      const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000)
      const result = formatRelativeTime(threeDaysAgo.toISOString())
      expect(result).toBe('3d ago')
    })
  })

  describe('getRiskTierColor', () => {
    it('returns correct colors', () => {
      expect(getRiskTierColor('low')).toBe('text-risk-low')
      expect(getRiskTierColor('medium')).toBe('text-risk-medium')
      expect(getRiskTierColor('high')).toBe('text-risk-high')
      expect(getRiskTierColor('critical')).toBe('text-risk-critical')
    })
  })

  describe('getRiskTierBg', () => {
    it('returns correct background classes', () => {
      expect(getRiskTierBg('low')).toContain('bg-risk-low/10')
      expect(getRiskTierBg('high')).toContain('bg-risk-high/10')
    })
  })
})


describe('AuthContext', () => {
  it('provides auth state', () => {
    const TestComponent = () => {
      const { isAuthenticated, user, isLoading } = useAuth()
      return (
        <div>
          <span data-testid="loading">{String(isLoading)}</span>
          <span data-testid="authenticated">{String(isAuthenticated)}</span>
          <span data-testid="user">{user?.email || 'none'}</span>
        </div>
      )
    }

    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>,
      { wrapper: ({ children }) => (
        <QueryClientProvider client={new QueryClient()}>
          <BrowserRouter>{children}</BrowserRouter>
        </QueryClientProvider>
      )}
    )

    expect(screen.getByTestId('loading')).toHaveTextContent('true')
  })
})