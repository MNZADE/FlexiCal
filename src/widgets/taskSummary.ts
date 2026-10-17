import type { Task } from '../config/database';
import { formatMinute } from '../utils/time';

export type WidgetTaskSummary = {
  title: string;
  state: string;
  time: string;
};

export function getWidgetTaskSummary(tasks: Task[], now = new Date()): WidgetTaskSummary {
  const nowMinute = now.getHours() * 60 + now.getMinutes();
  const incomplete = tasks
    .filter((task) => task.status !== 'complete')
    .sort((left, right) => left.startMinute - right.startMinute);
  const current = incomplete.find((task) => task.startMinute <= nowMinute && nowMinute < task.endMinute);
  if (current) {
    return { title: current.title, state: 'IN PROGRESS', time: `Until ${formatMinute(current.endMinute)}` };
  }
  const overdue = incomplete.find((task) => task.endMinute <= nowMinute);
  if (overdue) {
    return { title: overdue.title, state: 'NEEDS ATTENTION', time: `Ended ${formatMinute(overdue.endMinute)}` };
  }
  const next = incomplete.find((task) => task.startMinute > nowMinute);
  if (next) {
    return { title: next.title, state: 'UP NEXT', time: `Starts ${formatMinute(next.startMinute)}` };
  }
  return { title: 'No more tasks today', state: 'ALL CLEAR', time: 'Enjoy your free time' };
}
