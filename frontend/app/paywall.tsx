import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator, ScrollView, Modal } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSubscription } from '@/src/lib/revenuecat';
import { useToast } from '@/src/context/ToastContext';
import { useI18n } from '@/src/i18n';
import { colors, spacing, radius, IMAGES } from '@/src/theme';

export default function Paywall() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const { t } = useI18n();
  const { offerings, isSubscribed, identityReady, purchase, restore, isPurchasing, isRestoring, isLoading } = useSubscription();

  const [confirmVisible, setConfirmVisible] = useState(false);

  const currentOffering = offerings?.current;
  const monthly =
    currentOffering?.availablePackages?.find((p: any) => p.identifier === '$rc_monthly') ||
    currentOffering?.availablePackages?.[0];
  const priceString = monthly?.product?.priceString;

  const doPurchase = async () => {
    setConfirmVisible(false);
    if (!monthly) return;
    try {
      await purchase(monthly);
    } catch (e: any) {
      if (e?.userCancelled) return;
      toast.show(t('premium.purchaseFailed'), 'error');
    }
  };

  const doRestore = async () => {
    try {
      await restore();
      toast.show(t('premium.restored'), 'success');
    } catch {
      toast.show(t('premium.purchaseFailed'), 'error');
    }
  };

  return (
    <View style={styles.root} testID="paywall-screen">
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingTop: insets.top + spacing.lg, paddingBottom: insets.bottom + 40 }}>
        <Pressable testID="paywall-close" onPress={() => router.back()} style={styles.close} hitSlop={12}>
          <Ionicons name="close" size={26} color={colors.onSurface} />
        </Pressable>

        <Image source={IMAGES.logo} style={styles.logo} contentFit="contain" />
        <Text style={styles.title}>{t('premium.title')}</Text>
        <Text style={styles.subtitle}>{t('premium.subtitle')}</Text>

        <View style={styles.benefits}>
          {['premium.benefit1', 'premium.benefit2', 'premium.benefit3'].map((k) => (
            <View key={k} style={styles.benefitRow}>
              <Ionicons name="checkmark-circle" size={20} color={colors.success} />
              <Text style={styles.benefitText}>{t(k)}</Text>
            </View>
          ))}
        </View>

        {isSubscribed ? (
          <View style={styles.activeBox} testID="paywall-active">
            <Ionicons name="sparkles" size={18} color={colors.brand} />
            <Text style={styles.activeText}>{t('premium.active')}</Text>
          </View>
        ) : isLoading ? (
          <ActivityIndicator color={colors.brand} style={{ marginTop: spacing.xl }} />
        ) : !monthly ? (
          <Text style={styles.unavailable} testID="paywall-unavailable">{t('premium.unavailable')}</Text>
        ) : (
          <>
            <View style={styles.planCard}>
              <View>
                <Text style={styles.planName}>{t('premium.monthly')}</Text>
                <Text style={styles.freeNote}>{t('premium.freeNote')}</Text>
              </View>
              <Text style={styles.price}>{priceString}{t('premium.perMonth')}</Text>
            </View>

            <Pressable
              testID="paywall-buy"
              onPress={() => setConfirmVisible(true)}
              disabled={isPurchasing || !identityReady}
              style={[styles.cta, (isPurchasing || !identityReady) && { opacity: 0.6 }]}
            >
              {isPurchasing ? <ActivityIndicator color={colors.onBrand} /> : <Text style={styles.ctaText}>{t('premium.cta')}</Text>}
            </Pressable>
            <Text style={styles.simulated}>{t('premium.simulated')}</Text>

            <Pressable testID="paywall-restore" onPress={doRestore} disabled={isRestoring} style={styles.restore}>
              <Text style={styles.restoreText}>{t('premium.restore')}</Text>
            </Pressable>
          </>
        )}
      </ScrollView>

      <Modal transparent visible={confirmVisible} animationType="fade" onRequestClose={() => setConfirmVisible(false)}>
        <View style={styles.modalWrap}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{t('premium.title')}</Text>
            <Text style={styles.modalPrice}>{priceString}{t('premium.perMonth')}</Text>
            <View style={styles.modalBtns}>
              <Pressable testID="paywall-confirm-cancel" onPress={() => setConfirmVisible(false)} style={[styles.modalBtn, { borderColor: colors.border, borderWidth: 1 }]}>
                <Text style={styles.modalBtnText}>{t('common.cancel')}</Text>
              </Pressable>
              <Pressable testID="paywall-confirm-buy" onPress={doPurchase} style={[styles.modalBtn, { backgroundColor: colors.brand }]}>
                <Text style={[styles.modalBtnText, { color: colors.onBrand }]}>{t('premium.cta')}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  close: { alignSelf: 'flex-end' },
  logo: { width: 96, height: 96, alignSelf: 'center', marginTop: spacing.sm },
  title: { color: colors.onSurface, fontSize: 24, fontWeight: '800', textAlign: 'center', marginTop: spacing.md },
  subtitle: { color: colors.onSurfaceSecondary, fontSize: 15, textAlign: 'center', marginTop: spacing.xs },
  benefits: { gap: spacing.md, marginTop: spacing.xl },
  benefitRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  benefitText: { color: colors.onSurface, fontSize: 15, flex: 1 },
  activeBox: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.brand, padding: spacing.lg, marginTop: spacing.xl },
  activeText: { color: colors.onSurface, fontSize: 15, fontWeight: '600', flex: 1 },
  unavailable: { color: colors.onSurfaceSecondary, fontSize: 14, textAlign: 'center', marginTop: spacing.xl, lineHeight: 20 },
  planCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.brand, padding: spacing.lg, marginTop: spacing.xl },
  planName: { color: colors.onSurface, fontSize: 16, fontWeight: '700' },
  freeNote: { color: colors.onSurfaceTertiary, fontSize: 12, marginTop: 4 },
  price: { color: colors.brand, fontSize: 20, fontWeight: '800' },
  cta: { backgroundColor: colors.brand, borderRadius: radius.md, paddingVertical: 16, alignItems: 'center', marginTop: spacing.lg },
  ctaText: { color: colors.onBrand, fontSize: 16, fontWeight: '700' },
  simulated: { color: colors.onSurfaceTertiary, fontSize: 11, textAlign: 'center', marginTop: spacing.sm },
  restore: { alignItems: 'center', marginTop: spacing.lg },
  restoreText: { color: colors.onSurfaceSecondary, fontSize: 13, fontWeight: '600' },
  modalWrap: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: spacing.xl },
  modalCard: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, padding: spacing.xl, gap: spacing.md },
  modalTitle: { color: colors.onSurface, fontSize: 18, fontWeight: '700', textAlign: 'center' },
  modalPrice: { color: colors.brand, fontSize: 22, fontWeight: '800', textAlign: 'center' },
  modalBtns: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.sm },
  modalBtn: { flex: 1, borderRadius: radius.md, paddingVertical: 13, alignItems: 'center' },
  modalBtnText: { color: colors.onSurface, fontSize: 14, fontWeight: '700' },
});
