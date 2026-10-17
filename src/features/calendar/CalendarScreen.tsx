import { useEffect, useMemo, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppText as Text } from '../../components/AppText';
import { useSQLiteContext } from 'expo-sqlite';
import { colors } from '../../config/constants';
import { loadMonthTasks, toDateKey, type Task } from '../../config/database';
import { useTasks } from '../../state/TaskProvider';
import { formatDuration, formatMinute } from '../../utils/time';
import { PulseDot, SpaceBackdrop, ScreenTransition } from '../../components/SpaceScene';

const weekdays = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

function dateFromKey(dateKey: string) {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function formatTimeInput(minute: number) {
  return `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
}

function parseTimeInput(value: string) {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value.trim());
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

function monthGrid(month: Date) {
  const firstDay = new Date(month.getFullYear(), month.getMonth(), 1);
  const mondayOffset = (firstDay.getDay() + 6) % 7;
  const firstCell = new Date(firstDay);
  firstCell.setDate(firstDay.getDate() - mondayOffset);
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(firstCell);
    date.setDate(firstCell.getDate() + index);
    return { date, key: toDateKey(date), inMonth: date.getMonth() === month.getMonth() };
  });
}

export function CalendarScreen() {
  const database = useSQLiteContext();
  const { tasks, selectedDate, setSelectedDate, moveBy, setTime, remove, addTask } = useTasks();
  const [visibleMonth, setVisibleMonth] = useState(() => {
    const selected = dateFromKey(selectedDate);
    return new Date(selected.getFullYear(), selected.getMonth(), 1);
  });
  const [monthTasks, setMonthTasks] = useState<Task[]>([]);
  const [isLoadingMonth, setIsLoadingMonth] = useState(true);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [deletingTask, setDeletingTask] = useState<Task | null>(null);
  const [startTimeInput, setStartTimeInput] = useState('');
  const [endTimeInput, setEndTimeInput] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const dates = useMemo(() => monthGrid(visibleMonth), [visibleMonth]);
  const monthLabel = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' }).format(visibleMonth);
  const selectedDateObject = dateFromKey(selectedDate);
  const selectedIsToday = selectedDate === toDateKey(new Date());
  const selectedLabel = selectedIsToday
    ? 'Today'
    : new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric' }).format(selectedDateObject);
  const taskCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const task of monthTasks) counts.set(task.dateKey, (counts.get(task.dateKey) ?? 0) + 1);
    return counts;
  }, [monthTasks]);

  useEffect(() => {
    let isCurrent = true;
    const firstDay = toDateKey(visibleMonth);
    const dayAfterLast = toDateKey(new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + 1, 1));
    void loadMonthTasks(database, firstDay, dayAfterLast)
      .then((loadedTasks) => {
        if (!isCurrent) return;
        setMonthTasks(loadedTasks);
        setIsLoadingMonth(false);
      })
      .catch(() => {
        if (!isCurrent) return;
        setIsLoadingMonth(false);
        Alert.alert('Calendar could not be loaded', 'Check the local database and try again.');
      });
    return () => {
      isCurrent = false;
    };
  }, [database, tasks, visibleMonth]);

  const selectedTasks = tasks
    .filter((task) => task.dateKey === selectedDate)
    .sort((left, right) => left.startMinute - right.startMinute);
  const changeMonth = (amount: number) => {
    const nextMonth = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + amount, 1);
    setIsLoadingMonth(true);
    setVisibleMonth(nextMonth);
    setSelectedDate(toDateKey(nextMonth));
  };
  const goToToday = () => {
    const today = new Date();
    setIsLoadingMonth(true);
    setVisibleMonth(new Date(today.getFullYear(), today.getMonth(), 1));
    setSelectedDate(toDateKey(today));
  };
  const shiftTask = (task: Task, minutes: number) => {
    void moveBy(task, minutes).then((moved) => {
      if (!moved) {
        Alert.alert('That time is unavailable', 'The task would overlap another block or move outside the day.');
      }
    }).catch((error: unknown) => {
      Alert.alert('Could not move task', error instanceof Error ? error.message : 'Try again.');
    });
  };
  const openTimeEditor = (task: Task) => {
    setActionError(null);
    setStartTimeInput(formatTimeInput(task.startMinute));
    setEndTimeInput(formatTimeInput(task.endMinute));
    setEditingTask(task);
  };
  const saveTaskTime = async () => {
    if (!editingTask) return;
    const startMinute = parseTimeInput(startTimeInput);
    const endMinute = parseTimeInput(endTimeInput);
    if (startMinute === null || endMinute === null) {
      setActionError('Enter both times in 24-hour format, for example 09:30.');
      return;
    }
    if (endMinute <= startMinute) {
      setActionError('The end time must be later than the start time on the same day.');
      return;
    }
    setIsSaving(true);
    setActionError(null);
    try {
      const updated = await setTime(editingTask, startMinute, endMinute);
      if (!updated) {
        setActionError('That time conflicts with a completed task or pushes the schedule past 11:00 PM.');
        return;
      }
      setEditingTask(null);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Could not update this task. Try again.');
    } finally {
      setIsSaving(false);
    }
  };
  const deleteSelectedTask = async () => {
    if (!deletingTask) return;
    setIsSaving(true);
    setActionError(null);
    try {
      const deleted = await remove(deletingTask);
      if (!deleted) {
        setActionError('This task was not found. Refresh the calendar and try again.');
        return;
      }
      setDeletingTask(null);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Could not delete this task. Try again.');
    } finally {
      setIsSaving(false);
    }
  };
  const addSuggestion = (title: string, startMinute: number, endMinute: number) => {
    void addTask({ title, startMinute, endMinute, category: 'Break' }).then((added) => {
      if (!added) Alert.alert('Time is no longer available', 'Refresh the calendar and choose another open slot.');
    }).catch((error: unknown) => {
      Alert.alert('Could not add this suggestion', error instanceof Error ? error.message : 'Try again.');
    });
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <SpaceBackdrop />
      <ScreenTransition>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.topline}>
          <View style={styles.brandMark}><Text style={styles.brandGlyph}>F</Text></View>
          <Text style={styles.kicker}>YOUR TIME, IN BALANCE</Text>
          <View style={styles.localBadge}><PulseDot color={colors.green} size={5} /><Text style={styles.localText}>LOCAL</Text></View>
        </View>
        <View style={styles.headingRow}>
          <View>
            <Text style={styles.title}>Calendar</Text>
            <Text style={styles.subtitle}>Make space for what matters.</Text>
          </View>
          <Pressable style={styles.todayButton} onPress={goToToday}>
            <Text style={styles.todayButtonText}>Today</Text>
          </Pressable>
        </View>

        <View style={styles.monthCard}>
          <View style={styles.monthHeader}>
            <View>
              <Text style={styles.monthTitle}>{monthLabel}</Text>
              <Text style={styles.monthHint}>Tap any date to see your plan</Text>
            </View>
            <View style={styles.monthControls}>
              <Pressable accessibilityLabel="Previous month" onPress={() => changeMonth(-1)} style={styles.arrowButton}>
                <Text style={styles.arrow}>‹</Text>
              </Pressable>
              <Pressable accessibilityLabel="Next month" onPress={() => changeMonth(1)} style={styles.arrowButton}>
                <Text style={styles.arrow}>›</Text>
              </Pressable>
            </View>
          </View>
          <View style={styles.calendarGrid}>
            {weekdays.map((day, index) => (
              <Text key={`${day}-${index}`} style={styles.weekday}>{day}</Text>
            ))}
            {dates.map(({ date, key, inMonth }) => {
              const selected = key === selectedDate;
              const isToday = key === toDateKey(new Date());
              const count = taskCounts.get(key) ?? 0;
              return (
                <Pressable
                  key={key}
                  accessibilityRole="button"
                  accessibilityLabel={`${date.toLocaleDateString()}, ${count} tasks`}
                  accessibilityState={{ selected }}
                  onPress={() => {
                    if (!inMonth) {
                      setVisibleMonth(new Date(date.getFullYear(), date.getMonth(), 1));
                      setIsLoadingMonth(true);
                    }
                    setSelectedDate(key);
                  }}
                  style={styles.dateCell}
                >
                  <View style={[
                    styles.dateCircle,
                    selected && styles.selectedCircle,
                    isToday && !selected && styles.todayCircle,
                    !inMonth && styles.outsideMonth,
                  ]}>
                    <Text style={[
                      styles.dateNumber,
                      selected && styles.selectedNumber,
                      !inMonth && styles.outsideNumber,
                    ]}>
                      {date.getDate()}
                    </Text>
                  </View>
                  <View style={styles.dotRow}>
                    {count > 0 && <View style={[styles.taskDot, selected && styles.selectedDot]} />}
                    {isToday && !selected && <View style={styles.todayDot} />}
                  </View>
                </Pressable>
              );
            })}
          </View>
          <View style={styles.legend}>
            <View style={styles.legendDot} />
            <Text style={styles.legendText}>Scheduled day</Text>
            {isLoadingMonth && <Text style={styles.loadingText}>Loading…</Text>}
          </View>
        </View>

        <View style={styles.scheduleHeader}>
          <View>
            <Text style={styles.scheduleTitle}>{selectedLabel}</Text>
            <Text style={styles.scheduleSubtitle}>
              {selectedTasks.length} {selectedTasks.length === 1 ? 'time block' : 'time blocks'} planned
            </Text>
          </View>
          <View style={styles.datePill}>
            <Text style={styles.datePillText}>{new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(selectedDateObject)}</Text>
          </View>
        </View>

        {selectedTasks.length === 0 ? (
          <View style={styles.emptyState}>
            <View style={styles.emptyIcon}><Text style={styles.emptyGlyph}>✳</Text></View>
            <Text style={styles.emptyTitle}>A little room to breathe</Text>
            <Text style={styles.emptyCopy}>No tasks on this date yet. Import a timetable and choose the dates you want it scheduled.</Text>
          </View>
        ) : (
          <>
            <Text style={styles.adjustmentNote}>Use ±15 min or Change time to reschedule. Later unfinished tasks shift when needed; delete items you no longer need.</Text>
            <View style={styles.agenda}>
            {selectedTasks.map((task, index) => {
              const previousTask = selectedTasks[index - 1];
              const gapMinutes = previousTask ? task.startMinute - previousTask.endMinute : 0;
              const duration = task.endMinute - task.startMinute;
              return (
                <View key={task.id}>
                  {gapMinutes > 0 && (
                    <View style={styles.gapRow}>
                      <View style={styles.timeColumn} />
                      <View style={styles.gapMarker} />
                      <View style={styles.gapCopy}>
                        <Text style={styles.gapLabel}>{formatDuration(gapMinutes)} open</Text>
                        <View style={styles.suggestionRow}>
                          {gapMinutes >= 15 && (
                            <Pressable
                              accessibilityRole="button"
                              accessibilityLabel={`Add a 10 minute break before ${task.title}`}
                              onPress={() => addSuggestion('Rest break', previousTask.endMinute, previousTask.endMinute + 10)}
                              style={styles.suggestionButton}
                            >
                              <Text style={styles.suggestionText}>+ 10 min break</Text>
                            </Pressable>
                          )}
                          {gapMinutes >= 5 && (
                            <Pressable
                              accessibilityRole="button"
                              accessibilityLabel={`Add a 5 minute preparation buffer before ${task.title}`}
                              onPress={() => addSuggestion('Preparation buffer', task.startMinute - 5, task.startMinute)}
                              style={styles.suggestionButton}
                            >
                              <Text style={styles.suggestionText}>+ 5 min buffer</Text>
                            </Pressable>
                          )}
                        </View>
                        </View>
                        </View>
                  )}
                  <View style={styles.agendaRow}>
                    <View style={styles.timeColumn}>
                      <Text style={styles.startTime}>{formatMinute(task.startMinute)}</Text>
                      <Text style={styles.endTime}>{formatMinute(task.endMinute)}</Text>
                    </View>
                    <View style={[
                      styles.agendaMarker,
                      { backgroundColor: task.status === 'complete' ? colors.green : categoryColor(task.category) },
                    ]} />
                    <View style={[
                      styles.eventCard,
                      { backgroundColor: categoryBackground(task.category) },
                      task.status === 'complete' && styles.completeCard,
                    ]}>
                      <View style={styles.eventHeading}>
                        <Text style={[styles.eventTitle, task.status === 'complete' && styles.completeTitle]}>
                          {task.title}
                        </Text>
                        {task.status === 'complete' && (
                          <Text style={styles.completeBadge}>DONE</Text>
                        )}
                      </View>
                      <Text style={styles.eventMeta}>
                        {task.category}  ·  {formatDuration(duration)}
                      </Text>
                      <Text style={styles.eventTime}>
                        {formatMinute(task.startMinute)} – {formatMinute(task.endMinute)}
                      </Text>
                      {task.status !== 'complete' && (
                        <View style={styles.eventControls}>
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel={`Move ${task.title} 15 minutes earlier`}
                            onPress={() => shiftTask(task, -15)}
                            style={styles.moveButton}
                          >
                            <Text style={styles.moveButtonText}>−15 min</Text>
                          </Pressable>
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel={`Move ${task.title} 15 minutes later`}
                            onPress={() => shiftTask(task, 15)}
                            style={styles.moveButton}
                          >
                            <Text style={styles.moveButtonText}>+15 min</Text>
                          </Pressable>
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel={`Change time for ${task.title}`}
                            onPress={() => openTimeEditor(task)}
                            style={styles.moveButton}
                          >
                            <Text style={styles.moveButtonText}>Change time</Text>
                          </Pressable>
                        </View>
                      )}
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Delete ${task.title} from schedule`}
                        onPress={() => {
                          setActionError(null);
                          setDeletingTask(task);
                        }}
                        style={styles.deleteButton}
                      >
                        <Text style={styles.deleteButtonText}>Delete schedule item</Text>
                      </Pressable>
                    </View>
                  </View>
                </View>
              );
            })}
            </View>
          </>
        )}
      </ScrollView>
      </ScreenTransition>
      <Modal
        visible={editingTask !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setEditingTask(null)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalEyebrow}>RESCHEDULE TASK</Text>
            <Text style={styles.modalTitle}>{editingTask?.title}</Text>
            <Text style={styles.modalCopy}>Enter the start and end time using 24-hour HH:MM format. Later unfinished tasks move if needed.</Text>
            <View style={styles.timeInputRow}>
              <View style={styles.timeField}>
                <Text style={styles.timeLabel}>START</Text>
                <TextInput
                  accessibilityLabel="New start time"
                  value={startTimeInput}
                  onChangeText={setStartTimeInput}
                  placeholder="09:00"
                  placeholderTextColor={colors.muted}
                  keyboardType="numbers-and-punctuation"
                  maxLength={5}
                  style={styles.timeInput}
                />
              </View>
              <View style={styles.timeField}>
                <Text style={styles.timeLabel}>END</Text>
                <TextInput
                  accessibilityLabel="New end time"
                  value={endTimeInput}
                  onChangeText={setEndTimeInput}
                  placeholder="10:00"
                  placeholderTextColor={colors.muted}
                  keyboardType="numbers-and-punctuation"
                  maxLength={5}
                  style={styles.timeInput}
                />
              </View>
            </View>
            {actionError && <Text accessibilityRole="alert" style={styles.actionError}>{actionError}</Text>}
            <View style={styles.modalActions}>
              <Pressable
                accessibilityRole="button"
                disabled={isSaving}
                onPress={() => setEditingTask(null)}
                style={styles.cancelButton}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                disabled={isSaving}
                onPress={() => void saveTaskTime()}
                style={[styles.confirmButton, isSaving && styles.disabledButton]}
              >
                <Text style={styles.confirmButtonText}>{isSaving ? 'Saving…' : 'Save time'}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
      <Modal
        visible={deletingTask !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setDeletingTask(null)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalEyebrow}>REMOVE FROM SCHEDULE</Text>
            <Text style={styles.modalTitle}>Delete this task?</Text>
            <Text style={styles.modalCopy}>{deletingTask?.title} will be removed from {selectedLabel.toLowerCase()}. This cannot be undone.</Text>
            {actionError && <Text accessibilityRole="alert" style={styles.actionError}>{actionError}</Text>}
            <View style={styles.modalActions}>
              <Pressable
                accessibilityRole="button"
                disabled={isSaving}
                onPress={() => setDeletingTask(null)}
                style={styles.cancelButton}
              >
                <Text style={styles.cancelButtonText}>Keep task</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                disabled={isSaving}
                onPress={() => void deleteSelectedTask()}
                style={[styles.deleteConfirmButton, isSaving && styles.disabledButton]}
              >
                <Text style={styles.confirmButtonText}>{isSaving ? 'Deleting…' : 'Delete task'}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function categoryColor(category: string) {
  if (category === 'Personal') return colors.purple;
  if (category === 'Work') return colors.blue;
  return colors.green;
}

