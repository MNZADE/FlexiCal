import { useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { AppText as Text } from './AppText';
import { colors } from '../config/constants';

type Props = {
  visible: boolean;
  title: string;
  selectedDate: string;
  minimumDate?: string;
  onSelect: (dateKey: string) => void;
  onClose: () => void;
};

const weekdays = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

const keyForDate = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

function calendarDates(month: Date) {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const mondayOffset = (first.getDay() + 6) % 7;
  const gridStart = new Date(first);
  gridStart.setDate(first.getDate() - mondayOffset);
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(gridStart);
    date.setDate(gridStart.getDate() + index);
    return { date, key: keyForDate(date), inMonth: date.getMonth() === month.getMonth() };
  });
}

export function DatePickerModal({ visible, title, selectedDate, minimumDate, onSelect, onClose }: Props) {
  const [visibleMonth, setVisibleMonth] = useState(() => {
    const [year, month, day] = selectedDate.split('-').map(Number);
    return new Date(year, month - 1, day);
  });
  const dates = useMemo(() => calendarDates(visibleMonth), [visibleMonth]);
  const monthTitle = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' }).format(visibleMonth);

  const changeMonth = (amount: number) => {
    setVisibleMonth((month) => new Date(month.getFullYear(), month.getMonth() + amount, 1));
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.modal} onPress={(event) => event.stopPropagation()}>
          <View style={styles.handle} />
          <Text style={styles.eyebrow}>CHOOSE A DATE</Text>
          <Text style={styles.title}>{title}</Text>
          <View style={styles.monthHeader}>
            <Text style={styles.monthTitle}>{monthTitle}</Text>
            <View style={styles.arrows}>
              <Pressable accessibilityLabel="Previous month" onPress={() => changeMonth(-1)} style={styles.arrowButton}>
                <Text style={styles.arrow}>‹</Text>
              </Pressable>
              <Pressable accessibilityLabel="Next month" onPress={() => changeMonth(1)} style={styles.arrowButton}>
                <Text style={styles.arrow}>›</Text>
              </Pressable>
            </View>
          </View>
          <View style={styles.grid}>
            {weekdays.map((day, index) => (
              <Text key={`${day}-${index}`} style={styles.weekday}>{day}</Text>
            ))}
            {dates.map(({ date, key, inMonth }) => {
              const disabled = Boolean(minimumDate && key < minimumDate);
              const selected = key === selectedDate;
              return (
                <Pressable
                  key={key}
                  accessibilityRole="button"
                  accessibilityState={{ selected, disabled }}
                  disabled={disabled}
                  onPress={() => {
                    onSelect(key);
                    onClose();
                  }}
                  style={[
                    styles.dateCell,
                    selected && styles.selectedCell,
                    !inMonth && styles.outsideCell,
                  ]}
                >
                  <Text
                    style={[
                      styles.dateText,
                      selected && styles.selectedText,
                      !inMonth && styles.outsideText,
                      disabled && styles.disabledText,
                    ]}
                  >
                    {date.getDate()}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <Pressable
            onPress={() => {
              const now = new Date();
              setVisibleMonth(new Date(now.getFullYear(), now.getMonth(), 1));
              const today = keyForDate(now);
              if (!minimumDate || today >= minimumDate) {
                onSelect(today);
                onClose();
              }
            }}
            style={styles.todayButton}
          >
            <Text style={styles.todayText}>Jump to today</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(3,8,18,0.78)', justifyContent: 'center', padding: 22 },
  modal: { backgroundColor: colors.surface, borderRadius: 26, padding: 21 },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: '#D8DEE6', alignSelf: 'center', marginBottom: 17 },
  eyebrow: { color: colors.green, fontSize: 9, fontWeight: '800', letterSpacing: 1.4 },
  title: { color: colors.ink, fontSize: 21, fontWeight: '800', marginTop: 5 },
  monthHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 22, marginBottom: 12 },
  monthTitle: { color: colors.ink, fontSize: 14, fontWeight: '800' },
  arrows: { flexDirection: 'row', gap: 8 },
  arrowButton: { width: 34, height: 34, borderRadius: 12, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' },
  arrow: { color: colors.ink, fontSize: 20, marginTop: -2 },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  weekday: { width: `${100 / 7}%`, textAlign: 'center', color: colors.muted, fontSize: 9, fontWeight: '800', paddingVertical: 9 },
  dateCell: { width: `${100 / 7}%`, aspectRatio: 1, alignItems: 'center', justifyContent: 'center' },
  selectedCell: { backgroundColor: colors.green, borderRadius: 22 },
  outsideCell: { opacity: 0.43 },
  dateText: { color: colors.ink, fontSize: 12, fontWeight: '600' },
  selectedText: { color: '#FFFFFF', fontWeight: '800' },
  outsideText: { color: colors.muted },
  disabledText: { color: '#C6CDD6' },
  todayButton: { marginTop: 12, alignItems: 'center', paddingVertical: 10 },
  todayText: { color: colors.green, fontSize: 11, fontWeight: '800' },
});
