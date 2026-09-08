import React from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useI18n } from '@/src/i18n';
import { colors, spacing } from '@/src/theme';

// Content-managed legal text. This is a plain-language summary of how Trace works,
// not legally reviewed advice. Replace with counsel-reviewed text before public launch.
const CONTENT: Record<'terms' | 'privacy', Record<'en' | 'tr', { title: string; body: string[] }>> = {
  terms: {
    en: {
      title: 'Terms of Service',
      body: [
        'Welcome to Stash Go. By creating an account and using the app you agree to these terms.',
        '1. Your account — You are responsible for keeping your login credentials secure. You may delete your account at any time from Settings.',
        '2. Acceptable use — Stash Go helps you identify and organize movies and TV shows you discover. Do not use the app for unlawful purposes or to upload content you do not have the right to share.',
        '3. Content — Movie and TV metadata is provided by TMDB. Stash Go is not endorsed or certified by TMDB.',
        '4. AI analysis — Titles are detected using automated AI and may occasionally be inaccurate. Results are provided on a best-effort basis.',
        '5. Availability — The service is provided "as is" without warranties. We may update or discontinue features.',
        '6. Changes — We may update these terms; continued use means you accept the changes.',
        '7. Provider & contact — [PLACEHOLDER: legal company/owner name, address and contact email to be provided].',
        'Effective date: [PLACEHOLDER]. This document is a plain-language summary and is not legal advice.',
      ],
    },
    tr: {
      title: 'Kullanım Koşulları',
      body: [
        "Stash Go'ya hoş geldiniz. Bir hesap oluşturup uygulamayı kullanarak bu koşulları kabul etmiş olursunuz.",
        '1. Hesabınız — Giriş bilgilerinizi güvende tutmaktan siz sorumlusunuz. Hesabınızı istediğiniz zaman Ayarlar bölümünden silebilirsiniz.',
        '2. Kabul edilebilir kullanım — Stash Go, karşılaştığınız film ve dizileri tanımlamanıza ve düzenlemenize yardımcı olur. Uygulamayı yasa dışı amaçlarla veya paylaşma hakkına sahip olmadığınız içerikleri yüklemek için kullanmayın.',
        '3. İçerik — Film ve dizi meta verileri TMDB tarafından sağlanır. Stash Go, TMDB tarafından onaylanmış veya sertifikalandırılmış değildir.',
        '4. Yapay zekâ analizi — Başlıklar otomatik yapay zekâ ile tespit edilir ve zaman zaman hatalı olabilir. Sonuçlar en iyi çaba esasına göre sunulur.',
        '5. Erişilebilirlik — Hizmet, herhangi bir garanti olmaksızın "olduğu gibi" sunulur. Özellikleri güncelleyebilir veya durdurabiliriz.',
        '6. Değişiklikler — Bu koşulları güncelleyebiliriz; kullanmaya devam etmeniz değişiklikleri kabul ettiğiniz anlamına gelir.',
        'Bu belge sade dille hazırlanmış bir özettir ve hukuki tavsiye niteliği taşımaz.',
      ],
    },
  },
  privacy: {
    en: {
      title: 'Privacy Policy & KVKK',
      body: [
        'This policy explains what data Stash Go processes and why.',
        '1. Data we store — Your email, an optional display name, and the movies/shows, lists and notes you save. Passwords are stored only as a secure one-way hash.',
        '2. How we use it — To provide the core features: authentication, your personal library, lists and semantic search.',
        '3. Third parties — Movie metadata comes from TMDB. AI analysis of the content you submit is processed by our AI provider. Emails (such as password reset codes) are delivered by our email provider.',
        '4. Account & data deletion — Deleting your account permanently removes your library, lists and personal data from Stash Go. This action cannot be undone.',
        '5. Your rights (KVKK/GDPR) — You may access, correct or delete your personal data. Account deletion in Settings fulfills your right to erasure.',
        '6. Contact — For privacy requests, contact the app owner through the store listing.',
        'This document is a plain-language summary and is not legal advice.',
      ],
    },
    tr: {
      title: 'Gizlilik Politikası ve KVKK',
      body: [
        "Bu politika, Stash Go'nun hangi verileri neden işlediğini açıklar.",
        '1. Sakladığımız veriler — E-posta adresiniz, isteğe bağlı görünen adınız ve kaydettiğiniz film/diziler, listeler ve notlar. Şifreler yalnızca güvenli, geri döndürülemez bir özet (hash) olarak saklanır.',
        '2. Verileri nasıl kullanırız — Temel özellikleri sağlamak için: kimlik doğrulama, kişisel kütüphaneniz, listeleriniz ve akıllı arama.',
        '3. Üçüncü taraflar — Film meta verileri TMDB tarafından sağlanır. Gönderdiğiniz içeriğin yapay zekâ analizi, yapay zekâ sağlayıcımız tarafından işlenir. E-postalar (örneğin şifre sıfırlama kodları) e-posta sağlayıcımız tarafından iletilir.',
        '4. Hesap ve veri silme — Hesabınızı silmek, kütüphanenizi, listelerinizi ve kişisel verilerinizi Stash Go üzerinden kalıcı olarak kaldırır. Bu işlem geri alınamaz.',
        '5. Haklarınız (KVKK/GDPR) — Kişisel verilerinize erişebilir, bunları düzeltebilir veya silebilirsiniz. Ayarlar bölümündeki hesap silme, silinme (unutulma) hakkınızı yerine getirir.',
        '6. İletişim — Gizlilikle ilgili talepleriniz için uygulama sahibine mağaza sayfası üzerinden ulaşabilirsiniz.',
        'Bu belge sade dille hazırlanmış bir özettir ve hukuki tavsiye niteliği taşımaz.',
      ],
    },
  },
};

export default function LegalDoc() {
  const { doc } = useLocalSearchParams<{ doc: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { lang } = useI18n();
  const key = (doc === 'privacy' ? 'privacy' : 'terms') as 'terms' | 'privacy';
  const data = CONTENT[key][lang];

  return (
    <View style={styles.root} testID="legal-screen">
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable testID="legal-back" onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="chevron-back" size={26} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.title} numberOfLines={1}>{data.title}</Text>
        <View style={{ width: 26 }} />
      </View>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + 40, gap: spacing.md }}>
        {data.body.map((p, i) => (
          <Text key={i} style={styles.para}>{p}</Text>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingBottom: spacing.md, borderBottomColor: colors.border, borderBottomWidth: 0.5 },
  title: { color: colors.onSurface, fontSize: 18, fontWeight: '700', flex: 1, textAlign: 'center' },
  para: { color: colors.onSurfaceSecondary, fontSize: 14, lineHeight: 21 },
});
