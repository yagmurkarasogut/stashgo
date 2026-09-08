import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, Pressable, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api } from '@/src/api/client';
import { useToast } from '@/src/context/ToastContext';
import { useI18n } from '@/src/i18n';
import { colors, spacing, radius } from '@/src/theme';

export default function Forgot() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const { lang, t } = useI18n();

  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [pass, setPass] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const sendCode = async () => {
    if (!email.trim()) { setErr(t('forgot.errEmail')); return; }
    setBusy(true); setErr('');
    try {
      await api.post('/auth/forgot-password', { email: email.trim().toLowerCase(), lang }, false);
      toast.show(t('forgot.sent'), 'success');
      setStep('code');
    } catch {
      // still advance — endpoint is intentionally non-enumerating
      toast.show(t('forgot.sent'), 'success');
      setStep('code');
    } finally { setBusy(false); }
  };

  const resetPass = async () => {
    if (code.trim().length < 6 || pass.length < 6) { setErr(t('register.errMin')); return; }
    setBusy(true); setErr('');
    try {
      await api.post('/auth/reset-password', { email: email.trim().toLowerCase(), code: code.trim(), new_password: pass }, false);
      toast.show(t('settings.pwUpdated'), 'success');
      router.replace('/(auth)/login');
    } catch (e: any) {
      setErr(e?.detail || t('settings.pwFail'));
    } finally { setBusy(false); }
  };

  return (
    <View style={styles.root} testID="forgot-screen">
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable testID="forgot-back" onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="chevron-back" size={26} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.title}>{t('forgot.title')}</Text>
        <View style={{ width: 26 }} />
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }} keyboardShouldPersistTaps="handled">
          <Text style={styles.subtitle}>{t('forgot.subtitle')}</Text>

          {step === 'email' ? (
            <>
              <TextInput
                testID="forgot-email"
                value={email}
                onChangeText={setEmail}
                placeholder={t('forgot.email')}
                placeholderTextColor={colors.onSurfaceTertiary}
                autoCapitalize="none"
                keyboardType="email-address"
                style={styles.input}
              />
              {err ? <Text style={styles.err}>{err}</Text> : null}
              <Pressable testID="forgot-send" onPress={sendCode} disabled={busy} style={styles.primary}>
                {busy ? <ActivityIndicator color={colors.onBrand} /> : <Text style={styles.primaryText}>{t('forgot.send')}</Text>}
              </Pressable>
            </>
          ) : (
            <>
              <TextInput
                testID="forgot-code"
                value={code}
                onChangeText={setCode}
                placeholder="••••••"
                placeholderTextColor={colors.onSurfaceTertiary}
                keyboardType="number-pad"
                maxLength={6}
                style={[styles.input, { letterSpacing: 6, textAlign: 'center', fontSize: 20 }]}
              />
              <TextInput
                testID="forgot-newpass"
                value={pass}
                onChangeText={setPass}
                placeholder={t('settings.newPw')}
                placeholderTextColor={colors.onSurfaceTertiary}
                secureTextEntry
                style={styles.input}
              />
              {err ? <Text style={styles.err}>{err}</Text> : null}
              <Pressable testID="forgot-reset" onPress={resetPass} disabled={busy} style={styles.primary}>
                {busy ? <ActivityIndicator color={colors.onBrand} /> : <Text style={styles.primaryText}>{t('forgot.send')}</Text>}
              </Pressable>
            </>
          )}

          <Pressable testID="forgot-back-login" onPress={() => router.replace('/(auth)/login')} style={{ alignItems: 'center', marginTop: spacing.md }}>
            <Text style={styles.link}>{t('forgot.backToLogin')}</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingBottom: spacing.md, borderBottomColor: colors.border, borderBottomWidth: 0.5 },
  title: { color: colors.onSurface, fontSize: 18, fontWeight: '700' },
  subtitle: { color: colors.onSurfaceSecondary, fontSize: 14, lineHeight: 20 },
  input: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.md, paddingVertical: 13, color: colors.onSurface, fontSize: 15 },
  primary: { backgroundColor: colors.brand, borderRadius: radius.md, paddingVertical: 15, alignItems: 'center', marginTop: spacing.xs },
  primaryText: { color: colors.onBrand, fontSize: 15, fontWeight: '700' },
  err: { color: colors.error, fontSize: 13 },
  link: { color: colors.brand, fontSize: 13, fontWeight: '600' },
});
