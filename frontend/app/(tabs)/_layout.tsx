import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { View, StyleSheet, Platform } from 'react-native';
import { colors } from '@/src/theme';
import { useT } from '@/src/i18n';

export default function TabsLayout() {
  const t = useT();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.brand,
        tabBarInactiveTintColor: colors.onSurfaceTertiary,
        tabBarStyle: {
          position: 'absolute',
          borderTopColor: colors.border,
          backgroundColor: Platform.OS === 'android' ? 'rgba(11,13,16,0.95)' : 'transparent',
          borderTopWidth: 0.5,
          height: 82,
          paddingTop: 8,
          paddingBottom: 24,
          elevation: 0,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600', letterSpacing: 0.3 },
        tabBarBackground: () =>
          Platform.OS === 'ios' ? (
            <BlurView intensity={60} tint="dark" style={StyleSheet.absoluteFill} />
          ) : (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(11,13,16,0.95)' }]} />
          ),
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t('tabs.home'),
          tabBarTestID: 'tab-home',
          tabBarIcon: ({ color, size }) => <Ionicons name="film-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="library"
        options={{
          title: t('tabs.library'),
          tabBarTestID: 'tab-library',
          tabBarIcon: ({ color, size }) => <Ionicons name="albums-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="lists"
        options={{
          title: t('tabs.lists'),
          tabBarTestID: 'tab-lists',
          tabBarIcon: ({ color, size }) => <Ionicons name="list-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="search"
        options={{
          title: t('tabs.search'),
          tabBarTestID: 'tab-search',
          tabBarIcon: ({ color, size }) => <Ionicons name="sparkles-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: t('tabs.profile'),
          tabBarTestID: 'tab-profile',
          tabBarIcon: ({ color, size }) => <Ionicons name="person-circle-outline" size={size} color={color} />,
        }}
      />
    </Tabs>
  );
}
