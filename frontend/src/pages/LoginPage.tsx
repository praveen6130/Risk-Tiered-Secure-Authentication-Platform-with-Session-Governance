import { useState, useEffect } from 'react';
import { extractErrorMessage } from '../utils/errorMessage';
import { motion, AnimatePresence } from 'framer-motion';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import zxcvbn from 'zxcvbn';
import { useNavigate, Link } from 'react-router-dom';
import { Eye, EyeOff, Loader2, AlertCircle, Shield, Database } from 'lucide-react';
import { getDeviceFingerprint, cn } from '../utils/fingerprint';
import { useAuth } from '../context/AuthContext';
import { Button, Input, Card, CardContent, CardHeader, CardTitle, CardDescription, Progress } from '../components/ui';
import { toast } from 'sonner';
import { DatabaseInspectorModal } from '../components/DatabaseInspectorModal';

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  rememberDevice: z.boolean().default(false),
});

type LoginForm = z.infer<typeof loginSchema>;

export function LoginPage() {
  const { login, isAuthenticated, user, token } = useAuth();
  const navigate = useNavigate();
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [passwordStrength, setPasswordStrength] = useState(0);
  const [fingerprint, setFingerprint] = useState<object | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showDbModal, setShowDbModal] = useState(false);

  useEffect(() => {
    if (isAuthenticated) {
      if (user?.is_superuser) {
        navigate('/admin', { replace: true });
      } else {
        navigate('/dashboard', { replace: true });
      }
    } else if (token?.mfa_required) {
      navigate(`/step-up?session_id=${token.session_id}&type=totp`, { replace: true });
    }
  }, [isAuthenticated, user, token, navigate]);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors: formErrors },
  } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
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

  const onSubmit = async (data: LoginForm) => {
    setIsLoading(true);
    setErrors({});
    
    try {
      const fpPayload = fingerprint ? { fingerprint, user_agent: navigator.userAgent } : undefined;
      const tokenData = await login(data.email, data.password, fpPayload, data.rememberDevice);
      if (tokenData?.mfa_required) {
        toast.info('Two-factor authentication required');
        const sType = (tokenData as any)?.step_up_type || 'totp';
        navigate(`/step-up?session_id=${tokenData.session_id}&type=${sType}`);
      } else {
        toast.success('Welcome back!');
        navigate('/dashboard');
      }
    } catch (error: any) {
      const message = extractErrorMessage(error, 'Login failed. Please try again.');
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
          <CardTitle className="text-2xl">Welcome Back</CardTitle>
          <CardDescription>Sign in to your account</CardDescription>
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
              {...register('email')}
              type="email"
              label="Email"
              placeholder="you@example.com"
              error={formErrors.email?.message}
              autoComplete="email"
              disabled={isLoading}
            />

            <div className="relative">
              <Input
                {...register('password')}
                type={showPassword ? 'text' : 'password'}
                label="Password"
                placeholder="••••••••"
                error={formErrors.password?.message}
                autoComplete="current-password"
                disabled={isLoading}
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
              <span className="text-sm text-primary-600 hover:text-primary-700 cursor-pointer">
                Forgot password?
              </span>
            </div>

            <Button type="submit" className="w-full" size="lg" loading={isLoading}>
              {isLoading ? <Loader2 className="h-5 w-5" /> : 'Sign In'}
            </Button>
          </form>

          <p className="text-center text-sm text-gray-600">
            Don't have an account?{' '}
            <Link to="/register" className="text-primary-600 hover:text-primary-700 font-medium">
              Sign up
            </Link>
          </p>

          <div className="pt-2 border-t border-gray-100 flex items-center justify-center">
            <button
              type="button"
              onClick={() => setShowDbModal(true)}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-primary-600 transition-colors py-1.5 px-3 rounded-lg hover:bg-gray-100 border border-gray-200"
            >
              <Database className="w-3.5 h-3.5 text-primary-500" />
              <span>Inspect Database & Argon2id Hashes</span>
            </button>
          </div>
        </CardContent>
      </Card>

      <DatabaseInspectorModal
        isOpen={showDbModal}
        onClose={() => setShowDbModal(false)}
      />
    </motion.div>
  );
}