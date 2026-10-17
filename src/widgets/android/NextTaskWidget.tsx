import { FlexWidget, TextWidget } from 'react-native-android-widget';
import type { WidgetTaskSummary } from '../taskSummary';

export function NextTaskWidget({ task }: { task: WidgetTaskSummary }) {
  return (
    <FlexWidget
      style={{
        width: 'match_parent',
        height: 'match_parent',
        padding: 14,
        borderRadius: 18,
        backgroundColor: '#101B2E',
        flexDirection: 'column',
        justifyContent: 'center',
      }}
    >
      <TextWidget text={`FLEXICAL · ${task.state}`} style={{ color: '#5BE0C2', fontSize: 10, fontWeight: 'bold' }} />
      <TextWidget text={task.title} style={{ color: '#FFFFFF', fontSize: 18, fontWeight: 'bold', marginTop: 8 }} maxLines={2} truncate="END" />
      <TextWidget text={task.time} style={{ color: '#B7C5D8', fontSize: 12, marginTop: 5 }} />
    </FlexWidget>
  );
}
