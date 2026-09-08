import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, TextInput, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api } from '@/src/api/client';
import { useAuth } from '@/src/context/AuthContext';
import { useToast } from '@/src/context/ToastContext';
import { useI18n } from '@/src/i18n';
import { colors, spacing, radius } from '@/src/theme';

export default function Settings() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, logout } = useAuth();
  const toast = useToast();
  const { lang, setLang, t } = useI18n();

  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const [pwBusy, setPwBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [delBusy, setDelBusy] = useState(false);

  const pickLang = async (l: 'tr' | 'en') => {
    await setLang(l);
    toast.show(l === 'tr' ? 'Dil Türkçe olarak ayarlandı' : 'Language set to English', 'success');
  };

  const changePassword = async () => {
    if (!cur || next.length < 6) { toast.show(t('settings.pwEnter'), 'info'); return; }
    setPwBusy(true);
    try {
      await api.post('/auth/change-password', { current_password: cur, new_password: next });
      setCur(''); setNext('');
      toast.show(t('settings.pwUpdated'), 'success');
    } catch (e: any) {
      toast.show(e?.detail || t('settings.pwFail'), 'error');
    } finally { setPwBusy(false); }
  };

  const deleteAccount = async () => {
    setDelBusy(true);
    try {
      await api.del('/auth/account');
      toast.show(t('settings.accDeleted'), 'success');
      await logout();
      router.replace('/(auth)/login');
    } catch (e: any) {
      toast.show(e?.detail || t('settings.accFail'), 'error');
      setDelBusy(false);
    }
  };

  return (
    <View style={styles.root} testID="settings-screen">
      <View style={[styles.head, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable testID="settings-back" onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="chevron-back" size={26} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.title}>{t('settings.title')}</Text>
        <View style={{ width: 26 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + 40, gap: spacing.lg }}>
        {/* Language */}
        <View style={styles.card}>
          <Text style={styles.label}>{t('settings.language')}</Text>
          <View style={styles.langRow}>
            {(['en', 'tr'] as const).map((l) => (
              <Pressable key={l} testID={`settings-lang-${l}`} onPress={() => pickLang(l)} style={[styles.langBtn, lang === l && styles.langBtnActive]}>
                <Text style={[styles.langText, lang === l && { color: colors.brand }]}>{l === 'en' ? 'English' : 'Türkçe'}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Change password */}
        {user?.auth_provider === 'email' ? (
          <View style={styles.card}>
            <Text style={styles.label}>{t('settings.changePassword')}</Text>
            <TextInput testID="settings-current-pw" value={cur} onChangeText={setCur} placeholder={t('settings.currentPw')} placeholderTextColor={colors.onSurfaceTertiary} secureTextEntry style={styles.input} />
            <TextInput testID="settings-new-pw" value={next} onChangeText={setNext} placeholder={t('settings.newPw')} placeholderTextColor={colors.onSurfaceTertiary} secureTextEntry style={styles.input} />
            <Pressable testID="settings-change-pw" onPress={changePassword} disabled={pwBusy} style={styles.primary}>
              {pwBusy ? <ActivityIndicator color={colors.onBrand} /> : <Text style={styles.primaryText}>{t('settings.updatePw')}</Text>}
            </Pressable>
          </View>
        ) : null}

        {/* Legal */}
        <View style={styles.card}>
          <Text style={styles.label}>{t('settings.legal')}</Text>
          <Pressable testID="settings-terms" onPress={() => router.push('/legal/terms')} style={styles.linkRow}>
            <Text style={styles.linkText}>{t('settings.terms')}</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.onSurfaceTertiary} />
          </Pressable>
          <Pressable testID="settings-privacy" onPress={() => router.push('/legal/privacy')} style={styles.linkRow}>
            <Text style={styles.linkText}>{t('settings.privacy')}</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.onSurfaceTertiary} />
          </Pressable>
        </View>

        {/* Danger zone */}
        <View style={[styles.card, { borderColor: colors.error }]}>
          <Text style={[styles.label, { color: colors.error }]}>{t('settings.deleteTitle')}</Text>
          <Text style={styles.dangerHint}>{t('settings.deleteDesc')}</Text>
          {!confirmDelete ? (
            <Pressable testID="settings-delete-account" onPress={() => setConfirmDelete(true)} style={styles.dangerBtn}>
              <Ionicons name="trash-outline" size={16} color={colors.error} />
              <Text style={styles.dangerText}>{t('settings.deleteBtn')}</Text>
            </Pressable>
          ) : (
            <View style={{ gap: spacing.sm }}>
              <Text style={styles.dangerConfirm}>{t('settings.deleteConfirmQ')}</Text>
              <Text style={styles.dangerHint}>{t('settings.deleteWarning')}</Text>
              <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                <Pressable testID="settings-delete-cancel" onPress={() => setConfirmDelete(false)} style={[styles.dangerBtn, { flex: 1, borderColor: colors.border }]}>
                  <Text style={[styles.dangerText, { color: colors.onSurfaceSecondary }]}>{t('common.cancel')}</Text>
                </Pressable>
                <Pressable testID="settings-delete-confirm" onPress={deleteAccount} disabled={delBusy} style={[styles.dangerBtn, { flex: 1, backgroundColor: colors.error, borderColor: colors.error }]}>
                  {delBusy ? <ActivityIndicator size="small" color={colors.onSurface} /> : <Text style={[styles.dangerText, { color: colors.onSurface }]}>{t('settings.deleteConfirm')}</Text>}
                </Pressable>
              </View>
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingBottom: spacing.md, borderBottomColor: colors.border, borderBottomWidth: 0.5 },
  title: { color: colors.onSurface, fontSize: 18, fontWeight: '700' },
  card: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, gap: spacing.sm },
  label: { color: colors.onSurfaceTertiary, fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', marginBottom: spacing.xs },
  langRow: { flexDirection: 'row', gap: spacing.sm },
  langBtn: { flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: radius.sm, backgroundColor: colors.surfaceTertiary, borderWidth: 1, borderColor: colors.border },
  langBtnActive: { borderColor: colors.brand, backgroundColor: colors.brandTertiary },
  langText: { color: colors.onSurfaceSecondary, fontSize: 14, fontWeight: '600' },
  input: { backgroundColor: colors.surfaceTertiary, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.md, paddingVertical: 12, color: colors.onSurface, fontSize: 14 },
  primary: { backgroundColor: colors.brand, borderRadius: radius.sm, paddingVertical: 13, alignItems: 'center', marginTop: spacing.xs },
  primaryText: { color: colors.onBrand, fontWeight: '700', fontSize: 14 },
  linkRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: spacing.sm },
  linkText: { color: colors.onSurface, fontSize: 14 },
  dangerHint: { color: colors.onSurfaceTertiary, fontSize: 12, lineHeight: 17 },
  dangerBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, borderWidth: 1, borderColor: colors.error, borderRadius: radius.sm, paddingVertical: 12, marginTop: spacing.xs },
  dangerText: { color: colors.error, fontWeight: '700', fontSize: 13 },
  dangerConfirm: { color: colors.onSurface, fontSize: 13, fontWeight: '600' },
});
