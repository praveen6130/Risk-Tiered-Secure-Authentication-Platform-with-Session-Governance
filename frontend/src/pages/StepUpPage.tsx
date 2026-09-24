import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { authApi } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { Loader2, Shield, Mail, Smartphone, CheckCircle, AlertCircle, Clock, RefreshCw, Sparkles } from 'lucide-react';
import { Button, Card, CardContent, CardHeader, CardTitle, CardDescription, Progress, Input } from '../components/ui';
import { toast } from 'sonner';
import { StepUpStatus } from '../types';

type ChallengeType = 'totp' | 'email_otp' | 'device_approval';

interface ChallengeConfig {
  icon: React.ReactNode;
  title: string;
  description: string;
  color: string;
}

const challengeConfigs: Record<ChallengeType, ChallengeConfig> = {
  totp: {
    icon: <Smartphone className="h-8 w-8" />,
    title: 'Authenticator App',
    description: 'Enter the 6-digit code from your authenticator app',
    color: 'primary',
  },
  email_otp: {
    icon: <Mail className="h-8 w-8" />,
    title: 'Email Verification',
    description: 'Enter the 6-digit code sent to your email',
    color: 'blue',
  },
  device_approval: {
    icon: <Shield className="h-8 w-8" />,
    title: 'Device Approval',
    description: 'Waiting for approval from your trusted device',
    color: 'amber',
  },
};

