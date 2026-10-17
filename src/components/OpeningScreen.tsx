import { useEffect, useState } from 'react';
import { Animated, Platform, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppText as Text } from './AppText';
import { colors } from '../config/constants';
import { SpaceBackdrop } from './SpaceScene';
import { usePreferences } from '../state/PreferenceProvider';

export function OpeningScreen() {
  const { preferences } = usePreferences();
  const [isVisible, setIsVisible] = useState(true);
  const [rotation] = useState(() => new Animated.Value(0));
  const [pulse] = useState(() => new Animated.Value(1));
  const [progress] = useState(() => new Animated.Value(0));
  const [screenOpacity] = useState(() => new Animated.Value(1));

  useEffect(() => {
    const useNativeDriver = Platform.OS !== 'web';
    if (preferences.reducedMotion) {
      rotation.setValue(0);
      pulse.setValue(1);
      progress.setValue(1);
      screenOpacity.setValue(0);
      return;
    }
    const orbitAnimation = Animated.loop(
      Animated.timing(rotation, {
        toValue: 1,
        duration: 18000,
        useNativeDriver,
      }),
    );
    const pulseAnimation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.07, duration: 1800, useNativeDriver }),
        Animated.timing(pulse, { toValue: 1, duration: 1800, useNativeDriver }),
      ]),
    );

    const progressAnimation = Animated.timing(progress, {
      toValue: 1,
      duration: 2700,
      useNativeDriver: false,
    });
    progressAnimation.start(({ finished }) => {
      if (!finished) return;
      Animated.timing(screenOpacity, {
        toValue: 0,
        duration: 250,
        useNativeDriver,
      }).start(({ finished: faded }) => {
        if (faded) setIsVisible(false);
      });
    });
    orbitAnimation.start();
    pulseAnimation.start();
    return () => {
      orbitAnimation.stop();
      pulseAnimation.stop();
      progressAnimation.stop();
      progress.stopAnimation();
      screenOpacity.stopAnimation();
    };
  }, [preferences.reducedMotion, progress, pulse, rotation, screenOpacity]);

  if (!isVisible) return null;

  const orbitRotation = rotation.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  return (
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.overlay, { opacity: screenOpacity }]}>
      <SafeAreaView style={styles.safe}>
        <SpaceBackdrop />
        <View style={styles.content}>
        <View style={styles.status}>
          <View style={styles.statusDot} />
          <Text style={styles.statusText}>FLEXICAL · MISSION CONTROL</Text>
        </View>

        <View style={styles.hero}>
          <View style={styles.planetSystem}>
            <Animated.View style={[styles.orbit, { transform: [{ rotate: orbitRotation }] }]}>
              <View style={styles.satellite} />
            </Animated.View>
            <Animated.View style={[styles.planetGlow, { transform: [{ scale: pulse }] }]}>
              <View style={styles.planet}>
                <Text style={styles.planetGlyph}>F</Text>
              </View>
            </Animated.View>
            <View style={styles.orbitInner} />
          </View>
          <Text style={styles.title}>Your time,{"\n"}in a new orbit.</Text>
          <Text style={styles.subtitle}>
            A calmer control center for your day.{'\n'}Your schedule. Your pace. All on board.
          </Text>
        </View>

        <View style={styles.footer}>
          <View style={styles.readyRow}>
            <View style={styles.readyLine} />
            <Text style={styles.readyText}>SYSTEMS READY · SYNCING YOUR SCHEDULE</Text>
            <View style={styles.readyLine} />
          </View>
          <View
            accessibilityRole="progressbar"
            accessibilityLabel="Preparing your schedule"
            style={styles.progressTrack}
          >
            <Animated.View
              style={[
                styles.progressFill,
                {
                  width: progress.interpolate({
                    inputRange: [0, 1],
                    outputRange: ['0%', '100%'],
                  }),
                },
              ]}
            />
          </View>
          <Text style={styles.footerHint}>Preparing your mission control…</Text>
        </View>
        </View>
      </SafeAreaView>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: { zIndex: 1 },
  safe: { flex: 1, backgroundColor: colors.background },
  content: { flex: 1, justifyContent: 'space-between', paddingHorizontal: 27, paddingTop: 18, paddingBottom: 28 },
  status: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  statusDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.green },
  statusText: { color: colors.muted, fontSize: 9, fontWeight: '800', letterSpacing: 1.5 },
  hero: { alignItems: 'center', marginTop: 6 },
  planetSystem: { width: 214, height: 214, alignItems: 'center', justifyContent: 'center', marginBottom: 24 },
  orbit: {
    position: 'absolute',
    width: 200,
    height: 88,
    borderRadius: 100,
    borderWidth: 1,
    borderColor: 'rgba(121,169,255,0.45)',
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  satellite: {
    width: 11,
    height: 11,
    borderRadius: 6,
    backgroundColor: colors.blue,
    marginRight: 12,
    shadowColor: colors.blue,
    shadowOpacity: 0.9,
    shadowRadius: 9,
  },
  orbitInner: {
    position: 'absolute',
    width: 145,
    height: 145,
    borderRadius: 73,
    borderWidth: 1,
    borderColor: 'rgba(91,224,194,0.13)',
  },
  planetGlow: {
    width: 110,
    height: 110,
    borderRadius: 55,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(91,224,194,0.08)',
    shadowColor: colors.green,
    shadowOpacity: 0.28,
    shadowRadius: 30,
    elevation: 8,
  },
  planet: {
    width: 82,
    height: 82,
    borderRadius: 41,
    backgroundColor: '#183D4B',
    borderWidth: 1,
    borderColor: 'rgba(91,224,194,0.65)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  planetGlyph: { color: colors.green, fontSize: 35, fontWeight: '900', textShadowColor: colors.green, textShadowRadius: 15 },
  title: { color: colors.ink, fontSize: 39, lineHeight: 45, fontWeight: '900', letterSpacing: -1.5, textAlign: 'center' },
  subtitle: { color: colors.muted, fontSize: 13, lineHeight: 21, textAlign: 'center', marginTop: 14 },
  footer: { gap: 16 },
  readyRow: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  readyLine: { flex: 1, height: 1, backgroundColor: colors.line },
  readyText: { color: '#7187A3', fontSize: 7, fontWeight: '800', letterSpacing: 0.8 },
  progressTrack: { width: '100%', height: 4, backgroundColor: colors.line, borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: colors.green, borderRadius: 3 },
  footerHint: { color: '#7486A0', fontSize: 10, textAlign: 'center' },
});
