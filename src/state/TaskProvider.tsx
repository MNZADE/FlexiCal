import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Platform } from 'react-native';
import { useSQLiteContext, type SQLiteDatabase } from 'expo-sqlite';
import {
  addTasksForDateRange,
  addTaskToDate,
  completeTask as markTaskComplete,
  deleteTask as deleteScheduledTask,
  extendTask as extendScheduledTask,
  loadTasks,
  moveTaskByMinutes,
  rescheduleTask as moveTask,
  setTaskTime as updateScheduledTaskTime,
  shiftDateKey,
  todayDateKey,
  type Task,
} from '../config/database';
import { syncTaskAlarms } from '../api/taskAlarms';
import { usePreferences } from './PreferenceProvider';
import { getWidgetTaskSummary } from '../widgets/taskSummary';

async function syncTaskWidgets(database: SQLiteDatabase, todayTasks: Task[]) {
  if (Platform.OS === 'android') {
    const widget = await import('../widgets/androidWidget');
    await widget.updateAndroidTaskWidget(todayTasks);
    return;
  }
  if (Platform.OS !== 'ios') return;

  const tomorrowKey = shiftDateKey(todayDateKey(), 1);
  const tomorrowTasks = await loadTasks(database, tomorrowKey);
  const widget = await import('../widgets/ios/NextTaskWidget');
  const now = new Date();
  const todayKey = todayDateKey();
  const [year, month, day] = todayKey.split('-').map(Number);
  const nowMinute = now.getHours() * 60 + now.getMinutes();
  const boundaryMinutes = [...new Set(
    todayTasks
      .filter((task) => task.status !== 'complete')
      .flatMap((task) => [task.startMinute, task.endMinute])
      .filter((minute) => minute > nowMinute),
  )].sort((left, right) => left - right);
  const tomorrowDate = new Date(`${tomorrowKey}T00:00:00`);
  const entries = [
    { date: now, props: getWidgetTaskSummary(todayTasks, now) },
    ...boundaryMinutes.map((minute) => {
      const boundary = new Date(year, month - 1, day, Math.floor(minute / 60), minute % 60);
      return { date: boundary, props: getWidgetTaskSummary(todayTasks, boundary) };
    }),
    {
      date: tomorrowDate,
      props: getWidgetTaskSummary(tomorrowTasks, tomorrowDate),
    },
  ];
  widget.default.updateTimeline(entries);
}

type TaskContextValue = {
  tasks: Task[];
  loadError: string | null;
  selectedDate: string;
  setSelectedDate: (dateKey: string) => void;
  refresh: () => Promise<void>;
  complete: (task: Task) => Promise<void>;
  extend: (task: Task, minutes: number) => Promise<void>;
  moveBy: (task: Task, minutes: number) => Promise<boolean>;
  setTime: (task: Task, startMinute: number, endMinute: number) => Promise<boolean>;
  remove: (task: Task) => Promise<boolean>;
  addTask: (task: { title: string; startMinute: number; endMinute: number; category: string }) => Promise<boolean>;
  reschedule: (task: Task, mode: 'end-of-day' | 'gap') => Promise<boolean>;
  addRange: (
    items: { title: string; startMinute: number; endMinute: number }[],
    startDate: string,
    endDate: string,
    repeatDays: number[],
  ) => Promise<{ scheduledCount: number; conflictingCount: number; dateCount: number }>;
};

const TaskContext = createContext<TaskContextValue | null>(null);

