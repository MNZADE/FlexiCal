import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { AppText as Text } from '../../components/AppText';
import { ProgressRing } from '../../components/ProgressRing';
import { PulseDot, SpaceBackdrop, ScreenTransition } from '../../components/SpaceScene';
import { colors } from '../../config/constants';
import { todayDateKey, type Task } from '../../config/database';
import { useTasks } from '../../state/TaskProvider';
import { formatMinute } from '../../utils/time';
import { ActionHUDModal } from './ActionHUDModal';

function clockLabel(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
}

function dateLabel(dateKey: string) {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric' }).format(
    new Date(year, month - 1, day),
  );
}

export function DashboardScreen() {
  const { tasks, selectedDate, loadError, complete, extend, reschedule } = useTasks();
  const isToday = selectedDate === todayDateKey();
  const [currentTime, setCurrentTime] = useState(() => new Date());
  const currentTimeInSeconds =
    currentTime.getHours() * 3600 + currentTime.getMinutes() * 60 + currentTime.getSeconds();
  const currentTask = useMemo(
    () => {
      const incompleteTasks = tasks.filter((task) => task.status !== 'complete');
      if (!isToday) {
        return incompleteTasks.find((task) => task.status === 'active') ?? incompleteTasks[0];
      }

      const taskInProgress = incompleteTasks.find(
        (task) => task.startMinute * 60 <= currentTimeInSeconds && currentTimeInSeconds < task.endMinute * 60,
      );
      const nextActivatedTask = incompleteTasks.find((task) => task.status === 'active');
      const overdueTask = incompleteTasks.find((task) => task.endMinute * 60 <= currentTimeInSeconds);
      const nextScheduledTask = incompleteTasks.find((task) => task.startMinute * 60 > currentTimeInSeconds);

      return taskInProgress ?? nextActivatedTask ?? overdueTask ?? nextScheduledTask;
    },
    [currentTimeInSeconds, isToday, tasks],
  );
  const isUpcomingTask = Boolean(currentTask && isToday && currentTimeInSeconds < currentTask.startMinute * 60);
  const secondsLeft = currentTask
    ? isToday
      ? Math.max(
          (isUpcomingTask ? currentTask.startMinute : currentTask.endMinute) * 60 - currentTimeInSeconds,
          0,
        )
      : (currentTask.endMinute - currentTask.startMinute) * 60
    : 0;
  const timerCaption = !isToday ? 'DURATION' : isUpcomingTask ? 'STARTS IN' : secondsLeft === 0 ? 'TIME IS UP' : 'REMAINING';
  const [showActions, setShowActions] = useState(false);
  const [dismissedTaskId, setDismissedTaskId] = useState<number | null>(null);
  const [flexiEnabled, setFlexiEnabled] = useState(true);
  const showTimeUpActions = Boolean(
    isToday &&
    currentTask &&
    !isUpcomingTask &&
    secondsLeft === 0 &&
    dismissedTaskId !== currentTask.id,
  );

  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  const runTaskAction = async (action: () => Promise<void>) => {
    try {
      await action();
      setShowActions(false);
      setDismissedTaskId(currentTask?.id ?? null);
    } catch {
      Alert.alert('Could not update your schedule', 'Please try again. Your existing schedule has been kept.');
    }
  };

  const onComplete = () => {
    if (!currentTask) return;
    void runTaskAction(() => complete(currentTask));
  };

  const onExtraTime = (minutes: number) => {
    if (!currentTask) return;
    void (async () => {
      try {
        await extend(currentTask, minutes);
        setShowActions(false);
        setDismissedTaskId(null);
      } catch {
        Alert.alert('Could not update your schedule', 'Please try again. Your existing schedule has been kept.');
      }
    })();
  };

  const onReschedule = (mode: 'end-of-day' | 'gap') => {
    if (!currentTask) return;
    if (mode === 'gap' && !flexiEnabled) {
      Alert.alert('Flexi-mode is off', 'Turn Flexi-mode on to place this task into an open gap.');
      return;
    }
    void (async () => {
      try {
        const moved = await reschedule(currentTask, mode);
        if (!moved) {
          Alert.alert(
            'No room left today',
            'There is not enough time before 11:00 PM for this task. Try the other rescheduling option.',
          );
          return;
        }
        setShowActions(false);
        setDismissedTaskId(null);
      } catch {
        Alert.alert('Could not update your schedule', 'Please try again. Your existing schedule has been kept.');
      }
    })();
  };

  const nextTasks = tasks.filter(
    (task) => task.status === 'scheduled' && task.id !== currentTask?.id,
  ).slice(0, 3);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <SpaceBackdrop />
      <ScreenTransition>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View>
            <Text style={styles.date}>{dateLabel(selectedDate)}</Text>
            <Text style={styles.greeting}>{isToday ? 'Make today count.' : 'Plan this day well.'}</Text>
            <Text style={styles.localTime}>
              Local now · {new Intl.DateTimeFormat(undefined, {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
                hour: 'numeric',
                minute: '2-digit',
                second: '2-digit',
              }).format(currentTime)}
            </Text>
          </View>
          <Pressable
            style={styles.avatar}
            accessibilityRole="button"
            accessibilityLabel="Open settings"
            onPress={() => router.push('/settings')}
          >
            <Text style={styles.avatarText}>A</Text>
          </Pressable>
        </View>

        {loadError && <Text style={styles.errorBanner}>Your local schedule could not be loaded: {loadError}</Text>}

        <View style={styles.focusCard}>
          <View style={styles.cardTop}>
            <View style={styles.liveBadge}>
              <PulseDot color={colors.green} />
              <Text style={styles.liveText}>{isUpcomingTask ? 'UP NEXT' : 'IN FOCUS'}</Text>
            </View>
            <Text style={styles.sessionNumber}>LOCAL SCHEDULE</Text>
          </View>

          {currentTask ? (
            <>
              <Text style={styles.taskTitle}>{currentTask.title}</Text>
              <Text style={styles.taskMeta}>
                {currentTask.category}  ·  {isUpcomingTask
                  ? `starts at ${formatMinute(currentTask.startMinute)}`
                  : `until ${formatMinute(currentTask.endMinute)}`}
              </Text>
              <ProgressRing time={clockLabel(secondsLeft)} caption={timerCaption} />
              {isToday && !isUpcomingTask && (
                <View style={styles.focusActions}>
                  <Pressable onPress={() => setShowActions(true)} style={styles.finishLink}>
                    <Text style={styles.finishText}>End session</Text>
                  </Pressable>
                </View>
              )}
            </>
          ) : (
            <View style={styles.emptyFocus}>
              <Text style={styles.taskTitle}>Your schedule is clear</Text>
              <Text style={styles.taskMeta}>Add a task from the document workspace.</Text>
            </View>
          )}
        </View>

        <View style={styles.flexiCard}>
          <View style={styles.flexiIcon}>
            <Text style={styles.flexiIconText}>↗</Text>
          </View>
          <View style={styles.flexiCopy}>
            <Text style={styles.flexiTitle}>Flexi-mode</Text>
            <Text style={styles.flexiSub}>Finds room when plans change</Text>
          </View>
          <Pressable
            accessibilityRole="switch"
            accessibilityState={{ checked: flexiEnabled }}
            onPress={() => setFlexiEnabled((enabled) => !enabled)}
            style={[styles.toggle, flexiEnabled && styles.toggleOn]}
          >
            <View style={[styles.toggleKnob, flexiEnabled && styles.toggleKnobOn]} />
          </Pressable>
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Up next</Text>
          <Text style={styles.sectionAside}>{nextTasks.length} tasks</Text>
        </View>
        <View style={styles.taskList}>
          {nextTasks.map((task, index) => (
            <UpcomingTask key={task.id} task={task} last={index === nextTasks.length - 1} />
          ))}
          {nextTasks.length === 0 && (
            <Text style={styles.emptyList}>Nothing else planned for today.</Text>
          )}
        </View>
      </ScrollView>

      {currentTask && isToday && !isUpcomingTask && (
        <ActionHUDModal
          visible={showActions || showTimeUpActions}
          onClose={() => {
            setShowActions(false);
            setDismissedTaskId(currentTask.id);
          }}
          onComplete={onComplete}
          onExtraTime={onExtraTime}
          onReschedule={onReschedule}
        />
      )}
      </ScreenTransition>
    </SafeAreaView>
  );
}

