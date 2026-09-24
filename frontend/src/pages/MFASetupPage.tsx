import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { authApi } from '../services/api';
import { Copy, Check, AlertCircle, Download, QrCode, Key } from 'lucide-react';
import { Button, Card, CardContent, CardHeader, CardTitle, CardDescription, Progress } from '../components/ui';
import { toast } from 'sonner';
import { MFASetupResponse } from '../types';

export function MFASetupPage() {
  const { user, refreshUser } = useAuth();
  const navigate = useNavigate();
  const [setupData, setSetupData] = useState<MFASetupResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [step, setStep] = useState<'setup' | 'verify' | 'complete'>('setup');
  const [verificationCode, setVerificationCode] = useState('');
  const [timeRemaining, setTimeRemaining] = useState(30);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const intervalRef = useRef<any>(null);

  useEffect(() => {
    loadMFASetup();
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  const loadMFASetup = async () => {
    setIsLoading(true);
    try {
      const response = await authApi.setupMFA();
      setSetupData(response.data);
      startTimer();
    } catch (error) {
      toast.error('Failed to load MFA setup');
    } finally {
      setIsLoading(false);
    }
  };

  const startTimer = () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    setTimeRemaining(30);
    intervalRef.current = setInterval(() => {
      setTimeRemaining(prev => {
        if (prev <= 1) {
          startTimer();
          return 30;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const handleVerify = async () => {
    if (verificationCode.length !== 6) return;
    
    setIsLoading(true);
    try {
      await authApi.verifyMFA(verificationCode);
      setStep('complete');
      toast.success('MFA enabled successfully!');
      await refreshUser();
    } catch (error) {
      toast.error('Invalid code. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopy = (text: string, index: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
    toast.success('Copied!');
  };

  const downloadBackupCodes = () => {
    if (!setupData) return;
    const content = `HTH-CS-02 Backup Codes\nGenerated: ${new Date().toISOString()}\n\n${setupData.backup_codes.join('\n')}\n\nKeep these codes safe! Each can be used once.`;
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `backup-codes-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (step === 'complete') {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-primary-50 via-white to-gray-50"
      >
        <Card className="w-full max-w-md" variant="elevated">
          <CardContent className="pt-6">
            <div className="text-center space-y-4">
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', stiffness: 260, damping: 20 }}
                className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-100"
              >
                <Check className="h-8 w-8 text-green-600" />
              </motion.div>
              <h2 className="text-2xl font-bold text-gray-900">MFA Enabled!</h2>
              <p className="text-gray-600">
                Your account is now protected with two-factor authentication.
              </p>
              <Button onClick={() => navigate('/dashboard')} className="w-full" size="lg">
                Go to Dashboard
              </Button>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    );
  }

  if (isLoading && !setupData) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-primary-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-primary-50 via-white to-gray-50"
    >
      <Card className="w-full max-w-2xl" variant="elevated">
        <CardHeader>
          <CardTitle className="text-2xl">Set Up Two-Factor Authentication</CardTitle>
          <CardDescription>
            {step === 'setup' 
              ? 'Scan the QR code with your authenticator app, then enter the 6-digit code to verify.'
              : 'Enter the 6-digit code from your authenticator app to complete setup.'}
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          {step === 'setup' && setupData && (
            <div className="space-y-6">
              <div className="text-center">
                <div className="relative inline-block p-4 bg-white rounded-xl border border-gray-200">
                  <img
                    src={`data:image/png;base64,${setupData.qr_code}`}
                    alt="MFA QR Code"
                    className="h-64 w-64"
                  />
                </div>
                <p className="mt-3 text-sm text-gray-500">Scan with Google Authenticator, Authy, or similar</p>
              </div>

              <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium text-gray-900">Manual Entry Key</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleCopy(setupData.manual_entry_key, -1)}
                  >
                    <Copy className="h-4 w-4 mr-1" />
                    Copy
                  </Button>
                </div>
                <code className="text-sm font-mono text-gray-700 break-all bg-white px-3 py-2 rounded border">
                  {setupData.manual_entry_key}
                </code>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Enter 6-digit code from your authenticator app
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={verificationCode}
                    onChange={(e) => setVerificationCode(e.target.value.toUpperCase().replace(/\s/g, ''))}
                    maxLength={6}
                    placeholder="000000"
                    className="flex-1 w-32 text-center text-2xl tracking-widest font-mono border rounded-lg px-4 py-3 focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    autoComplete="one-time-code"
                  />
                  <div className="relative flex items-center">
                    <Progress
                      value={timeRemaining}
                      max={30}
                      className="flex-1 max-w-xs"
                      color="primary"
                      size="sm"
                    />
                    <span className="absolute right-2 text-xs text-gray-500 font-mono">
                      {timeRemaining}s
                    </span>
                  </div>
                </div>
              </div>

              <Button onClick={handleVerify} className="w-full" size="lg" loading={isLoading} disabled={verificationCode.length !== 6}>
                Verify & Enable MFA
              </Button>
            </div>
          )}

          {step === 'verify' && setupData && (
            <div className="space-y-4">
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
                <div className="flex items-center gap-2 text-amber-800">
                  <AlertCircle className="h-5 w-5 flex-shrink-0" />
                  <span className="font-medium">Backup Codes</span>
                </div>
                <p className="mt-2 text-sm text-amber-700">
                  Save these codes in a safe place. Each code can be used once if you lose access to your authenticator app.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3 max-h-64 overflow-y-auto">
                {setupData.backup_codes.map((code, index) => (
                  <motion.div
                    key={index}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.05 }}
                    className="relative flex items-center justify-between p-3 rounded-lg border border-gray-200 bg-white"
                  >
                    <code className="font-mono text-lg tracking-wider text-gray-900 select-all">
                      {code}
                    </code>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleCopy(code, index)}
                    >
                      {copiedIndex === index ? (
                        <Check className="h-4 w-4 text-green-500" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </Button>
                  </motion.div>
                ))}
              </div>

              <div className="flex gap-3">
                <Button variant="outline" onClick={downloadBackupCodes} className="flex-1">
                  <Download className="h-4 w-4 mr-2" />
                  Download
                </Button>
                <Button variant="outline" onClick={() => navigator.clipboard.writeText(setupData.backup_codes.join('\n'))} className="flex-1">
                  <Copy className="h-4 w-4 mr-2" />
                  Copy All
                </Button>
              </div>

              <Button onClick={() => setStep('complete')} className="w-full" size="lg">
                Done - Continue to Dashboard
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}