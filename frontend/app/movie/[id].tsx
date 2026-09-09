import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, TextInput, Platform, Alert } from 'react-native';
import { Image } from 'expo-image';
import { WebView } from 'react-native-webview';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api, LibraryEntry } from '@/src/api/client';
import { useToast } from '@/src/context/ToastContext';
import { useT } from '@/src/i18n';
import { colors, spacing, radius, IMAGES } from '@/src/theme';

const STATUSES: { key: LibraryEntry['watch_status']; labelKey: string; icon: any }[] = [
  { key: 'want_to_watch', labelKey: 'detail.statusWant', icon: 'bookmark-outline' },
  { key: 'watching', labelKey: 'detail.statusWatching', icon: 'play-circle-outline' },
  { key: 'watched', labelKey: 'detail.statusWatched', icon: 'checkmark-circle-outline' },
];

export default function MovieDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [entry, setEntry] = useState<LibraryEntry | null>(null);
  const [loading, setLoading] = useState(true);
  const [note, setNote] = useState('');
  const [rating, setRating] = useState<string>('');
  const [lists, setLists] = useState<{ collection_id: string; name: string; contains: boolean; item_count: number }[]>([]);
  const [newListName, setNewListName] = useState('');
  const [creatingList, setCreatingList] = useState(false);
  const [showTrailer, setShowTrailer] = useState(false);
  const toast = useToast();
  const t = useT();

  const loadLists = useCallback(async () => {
    try {
      const res = await api.get<{ lists: typeof lists }>(`/library/${id}/lists`);
      setLists(res.lists);
    } catch (e) { console.warn('lists load failed', e); }
  }, [id]);

  const load = useCallback(async () => {
    try {
      const e = await api.get<LibraryEntry>(`/library/${id}`);
      setEntry(e);
      setNote(e.user_note);
      setRating(e.user_rating != null ? String(e.user_rating) : '');
    } finally { setLoading(false); }
  }, [id]);

  useEffect(() => { load(); }, [load]);
  useFocusEffect(useCallback(() => { loadLists(); }, [loadLists]));

  const toggleList = async (listId: string, contains: boolean) => {
    setLists((prev) => prev.map((l) => l.collection_id === listId ? { ...l, contains: !contains } : l));
    try {
      if (contains) await api.del(`/collections/${listId}/items/${id}`);
      else await api.post(`/collections/${listId}/items`, { entry_id: id });
    } catch (e) { console.warn(e); loadLists(); }
  };

  const createList = async () => {
    const name = newListName.trim();
    if (!name) return;
    setCreatingList(true);
    try {
      const c = await api.post<{ collection_id: string }>('/collections', { name });
      await api.post(`/collections/${c.collection_id}/items`, { entry_id: id });
      setNewListName('');
      await loadLists();
    } catch (e) { console.warn(e); }
    finally { setCreatingList(false); }
  };

  const update = async (patch: any) => {
    try {
      const e = await api.patch<LibraryEntry>(`/library/${id}`, patch);
      setEntry(e);
    } catch (err) { console.warn(err); }
  };

  const setStatus = (s: LibraryEntry['watch_status']) => update({ watch_status: s });
  const saveNote = () => update({ user_note: note });
  const saveRating = () => {
    const n = parseFloat(rating);
    if (isNaN(n) || n < 0 || n > 10) return;
    update({ user_rating: n });
  };

  const doRemove = async () => {
    await api.del(`/library/${id}`);
    router.back();
  };

  const remove = () => {
    Alert.alert(
      t('detail.removeConfirmTitle'),
      t('detail.removeConfirmBody'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('detail.remove'), style: 'destructive', onPress: () => { doRemove(); } },
      ],
    );
  };

  if (loading || !entry) {
    return <View style={styles.center}><ActivityIndicator color={colors.brand} /></View>;
  }

  return (
    <View style={styles.root} testID="movie-detail-screen">
      <ScrollView contentContainerStyle={{ paddingBottom: 200 }}>
        <View style={styles.heroWrap}>
          {showTrailer && entry.trailer_key ? (
            <View style={StyleSheet.absoluteFillObject} testID="detail-trailer">
              <WebView
                style={{ flex: 1, backgroundColor: '#000' }}
                allowsInlineMediaPlayback
                mediaPlaybackRequiresUserAction={false}
                javaScriptEnabled
                source={{ uri: `https://www.youtube.com/embed/${entry.trailer_key}?autoplay=1&playsinline=1&modestbranding=1&rel=0` }}
              />
              <Pressable testID="detail-trailer-close" onPress={() => setShowTrailer(false)} style={[styles.backBtn, { top: insets.top + spacing.sm, right: spacing.md, left: undefined }]}>
                <Ionicons name="close" size={22} color={colors.onSurface} />
              </Pressable>
            </View>
          ) : (
            <>
              <Image source={{ uri: entry.backdrop_url || entry.poster_url || IMAGES.posterFallback }} style={styles.hero} contentFit="cover" />
              <LinearGradient
                colors={['rgba(11,13,16,0.2)', 'rgba(11,13,16,0.6)', '#0B0D10']}
                style={StyleSheet.absoluteFillObject}
                locations={[0, 0.5, 1]}
              />
              <Pressable testID="detail-back" onPress={() => router.back()} style={[styles.backBtn, { top: insets.top + spacing.sm }]}>
                <Ionicons name="chevron-back" size={24} color={colors.onSurface} />
              </Pressable>
              {entry.trailer_key ? (
                <Pressable testID="detail-play-trailer" onPress={() => setShowTrailer(true)} style={styles.playBtn}>
                  <Ionicons name="play" size={26} color={colors.onBrand} style={{ marginLeft: 3 }} />
                </Pressable>
              ) : null}
              <View style={styles.heroContent}>
                <Text style={styles.mediaBadge}>{t(`mediaType.${entry.media_type}`)} {entry.year ? `· ${entry.year}` : ''}</Text>
                <Text style={styles.heroTitle}>{entry.title}</Text>
                {entry.director ? <Text style={styles.heroDir}>{t('detail.directedBy', { name: entry.director })}</Text> : null}
                <View style={styles.metaChips}>
                  {entry.tmdb_rating != null ? (
                    <View style={styles.metaChip}>
                      <Ionicons name="star" size={12} color={colors.brand} />
                      <Text style={styles.metaChipText}>{entry.tmdb_rating.toFixed(1)}</Text>
                </View>
              ) : null}
              {entry.runtime ? (
                <View style={styles.metaChip}>
                  <Ionicons name="time-outline" size={12} color={colors.onSurfaceSecondary} />
                  <Text style={styles.metaChipText}>{t('detail.runtime', { n: entry.runtime })}</Text>
                </View>
              ) : null}
            </View>
          </View>
            </>
          )}
        </View>

        <View style={styles.body}>
          {entry.overview ? (
            <View style={styles.card}>
              <Text style={styles.cardLabel}>{t('detail.overview')}</Text>
              <Text style={styles.cardBody}>{entry.overview}</Text>
            </View>
          ) : null}

          {entry.cast.length > 0 && (
            <View style={styles.card}>
              <Text style={styles.cardLabel}>{t('detail.cast')}</Text>
              <Text style={styles.cardBody}>{entry.cast.join(' · ')}</Text>
            </View>
          )}

          {entry.genres.length > 0 && (
            <View style={styles.chipsRow}>
              {entry.genres.map((g) => (
                <View key={g} style={styles.genreChip}><Text style={styles.genreText}>{g}</Text></View>
              ))}
            </View>
          )}

          {entry.watch_providers && entry.watch_providers.length > 0 ? (
            <View style={styles.card} testID="detail-providers">
              <Text style={styles.cardLabel}>{t('detail.whereToWatch')}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.md }}>
                {entry.watch_providers.map((p, i) => (
                  <View key={`${p.name}-${i}`} style={styles.provider}>
                    {p.logo_url ? (
                      <Image source={{ uri: p.logo_url }} style={styles.providerLogo} contentFit="cover" />
                    ) : (
                      <View style={[styles.providerLogo, { alignItems: 'center', justifyContent: 'center' }]}>
                        <Ionicons name="tv-outline" size={20} color={colors.onSurfaceTertiary} />
                      </View>
                    )}
                    <Text style={styles.providerName} numberOfLines={1}>{p.name}</Text>
                    <Text style={styles.providerType}>{p.type}</Text>
                  </View>
                ))}
              </ScrollView>
            </View>
          ) : null}

          <View style={styles.card}>
            <Text style={styles.cardLabel}>{t('detail.watchStatus')}</Text>
            <View style={styles.statusRow}>
              {STATUSES.map((s) => {
                const active = entry.watch_status === s.key;
                return (
                  <Pressable
                    key={s.key}
                    testID={`status-${s.key}`}
                    onPress={() => setStatus(s.key)}
                    style={[styles.statusBtn, active && styles.statusBtnActive]}
                  >
                    <Ionicons name={s.icon} size={16} color={active ? colors.brand : colors.onSurfaceTertiary} />
                    <Text style={[styles.statusText, active && { color: colors.brand }]}>{t(s.labelKey)}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardLabel}>{t('detail.yourRating')}</Text>
            <View style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'center' }}>
              <TextInput
                testID="detail-rating-input"
                value={rating}
                onChangeText={setRating}
                onEndEditing={saveRating}
                keyboardType="decimal-pad"
                placeholder="—"
                placeholderTextColor={colors.onSurfaceTertiary}
                style={styles.ratingInput}
              />
              <Pressable testID="detail-rating-save" onPress={saveRating} style={styles.saveBtn}>
                <Text style={styles.saveBtnText}>{t('detail.save')}</Text>
              </Pressable>
            </View>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardLabel}>{t('detail.note')}</Text>
            <TextInput
              testID="detail-note-input"
              value={note}
              onChangeText={setNote}
              onEndEditing={saveNote}
              multiline
              placeholder={t('detail.notePlaceholder')}
              placeholderTextColor={colors.onSurfaceTertiary}
              style={styles.noteInput}
            />
            <Pressable testID="detail-note-save" onPress={saveNote} style={[styles.saveBtn, { alignSelf: 'flex-end' }]}>
              <Text style={styles.saveBtnText}>{t('detail.saveNote')}</Text>
            </Pressable>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardLabel}>{t('detail.addToLists')}</Text>
            {lists.length === 0 ? (
              <Text style={styles.listsEmpty}>{t('detail.noLists')}</Text>
            ) : (
              <View style={styles.listsWrap}>
                {lists.map((l) => (
                  <Pressable
                    key={l.collection_id}
                    testID={`detail-list-${l.collection_id}`}
                    onPress={() => toggleList(l.collection_id, l.contains)}
                    style={[styles.listChip, l.contains && styles.listChipActive]}
                  >
                    <Ionicons name={l.contains ? 'checkmark-circle' : 'add-circle-outline'} size={14} color={l.contains ? colors.brand : colors.onSurfaceTertiary} />
                    <Text style={[styles.listChipText, l.contains && { color: colors.brand }]}>{l.name}</Text>
                  </Pressable>
                ))}
              </View>
            )}
            <View style={styles.newListRow}>
              <TextInput
                testID="detail-new-list-input"
                value={newListName}
                onChangeText={setNewListName}
                placeholder={t('detail.newListPlaceholder')}
                placeholderTextColor={colors.onSurfaceTertiary}
                style={styles.newListInput}
                onSubmitEditing={createList}
              />
              <Pressable testID="detail-create-list" onPress={createList} disabled={creatingList} style={styles.saveBtn}>
                {creatingList ? <ActivityIndicator size="small" color={colors.onBrand} /> : <Text style={styles.saveBtnText}>{t('detail.create')}</Text>}
              </Pressable>
            </View>
          </View>

          <Pressable testID="detail-remove" onPress={remove} style={styles.remove}>
            <Ionicons name="trash-outline" size={16} color={colors.error} />
            <Text style={styles.removeText}>{t('detail.removeFromLibrary')}</Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  center: { flex: 1, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  heroWrap: { height: 420, width: '100%', backgroundColor: colors.surfaceTertiary },
  hero: { ...StyleSheet.absoluteFillObject },
  backBtn: { position: 'absolute', left: spacing.md, width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', zIndex: 5 },
  playBtn: { position: 'absolute', alignSelf: 'center', top: '38%', width: 64, height: 64, borderRadius: 32, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 10, elevation: 6 },
  provider: { width: 72, alignItems: 'center' },
  providerLogo: { width: 48, height: 48, borderRadius: radius.sm, backgroundColor: colors.surfaceTertiary, borderWidth: 1, borderColor: colors.border },
  providerName: { color: colors.onSurface, fontSize: 10, fontWeight: '600', marginTop: 4, textAlign: 'center' },
  providerType: { color: colors.onSurfaceTertiary, fontSize: 9, textTransform: 'capitalize' },
  heroContent: { position: 'absolute', bottom: spacing.lg, left: spacing.lg, right: spacing.lg },
  mediaBadge: { color: colors.brand, fontSize: 11, letterSpacing: 2, fontWeight: '700' },
  heroTitle: { color: colors.onSurface, fontSize: 32, fontWeight: '800', marginTop: spacing.xs, lineHeight: 36 },
  heroDir: { color: colors.onSurfaceSecondary, fontSize: 13, marginTop: spacing.xs },
  metaChips: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  metaChip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(31,35,42,0.8)', borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: 4 },
  metaChipText: { color: colors.onSurface, fontSize: 12, fontWeight: '700' },
  listsEmpty: { color: colors.onSurfaceTertiary, fontSize: 12, fontStyle: 'italic', marginBottom: spacing.sm },
  listsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.md },
  listChip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: spacing.md, paddingVertical: 7, borderRadius: radius.pill, backgroundColor: colors.surfaceTertiary, borderWidth: 1, borderColor: colors.border },
  listChipActive: { borderColor: colors.brand, backgroundColor: colors.brandTertiary },
  listChipText: { color: colors.onSurfaceSecondary, fontSize: 12, fontWeight: '600' },
  newListRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  newListInput: { flex: 1, backgroundColor: colors.surfaceTertiary, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.md, paddingVertical: 10, color: colors.onSurface, fontSize: 13 },
  body: { padding: spacing.lg, gap: spacing.md },
  card: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, padding: spacing.md, borderWidth: 1, borderColor: colors.border },
  cardLabel: { color: colors.onSurfaceTertiary, fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', marginBottom: spacing.sm },
  cardBody: { color: colors.onSurface, fontSize: 14, lineHeight: 20 },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  genreChip: { backgroundColor: colors.brandTertiary, paddingHorizontal: spacing.md, paddingVertical: 4, borderRadius: radius.pill },
  genreText: { color: colors.brand, fontSize: 11, fontWeight: '600' },
  statusRow: { flexDirection: 'row', gap: spacing.sm },
  statusBtn: { flex: 1, flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.sm, borderRadius: radius.sm, backgroundColor: colors.surfaceTertiary, borderWidth: 1, borderColor: colors.border },
  statusBtnActive: { borderColor: colors.brand, backgroundColor: colors.brandTertiary },
  statusText: { color: colors.onSurfaceSecondary, fontSize: 12, fontWeight: '600' },
  ratingInput: { flex: 1, backgroundColor: colors.surfaceTertiary, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, padding: spacing.md, color: colors.onSurface, fontSize: 15 },
  noteInput: { backgroundColor: colors.surfaceTertiary, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, padding: spacing.md, color: colors.onSurface, fontSize: 14, minHeight: 80, textAlignVertical: 'top', marginBottom: spacing.sm },
  saveBtn: { backgroundColor: colors.brand, paddingHorizontal: spacing.lg, paddingVertical: 10, borderRadius: radius.sm },
  saveBtnText: { color: colors.onBrand, fontWeight: '700', fontSize: 12 },
  remove: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center', justifyContent: 'center', padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.error, marginTop: spacing.md },
  removeText: { color: colors.error, fontWeight: '600', fontSize: 13 },
});
