import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, TextInput, ScrollView, KeyboardAvoidingView, Platform, ActivityIndicator } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { Link } from 'expo-router';
import { useAuth } from '@/src/context/AuthContext';
import { colors, spacing, radius, IMAGES } from '@/src/theme';

export default function Register() {
  const { register } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const submit = async () => {
    if (!email || !password) { setErr('Email and password required'); return; }
    if (password.length < 6) { setErr('Password must be at least 6 characters'); return; }
    setBusy(true); setErr('');
    try { await register(email.trim(), password, name.trim() || undefined); }
    catch (e: any) { setErr(e?.detail || 'Registration failed'); }
    finally { setBusy(false); }
  };

  return (
    <View style={styles.root} testID="register-screen">
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
            <Text style={styles.tagline}>Start your memory vault.</Text>
          </View>

          <BlurView intensity={40} tint="dark" style={styles.card}>
            <Text style={styles.title}>Create account</Text>
            <TextInput
              testID="register-name-input"
              placeholder="Name (optional)"
              placeholderTextColor={colors.onSurfaceTertiary}
              value={name}
              onChangeText={setName}
              style={styles.input}
            />
            <TextInput
              testID="register-email-input"
              placeholder="Email"
              placeholderTextColor={colors.onSurfaceTertiary}
              autoCapitalize="none"
              keyboardType="email-address"
              value={email}
              onChangeText={setEmail}
              style={styles.input}
            />
            <TextInput
              testID="register-password-input"
              placeholder="Password (min 6 chars)"
              placeholderTextColor={colors.onSurfaceTertiary}
              secureTextEntry
              value={password}
              onChangeText={setPassword}
              style={styles.input}
            />
            {err ? <Text style={styles.err} testID="register-error">{err}</Text> : null}
            <Pressable testID="register-submit-button" onPress={submit} disabled={busy} style={({ pressed }) => [styles.primary, pressed && { opacity: 0.85 }]}>
              {busy ? <ActivityIndicator color={colors.onBrand} /> : <Text style={styles.primaryText}>Create account</Text>}
            </Pressable>
            <Link href="/(auth)/login" asChild>
              <Pressable testID="register-goto-login" style={styles.footerRow}>
                <Text style={styles.footerMuted}>Already have an account?</Text>
                <Text style={styles.footerLink}>Sign in</Text>
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
  card: { borderRadius: radius.lg, overflow: 'hidden', padding: spacing.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: 'rgba(22,25,30,0.7)' },
  title: { color: colors.onSurface, fontSize: 22, fontWeight: '600', marginBottom: spacing.lg },
  input: { backgroundColor: colors.surfaceTertiary, color: colors.onSurface, borderRadius: radius.md, paddingHorizontal: spacing.lg, paddingVertical: 14, fontSize: 15, marginBottom: spacing.md, borderWidth: 1, borderColor: colors.border },
  primary: { backgroundColor: colors.brand, borderRadius: radius.md, paddingVertical: 14, alignItems: 'center', marginTop: spacing.sm },
  primaryText: { color: colors.onBrand, fontSize: 15, fontWeight: '700', letterSpacing: 0.3 },
  err: { color: colors.error, marginBottom: spacing.sm, fontSize: 13 },
  footerRow: { flexDirection: 'row', gap: spacing.xs, justifyContent: 'center', marginTop: spacing.lg },
  footerMuted: { color: colors.onSurfaceTertiary, fontSize: 13 },
  footerLink: { color: colors.brand, fontSize: 13, fontWeight: '600' },
});