export function StepUpPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { setTokens, refreshUser } = useAuth();
  
  const sessionId = searchParams.get('session_id');
  const challengeType = (searchParams.get('type') || 'totp') as ChallengeType;
  
  const [code, setCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState(300);
  const [status, setStatus] = useState<'pending' | 'approved' | 'denied' | 'expired'>('pending');
  const [demoOtp, setDemoOtp] = useState<{ code: string; seconds_remaining: number } | null>(null);
  const intervalRef = useRef<any>(null);
  const statusIntervalRef = useRef<any>(null);

  const config = challengeConfigs[challengeType] || challengeConfigs.totp;

  useEffect(() => {
    if (challengeType !== 'device_approval') {
      const fetchDemoOtp = async () => {
        try {
          const res = await authApi.getDemoOTP();
          setDemoOtp(res.data);
        } catch {
          // fallback
        }
      };
      fetchDemoOtp();
      const otpInterval = setInterval(fetchDemoOtp, 5000);
      return () => clearInterval(otpInterval);
    }
  }, [challengeType]);

  useEffect(() => {
    if (!sessionId) {
      toast.error('Invalid session');
      navigate('/login');
      return;
    }

    startTimer();
    if (challengeType === 'device_approval') {
      pollStatus();
    }

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (statusIntervalRef.current) clearInterval(statusIntervalRef.current);
    };
  }, [sessionId, challengeType, navigate]);

  const startTimer = () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    setTimeRemaining(300);
    intervalRef.current = setInterval(() => {
      setTimeRemaining(prev => {
        if (prev <= 1) {
          handleTimeout();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const pollStatus = async () => {
    if (!sessionId) return;
    
    statusIntervalRef.current = setInterval(async () => {
      try {
        const response = await authApi.stepUpStatus(Number(sessionId));
        setStatus(response.data.status);
        if (response.data.status === 'approved') {
          handleSuccess();
        } else if (response.data.status === 'denied' || response.data.status === 'expired') {
          handleFailure(response.data.status);
        }
      } catch {
        // Ignore polling errors
      }
    }, 3000);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sessionId) return;
    
    if (challengeType !== 'device_approval' && code.length !== 6) return;
    
    setIsVerifying(true);
    try {
      const response = await authApi.stepUp(Number(sessionId), challengeType, code || undefined);
      if (response.data?.access_token) {
        setTokens(response.data);
        await refreshUser();
      }
      handleSuccess();
    } catch (error: any) {
      toast.error(error.response?.data?.detail || 'Verification failed');
    } finally {
      setIsVerifying(false);
    }
  };

  const handleSuccess = () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (statusIntervalRef.current) clearInterval(statusIntervalRef.current);
    toast.success('Verification successful!');
    navigate('/dashboard');
  };

  const handleFailure = (reason: string) => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (statusIntervalRef.current) clearInterval(statusIntervalRef.current);
    setStatus(reason as any);
    toast.error(reason === 'denied' ? 'Request denied' : 'Request expired');
  };

  const handleTimeout = () => {
    handleFailure('expired');
  };

  const handleResend = async () => {
    if (!sessionId) return;
    setIsLoading(true);
    try {
      await authApi.stepUp(Number(sessionId), challengeType);
      startTimer();
      toast.success('New code sent');
    } catch {
      toast.error('Failed to resend');
    } finally {
      setIsLoading(false);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-primary-50 via-white to-gray-50"
    >
      <Card className="w-full max-w-md" variant="elevated">
        <CardHeader className="text-center">
          <div className={cn('mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl', `bg-${config.color}-100`)}>
            {config.icon}
          </div>
          <CardTitle className="text-2xl">{config.title}</CardTitle>
          <CardDescription>{config.description}</CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          <div className="relative">
            <Progress
              value={timeRemaining}
              max={300}
              size="md"
              color={challengeType === 'device_approval' ? 'warning' : 'primary'}
              className="mb-2"
            />
            <div className="flex justify-between text-xs text-gray-500">
              <span>Expires in</span>
              <span className="font-mono font-medium text-gray-900">{formatTime(timeRemaining)}</span>
            </div>
          </div>

          {challengeType === 'device_approval' ? (
            <motion.div
              key="device-approval"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="space-y-4 text-center"
            >
              <div className={cn(
                'relative flex h-24 w-24 items-center justify-center rounded-full mx-auto',
                status === 'pending' ? 'bg-amber-100 animate-pulse' :
                status === 'approved' ? 'bg-green-100' :
                'bg-red-100'
              )}>
                <div className={cn(
                  'absolute inset-0 rounded-full border-4 border-current opacity-50',
                  status === 'pending' && 'animate-ping text-amber-500',
                  status === 'approved' && 'text-green-500',
                  status === 'denied' && 'text-red-500',
                  status === 'expired' && 'text-gray-500'
                )} />
                {status === 'pending' && (
                  <Clock className="h-10 w-10 text-amber-600 animate-spin-slow" />
                )}
                {status === 'approved' && (
                  <CheckCircle className="h-10 w-10 text-green-600" />
                )}
                {status === 'denied' && (
                  <AlertCircle className="h-10 w-10 text-red-600" />
                )}
                {status === 'expired' && (
                  <Clock className="h-10 w-10 text-gray-600" />
                )}
              </div>
              
              <div className="space-y-2">
                <p className={cn('font-medium', 
                  status === 'pending' && 'text-amber-700',
                  status === 'approved' && 'text-green-700',
                  status === 'denied' && 'text-red-700',
                  status === 'expired' && 'text-gray-700'
                )}>
                  {status === 'pending' && 'Waiting for approval...'}
                  {status === 'approved' && 'Approved! Redirecting...'}
                  {status === 'denied' && 'Request denied'}
                  {status === 'expired' && 'Request expired'}
                </p>
                {status === 'pending' && (
                  <p className="text-sm text-gray-500">
                    Waiting for approval from your trusted device. You can approve it below to proceed:
                  </p>
                )}
              </div>

              {status === 'pending' && (
                <div className="space-y-3 pt-2">
                  <Button
                    type="button"
                    onClick={async () => {
                      if (!sessionId) return;
                      setIsVerifying(true);
                      try {
                        const response = await authApi.stepUp(Number(sessionId), 'device_approval');
                        if (response.data?.access_token) {
                          setTokens(response.data);
                          await refreshUser();
                        }
                        handleSuccess();
                      } catch (error: any) {
                        toast.error(error.response?.data?.detail || 'Approval failed');
                      } finally {
                        setIsVerifying(false);
                      }
                    }}
                    loading={isVerifying}
                    className="w-full bg-emerald-600 hover:bg-emerald-700 text-white shadow-md hover:shadow-lg transition-all"
                    size="lg"
                  >
                    <CheckCircle className="h-5 w-5 mr-2" />
                    Approve This Device
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="w-full text-xs text-gray-500 hover:text-gray-700"
                    onClick={() => navigate(`/step-up?session_id=${sessionId}&type=totp`)}
                  >
                    Use Authenticator Code Instead
                  </Button>
                </div>
              )}

              {(status === 'denied' || status === 'expired') && (
                <Button variant="outline" onClick={handleResend} loading={isLoading} className="w-full">
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Request New Approval
                </Button>
              )}
            </motion.div>
          ) : (
            <motion.form
              key="code-entry"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              onSubmit={handleSubmit}
              className="space-y-4"
            >
              <div className="flex gap-3">
                {[...Array(6)].map((_, i) => (
                  <input
                    key={i}
                    type="text"
                    maxLength={1}
                    value={code[i] || ''}
                    onChange={(e) => {
                      const newCode = code.split('');
                      newCode[i] = e.target.value.toUpperCase();
                      const filtered = newCode.filter(c => /^[A-Z0-9]$/.test(c)).join('');
                      setCode(filtered.padEnd(6, ''));
                      const val = (e.target as HTMLInputElement).value;
                      if (val && i < 5) {
                        ((e.target as HTMLElement).nextElementSibling as HTMLInputElement)?.focus();
                      }
                    }}
                    onKeyDown={(e) => {
                      const input = e.target as HTMLInputElement;
                      if (e.key === 'Backspace' && !input.value && i > 0) {
                        (input.previousElementSibling as HTMLInputElement)?.focus();
                      }
                    }}
                    className="flex-1 w-12 h-12 text-center text-2xl font-mono border-2 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    autoComplete="one-time-code"
                    inputMode="text"
                    disabled={isVerifying}
                  />
                ))}
              </div>

              {demoOtp && (
                <div className="p-3.5 bg-blue-50/80 rounded-xl border border-blue-200 text-left space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-blue-900">
                      <Sparkles className="h-4 w-4 text-blue-600" />
                      OTP Platform Simulator & Helper
                    </div>
                    <span className="text-[11px] font-mono font-medium px-2 py-0.5 rounded-full bg-blue-100 text-blue-800">
                      New in {demoOtp.seconds_remaining}s
                    </span>
                  </div>
                  <div className="flex items-center justify-between bg-white px-3 py-2 rounded-lg border border-blue-100 shadow-sm">
                    <div className="font-mono text-xl tracking-widest font-bold text-gray-800">
                      {demoOtp.code}
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="text-xs h-8 border-blue-300 text-blue-700 hover:bg-blue-50"
                      onClick={() => {
                        setCode(demoOtp.code);
                        toast.success('Live OTP code auto-filled!');
                      }}
                    >
                      Auto-Fill Code
                    </Button>
                  </div>
                  <p className="text-[11px] text-gray-500">
                    Active RFC 6238 TOTP code synced with authentication service. You can auto-fill or enter manually.
                  </p>
                </div>
              )}

              <Button type="submit" className="w-full" size="lg" loading={isVerifying} disabled={code.length !== 6}>
                Verify
              </Button>

              <Button type="button" variant="outline" onClick={handleResend} loading={isLoading} className="w-full" disabled={timeRemaining > 280}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Resend Code ({formatTime(Math.max(0, timeRemaining - 280))})
              </Button>
            </motion.form>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}

function cn(...classes: (string | undefined | null | false)[]) {
  return classes.filter(Boolean).join(' ');
}