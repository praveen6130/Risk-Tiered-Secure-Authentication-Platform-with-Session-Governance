import { HTMLAttributes, forwardRef } from 'react';
import { cn } from '../../utils/fingerprint';
import { getRiskTierColor, getRiskTierBg } from '../../utils/fingerprint';

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'risk' | 'status' | 'outline';
  riskTier?: 'low' | 'medium' | 'high' | 'critical';
  status?: 'active' | 'revoked' | 'expired' | 'step_up_required' | 'blocked';
}

export const Badge = forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, variant = 'default', riskTier, status, children, ...props }, ref) => {
    if (variant === 'risk' && riskTier) {
      return (
        <span
          ref={ref}
          className={cn(
            'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium',
            getRiskTierBg(riskTier),
            getRiskTierColor(riskTier),
            className
          )}
          {...props}
        >
          {riskTier.charAt(0).toUpperCase() + riskTier.slice(1)}
        </span>
      );
    }

    if (variant === 'status' && status) {
      const statusStyles = {
        active: 'bg-green-100 text-green-800',
        revoked: 'bg-red-100 text-red-800',
        expired: 'bg-gray-100 text-gray-800',
        step_up_required: 'bg-amber-100 text-amber-800',
        blocked: 'bg-red-100 text-red-800',
      };
      return (
        <span
          ref={ref}
          className={cn('inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium', statusStyles[status], className)}
          {...props}
        >
          {status.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
        </span>
      );
    }

    const variants = {
      default: 'bg-primary-100 text-primary-800',
      outline: 'border border-gray-300 text-gray-700 bg-transparent',
    };

    return (
      <span
        ref={ref}
        className={cn('inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium', variants[variant], className)}
        {...props}
      >
        {children}
      </span>
    );
  }
);

Badge.displayName = 'Badge';