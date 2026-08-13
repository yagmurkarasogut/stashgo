import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, TextInput } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api, LibraryEntry } from '@/src/api/client';
import { colors, spacing, radius, IMAGES } from '@/src/theme';

const STATUSES: { key: LibraryEntry['watch_status']; label: string; icon: any }[] = [
  { key: 'want_to_watch', label: 'Want', icon: 'bookmark-outline' },
  { key: 'watching', label: 'Watching', icon: 'play-circle-outline' },
  { key: 'watched', label: 'Watched', icon: 'checkmark-circle-outline' },
];

export default function MovieDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [entry, setEntry] = useState<LibraryEntry | null>(null);
  const [loading, setLoading] = useState(true);
  const [note, setNote] = useState('');
  const [rating, setRating] = useState<string>('');

  const load = useCallback(async () => {
    try {
      const e = await api.get<LibraryEntry>(`/library/${id}`);
      setEntry(e);
      setNote(e.user_note);
      setRating(e.user_rating != null ? String(e.user_rating) : '');
    } finally { setLoading(false); }
  }, [id]);

  useEffect(() => { load(); }, [load]);

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

  const remove = async () => {
    await api.del(`/library/${id}`);
    router.back();
  };

  if (loading || !entry) {
    return <View style={styles.center}><ActivityIndicator color={colors.brand} /></View>;
  }

  return (
    <View style={styles.root} testID="movie-detail-screen">
      <ScrollView contentContainerStyle={{ paddingBottom: 200 }}>
        <View style={styles.heroWrap}>
          <Image source={{ uri: entry.backdrop_url || entry.poster_url || IMAGES.posterFallback }} style={styles.hero} contentFit="cover" />
          <LinearGradient
            colors={['rgba(11,13,16,0.2)', 'rgba(11,13,16,0.6)', '#0B0D10']}
            style={StyleSheet.absoluteFillObject}
            locations={[0, 0.5, 1]}
          />
          <Pressable testID="detail-back" onPress={() => router.back()} style={[styles.backBtn, { top: insets.top + spacing.sm }]}>
            <Ionicons name="chevron-back" size={24} color={colors.onSurface} />
          </Pressable>
          <View style={styles.heroContent}>
            <Text style={styles.mediaBadge}>{entry.media_type.toUpperCase()} {entry.year ? `· ${entry.year}` : ''}</Text>
            <Text style={styles.heroTitle}>{entry.title}</Text>
            {entry.director ? <Text style={styles.heroDir}>Directed by {entry.director}</Text> : null}
          </View>
        </View>

        <View style={styles.body}>
          {entry.overview ? (
            <View style={styles.card}>
              <Text style={styles.cardLabel}>Overview</Text>
              <Text style={styles.cardBody}>{entry.overview}</Text>
            </View>
          ) : null}

          {entry.cast.length > 0 && (
            <View style={styles.card}>
              <Text style={styles.cardLabel}>Cast</Text>
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

          <View style={styles.card}>
            <Text style={styles.cardLabel}>Watch status</Text>
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
                    <Text style={[styles.statusText, active && { color: colors.brand }]}>{s.label}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardLabel}>Your rating (0–10)</Text>
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
                <Text style={styles.saveBtnText}>Save</Text>
              </Pressable>
            </View>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardLabel}>Note</Text>
            <TextInput
              testID="detail-note-input"
              value={note}
              onChangeText={setNote}
              onEndEditing={saveNote}
              multiline
              placeholder="A quick thought…"
              placeholderTextColor={colors.onSurfaceTertiary}
              style={styles.noteInput}
            />
            <Pressable testID="detail-note-save" onPress={saveNote} style={[styles.saveBtn, { alignSelf: 'flex-end' }]}>
              <Text style={styles.saveBtnText}>Save note</Text>
            </Pressable>
          </View>

          <Pressable testID="detail-remove" onPress={remove} style={styles.remove}>
            <Ionicons name="trash-outline" size={16} color={colors.error} />
            <Text style={styles.removeText}>Remove from library</Text>
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
  backBtn: { position: 'absolute', left: spacing.md, width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' },
  heroContent: { position: 'absolute', bottom: spacing.lg, left: spacing.lg, right: spacing.lg },
  mediaBadge: { color: colors.brand, fontSize: 11, letterSpacing: 2, fontWeight: '700' },
  heroTitle: { color: colors.onSurface, fontSize: 32, fontWeight: '800', marginTop: spacing.xs, lineHeight: 36 },
  heroDir: { color: colors.onSurfaceSecondary, fontSize: 13, marginTop: spacing.xs },
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
