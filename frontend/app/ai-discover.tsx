import React, { useEffect, useRef, useState, useCallback } from 'react';
import { View, Text, StyleSheet, TextInput, Pressable, ActivityIndicator, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api, LibraryEntry } from '@/src/api/client';
import { useToast } from '@/src/context/ToastContext';
import { useT } from '@/src/i18n';
import { colors, spacing, radius, IMAGES } from '@/src/theme';

type Card = {
  tmdb_id: number;
  media_type: 'movie' | 'tv';
  title: string;
  year: number | null;
  poster_url: string | null;
  overview: string;
  tmdb_rating: number | null;
  reason: string;
  saved: boolean;
  entry_id: string | null;
};

const CHIP_KEYS = ['discover.c1', 'discover.c2', 'discover.c3', 'discover.c4', 'discover.c5', 'discover.c6'];

export default function AiDiscover() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const t = useT();
  const { q } = useLocalSearchParams<{ q?: string }>();

  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [ran, setRan] = useState(false);
  const [message, setMessage] = useState('');
  const [results, setResults] = useState<Card[]>([]);
  const [savingId, setSavingId] = useState<number | null>(null);
  const scrollRef = useRef<ScrollView>(null);

  const run = useCallback(async (query: string) => {
    const text = query.trim();
    if (!text || busy) return;
    setBusy(true); setRan(true); setMessage(''); setResults([]);
    try {
      const res = await api.post<{ intent: string; message: string; results: Card[] }>('/ai/discover', { query: text });
      setMessage(res.message || '');
      setResults(res.results || []);
    } catch (e: any) {
      setMessage('');
      if (e?.status === 402) {
        toast.show(t('premium.limitReached'), 'info');
        router.push('/paywall');
      } else {
        toast.show(e?.detail || t('discover.failed'), 'error');
      }
    } finally {
      setBusy(false);
    }
  }, [busy, t, toast, router]);

  useEffect(() => {
    if (q && typeof q === 'string') {
      setInput(q);
      run(q);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const submit = () => {
    if (!input.trim()) return;
    run(input);
  };

  const save = async (c: Card) => {
    if (c.saved) {
      if (c.entry_id) router.push(`/movie/${c.entry_id}`);
      return;
    }
    setSavingId(c.tmdb_id);
    try {
      const entry = await api.post<LibraryEntry>('/library', { tmdb_id: c.tmdb_id, media_type: c.media_type, title: c.title });
      setResults((prev) => prev.map((r) => (r.tmdb_id === c.tmdb_id ? { ...r, saved: true, entry_id: entry.entry_id } : r)));
      toast.show(t('discover.savedToast', { title: c.title }), 'success');
    } catch (e: any) {
      toast.show(e?.detail || t('discover.saveFail'), 'error');
    } finally {
      setSavingId(null);
    }
  };

  return (
    <View style={styles.root} testID="ai-discover-screen">
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable testID="ai-back" onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="chevron-back" size={26} color={colors.onSurface} />
        </Pressable>
        <View style={styles.headerTitleRow}>
          <Ionicons name="sparkles" size={16} color={colors.brand} />
          <Text style={styles.title}>{t('discover.title')}</Text>
        </View>
        <View style={{ width: 26 }} />
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }} keyboardVerticalOffset={insets.top + 44}>
        <ScrollView
          ref={scrollRef}
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: 24, gap: spacing.md }}
          keyboardShouldPersistTaps="handled"
        >
          {!ran ? (
            <>
              <Text style={styles.intro}>{t('discover.intro')}</Text>
              <View style={styles.chips}>
                {CHIP_KEYS.map((k) => (
                  <Pressable key={k} testID={`ai-chip-${k}`} onPress={() => { const v = t(k); setInput(v); run(v); }} style={styles.chip}>
                    <Text style={styles.chipText}>{t(k)}</Text>
                  </Pressable>
                ))}
              </View>
            </>
          ) : null}

          {message ? (
            <View style={styles.bubble}>
              <Ionicons name="sparkles" size={14} color={colors.brand} />
              <Text style={styles.bubbleText}>{message}</Text>
            </View>
          ) : null}

          {busy ? (
            <View style={{ paddingVertical: spacing.xl, alignItems: 'center' }}>
              <ActivityIndicator color={colors.brand} />
              <Text style={styles.thinking}>{t('discover.thinking')}</Text>
            </View>
          ) : null}

          {ran && !busy && results.length === 0 && message === '' ? (
            <Text style={styles.noResults}>{t('discover.noResults')}</Text>
          ) : null}

          {results.map((c) => (
            <View key={`${c.media_type}-${c.tmdb_id}`} style={styles.card} testID={`ai-result-${c.tmdb_id}`}>
              <Image
                source={c.poster_url ? { uri: c.poster_url } : { uri: IMAGES.posterFallback }}
                style={styles.poster}
                contentFit="cover"
                transition={150}
              />
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle} numberOfLines={2}>{c.title}</Text>
                <Text style={styles.cardMeta}>
                  {t(`mediaType.${c.media_type}`)}{c.year ? ` · ${c.year}` : ''}{c.tmdb_rating ? ` · ★ ${c.tmdb_rating.toFixed(1)}` : ''}
                </Text>
                {c.reason ? <Text style={styles.cardReason} numberOfLines={3}>{c.reason}</Text> : null}
                <Pressable
                  testID={`ai-save-${c.tmdb_id}`}
                  onPress={() => save(c)}
                  disabled={savingId === c.tmdb_id}
                  style={[styles.saveBtn, c.saved && styles.savedBtn]}
                >
                  {savingId === c.tmdb_id ? (
                    <ActivityIndicator size="small" color={colors.onBrand} />
                  ) : (
                    <>
                      <Ionicons name={c.saved ? 'checkmark' : 'add'} size={15} color={c.saved ? colors.success : colors.onBrand} />
                      <Text style={[styles.saveText, c.saved && { color: colors.success }]}>{c.saved ? t('discover.saved') : t('discover.save')}</Text>
                    </>
                  )}
                </Pressable>
              </View>
            </View>
          ))}
        </ScrollView>

        <View style={[styles.inputBar, { paddingBottom: insets.bottom + spacing.sm }]}>
          <TextInput
            testID="ai-input"
            value={input}
            onChangeText={setInput}
            placeholder={t('discover.placeholder')}
            placeholderTextColor={colors.onSurfaceTertiary}
            style={styles.input}
            multiline
            onSubmitEditing={submit}
            returnKeyType="send"
          />
          <Pressable testID="ai-send" onPress={submit} disabled={busy || !input.trim()} style={[styles.sendBtn, (!input.trim() || busy) && { opacity: 0.5 }]}>
            <Ionicons name="arrow-up" size={20} color={colors.onBrand} />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingBottom: spacing.md, borderBottomColor: colors.border, borderBottomWidth: 0.5 },
  headerTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  title: { color: colors.onSurface, fontSize: 18, fontWeight: '700' },
  intro: { color: colors.onSurfaceSecondary, fontSize: 14, lineHeight: 21 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.xs },
  chip: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.md, paddingVertical: 9 },
  chipText: { color: colors.onSurface, fontSize: 13, fontWeight: '600' },
  bubble: { flexDirection: 'row', gap: 8, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, alignItems: 'flex-start' },
  bubbleText: { color: colors.onSurface, fontSize: 14, lineHeight: 20, flex: 1 },
  thinking: { color: colors.onSurfaceTertiary, fontSize: 13, marginTop: spacing.sm },
  noResults: { color: colors.onSurfaceSecondary, fontSize: 14, lineHeight: 20 },
  card: { flexDirection: 'row', gap: spacing.md, backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.md },
  poster: { width: 74, height: 111, borderRadius: radius.md, backgroundColor: colors.surfaceTertiary },
  cardTitle: { color: colors.onSurface, fontSize: 15, fontWeight: '700' },
  cardMeta: { color: colors.onSurfaceTertiary, fontSize: 12, marginTop: 2 },
  cardReason: { color: colors.onSurfaceSecondary, fontSize: 13, lineHeight: 18, marginTop: 6 },
  saveBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, alignSelf: 'flex-start', backgroundColor: colors.brand, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 7, marginTop: spacing.sm },
  savedBtn: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.success },
  saveText: { color: colors.onBrand, fontSize: 13, fontWeight: '700' },
  inputBar: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingTop: spacing.sm, borderTopColor: colors.border, borderTopWidth: 0.5, backgroundColor: colors.surface },
  input: { flex: 1, maxHeight: 120, backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.md, paddingTop: 11, paddingBottom: 11, color: colors.onSurface, fontSize: 15 },
  sendBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' },
});
