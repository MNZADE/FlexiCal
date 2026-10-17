import { openDatabaseAsync } from 'expo-sqlite';
import { registerWidgetTaskHandler, requestWidgetUpdate } from 'react-native-android-widget';
import { initializeDatabase, loadTasks, todayDateKey, type Task } from '../config/database';
import { getWidgetTaskSummary } from './taskSummary';
import { NextTaskWidget } from './android/NextTaskWidget';

const widgetName = 'FlexiCalNextTask';

registerWidgetTaskHandler(async ({ renderWidget }) => {
  const database = await openDatabaseAsync('flexical.db');
  try {
    await initializeDatabase(database);
    const tasks = await loadTasks(database, todayDateKey());
    renderWidget(<NextTaskWidget task={getWidgetTaskSummary(tasks)} />);
  } catch (error) {
    console.error('Could not refresh the FlexiCal Android widget.', error);
    renderWidget(<NextTaskWidget task={{ title: 'Open FlexiCal to refresh', state: 'SCHEDULE UNAVAILABLE', time: '' }} />);
  } finally {
    await database.closeAsync();
  }
});

export async function updateAndroidTaskWidget(tasks: Task[]) {
  const summary = getWidgetTaskSummary(tasks);
  await requestWidgetUpdate({
    widgetName,
    renderWidget: () => <NextTaskWidget task={summary} />,
  });
}
