// Minimal API client for Trace
import { storage } from '@/src/utils/storage';

const RAW_BASE = (process.env.EXPO_PUBLIC_BACKEND_URL || '').replace(/\/+$/, '');

// Known production backend host (used only as a safety net in production builds).
const PROD_BACKEND = 'https://media-vault-api.emergent.host';

// A PRODUCTION build (APK/OTA, __DEV__ === false) must always reach the live
// backend. If the injected value is empty OR still points at the preview host
// (env-rewrite didn't apply in the build), fall back to the known prod host.
// In DEV/preview we always honour the injected preview URL, so preview is untouched.
const BASE = __DEV__
  ? RAW_BASE
  : (!RAW_BASE || RAW_BASE.includes('.preview.emergentagent.com'))
    ? PROD_BACKEND
    : RAW_BASE;

let inMemoryToken: string | null = null;

const TOKEN_KEY = 'loom_session_token';

export async function getToken(): Promise<string | null> {
  if (inMemoryToken) return inMemoryToken;
  const t = await storage.secureGet<string>(TOKEN_KEY, '');
  inMemoryToken = t && t.length > 0 ? t : null;
  return inMemoryToken;
}

export async function setToken(token: string | null) {
  inMemoryToken = token;
  if (token) await storage.secureSet(TOKEN_KEY, token);
  else await storage.secureRemove(TOKEN_KEY);
}

export type ApiError = { status: number; detail: string };

async function request<T>(path: string, opts: RequestInit = {}, auth = true): Promise<T> {
  if (!BASE) {
    throw { status: 0, detail: 'Server URL is not configured (EXPO_PUBLIC_BACKEND_URL missing in build).' } as ApiError;
  }
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(opts.headers as Record<string, string> | undefined),
  };
  if (auth) {
    const t = await getToken();
    if (t) headers['Authorization'] = `Bearer ${t}`;
  }

  let res: Response;
  try {
    res = await fetch(`${BASE}/api${path}`, { ...opts, headers });
  } catch {
    // Network / DNS / TLS failure — the request never reached the backend
    throw { status: 0, detail: `Cannot reach server. Check your connection. (${BASE})` } as ApiError;
  }

  const text = await res.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) {
    let detail: any = (data && data.detail) || res.statusText || `Request failed (${res.status})`;
    if (Array.isArray(detail)) {
      // FastAPI/Pydantic 422 validation errors come as a list
      detail = detail.map((d: any) => d?.msg || (typeof d === 'string' ? d : JSON.stringify(d))).join('; ');
    } else if (typeof detail !== 'string') {
      detail = JSON.stringify(detail);
    }
    const err: ApiError = { status: res.status, detail: String(detail) };
    throw err;
  }
  return data as T;
}

export const api = {
  get: <T>(p: string, auth = true) => request<T>(p, { method: 'GET' }, auth),
  post: <T>(p: string, body?: any, auth = true) =>
    request<T>(p, { method: 'POST', body: body ? JSON.stringify(body) : undefined }, auth),
  patch: <T>(p: string, body?: any, auth = true) =>
    request<T>(p, { method: 'PATCH', body: body ? JSON.stringify(body) : undefined }, auth),
  del: <T>(p: string, auth = true) => request<T>(p, { method: 'DELETE' }, auth),
};

// Types
export type User = {
  user_id: string;
  email: string;
  name?: string;
  picture?: string;
  auth_provider: string;
  created_at: string;
};

export type AltCandidate = {
  title: string;
  media_type: 'movie' | 'tv';
  confidence: number;
  tmdb_id?: number;
  poster_url?: string;
  year?: number;
};

export type Detection = {
  title: string;
  media_type: 'movie' | 'tv';
  confidence: number;
  reason?: string;
  tmdb_id?: number;
  poster_url?: string;
  year?: number;
  saved?: boolean;
  entry_id?: string;
  alternatives?: AltCandidate[];
};

export type Discovery = {
  discovery_id: string;
  user_id: string;
  kind: string;
  source_platform: string;
  source_url?: string;
  caption: string;
  extracted_text: string;
  ai_summary: string;
  detections: Detection[];
  saved_count?: number;
  created_at: string;
};

export type LibraryEntry = {
  entry_id: string;
  user_id: string;
  tmdb_id: number;
  media_type: 'movie' | 'tv';
  title: string;
  year?: number;
  overview: string;
  director?: string;
  cast: string[];
  genres: string[];
  poster_url?: string;
  backdrop_url?: string;
  runtime?: number;
  tmdb_rating?: number;
  trailer_key?: string;
  watch_providers?: { name: string; logo_url?: string; type: string }[];
  watch_status: 'want_to_watch' | 'watching' | 'watched';
  user_rating?: number;
  user_note: string;
  discovery_id?: string;
  created_at: string;
  updated_at: string;
};

export type CustomList = {
  collection_id: string;
  name: string;
  description?: string;
  entry_ids?: string[];
  item_count: number;
  cover_posters: string[];
  created_at?: string;
  entries?: LibraryEntry[];
};
