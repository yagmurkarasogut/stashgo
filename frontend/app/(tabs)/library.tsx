import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, RefreshControl, ScrollView, Dimensions } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api, LibraryEntry } from '@/src/api/client';
import { useT } from '@/src/i18n';
import { colors, spacing, radius, IMAGES } from '@/src/theme';

const TYPE_FILTERS = [
  { key: 'all', labelKey: 'library.typeAll' },
  { key: 'movie', labelKey: 'library.typeMovie' },
  { key: 'tv', labelKey: 'library.typeTv' },
];

const STATUS_FILTERS = [
  { key: 'want_to_watch', labelKey: 'library.statusWant' },
  { key: 'watching', labelKey: 'library.statusWatching' },
  { key: 'watched', labelKey: 'library.statusWatched' },
];

const GENRES = ['All', 'Drama', 'Sci-Fi', 'Horror', 'Thriller', 'Comedy', 'Romance', 'Documentary', 'Animation'];

const SORTS = [
  { key: 'recent', labelKey: 'library.sortRecent' },
  { key: 'release', labelKey: 'library.sortRelease' },
  { key: 'rating', labelKey: 'library.sortRating' },
  { key: 'alpha', labelKey: 'library.sortAlpha' },
];

const SCREEN_W = Dimensions.get('window').width;
const GRID_COLS = 3;
const GRID_GAP = 4;
const CELL_W = (SCREEN_W - GRID_GAP * (GRID_COLS - 1)) / GRID_COLS;

