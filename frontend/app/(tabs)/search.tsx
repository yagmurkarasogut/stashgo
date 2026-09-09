import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, Pressable, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useT } from '@/src/i18n';
import { colors, spacing, radius } from '@/src/theme';

const SUGGESTION_KEYS = ['search.s1', 'search.s2', 'search.s3', 'search.s4'];

export default function Search() {
  const router = useRouter();
  const t = useT();
  const insets = useSafeAreaInsets();
  const [q, setQ] = useState('');

  const run = (query?: string) => {
    const query2 = (query ?? q).trim();
    if (!query2) return;
    // Ara uses the SAME general AI intelligence as "Stash Go'ya sor".
    router.push({ pathname: '/ai-discover', params: { q: query2 } });
  };

  return (
    <View style={styles.root} testID="search-screen">
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <View style={[styles.header, { paddingTop: insets.top + spacing.md }]}>
          <Text style={styles.title}>{t('search.title')}</Text>
          <Text style={styles.subtitle}>{t('search.subtitle')}</Text>
        </View>

        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 140 }} keyboardShouldPersistTaps="handled">
          {!ran && (
            <View style={styles.suggestBox}>
              {SUGGESTION_KEYS.map((k) => {
                const s = t(k);
                return (
                  <Pressable key={k} testID={`search-suggest-${k}`} onPress={() => run(s)} style={styles.suggestPill}>
                    <Ionicons name="sparkles" size={12} color={colors.brand} />
                    <Text style={styles.suggestText}>{s}</Text>
                  </Pressable>
                );
              })}
            </View>
          )}

          {loading && (
            <View style={{ padding: spacing.xxl, alignItems: 'center' }}>
              <ActivityIndicator color={colors.brand} />
              <Text style={styles.scanning}>{t('search.scanning')}</Text>
            </View>
          )}
        </ScrollView>

        <View style={[styles.inputBar, { paddingBottom: Math.max(insets.bottom, spacing.md) + 90 }]}>
          <View style={styles.inputWrap}>
            <Ionicons name="sparkles-outline" size={18} color={colors.brand} style={{ marginLeft: spacing.md }} />
            <TextInput
              testID="search-input"
              placeholder={t('search.inputPlaceholder')}
              placeholderTextColor={colors.onSurfaceTertiary}
              value={q}
              onChangeText={setQ}
              onSubmitEditing={() => run()}
              returnKeyType="search"
              style={styles.input}
            />
            <Pressable testID="search-submit" onPress={() => run()} style={styles.sendBtn}>
              <Ionicons name="arrow-up" size={18} color={colors.onBrand} />
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  header: { paddingHorizontal: spacing.lg, paddingBottom: spacing.md },
  title: { color: colors.onSurface, fontSize: 26, fontWeight: '700' },
  subtitle: { color: colors.onSurfaceTertiary, fontSize: 13, marginTop: spacing.xs },
  suggestBox: { paddingHorizontal: spacing.lg, marginTop: spacing.lg, gap: spacing.sm, flexDirection: 'row', flexWrap: 'wrap' },
  suggestPill: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.surfaceSecondary, borderColor: colors.border, borderWidth: 1, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.pill },
  suggestText: { color: colors.onSurfaceSecondary, fontSize: 12 },
  scanning: { color: colors.onSurfaceTertiary, marginTop: spacing.md, fontSize: 13 },
  emptyResults: { alignItems: 'center', padding: spacing.xxl, gap: spacing.md },
  emptyText: { color: colors.onSurfaceTertiary, fontSize: 13 },
  resultCard: { flexDirection: 'row', backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, overflow: 'hidden', borderWidth: 1, borderColor: colors.border },
  resultImg: { width: 80, height: 120 },
  resultBody: { flex: 1, padding: spacing.md, justifyContent: 'center' },
  resultTitle: { color: colors.onSurface, fontSize: 15, fontWeight: '700' },
  resultMeta: { color: colors.onSurfaceTertiary, fontSize: 12, marginTop: 2 },
  reasonPill: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.brandTertiary, paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: radius.sm, marginTop: spacing.sm, alignSelf: 'flex-start', maxWidth: '100%' },
  reasonText: { color: colors.brand, fontSize: 11, flexShrink: 1 },
  inputBar: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: spacing.lg, paddingTop: spacing.md, backgroundColor: colors.surface, borderTopColor: colors.border, borderTopWidth: 0.5 },
  inputWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surfaceSecondary, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border },
  input: { flex: 1, color: colors.onSurface, fontSize: 14, paddingHorizontal: spacing.md, paddingVertical: 12 },
  sendBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center', marginRight: 5 },
});
