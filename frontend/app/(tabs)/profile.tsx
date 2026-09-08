import React from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useAuth } from '@/src/context/AuthContext';
import { colors, spacing, radius } from '@/src/theme';

export default function Profile() {
  const { user, logout } = useAuth();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  return (
    <View style={styles.root} testID="profile-screen">
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + spacing.lg, paddingBottom: 120 }}>
        <View style={styles.header}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{(user?.name || user?.email || 'U').slice(0, 1).toUpperCase()}</Text>
          </View>
          <Text style={styles.name}>{user?.name || user?.email?.split('@')[0]}</Text>
          <Text style={styles.email}>{user?.email}</Text>
          <View style={styles.providerPill}>
            <Ionicons name={user?.auth_provider === 'google' ? 'logo-google' : 'mail-outline'} size={12} color={colors.brand} />
            <Text style={styles.providerText}>{user?.auth_provider}</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>About</Text>
          <View style={styles.row}><Text style={styles.rowKey}>Version</Text><Text style={styles.rowVal}>0.1.0</Text></View>
          <View style={styles.row}><Text style={styles.rowKey}>Data enrichment</Text><Text style={styles.rowVal}>TMDB (mock)</Text></View>
          <View style={styles.row}><Text style={styles.rowKey}>AI engine</Text><Text style={styles.rowVal}>Gemini 3 Flash</Text></View>
        </View>

        <Pressable testID="profile-settings-button" onPress={() => router.push('/settings')} style={({ pressed }) => [styles.logout, { borderColor: colors.border, marginBottom: spacing.md }, pressed && { opacity: 0.8 }]}>
          <Ionicons name="settings-outline" size={18} color={colors.brand} />
          <Text style={[styles.logoutText, { color: colors.brand }]}>Settings & Privacy</Text>
        </Pressable>

        <Pressable testID="profile-logout-button" onPress={logout} style={({ pressed }) => [styles.logout, pressed && { opacity: 0.8 }]}>
          <Ionicons name="log-out-outline" size={18} color={colors.error} />
          <Text style={styles.logoutText}>Sign out</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  header: { alignItems: 'center', padding: spacing.xl },
  avatar: { width: 84, height: 84, borderRadius: 42, backgroundColor: colors.brandTertiary, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.brand },
  avatarText: { color: colors.brand, fontSize: 32, fontWeight: '700' },
  name: { color: colors.onSurface, fontSize: 20, fontWeight: '700', marginTop: spacing.md },
  email: { color: colors.onSurfaceTertiary, fontSize: 13, marginTop: 2 },
  providerPill: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: colors.brandTertiary, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 4, marginTop: spacing.md },
  providerText: { color: colors.brand, fontSize: 11, textTransform: 'capitalize', fontWeight: '600' },
  section: { marginHorizontal: spacing.lg, marginTop: spacing.lg, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  sectionLabel: { color: colors.onSurfaceTertiary, fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', padding: spacing.md, borderBottomColor: colors.border, borderBottomWidth: 0.5 },
  row: { flexDirection: 'row', justifyContent: 'space-between', padding: spacing.md, borderBottomColor: colors.divider, borderBottomWidth: 0.5 },
  rowKey: { color: colors.onSurfaceSecondary, fontSize: 13 },
  rowVal: { color: colors.onSurface, fontSize: 13, fontWeight: '600' },
  logout: { marginHorizontal: spacing.lg, marginTop: spacing.xl, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, backgroundColor: colors.surfaceSecondary, borderColor: colors.error, borderWidth: 1, borderRadius: radius.md, paddingVertical: spacing.md },
  logoutText: { color: colors.error, fontWeight: '700', fontSize: 14 },
});
