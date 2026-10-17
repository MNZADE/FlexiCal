import { Pressable, StyleSheet, type ViewStyle } from 'react-native';
import { AppText as Text } from './AppText';
import { colors } from '../config/constants';

type Props = {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger' | 'quiet';
  style?: ViewStyle;
};

export function CustomButton({ label, onPress, variant = 'primary', style }: Props) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        styles[variant],
        pressed && styles.pressed,
        style,
      ]}
    >
      <Text style={[styles.label, variant === 'secondary' && styles.secondaryLabel]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 48,
    paddingHorizontal: 18,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primary: { backgroundColor: colors.green },
  secondary: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line },
  danger: { backgroundColor: colors.red },
  quiet: { backgroundColor: 'rgba(255,255,255,0.12)' },
  label: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  secondaryLabel: { color: colors.ink },
  pressed: { opacity: 0.78 },
});
