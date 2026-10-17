import { Text, VStack } from '@expo/ui/swift-ui';
import { font, foregroundStyle } from '@expo/ui/swift-ui/modifiers';
import { createWidget, type WidgetEnvironment } from 'expo-widgets';

type NextTaskProps = {
  title: string;
  state: string;
  time: string;
};

const NextTaskWidgetView = (props: NextTaskProps, environment: WidgetEnvironment) => {
  'widget';
  const titleSize = environment.widgetFamily === 'systemSmall' ? 15 : 19;
  return (
    <VStack>
      <Text modifiers={[font({ weight: 'bold', size: 10 }), foregroundStyle('#5BE0C2')]}>
        FLEXICAL · {props.state}
      </Text>
      <Text modifiers={[font({ weight: 'bold', size: titleSize }), foregroundStyle('#FFFFFF')]}>
        {props.title}
      </Text>
      <Text modifiers={[font({ size: 12 }), foregroundStyle('#B7C5D8')]}>{props.time}</Text>
    </VStack>
  );
};

export default createWidget<NextTaskProps>('FlexiCalNextTask', NextTaskWidgetView);