export default function Library() {
  const router = useRouter();
  const t = useT();
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<LibraryEntry[]>([]);
  const [typeF, setTypeF] = useState('all');
  const [statusF, setStatusF] = useState('all');
  const [genreF, setGenreF] = useState('All');
  const [sort, setSort] = useState('recent');
  const [sortOpen, setSortOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (typeF !== 'all') params.append('media_type', typeF);
      if (statusF !== 'all') params.append('watch_status', statusF);
      if (genreF !== 'All') params.append('genre', genreF === 'Sci-Fi' ? 'Sci-Fi' : genreF);
      params.append('sort', sort);
      const data = await api.get<LibraryEntry[]>('/library?' + params.toString());
      setItems(data);
    } catch (e) {
      console.warn('library load failed', e);
    } finally {
      setRefreshing(false);
    }
  }, [typeF, statusF, genreF, sort]);

  useEffect(() => { load(); }, [load]);

  const sortLabel = SORTS.find((s) => s.key === sort)?.labelKey;
  const sortText = sortLabel ? t(sortLabel) : t('library.sort');

  return (
    <View style={styles.root} testID="library-screen">
      <View style={[styles.stickyHeader, { paddingTop: insets.top + spacing.md }]}>
        <View style={styles.titleRow}>
          <Text style={styles.title}>{t('library.title')}</Text>
          <Pressable testID="library-sort-button" onPress={() => setSortOpen((v) => !v)} style={styles.sortBtn}>
            <Ionicons name="swap-vertical" size={14} color={colors.brand} />
            <Text style={styles.sortText}>{sortText}</Text>
          </Pressable>
        </View>

        {sortOpen ? (
          <View style={styles.sortMenu}>
            {SORTS.map((s) => (
              <Pressable
                key={s.key}
                testID={`library-sort-${s.key}`}
                onPress={() => { setSort(s.key); setSortOpen(false); }}
                style={[styles.sortItem, s.key === sort && styles.sortItemActive]}
              >
                <Text style={[styles.sortItemText, s.key === sort && { color: colors.brand }]}>{t(s.labelKey)}</Text>
                {s.key === sort ? <Ionicons name="checkmark" size={14} color={colors.brand} /> : null}
              </Pressable>
            ))}
          </View>
        ) : null}

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
          {TYPE_FILTERS.map((f) => {
            const active = f.key === typeF;
            return (
              <Pressable key={f.key} testID={`library-type-${f.key}`} onPress={() => setTypeF(f.key)} style={[styles.chip, active && styles.chipActive]}>
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{t(f.labelKey)}</Text>
              </Pressable>
            );
          })}
          <View style={styles.chipDivider} />
          {STATUS_FILTERS.map((f) => {
            const active = f.key === statusF;
            return (
              <Pressable key={f.key} testID={`library-status-${f.key}`} onPress={() => setStatusF(active ? 'all' : f.key)} style={[styles.chip, active && styles.chipActive]}>
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{t(f.labelKey)}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.chipRow, { marginTop: spacing.sm }]}>
          {GENRES.map((g) => {
            const active = g === genreF;
            return (
              <Pressable key={g} testID={`library-genre-${g}`} onPress={() => setGenreF(g)} style={[styles.genreChip, active && styles.chipActive]}>
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{t(`genres.${g}`)}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      <FlatList
        data={items}
        keyExtractor={(i) => i.entry_id}
        numColumns={GRID_COLS}
        contentContainerStyle={{ paddingTop: spacing.md, paddingBottom: 120 }}
        columnWrapperStyle={{ gap: GRID_GAP }}
        ItemSeparatorComponent={() => <View style={{ height: GRID_GAP }} />}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.brand} />}
        ListEmptyComponent={() => (
          <View style={styles.empty}>
            <Image source={{ uri: IMAGES.emptyTheater }} style={styles.emptyImg} contentFit="cover" />
            <View style={styles.emptyScrim} />
            <Text style={styles.emptyTitle}>{t('library.emptyTitle')}</Text>
            <Text style={styles.emptySub}>{t('library.emptySub')}</Text>
          </View>
        )}
        renderItem={({ item }) => (
          <Pressable
            testID={`library-item-${item.entry_id}`}
            onPress={() => router.push(`/movie/${item.entry_id}`)}
            style={{ width: CELL_W, height: CELL_W * 1.5, backgroundColor: colors.surfaceTertiary }}
          >
            <Image
              source={{ uri: item.poster_url || IMAGES.posterFallback }}
              style={{ width: '100%', height: '100%' }}
              contentFit="cover"
              transition={200}
            />
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  stickyHeader: { paddingHorizontal: 0, paddingBottom: spacing.md, borderBottomColor: colors.border, borderBottomWidth: 0.5, backgroundColor: colors.surface },
  title: { color: colors.onSurface, fontSize: 28, fontWeight: '700', paddingHorizontal: spacing.lg, marginBottom: spacing.md },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingRight: spacing.lg },
  sortBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 7, marginBottom: spacing.md },
  sortText: { color: colors.brand, fontSize: 12, fontWeight: '600' },
  sortMenu: { marginHorizontal: spacing.lg, marginBottom: spacing.md, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  sortItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.md, paddingVertical: 11, borderBottomColor: colors.divider, borderBottomWidth: 0.5 },
  sortItemActive: { backgroundColor: colors.brandTertiary },
  sortItemText: { color: colors.onSurfaceSecondary, fontSize: 13, fontWeight: '600' },
  chipRow: { paddingHorizontal: spacing.lg, gap: spacing.sm },
  chip: { height: 36, paddingHorizontal: spacing.lg, borderRadius: radius.pill, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  genreChip: { height: 34, paddingHorizontal: spacing.md, borderRadius: radius.pill, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  chipDivider: { width: 1, height: 24, backgroundColor: colors.border, alignSelf: 'center', marginHorizontal: spacing.xs },
  chipActive: { borderColor: colors.brand, backgroundColor: colors.brandTertiary },
  chipText: { color: colors.onSurfaceSecondary, fontSize: 13, fontWeight: '600' },
  chipTextActive: { color: colors.brand },
  empty: { marginHorizontal: spacing.lg, marginTop: spacing.xxl, height: 260, borderRadius: radius.md, overflow: 'hidden', padding: spacing.xl, justifyContent: 'flex-end', borderWidth: 1, borderColor: colors.border },
  emptyImg: { ...StyleSheet.absoluteFillObject },
  emptyScrim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(11,13,16,0.65)' },
  emptyTitle: { color: colors.onSurface, fontSize: 18, fontWeight: '600', marginBottom: spacing.xs },
  emptySub: { color: colors.onSurfaceSecondary, fontSize: 13 },
});
