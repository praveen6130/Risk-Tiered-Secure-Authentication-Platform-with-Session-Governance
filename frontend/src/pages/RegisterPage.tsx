import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import zxcvbn from 'zxcvbn';
import { useNavigate, Link } from 'react-router-dom';
import { Eye, EyeOff, Loader2, Shield, AlertCircle, Mail, Lock, User as UserIcon } from 'lucide-react';
import { getDeviceFingerprint, cn } from '../utils/fingerprint';
import { authApi } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { Button, Input, Card, CardContent, CardHeader, CardTitle, CardDescription, Progress } from '../components/ui';
import { toast } from 'sonner';

const registerSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  confirmPassword: z.string(),
  fullName: z.string().min(2, 'Name must be at least 2 characters').optional().or(z.literal('')),
  rememberDevice: z.boolean().default(false),
}).refine(data => data.password === data.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
});

type RegisterForm = z.infer<typeof registerSchema>;

export function RegisterPage() {
  const { login, isAuthenticated, user } = useAuth();
  const navigate = useNavigate();
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [passwordStrength, setPasswordStrength] = useState(0);
  const [fingerprint, setFingerprint] = useState<object | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (isAuthenticated) {
      if (user?.is_superuser) {
        navigate('/admin', { replace: true });
      } else {
        navigate('/dashboard', { replace: true });
      }
    }
  }, [isAuthenticated, user, navigate]);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors: formErrors },
  } = useForm<RegisterForm>({
    resolver: zodResolver(registerSchema),
    defaultValues: { rememberDevice: false },
  });

  const password = watch('password');

  useEffect(() => {
    if (password) {
      const result = zxcvbn(password);
      setPasswordStrength(result.score);
    } else {
      setPasswordStrength(0);
    }
  }, [password]);

  useEffect(() => {
    getDeviceFingerprint().then(setFingerprint).catch(console.error);
  }, []);

  const strengthLabels = ['Very Weak', 'Weak', 'Fair', 'Good', 'Strong'];

  const onSubmit = async (data: RegisterForm) => {
    setIsLoading(true);
    setErrors({});
    
    try {
      await authApi.register({
        email: data.email,
        password: data.password,
        full_name: data.fullName || undefined,
        device_fingerprint: fingerprint || undefined,
      });
      
      toast.success('Account created successfully!');
      
      const tokenData = await login(data.email, data.password, fingerprint || undefined, data.rememberDevice);
      if (tokenData?.mfa_required) {
        navigate(`/step-up?session_id=${tokenData.session_id}&type=totp`);
      } else {
        navigate('/dashboard');
      }
    } catch (error: any) {
      const message = error.response?.data?.detail || error.message || 'Registration failed. Please try again.';
      setErrors({ form: message });
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-primary-50 via-white to-gray-50"
    >
      <Card className="w-full max-w-md" variant="elevated">
        <CardHeader className="text-center pb-2">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-primary-100">
            <Shield className="h-8 w-8 text-primary-600" />
          </div>
          <CardTitle className="text-2xl">Create Account</CardTitle>
          <CardDescription>Sign up for secure access</CardDescription>
        </CardHeader>

        <CardContent className="space-y-5">
          <AnimatePresence mode="wait">
            {errors.form && (
              <motion.div
                key="form-error"
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="flex items-center gap-2 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm"
                role="alert"
              >
                <AlertCircle className="h-5 w-5 flex-shrink-0" />
                <span>{errors.form}</span>
              </motion.div>
            )}
          </AnimatePresence>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
            <Input
              {...register('fullName')}
              type="text"
              label="Full Name (Optional)"
              placeholder="John Doe"
              error={formErrors.fullName?.message}
              autoComplete="name"
              disabled={isLoading}
              leftIcon={<UserIcon className="h-5 w-5 text-gray-400" />}
            />

            <Input
              {...register('email')}
              type="email"
              label="Email"
              placeholder="you@example.com"
              error={formErrors.email?.message}
              autoComplete="email"
              disabled={isLoading}
              leftIcon={<Mail className="h-5 w-5 text-gray-400" />}
            />

            <div className="relative">
              <Input
                {...register('password')}
                type={showPassword ? 'text' : 'password'}
                label="Password"
                placeholder="••••••••"
                error={formErrors.password?.message}
                autoComplete="new-password"
                disabled={isLoading}
                leftIcon={<Lock className="h-5 w-5 text-gray-400" />}
              />
              <button
                type="button"
                className="absolute right-3 top-[38px] text-gray-400 hover:text-gray-600 transition-colors"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              </button>
            </div>

            <Input
              {...register('confirmPassword')}
              type={showPassword ? 'text' : 'password'}
              label="Confirm Password"
              placeholder="••••••••"
              error={formErrors.confirmPassword?.message}
              autoComplete="new-password"
              disabled={isLoading}
              leftIcon={<Lock className="h-5 w-5 text-gray-400" />}
            />

            {password && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-500">Password Strength</span>
                  <span className={cn('font-medium', passwordStrength >= 3 ? 'text-green-600' : passwordStrength >= 1 ? 'text-amber-600' : 'text-red-600')}>
                    {strengthLabels[passwordStrength]}
                  </span>
                </div>
                <Progress
                  value={passwordStrength}
                  max={4}
                  size="sm"
                  color={passwordStrength >= 3 ? 'success' : passwordStrength >= 1 ? 'warning' : 'danger'}
                />
              </div>
            )}

            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  {...register('rememberDevice')}
                  type="checkbox"
                  className="w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                />
                <span className="text-sm text-gray-600">Remember this device</span>
              </label>
            </div>

            <Button type="submit" className="w-full" size="lg" loading={isLoading}>
              {isLoading ? <Loader2 className="h-5 w-5" /> : 'Create Account'}
            </Button>
          </form>

          <p className="text-center text-sm text-gray-600">
            Already have an account?{' '}
            <Link to="/login" className="text-primary-600 hover:text-primary-700 font-medium">
              Sign in
            </Link>
          </p>
        </CardContent>
      </Card>
    </motion.div>
  );
}