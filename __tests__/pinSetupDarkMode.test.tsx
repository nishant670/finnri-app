import React from 'react';
import { StyleSheet } from 'react-native';
import { render } from '@testing-library/react-native';

import { AuthPinSetupScreen } from '@/components/auth/AuthPinSetupScreen';
import { Colors } from '@/constants/theme';

jest.mock('@/hooks/use-color-scheme', () => ({ useColorScheme: () => 'dark' }));

// The PIN screen drew a fixed light palette — #FDFBFF page, navy title, white
// keys — so in dark mode it stayed a bright screen in a dark app.
it('draws the PIN screen in the dark palette', async () => {
  const screen = await render(<AuthPinSetupScreen onComplete={jest.fn()} onCancel={jest.fn()} />);
  const dark = Colors.dark;

  const title = StyleSheet.flatten(screen.getByText('Create your PIN').props.style);
  expect(title.color).toBe(dark.text);

  const digit = screen.getByText('5');
  expect(StyleSheet.flatten(digit.props.style).color).toBe(dark.text);
  let key = digit.parent;
  while (key && StyleSheet.flatten(key.props.style)?.backgroundColor === undefined) key = key.parent;
  expect(StyleSheet.flatten(key?.props.style).backgroundColor).toBe(dark.card);
});
