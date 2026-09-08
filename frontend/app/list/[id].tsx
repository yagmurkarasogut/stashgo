import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, Dimensions } from 'react-native';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api, CustomList } from '@/src/api/client';
import { useT } from '@/src/i18n';
import { colors, spacing, radius, IMAGES } from '@/src/theme';

const SCREEN_W = Dimensions.get('window').width;
const COLS = 3;
const GAP = 4;
const CELL = (SCREEN_W - GAP * (COLS - 1)) / COLS;

export default function ListDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const t = useT();
  const [list, setList] = useState<CustomList | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await api.get<CustomList>(`/collections/${id}`);
      setList(data);
    } catch (e) { console.warn(e); }
  }, [id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const deleteList = async () => {
    await api.del(`/collections/${id}`);
    router.back();
  };

  const entries = list?.entries || [];

  return (
    <View style={styles.root} testID="list-detail-screen">
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable testID="list-back" onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="chevron-back" size={26} color={colors.onSurface} />
        </Pressable>
        <View style={{ flex: 1, marginLeft: spacing.sm }}>
          <Text style={styles.title} numberOfLines={1}>{list?.name || t('listDetail.fallback')}</Text>
          <Text style={styles.count}>{t('listDetail.titleCount', { n: entries.length })}</Text>
        </View>
        <Pressable testID="list-delete" onPress={deleteList} hitSlop={12}>
          <Ionicons name="trash-outline" size={20} color={colors.error} />
        </Pressable>
      </View>

      <Pressable
        testID="list-add-titles"
        onPress={() => router.push(`/list/new?listId=${id}&listName=${encodeURIComponent(list?.name || '')}`)}
        style={styles.addBtn}
      >
        <Ionicons name="add" size={18} color={colors.onBrand} />
        <Text style={styles.addBtnText}>{t('listDetail.addTitles')}</Text>
      </Pressable>

      <FlatList
        data={entries}
        keyExtractor={(i) => i.entry_id}
        numColumns={COLS}
        contentContainerStyle={{ paddingTop: spacing.md, paddingBottom: 40 }}
        columnWrapperStyle={{ gap: GAP }}
        ItemSeparatorComponent={() => <View style={{ height: GAP }} />}
        ListEmptyComponent={() => (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>{t('listDetail.empty')}</Text>
          </View>
        )}
        renderItem={({ item }) => (
          <Pressable
            testID={`list-item-${item.entry_id}`}
            onPress={() => router.push(`/movie/${item.entry_id}`)}
            style={{ width: CELL, height: CELL * 1.5, backgroundColor: colors.surfaceTertiary }}
          >
            <Image source={{ uri: item.poster_url || IMAGES.posterFallback }} style={{ width: '100%', height: '100%' }} contentFit="cover" transition={200} />
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.lg, paddingBottom: spacing.md, borderBottomColor: colors.border, borderBottomWidth: 0.5 },
  title: { color: colors.onSurface, fontSize: 20, fontWeight: '700' },
  count: { color: colors.onSurfaceTertiary, fontSize: 12, marginTop: 2 },
  addBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, marginHorizontal: spacing.lg, marginTop: spacing.md, backgroundColor: colors.brand, borderRadius: radius.md, paddingVertical: 12 },
  addBtnText: { color: colors.onBrand, fontSize: 14, fontWeight: '700' },
  empty: { alignItems: 'center', marginTop: spacing.xxxl, paddingHorizontal: spacing.xl },
  emptyText: { color: colors.onSurfaceTertiary, fontSize: 13, textAlign: 'center' },
});
