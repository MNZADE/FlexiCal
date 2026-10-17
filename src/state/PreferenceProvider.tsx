import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useSQLiteContext } from 'expo-sqlite';

export type PreferenceKey = 'largeText' | 'reducedMotion' | 'breakReminders';
export type Preferences = Record<PreferenceKey, boolean>;
export type TaskAlertTone = { uri: string; name: string } | null;

const defaults: Preferences = {
  largeText: false,
  reducedMotion: false,
  breakReminders: false,
};

type PreferenceContextValue = {
  preferences: Preferences;
  taskAlertTone: TaskAlertTone;
  updatePreference: (key: PreferenceKey, value: boolean) => Promise<void>;
  updateTaskAlertTone: (tone: TaskAlertTone) => Promise<void>;
};

const PreferenceContext = createContext<PreferenceContextValue | null>(null);

export function PreferenceProvider({ children }: { children: ReactNode }) {
  const database = useSQLiteContext();
  const [preferences, setPreferences] = useState(defaults);
  const [taskAlertTone, setTaskAlertTone] = useState<TaskAlertTone>(null);

  useEffect(() => {
    let isCurrent = true;
    void database.getAllAsync<{ key: string; value: string }>(
      'SELECT key, value FROM app_preferences',
    ).then((rows) => {
      if (!isCurrent) return;
      setPreferences((current) => {
        const loaded = { ...current };
        for (const { key, value } of rows) {
          if (key === 'largeText' || key === 'reducedMotion' || key === 'breakReminders') {
            loaded[key] = value === 'true';
          }
        }
        return loaded;
      });
      const uri = rows.find((row) => row.key === 'taskAlertToneUri')?.value;
      const name = rows.find((row) => row.key === 'taskAlertToneName')?.value;
      setTaskAlertTone(uri && name ? { uri, name } : null);
    }).catch((error: unknown) => {
      console.error('Could not load app preferences.', error);
    });
    return () => {
      isCurrent = false;
    };
  }, [database]);

  const updatePreference = useCallback(async (key: PreferenceKey, value: boolean) => {
    await database.runAsync(
      'INSERT INTO app_preferences (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
      key,
      String(value),
    );
    setPreferences((current) => ({ ...current, [key]: value }));
  }, [database]);

  const updateTaskAlertTone = useCallback(async (tone: TaskAlertTone) => {
    await database.withTransactionAsync(async () => {
      await database.runAsync(
        'INSERT INTO app_preferences (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
        'taskAlertToneUri',
        tone?.uri ?? '',
      );
      await database.runAsync(
        'INSERT INTO app_preferences (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
        'taskAlertToneName',
        tone?.name ?? '',
      );
    });
    setTaskAlertTone(tone);
  }, [database]);

  const value = useMemo(
    () => ({ preferences, taskAlertTone, updatePreference, updateTaskAlertTone }),
    [preferences, taskAlertTone, updatePreference, updateTaskAlertTone],
  );
  return <PreferenceContext.Provider value={value}>{children}</PreferenceContext.Provider>;
}

export function usePreferences() {
  const context = useContext(PreferenceContext);
  if (!context) throw new Error('usePreferences must be used inside PreferenceProvider');
  return context;
}
