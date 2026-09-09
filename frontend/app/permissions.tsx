import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, Linking } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useT } from '@/src/i18n';
import { markPermPrimed } from '@/src/lib/appFlags';
import { colors, spacing, radius } from '@/src/theme';

export default function Permissions() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const t = useT();
  const [status, setStatus] = useState<'undetermined' | 'granted' | 'blocked'>('undetermined');
  const [busy, setBusy] = useState(false);

  const finish = async () => {
    await markPermPrimed();
    router.replace('/(tabs)');
  };

  const requestPhotos = async () => {
    setBusy(true);
    try {
      const res = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (res.granted) {
        setStatus('granted');
      } else if (!res.canAskAgain) {
        setStatus('blocked');
      } else {
        // denied but can ask again — keep as undetermined so user can retry
        setStatus('undetermined');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top + spacing.xl }]} testID="permissions-screen">
      <View style={styles.iconWrap}>
        <Ionicons name="images-outline" size={40} color={colors.brand} />
      </View>
      <Text style={styles.title}>{t('permissions.title')}</Text>
      <Text style={styles.subtitle}>{t('permissions.subtitle')}</Text>

      <View style={styles.card}>
        <View style={styles.rowTop}>
          <Ionicons name="image-outline" size={22} color={colors.brand} />
          <View style={{ flex: 1 }}>
            <Text style={styles.rowTitle}>{t('permissions.photosTitle')}</Text>
            <Text style={styles.rowDesc}>{t('permissions.photosDesc')}</Text>
          </View>
          {status === 'granted' ? <Ionicons name="checkmark-circle" size={22} color={colors.success} /> : null}
        </View>

        {status === 'blocked' ? (
          <Text style={styles.blocked}>{t('permissions.blocked')}</Text>
        ) : null}
      </View>

      <View style={{ flex: 1 }} />

      {status === 'granted' ? (
        <Pressable testID="permissions-continue" onPress={finish} style={styles.primary}>
          <Text style={styles.primaryText}>{t('permissions.continue')}</Text>
        </Pressable>
      ) : status === 'blocked' ? (
        <Pressable testID="permissions-open-settings" onPress={() => Linking.openSettings()} style={styles.primary}>
          <Ionicons name="settings-outline" size={18} color={colors.onBrand} />
          <Text style={styles.primaryText}>{t('permissions.openSettings')}</Text>
        </Pressable>
      ) : (
        <Pressable testID="permissions-allow" onPress={requestPhotos} disabled={busy} style={styles.primary}>
          <Ionicons name="image" size={18} color={colors.onBrand} />
          <Text style={styles.primaryText}>{t('permissions.allow')}</Text>
        </Pressable>
      )}

      <Pressable testID="permissions-later" onPress={finish} style={styles.later}>
        <Text style={styles.laterText}>{status === 'granted' ? t('permissions.continue') : t('permissions.later')}</Text>
      </Pressable>
      <View style={{ height: insets.bottom + spacing.md }} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface, paddingHorizontal: spacing.xl },
  iconWrap: { width: 76, height: 76, borderRadius: 38, backgroundColor: colors.brandTertiary, alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginBottom: spacing.lg },
  title: { color: colors.onSurface, fontSize: 26, fontWeight: '800', textAlign: 'center' },
  subtitle: { color: colors.onSurfaceSecondary, fontSize: 14, lineHeight: 20, textAlign: 'center', marginTop: spacing.sm, marginBottom: spacing.xl },
  card: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md },
  rowTop: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  rowTitle: { color: colors.onSurface, fontSize: 15, fontWeight: '700' },
  rowDesc: { color: colors.onSurfaceSecondary, fontSize: 13, lineHeight: 18, marginTop: 2 },
  blocked: { color: colors.warning, fontSize: 12, lineHeight: 17, marginTop: spacing.md },
  primary: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.brand, paddingVertical: 15, borderRadius: radius.md },
  primaryText: { color: colors.onBrand, fontWeight: '800', fontSize: 15 },
  later: { alignItems: 'center', paddingVertical: spacing.md, marginTop: spacing.xs },
  laterText: { color: colors.onSurfaceTertiary, fontSize: 14, fontWeight: '600' },
});
