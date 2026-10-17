import { Platform } from 'react-native';
import { todayDateKey, type Task } from '../config/database';
import { formatMinute } from '../utils/time';
import { playTaskAlertTone } from './taskAlertTone';

const alarmChannelId = 'flexical-task-alarms-v1';
const alarmDataKey = 'flexicalTaskAlarm';
const upcomingReminderLeadMs = 5 * 60 * 1000;
let notificationHandlerConfigured = false;
let notificationListenerConfigured = false;
let currentCustomToneUri: string | null = null;

export async function syncTaskAlarms(
  tasks: Task[],
  breakReminders: boolean,
  customToneUri: string | null,
) {
  currentCustomToneUri = customToneUri;
  if (Platform.OS === 'web') return;

  const Notifications = await import('expo-notifications');
  if (!notificationHandlerConfigured) {
    Notifications.setNotificationHandler({
      handleNotification: async (notification) => {
        const kind = notification.request.content.data?.kind;
        const usesCustomTone = Boolean(currentCustomToneUri)
          && (kind === 'upcoming' || kind === 'start' || kind === 'end');
        return {
          shouldPlaySound: !usesCustomTone,
          shouldSetBadge: false,
          shouldShowBanner: true,
          shouldShowList: true,
        };
      },
    });
    notificationHandlerConfigured = true;
  }

  if (!notificationListenerConfigured) {
    Notifications.addNotificationReceivedListener((notification) => {
      const kind = notification.request.content.data?.kind;
      if (
        currentCustomToneUri
        && (kind === 'upcoming' || kind === 'start' || kind === 'end')
      ) {
        void playTaskAlertTone(currentCustomToneUri).catch((error: unknown) => {
          console.warn('Could not play the selected task alert tune.', error);
        });
      }
      if (Platform.OS === 'ios') {
        void import('expo-haptics')
          .then((Haptics) => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning))
          .catch((error: unknown) => console.warn('Could not vibrate for the task alarm.', error));
      }
    });
    notificationListenerConfigured = true;
  }

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(alarmChannelId, {
      name: 'Task alarms',
      importance: Notifications.AndroidImportance.MAX,
      sound: 'default',
      vibrationPattern: [0, 500, 250, 500],
      enableVibrate: true,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    });
  }

  const pending = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(
    pending
      .filter((item) => item.content.data?.[alarmDataKey] === true)
      .map((item) => Notifications.cancelScheduledNotificationAsync(item.identifier)),
  );

  if (tasks.length === 0) return;

  let permission = await Notifications.getPermissionsAsync();
  if (!permission.granted && permission.canAskAgain) {
    permission = await Notifications.requestPermissionsAsync();
  }
  if (!permission.granted) {
    console.warn('Task alarms are disabled because notification permission was not granted.');
    return;
  }

  const now = Date.now();
  const alarms = tasks.flatMap((task) => {
    if (task.dateKey !== todayDateKey() || task.status === 'complete') return [];
    const [year, month, day] = task.dateKey.split('-').map(Number);
    const createAlarm = (minute: number, kind: 'upcoming' | 'start' | 'end' | 'break') => {
      const date = new Date(year, month - 1, day, Math.floor(minute / 60), minute % 60);
      return {
        task,
        kind,
        date,
      };
    };

    const startAlarm = createAlarm(task.startMinute, 'start');
    const endAlarm = createAlarm(task.endMinute, 'end');
    const alarmsForTask: ReturnType<typeof createAlarm>[] = [startAlarm, endAlarm].filter(
      (alarm) => alarm.date.getTime() > now + 1000,
    );
    if (startAlarm.date.getTime() > now + 60_000) {
      const reminder = createAlarm(task.startMinute, 'upcoming');
      reminder.date.setTime(Math.max(reminder.date.getTime() - upcomingReminderLeadMs, now + 1000));
      alarmsForTask.push(reminder);
    }
    if (breakReminders && task.endMinute - task.startMinute >= 90) {
      const nextTask = tasks
        .filter((candidate) => candidate.dateKey === task.dateKey && candidate.status !== 'complete')
        .sort((left, right) => left.startMinute - right.startMinute)
        .find((candidate) => candidate.startMinute >= task.endMinute);
      if (nextTask && nextTask.startMinute - task.endMinute >= 20) {
        const reminder = createAlarm(task.endMinute + 5, 'break');
        if (reminder.date.getTime() > now + 1000 && reminder.date.getTime() < new Date(
          year,
          month - 1,
          day,
          Math.floor(nextTask.startMinute / 60),
          nextTask.startMinute % 60,
        ).getTime()) {
          alarmsForTask.push(reminder);
        }
      }
    }
    return alarmsForTask;
  });

  await Promise.all(
    alarms.map(({ task, kind, date }) =>
      Notifications.scheduleNotificationAsync({
        content: {
          title:
            kind === 'upcoming'
              ? 'Upcoming task'
              : kind === 'start'
                ? 'Task starting now'
                : kind === 'break'
                  ? 'Take a short break'
                  : 'Task time is up',
          body:
            kind === 'upcoming'
              ? `${task.title} · starts at ${formatMinute(task.startMinute)}`
              : kind === 'break'
                ? `You have time before your next task.`
                : task.title,
          sound: 'default',
          data: { [alarmDataKey]: true, taskId: task.id, kind },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date,
          ...(Platform.OS === 'android' ? { channelId: alarmChannelId } : {}),
        },
      }),
    ),
  );
}
