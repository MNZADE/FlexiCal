import { Platform } from 'react-native';

if (Platform.OS === 'android') {
  require('./src/widgets/androidWidget');
}

require('expo-router/entry');
