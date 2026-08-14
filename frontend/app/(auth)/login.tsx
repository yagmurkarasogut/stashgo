import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, TextInput, ScrollView, KeyboardAvoidingView, Platform, ActivityIndicator } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { useRouter, Link } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/src/context/AuthContext';
import { colors, spacing, radius, IMAGES } from '@/src/theme';

export default function Login() {
  const { login, loginWithGoogle } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState<null | 'email' | 'google'>(null);
  const [err, setErr] = useState('');

  const doEmail = async () => {
    if (!email || !password) { setErr('Enter email and password'); return; }
    setBusy('email'); setErr('');
    try { await login(email.trim(), password); }
    catch (e: any) { setErr(e?.detail || 'Login failed'); }
    finally { setBusy(null); }
  };

  const doGoogle = async () => {
    setBusy('google'); setErr('');
    try { await loginWithGoogle(); }
    catch (e: any) { setErr(e?.detail || 'Google sign-in failed'); }
    finally { setBusy(null); }
  };

  return (
    <View style={styles.root} testID="login-screen">
      <Image source={{ uri: IMAGES.authHero }} style={StyleSheet.absoluteFillObject} contentFit="cover" />
      <LinearGradient
        colors={['rgba(11,13,16,0.3)', 'rgba(11,13,16,0.75)', '#0B0D10']}
        style={StyleSheet.absoluteFillObject}
        locations={[0, 0.5, 1]}
      />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.header}>
            <Text style={styles.brandMark}>TRACE</Text>
            <Text style={styles.tagline}>Your personal movie & TV memory.</Text>
          </View>

          <BlurView intensity={40} tint="dark" style={styles.card}>
            <Text style={styles.title}>Sign in</Text>

            <TextInput
              testID="login-email-input"
              placeholder="Email"
              placeholderTextColor={colors.onSurfaceTertiary}
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              value={email}
              onChangeText={setEmail}
              style={styles.input}
            />
            <TextInput
              testID="login-password-input"
              placeholder="Password"
              placeholderTextColor={colors.onSurfaceTertiary}
              secureTextEntry
              value={password}
              onChangeText={setPassword}
              style={styles.input}
            />

            {err ? <Text style={styles.err} testID="login-error">{err}</Text> : null}

            <Pressable testID="login-submit-button" onPress={doEmail} disabled={busy !== null} style={({ pressed }) => [styles.primary, pressed && { opacity: 0.85 }]}>
              {busy === 'email' ? <ActivityIndicator color={colors.onBrand} /> : <Text style={styles.primaryText}>Continue</Text>}
            </Pressable>

            <View style={styles.divider}>
              <View style={styles.hr} /><Text style={styles.dividerText}>or</Text><View style={styles.hr} />
            </View>

            <Pressable testID="login-google-button" onPress={doGoogle} disabled={busy !== null} style={({ pressed }) => [styles.google, pressed && { opacity: 0.85 }]}>
              <Ionicons name="logo-google" size={18} color={colors.onSurface} />
              <Text style={styles.googleText}>{busy === 'google' ? 'Opening…' : 'Continue with Google'}</Text>
            </Pressable>

            <Link href="/(auth)/onboarding" asChild>
              <Pressable testID="login-goto-register" style={styles.footerRow}>
                <Text style={styles.footerMuted}>New to Trace?</Text>
                <Text style={styles.footerLink}>Create account</Text>
              </Pressable>
            </Link>
          </BlurView>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  scroll: { flexGrow: 1, justifyContent: 'flex-end', padding: spacing.lg, paddingBottom: spacing.xl },
  header: { alignItems: 'center', marginBottom: spacing.xl },
  brandMark: { color: colors.brand, fontSize: 42, letterSpacing: 8, fontWeight: '700' },
  tagline: { color: colors.onSurfaceSecondary, marginTop: spacing.sm, fontSize: 14 },
  card: {
    borderRadius: radius.lg,
    overflow: 'hidden',
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: 'rgba(22,25,30,0.7)',
  },
  title: { color: colors.onSurface, fontSize: 22, fontWeight: '600', marginBottom: spacing.lg },
  input: {
    backgroundColor: colors.surfaceTertiary,
    color: colors.onSurface,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: 14,
    fontSize: 15,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  primary: {
    backgroundColor: colors.brand,
    borderRadius: radius.md,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  primaryText: { color: colors.onBrand, fontSize: 15, fontWeight: '700', letterSpacing: 0.3 },
  divider: { flexDirection: 'row', alignItems: 'center', marginVertical: spacing.lg },
  hr: { flex: 1, height: 1, backgroundColor: colors.border },
  dividerText: { color: colors.onSurfaceTertiary, marginHorizontal: spacing.md, fontSize: 12 },
  google: {
    flexDirection: 'row', gap: spacing.md, alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.surfaceTertiary, borderRadius: radius.md, paddingVertical: 13,
    borderWidth: 1, borderColor: colors.border,
  },
  googleText: { color: colors.onSurface, fontSize: 15, fontWeight: '600' },
  err: { color: colors.error, marginBottom: spacing.sm, fontSize: 13 },
  footerRow: { flexDirection: 'row', gap: spacing.xs, justifyContent: 'center', marginTop: spacing.lg },
  footerMuted: { color: colors.onSurfaceTertiary, fontSize: 13 },
  footerLink: { color: colors.brand, fontSize: 13, fontWeight: '600' },
});
