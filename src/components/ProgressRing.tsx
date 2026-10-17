import { StyleSheet, View } from 'react-native';
import { AppText as Text } from './AppText';
import { colors } from '../config/constants';

export function ProgressRing({ time, caption = 'REMAINING' }: { time: string; caption?: string }) {
  return (
    <View style={styles.ring}>
      <View style={styles.inner}>
        <Text style={styles.time}>{time}</Text>
        <Text style={styles.caption}>{caption}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  ring: {
    width: 148,
    height: 148,
    borderRadius: 74,
    borderWidth: 8,
    borderColor: colors.green,
    borderRightColor: 'rgba(255,255,255,0.2)',
    borderBottomColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.green,
    shadowOpacity: 0.2,
    shadowRadius: 14,
    elevation: 4,
  },
  inner: { alignItems: 'center', gap: 4 },
  time: { color: '#FFFFFF', fontSize: 28, fontWeight: '700', letterSpacing: 0.5 },
  caption: { color: '#AEBBD0', fontSize: 9, fontWeight: '700', letterSpacing: 1.5 },
});
