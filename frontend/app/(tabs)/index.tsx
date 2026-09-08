import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, RefreshControl, FlatList, ActivityIndicator } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { api, Discovery, LibraryEntry } from '@/src/api/client';
import { useAuth } from '@/src/context/AuthContext';
import { useT } from '@/src/i18n';
import { colors, spacing, radius, IMAGES } from '@/src/theme';

const PLATFORM_ICON: Record<string, any> = {
  instagram: 'logo-instagram',
  tiktok: 'logo-tiktok',
  youtube: 'logo-youtube',
  x: 'logo-twitter',
  web: 'globe-outline',
  manual: 'create-outline',
  screenshot: 'image-outline',
};

export default function Home() {
  const { user } = useAuth();
  const router = useRouter();
  const t = useT();
  const insets = useSafeAreaInsets();
  const [discoveries, setDiscoveries] = useState<Discovery[]>([]);
  const [library, setLibrary] = useState<LibraryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [ds, lib] = await Promise.all([
        api.get<Discovery[]>('/discoveries?limit=20'),
        api.get<LibraryEntry[]>('/library'),
      ]);
      setDiscoveries(ds);
      setLibrary(lib);
    } catch (e) {
      console.warn('home load failed', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const onRefresh = () => { setRefreshing(true); load(); };

  const recentPosters = library.slice(0, 10);
  const totalDetections = discoveries.reduce((s, d) => s + d.detections.length, 0);

  return (
    <View style={styles.root} testID="home-screen">
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + spacing.lg, paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand} />}
      >
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>{t('home.welcomeBack')}</Text>
            <Text style={styles.name}>{user?.name || user?.email?.split('@')[0]}</Text>
          </View>
          <View style={styles.stats}>
            <View style={styles.statPill}><Text style={styles.statNum}>{library.length}</Text><Text style={styles.statLabel}>{t('home.inVault')}</Text></View>
          </View>
        </View>

        {/* AI conversation entry */}
        <View style={{ paddingHorizontal: spacing.lg, marginTop: spacing.lg }}>
          <Pressable testID="home-ai-entry" onPress={() => router.push('/ai-discover')} style={styles.aiCard}>
            <View style={styles.aiIcon}>
              <Ionicons name="sparkles" size={18} color={colors.brand} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.aiTitle}>{t('home.aiTitle')}</Text>
              <Text style={styles.aiPrompt} numberOfLines={1}>{t('home.aiPrompt')}</Text>
            </View>
            <Ionicons name="arrow-forward" size={18} color={colors.onSurfaceTertiary} />
          </Pressable>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.aiChipRow}>
            {['discover.c1', 'discover.c3', 'discover.c4', 'discover.c5'].map((k) => (
              <Pressable
                key={k}
                testID={`home-ai-chip-${k}`}
                onPress={() => router.push({ pathname: '/ai-discover', params: { q: t(k) } })}
                style={styles.aiChip}
              >
                <Text style={styles.aiChipText}>{t(k)}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>

        {/* Hero recent library carousel */}
        <View style={styles.section}>
          <View style={styles.sectionHead}>
            <Text style={styles.sectionTitle}>{t('home.yourVault')}</Text>
            <Pressable testID="home-see-all-library" onPress={() => router.push('/(tabs)/library')}>
              <Text style={styles.link}>{t('home.seeAll')}</Text>
            </Pressable>
          </View>
          {loading ? (
            <ActivityIndicator color={colors.brand} style={{ marginTop: spacing.lg }} />
          ) : recentPosters.length === 0 ? (
            <EmptyHint text={t('home.vaultEmpty')} />
          ) : (
            <FlatList
              horizontal
              data={recentPosters}
              keyExtractor={(i) => i.entry_id}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: spacing.lg, gap: spacing.md }}
              renderItem={({ item }) => (
                <Pressable
                  testID={`home-poster-${item.entry_id}`}
                  onPress={() => router.push(`/movie/${item.entry_id}`)}
                  style={styles.posterCard}
                >
                  <Image
                    source={{ uri: item.poster_url || IMAGES.posterFallback }}
                    style={styles.posterImg}
                    contentFit="cover"
                    transition={200}
                  />
                  <LinearGradient
                    colors={['transparent', 'rgba(11,13,16,0.9)']}
                    style={styles.posterOverlay}
                  />
                  <View style={styles.posterMeta}>
                    <Text numberOfLines={1} style={styles.posterTitle}>{item.title}</Text>
                    <Text style={styles.posterYear}>{item.year || item.media_type.toUpperCase()}</Text>
                  </View>
                </Pressable>
              )}
            />
          )}
        </View>

        {/* Recent discoveries */}
        <View style={styles.section}>
          <View style={styles.sectionHead}>
            <Text style={styles.sectionTitle}>{t('home.recentDiscoveries')}</Text>
            {totalDetections > 0 ? <Text style={styles.badge}>{t('home.detected', { n: totalDetections })}</Text> : null}
          </View>
          {loading ? null : discoveries.length === 0 ? (
            <EmptyHint text={t('home.noDiscoveries')} />
          ) : (
            <View style={{ paddingHorizontal: spacing.lg, gap: spacing.md }}>
              {discoveries.slice(0, 8).map((d) => (
                <DiscoveryCard key={d.discovery_id} d={d} />
              ))}
            </View>
          )}
        </View>
      </ScrollView>

      <Pressable
        testID="home-add-fab"
        onPress={() => router.push('/add-discovery')}
        style={({ pressed }) => [styles.fab, { bottom: 100 }, pressed && { transform: [{ scale: 0.96 }] }]}
      >
        <Ionicons name="add" size={30} color={colors.onBrand} />
      </Pressable>
    </View>
  );
}

