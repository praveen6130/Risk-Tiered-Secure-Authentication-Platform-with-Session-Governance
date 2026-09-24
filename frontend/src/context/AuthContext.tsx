import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { authApi } from '../services/api';
import { User, Token } from '../types';
import { toast } from 'sonner';

interface AuthContextType {
  user: User | null;
  token: Token | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string, deviceFingerprint?: object, rememberDevice?: boolean) => Promise<void>;
  register: (email: string, password: string, fullName?: string, deviceFingerprint?: object) => Promise<void>;
  logout: () => Promise<void>;
  logoutAll: () => Promise<void>;
  refreshUser: () => Promise<void>;
  setTokens: (token: Token) => void;
  clearAuth: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<Token | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadStoredAuth = useCallback(async () => {
    const storedToken = localStorage.getItem('access_token');
    const storedRefresh = localStorage.getItem('refresh_token');
    
    if (storedToken && storedRefresh) {
      setToken(JSON.parse(storedToken) as Token);
      try {
        await refreshUser();
      } catch {
        clearAuth();
      }
    }
    setIsLoading(false);
  }, []);

  const refreshUser = async () => {
    try {
      const response = await authApi.getSessions();
      if (response.data.length > 0) {
        const latestSession = response.data[0];
        const userResponse = await fetch(`${import.meta.env.VITE_API_URL || '/api/v1'}/auth/sessions/${latestSession.id}`, {
          credentials: 'include',
        });
        if (userResponse.ok) {
          const sessionData = await userResponse.json();
          setUser(sessionData.user);
        }
      }
    } catch {
      clearAuth();
    }
  };

  const login = async (email: string, password: string, deviceFingerprint?: object, rememberDevice?: boolean) => {
    const response = await authApi.login({ email, password, device_fingerprint: deviceFingerprint, remember_device: rememberDevice });
    const tokenData = response.data;
    
    if (tokenData.mfa_required) {
      setToken(tokenData);
      localStorage.setItem('mfa_session_id', tokenData.session_id || '');
      return;
    }
    
    setToken(tokenData);
    localStorage.setItem('access_token', tokenData.access_token);
    localStorage.setItem('refresh_token', tokenData.refresh_token);
    await refreshUser();
  };

  const register = async (email: string, password: string, fullName?: string, deviceFingerprint?: object) => {
    await authApi.register({ email, password, full_name: fullName, device_fingerprint: deviceFingerprint });
    toast.success('Registration successful! Please log in.');
  };

  const logout = async () => {
    try {
      await authApi.logout();
    } catch {
      // Ignore errors
    }
    clearAuth();
  };

  const logoutAll = async () => {
    try {
      await authApi.logoutAll();
    } catch {
      // Ignore errors
    }
    clearAuth();
  };

  const setTokens = (newToken: Token) => {
    setToken(newToken);
    localStorage.setItem('access_token', newToken.access_token);
    localStorage.setItem('refresh_token', newToken.refresh_token);
  };

  const clearAuth = () => {
    setUser(null);
    setToken(null);
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('mfa_session_id');
  };

  useEffect(() => {
    loadStoredAuth();
  }, [loadStoredAuth]);

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isLoading,
        isAuthenticated: !!user && !!token,
        login,
        register,
        logout,
        logoutAll,
        refreshUser,
        setTokens,
        clearAuth,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}