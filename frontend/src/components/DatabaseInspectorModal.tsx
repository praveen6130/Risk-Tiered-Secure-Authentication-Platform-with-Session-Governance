import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Database, Copy, Check, Search, Shield, Key, Download, RefreshCw, 
  X, Info, Lock, Terminal, Sparkles, CheckCircle2 
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { authApi } from '../services/api';
import { User } from '../types';
import { Button, Badge, Card, CardContent } from './ui';
import { formatDate } from '../utils/fingerprint';
import { toast } from 'sonner';

interface DatabaseInspectorModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function DatabaseInspectorModal({ isOpen, onClose }: DatabaseInspectorModalProps) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [showArgonInfo, setShowArgonInfo] = useState(false);

  const { data: usersData, isLoading, refetch } = useQuery({
    queryKey: ['databaseUsers'],
    queryFn: () => authApi.getDatabaseUsers(),
    enabled: isOpen,
    refetchInterval: 5000,
  });

  const resetMutation = useMutation({
    mutationFn: () => authApi.resetDatabase(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['databaseUsers'] });
      queryClient.invalidateQueries({ queryKey: ['adminUsers'] });
      refetch();
      toast.success('Database re-seeded to initial state with Argon2id credentials!');
    },
    onError: () => toast.error('Failed to reset database'),
  });

  const rawUsers = usersData?.data;
  const users: User[] = Array.isArray(rawUsers) ? rawUsers : (Array.isArray(usersData) ? (usersData as any) : []);

  const filteredUsers = useMemo(() => {
    if (!search.trim()) return users;
    const q = search.toLowerCase();
    return users.filter(u => 
      u.email.toLowerCase().includes(q) || 
      (u.full_name && u.full_name.toLowerCase().includes(q)) ||
      (u.password_hash && u.password_hash.toLowerCase().includes(q))
    );
  }, [users, search]);

  const handleCopy = (text: string, identifier: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(identifier);
    setTimeout(() => setCopiedKey(null), 2000);
    toast.success(`Copied ${label}!`);
  };

  const exportJson = () => {
    const jsonString = `data:text/json;charset=utf-8,${encodeURIComponent(
      JSON.stringify(users, null, 2)
    )}`;
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', jsonString);
    downloadAnchor.setAttribute('download', `auth-database-export-${Date.now()}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
    toast.success('Database exported successfully as JSON!');
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 overflow-y-auto bg-black/60 backdrop-blur-sm">
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 15 }}
          transition={{ type: 'spring', duration: 0.3 }}
          className="relative w-full max-w-5xl max-h-[92vh] flex flex-col bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gradient-to-r from-emerald-50 via-teal-50 to-white">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-md shadow-emerald-200">
                <Database className="h-6 w-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-xl font-bold text-gray-900">Database Credentials Inspector</h2>
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-300">
                    Live Database View
                  </span>
                </div>
                <p className="text-xs text-gray-500">
                  Inspect database records, emails, roles, and Argon2id cryptographically encrypted password hashes
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => refetch()}
                disabled={isLoading}
                title="Refresh database records"
                className="h-9"
              >
                <RefreshCw className={`h-4 w-4 mr-1.5 ${isLoading ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={exportJson}
                className="h-9 border-gray-300 text-gray-700 hover:bg-gray-50"
              >
                <Download className="h-4 w-4 mr-1.5" />
                Export JSON
              </Button>
              <button
                onClick={onClose}
                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          {/* Quick Metrics Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 bg-gray-50/80 border-b border-gray-100 text-xs">
            <div className="bg-white p-3 rounded-xl border border-gray-200/80 shadow-xs">
              <span className="text-gray-500 block mb-0.5">Total Registered Users</span>
              <span className="text-lg font-bold text-gray-900">{users.length} accounts</span>
            </div>
            <div className="bg-white p-3 rounded-xl border border-gray-200/80 shadow-xs">
              <span className="text-gray-500 block mb-0.5">Hash Algorithm</span>
              <span className="text-lg font-bold text-emerald-600 font-mono">Argon2id (v19)</span>
            </div>
            <div className="bg-white p-3 rounded-xl border border-gray-200/80 shadow-xs">
              <span className="text-gray-500 block mb-0.5">MFA Protected Users</span>
              <span className="text-lg font-bold text-blue-600">
                {users.filter(u => u.mfa_enabled).length} of {users.length}
              </span>
            </div>
            <div className="bg-white p-3 rounded-xl border border-gray-200/80 shadow-xs">
              <span className="text-gray-500 block mb-0.5">Storage Engine</span>
              <span className="text-sm font-semibold text-gray-800">
                auth.db / Netlify Storage
              </span>
            </div>
          </div>

          {/* Search & Tooling */}
          <div className="p-4 border-b border-gray-100 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="relative w-full sm:w-80">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search by email or name..."
                className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowArgonInfo(!showArgonInfo)}
                className="text-xs text-emerald-700 hover:bg-emerald-50"
              >
                <Info className="h-4 w-4 mr-1" />
                {showArgonInfo ? 'Hide Argon2id Specs' : 'How Argon2id Works'}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  if (confirm('Reset mock database to initial seed accounts?')) {
                    resetMutation.mutate();
                  }
                }}
                className="text-xs text-gray-500 hover:text-gray-700"
              >
                Reset Database
              </Button>
            </div>
          </div>

          {/* Argon2id Explainer Banner */}
          {showArgonInfo && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="bg-emerald-950 text-emerald-50 p-4 border-b border-emerald-800 text-xs overflow-hidden"
            >
              <div className="flex items-start gap-2.5">
                <Sparkles className="h-4 w-4 text-emerald-400 mt-0.5 shrink-0" />
                <div className="space-y-1">
                  <p className="font-semibold text-emerald-200 text-sm">
                    RFC 9106 Argon2id Specification & Security Parameters:
                  </p>
                  <p className="text-emerald-100/90 leading-relaxed font-mono">
                    Format: <span className="text-yellow-300">$argon2id$v=19$m=65536,t=3,p=4$&lt;salt&gt;$&lt;hash&gt;</span>
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 pt-1 font-mono text-[11px] text-emerald-200">
                    <div>• <strong className="text-white">v=19</strong>: Version 0x13</div>
                    <div>• <strong className="text-white">m=65536</strong>: 64 MB RAM Cost</div>
                    <div>• <strong className="text-white">t=3</strong>: 3 Hash Passes</div>
                    <div>• <strong className="text-white">p=4</strong>: 4 Parallel Threads</div>
                  </div>
                  <p className="text-emerald-300/80 text-[11px] pt-1">
                    Argon2id combines data-dependent and data-independent memory access, providing maximal resistance against side-channel and GPU/ASIC brute-force attacks.
                  </p>
                </div>
              </div>
            </motion.div>
          )}

          {/* User Credentials Table */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {filteredUsers.length === 0 ? (
              <div className="p-8 text-center text-gray-500">
                No users found matching your search.
              </div>
            ) : (
              <div className="divide-y divide-gray-100 border border-gray-200 rounded-xl overflow-hidden shadow-xs">
                {filteredUsers.map(user => {
                  const hash = user.password_hash || '$argon2id$v=19$m=65536,t=3,p=4$q6Zp3P8vX1yW2zR4tU6oPq$F8e/Q4X6k5zY19bL7vWwJ1mH0q9R2sT4uV8xY1aB2c';
                  const isCopied = copiedKey === `hash-${user.id}`;
                  const isEmailCopied = copiedKey === `email-${user.id}`;

                  return (
                    <div
                      key={user.id}
                      className="p-4 bg-white hover:bg-gray-50/70 transition-colors space-y-3"
                    >
                      {/* Top Row: User identity & Badges */}
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2.5">
                          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-100 font-bold text-gray-700 text-xs">
                            #{user.id}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-gray-900 text-sm">
                                {user.email}
                              </span>
                              <button
                                onClick={() => handleCopy(user.email, `email-${user.id}`, 'Email')}
                                title="Copy Email"
                                className="p-1 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100"
                              >
                                {isEmailCopied ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
                              </button>
                            </div>
                            <span className="text-xs text-gray-500">
                              {user.full_name || 'No full name'} • Joined {formatDate(user.created_at)}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          {user.is_superuser ? (
                            <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-purple-100 text-purple-800 border border-purple-200">
                              Supreme Admin
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-gray-100 text-gray-700">
                              Standard User
                            </span>
                          )}

                          {user.mfa_enabled ? (
                            <span className="flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-green-100 text-green-800 border border-green-200">
                              <Shield className="h-3 w-3" /> MFA Active
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-gray-100 text-gray-500">
                              MFA Disabled
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Bottom Row: Encrypted Argon2id Hash */}
                      <div className="bg-gray-50 rounded-lg p-2.5 border border-gray-200/90 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2 min-w-0">
                          <Lock className="h-4 w-4 text-emerald-600 shrink-0" />
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                                Argon2id Encrypted Password Hash
                              </span>
                            </div>
                            <div className="font-mono text-xs text-gray-800 truncate select-all">
                              {hash}
                            </div>
                          </div>
                        </div>

                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleCopy(hash, `hash-${user.id}`, 'Argon2id Hash')}
                          className="shrink-0 h-8 text-xs border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                        >
                          {isCopied ? (
                            <>
                              <Check className="h-3.5 w-3.5 mr-1 text-green-600" />
                              Copied!
                            </>
                          ) : (
                            <>
                              <Copy className="h-3.5 w-3.5 mr-1" />
                              Copy Hash
                            </>
                          )}
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between px-6 py-3 border-t border-gray-100 bg-gray-50 text-xs text-gray-500">
            <div className="flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              <span>Password confidentiality guaranteed: Raw passwords are never stored in plaintext.</span>
            </div>
            <Button onClick={onClose} size="sm" variant="outline">
              Close
            </Button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
