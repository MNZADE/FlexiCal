import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  TextInput,
  Pressable,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSQLiteContext } from 'expo-sqlite';
import { AppText as Text } from '../../components/AppText';
import { CustomButton } from '../../components/CustomButton';
import { DatePickerModal } from '../../components/DatePickerModal';
import { colors } from '../../config/constants';
import { useTasks } from '../../state/TaskProvider';
import { usePreferences } from '../../state/PreferenceProvider';
import { previewScheduleConflicts, todayDateKey } from '../../config/database';
import { formatMinute } from '../../utils/time';
import * as DocumentPicker from 'expo-document-picker';
import { extractScheduleText } from './documentTextExtractor';
import { parseScheduleText, type ParseResult } from './textProcessor';
import { SpaceBackdrop, ScreenTransition } from '../../components/SpaceScene';

export function ScannerScreen() {
  const database = useSQLiteContext();
  const { addRange, selectedDate } = useTasks();
  const { preferences } = usePreferences();
  const [documentText, setDocumentText] = useState('');
  const [result, setResult] = useState<ParseResult | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isReading, setIsReading] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [startDate, setStartDate] = useState(selectedDate || todayDateKey());
  const [endDate, setEndDate] = useState(selectedDate || todayDateKey());
  const [datePickerTarget, setDatePickerTarget] = useState<'start' | 'end' | null>(null);
  const [repeatDays, setRepeatDays] = useState([0, 1, 2, 3, 4, 5, 6]);
  const readingController = useRef<AbortController | null>(null);
  const previewQueueRef = useRef(Promise.resolve());
  const [conflictResult, setConflictResult] = useState<{
    key: string;
    preview: { scheduledCount: number; conflictingCount: number; dateCount: number };
  } | null>(null);
  const dayCount = useMemo(() => {
    const start = new Date(`${startDate}T00:00:00`);
    const end = new Date(`${endDate}T00:00:00`);
    let count = 0;
    for (const date = new Date(start); date <= end; date.setDate(date.getDate() + 1)) {
      if (repeatDays.includes(date.getDay())) count += 1;
    }
    return count;
  }, [endDate, repeatDays, startDate]);
  const dateRangeLabel = (dateKey: string) =>
    new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }).format(
      new Date(`${dateKey}T00:00:00`),
    );
  const conflictQueryKey = JSON.stringify([startDate, endDate, repeatDays, result?.items]);
  const conflictPreview =
    conflictResult?.key === conflictQueryKey ? conflictResult.preview : null;
  const isCheckingConflicts = Boolean(
    result?.items.length && endDate >= startDate && repeatDays.length > 0 && !conflictPreview,
  );

  useEffect(() => {
    if (!result?.items.length || endDate < startDate || repeatDays.length === 0) return;

    let isCurrent = true;
    const queuedPreview = previewQueueRef.current.then(async () => {
      const preview = await previewScheduleConflicts(database, result.items, startDate, endDate, repeatDays);
      if (isCurrent) {
        setConflictResult({ key: conflictQueryKey, preview });
      }
    }).catch((error: unknown) => {
      if (isCurrent) {
        console.error('Could not check imported schedule conflicts.', error);
        Alert.alert('Could not check for conflicts', 'Your schedule has not been changed. Try again.');
      }
    });

    previewQueueRef.current = queuedPreview;
    return () => {
      isCurrent = false;
    };
  }, [conflictQueryKey, database, endDate, repeatDays, result, startDate]);

  const chooseDocument = async () => {
    if (isReading || isSaving) return;
    let controller: AbortController | null = null;
    try {
      const selection = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (selection.canceled) return;

      const file = selection.assets[0];
      controller = new AbortController();
      readingController.current = controller;
      setIsReading(true);
      setFileError(null);
      setResult(null);
      const extractedText = await extractScheduleText(file, controller.signal);
      if (controller.signal.aborted || readingController.current !== controller) return;
      if (!extractedText.trim()) {
        throw new Error('No selectable text was found. Scanned PDFs need OCR, which is not enabled yet.');
      }
      setFileName(file.name);
      setDocumentText(extractedText);
      const parsed = parseScheduleText(extractedText);
      setResult(parsed);
      if (parsed.items.length === 0) {
        Alert.alert(
          'No schedule blocks found',
          'The document text was extracted, but no time ranges matched. Try lines like “9:30-10:30 Review project”.',
        );
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') return;
      const message = error instanceof Error
        ? error.message
        : 'Check that the file is a valid PDF or DOCX and try again.';
      setFileError(message);
      Alert.alert('Could not read this file', message);
    } finally {
      if (controller && readingController.current === controller) {
        readingController.current = null;
        setIsReading(false);
      }
    }
  };

  const cancelDocumentReading = () => {
    readingController.current?.abort();
    readingController.current = null;
    setIsReading(false);
  };

  const parseText = () => {
    const parsed = parseScheduleText(documentText);
    setResult(parsed);
    if (parsed.items.length === 0) {
      Alert.alert('No schedule items found', 'Use a time range such as 9:30-10:30 followed by a task name.');
    }
  };

  const importTasks = async () => {
    if (!result?.items.length) return;
    if (endDate < startDate) {
      Alert.alert('Check your date range', 'The end date needs to be on or after the start date.');
      return;
    }
    if (repeatDays.length === 0 || dayCount === 0) {
      Alert.alert('Choose repeat days', 'Select at least one weekday for this schedule.');
      return;
    }
    setIsSaving(true);
    try {
      const outcome = await addRange(result.items, startDate, endDate, repeatDays);
      if (outcome.scheduledCount === 0 && outcome.conflictingCount > 0) {
        Alert.alert('No time blocks added', 'Every imported block overlaps an existing task. Adjust the times or choose another date range.');
        return;
      }
      Alert.alert(
        'Schedule imported',
        `${outcome.scheduledCount} ${outcome.scheduledCount === 1 ? 'task was' : 'tasks were'} added on ${outcome.dateCount} ${outcome.dateCount === 1 ? 'date' : 'dates'}.${outcome.conflictingCount > 0 ? ` ${outcome.conflictingCount} overlapping ${outcome.conflictingCount === 1 ? 'block was' : 'blocks were'} skipped.` : ''}`,
      );
      setDocumentText('');
      setFileName(null);
      setResult(null);
    } catch (error) {
      Alert.alert(
        'Import could not be completed',
        error instanceof Error ? error.message : 'Your schedule was not changed. Please try again.',
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <SpaceBackdrop />
      <ScreenTransition>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.kicker}>MAKE A PLAN FROM ANYWHERE</Text>
        <Text style={styles.title}>Build your timetable</Text>
        <Text style={styles.subtitle}>Import once. Plan your days your way.</Text>

        <View style={styles.previewCard}>
          <View style={styles.previewTop}>
            <View style={styles.documentIcon}><Text style={styles.documentGlyph}>▤</Text></View>
            <View style={styles.previewCopy}>
              <Text style={styles.previewTitle}>Import a schedule</Text>
              <Text style={styles.previewHint}>Read text from a PDF or DOCX file</Text>
            </View>
            <View style={styles.localBadge}><Text style={styles.localBadgeText}>ON DEVICE</Text></View>
          </View>
          {fileName && (
            <Text numberOfLines={1} style={styles.fileName}>Selected: {fileName}</Text>
          )}
          {fileError && <Text accessibilityRole="alert" style={styles.fileError}>{fileError}</Text>}
          <View style={styles.fileActions}>
            <CustomButton
              label={isReading ? 'Reading document…' : 'Choose PDF or DOCX'}
              onPress={() => { if (!isReading) void chooseDocument(); }}
              variant="secondary"
              style={isReading ? styles.readingButton : styles.chooseButton}
            />
            {isReading && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Cancel document reading"
                onPress={cancelDocumentReading}
                style={styles.cancelButton}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </Pressable>
            )}
          </View>
          <Text style={styles.orText}>OR PASTE TEXT</Text>
          <View style={styles.captureBox}>
            <Text style={styles.captureCaption}>PASTE YOUR SCHEDULE TEXT</Text>
            <TextInput
              accessibilityLabel="Schedule text"
              multiline
              value={documentText}
              onChangeText={(value) => {
                setDocumentText(value);
                setResult(null);
              }}
              placeholder={'09:00-10:00 Task name\n11:30-12:00 Another task'}
              placeholderTextColor="#9BA5B2"
              textAlignVertical="top"
              style={[styles.input, preferences.largeText && styles.largeInput]}
            />
          </View>
        </View>

        <View style={styles.rangeCard}>
          <View style={styles.rangeHeader}>
            <View style={styles.rangeIcon}><Text style={styles.rangeIconText}>▦</Text></View>
            <View style={styles.rangeCopy}>
              <Text style={styles.rangeTitle}>Schedule these dates</Text>
              <Text style={styles.rangeSubtitle}>Your timetable repeats each day in this range</Text>
            </View>
            <View style={styles.dayCountBadge}>
              <Text style={styles.dayCountValue}>{dayCount}</Text>
              <Text style={styles.dayCountLabel}>{dayCount === 1 ? 'DAY' : 'DAYS'}</Text>
            </View>
          </View>
          <View style={styles.rangeFields}>
            <Pressable
              accessibilityRole="button"
              onPress={() => setDatePickerTarget('start')}
              style={styles.dateField}
            >
              <Text style={styles.dateFieldLabel}>START DATE</Text>
              <View style={styles.dateFieldValueRow}>
                <Text style={styles.dateFieldGlyph}>↗</Text>
                <Text style={styles.dateFieldValue} numberOfLines={1}>{dateRangeLabel(startDate)}</Text>
              </View>
            </Pressable>
            <View style={styles.rangeConnector}><Text style={styles.rangeConnectorText}>→</Text></View>
            <Pressable
              accessibilityRole="button"
              onPress={() => setDatePickerTarget('end')}
              style={styles.dateField}
            >
              <Text style={styles.dateFieldLabel}>END DATE</Text>
              <View style={styles.dateFieldValueRow}>
                <Text style={styles.dateFieldGlyph}>⌖</Text>
                <Text style={styles.dateFieldValue} numberOfLines={1}>{dateRangeLabel(endDate)}</Text>
              </View>
            </Pressable>
          </View>
          <View style={styles.repeatHeader}>
            <Text style={styles.repeatLabel}>REPEAT ON</Text>
            <View style={styles.repeatPresets}>
              <Pressable onPress={() => setRepeatDays([1, 2, 3, 4, 5])} style={styles.repeatPreset}>
                <Text style={styles.repeatPresetText}>Weekdays</Text>
              </Pressable>
              <Pressable onPress={() => setRepeatDays([0, 6])} style={styles.repeatPreset}>
                <Text style={styles.repeatPresetText}>Weekends</Text>
              </Pressable>
              <Pressable onPress={() => setRepeatDays([0, 1, 2, 3, 4, 5, 6])} style={styles.repeatPreset}>
                <Text style={styles.repeatPresetText}>Every day</Text>
              </Pressable>
            </View>
          </View>
          <View style={styles.weekdayChips}>
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day, index) => {
              const selected = repeatDays.includes(index);
              return (
                <Pressable
                  key={day}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: selected }}
                  onPress={() => setRepeatDays((current) => selected
                    ? current.filter((item) => item !== index)
                    : [...current, index].sort((left, right) => left - right))}
                  style={[styles.weekdayChip, selected && styles.weekdayChipSelected]}
                >
                  <Text style={[styles.weekdayChipText, selected && styles.weekdayChipTextSelected]}>{day}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={styles.infoBanner}>
          <Text style={styles.infoGlyph}>i</Text>
          <Text style={styles.infoText}>Text blocks are repeated on every selected date. PDF and DOCX files are processed on your device.</Text>
        </View>

        <CustomButton label="Find time blocks" onPress={parseText} />

        {result && (
          <View style={styles.results}>
            <View style={styles.resultHeading}>
              <Text style={styles.resultTitle}>Found {result.items.length} {result.items.length === 1 ? 'block' : 'blocks'}</Text>
              {result.rejectedLines.length > 0 && (
                <Text style={styles.rejectedCount}>{result.rejectedLines.length} skipped</Text>
              )}
            </View>
            {result.items.map((item, index) => (
              <View key={`${item.startMinute}-${index}`} style={styles.parsedTask}>
                <View style={styles.parsedMark} />
                <View style={styles.parsedCopy}>
                  <Text style={styles.parsedName}>{item.title}</Text>
                  <Text style={styles.parsedTime}>{formatMinute(item.startMinute)} – {formatMinute(item.endMinute)}</Text>
                </View>
                <Text style={styles.parsedCheck}>✓</Text>
              </View>
            ))}
            {isCheckingConflicts && <Text style={styles.conflictInfo}>Checking existing tasks for overlaps…</Text>}
            {conflictPreview && conflictPreview.conflictingCount > 0 && (
              <View style={styles.conflictWarning}>
                <Text style={styles.conflictWarningTitle}>Schedule conflicts found</Text>
                <Text style={styles.conflictWarningText}>
                  {conflictPreview.conflictingCount} overlapping {conflictPreview.conflictingCount === 1 ? 'block' : 'blocks'} will be skipped. Other non-conflicting tasks can still be added.
                </Text>
              </View>
            )}
            {result.rejectedLines.map((line, index) => (
              <Text key={`${line}-${index}`} numberOfLines={2} style={styles.rejectedLine}>Skipped: {line}</Text>
            ))}
            {result.items.length > 0 && (
              <CustomButton
                label={isSaving ? 'Saving timetable…' : `Schedule ${result.items.length} ${result.items.length === 1 ? 'task' : 'tasks'} · ${dayCount} ${dayCount === 1 ? 'day' : 'days'}`}
                onPress={() => { void importTasks(); }}
                style={styles.importButton}
              />
            )}
          </View>
        )}

        <View style={styles.privacyNote}>
          <Text style={styles.privacyIcon}>⌑</Text>
          <View style={styles.privacyCopy}>
            <Text style={styles.privacyTitle}>Your plans stay yours</Text>
            <Text style={styles.privacyText}>Parsed text is processed on this device and is not uploaded.</Text>
          </View>
        </View>
      </ScrollView>
      {datePickerTarget && (
        <DatePickerModal
          key={`${datePickerTarget}-${startDate}-${endDate}`}
          visible
          title={datePickerTarget === 'start' ? 'Start scheduling' : 'Finish scheduling'}
          selectedDate={datePickerTarget === 'start' ? startDate : endDate}
          minimumDate={datePickerTarget === 'end' ? startDate : undefined}
          onSelect={(dateKey) => {
            if (datePickerTarget === 'start') {
              setStartDate(dateKey);
              if (endDate < dateKey) setEndDate(dateKey);
            } else {
              setEndDate(dateKey);
            }
          }}
          onClose={() => setDatePickerTarget(null)}
        />
      )}
      </ScreenTransition>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { width: '100%', maxWidth: 760, alignSelf: 'center', paddingHorizontal: 20, paddingTop: 14, paddingBottom: 35 },
  kicker: { color: colors.green, fontSize: 9, fontWeight: '800', letterSpacing: 1.4 },
  title: { color: colors.ink, fontSize: 25, fontWeight: '800', marginTop: 6, letterSpacing: -0.5 },
  subtitle: { color: colors.muted, fontSize: 12, marginTop: 5, marginBottom: 17 },
  previewCard: { backgroundColor: colors.surface, borderRadius: 21, padding: 16 },
  previewTop: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 15 },
  documentIcon: { width: 40, height: 40, borderRadius: 13, backgroundColor: colors.blueSoft, alignItems: 'center', justifyContent: 'center' },
  documentGlyph: { color: colors.blue, fontSize: 20, fontWeight: '800' },
  previewCopy: { flex: 1, gap: 4 },
  previewTitle: { color: colors.ink, fontSize: 12, fontWeight: '800' },
  previewHint: { color: colors.muted, fontSize: 9 },
  localBadge: { backgroundColor: colors.greenSoft, borderRadius: 7, paddingHorizontal: 7, paddingVertical: 5 },
  localBadgeText: { color: colors.green, fontSize: 7, fontWeight: '800', letterSpacing: 0.5 },
  captureBox: { minHeight: 196, borderRadius: 14, borderWidth: 1, borderStyle: 'dashed', borderColor: '#425873', padding: 12, position: 'relative' },
  fileActions: { flexDirection: 'row', alignItems: 'center', gap: 9, marginTop: 12 },
  chooseButton: { flex: 1 },
  readingButton: { opacity: 0.72 },
  cancelButton: { minHeight: 48, paddingHorizontal: 16, borderRadius: 15, borderWidth: 1, borderColor: colors.red, alignItems: 'center', justifyContent: 'center' },
  cancelButtonText: { color: colors.red, fontSize: 13, fontWeight: '800' },
  fileName: { color: colors.green, fontSize: 10, fontWeight: '700', marginTop: 12 },
  fileError: { color: colors.red, fontSize: 10, lineHeight: 15, marginTop: 10 },
  orText: { color: colors.muted, textAlign: 'center', fontSize: 8, fontWeight: '800', letterSpacing: 1, marginVertical: 12 },
  captureCaption: { color: colors.muted, fontSize: 8, fontWeight: '800', letterSpacing: 1 },
  input: { color: colors.ink, fontSize: 13, lineHeight: 22, minHeight: 145, marginTop: 8, padding: 0 },
  largeInput: { fontSize: 16, lineHeight: 26 },
  infoBanner: { flexDirection: 'row', gap: 9, backgroundColor: colors.yellowSoft, padding: 12, borderRadius: 13, marginVertical: 14 },
  infoGlyph: { color: colors.yellow, fontSize: 13, fontWeight: '800' },
  infoText: { flex: 1, color: '#E3C78C', fontSize: 10, lineHeight: 15 },
  results: { marginTop: 19, backgroundColor: colors.surface, borderRadius: 19, padding: 15 },
  resultHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  resultTitle: { color: colors.ink, fontSize: 14, fontWeight: '800' },
  rejectedCount: { color: colors.red, fontSize: 9, fontWeight: '700' },
  parsedTask: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.line },
  parsedMark: { width: 4, height: 29, backgroundColor: colors.green, borderRadius: 2 },
  parsedCopy: { flex: 1, gap: 4 },
  parsedName: { color: colors.ink, fontSize: 11, fontWeight: '700' },
  parsedTime: { color: colors.muted, fontSize: 9 },
  parsedCheck: { color: colors.green, fontSize: 15, fontWeight: '800' },
  conflictInfo: { color: colors.muted, fontSize: 9, marginTop: 10 },
  conflictWarning: { backgroundColor: colors.yellowSoft, borderRadius: 12, padding: 11, marginTop: 10 },
  conflictWarningTitle: { color: colors.yellow, fontSize: 10, fontWeight: '800' },
  conflictWarningText: { color: '#E3C78C', fontSize: 9, lineHeight: 14, marginTop: 4 },
  rejectedLine: { color: colors.red, fontSize: 9, paddingTop: 8 },
  importButton: { marginTop: 12 },
  privacyNote: { flexDirection: 'row', gap: 10, marginTop: 18, padding: 15, backgroundColor: colors.surface, borderRadius: 16 },
  privacyIcon: { color: colors.green, fontSize: 18, fontWeight: '800' },
  privacyCopy: { flex: 1, gap: 4 },
  privacyTitle: { color: colors.ink, fontSize: 11, fontWeight: '800' },
  privacyText: { color: colors.muted, fontSize: 9, lineHeight: 14 },
  rangeCard: { backgroundColor: colors.surface, borderRadius: 20, padding: 15, marginTop: 2 },
  rangeHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 },
  rangeIcon: { width: 38, height: 38, borderRadius: 13, backgroundColor: colors.greenSoft, alignItems: 'center', justifyContent: 'center' },
  rangeIconText: { color: colors.green, fontSize: 18, fontWeight: '800' },
  rangeCopy: { flex: 1, gap: 4 },
  rangeTitle: { color: colors.ink, fontSize: 12, fontWeight: '800' },
  rangeSubtitle: { color: colors.muted, fontSize: 9 },
  dayCountBadge: { alignItems: 'center', justifyContent: 'center', minWidth: 39, height: 39, backgroundColor: colors.navy, borderRadius: 13 },
  dayCountValue: { color: '#FFFFFF', fontSize: 13, fontWeight: '800', lineHeight: 15 },
  dayCountLabel: { color: '#AAB9CC', fontSize: 6, fontWeight: '800', letterSpacing: 0.6 },
  rangeFields: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  repeatHeader: { marginTop: 14, gap: 9 },
  repeatLabel: { color: colors.muted, fontSize: 8, fontWeight: '800', letterSpacing: 1 },
  repeatPresets: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  repeatPreset: { borderRadius: 9, backgroundColor: colors.background, paddingHorizontal: 9, paddingVertical: 6 },
  repeatPresetText: { color: colors.green, fontSize: 9, fontWeight: '800' },
  weekdayChips: { flexDirection: 'row', justifyContent: 'space-between', gap: 5, marginTop: 10 },
  weekdayChip: { flex: 1, minHeight: 34, borderRadius: 10, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  weekdayChipSelected: { backgroundColor: colors.greenSoft, borderColor: colors.green },
  weekdayChipText: { color: colors.muted, fontSize: 9, fontWeight: '700' },
  weekdayChipTextSelected: { color: colors.green },
  dateField: { flex: 1, minHeight: 58, borderWidth: 1, borderColor: colors.line, borderRadius: 12, padding: 9, justifyContent: 'center' },
  dateFieldLabel: { color: colors.muted, fontSize: 7, fontWeight: '800', letterSpacing: 0.8 },
  dateFieldValueRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 6 },
  dateFieldGlyph: { color: colors.green, fontSize: 12, fontWeight: '800' },
  dateFieldValue: { flex: 1, color: colors.ink, fontSize: 9, fontWeight: '700' },
  rangeConnector: { width: 15, alignItems: 'center' },
  rangeConnectorText: { color: colors.green, fontSize: 13, fontWeight: '800' },
});
