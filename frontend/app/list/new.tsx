import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, TextInput, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { Image } from 'expo-image';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api, LibraryEntry, CustomList } from '@/src/api/client';
import { useToast } from '@/src/context/ToastContext';
import { useT } from '@/src/i18n';
import { colors, spacing, radius, IMAGES } from '@/src/theme';

// Dual-purpose: create a new list (default) OR add titles to an existing list (?listId=)
export default function ListNew() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const t = useT();
  const { listId, listName } = useLocalSearchParams<{ listId?: string; listName?: string }>();
  const addMode = !!listId;

  const [name, setName] = useState('');
  const [library, setLibrary] = useState<LibraryEntry[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [existing, setExisting] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    try {
      const lib = await api.get<LibraryEntry[]>('/library?sort=recent');
      setLibrary(lib);
      if (addMode) {
        const detail = await api.get<CustomList>(`/collections/${listId}`);
        setExisting(new Set((detail.entries || []).map((e) => e.entry_id)));
      }
    } catch (e) { console.warn(e); }
    finally { setLoading(false); }
  }, [addMode, listId]);

  useEffect(() => { load(); }, [load]);

  const toggle = (entryId: string) => {
    if (existing.has(entryId)) return; // already in the list
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(entryId) ? next.delete(entryId) : next.add(entryId);
      return next;
    });
  };

  const submit = async () => {
    const ids = Array.from(selected);
    if (addMode) {
      if (ids.length === 0) { toast.show(t('listNew.selectOne'), 'info'); return; }
      setBusy(true);
      try {
        await api.post(`/collections/${listId}/items/batch`, { entry_ids: ids });
        toast.show(t('listNew.added', { n: ids.length, name: listName || t('listDetail.fallback') }), 'success');
        router.back();
      } catch (e) { toast.show(t('listNew.couldNotAdd'), 'error'); }
      finally { setBusy(false); }
    } else {
      if (!name.trim()) { toast.show(t('listNew.nameFirst'), 'info'); return; }
      setBusy(true);
      try {
        const c = await api.post<CustomList>('/collections', { name: name.trim(), entry_ids: ids });
        toast.show(t('listNew.created', { name: c.name, n: ids.length }), 'success');
        router.replace(`/list/${c.collection_id}`);
      } catch (e) { toast.show(t('listNew.couldNotCreate'), 'error'); }
      finally { setBusy(false); }
    }
  };

  const filtered = library.filter((l) => l.title.toLowerCase().includes(search.trim().toLowerCase()));
  const count = selected.size;

  return (
    <View style={[styles.root, { paddingTop: insets.top }]} testID="list-new-screen">
      <View style={styles.head}>
        <Pressable testID="list-new-close" onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="close" size={26} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.title}>{addMode ? t('listNew.addTo', { name: listName || t('listDetail.fallback') }) : t('listNew.createNew')}</Text>
        <View style={{ width: 26 }} />
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        {!addMode ? (
          <View style={styles.nameWrap}>
            <TextInput
              testID="list-new-name"
              value={name}
              onChangeText={setName}
              placeholder={t('listNew.namePlaceholder')}
              placeholderTextColor={colors.onSurfaceTertiary}
              style={styles.nameInput}
            />
          </View>
        ) : null}

        <View style={styles.searchWrap}>
          <Ionicons name="search" size={16} color={colors.onSurfaceTertiary} style={{ marginLeft: spacing.md }} />
          <TextInput
            testID="list-new-search"
            value={search}
            onChangeText={setSearch}
            placeholder={t('listNew.searchLibrary')}
            placeholderTextColor={colors.onSurfaceTertiary}
            style={styles.searchInput}
          />
        </View>

        <Text style={styles.helper}>{t('listNew.helper')}</Text>

        {loading ? (
          <ActivityIndicator color={colors.brand} style={{ marginTop: spacing.xl }} />
        ) : (
          <FlatList
            data={filtered}
            keyExtractor={(i) => i.entry_id}
            contentContainerStyle={{ padding: spacing.lg, paddingBottom: 120, gap: spacing.sm }}
            ListEmptyComponent={() => (
              <Text style={styles.emptyText}>{t('listNew.libEmpty')}</Text>
            )}
            renderItem={({ item }) => {
              const isExisting = existing.has(item.entry_id);
              const isSel = selected.has(item.entry_id) || isExisting;
              return (
                <Pressable
                  testID={`list-select-${item.entry_id}`}
                  onPress={() => toggle(item.entry_id)}
                  disabled={isExisting}
                  style={[styles.row, isSel && styles.rowSel, isExisting && { opacity: 0.55 }]}
                >
                  <Image source={{ uri: item.poster_url || IMAGES.posterFallback }} style={styles.poster} contentFit="cover" />
                  <View style={{ flex: 1, marginLeft: spacing.md }}>
                    <Text style={styles.rowTitle} numberOfLines={1}>{item.title}</Text>
                    <Text style={styles.rowMeta}>{t(`mediaType.${item.media_type}`)} {item.year ? `· ${item.year}` : ''}</Text>
                  </View>
                  <Ionicons
                    name={isSel ? 'checkmark-circle' : 'ellipse-outline'}
                    size={24}
                    color={isSel ? colors.brand : colors.onSurfaceTertiary}
                  />
                </Pressable>
              );
            }}
          />
        )}

        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, spacing.md) }]}>
          <Pressable testID="list-new-submit" onPress={submit} disabled={busy} style={[styles.submit, busy && { opacity: 0.7 }]}>
            {busy ? <ActivityIndicator color={colors.onBrand} /> : (
              <Text style={styles.submitText}>
                {addMode ? t('listNew.addN', { n: count }) : t('listNew.createWithCount', { sel: count ? t('listNew.selected', { n: count }) : '' })}
              </Text>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  title: { color: colors.onSurface, fontSize: 18, fontWeight: '700' },
  nameWrap: { paddingHorizontal: spacing.lg, marginBottom: spacing.sm },
  nameInput: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.md, paddingVertical: 13, color: colors.onSurface, fontSize: 15 },
  searchWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, marginHorizontal: spacing.lg },
  searchInput: { flex: 1, paddingHorizontal: spacing.md, paddingVertical: 10, color: colors.onSurface, fontSize: 14 },
  helper: { color: colors.onSurfaceTertiary, fontSize: 12, paddingHorizontal: spacing.lg, marginTop: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.sm },
  rowSel: { borderColor: colors.brand, backgroundColor: colors.brandTertiary },
  poster: { width: 44, height: 66, borderRadius: radius.sm, backgroundColor: colors.surfaceTertiary },
  rowTitle: { color: colors.onSurface, fontSize: 14, fontWeight: '600' },
  rowMeta: { color: colors.onSurfaceTertiary, fontSize: 12, marginTop: 2 },
  emptyText: { color: colors.onSurfaceTertiary, fontSize: 13, textAlign: 'center', marginTop: spacing.xl },
  footer: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, borderTopColor: colors.border, borderTopWidth: 0.5, backgroundColor: colors.surface },
  submit: { backgroundColor: colors.brand, borderRadius: radius.md, paddingVertical: 15, alignItems: 'center' },
  submitText: { color: colors.onBrand, fontSize: 15, fontWeight: '700' },
});
