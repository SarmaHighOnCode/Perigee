import { palette } from '@perigee/design-tokens';
import { Stack } from 'expo-router';

import { AppProviders } from '../src/providers/AppProviders';

export const unstable_settings = { initialRouteName: 'index' };

export default function RootLayout() {
  return (
    <AppProviders>
      <Stack
        screenOptions={{
          animation: 'slide_from_right',
          contentStyle: { backgroundColor: palette.canvasSoft },
          headerShown: false,
        }}
      />
    </AppProviders>
  );
}