function EmptyHint({ text }: { text: string }) {
  return (
    <View style={styles.emptyBox}>
      <Image source={{ uri: IMAGES.emptyTheater }} style={styles.emptyImg} contentFit="cover" />
      <LinearGradient colors={['transparent', 'rgba(11,13,16,0.95)']} style={StyleSheet.absoluteFillObject} />
      <Text style={styles.emptyText}>{text}</Text>
    </View>
  );
}

function DiscoveryCard({ d }: { d: Discovery }) {
  const router = useRouter();
  const t = useT();
  const icon = PLATFORM_ICON[d.source_platform] || 'globe-outline';
  return (
    <Pressable
      testID={`discovery-card-${d.discovery_id}`}
      onPress={() => d.detections[0]?.tmdb_id && router.push('/(tabs)/library')}
      style={styles.discCard}
    >
      <View style={styles.discHead}>
        <View style={styles.platBadge}>
          <Ionicons name={icon} size={13} color={colors.brand} />
          <Text style={styles.platText}>{d.source_platform}</Text>
        </View>
        <Text style={styles.discDate}>{new Date(d.created_at).toLocaleDateString()}</Text>
      </View>
      {d.ai_summary ? <Text style={styles.discSummary} numberOfLines={2}>{d.ai_summary}</Text> : null}
      {d.detections.length > 0 ? (
        <FlatList
          horizontal
          data={d.detections}
          keyExtractor={(x, i) => `${d.discovery_id}-${i}`}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: spacing.sm, marginTop: spacing.md }}
          renderItem={({ item }) => (
            <View style={styles.detChip}>
              {item.poster_url ? (
                <Image source={{ uri: item.poster_url }} style={styles.detChipImg} contentFit="cover" />
              ) : null}
              <View style={{ flex: 1 }}>
                <Text style={styles.detChipTitle} numberOfLines={1}>{item.title}</Text>
                <Text style={styles.detChipMeta}>{t(`mediaType.${item.media_type}`)} · {(item.confidence * 100).toFixed(0)}%</Text>
              </View>
            </View>
          )}
        />
      ) : (
        <Text style={styles.discNone}>{t('home.noMoviesDetected')}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  header: { paddingHorizontal: spacing.lg, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.xl },
  greeting: { color: colors.onSurfaceTertiary, fontSize: 13 },
  name: { color: colors.onSurface, fontSize: 24, fontWeight: '700', marginTop: 2 },
  stats: { flexDirection: 'row' },
  statPill: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, alignItems: 'center', borderWidth: 1, borderColor: colors.border },
  statNum: { color: colors.brand, fontSize: 18, fontWeight: '700' },
  statLabel: { color: colors.onSurfaceTertiary, fontSize: 10, letterSpacing: 0.5, textTransform: 'uppercase' },
  section: { marginBottom: spacing.xl },
  aiCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.brand, padding: spacing.md },
  aiIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surfaceTertiary, alignItems: 'center', justifyContent: 'center' },
  aiTitle: { color: colors.onSurface, fontSize: 15, fontWeight: '700' },
  aiPrompt: { color: colors.onSurfaceTertiary, fontSize: 13, marginTop: 2 },
  aiChipRow: { gap: spacing.sm, paddingVertical: spacing.md },
  aiChip: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.md, paddingVertical: 8 },
  aiChipText: { color: colors.onSurface, fontSize: 13, fontWeight: '600' },
  sectionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.lg, marginBottom: spacing.md },
  sectionTitle: { color: colors.onSurface, fontSize: 18, fontWeight: '600' },
  link: { color: colors.brand, fontSize: 13, fontWeight: '600' },
  badge: { color: colors.onSurfaceTertiary, fontSize: 12 },
  posterCard: { width: 130, height: 195, borderRadius: radius.md, overflow: 'hidden', backgroundColor: colors.surfaceTertiary },
  posterImg: { width: '100%', height: '100%' },
  posterOverlay: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '55%' },
  posterMeta: { position: 'absolute', left: 8, right: 8, bottom: 8 },
  posterTitle: { color: colors.onSurface, fontSize: 13, fontWeight: '700' },
  posterYear: { color: colors.brand, fontSize: 11, marginTop: 2 },
  emptyBox: { marginHorizontal: spacing.lg, height: 160, borderRadius: radius.md, overflow: 'hidden', justifyContent: 'flex-end', padding: spacing.lg, borderWidth: 1, borderColor: colors.border },
  emptyImg: { ...StyleSheet.absoluteFillObject },
  emptyText: { color: colors.onSurface, fontSize: 13 },
  discCard: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, padding: spacing.md, borderWidth: 1, borderColor: colors.border },
  discHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
  platBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.brandTertiary, paddingHorizontal: spacing.sm, paddingVertical: 3, borderRadius: radius.pill },
  platText: { color: colors.brand, fontSize: 11, textTransform: 'capitalize', fontWeight: '600' },
  discDate: { color: colors.onSurfaceTertiary, fontSize: 11 },
  discSummary: { color: colors.onSurfaceSecondary, fontSize: 13, lineHeight: 18 },
  discNone: { color: colors.onSurfaceTertiary, fontSize: 12, marginTop: spacing.sm, fontStyle: 'italic' },
  detChip: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.surfaceTertiary, borderRadius: radius.sm, paddingRight: spacing.md, minWidth: 180, maxWidth: 240 },
  detChipImg: { width: 40, height: 60, borderTopLeftRadius: radius.sm, borderBottomLeftRadius: radius.sm },
  detChipTitle: { color: colors.onSurface, fontSize: 13, fontWeight: '600' },
  detChipMeta: { color: colors.onSurfaceTertiary, fontSize: 11, marginTop: 2 },
  fab: { position: 'absolute', right: spacing.lg, width: 56, height: 56, borderRadius: 28, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 12, elevation: 8 },
});
