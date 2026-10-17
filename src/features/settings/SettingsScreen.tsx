import { useState } from 'react';
import { Alert, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import { useSQLiteContext } from 'expo-sqlite';
import { AppText } from '../../components/AppText';
import { SpaceBackdrop, ScreenTransition } from '../../components/SpaceScene';
import { colors } from '../../config/constants';
import { loadAllTasks, todayDateKey, type Task } from '../../config/database';
import { usePreferences, type PreferenceKey } from '../../state/PreferenceProvider';
import { playTaskAlertTone } from '../../api/taskAlertTone';

function escapeIcs(value: string) {
  return value.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

function toCalendarTime(dateKey: string, minute: number) {
  const compactDate = dateKey.replace(/-/g, '');
  const hours = String(Math.floor(minute / 60)).padStart(2, '0');
  const minutes = String(minute % 60).padStart(2, '0');
  return `${compactDate}T${hours}${minutes}00`;
}

function createCalendarExport(tasks: Task[]) {
  const events = tasks.map((task) => [
    'BEGIN:VEVENT',
    `UID:flexical-${task.id}-${task.dateKey}@flexical.app`,
    `DTSTART:${toCalendarTime(task.dateKey, task.startMinute)}`,
    `DTEND:${toCalendarTime(task.dateKey, task.endMinute)}`,
    `SUMMARY:${escapeIcs(task.title)}`,
    `DESCRIPTION:${escapeIcs(`${task.category} · ${task.status}`)}`,
    'END:VEVENT',
  ].join('\r\n'));
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//FlexiCal//Schedule//EN', ...events, 'END:VCALENDAR', ''].join('\r\n');
}

async function shareFile(fileName: string, content: string, mimeType: string) {
  if (Platform.OS === 'web') {
    const downloadUrl = URL.createObjectURL(new Blob([content], { type: mimeType }));
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = fileName;
    link.click();
    setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
    return;
  }

  if (!(await Sharing.isAvailableAsync())) throw new Error('File sharing is not available on this device.');
  const { File, Paths } = await import('expo-file-system');
  const file = new File(Paths.cache, fileName);
  if (file.exists) file.delete();
  file.create();
  file.write(content);
  await Sharing.shareAsync(file.uri, { mimeType, dialogTitle: 'Export your FlexiCal schedule' });
}

export function SettingsScreen() {
  const database = useSQLiteContext();
  const { preferences, updatePreference, taskAlertTone, updateTaskAlertTone } = usePreferences();
  const [isExporting, setIsExporting] = useState(false);
  const [isSavingTone, setIsSavingTone] = useState(false);

  const togglePreference = (key: PreferenceKey) => {
    void updatePreference(key, !preferences[key]).catch((error: unknown) => {
      Alert.alert('Setting could not be saved', error instanceof Error ? error.message : 'Try again.');
    });
  };

  const chooseTaskAlertTone = async () => {
    if (Platform.OS === 'web') {
      Alert.alert('Use the mobile app', 'Choose a custom task tune in FlexiCal on your Android or iOS device.');
      return;
    }

    setIsSavingTone(true);
    let copiedTone: File | null = null;
    try {
      const selection = await DocumentPicker.getDocumentAsync({
        type: 'audio/*',
        copyToCacheDirectory: true,
      });
      if (selection.canceled) return;

      const asset = selection.assets[0];
      const extension = asset.name.split('.').pop()?.toLowerCase();
      const supportedExtensions = ['mp3', 'm4a', 'wav', 'aac', 'ogg', 'opus', 'flac'];
      if (!extension || !supportedExtensions.includes(extension)) {
        throw new Error('Choose an MP3, M4A, WAV, AAC, OGG, OPUS, or FLAC audio file.');
      }
      if (asset.size !== undefined && asset.size > 20 * 1024 * 1024) {
        throw new Error('Choose an audio file smaller than 20 MB.');
      }

      const name = `flexical-task-tone-${Date.now()}.${extension}`;
      copiedTone = new File(Paths.document, name);
      await new File(asset.uri).copy(copiedTone);
      await updateTaskAlertTone({ uri: copiedTone.uri, name: asset.name });

      const previousToneUri = taskAlertTone?.uri;
      if (previousToneUri?.startsWith(Paths.document.uri) && previousToneUri !== copiedTone.uri) {
        const previousToneFile = new File(previousToneUri);
        if (previousToneFile.exists) previousToneFile.delete();
      }
      copiedTone = null;
    } catch (error) {
      if (copiedTone?.exists) copiedTone.delete();
      Alert.alert(
        'Tune could not be saved',
        error instanceof Error ? error.message : 'Try another audio file.',
      );
    } finally {
      setIsSavingTone(false);
    }
  };

  const resetTaskAlertTone = async () => {
    try {
      const previousToneUri = taskAlertTone?.uri;
      await updateTaskAlertTone(null);
      if (previousToneUri?.startsWith(Paths.document.uri)) {
        const previousToneFile = new File(previousToneUri);
        if (previousToneFile.exists) previousToneFile.delete();
      }
    } catch (error) {
      Alert.alert('Default tune could not be restored', error instanceof Error ? error.message : 'Try again.');
    }
  };

  const previewTaskAlertTone = () => {
    if (!taskAlertTone) return;
    void playTaskAlertTone(taskAlertTone.uri).catch((error: unknown) => {
      Alert.alert('Tune could not be played', error instanceof Error ? error.message : 'Choose another audio file.');
    });
  };

  const exportSchedule = async (format: 'backup' | 'calendar') => {
    setIsExporting(true);
    try {
      const tasks = await loadAllTasks(database);
      if (tasks.length === 0) {
        Alert.alert('Nothing to export', 'Add schedule items before creating an export.');
        return;
      }
      const today = todayDateKey();
      if (format === 'backup') {
        const backup = JSON.stringify({ app: 'FlexiCal', version: 1, exportedAt: new Date().toISOString(), tasks }, null, 2);
        await shareFile(`flexical-backup-${today}.json`, backup, 'application/json');
      } else {
        await shareFile(`flexical-schedule-${today}.ics`, createCalendarExport(tasks), 'text/calendar');
      }
    } catch (error) {
      Alert.alert('Export could not be created', error instanceof Error ? error.message : 'Try again.');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <SpaceBackdrop />
      <ScreenTransition>
        <ScrollView contentContainerStyle={styles.content}>
          <Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.backButton}>
            <AppText style={styles.backText}>‹  Back</AppText>
          </Pressable>
          <AppText style={styles.kicker}>MAKE FLEXICAL WORK FOR YOU</AppText>
          <AppText style={styles.title}>Settings</AppText>
          <AppText style={styles.subtitle}>Accessibility, wellbeing and schedule portability.</AppText>

          <View style={styles.section}>
            <AppText style={styles.sectionTitle}>Accessibility & wellbeing</AppText>
            <SettingToggle
              title="Larger text"
              description="Increase text size throughout FlexiCal."
              value={preferences.largeText}
              onPress={() => togglePreference('largeText')}
            />
            <SettingToggle
              title="Reduce motion"
              description="Turn off decorative movement and screen transitions."
              value={preferences.reducedMotion}
              onPress={() => togglePreference('reducedMotion')}
            />
            <SettingToggle
              title="Break reminders"
              description="Suggest a short reset after long, tightly scheduled work."
              value={preferences.breakReminders}
              onPress={() => togglePreference('breakReminders')}
            />
          </View>

          <View style={styles.section}>
            <AppText style={styles.sectionTitle}>Task alert sound</AppText>
            <AppText style={styles.sectionDescription}>
              {taskAlertTone
                ? `Selected: ${taskAlertTone.name}. It plays for task reminders and start/end alerts while FlexiCal is open. Background and locked-screen alerts use your system notification sound.`
                : 'The default system notification tune plays for task reminders and start/end alerts.'}
            </AppText>
            <ExportButton
              title={isSavingTone ? 'Choosing tune…' : 'Choose tune from this device'}
              description="Select an MP3, M4A, WAV, AAC, OGG, OPUS, or FLAC file."
              disabled={isSavingTone}
              onPress={() => { void chooseTaskAlertTone(); }}
            />
            {taskAlertTone && (
              <>
                <ExportButton
                  title="Preview selected tune"
                  description="Play a short preview now."
                  disabled={isSavingTone}
                  onPress={previewTaskAlertTone}
                />
                <ExportButton
                  title="Use default system tune"
                  description="Remove the selected tune and restore the notification default."
                  disabled={isSavingTone}
                  onPress={() => { void resetTaskAlertTone(); }}
                />
              </>
            )}
          </View>

          <View style={styles.section}>
            <AppText style={styles.sectionTitle}>Backup & export</AppText>
            <AppText style={styles.sectionDescription}>Your data stays on this device. Choose a format to save or share it.</AppText>
            <ExportButton
              title={isExporting ? 'Preparing…' : 'Create JSON backup'}
              description="A copy of all tasks, dates and completion states."
              disabled={isExporting}
              onPress={() => { void exportSchedule('backup'); }}
            />
            <ExportButton
              title={isExporting ? 'Preparing…' : 'Export calendar (.ics)'}
              description="Import your schedule into a calendar app."
              disabled={isExporting}
              onPress={() => { void exportSchedule('calendar'); }}
            />
          </View>
        </ScrollView>
      </ScreenTransition>
    </SafeAreaView>
  );
}

function SettingToggle({
  title,
  description,
  value,
  onPress,
}: {
  title: string;
  description: string;
  value: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      onPress={onPress}
      style={styles.settingRow}
    >
      <View style={styles.settingCopy}>
        <AppText style={styles.settingTitle}>{title}</AppText>
        <AppText style={styles.settingDescription}>{description}</AppText>
      </View>
      <View style={[styles.switchTrack, value && styles.switchOn]}>
        <View style={[styles.switchThumb, value && styles.thumbOn]} />
      </View>
    </Pressable>
  );
}

function ExportButton({
  title,
  description,
  disabled,
  onPress,
}: {
  title: string;
  description: string;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={styles.exportButton}>
      <View style={styles.settingCopy}>
        <AppText style={styles.settingTitle}>{title}</AppText>
        <AppText style={styles.settingDescription}>{description}</AppText>
      </View>
      <AppText style={styles.exportArrow}>↗</AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { width: '100%', maxWidth: 760, alignSelf: 'center', paddingHorizontal: 20, paddingTop: 12, paddingBottom: 32 },
  backButton: { alignSelf: 'flex-start', paddingVertical: 8, paddingRight: 14, marginBottom: 10 },
  backText: { color: colors.green, fontSize: 13, fontWeight: '800' },
  kicker: { color: colors.green, fontSize: 9, fontWeight: '800', letterSpacing: 1.3 },
  title: { color: colors.ink, fontSize: 28, fontWeight: '800', marginTop: 6 },
  subtitle: { color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: 5, marginBottom: 20 },
  section: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: 20, padding: 15, marginBottom: 14 },
  sectionTitle: { color: colors.ink, fontSize: 15, fontWeight: '800', marginBottom: 5 },
  sectionDescription: { color: colors.muted, fontSize: 10, lineHeight: 15, marginBottom: 9 },
  settingRow: { minHeight: 65, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 14, borderTopWidth: 1, borderTopColor: colors.line, paddingVertical: 10 },
  settingCopy: { flex: 1, gap: 4 },
  settingTitle: { color: colors.ink, fontSize: 12, fontWeight: '800' },
  settingDescription: { color: colors.muted, fontSize: 9, lineHeight: 14 },
  switchTrack: { width: 44, height: 26, borderRadius: 14, justifyContent: 'center', padding: 3, backgroundColor: '#46536A' },
  switchOn: { backgroundColor: colors.green },
  switchThumb: { width: 20, height: 20, borderRadius: 10, backgroundColor: '#FFFFFF' },
  thumbOn: { alignSelf: 'flex-end' },
  exportButton: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 12, borderTopWidth: 1, borderTopColor: colors.line, paddingVertical: 10 },
  exportArrow: { color: colors.green, fontSize: 18, fontWeight: '800' },
});
