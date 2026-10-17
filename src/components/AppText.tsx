import { StyleSheet, Text as NativeText, type TextProps, type TextStyle } from 'react-native';
import { usePreferences } from '../state/PreferenceProvider';

export function AppText({ style, ...props }: TextProps) {
  const { preferences } = usePreferences();
  const flattenedStyle = StyleSheet.flatten(style) ?? {};
  const fontSize = flattenedStyle.fontSize;
  const scaledStyle: TextStyle =
    preferences.largeText && typeof fontSize === 'number'
      ? { ...flattenedStyle, fontSize: Math.round(fontSize * 1.2) }
      : flattenedStyle;

  return <NativeText {...props} style={scaledStyle} />;
}
