import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api } from '@/src/api/client';
import { useAuth } from '@/src/context/AuthContext';
import { useToast } from '@/src/context/ToastContext';
import { useI18n } from '@/src/i18n';
import { colors, spacing, radius, IMAGES } from '@/src/theme';

export default function Verify() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, refresh, logout } = useAuth();
  const toast = useToast();
  const { lang, t } = useI18n();
  const [busy, setBusy] = useState<null | 'resend' | 'check'>(null);

  const resend = async () => {
    if (!user?.email) return;
    setBusy('resend');
    try {
      await api.post('/auth/resend-verification', { email: user.email, lang }, false);
      toast.show(t('verify.resent'), 'success');
    } catch {
      toast.show(t('verify.resent'), 'success');
    } finally { setBusy(null); }
  };

  const recheck = async () => {
    setBusy('check');
    try {
      await refresh();
      // AuthGate will redirect into the app if verified; otherwise inform the user.
      const me = await api.get<{ email_verified?: boolean }>('/auth/me');
      if (!me.email_verified) toast.show(t('verify.notYet'), 'info');
    } catch {
      toast.show(t('verify.notYet'), 'info');
    } finally { setBusy(null); }
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top + spacing.xl }]} testID="verify-screen">
      <Image source={IMAGES.logo} style={styles.logo} contentFit="contain" />
      <View style={styles.iconWrap}>
        <Ionicons name="mail-unread-outline" size={40} color={colors.brand} />
      </View>
      <Text style={styles.title}>{t('verify.title')}</Text>
      <Text style={styles.body}>{t('verify.body')}</Text>
      {user?.email ? <Text style={styles.email}>{user.email}</Text> : null}

      <Pressable testID="verify-recheck" onPress={recheck} disabled={busy !== null} style={styles.primary}>
        {busy === 'check' ? <ActivityIndicator color={colors.onBrand} /> : <Text style={styles.primaryText}>{t('verify.recheck')}</Text>}
      </Pressable>
      <Pressable testID="verify-resend" onPress={resend} disabled={busy !== null} style={styles.secondary}>
        {busy === 'resend' ? <ActivityIndicator color={colors.brand} /> : <Text style={styles.secondaryText}>{t('verify.resend')}</Text>}
      </Pressable>

      <Pressable testID="verify-logout" onPress={() => { logout(); router.replace('/(auth)/login'); }} style={styles.logout}>
        <Text style={styles.logoutText}>{t('profile.signOut')}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface, alignItems: 'center', paddingHorizontal: spacing.xl },
  logo: { width: 96, height: 96 },
  iconWrap: { width: 76, height: 76, borderRadius: 38, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.brand, alignItems: 'center', justifyContent: 'center', marginTop: spacing.lg },
  title: { color: colors.onSurface, fontSize: 22, fontWeight: '800', marginTop: spacing.lg, textAlign: 'center' },
  body: { color: colors.onSurfaceSecondary, fontSize: 15, lineHeight: 22, textAlign: 'center', marginTop: spacing.sm },
  email: { color: colors.brand, fontSize: 14, fontWeight: '700', marginTop: spacing.sm },
  primary: { backgroundColor: colors.brand, borderRadius: radius.md, paddingVertical: 15, alignItems: 'center', alignSelf: 'stretch', marginTop: spacing.xl },
  primaryText: { color: colors.onBrand, fontSize: 15, fontWeight: '700' },
  secondary: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingVertical: 15, alignItems: 'center', alignSelf: 'stretch', marginTop: spacing.md },
  secondaryText: { color: colors.brand, fontSize: 15, fontWeight: '700' },
  logout: { marginTop: spacing.xl },
  logoutText: { color: colors.onSurfaceTertiary, fontSize: 13, fontWeight: '600' },
});
