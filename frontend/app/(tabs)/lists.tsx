import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, TextInput, RefreshControl } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api, CustomList } from '@/src/api/client';
import { colors, spacing, radius, IMAGES } from '@/src/theme';

export default function Lists() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [lists, setLists] = useState<CustomList[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');

  const load = useCallback(async () => {
    try {
      const data = await api.get<CustomList[]>('/collections');
      setLists(data);
    } catch (e) { console.warn('lists load failed', e); }
    finally { setRefreshing(false); }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const create = async () => {
    const n = name.trim();
    if (!n) return;
    setCreating(true);
    try {
      await api.post('/collections', { name: n });
      setName('');
      await load();
    } catch (e) { console.warn(e); }
    finally { setCreating(false); }
  };

  return (
    <View style={styles.root} testID="lists-screen">
      <View style={[styles.header, { paddingTop: insets.top + spacing.md }]}>
        <Text style={styles.title}>Custom Lists</Text>
        <View style={styles.createRow}>
          <TextInput
            testID="lists-new-input"
            value={name}
            onChangeText={setName}
            placeholder="New list — e.g. Best Horror, Nolan Collection"
            placeholderTextColor={colors.onSurfaceTertiary}
            style={styles.input}
            onSubmitEditing={create}
          />
          <Pressable testID="lists-create-button" onPress={create} disabled={creating} style={styles.createBtn}>
            <Ionicons name="add" size={22} color={colors.onBrand} />
          </Pressable>
        </View>
      </View>

      <FlatList
        data={lists}
        keyExtractor={(l) => l.collection_id}
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 120, gap: spacing.md }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.brand} />}
        ListEmptyComponent={() => (
          <View style={styles.empty}>
            <Ionicons name="albums-outline" size={40} color={colors.onSurfaceTertiary} />
            <Text style={styles.emptyText}>No lists yet. Create your first above — a movie can live in as many lists as you like.</Text>
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
              <Text style={styles.listCount}>{item.item_count} {item.item_count === 1 ? 'title' : 'titles'}</Text>
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
  createRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  input: { flex: 1, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.md, paddingVertical: 11, color: colors.onSurface, fontSize: 13 },
  createBtn: { width: 44, height: 44, borderRadius: radius.md, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' },
  empty: { alignItems: 'center', marginTop: spacing.xxxl, gap: spacing.md, paddingHorizontal: spacing.xl },
  emptyText: { color: colors.onSurfaceTertiary, fontSize: 13, textAlign: 'center', lineHeight: 19 },
  listCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md },
  coverStack: { width: 100, height: 66, justifyContent: 'center' },
  cover: { position: 'absolute', width: 44, height: 66, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.surface },
  listName: { color: colors.onSurface, fontSize: 16, fontWeight: '700' },
  listCount: { color: colors.onSurfaceTertiary, fontSize: 12, marginTop: 2 },
});
