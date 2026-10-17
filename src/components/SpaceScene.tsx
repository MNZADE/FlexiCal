import { useCallback, useState, type ReactNode } from 'react';
import { useFocusEffect } from 'expo-router';
import { Animated, Platform, StyleSheet, View, type ViewStyle } from 'react-native';
import { usePreferences } from '../state/PreferenceProvider';

const stars = [
  { left: '9%', top: '12%', size: 2 },
  { left: '22%', top: '31%', size: 1 },
  { left: '82%', top: '17%', size: 2 },
  { left: '68%', top: '39%', size: 1 },
  { left: '92%', top: '48%', size: 2 },
  { left: '14%', top: '62%', size: 1 },
  { left: '53%', top: '73%', size: 2 },
  { left: '78%', top: '86%', size: 1 },
  { left: '35%', top: '91%', size: 2 },
] as const;

export function SpaceBackdrop() {
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.backdrop]}>
      <View style={styles.nebulaTop} />
      <View style={styles.nebulaBottom} />
      {stars.map((star, index) => (
        <View
          key={index}
          style={[
            styles.star,
            { left: star.left, top: star.top, width: star.size, height: star.size },
          ]}
        />
      ))}
      <View style={styles.orbit} />
    </View>
  );
}

export function ScreenTransition({ children }: { children: ReactNode }) {
  const { preferences } = usePreferences();
  const [opacity] = useState(() => new Animated.Value(0));
  const [translateY] = useState(() => new Animated.Value(10));

  useFocusEffect(
    useCallback(() => {
      if (preferences.reducedMotion) {
        opacity.setValue(1);
        translateY.setValue(0);
        return;
      }
      opacity.setValue(0);
      translateY.setValue(10);
      const animation = Animated.parallel([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 280,
          useNativeDriver: Platform.OS !== 'web',
        }),
        Animated.timing(translateY, {
          toValue: 0,
          duration: 320,
          useNativeDriver: Platform.OS !== 'web',
        }),
      ]);
      animation.start();
      return () => animation.stop();
    }, [opacity, preferences.reducedMotion, translateY]),
  );

  return (
    <Animated.View style={[styles.transition, { opacity, transform: [{ translateY }] }]}>
      {children}
    </Animated.View>
  );
}

export function PulseDot({ color, size = 7, style }: { color: string; size?: number; style?: ViewStyle }) {
  const { preferences } = usePreferences();
  const [pulse] = useState(() => new Animated.Value(1));

  useFocusEffect(
    useCallback(() => {
      if (preferences.reducedMotion) {
        pulse.setValue(1);
        return;
      }
      const animation = Animated.loop(
        Animated.sequence([
          Animated.timing(pulse, {
            toValue: 1.45,
            duration: 850,
            useNativeDriver: Platform.OS !== 'web',
          }),
          Animated.timing(pulse, {
            toValue: 1,
            duration: 850,
            useNativeDriver: Platform.OS !== 'web',
          }),
        ]),
      );
      animation.start();
      return () => animation.stop();
    }, [preferences.reducedMotion, pulse]),
  );

  return (
    <Animated.View
      style={[
        styles.pulseDot,
        { width: size, height: size, backgroundColor: color, transform: [{ scale: pulse }] },
        style,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  backdrop: { overflow: 'hidden' },
  transition: { flex: 1 },
  pulseDot: { borderRadius: 10 },
  nebulaTop: {
    position: 'absolute',
    top: -130,
    right: -100,
    width: 300,
    height: 300,
    borderRadius: 150,
    backgroundColor: '#174D63',
    opacity: 0.12,
  },
  nebulaBottom: {
    position: 'absolute',
    bottom: -170,
    left: -140,
    width: 340,
    height: 340,
    borderRadius: 170,
    backgroundColor: '#453675',
    opacity: 0.1,
  },
  star: {
    position: 'absolute',
    borderRadius: 2,
    backgroundColor: '#CBEAFF',
    opacity: 0.5,
  },
  orbit: {
    position: 'absolute',
    top: 135,
    right: -92,
    width: 190,
    height: 190,
    borderWidth: 1,
    borderColor: 'rgba(91,224,194,0.08)',
    borderRadius: 95,
  },
});
