import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { AppText as Text } from '../../components/AppText';
import { colors } from '../../config/constants';
import { CustomButton } from '../../components/CustomButton';

type Props = {
  visible: boolean;
  onClose: () => void;
  onComplete: () => void;
  onExtraTime: (minutes: number) => void;
  onReschedule: (mode: 'end-of-day' | 'gap') => void;
};

export function ActionHUDModal({ visible, onClose, onComplete, onExtraTime, onReschedule }: Props) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(event) => event.stopPropagation()}>
          <View style={styles.handle} />
          <Text style={styles.eyebrow}>TIME IS UP</Text>
          <Text style={styles.title}>What would you like to do?</Text>
          <Text style={styles.subtitle}>Keep your day moving, one decision at a time.</Text>

          <CustomButton label="✓   Complete task" onPress={onComplete} />
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>NEED A LITTLE LONGER?</Text>
            <View style={styles.row}>
              <CustomButton
                label="+15 min"
                variant="secondary"
                onPress={() => onExtraTime(15)}
                style={styles.half}
              />
              <CustomButton
                label="+30 min"
                variant="secondary"
                onPress={() => onExtraTime(30)}
                style={styles.half}
              />
            </View>
          </View>
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>MOVE THIS TASK</Text>
            <View style={styles.row}>
              <CustomButton
                label="End of day"
                variant="secondary"
                onPress={() => onReschedule('end-of-day')}
                style={styles.half}
              />
              <CustomButton
                label="Find a gap"
                variant="secondary"
                onPress={() => onReschedule('gap')}
                style={styles.half}
              />
            </View>
          </View>
          <Pressable onPress={onClose} hitSlop={12}>
            <Text style={styles.cancel}>Not now</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(3,8,18,0.78)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.background,
    padding: 24,
    paddingBottom: 36,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    gap: 12,
  },
  handle: { width: 40, height: 4, borderRadius: 3, backgroundColor: '#D6DCE4', alignSelf: 'center', marginBottom: 8 },
  eyebrow: { color: colors.green, fontSize: 10, letterSpacing: 1.5, fontWeight: '800' },
  title: { color: colors.ink, fontSize: 22, fontWeight: '800' },
  subtitle: { color: colors.muted, fontSize: 13, marginBottom: 5 },
  section: { gap: 8, marginTop: 5 },
  sectionTitle: { color: colors.muted, fontSize: 9, fontWeight: '800', letterSpacing: 1.2 },
  row: { flexDirection: 'row', gap: 9 },
  half: { flex: 1 },
  cancel: { color: colors.muted, textAlign: 'center', fontSize: 13, fontWeight: '600', paddingTop: 4 },
});
