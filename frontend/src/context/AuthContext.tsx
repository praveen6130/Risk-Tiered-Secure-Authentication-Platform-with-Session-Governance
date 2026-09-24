import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { authApi } from '../services/api';
import { User, Token } from '../types';
import { toast } from 'sonner';

interface AuthContextType {
  user: User | null;
  token: Token | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string, deviceFingerprint?: object, rememberDevice?: boolean) => Promise<Token | undefined>;
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

  const refreshUser = useCallback(async () => {
    try {
      const response = await authApi.getMe();
      setUser(response.data);
    } catch {
      clearAuth();
    }
  }, []);

  const loadStoredAuth = useCallback(async () => {
    try {
      if (typeof window === 'undefined' || !window.localStorage) {
        setIsLoading(false);
        return;
      }
      const storedToken = localStorage.getItem('access_token');
      const storedRefresh = localStorage.getItem('refresh_token');
      
      if (storedToken && storedRefresh) {
        let tokenObj: Token;
        try {
          tokenObj = JSON.parse(storedToken);
        } catch {
          tokenObj = {
            access_token: storedToken,
            refresh_token: storedRefresh,
            token_type: 'bearer',
          };
        }
        setToken(tokenObj);
        try {
          const userRes = await authApi.getMe();
          setUser(userRes.data);
        } catch {
          clearAuth();
        }
      }
    } catch {
      clearAuth();
    } finally {
      setIsLoading(false);
    }
  }, []);

  const login = async (email: string, password: string, deviceFingerprint?: object, rememberDevice?: boolean): Promise<Token | undefined> => {
    setIsLoading(true);
    try {
      const response = await authApi.login({ email, password, device_fingerprint: deviceFingerprint, remember_device: rememberDevice });
      const tokenData = response.data;
      
      if (tokenData.mfa_required) {
        setToken(tokenData);
        localStorage.setItem('mfa_session_id', tokenData.session_id || '');
        return tokenData;
      }
      
      setToken(tokenData);
      localStorage.setItem('access_token', tokenData.access_token);
      localStorage.setItem('refresh_token', tokenData.refresh_token);
      
      try {
        const userRes = await authApi.getMe();
        setUser(userRes.data);
      } catch (e) {
        console.error('Failed to get user profile after login:', e);
      }
      return tokenData;
    } catch (err) {
      clearAuth();
      throw err;
    } finally {
      setIsLoading(false);
    }
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

  const setTokens = async (newToken: Token) => {
    setToken(newToken);
    localStorage.setItem('access_token', newToken.access_token);
    localStorage.setItem('refresh_token', newToken.refresh_token);
    try {
      const userRes = await authApi.getMe();
      setUser(userRes.data);
    } catch (e) {
      console.error('Failed to get user profile in setTokens:', e);
    }
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