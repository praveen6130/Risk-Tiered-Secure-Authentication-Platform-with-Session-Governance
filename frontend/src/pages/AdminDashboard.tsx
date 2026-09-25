import { useState, useEffect, useMemo } from 'react';
import { extractErrorMessage } from '../utils/errorMessage';
import { motion, AnimatePresence } from 'framer-motion';
import { Link } from 'react-router-dom';
import {
  Users, Activity, AlertTriangle, Shield, Search, Filter, Download, ChevronDown, ChevronUp,
  MapPin, Globe, Clock, Zap, Trash2, Eye, MoreHorizontal, Check, X, RefreshCw, LogOut, LayoutDashboard, Database
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';
import { adminApi, authApi } from '../services/api';
import { Session, SessionDetail, RiskTier, SessionStatus, User, AuditLog } from '../types';
import { Button, Input, Badge, Card, CardContent, CardHeader, CardTitle, Modal, Progress } from '../components/ui';
import { formatDate, formatRelativeTime, getRiskTierColor, getRiskTierBg, cn } from '../utils/fingerprint';
import { DatabaseInspectorModal } from '../components/DatabaseInspectorModal';
import { toast } from 'sonner';

const riskTierOrder: Record<RiskTier, number> = { critical: 0, high: 1, medium: 2, low: 3 };
const statusOrder: Record<SessionStatus, number> = { step_up_required: 0, active: 1, blocked: 2, revoked: 3, expired: 4 };

export function AdminDashboard() {
  const { logout } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [riskFilter, setRiskFilter] = useState<RiskTier | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<SessionStatus | 'all'>('all');
  const [selectedSessions, setSelectedSessions] = useState<number[]>([]);
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' }>({ key: 'last_activity_at', direction: 'desc' });
  const [detailSession, setDetailSession] = useState<SessionDetail | null>(null);
  const [isDbModalOpen, setIsDbModalOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 20;

  const { data: sessionsData, isLoading: sessionsLoading, refetch: refetchSessions } = useQuery({
    queryKey: ['adminSessions', currentPage],
    queryFn: () => adminApi.getSessions({ limit: pageSize, offset: (currentPage - 1) * pageSize }),
  });

  const { data: stats } = useQuery({
    queryKey: ['riskStats'],
    queryFn: () => adminApi.getRiskStats(),
  });

  const revokeMutation = useMutation({
    mutationFn: ({ ids, reason }: { ids: number[]; reason: string }) => adminApi.revokeSessions(ids, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adminSessions'] });
      queryClient.invalidateQueries({ queryKey: ['riskStats'] });
      refetchSessions();
      setSelectedSessions([]);
      setDetailSession(null);
      toast.success('Session(s) successfully revoked');
    },
    onError: (error: any) => toast.error(extractErrorMessage(error, 'Failed to revoke sessions')),
  });

  const revokeUserMutation = useMutation({
    mutationFn: ({ userId, reason }: { userId: number; reason: string }) => adminApi.revokeAllUserSessions(userId, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adminSessions'] });
      queryClient.invalidateQueries({ queryKey: ['riskStats'] });
      refetchSessions();
      setDetailSession(null);
      toast.success('All sessions for user revoked');
    },
    onError: (error: any) => toast.error(extractErrorMessage(error, 'Failed to revoke user sessions')),
  });

  const sessions = useMemo(() => {
    const raw = sessionsData?.data;
    let filtered: Session[] = Array.isArray(raw) ? [...raw] : (Array.isArray(sessionsData) ? [...(sessionsData as any)] : []);
    
    if (search) {
      const searchLower = search.toLowerCase();
      filtered = filtered.filter(s => 
        s.ip_address.toLowerCase().includes(searchLower) ||
        s.city?.toLowerCase().includes(searchLower) ||
        s.country?.toLowerCase().includes(searchLower) ||
        s.user_agent.toLowerCase().includes(searchLower)
      );
    }
    
    if (riskFilter !== 'all') {
      filtered = filtered.filter(s => s.risk_tier === riskFilter);
    }
    
    if (statusFilter !== 'all') {
      filtered = filtered.filter(s => s.status === statusFilter);
    }
    
    filtered.sort((a, b) => {
      const aVal = a[sortConfig.key as keyof Session];
      const bVal = b[sortConfig.key as keyof Session];
      if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
    
    return filtered;
  }, [sessionsData, search, riskFilter, statusFilter, sortConfig]);

  const handleSort = (key: string) => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc',
    }));
  };

  const toggleSelect = (id: number) => {
    setSelectedSessions(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const toggleSelectAll = () => {
    if (selectedSessions.length === sessions.length) {
      setSelectedSessions([]);
    } else {
      setSelectedSessions(sessions.map(s => s.id));
    }
  };

  const handleRevokeSelected = () => {
    if (selectedSessions.length === 0) return;
    revokeMutation.mutate({ ids: selectedSessions, reason: 'Admin bulk revocation' });
  };

  const handleViewDetail = async (session: Session) => {
    try {
      const response = await adminApi.getSessionDetail(session.id);
      setDetailSession(response.data);
    } catch {
      toast.error('Failed to load session details');
    }
  };

  const riskCounts = useMemo(() => {
    return (sessionsData?.data || []).reduce((acc, s) => {
      acc[s.risk_tier] = (acc[s.risk_tier] || 0) + 1;
      return acc;
    }, {} as Record<RiskTier, number>);
  }, [sessionsData]);

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
                <h1 className="text-xl font-bold text-gray-900">Session Governance</h1>
                <p className="text-sm text-gray-500">Monitor and control active sessions</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Link to="/dashboard">
                <Button variant="outline" size="sm">
                  <LayoutDashboard className="h-4 w-4 mr-2" />
                  User Dashboard
                </Button>
              </Link>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsDbModalOpen(true)}
                className="border-emerald-300 text-emerald-700 hover:bg-emerald-50"
              >
                <Database className="h-4 w-4 mr-2" />
                Database Credentials
              </Button>
              <Button variant="outline" size="sm" onClick={() => { refetchSessions(); queryClient.invalidateQueries({ queryKey: ['riskStats'] }); }}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Refresh
              </Button>
              <Button variant="ghost" size="sm" onClick={() => logout()} title="Sign Out">
                <LogOut className="h-5 w-5" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="grid gap-6 lg:grid-cols-4"
        >
          <Card className="lg:col-span-4">
            <CardHeader>
              <CardTitle className="text-lg">Risk Overview</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {(['critical', 'high', 'medium', 'low'] as RiskTier[]).map(tier => (
                  <motion.div
                    key={tier}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: riskTierOrder[tier] * 0.1 }}
                    className={cn('p-4 rounded-xl text-center', getRiskTierBg(tier))}
                  >
                    <div className={cn('text-3xl font-bold', getRiskTierColor(tier))}>
                      {stats?.data?.risk_distribution?.[tier] || riskCounts[tier] || 0}
                    </div>
                    <div className={cn('text-xs font-medium mt-1', getRiskTierColor(tier))}>
                      {tier.charAt(0).toUpperCase() + tier.slice(1)} Risk
                    </div>
                  </motion.div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="lg:col-span-4">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-lg">Active Sessions</CardTitle>
                <p className="text-sm text-gray-500">{(sessionsData?.data || []).length} sessions total</p>
              </div>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search IP, location, device..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="pl-10 pr-4 py-2 w-64 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <select
                    value={riskFilter}
                    onChange={e => setRiskFilter(e.target.value as RiskTier | 'all')}
                    className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  >
                    <option value="all">All Risk</option>
                    <option value="critical">Critical</option>
                    <option value="high">High</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
                  </select>
                  <select
                    value={statusFilter}
                    onChange={e => setStatusFilter(e.target.value as SessionStatus | 'all')}
                    className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  >
                    <option value="all">All Status</option>
                    <option value="active">Active</option>
                    <option value="step_up_required">Step-Up Required</option>
                    <option value="blocked">Blocked</option>
                    <option value="revoked">Revoked</option>
                    <option value="expired">Expired</option>
                  </select>
                </div>
              </div>
            </CardHeader>

            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-4 py-3 text-left">
                        <input
                          type="checkbox"
                          checked={selectedSessions.length === sessions.length && sessions.length > 0}
                          onChange={toggleSelectAll}
                          className="w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                        />
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:text-gray-700"
                        onClick={() => handleSort('last_activity_at')}>
                        Last Activity
                        {sortConfig.key === 'last_activity_at' && (sortConfig.direction === 'asc' ? <ChevronUp className="inline h-4 w-4" /> : <ChevronDown className="inline h-4 w-4" />)}
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:text-gray-700"
                        onClick={() => handleSort('ip_address')}>
                        IP / Location
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:text-gray-700"
                        onClick={() => handleSort('risk_score')}>
                        Risk
                        {sortConfig.key === 'risk_score' && (sortConfig.direction === 'asc' ? <ChevronUp className="inline h-4 w-4" /> : <ChevronDown className="inline h-4 w-4" />)}
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:text-gray-700"
                        onClick={() => handleSort('status')}>
                        Status
                        {sortConfig.key === 'status' && (sortConfig.direction === 'asc' ? <ChevronUp className="inline h-4 w-4" /> : <ChevronDown className="inline h-4 w-4" />)}
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Device</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    <AnimatePresence mode="popLayout">
                      {sessions.map((session, index) => (
                        <motion.tr
                          key={session.id}
                          initial={{ opacity: 0, x: -20 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, x: 20 }}
                          transition={{ delay: index * 0.03 }}
                          className="hover:bg-gray-50 transition-colors"
                        >
                          <td className="px-4 py-3">
                            <input
                              type="checkbox"
                              checked={selectedSessions.includes(session.id)}
                              onChange={() => toggleSelect(session.id)}
                              className="w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                            />
                          </td>
                          <td className="px-4 py-3">
                            <div className="text-sm text-gray-900">{formatRelativeTime(session.last_activity_at)}</div>
                            <div className="text-xs text-gray-500">{formatDate(session.created_at)}</div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="text-sm text-gray-900 font-mono">{session.ip_address}</div>
                            <div className="flex items-center gap-1 text-xs text-gray-500">
                              <MapPin className="h-3 w-3" />
                              <span>{session.city || 'Unknown'}, {session.country || 'Unknown'}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              <div className="w-24">
                                <Progress value={session.risk_score * 100} max={100} size="sm" 
                                  color={session.risk_tier === 'critical' ? 'danger' : session.risk_tier === 'high' ? 'danger' : session.risk_tier === 'medium' ? 'warning' : 'success'} />
                              </div>
                              <Badge variant="risk" riskTier={session.risk_tier} />
                            </div>
                            <div className="mt-1 flex flex-wrap gap-1">
                              {Object.entries(session.risk_factors || {}).map(([key, factor]) => (
                                <Badge key={key} variant="outline" className="text-xs">
                                  {key.replace('_', ' ')}
                                </Badge>
                              ))}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <Badge variant="status" status={session.status} />
                            {session.mfa_verified && (
                              <Badge variant="outline" className="ml-1 text-xs">
                                <Shield className="h-3 w-3 mr-1" /> MFA
                              </Badge>
                            )}
                            {session.step_up_completed && (
                              <Badge variant="outline" className="ml-1 text-xs">
                                <Zap className="h-3 w-3 mr-1" /> Step-Up
                              </Badge>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <div className="text-sm text-gray-900 max-w-xs truncate">{session.user_agent}</div>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <Button variant="ghost" size="sm" onClick={() => handleViewDetail(session)} title="View Session Details">
                                <Eye className="h-4 w-4" />
                              </Button>
                              {session.status === 'active' || session.status === 'step_up_required' ? (
                                <Button
                                  variant="destructive"
                                  size="sm"
                                  className="h-8 px-2.5 text-xs font-semibold"
                                  title={`Revoke Session #${session.id}`}
                                  disabled={revokeMutation.isPending}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    revokeMutation.mutate({ ids: [session.id], reason: 'Admin revoked session' });
                                  }}
                                >
                                  <Trash2 className="h-3.5 w-3.5 mr-1" />
                                  Revoke
                                </Button>
                              ) : (
                                <span className="text-xs text-gray-400 font-mono italic">Revoked</span>
                              )}
                            </div>
                          </td>
                        </motion.tr>
                      ))}
                    </AnimatePresence>
                    {sessions.length === 0 && (
                      <tr>
                        <td colSpan={8} className="px-4 py-12 text-center text-gray-500">
                          No sessions found
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {selectedSessions.length > 0 && (
                <div className="p-4 border-t border-gray-200 bg-gray-50 flex items-center justify-between">
                  <span className="text-sm text-gray-600">{selectedSessions.length} selected</span>
                  <Button variant="destructive" size="sm" onClick={handleRevokeSelected} disabled={revokeMutation.isPending}>
                    <Trash2 className="h-4 w-4 mr-2" />
                    Revoke Selected
                  </Button>
                </div>
              )}

              <div className="p-4 border-t border-gray-200 flex items-center justify-between">
                <span className="text-sm text-gray-600">Page {currentPage}</span>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}>
                    Previous
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => p + 1)} disabled={sessions.length < pageSize}>
                    Next
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </main>

      <Modal
        isOpen={!!detailSession}
        onClose={() => setDetailSession(null)}
        title="Session Details"
        size="xl"
      >
        {detailSession && (
          <SessionDetailModal
            session={detailSession}
            onClose={() => setDetailSession(null)}
            onRevokeSession={(id) => revokeMutation.mutate({ ids: [id], reason: 'Admin revoked session' })}
            onRevokeUser={(userId) => revokeUserMutation.mutate({ userId, reason: 'Admin revoked entire user access' })}
          />
        )}
      </Modal>

      <DatabaseInspectorModal isOpen={isDbModalOpen} onClose={() => setIsDbModalOpen(false)} />
    </div>
  );
}