function UpcomingTask({ task, last }: { task: Task; last: boolean }) {
  return (
    <View style={styles.upcomingRow}>
      <View style={styles.timeCol}>
        <Text style={styles.upcomingTime}>{formatMinute(task.startMinute)}</Text>
        {!last && <View style={styles.timeline} />}
      </View>
      <View style={[styles.taskTile, last && styles.lastTile]}>
        <View style={[styles.categoryMark, { backgroundColor: categoryColor(task.category) }]} />
        <View style={styles.upcomingCopy}>
          <Text style={styles.upcomingTitle}>{task.title}</Text>
          <Text style={styles.upcomingCategory}>{task.category} · {task.endMinute - task.startMinute} min</Text>
        </View>
        <Text style={styles.chevron}>›</Text>
      </View>
    </View>
  );
}

function categoryColor(category: string) {
  if (category === 'Personal') return colors.purple;
  if (category === 'Work') return colors.blue;
  return colors.green;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { width: '100%', maxWidth: 760, alignSelf: 'center', paddingHorizontal: 20, paddingTop: 12, paddingBottom: 28 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  date: { color: colors.muted, fontSize: 12, fontWeight: '600' },
  greeting: { color: colors.ink, fontSize: 25, fontWeight: '800', marginTop: 4, letterSpacing: -0.5 },
  localTime: { color: colors.muted, fontSize: 11, fontWeight: '600', marginTop: 5 },
  avatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.greenSoft, borderWidth: 1, borderColor: 'rgba(91,224,194,0.25)', alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: colors.green, fontSize: 16, fontWeight: '800' },
  focusCard: { backgroundColor: colors.navy, borderWidth: 1, borderColor: 'rgba(121,169,255,0.18)', borderRadius: 25, padding: 20, alignItems: 'center', overflow: 'hidden' },
  cardTop: { width: '100%', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 19 },
  liveBadge: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  liveText: { color: colors.green, fontSize: 9, fontWeight: '800', letterSpacing: 1.6 },
  sessionNumber: { color: '#8296B4', fontSize: 9, fontWeight: '700', letterSpacing: 1.2 },
  taskTitle: { color: '#FFFFFF', fontSize: 21, fontWeight: '800', textAlign: 'center', letterSpacing: -0.3 },
  taskMeta: { color: '#AEBBD0', fontSize: 12, marginTop: 6, marginBottom: 20 },
  focusActions: { width: '100%', alignItems: 'center', gap: 12, marginTop: 16 },
  finishLink: { padding: 4 },
  finishText: { color: '#ADBBD0', fontSize: 12, fontWeight: '600' },
  emptyFocus: { paddingVertical: 46, alignItems: 'center' },
  flexiCard: { marginTop: 14, borderRadius: 18, backgroundColor: colors.surface, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 },
  flexiIcon: { width: 40, height: 40, borderRadius: 13, backgroundColor: colors.greenSoft, alignItems: 'center', justifyContent: 'center' },
  flexiIconText: { color: colors.green, fontSize: 22, fontWeight: '800' },
  flexiCopy: { flex: 1, gap: 3 },
  flexiTitle: { color: colors.ink, fontSize: 14, fontWeight: '800' },
  flexiSub: { color: colors.muted, fontSize: 11 },
  toggle: { width: 42, height: 25, borderRadius: 13, padding: 3, backgroundColor: '#34425A', justifyContent: 'center' },
  toggleOn: { backgroundColor: colors.green },
  toggleKnob: { height: 19, width: 19, borderRadius: 10, backgroundColor: '#FFFFFF' },
  toggleKnobOn: { alignSelf: 'flex-end' },
  sectionHeader: { marginTop: 24, marginBottom: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: { color: colors.ink, fontSize: 17, fontWeight: '800' },
  sectionAside: { color: colors.muted, fontSize: 11, fontWeight: '600' },
  taskList: { backgroundColor: colors.surface, borderRadius: 20, paddingHorizontal: 14, paddingTop: 6 },
  upcomingRow: { minHeight: 72, flexDirection: 'row' },
  timeCol: { width: 66, paddingTop: 17, alignItems: 'flex-start' },
  upcomingTime: { color: colors.muted, fontSize: 10, fontWeight: '700' },
  timeline: { position: 'absolute', top: 36, left: 26, bottom: -1, width: 1, backgroundColor: colors.line },
  taskTile: { flex: 1, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: colors.line, gap: 10 },
  lastTile: { borderBottomWidth: 0 },
  categoryMark: { width: 4, height: 31, borderRadius: 2 },
  upcomingCopy: { flex: 1, gap: 4 },
  upcomingTitle: { color: colors.ink, fontSize: 12, fontWeight: '700' },
  upcomingCategory: { color: colors.muted, fontSize: 10 },
  chevron: { color: '#AAB3C0', fontSize: 20, paddingRight: 3 },
  emptyList: { padding: 18, color: colors.muted, fontSize: 12 },
  errorBanner: { color: colors.red, backgroundColor: colors.redSoft, borderRadius: 12, padding: 11, fontSize: 11, marginBottom: 12 },
});
