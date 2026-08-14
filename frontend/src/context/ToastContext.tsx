import React, { createContext, useContext, useCallback, useRef, useState } from 'react';
import { StyleSheet, Text, View, Animated, Easing } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, spacing, radius } from '@/src/theme';

type ToastKind = 'success' | 'error' | 'info';
type ToastCtx = { show: (message: string, kind?: ToastKind) => void };

const Ctx = createContext<ToastCtx | null>(null);

export function useToast() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useToast outside ToastProvider');
  return c;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  const [msg, setMsg] = useState('');
  const [kind, setKind] = useState<ToastKind>('success');
  const [visible, setVisible] = useState(false);
  const anim = useRef(new Animated.Value(0)).current;
  const timer = useRef<any>(null);

  const show = useCallback((message: string, k: ToastKind = 'success') => {
    setMsg(message);
    setKind(k);
    setVisible(true);
    if (timer.current) clearTimeout(timer.current);
    Animated.timing(anim, { toValue: 1, duration: 260, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    timer.current = setTimeout(() => {
      Animated.timing(anim, { toValue: 0, duration: 220, useNativeDriver: true }).start(() => setVisible(false));
    }, 2800);
  }, [anim]);

  const icon = kind === 'success' ? 'checkmark-circle' : kind === 'error' ? 'alert-circle' : 'information-circle';
  const accent = kind === 'success' ? colors.success : kind === 'error' ? colors.error : colors.brand;

  return (
    <Ctx.Provider value={{ show }}>
      {children}
      {visible ? (
        <Animated.View
          pointerEvents="none"
          testID="app-toast"
          style={[
            styles.wrap,
            { top: insets.top + spacing.sm, opacity: anim, transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [-20, 0] }) }] },
          ]}
        >
          <View style={[styles.toast, { borderColor: accent }]}>
            <Ionicons name={icon} size={18} color={accent} />
            <Text style={styles.text} numberOfLines={2}>{msg}</Text>
          </View>
        </Animated.View>
      ) : null}
    </Ctx.Provider>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: spacing.lg, right: spacing.lg, zIndex: 9999, alignItems: 'center' },
  toast: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: 'rgba(22,25,30,0.98)', borderRadius: radius.md, borderWidth: 1,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md, maxWidth: 520,
    shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 8,
  },
  text: { color: colors.onSurface, fontSize: 13, fontWeight: '600', flexShrink: 1 },
});