function SessionDetailModal({
  session,
  onClose,
  onRevokeSession,
  onRevokeUser,
}: {
  session: SessionDetail;
  onClose: () => void;
  onRevokeSession: (sessionId: number) => void;
  onRevokeUser: (userId: number) => void;
}) {
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
            <div className="flex justify-between"><span className="text-gray-500">Location</span><span>{session.city}, {session.country}</span></div>
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

      {session.device_fingerprint && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Device Fingerprint</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-gray-500">Nickname</span><span>{session.device_fingerprint.nickname || 'Unnamed'}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Trusted</span><Badge variant={session.device_fingerprint.is_trusted ? 'default' : 'outline'}>{session.device_fingerprint.is_trusted ? 'Yes' : 'No'}</Badge></div>
            <div className="flex justify-between"><span className="text-gray-500">First Seen</span><span>{formatDate(session.device_fingerprint.created_at)}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Last Seen</span><span>{formatRelativeTime(session.device_fingerprint.last_seen_at)}</span></div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg">Audit Trail</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="max-h-64 overflow-y-auto space-y-2">
            {(session.audit_logs || []).slice(0, 20).map(log => (
              <motion.div
                key={log.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                className="flex items-center gap-3 p-3 rounded-lg bg-gray-50"
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

      <div className="pt-4 border-t border-gray-200 flex flex-wrap items-center justify-between gap-3">
        <div className="text-xs text-gray-500">
          User ID: <span className="font-mono font-medium text-gray-700">{session.user_id}</span>
        </div>
        <div className="flex gap-2">
          {(session.status === 'active' || session.status === 'step_up_required') && (
            <Button
              variant="outline"
              size="sm"
              className="text-red-600 border-red-200 hover:bg-red-50"
              onClick={() => {
                onRevokeSession(session.id);
                onClose();
              }}
            >
              <Trash2 className="h-4 w-4 mr-1.5" />
              Revoke This Session
            </Button>
          )}
          <Button
            variant="destructive"
            size="sm"
            onClick={() => {
              onRevokeUser(session.user_id);
              onClose();
            }}
          >
            <Shield className="h-4 w-4 mr-1.5" />
            Revoke User All Access
          </Button>
        </div>
      </div>
    </div>
  );
}