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
    const rTier = (riskTier || '').toLowerCase();
    if (variant === 'risk' && rTier) {
      return (
        <span
          ref={ref}
          className={cn(
            'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium',
            getRiskTierBg(rTier),
            getRiskTierColor(rTier),
            className
          )}
          {...props}
        >
          {rTier.charAt(0).toUpperCase() + rTier.slice(1)}
        </span>
      );
    }

    const sStatus = (status || '').toLowerCase();
    if (variant === 'status' && sStatus) {
      const statusStyles: Record<string, string> = {
        active: 'bg-green-100 text-green-800',
        revoked: 'bg-red-100 text-red-800',
        expired: 'bg-gray-100 text-gray-800',
        step_up_required: 'bg-amber-100 text-amber-800',
        blocked: 'bg-red-100 text-red-800',
      };
      return (
        <span
          ref={ref}
          className={cn('inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium', statusStyles[sStatus] || 'bg-gray-100 text-gray-800', className)}
          {...props}
        >
          {sStatus.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
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