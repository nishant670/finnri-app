import React from 'react';
import { StyleSheet } from 'react-native';
import { render } from '@testing-library/react-native';

import { AuthScreen1 } from '@/components/auth/AuthScreen1';
import { Colors } from '@/constants/theme';

jest.mock('@/hooks/use-color-scheme', () => ({ useColorScheme: () => 'dark' }));

// The Google button used to keep a fixed white fill while its label took the
// theme's text colour, which in dark mode is white too: the label vanished.
// R13-Welcome draws it on the card fill with the theme's ink, in both modes.
it('draws the Google button on the card fill with readable ink in dark mode', async () => {
  const screen = await render(
    <AuthScreen1 onGuest={jest.fn()} onIdentifier={jest.fn()} onGoogle={jest.fn()} />
  );

  const dark = Colors.dark;
  const button = StyleSheet.flatten(screen.getByTestId('welcome-google').props.style);
  const label = StyleSheet.flatten(screen.getByText('Continue with Google').props.style);

  expect(button.backgroundColor).toBe(dark.card);
  expect(label.color).toBe(dark.text);
  expect(label.color).not.toBe(button.backgroundColor);
});
