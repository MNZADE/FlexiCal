import type { SQLiteDatabase } from 'expo-sqlite';
import { bedtimeMinute, dayStartMinute } from './constants';

export type TaskStatus = 'active' | 'scheduled' | 'complete';

export type Task = {
  id: number;
  dateKey: string;
  title: string;
  startMinute: number;
  endMinute: number;
  category: string;
  status: TaskStatus;
};

type TaskRow = {
  id: number;
  day_key: string;
  title: string;
  start_minute: number;
  end_minute: number;
  category: string;
  status: TaskStatus;
};

export const toDateKey = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const todayDateKey = () => toDateKey(new Date());

export function shiftDateKey(dateKey: string, offset: number) {
  const [year, month, day] = dateKey.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + offset);
  return toDateKey(date);
}

export async function initializeDatabase(database: SQLiteDatabase) {
  await database.execAsync(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      day_key TEXT NOT NULL,
      title TEXT NOT NULL,
      start_minute INTEGER NOT NULL,
      end_minute INTEGER NOT NULL,
      category TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('active', 'scheduled', 'complete'))
    );
    CREATE INDEX IF NOT EXISTS tasks_day_start ON tasks(day_key, start_minute);
    CREATE TABLE IF NOT EXISTS app_migrations (
      name TEXT PRIMARY KEY NOT NULL
    );
    CREATE TABLE IF NOT EXISTS app_preferences (
      key TEXT PRIMARY KEY NOT NULL,
      value TEXT NOT NULL
    );
  `);

  const cleanupMigration = 'remove_demo_schedule_20261016';
  const migration = await database.getFirstAsync<{ name: string }>(
    'SELECT name FROM app_migrations WHERE name = ?',
    cleanupMigration,
  );
  if (!migration) {
    await database.withTransactionAsync(async () => {
      const demoTasks = [
        ['Morning planning', 510, 540, 'Personal'],
        ['Review project brief', 555, 615, 'Deep work'],
        ['Team stand-up', 630, 660, 'Work'],
        ['Focus block', 690, 750, 'Deep work'],
        ['Lunch break', 750, 795, 'Personal'],
        ['Prepare presentation', 840, 900, 'Work'],
        ['Walk & reset', 960, 990, 'Personal'],
      ] as const;

      for (const [title, start, end, category] of demoTasks) {
        await database.runAsync(
          `DELETE FROM tasks
           WHERE title = ? AND start_minute = ? AND end_minute = ? AND category = ?`,
          title,
          start,
          end,
          category,
        );
      }

      for (const dayKey of ['2026-10-20', '2026-10-21']) {
        await database.runAsync(
          `DELETE FROM tasks
           WHERE day_key = ? AND category = 'Imported'
             AND ((title = ? AND start_minute = ? AND end_minute = ?)
               OR (title = ? AND start_minute = ? AND end_minute = ?))`,
          dayKey,
          'Design review',
          540,
          600,
          'Team meeting',
          660,
          690,
        );
      }

      await database.runAsync('INSERT INTO app_migrations (name) VALUES (?)', cleanupMigration);
    });
  }
}

export async function loadTasks(database: SQLiteDatabase, dateKey: string): Promise<Task[]> {
  const rows = await database.getAllAsync<TaskRow>(
    'SELECT id, day_key, title, start_minute, end_minute, category, status FROM tasks WHERE day_key = ? ORDER BY start_minute',
    dateKey,
  );
  return rows.map((row) => ({
    id: row.id,
    dateKey: row.day_key,
    title: row.title,
    startMinute: row.start_minute,
    endMinute: row.end_minute,
    category: row.category,
    status: row.status,
  }));
}

export async function loadMonthTasks(
  database: SQLiteDatabase,
  firstDay: string,
  dayAfterLast: string,
): Promise<Task[]> {
  const rows = await database.getAllAsync<TaskRow>(
    `SELECT id, day_key, title, start_minute, end_minute, category, status
     FROM tasks WHERE day_key >= ? AND day_key < ? ORDER BY day_key, start_minute`,
    firstDay,
    dayAfterLast,
  );
  return rows.map((row) => ({
    id: row.id,
    dateKey: row.day_key,
    title: row.title,
    startMinute: row.start_minute,
    endMinute: row.end_minute,
    category: row.category,
    status: row.status,
  }));
}

export async function loadAllTasks(database: SQLiteDatabase): Promise<Task[]> {
  const rows = await database.getAllAsync<TaskRow>(
    'SELECT id, day_key, title, start_minute, end_minute, category, status FROM tasks ORDER BY day_key, start_minute',
  );
  return rows.map((row) => ({
    id: row.id,
    dateKey: row.day_key,
    title: row.title,
    startMinute: row.start_minute,
    endMinute: row.end_minute,
    category: row.category,
    status: row.status,
  }));
}

function getScheduledDateKeys(startDate: string, endDate: string, repeatDays: number[]) {
  const validDateKey = (dateKey: string) =>
    /^\d{4}-\d{2}-\d{2}$/.test(dateKey) &&
    Number.isFinite(new Date(`${dateKey}T00:00:00`).getTime()) &&
    toDateKey(new Date(`${dateKey}T00:00:00`)) === dateKey;
  if (!validDateKey(startDate) || !validDateKey(endDate)) {
    throw new Error('Choose valid start and end dates.');
  }
  if (endDate < startDate) throw new Error('End date must be the same as or after the start date.');
  if (repeatDays.length === 0 || repeatDays.some((day) => !Number.isInteger(day) || day < 0 || day > 6)) {
    throw new Error('Choose at least one valid repeat day.');
  }

  const dayCount = Math.round(
    (new Date(`${endDate}T00:00:00`).getTime() - new Date(`${startDate}T00:00:00`).getTime()) / 86_400_000,
  ) + 1;
  if (dayCount > 366) throw new Error('Choose a date range of one year or less.');

  return Array.from({ length: dayCount }, (_, offset) => shiftDateKey(startDate, offset)).filter((dateKey) => {
    const [year, month, day] = dateKey.split('-').map(Number);
    return repeatDays.includes(new Date(year, month - 1, day).getDay());
  });
}

function overlaps(
  first: { startMinute: number; endMinute: number },
  second: { startMinute: number; endMinute: number },
) {
  return first.startMinute < second.endMinute && first.endMinute > second.startMinute;
}

export async function previewScheduleConflicts(
  database: SQLiteDatabase,
  items: { title: string; startMinute: number; endMinute: number }[],
  startDate: string,
  endDate: string,
  repeatDays: number[],
) {
  const dateKeys = getScheduledDateKeys(startDate, endDate, repeatDays);
  if (dateKeys.length === 0 || items.length === 0) {
    return { scheduledCount: 0, conflictingCount: 0, dateCount: dateKeys.length };
  }

  const existing = await database.getAllAsync<TaskRow>(
    `SELECT id, day_key, title, start_minute, end_minute, category, status
     FROM tasks WHERE day_key >= ? AND day_key <= ? ORDER BY day_key, start_minute`,
    startDate,
    endDate,
  );
  const byDate = new Map<string, { startMinute: number; endMinute: number }[]>();
  for (const task of existing) {
    const dayTasks = byDate.get(task.day_key) ?? [];
    dayTasks.push({ startMinute: task.start_minute, endMinute: task.end_minute });
    byDate.set(task.day_key, dayTasks);
  }

  let conflictingCount = 0;
  let scheduledCount = 0;
  const candidates = [...items].sort((left, right) => left.startMinute - right.startMinute);
  for (const dateKey of dateKeys) {
    const dayTasks = [...(byDate.get(dateKey) ?? [])];
    for (const item of candidates) {
      if (dayTasks.some((task) => overlaps(task, item))) {
        conflictingCount += 1;
      } else {
        dayTasks.push(item);
        scheduledCount += 1;
      }
    }
  }
  return { scheduledCount, conflictingCount, dateCount: dateKeys.length };
}

export async function addTasksForDateRange(
  database: SQLiteDatabase,
  items: { title: string; startMinute: number; endMinute: number }[],
  startDate: string,
  endDate: string,
  repeatDays: number[],
) {
  const dateKeys = getScheduledDateKeys(startDate, endDate, repeatDays);
  if (items.length === 0) return { scheduledCount: 0, conflictingCount: 0, dateCount: dateKeys.length };

  let scheduledCount = 0;
  let conflictingCount = 0;
  await database.withTransactionAsync(async () => {
    const candidates = [...items].sort((left, right) => left.startMinute - right.startMinute);
    for (const dayKey of dateKeys) {
      const rows = await database.getAllAsync<Pick<TaskRow, 'start_minute' | 'end_minute'>>(
        'SELECT start_minute, end_minute FROM tasks WHERE day_key = ? ORDER BY start_minute',
        dayKey,
      );
      const dayTasks = rows.map((task) => ({
        startMinute: task.start_minute,
        endMinute: task.end_minute,
      }));
      for (const item of candidates) {
        if (dayTasks.some((task) => overlaps(task, item))) {
          conflictingCount += 1;
          continue;
        }
        await database.runAsync(
          'INSERT INTO tasks (day_key, title, start_minute, end_minute, category, status) VALUES (?, ?, ?, ?, ?, ?)',
          dayKey,
          item.title,
          item.startMinute,
          item.endMinute,
          'Imported',
          'scheduled',
        );
        dayTasks.push(item);
        scheduledCount += 1;
      }
    }
  });
  return { scheduledCount, conflictingCount, dateCount: dateKeys.length };
}

export async function addTaskToDate(
  database: SQLiteDatabase,
  dateKey: string,
  task: { title: string; startMinute: number; endMinute: number; category: string },
) {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(dateKey) ||
    toDateKey(new Date(`${dateKey}T00:00:00`)) !== dateKey ||
    task.startMinute < 0 ||
    task.endMinute > 1440 ||
    task.endMinute <= task.startMinute
  ) {
    throw new Error('The suggested time block is not valid.');
  }
  const existing = await database.getAllAsync<Pick<TaskRow, 'start_minute' | 'end_minute'>>(
    'SELECT start_minute, end_minute FROM tasks WHERE day_key = ?',
    dateKey,
  );
  if (existing.some((item) => overlaps(
    { startMinute: item.start_minute, endMinute: item.end_minute },
    task,
  ))) return false;
  await database.runAsync(
    'INSERT INTO tasks (day_key, title, start_minute, end_minute, category, status) VALUES (?, ?, ?, ?, ?, ?)',
    dateKey,
    task.title,
    task.startMinute,
    task.endMinute,
    task.category,
    'scheduled',
  );
  return true;
}

export async function moveTaskByMinutes(database: SQLiteDatabase, task: Task, minutes: number) {
  return setTaskTime(database, task, task.startMinute + minutes, task.endMinute + minutes);
}

export async function setTaskTime(
  database: SQLiteDatabase,
  task: Task,
  startMinute: number,
  endMinute: number,
) {
  if (
    task.status === 'complete' ||
    !Number.isInteger(startMinute) ||
    !Number.isInteger(endMinute) ||
    startMinute < 0 ||
    endMinute > bedtimeMinute ||
    endMinute <= startMinute
  ) return false;

  let moved = false;
  await database.withTransactionAsync(async () => {
    const otherTasks = await database.getAllAsync<{
      id: number;
      start_minute: number;
      end_minute: number;
      status: TaskStatus;
    }>(
      'SELECT id, start_minute, end_minute, status FROM tasks WHERE day_key = ? AND id != ? ORDER BY start_minute',
      task.dateKey,
      task.id,
    );
    if (otherTasks.some((item) =>
      item.start_minute < startMinute && item.end_minute > startMinute,
    )) return;

    let cursorEnd = endMinute;
    const shifted: { id: number; startMinute: number; endMinute: number }[] = [];
    for (const other of otherTasks.filter((item) => item.start_minute >= startMinute)) {
      if (other.start_minute < cursorEnd) {
        if (other.status === 'complete') return;
        const nextStart = cursorEnd;
        const nextEnd = nextStart + other.end_minute - other.start_minute;
        if (nextEnd > bedtimeMinute) return;
        shifted.push({ id: other.id, startMinute: nextStart, endMinute: nextEnd });
        cursorEnd = nextEnd;
      } else {
        cursorEnd = other.end_minute;
      }
    }

    const updateResult = await database.runAsync(
      `UPDATE tasks SET start_minute = ?, end_minute = ?
       WHERE id = ? AND day_key = ? AND status != 'complete'`,
      startMinute,
      endMinute,
      task.id,
      task.dateKey,
    );
    if (updateResult.changes === 0) return;
    for (const other of shifted) {
      await database.runAsync(
        'UPDATE tasks SET start_minute = ?, end_minute = ? WHERE id = ? AND day_key = ?',
        other.startMinute,
        other.endMinute,
        other.id,
        task.dateKey,
      );
    }
    moved = true;
  });
  return moved;
}

export async function deleteTask(database: SQLiteDatabase, task: Task) {
  const result = await database.runAsync(
    'DELETE FROM tasks WHERE id = ? AND day_key = ?',
    task.id,
    task.dateKey,
  );
  return result.changes > 0;
}

export async function completeTask(database: SQLiteDatabase, task: Task) {
  await database.withTransactionAsync(async () => {
    await database.runAsync(
      'UPDATE tasks SET status = ? WHERE id = ? AND day_key = ?',
      'complete',
      task.id,
      task.dateKey,
    );
    await database.runAsync(
      `UPDATE tasks SET status = 'active'
       WHERE id = (
         SELECT id FROM tasks
         WHERE day_key = ? AND status = 'scheduled'
         ORDER BY start_minute LIMIT 1
       )`,
      task.dateKey,
    );
  });
}

export async function extendTask(database: SQLiteDatabase, task: Task, minutes: number) {
  await database.withTransactionAsync(async () => {
    await database.runAsync(
      'UPDATE tasks SET end_minute = end_minute + ? WHERE id = ? AND day_key = ?',
      minutes,
      task.id,
      task.dateKey,
    );
    await database.runAsync(
      `UPDATE tasks
       SET start_minute = start_minute + ?, end_minute = end_minute + ?
       WHERE day_key = ? AND status = 'scheduled' AND start_minute >= ?`,
      minutes,
      minutes,
      task.dateKey,
      task.endMinute,
    );
  });
}

export async function rescheduleTask(
  database: SQLiteDatabase,
  task: Task,
  mode: 'end-of-day' | 'gap',
): Promise<boolean> {
  const dayKey = task.dateKey;
  const otherTasks = await database.getAllAsync<Pick<TaskRow, 'start_minute' | 'end_minute'>>(
    `SELECT start_minute, end_minute FROM tasks
     WHERE day_key = ? AND id != ?
     ORDER BY start_minute`,
    dayKey,
    task.id,
  );
  const duration = task.endMinute - task.startMinute;
  let startMinute: number | undefined;

  if (mode === 'gap') {
    let cursor = dayStartMinute;
    for (const scheduled of otherTasks) {
      if (scheduled.start_minute - cursor >= duration) {
        startMinute = cursor;
        break;
      }
      cursor = Math.max(cursor, scheduled.end_minute);
    }
    if (startMinute === undefined && bedtimeMinute - cursor >= duration) {
      startMinute = cursor;
    }
  } else {
    const lastEnd = otherTasks.reduce(
      (latest, scheduled) => Math.max(latest, scheduled.end_minute),
      dayStartMinute,
    );
    if (lastEnd + duration <= bedtimeMinute) startMinute = lastEnd;
  }

  if (startMinute === undefined) return false;

  await database.runAsync(
    'UPDATE tasks SET start_minute = ?, end_minute = ?, status = ? WHERE id = ? AND day_key = ?',
    startMinute,
    startMinute + duration,
    'scheduled',
    task.id,
    dayKey,
  );
  return true;
}
