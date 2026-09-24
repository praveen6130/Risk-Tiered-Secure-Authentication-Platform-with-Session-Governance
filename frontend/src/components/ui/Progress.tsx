import { HTMLAttributes, forwardRef } from 'react';
import { cn } from '../../utils/fingerprint';

interface ProgressProps extends HTMLAttributes<HTMLDivElement> {
  value: number;
  max?: number;
  size?: 'sm' | 'md' | 'lg';
  color?: 'primary' | 'success' | 'warning' | 'danger';
  showLabel?: boolean;
}

export const Progress = forwardRef<HTMLDivElement, ProgressProps>(
  ({ className, value, max = 100, size = 'md', color = 'primary', showLabel, children, ...props }, ref) => {
    const percentage = Math.min(Math.max((value / max) * 100, 0), 100);
    
    const sizes = {
      sm: 'h-1',
      md: 'h-2',
      lg: 'h-3',
    };
    
    const colors = {
      primary: 'bg-primary-600',
      success: 'bg-green-500',
      warning: 'bg-amber-500',
      danger: 'bg-red-500',
    };

    return (
      <div ref={ref} className={cn('w-full', className)} {...props}>
        <div className={cn('relative overflow-hidden rounded-full bg-gray-200', sizes[size])}>
          <div
            className={cn(
              'h-full rounded-full transition-all duration-500 ease-out',
              colors[color]
            )}
            style={{ width: `${percentage}%` }}
            role="progressbar"
            aria-valuenow={value}
            aria-valuemin={0}
            aria-valuemax={max}
          />
        </div>
        {(showLabel || children) && (
          <div className="flex justify-between text-xs text-gray-500 mt-1">
            <span>{children || `${Math.round(percentage)}%`}</span>
            {showLabel && <span>{max}</span>}
          </div>
        )}
      </div>
    );
  }
);

Progress.displayName = 'Progress';