import { useMemo } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppText as Text } from '../../components/AppText';
import { colors } from '../../config/constants';
import { todayDateKey } from '../../config/database';
import { useTasks } from '../../state/TaskProvider';
import { formatDuration } from '../../utils/time';
import { SpaceBackdrop, ScreenTransition } from '../../components/SpaceScene';

export function AnalyticsScreen() {
  const { tasks, selectedDate } = useTasks();
  const selectedIsToday = selectedDate === todayDateKey();
  const dayLabel = selectedIsToday
    ? 'today'
    : new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(
        new Date(`${selectedDate}T00:00:00`),
      );
  const { stats, categoryBreakdown } = useMemo(() => {
    const completed = tasks.filter((task) => task.status === 'complete');
    const totalScheduled = tasks.reduce((sum, task) => sum + task.endMinute - task.startMinute, 0);
    const completedMinutes = completed.reduce((sum, task) => sum + task.endMinute - task.startMinute, 0);
    const categories = tasks.reduce<Record<string, number>>((totals, task) => {
      totals[task.category] = (totals[task.category] ?? 0) + task.endMinute - task.startMinute;
      return totals;
    }, {});
    return {
      stats: {
        completion: tasks.length ? Math.round((completed.length / tasks.length) * 100) : 0,
        completedMinutes,
        totalScheduled,
        deepWorkMinutes: categories['Deep work'] ?? 0,
        completedCount: completed.length,
      },
      categoryBreakdown: Object.entries(categories).map(([category, minutes]) => ({ category, minutes })),
    };
  }, [tasks]);
  const longestCategory = Math.max(...categoryBreakdown.map((item) => item.minutes), 1);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <SpaceBackdrop />
      <ScreenTransition>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.kicker}>SMALL WINS ADD UP</Text>
        <Text style={styles.title}>Your insights</Text>
        <Text style={styles.subtitle}>A clearer picture of how your time flows.</Text>

        <View style={styles.summaryCard}>
          <View style={styles.summaryTop}>
            <View>
              <Text style={styles.summaryLabel}>{selectedIsToday ? 'TODAY' : dayLabel.toUpperCase()} COMPLETION</Text>
              <Text style={styles.percentage}>{stats.completion}<Text style={styles.percentMark}>%</Text></Text>
            </View>
            <View style={styles.completionRing}>
              <Text style={styles.ringCheck}>✓</Text>
            </View>
          </View>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${stats.completion}%` }]} />
          </View>
          <Text style={styles.summaryFoot}>{stats.completedCount} of {tasks.length} tasks completed</Text>
        </View>

        <View style={styles.statRow}>
          <MetricCard label="FOCUS TIME" value={formatDuration(stats.completedMinutes)} detail={`completed ${dayLabel}`} tint={colors.blueSoft} accent={colors.blue} />
          <MetricCard label="DEEP WORK" value={formatDuration(stats.deepWorkMinutes)} detail={`planned ${dayLabel}`} tint={colors.purpleSoft} accent={colors.purple} />
        </View>

        <View style={styles.chartCard}>
          <View style={styles.chartHeading}>
            <View>
              <Text style={styles.cardTitle}>Time by category</Text>
              <Text style={styles.cardSub}>Planned on {dayLabel}</Text>
            </View>
            <Text style={styles.chartRange}>{selectedIsToday ? 'TODAY' : dayLabel.toUpperCase()}</Text>
          </View>
          <View style={styles.categoryChart}>
            {categoryBreakdown.map((item) => (
              <View key={item.category} style={styles.categoryRow}>
                <View style={styles.categoryHeading}>
                  <View style={[styles.categoryDot, { backgroundColor: categoryColor(item.category) }]} />
                  <Text style={styles.categoryName}>{item.category}</Text>
                  <Text style={styles.categoryValue}>{formatDuration(item.minutes)}</Text>
                </View>
                <View style={styles.categoryTrack}>
                  <View
                    style={[
                      styles.categoryFill,
                      {
                        width: `${(item.minutes / longestCategory) * 100}%`,
                        backgroundColor: categoryColor(item.category),
                      },
                    ]}
                  />
                </View>
              </View>
            ))}
            {categoryBreakdown.length === 0 && <Text style={styles.noData}>Add tasks to see your category mix.</Text>}
          </View>
        </View>

        <View style={styles.breakdownCard}>
          <Text style={styles.cardTitle}>{selectedIsToday ? 'Today at a glance' : 'Day at a glance'}</Text>
          <View style={styles.breakdownRow}>
            <View style={styles.breakdownIcon}><Text style={styles.breakdownGlyph}>◷</Text></View>
            <View style={styles.breakdownCopy}>
              <Text style={styles.breakdownTitle}>Time planned</Text>
              <Text style={styles.breakdownSub}>Across all categories</Text>
            </View>
            <Text style={styles.breakdownValue}>{formatDuration(stats.totalScheduled)}</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.breakdownRow}>
            <View style={[styles.breakdownIcon, { backgroundColor: colors.greenSoft }]}><Text style={[styles.breakdownGlyph, { color: colors.green }]}>✓</Text></View>
            <View style={styles.breakdownCopy}>
              <Text style={styles.breakdownTitle}>Finished tasks</Text>
              <Text style={styles.breakdownSub}>Showing up is progress</Text>
            </View>
            <Text style={styles.breakdownValue}>{stats.completedCount}</Text>
          </View>
        </View>
      </ScrollView>
      </ScreenTransition>
    </SafeAreaView>
  );
}

function MetricCard({ label, value, detail, tint, accent }: { label: string; value: string; detail: string; tint: string; accent: string }) {
  return (
    <View style={styles.metricCard}>
      <View style={[styles.metricDot, { backgroundColor: tint }]}><View style={[styles.metricDotInner, { backgroundColor: accent }]} /></View>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricDetail}>{detail}</Text>
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
  content: { width: '100%', maxWidth: 760, alignSelf: 'center', paddingHorizontal: 20, paddingTop: 14, paddingBottom: 30 },
  kicker: { color: colors.green, fontSize: 9, fontWeight: '800', letterSpacing: 1.5 },
  title: { color: colors.ink, fontSize: 28, fontWeight: '800', marginTop: 6, letterSpacing: -0.7 },
  subtitle: { color: colors.muted, fontSize: 12, marginTop: 5, marginBottom: 20 },
  summaryCard: { padding: 19, backgroundColor: colors.navy, borderRadius: 22 },
  summaryTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  summaryLabel: { color: '#A8B7CC', fontSize: 9, fontWeight: '800', letterSpacing: 1.2 },
  percentage: { color: '#FFFFFF', fontSize: 39, fontWeight: '800', marginTop: 5 },
  percentMark: { fontSize: 21, color: '#8DE1C1' },
  completionRing: { width: 54, height: 54, borderRadius: 27, borderWidth: 2, borderColor: '#4CC99E', alignItems: 'center', justifyContent: 'center' },
  ringCheck: { color: '#69DAB2', fontSize: 21, fontWeight: '800' },
  progressTrack: { height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.14)', marginTop: 14, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 3, backgroundColor: '#48C99B' },
  summaryFoot: { color: '#A8B7CC', fontSize: 10, marginTop: 9 },
  statRow: { flexDirection: 'row', gap: 11, marginTop: 12 },
  metricCard: { flex: 1, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, padding: 15, borderRadius: 18, minHeight: 125 },
  metricDot: { width: 25, height: 25, borderRadius: 9, alignItems: 'center', justifyContent: 'center', marginBottom: 9 },
  metricDotInner: { width: 8, height: 8, borderRadius: 4 },
  metricLabel: { color: colors.muted, fontSize: 8, fontWeight: '800', letterSpacing: 0.8 },
  metricValue: { color: colors.ink, fontSize: 20, fontWeight: '800', marginTop: 4 },
  metricDetail: { color: colors.muted, fontSize: 9, marginTop: 3 },
  chartCard: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: 20, padding: 18, marginTop: 13 },
  chartHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardTitle: { color: colors.ink, fontSize: 14, fontWeight: '800' },
  cardSub: { color: colors.muted, fontSize: 10, marginTop: 4 },
  chartRange: { color: colors.green, fontSize: 8, fontWeight: '800', letterSpacing: 0.8 },
  categoryChart: { gap: 14, marginTop: 17 },
  categoryRow: { gap: 7 },
  categoryHeading: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  categoryDot: { width: 7, height: 7, borderRadius: 4 },
  categoryName: { flex: 1, color: colors.ink, fontSize: 10, fontWeight: '700' },
  categoryValue: { color: colors.muted, fontSize: 9, fontWeight: '700' },
  categoryTrack: { height: 6, borderRadius: 3, backgroundColor: colors.line, overflow: 'hidden' },
  categoryFill: { height: '100%', borderRadius: 3 },
  noData: { color: colors.muted, fontSize: 10, paddingVertical: 8 },
  breakdownCard: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: 20, padding: 18, marginTop: 13 },
  breakdownRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, gap: 11 },
  breakdownIcon: { width: 36, height: 36, borderRadius: 12, backgroundColor: colors.blueSoft, alignItems: 'center', justifyContent: 'center' },
  breakdownGlyph: { color: colors.blue, fontSize: 17, fontWeight: '800' },
  breakdownCopy: { flex: 1, gap: 3 },
  breakdownTitle: { color: colors.ink, fontSize: 11, fontWeight: '700' },
  breakdownSub: { color: colors.muted, fontSize: 9 },
  breakdownValue: { color: colors.ink, fontSize: 13, fontWeight: '800' },
  divider: { height: 1, backgroundColor: colors.line },
});
