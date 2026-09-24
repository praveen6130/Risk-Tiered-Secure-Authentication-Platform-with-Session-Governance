import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { LogOut, Users, Shield, Activity, Zap, Globe, Trash2, ChevronDown, ChevronUp, RefreshCw, Settings, Bell, LayoutDashboard } from 'lucide-react';
import { authApi } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { Session, User, AuditLog, RiskTier, SessionStatus } from '../types';
import { Button, Badge, Card, CardContent, CardHeader, CardTitle, Modal, Progress, Input } from '../components/ui';
import { formatDate, formatRelativeTime, getRiskTierColor, getRiskTierBg, cn } from '../utils/fingerprint';
import { toast } from 'sonner';

export function DashboardPage() {
  const { user, logout, logoutAll, refreshUser } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [detailSession, setDetailSession] = useState<Session | null>(null);
  const [showRevokeAll, setShowRevokeAll] = useState(false);

  const { data: sessionsData, isLoading: sessionsLoading, refetch: refetchSessions } = useQuery({
    queryKey: ['userSessions'],
    queryFn: () => authApi.getSessions(),
  });

  const { data: auditData } = useQuery({
    queryKey: ['userAuditLogs', user?.id],
    queryFn: () => authApi.getUserAuditLogs({ limit: 50 }),
    enabled: !!user?.id,
  });

  const revokeMutation = useMutation({
    mutationFn: ({ id, reason }: { id: number; reason: string }) => authApi.revokeSession(id, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['userSessions'] });
      setDetailSession(null);
      toast.success('Session revoked');
    },
    onError: (error: any) => toast.error(error.response?.data?.detail || 'Failed to revoke session'),
  });

  const revokeAllMutation = useMutation({
    mutationFn: (reason: string) => authApi.logoutAll(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['userSessions'] });
      setShowRevokeAll(false);
      toast.success('All sessions revoked');
    },
    onError: (error: any) => toast.error(error.response?.data?.detail || 'Failed to revoke all sessions'),
  });

  const sessions = sessionsData?.data || [];
  const activeSessions = sessions.filter(s => s.status === 'active');
  const riskCounts = sessions.reduce((acc, s) => {
    acc[s.risk_tier] = (acc[s.risk_tier] || 0) + 1;
    return acc;
  }, {} as Record<RiskTier, number>);

  const handleViewDetail = (session: Session) => setDetailSession(session);

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="sticky top-0 z-40 bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-100">
                <Shield className="h-6 w-6 text-primary-600" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-gray-900">My Sessions</h1>
                <p className="text-sm text-gray-500">Manage your active sessions and security</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {user?.is_superuser && (
                <Link to="/admin">
                  <Button variant="outline" size="sm">
                    <LayoutDashboard className="h-4 w-4 mr-2 text-primary-600" />
                    Admin Panel
                  </Button>
                </Link>
              )}
              <Button variant="outline" size="sm" onClick={() => { refetchSessions(); refreshUser(); }}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Refresh
              </Button>
              <div className="relative group">
                <Button variant="ghost" size="sm" onClick={() => logout()} title="Sign Out">
                  <LogOut className="h-5 w-5" />
                </Button>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-6"
        >
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-500">Active Sessions</p>
                    <p className="text-3xl font-bold text-gray-900">{activeSessions.length}</p>
                  </div>
                  <div className="p-3 rounded-xl bg-primary-100">
                    <Activity className="h-6 w-6 text-primary-600" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-500">Total Sessions</p>
                    <p className="text-3xl font-bold text-gray-900">{sessions.length}</p>
                  </div>
                  <div className="p-3 rounded-xl bg-blue-100">
                    <Users className="h-6 w-6 text-blue-600" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-500">High Risk</p>
                    <p className="text-3xl font-bold text-red-600">
                      {(riskCounts.high || 0) + (riskCounts.critical || 0)}
                    </p>
                  </div>
                  <div className="p-3 rounded-xl bg-red-100">
                    <Zap className="h-6 w-6 text-red-600" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-500">MFA Status</p>
                    <p className="text-3xl font-bold text-gray-900">
                      {user?.mfa_enabled ? 'Enabled' : 'Disabled'}
                    </p>
                  </div>
                  <div className="p-3 rounded-xl bg-green-100">
                    <Shield className="h-6 w-6 text-green-600" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-lg">Your Sessions</CardTitle>
                  <p className="text-sm text-gray-500">{sessions.length} sessions total</p>
                </div>
                {sessions.some(s => s.status === 'active') && (
                  <Button variant="outline" size="sm" onClick={() => setShowRevokeAll(true)}>
                    <Trash2 className="h-4 w-4 mr-2" />
                    Revoke All Other Sessions
                  </Button>
                )}
              </CardHeader>

              <CardContent className="p-0">
                {sessionsLoading ? (
                  <div className="p-8 text-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-4 border-primary-500 border-t-transparent mx-auto" />
                  </div>
                ) : sessions.length === 0 ? (
                  <div className="p-8 text-center text-gray-500">No sessions found</div>
                ) : (
                  <div className="divide-y divide-gray-200">
                    {sessions.map((session, index) => (
                      <motion.div
                        key={session.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.05 }}
                        className="p-4 hover:bg-gray-50 flex items-center justify-between border-b border-gray-100 last:border-0"
                        onClick={() => handleViewDetail(session)}
                      >
                        <div className="flex items-center gap-4 flex-1 min-w-0">
                          <div className={cn('w-12 h-12 rounded-xl flex items-center justify-center', getRiskTierBg(session.risk_tier))}>
                            <Badge variant="risk" riskTier={session.risk_tier} className="text-xs" />
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-gray-900 truncate">{session.city || 'Unknown'}, {session.country || 'Unknown'}</span>
                              <Badge variant="status" status={session.status} className="text-xs" />
                              {session.mfa_verified && <Badge variant="outline" className="text-xs"><Shield className="h-3 w-3 mr-1" /> MFA</Badge>}
                              {session.step_up_completed && <Badge variant="outline" className="text-xs"><Zap className="h-3 w-3 mr-1" /> Step-Up</Badge>}
                            </div>
                            <div className="flex items-center gap-3 text-sm text-gray-500 mt-1">
                              <span className="font-mono">{session.ip_address}</span>
                              <span>{formatRelativeTime(session.last_activity_at)}</span>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 ml-4">
                          <span className="text-xs text-gray-400">{formatDate(session.created_at)}</span>
                          <ChevronDown className="h-5 w-5 text-gray-400" />
                        </div>
                      </motion.div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Security Status</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-green-100">
                        <Shield className="h-5 w-5 text-green-600" />
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">Two-Factor Authentication</p>
                        <p className="text-sm text-gray-500">{user?.mfa_enabled ? 'Enabled' : 'Disabled'}</p>
                      </div>
                    </div>
                    {!user?.mfa_enabled && (
                      <Button variant="outline" size="sm" onClick={() => navigate('/mfa/setup')}>
                        Enable
                      </Button>
                    )}
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-blue-100">
                        <Globe className="h-5 w-5 text-blue-600" />
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">Known Devices</p>
                        <p className="text-sm text-gray-500">{sessions.length} sessions</p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="pt-4 border-t border-gray-200">
                  <h4 className="font-medium text-gray-900 mb-3">Risk Distribution</h4>
                  <div className="space-y-2">
                    {(['critical', 'high', 'medium', 'low'] as RiskTier[]).map(tier => (
                      <div key={tier} className="flex items-center gap-3">
                        <Badge variant="risk" riskTier={tier} className="w-20 text-xs" />
                        <div className="flex-1">
                          <Progress value={riskCounts[tier] || 0} max={sessions.length || 1} size="sm" 
                            color={tier === 'critical' || tier === 'high' ? 'danger' : tier === 'medium' ? 'warning' : 'success'} />
                        </div>
                        <span className="text-sm text-gray-500 w-8 text-right">{riskCounts[tier] || 0}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Recent Activity</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="max-h-64 overflow-y-auto space-y-2">
                {(auditData?.data || []).slice(0, 10).map(log => (
                  <motion.div
                    key={log.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="flex items-center gap-3 p-3 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors"
                  >
                    <Badge variant="risk" riskTier={log.risk_tier} className="flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-gray-900">{log.action.replace('_', ' ')}</div>
                      <div className="text-xs text-gray-500">{log.description}</div>
                    </div>
                    <div className="text-xs text-gray-400 font-mono">{formatRelativeTime(log.created_at)}</div>
                  </motion.div>
                ))}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </main>

      <Modal isOpen={!!detailSession} onClose={() => setDetailSession(null)} title="Session Details" size="lg">
        {detailSession && (
          <SessionDetailView session={detailSession} onClose={() => setDetailSession(null)} onRevoke={(id, reason) => revokeMutation.mutate({ id, reason })} />
        )}
      </Modal>

      <Modal isOpen={showRevokeAll} onClose={() => setShowRevokeAll(false)} title="Revoke All Other Sessions" size="md">
        <div className="space-y-4">
          <p className="text-gray-600">This will sign you out of all other devices and sessions. Your current session will remain active.</p>
          <p className="text-sm text-amber-600">You will need to log in again on other devices.</p>
          <div className="flex justify-end gap-3 pt-4">
            <Button variant="outline" onClick={() => setShowRevokeAll(false)}>Cancel</Button>
            <Button variant="destructive" onClick={() => revokeAllMutation.mutate('User revoked all other sessions')}>
              Revoke All Other Sessions
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function SessionDetailView({ session, onClose, onRevoke }: { session: Session; onClose: () => void; onRevoke: (id: number, reason: string) => void }) {
  const [reason, setReason] = useState('');
  
  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-gray-500">Session ID</div>
            <div className="font-mono text-lg">{session.id}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-gray-500">Risk Score</div>
            <div className="flex items-center gap-2">
              <Progress value={session.risk_score * 100} max={100} className="flex-1" 
                color={session.risk_tier === 'critical' ? 'danger' : session.risk_tier === 'high' ? 'danger' : session.risk_tier === 'medium' ? 'warning' : 'success'} />
              <Badge variant="risk" riskTier={session.risk_tier} />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-gray-500">Status</div>
            <Badge variant="status" status={session.status} className="text-base" />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Connection Info</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex justify-between"><span className="text-gray-500">IP Address</span><span className="font-mono">{session.ip_address}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Location</span><span>{session.city || 'Unknown'}, {session.country || 'Unknown'}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">User Agent</span><span className="text-right max-w-xs truncate">{session.user_agent}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Created</span><span>{formatDate(session.created_at)}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Last Activity</span><span>{formatRelativeTime(session.last_activity_at)}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Expires</span><span>{formatDate(session.expires_at)}</span></div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Risk Factors</CardTitle>
          </CardHeader>
          <CardContent>
            {Object.keys(session.risk_factors || {}).length === 0 ? (
              <p className="text-gray-500 text-sm">No risk factors detected</p>
            ) : (
              <div className="space-y-2">
                {Object.entries(session.risk_factors || {}).map(([key, factor]: [string, any]) => (
                  <div key={key} className="flex items-center justify-between p-2 rounded-lg bg-gray-50">
                    <span className="text-sm font-medium">{key.replace('_', ' ')}</span>
                    <div className="flex items-center gap-2">
                      <Progress value={(factor?.weight || 0) * 100} max={100} size="sm" className="w-32" color="warning" />
                      <span className="text-xs text-gray-500">{((factor?.weight || 0) * 100).toFixed(0)}%</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {session.status === 'active' && (
        <div className="pt-4 border-t border-gray-200">
          <label className="block text-sm font-medium text-gray-700 mb-2">Reason for revocation</label>
          <Input value={reason} onChange={e => setReason(e.target.value)} placeholder="Enter reason..." />
          <div className="flex justify-end gap-3 mt-4">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button variant="destructive" onClick={() => { onRevoke(session.id, reason); onClose(); }}>
              Revoke This Session
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}