export function TaskProvider({ children }: { children: ReactNode }) {
  const database = useSQLiteContext();
  const { preferences, taskAlertTone } = usePreferences();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [hasLoadedTasks, setHasLoadedTasks] = useState(false);
  const [selectedDate, setSelectedDate] = useState(todayDateKey);
  const lastObservedToday = useRef(todayDateKey());

  useEffect(() => {
    const interval = setInterval(() => {
      const today = todayDateKey();
      if (today === lastObservedToday.current) return;

      const previousToday = lastObservedToday.current;
      lastObservedToday.current = today;
      setSelectedDate((dateKey) => (dateKey === previousToday ? today : dateKey));
    }, 30_000);

    return () => clearInterval(interval);
  }, []);

  const refresh = useCallback(async () => {
    setTasks(await loadTasks(database, selectedDate));
    setHasLoadedTasks(true);
    setLoadError(null);
  }, [database, selectedDate]);

  useEffect(() => {
    let isMounted = true;
    void loadTasks(database, selectedDate)
      .then((loadedTasks) => {
        if (isMounted) {
          setTasks(loadedTasks);
          setHasLoadedTasks(true);
        }
      })
      .catch((error: unknown) => {
        if (isMounted) {
          setLoadError(error instanceof Error ? error.message : 'Could not load the local schedule.');
        }
      });
    return () => {
      isMounted = false;
    };
  }, [database, selectedDate]);

  useEffect(() => {
    if (!hasLoadedTasks) return;
    let isCurrent = true;
    void loadTasks(database, todayDateKey())
      .then(async (todayTasks) => {
        const outcomes = await Promise.allSettled([
          syncTaskAlarms(todayTasks, preferences.breakReminders, taskAlertTone?.uri ?? null),
          syncTaskWidgets(database, todayTasks),
        ]);
        for (const outcome of outcomes) {
          if (outcome.status === 'rejected' && isCurrent) {
            console.error('Could not synchronize a task alert or home-screen widget.', outcome.reason);
          }
        }
      })
      .catch((error: unknown) => {
        if (isCurrent) console.error('Could not synchronize task alarms.', error);
      });
    return () => {
      isCurrent = false;
    };
  }, [database, hasLoadedTasks, preferences.breakReminders, selectedDate, taskAlertTone?.uri, tasks]);

  const value = useMemo<TaskContextValue>(
    () => ({
      tasks: tasks.filter((task) => task.dateKey === selectedDate),
      loadError,
      selectedDate,
      setSelectedDate,
      refresh,
      complete: async (task) => {
        await markTaskComplete(database, task);
        await refresh();
      },
      extend: async (task, minutes) => {
        await extendScheduledTask(database, task, minutes);
        await refresh();
      },
      moveBy: async (task, minutes) => {
        const moved = await moveTaskByMinutes(database, task, minutes);
        if (moved) await refresh();
        return moved;
      },
      setTime: async (task, startMinute, endMinute) => {
        const moved = await updateScheduledTaskTime(database, task, startMinute, endMinute);
        if (moved) await refresh();
        return moved;
      },
      remove: async (task) => {
        const removed = await deleteScheduledTask(database, task);
        if (removed) await refresh();
        return removed;
      },
      addTask: async (task) => {
        const added = await addTaskToDate(database, selectedDate, task);
        if (added) await refresh();
        return added;
      },
      reschedule: async (task, mode) => {
        const moved = await moveTask(database, task, mode);
        await refresh();
        return moved;
      },
      addRange: async (items, startDate, endDate, repeatDays) => {
        const result = await addTasksForDateRange(database, items, startDate, endDate, repeatDays);
        let firstDate = startDate;
        const rangeStart = new Date(`${startDate}T00:00:00`);
        const rangeEnd = new Date(`${endDate}T00:00:00`);
        for (const date = new Date(rangeStart); date <= rangeEnd; date.setDate(date.getDate() + 1)) {
          if (repeatDays.includes(date.getDay())) {
            firstDate = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
            break;
          }
        }
        setSelectedDate(firstDate);
        setTasks(await loadTasks(database, firstDate));
        setHasLoadedTasks(true);
        setLoadError(null);
        return result;
      },
    }),
    [database, loadError, refresh, selectedDate, tasks],
  );

  return <TaskContext.Provider value={value}>{children}</TaskContext.Provider>;
}

export function useTasks() {
  const context = useContext(TaskContext);
  if (!context) throw new Error('useTasks must be used inside TaskProvider');
  return context;
}
