import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, spacing, radius } from '@/src/theme';

type Slide = {
  key: string;
  icon: keyof typeof Ionicons.glyphMap;
  chips?: { icon: keyof typeof Ionicons.glyphMap; label: string }[];
  title: string;
  body: string;
};

const SLIDES: Slide[] = [
  {
    key: 'welcome',
    icon: 'sparkles',
    title: 'Welcome to Trace',
    body: 'Every movie and show you stumble across — captured into one searchable library. Here’s how it works.',
  },
  {
    key: 'share',
    icon: 'share-social',
    chips: [
      { icon: 'logo-instagram', label: 'Reels' },
      { icon: 'arrow-forward', label: 'Share' },
      { icon: 'sparkles', label: 'Trace' },
    ],
    title: 'Share it straight from Instagram',
    body: 'On any Reel, tap Share → choose Trace. It analyzes the post and saves the movie to your library automatically — no extra taps.',
  },
  {
    key: 'sources',
    icon: 'layers',
    chips: [
      { icon: 'logo-youtube', label: 'YouTube URL' },
      { icon: 'image', label: 'Screenshot' },
      { icon: 'create', label: 'Type it' },
    ],
    title: 'Any source works',
    body: 'Paste a YouTube link, screenshot an article, or just type what you remember. Trace reads them all and finds the title.',
  },
  {
    key: 'ai',
    icon: 'film',
    title: 'One analysis, every title',
    body: 'Trace spots multiple movies or series in a single post — and can even identify a film from a video clip when the name is never mentioned.',
  },
  {
    key: 'lists',
    icon: 'albums',
    title: 'Build & share lists',
    body: 'Group titles into lists like “Best Horror” or “Watch This Year”, add many at once, and share them with friends.',
  },
];

export default function Onboarding() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
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
          <Text style={styles.skip}>Skip</Text>
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
              <React.Fragment key={c.label}>
                {i > 0 ? <Ionicons name="chevron-forward" size={14} color={colors.onSurfaceTertiary} /> : null}
                <View style={styles.chip}>
                  <Ionicons name={c.icon} size={15} color={colors.brand} />
                  <Text style={styles.chipText}>{c.label}</Text>
                </View>
              </React.Fragment>
            ))}
          </View>
        ) : null}

        <Text style={styles.title}>{item.title}</Text>
        <Text style={styles.body}>{item.body}</Text>
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
          <Text style={styles.ctaText}>{isLast ? 'Get Started' : 'Next'}</Text>
          <Ionicons name={isLast ? 'arrow-forward-circle' : 'arrow-forward'} size={18} color={colors.onBrand} />
        </Pressable>
        <Pressable testID="onboarding-goto-login" onPress={() => router.replace('/(auth)/login')} style={styles.loginRow}>
          <Text style={styles.loginMuted}>Already have an account?</Text>
          <Text style={styles.loginLink}>Sign in</Text>
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
