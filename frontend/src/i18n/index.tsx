import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import * as Localization from 'expo-localization';
import { storage } from '@/src/utils/storage';
import { translations, Lang } from './translations';

const STORAGE_KEY = 'trace_language';

type I18nState = {
  lang: Lang;
  ready: boolean;
  setLang: (l: Lang) => Promise<void>;
  t: (key: string, vars?: Record<string, string | number>) => string;
};

const I18nCtx = createContext<I18nState | null>(null);

export function useI18n() {
  const c = useContext(I18nCtx);
  if (!c) throw new Error('useI18n outside I18nProvider');
  return c;
}

// Convenience: returns just the t() function.
export function useT() {
  return useI18n().t;
}

function resolve(lang: Lang, key: string): string | undefined {
  const parts = key.split('.');
  let node: any = translations[lang];
  for (const p of parts) {
    if (node == null) return undefined;
    node = node[p];
  }
  return typeof node === 'string' ? node : undefined;
}

function deviceDefault(): Lang {
  try {
    const code = Localization.getLocales?.()[0]?.languageCode?.toLowerCase();
    return code === 'tr' ? 'tr' : 'en';
  } catch {
    return 'en';
  }
}

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>('en');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      const stored = await storage.getItem<string>(STORAGE_KEY, '');
      if (stored === 'tr' || stored === 'en') {
        setLangState(stored);
      } else {
        const dflt = deviceDefault();
        setLangState(dflt);
        await storage.setItem(STORAGE_KEY, dflt);
      }
      setReady(true);
    })();
  }, []);

  const setLang = useCallback(async (l: Lang) => {
    setLangState(l);
    await storage.setItem(STORAGE_KEY, l);
  }, []);

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>) => {
      let s = resolve(lang, key) ?? resolve('en', key) ?? key;
      if (vars) {
        for (const [k, v] of Object.entries(vars)) {
          s = s.replace(new RegExp(`{{\\s*${k}\\s*}}`, 'g'), String(v));
        }
      }
      return s;
    },
    [lang],
  );

  return <I18nCtx.Provider value={{ lang, ready, setLang, t }}>{children}</I18nCtx.Provider>;
}