function categoryBackground(category: string) {
  if (category === 'Personal') return colors.purpleSoft;
  if (category === 'Work') return colors.blueSoft;
  return colors.greenSoft;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { width: '100%', maxWidth: 760, alignSelf: 'center', paddingHorizontal: 20, paddingTop: 13, paddingBottom: 32 },
  topline: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  brandMark: { width: 25, height: 25, borderRadius: 9, backgroundColor: colors.navy, alignItems: 'center', justifyContent: 'center' },
  brandGlyph: { color: '#FFFFFF', fontSize: 13, fontWeight: '900' },
  kicker: { flex: 1, color: colors.green, fontSize: 8, fontWeight: '800', letterSpacing: 1.25 },
  localBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: colors.greenSoft, borderRadius: 9, paddingHorizontal: 8, paddingVertical: 6 },
  localText: { color: colors.green, fontSize: 7, fontWeight: '800', letterSpacing: 0.6 },
  headingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 13, marginBottom: 17 },
  title: { color: colors.ink, fontSize: 29, fontWeight: '800', letterSpacing: -0.8 },
  subtitle: { color: colors.muted, fontSize: 11, marginTop: 3 },
  todayButton: { backgroundColor: colors.navy, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 12 },
  todayButtonText: { color: '#FFFFFF', fontSize: 10, fontWeight: '800' },
  monthCard: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: 24, padding: 16, shadowColor: '#000000', shadowOpacity: 0.2, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 2 },
  monthHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 11 },
  monthTitle: { color: colors.ink, fontSize: 17, fontWeight: '800', letterSpacing: -0.3 },
  monthHint: { color: colors.muted, fontSize: 9, marginTop: 4 },
  monthControls: { flexDirection: 'row', gap: 7 },
  arrowButton: { width: 33, height: 33, borderRadius: 11, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' },
  arrow: { color: colors.ink, fontSize: 22, lineHeight: 25 },
  calendarGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  weekday: { width: `${100 / 7}%`, textAlign: 'center', color: colors.muted, fontSize: 8, fontWeight: '800', paddingVertical: 8 },
  dateCell: { width: `${100 / 7}%`, height: 43, alignItems: 'center', justifyContent: 'center' },
  dateCircle: { width: 31, height: 31, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  selectedCircle: { backgroundColor: colors.green, shadowColor: colors.green, shadowOpacity: 0.25, shadowRadius: 5, elevation: 2 },
  todayCircle: { borderWidth: 1, borderColor: colors.green },
  outsideMonth: { opacity: 0.42 },
  dateNumber: { color: colors.ink, fontSize: 10, fontWeight: '600' },
  selectedNumber: { color: '#FFFFFF', fontWeight: '800' },
  outsideNumber: { color: colors.muted },
  dotRow: { height: 5, flexDirection: 'row', gap: 3, position: 'absolute', bottom: 0, alignItems: 'center' },
  taskDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: colors.green },
  selectedDot: { backgroundColor: '#FFFFFF' },
  todayDot: { width: 3, height: 3, borderRadius: 2, backgroundColor: colors.yellow },
  legend: { borderTopWidth: 1, borderTopColor: colors.line, flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10, paddingTop: 11 },
  legendDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: colors.green },
  legendText: { color: colors.muted, fontSize: 9 },
  loadingText: { marginLeft: 'auto', color: colors.muted, fontSize: 9 },
  scheduleHeader: { marginTop: 23, marginBottom: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  scheduleTitle: { color: colors.ink, fontSize: 17, fontWeight: '800' },
  scheduleSubtitle: { color: colors.muted, fontSize: 10, marginTop: 4 },
  datePill: { backgroundColor: colors.greenSoft, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 7 },
  datePillText: { color: colors.green, fontSize: 9, fontWeight: '800' },
  emptyState: { backgroundColor: colors.surface, borderRadius: 21, paddingHorizontal: 23, paddingVertical: 27, alignItems: 'center' },
  emptyIcon: { width: 42, height: 42, borderRadius: 15, backgroundColor: colors.greenSoft, alignItems: 'center', justifyContent: 'center' },
  emptyGlyph: { color: colors.green, fontSize: 19 },
  emptyTitle: { color: colors.ink, fontSize: 13, fontWeight: '800', marginTop: 11 },
  emptyCopy: { maxWidth: 260, textAlign: 'center', color: colors.muted, fontSize: 10, lineHeight: 15, marginTop: 6 },
  agenda: { backgroundColor: colors.surface, borderRadius: 21, borderWidth: 1, borderColor: colors.line, padding: 14 },
  adjustmentNote: { color: colors.muted, fontSize: 9, lineHeight: 14, marginBottom: 9, paddingHorizontal: 2 },
  agendaRow: { flexDirection: 'row', alignItems: 'stretch', minHeight: 82, gap: 9 },
  timeColumn: { width: 58, alignItems: 'flex-start', paddingTop: 12 },
  startTime: { color: colors.ink, fontSize: 9, fontWeight: '800' },
  endTime: { color: colors.muted, fontSize: 8, marginTop: 5 },
  agendaMarker: { width: 3, borderRadius: 2, marginVertical: 9 },
  eventCard: { flex: 1, borderRadius: 13, paddingHorizontal: 12, paddingVertical: 11, marginBottom: 8, justifyContent: 'center' },
  completeCard: { backgroundColor: colors.greenSoft },
  eventHeading: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  eventTitle: { flex: 1, color: colors.ink, fontSize: 11, lineHeight: 16, fontWeight: '800' },
  completeTitle: { color: colors.green },
  completeBadge: { color: colors.green, fontSize: 7, fontWeight: '900', letterSpacing: 0.8, paddingTop: 3 },
  eventMeta: { color: colors.muted, fontSize: 8, marginTop: 5 },
  eventTime: { color: colors.muted, fontSize: 8, marginTop: 3 },
  gapRow: { minHeight: 28, flexDirection: 'row', alignItems: 'center', gap: 9 },
  gapMarker: { width: 3, height: 16, borderRadius: 2, backgroundColor: colors.line, marginLeft: 0 },
  gapCopy: { flex: 1, gap: 6, paddingVertical: 5 },
  gapLabel: { color: colors.muted, fontSize: 8, fontWeight: '700' },
  suggestionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 5 },
  suggestionButton: { minHeight: 28, justifyContent: 'center', backgroundColor: colors.greenSoft, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 5 },
  suggestionText: { color: colors.green, fontSize: 8, fontWeight: '800' },
  eventControls: { flexDirection: 'row', gap: 7, marginTop: 9 },
  moveButton: { minHeight: 30, justifyContent: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: 8, paddingHorizontal: 9 },
  moveButtonText: { color: colors.blue, fontSize: 8, fontWeight: '800' },
  deleteButton: { alignSelf: 'flex-start', minHeight: 29, justifyContent: 'center', marginTop: 7, paddingHorizontal: 2 },
  deleteButtonText: { color: colors.red, fontSize: 8, fontWeight: '800' },
  modalBackdrop: { flex: 1, justifyContent: 'center', padding: 20, backgroundColor: 'rgba(3,8,16,0.78)' },
  modalCard: { width: '100%', maxWidth: 420, alignSelf: 'center', backgroundColor: colors.surface, borderColor: colors.line, borderWidth: 1, borderRadius: 20, padding: 20 },
  modalEyebrow: { color: colors.green, fontSize: 8, fontWeight: '900', letterSpacing: 1.1 },
  modalTitle: { color: colors.ink, fontSize: 18, fontWeight: '800', marginTop: 8 },
  modalCopy: { color: colors.muted, fontSize: 11, lineHeight: 17, marginTop: 7 },
  timeInputRow: { flexDirection: 'row', gap: 12, marginTop: 17 },
  timeField: { flex: 1, gap: 6 },
  timeLabel: { color: colors.muted, fontSize: 8, fontWeight: '800', letterSpacing: 0.8 },
  timeInput: { color: colors.ink, backgroundColor: colors.background, borderColor: colors.line, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, fontWeight: '700' },
  actionError: { color: colors.red, fontSize: 10, lineHeight: 15, marginTop: 12 },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', flexWrap: 'wrap', gap: 8, marginTop: 18 },
  cancelButton: { minHeight: 38, minWidth: 85, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 12, backgroundColor: colors.navy, borderRadius: 10 },
  cancelButtonText: { color: colors.muted, fontSize: 10, fontWeight: '800' },
  confirmButton: { minHeight: 38, minWidth: 95, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 13, backgroundColor: colors.green, borderRadius: 10 },
  deleteConfirmButton: { minHeight: 38, minWidth: 95, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 13, backgroundColor: '#A84459', borderRadius: 10 },
  confirmButtonText: { color: colors.background, fontSize: 10, fontWeight: '900' },
  disabledButton: { opacity: 0.55 },
});
