import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TextInput, Pressable, ScrollView, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api, Discovery } from '@/src/api/client';
import { useToast } from '@/src/context/ToastContext';
import { useT } from '@/src/i18n';
import { colors, spacing, radius, IMAGES } from '@/src/theme';

type Mode = 'url' | 'text' | 'screenshot';

const MODES: { key: Mode; labelKey: string; icon: any }[] = [
  { key: 'url', labelKey: 'add.modeUrl', icon: 'link-outline' },
  { key: 'text', labelKey: 'add.modeText', icon: 'create-outline' },
  { key: 'screenshot', labelKey: 'add.modeScreenshot', icon: 'image-outline' },
];

export default function AddDiscovery() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const t = useT();
  const params = useLocalSearchParams<{ shared_url?: string; autostart?: string }>();
  const [mode, setMode] = useState<Mode>('url');
  const [url, setUrl] = useState('');
  const [text, setText] = useState('');
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [result, setResult] = useState<Discovery | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [saved, setSaved] = useState<Set<string>>(new Set());
  const [picked, setPicked] = useState<Record<number, number>>({});

  const pickImage = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { setErr(t('add.errPerm')); return; }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      base64: true,
      quality: 0.7,
    });
    if (!res.canceled && res.assets[0]) {
      setImageBase64(res.assets[0].base64 || null);
      setImagePreview(res.assets[0].uri);
    }
  };

  const runAnalysis = async (payload: any) => {
    setBusy(true); setErr('');
    try {
      const res = await api.post<Discovery>('/discoveries', payload);
      setResult(res);
      const n = res.saved_count ?? res.detections.filter((d) => d.saved).length;
      if (n > 0) {
        const names = res.detections.filter((d) => d.saved).map((d) => d.title).slice(0, 2).join(', ');
        const more = n > 2 ? t('add.moreCount', { n: n - 2 }) : '';
        toast.show(t('add.savedToast', { names, more }), 'success');
      } else {
        toast.show(t('add.noMatchToast'), 'info');
      }
    } catch (e: any) {
      setErr(e?.detail || t('add.errFail'));
      toast.show(t('add.failToast'), 'error');
    } finally {
      setBusy(false);
    }
  };

  const submit = async () => {
    setErr('');
    let body: any = { kind: mode };
    if (mode === 'url') {
      if (!url.trim()) { setErr(t('add.errPasteUrl')); return; }
      body.url = url.trim();
    } else if (mode === 'text') {
      if (!text.trim()) { setErr(t('add.errEnterText')); return; }
      body.text = text.trim();
    } else {
      if (!imageBase64) { setErr(t('add.errPickShot')); return; }
      body.image_base64 = imageBase64;
      body.image_mime = 'image/jpeg';
    }
    await runAnalysis(body);
  };

  // Auto-start when arriving from a share action (deep link)
  useEffect(() => {
    if (params.shared_url && !result && !busy) {
      setMode('url');
      setUrl(String(params.shared_url));
      if (params.autostart === '1') {
        runAnalysis({ kind: 'url', url: String(params.shared_url) });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.shared_url]);

  const saveDetection = async (cand: { tmdb_id?: number; media_type: 'movie' | 'tv'; title: string }, groupKey: string) => {
    if (!cand.tmdb_id) return;
    setSaving(groupKey);
    try {
      await api.post('/library', {
        tmdb_id: cand.tmdb_id,
        media_type: cand.media_type,
        title: cand.title,
        discovery_id: result?.discovery_id,
      });
      setSaved(new Set([...saved, groupKey]));
      toast.show(t('add.savedOne', { title: cand.title }), 'success');
    } catch (e) {
      console.warn('save failed', e);
      toast.show(t('add.couldNotSave'), 'error');
    } finally {
      setSaving(null);
    }
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]} testID="add-discovery-screen">
      <View style={styles.head}>
        <Text style={styles.title}>{t('add.title')}</Text>
        <Pressable testID="add-close-button" onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="close" size={26} color={colors.onSurface} />
        </Pressable>
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 40 }}>
          {!result ? (
            <>
              <View style={styles.modeRow}>
                {MODES.map((m) => {
                  const active = m.key === mode;
                  return (
                    <Pressable
                      key={m.key}
                      testID={`add-mode-${m.key}`}
                      onPress={() => setMode(m.key)}
                      style={[styles.modeChip, active && styles.modeChipActive]}
                    >
                      <Ionicons name={m.icon} size={14} color={active ? colors.brand : colors.onSurfaceTertiary} />
                      <Text style={[styles.modeText, active && { color: colors.brand }]}>{t(m.labelKey)}</Text>
                    </Pressable>
                  );
                })}
              </View>

              <View style={styles.inputBox}>
                {mode === 'url' && (
                  <TextInput
                    testID="add-url-input"
                    placeholder={t('add.urlPlaceholder')}
                    placeholderTextColor={colors.onSurfaceTertiary}
                    value={url}
                    onChangeText={setUrl}
                    autoCapitalize="none"
                    keyboardType="url"
                    style={styles.input}
                  />
                )}
                {mode === 'text' && (
                  <TextInput
                    testID="add-text-input"
                    placeholder={t('add.textPlaceholder')}
                    placeholderTextColor={colors.onSurfaceTertiary}
                    value={text}
                    onChangeText={setText}
                    multiline
                    style={[styles.input, { minHeight: 120, textAlignVertical: 'top' }]}
                  />
                )}
                {mode === 'screenshot' && (
                  <Pressable testID="add-pick-image" onPress={pickImage} style={styles.picker}>
                    {imagePreview ? (
                      <Image source={{ uri: imagePreview }} style={styles.previewImg} contentFit="cover" />
                    ) : (
                      <>
                        <Ionicons name="cloud-upload-outline" size={40} color={colors.brand} />
                        <Text style={styles.pickerText}>{t('add.pickImage')}</Text>
                      </>
                    )}
                  </Pressable>
                )}
              </View>

              {err ? <Text style={styles.err} testID="add-error">{err}</Text> : null}

              <Pressable testID="add-submit-button" onPress={submit} disabled={busy} style={({ pressed }) => [styles.submit, pressed && { opacity: 0.85 }, busy && { opacity: 0.7 }]}>
                {busy ? (
                  <>
                    <ActivityIndicator color={colors.onBrand} />
                    <Text style={styles.submitText}>{t('add.analyzing')}</Text>
                  </>
                ) : (
                  <>
                    <Ionicons name="sparkles" size={16} color={colors.onBrand} />
                    <Text style={styles.submitText}>{t('add.analyze')}</Text>
                  </>
                )}
              </Pressable>
            </>
          ) : (
            <View style={{ padding: spacing.lg }}>
              {(result.saved_count ?? result.detections.filter((d) => d.saved).length) > 0 ? (
                <View style={styles.savedBanner} testID="add-saved-banner">
                  <Ionicons name="checkmark-circle" size={18} color={colors.success} />
                  <Text style={styles.savedBannerText}>
                    {t('add.autoSaved', { n: result.saved_count ?? result.detections.filter((d) => d.saved).length })}
                  </Text>
                </View>
              ) : null}

              <Text style={styles.resultTitle}>{t('add.aiSummary')}</Text>
              <Text style={styles.summary}>{result.ai_summary || '—'}</Text>
              {result.caption ? <Text style={styles.caption}>{`“${result.caption}”`}</Text> : null}

              <Text style={[styles.resultTitle, { marginTop: spacing.xl }]}>
                {t('add.detected')} {result.detections.length > 0 ? `(${result.detections.length})` : ''}
              </Text>
              {result.detections.length === 0 ? (
                <Text style={styles.noneDetected}>{t('add.none')}</Text>
              ) : (
                result.detections.map((d, i) => {
                  const candidates = [
                    { title: d.title, media_type: d.media_type, tmdb_id: d.tmdb_id, poster_url: d.poster_url, year: d.year, confidence: d.confidence },
                    ...(d.alternatives || []),
                  ];
                  const sel = picked[i] ?? 0;
                  const chosen = candidates[sel] || candidates[0];
                  const key = `${chosen.tmdb_id}-${chosen.media_type}`;
                  const autoSaved = !!d.saved && sel === 0;
                  const isSaved = autoSaved || saved.has(key);
                  const lowConf = d.confidence < 0.75;
                  const showPicker = candidates.length > 1;
                  return (
                    <Pressable key={i} style={styles.detRow} testID={`detection-${i}`}
                      onPress={() => d.entry_id && router.replace(`/movie/${d.entry_id}`)}>
                      <Image source={{ uri: chosen.poster_url || IMAGES.posterFallback }} style={styles.detPoster} contentFit="cover" />
                      <View style={{ flex: 1, padding: spacing.md }}>
                        <Text style={styles.detTitle}>{chosen.title}</Text>
                        <Text style={styles.detMeta}>{t(`mediaType.${chosen.media_type}`)} {chosen.year ? `· ${chosen.year}` : ''} · {t('add.matchPct', { n: (chosen.confidence * 100).toFixed(0) })}</Text>
                        {lowConf ? (
                          <View style={styles.lowConfBadge}>
                            <Ionicons name="help-circle-outline" size={12} color={colors.warning} />
                            <Text style={styles.lowConfText}>{t('add.lowConf')}</Text>
                          </View>
                        ) : null}
                        {d.reason ? <Text style={styles.detReason} numberOfLines={2}>{d.reason}</Text> : null}

                        {showPicker ? (
                          <View style={styles.candRow}>
                            {candidates.map((c, ci) => (
                              <Pressable
                                key={ci}
                                testID={`detection-${i}-candidate-${ci}`}
                                onPress={() => setPicked({ ...picked, [i]: ci })}
                                style={[styles.candChip, ci === sel && styles.candChipActive]}
                              >
                                <Text style={[styles.candChipText, ci === sel && { color: colors.brand }]} numberOfLines={1}>
                                  {c.title}{c.year ? ` (${c.year})` : ''}
                                </Text>
                              </Pressable>
                            ))}
                          </View>
                        ) : null}

                        {isSaved ? (
                          <View style={[styles.saveBtn, { backgroundColor: colors.success }]}>
                            <Text style={styles.saveBtnText}>{t('add.inLibrary')}</Text>
                          </View>
                        ) : (
                          <Pressable
                            testID={`detection-save-${i}`}
                            onPress={() => saveDetection(chosen, key)}
                            disabled={saving === key}
                            style={styles.saveBtn}
                          >
                            {saving === key ? <ActivityIndicator size="small" color={colors.onBrand} /> :
                              <Text style={styles.saveBtnText}>{t('add.saveInstead')}</Text>}
                          </Pressable>
                        )}
                      </View>
                    </Pressable>
                  );
                })
              )}
              <Pressable testID="add-done-button" onPress={() => router.back()} style={[styles.submit, { marginTop: spacing.xl }]}>
                <Text style={styles.submitText}>{t('add.done')}</Text>
              </Pressable>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  title: { color: colors.onSurface, fontSize: 20, fontWeight: '700' },
  modeRow: { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.lg, marginTop: spacing.md },
  modeChip: { flexDirection: 'row', gap: 6, alignItems: 'center', height: 36, paddingHorizontal: spacing.md, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceSecondary },
  modeChipActive: { borderColor: colors.brand, backgroundColor: colors.brandTertiary },
  modeText: { color: colors.onSurfaceTertiary, fontWeight: '600', fontSize: 12 },
  inputBox: { padding: spacing.lg },
  input: { backgroundColor: colors.surfaceSecondary, color: colors.onSurface, borderRadius: radius.md, padding: spacing.md, fontSize: 14, borderWidth: 1, borderColor: colors.border },
  picker: { minHeight: 160, borderRadius: radius.md, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.borderStrong, backgroundColor: colors.surfaceSecondary, alignItems: 'center', justifyContent: 'center', gap: spacing.sm, overflow: 'hidden' },
  pickerText: { color: colors.onSurfaceTertiary, fontSize: 13 },
  previewImg: { width: '100%', height: 240 },
  err: { color: colors.error, marginHorizontal: spacing.lg, marginBottom: spacing.sm, fontSize: 13 },
  submit: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.brand, marginHorizontal: spacing.lg, paddingVertical: 14, borderRadius: radius.md },
  submitText: { color: colors.onBrand, fontWeight: '700', fontSize: 15 },
  resultTitle: { color: colors.onSurfaceTertiary, fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', marginBottom: spacing.sm },
  savedBanner: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: 'rgba(62,123,90,0.15)', borderColor: colors.success, borderWidth: 1, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.lg },
  savedBannerText: { color: colors.onSurface, fontSize: 13, fontWeight: '600', flexShrink: 1 },
  summary: { color: colors.onSurface, fontSize: 14, lineHeight: 20 },
  caption: { color: colors.onSurfaceSecondary, fontSize: 13, fontStyle: 'italic', marginTop: spacing.md },
  noneDetected: { color: colors.onSurfaceTertiary, fontSize: 13, fontStyle: 'italic' },
  detRow: { flexDirection: 'row', backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, overflow: 'hidden', marginBottom: spacing.md },
  detPoster: { width: 90, height: 135 },
  detTitle: { color: colors.onSurface, fontSize: 15, fontWeight: '700' },
  detMeta: { color: colors.onSurfaceTertiary, fontSize: 11, marginTop: 2 },
  detReason: { color: colors.onSurfaceSecondary, fontSize: 12, marginTop: spacing.sm },
  lowConfBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: spacing.xs },
  lowConfText: { color: colors.warning, fontSize: 11, fontWeight: '600' },
  candRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.sm },
  candChip: { paddingHorizontal: spacing.sm, paddingVertical: 5, borderRadius: radius.sm, backgroundColor: colors.surfaceTertiary, borderWidth: 1, borderColor: colors.border, maxWidth: '100%' },
  candChipActive: { borderColor: colors.brand, backgroundColor: colors.brandTertiary },
  candChipText: { color: colors.onSurfaceSecondary, fontSize: 11, fontWeight: '600' },
  saveBtn: { marginTop: spacing.sm, backgroundColor: colors.brand, paddingVertical: 8, borderRadius: radius.sm, alignItems: 'center' },
  saveBtnText: { color: colors.onBrand, fontWeight: '700', fontSize: 12 },
});
