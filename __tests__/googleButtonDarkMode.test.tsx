import React from 'react';
import { StyleSheet } from 'react-native';
import { render } from '@testing-library/react-native';

import { AuthScreen1 } from '@/components/auth/AuthScreen1';
import { GOOGLE_BUTTON_INK } from '@/components/auth/styles';

jest.mock('@/hooks/use-color-scheme', () => ({ useColorScheme: () => 'dark' }));

// The Google button keeps its white fill in dark mode, so its label cannot take
// the theme's text colour: in dark mode that is white too, and the label vanished.
it('keeps the Google label dark on its white button in dark mode', async () => {
  const screen = await render(
    <AuthScreen1 onGuest={jest.fn()} onIdentifier={jest.fn()} onGoogle={jest.fn()} />
  );

  const label = screen.getByText('Continue with Google');
  expect(StyleSheet.flatten(label.props.style).color).toBe(GOOGLE_BUTTON_INK);
});
