import { Tabs } from 'expo-router';
import { SQLiteProvider } from 'expo-sqlite';
import { Text } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { colors } from '../config/constants';
import { initializeDatabase } from '../config/database';
import { TaskProvider } from '../state/TaskProvider';
import { PreferenceProvider } from '../state/PreferenceProvider';
import { OpeningScreen } from '../components/OpeningScreen';

const tabIcons: Record<string, string> = {
  index: '◉',
  calendar: '▦',
  analytics: '▥',
  documents: '▤',
};

function AppTabs() {
  return (
    <Tabs
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.green,
        tabBarInactiveTintColor: '#71819A',
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.line,
          height: 68,
          paddingTop: 8,
          paddingBottom: 8,
          elevation: 0,
        },
        tabBarLabelStyle: { fontSize: 9, fontWeight: '700', marginTop: 1 },
        tabBarIcon: ({ color }) => (
          <Text style={{ color, fontSize: 18, fontWeight: '700' }}>{tabIcons[route.name]}</Text>
        ),
      })}
    >
      <Tabs.Screen name="index" options={{ title: 'Today' }} />
      <Tabs.Screen name="calendar" options={{ title: 'Calendar' }} />
      <Tabs.Screen name="analytics" options={{ title: 'Insights' }} />
      <Tabs.Screen name="documents" options={{ title: 'Import' }} />
      <Tabs.Screen name="settings" options={{ href: null }} />
    </Tabs>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <SQLiteProvider databaseName="flexical.db" onInit={initializeDatabase}>
        <PreferenceProvider>
          <TaskProvider>
            <StatusBar style="light" />
            <AppTabs />
            <OpeningScreen />
          </TaskProvider>
        </PreferenceProvider>
      </SQLiteProvider>
    </SafeAreaProvider>
  );
}
