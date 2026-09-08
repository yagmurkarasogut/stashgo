import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, spacing, radius } from '@/src/theme';
import { useT } from '@/src/i18n';

type Slide = {
  key: string;
  icon: keyof typeof Ionicons.glyphMap;
  chips?: { icon: keyof typeof Ionicons.glyphMap; labelKey: string }[];
  titleKey: string;
  bodyKey: string;
};

const SLIDES: Slide[] = [
  {
    key: 'welcome',
    icon: 'sparkles',
    titleKey: 'onboarding.s1title',
    bodyKey: 'onboarding.s1body',
  },
  {
    key: 'share',
    icon: 'share-social',
    chips: [
      { icon: 'logo-instagram', labelKey: 'onboarding.chips.reels' },
      { icon: 'arrow-forward', labelKey: 'onboarding.chips.share' },
      { icon: 'sparkles', labelKey: 'onboarding.chips.trace' },
    ],
    titleKey: 'onboarding.s2title',
    bodyKey: 'onboarding.s2body',
  },
  {
    key: 'sources',
    icon: 'layers',
    chips: [
      { icon: 'logo-youtube', labelKey: 'onboarding.chips.youtube' },
      { icon: 'image', labelKey: 'onboarding.chips.screenshot' },
      { icon: 'create', labelKey: 'onboarding.chips.type' },
    ],
    titleKey: 'onboarding.s3title',
    bodyKey: 'onboarding.s3body',
  },
  {
    key: 'ai',
    icon: 'film',
    titleKey: 'onboarding.s4title',
    bodyKey: 'onboarding.s4body',
  },
  {
    key: 'lists',
    icon: 'albums',
    titleKey: 'onboarding.s5title',
    bodyKey: 'onboarding.s5body',
  },
];

export default function Onboarding() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const t = useT();
  const [index, setIndex] = useState(0);

  const goRegister = () => router.replace('/(auth)/register');
  const next = () => {
    if (index >= SLIDES.length - 1) return goRegister();
    setIndex(index + 1);
  };

  const isLast = index === SLIDES.length - 1;
  const item = SLIDES[index];

  return (
    <View style={styles.root} testID="onboarding-screen">
      <LinearGradient colors={['#12100B', '#0B0D10', '#0B0D10']} style={StyleSheet.absoluteFillObject} />

      <View style={[styles.top, { paddingTop: insets.top + spacing.sm }]}>
        <Text style={styles.brand}>TRACE</Text>
        <Pressable testID="onboarding-skip" onPress={goRegister} hitSlop={12}>
          <Text style={styles.skip}>{t('onboarding.skip')}</Text>
        </Pressable>
      </View>

      <View style={styles.slide} testID={`onboarding-slide-${item.key}`}>
        <View style={styles.iconHalo}>
          <LinearGradient colors={[colors.brand, colors.brandSecondary]} style={styles.iconCircle}>
            <Ionicons name={item.icon} size={52} color={colors.onBrand} />
          </LinearGradient>
        </View>

        {item.chips ? (
          <View style={styles.chipsFlow}>
            {item.chips.map((c, i) => (
              <React.Fragment key={c.labelKey}>
                {i > 0 ? <Ionicons name="chevron-forward" size={14} color={colors.onSurfaceTertiary} /> : null}
                <View style={styles.chip}>
                  <Ionicons name={c.icon} size={15} color={colors.brand} />
                  <Text style={styles.chipText}>{t(c.labelKey)}</Text>
                </View>
              </React.Fragment>
            ))}
          </View>
        ) : null}

        <Text style={styles.title}>{t(item.titleKey)}</Text>
        <Text style={styles.body}>{t(item.bodyKey)}</Text>
      </View>

      <View style={[styles.bottom, { paddingBottom: insets.bottom + spacing.lg }]}>
        <View style={styles.dots}>
          {SLIDES.map((_, i) => (
            <Pressable key={i} testID={`onboarding-dot-${i}`} onPress={() => setIndex(i)} hitSlop={8}>
              <View style={[styles.dot, i === index && styles.dotActive]} />
            </Pressable>
          ))}
        </View>
        <Pressable testID="onboarding-next" onPress={next} style={({ pressed }) => [styles.cta, pressed && { opacity: 0.85 }]}>
          <Text style={styles.ctaText}>{isLast ? t('onboarding.getStarted') : t('onboarding.next')}</Text>
          <Ionicons name={isLast ? 'arrow-forward-circle' : 'arrow-forward'} size={18} color={colors.onBrand} />
        </Pressable>
        <Pressable testID="onboarding-goto-login" onPress={() => router.replace('/(auth)/login')} style={styles.loginRow}>
          <Text style={styles.loginMuted}>{t('onboarding.alreadyHave')}</Text>
          <Text style={styles.loginLink}>{t('onboarding.signIn')}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  brand: { color: colors.brand, fontSize: 20, fontWeight: '800', letterSpacing: 5 },
  skip: { color: colors.onSurfaceSecondary, fontSize: 14, fontWeight: '600' },
  slide: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.xl },
  iconHalo: { marginBottom: spacing.xl, alignItems: 'center', justifyContent: 'center' },
  iconCircle: {
    width: 120, height: 120, borderRadius: 60, alignItems: 'center', justifyContent: 'center',
    shadowColor: colors.brand, shadowOpacity: 0.4, shadowRadius: 24, shadowOffset: { width: 0, height: 8 }, elevation: 10,
  },
  chipsFlow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.xl, flexWrap: 'wrap', justifyContent: 'center' },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.surfaceSecondary, borderColor: colors.border, borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  chipText: { color: colors.onSurface, fontSize: 13, fontWeight: '600' },
  title: { color: colors.onSurface, fontSize: 26, fontWeight: '800', textAlign: 'center', marginBottom: spacing.md, lineHeight: 32 },
  body: { color: colors.onSurfaceSecondary, fontSize: 15, textAlign: 'center', lineHeight: 22, paddingHorizontal: spacing.sm },
  bottom: { paddingHorizontal: spacing.lg, gap: spacing.lg },
  dots: { flexDirection: 'row', gap: spacing.sm, justifyContent: 'center' },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.borderStrong },
  dotActive: { backgroundColor: colors.brand, width: 22 },
  cta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, backgroundColor: colors.brand, borderRadius: radius.md, paddingVertical: 16 },
  ctaText: { color: colors.onBrand, fontSize: 16, fontWeight: '700', letterSpacing: 0.3 },
  loginRow: { flexDirection: 'row', gap: spacing.xs, justifyContent: 'center' },
  loginMuted: { color: colors.onSurfaceTertiary, fontSize: 13 },
  loginLink: { color: colors.brand, fontSize: 13, fontWeight: '600' },
});
