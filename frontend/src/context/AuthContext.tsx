import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { Platform } from 'react-native';
import { api, User, setToken, getToken } from '@/src/api/client';

WebBrowser.maybeCompleteAuthSession();

type AuthState = {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name?: string) => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
};

const AuthCtx = createContext<AuthState | null>(null);

export function useAuth() {
  const c = useContext(AuthCtx);
  if (!c) throw new Error('useAuth outside AuthProvider');
  return c;
}

const processedSessionIds = new Set<string>();

function extractSessionId(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = url.match(/[?#&]session_id=([^&#]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const exchangeSessionId = useCallback(async (sessionId: string) => {
    if (processedSessionIds.has(sessionId)) return;
    processedSessionIds.add(sessionId);
    const res = await api.post<{ session_token: string; user: User }>('/auth/session', { session_id: sessionId }, false);
    await setToken(res.session_token);
    setUser(res.user);
  }, []);

  const refresh = useCallback(async () => {
    const t = await getToken();
    if (!t) { setUser(null); return; }
    try {
      const me = await api.get<User>('/auth/me');
      setUser(me);
    } catch {
      await setToken(null);
      setUser(null);
    }
  }, []);

  // Mount: check for OAuth callback session_id first, then existing token
  useEffect(() => {
    (async () => {
      try {
        if (Platform.OS === 'web' && typeof window !== 'undefined') {
          const sid = extractSessionId(window.location.href);
          if (sid) {
            await exchangeSessionId(sid);
            try {
              const url = new URL(window.location.href);
              url.hash = '';
              url.searchParams.delete('session_id');
              window.history.replaceState(window.history.state, '', url.toString());
            } catch {}
            setLoading(false);
            return;
          }
        } else {
          const initial = await Linking.getInitialURL();
          const sid = extractSessionId(initial);
          if (sid) {
            await exchangeSessionId(sid);
            setLoading(false);
            return;
          }
        }
        await refresh();
      } finally {
        setLoading(false);
      }
    })();

    if (Platform.OS !== 'web') {
      const sub = Linking.addEventListener('url', async ({ url }) => {
        const sid = extractSessionId(url);
        if (sid) {
          try { await exchangeSessionId(sid); } catch (e) { console.warn('exchange failed', e); }
        }
      });
      return () => sub.remove();
    }
  }, [exchangeSessionId, refresh]);

  const login = useCallback(async (email: string, password: string) => {
    const res = await api.post<{ session_token: string; user: User }>('/auth/login', { email, password }, false);
    await setToken(res.session_token);
    setUser(res.user);
  }, []);

  const register = useCallback(async (email: string, password: string, name?: string) => {
    const res = await api.post<{ session_token: string; user: User }>('/auth/register', { email, password, name }, false);
    await setToken(res.session_token);
    setUser(res.user);
  }, []);

  const loginWithGoogle = useCallback(async () => {
    const redirectUrl = Platform.OS === 'web'
      ? (typeof window !== 'undefined' ? window.location.origin + '/' : '/')
      : Linking.createURL('');
    const authUrl = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
    if (Platform.OS === 'web') {
      window.location.href = authUrl;
      return;
    }
    // Mobile: capture URL from multiple sources
    let capturedUrl: string | null = null;
    const sub = Linking.addEventListener('url', ({ url }) => { capturedUrl = url; });
    try {
      const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUrl);
      let cb: string | null = null;
      if (result.type === 'success' && (result as any).url) cb = (result as any).url;
      if (!cb && capturedUrl) cb = capturedUrl;
      if (!cb) cb = await Linking.getInitialURL();
      const sid = extractSessionId(cb);
      if (sid) await exchangeSessionId(sid);
    } finally {
      sub.remove();
    }
  }, [exchangeSessionId]);

  const logout = useCallback(async () => {
    try { await api.post('/auth/logout', {}); } catch {}
    await setToken(null);
    setUser(null);
  }, []);

  return (
    <AuthCtx.Provider value={{ user, loading, login, register, loginWithGoogle, logout, refresh }}>
      {children}
    </AuthCtx.Provider>
  );
}
