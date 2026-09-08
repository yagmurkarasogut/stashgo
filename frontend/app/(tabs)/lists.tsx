import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, TextInput, RefreshControl } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api, CustomList } from '@/src/api/client';
import { useT } from '@/src/i18n';
import { colors, spacing, radius, IMAGES } from '@/src/theme';

export default function Lists() {
  const router = useRouter();
  const t = useT();
  const insets = useSafeAreaInsets();
  const [lists, setLists] = useState<CustomList[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState('');

  const load = useCallback(async () => {
    try {
      const data = await api.get<CustomList[]>('/collections');
      setLists(data);
    } catch (e) { console.warn('lists load failed', e); }
    finally { setRefreshing(false); }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const filtered = lists.filter((l) => l.name.toLowerCase().includes(query.trim().toLowerCase()));

  return (
    <View style={styles.root} testID="lists-screen">
      <View style={[styles.header, { paddingTop: insets.top + spacing.md }]}>
        <Text style={styles.title}>{t('lists.title')}</Text>
        <View style={styles.searchRow}>
          <Ionicons name="search" size={16} color={colors.onSurfaceTertiary} style={{ marginLeft: spacing.md }} />
          <TextInput
            testID="lists-search-input"
            value={query}
            onChangeText={setQuery}
            placeholder={t('lists.searchPlaceholder')}
            placeholderTextColor={colors.onSurfaceTertiary}
            style={styles.searchInput}
          />
        </View>
        <Pressable testID="lists-create-button" onPress={() => router.push('/list/new')} style={styles.createBtn}>
          <Ionicons name="add" size={20} color={colors.onBrand} />
          <Text style={styles.createBtnText}>{t('lists.createNew')}</Text>
        </Pressable>
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(l) => l.collection_id}
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 120, gap: spacing.md }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.brand} />}
        ListEmptyComponent={() => (
          <View style={styles.empty}>
            <Ionicons name="albums-outline" size={40} color={colors.onSurfaceTertiary} />
            <Text style={styles.emptyText}>{t('lists.empty')}</Text>
          </View>
        )}
        renderItem={({ item }) => (
          <Pressable
            testID={`list-card-${item.collection_id}`}
            onPress={() => router.push(`/list/${item.collection_id}`)}
            style={styles.listCard}
          >
            <View style={styles.coverStack}>
              {(item.cover_posters.length ? item.cover_posters : [IMAGES.posterFallback]).slice(0, 3).map((p, i) => (
                <Image key={i} source={{ uri: p }} style={[styles.cover, { left: i * 26, zIndex: 3 - i }]} contentFit="cover" />
              ))}
            </View>
            <View style={{ flex: 1, marginLeft: spacing.md }}>
              <Text style={styles.listName}>{item.name}</Text>
              <Text style={styles.listCount}>{t('lists.titleCount', { n: item.item_count })}</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.onSurfaceTertiary} />
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  header: { paddingHorizontal: spacing.lg, paddingBottom: spacing.md, borderBottomColor: colors.border, borderBottomWidth: 0.5 },
  title: { color: colors.onSurface, fontSize: 28, fontWeight: '700', marginBottom: spacing.md },
  searchRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, marginBottom: spacing.sm },
  searchInput: { flex: 1, paddingHorizontal: spacing.md, paddingVertical: 11, color: colors.onSurface, fontSize: 14 },
  createBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, height: 46, borderRadius: radius.md, backgroundColor: colors.brand },
  createBtnText: { color: colors.onBrand, fontSize: 14, fontWeight: '700' },
  empty: { alignItems: 'center', marginTop: spacing.xxxl, gap: spacing.md, paddingHorizontal: spacing.xl },
  emptyText: { color: colors.onSurfaceTertiary, fontSize: 13, textAlign: 'center', lineHeight: 19 },
  listCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md },
  coverStack: { width: 100, height: 66, justifyContent: 'center' },
  cover: { position: 'absolute', width: 44, height: 66, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.surface },
  listName: { color: colors.onSurface, fontSize: 16, fontWeight: '700' },
  listCount: { color: colors.onSurfaceTertiary, fontSize: 12, marginTop: 2 },
});
