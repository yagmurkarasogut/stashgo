import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, RefreshControl, ScrollView, Dimensions } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api, LibraryEntry } from '@/src/api/client';
import { colors, spacing, radius, IMAGES } from '@/src/theme';

const FILTERS: { key: string; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'movie', label: 'Movies' },
  { key: 'tv', label: 'TV' },
  { key: 'want_to_watch', label: 'Want to watch' },
  { key: 'watching', label: 'Watching' },
  { key: 'watched', label: 'Watched' },
];

const SCREEN_W = Dimensions.get('window').width;
const GRID_COLS = 3;
const GRID_GAP = 4;
const CELL_W = (SCREEN_W - GRID_GAP * (GRID_COLS - 1)) / GRID_COLS;

export default function Library() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<LibraryEntry[]>([]);
  const [filter, setFilter] = useState('all');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      let q = '';
      if (filter === 'movie' || filter === 'tv') q = `?media_type=${filter}`;
      else if (filter === 'want_to_watch' || filter === 'watching' || filter === 'watched') q = `?watch_status=${filter}`;
      const data = await api.get<LibraryEntry[]>('/library' + q);
      setItems(data);
    } catch (e) {
      console.warn('library load failed', e);
    } finally {
      setRefreshing(false);
    }
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  return (
    <View style={styles.root} testID="library-screen">
      <View style={[styles.stickyHeader, { paddingTop: insets.top + spacing.md }]}>
        <Text style={styles.title}>Library</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipRow}
        >
          {FILTERS.map((f) => {
            const active = f.key === filter;
            return (
              <Pressable
                key={f.key}
                testID={`library-chip-${f.key}`}
                onPress={() => setFilter(f.key)}
                style={[styles.chip, active && styles.chipActive]}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{f.label}</Text>
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
            <Text style={styles.emptyTitle}>Your memory vault is empty</Text>
            <Text style={styles.emptySub}>Save your first Reel, article, or screenshot.</Text>
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
  chipRow: { paddingHorizontal: spacing.lg, gap: spacing.sm },
  chip: { height: 36, paddingHorizontal: spacing.lg, borderRadius: radius.pill, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  chipActive: { borderColor: colors.brand, backgroundColor: colors.brandTertiary },
  chipText: { color: colors.onSurfaceSecondary, fontSize: 13, fontWeight: '600' },
  chipTextActive: { color: colors.brand },
  empty: { marginHorizontal: spacing.lg, marginTop: spacing.xxl, height: 260, borderRadius: radius.md, overflow: 'hidden', padding: spacing.xl, justifyContent: 'flex-end', borderWidth: 1, borderColor: colors.border },
  emptyImg: { ...StyleSheet.absoluteFillObject },
  emptyScrim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(11,13,16,0.65)' },
  emptyTitle: { color: colors.onSurface, fontSize: 18, fontWeight: '600', marginBottom: spacing.xs },
  emptySub: { color: colors.onSurfaceSecondary, fontSize: 13 },
});
