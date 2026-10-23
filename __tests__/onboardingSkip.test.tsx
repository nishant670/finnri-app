import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import React from 'react';
import { StyleSheet } from 'react-native';

const mockReplace = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace }),
}));

import OnboardingScreen from '@/app/onboarding';

describe('onboarding Skip', () => {
  beforeEach(async () => {
    mockReplace.mockClear();
    jest.restoreAllMocks();
    // The storage mock is shared across tests in this file, and the first test
    // legitimately writes the completion flag. Left behind, it makes the guard
    // redirect the next test before a slide ever renders.
    await AsyncStorage.clear();
  });

  it('leaves onboarding from the very first slide', async () => {
    const screen = await render(<OnboardingScreen />);

    // The guard reads the flag before rendering anything, so wait for the
    // first slide rather than the null it returns until then.
    const skip = await waitFor(() => screen.getByText('Skip'));
    await fireEvent.press(skip);

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/auth'));
  });

  it('keeps Skip out of the slide, which is clipped to its own box', async () => {
    // Skip spent four builds dead at the top of the screen. The cause was the
    // animated slide reaching up over the header, invisibly, not where Skip
    // was drawn. R13 puts it back at the top right, so this pins the fix:
    // Skip is not inside the slide, and the slide cannot draw outside its box.
    const screen = await render(<OnboardingScreen />);

    const skip = await waitFor(() => screen.getByTestId('onboarding-skip'));
    const slideBox = screen.getByTestId('onboarding-slide');

    expect(StyleSheet.flatten(slideBox.props.style).overflow).toBe('hidden');
    expect(slideBox).not.toContainElement(skip);
    expect(screen.getByTestId('onboarding-progress')).not.toContainElement(skip);
  });

  it('leaves Get started to do it alone on the last slide', async () => {
    const screen = await render(<OnboardingScreen />);
    await waitFor(() => screen.getByText('Next'));

    // `handleNext` defers the index change to a timeout, so each press needs
    // the queue drained before the next slide's button exists.
    for (let slide = 0; slide < 3; slide += 1) {
      await fireEvent.press(screen.getByText('Next'));
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
    }

    await waitFor(() => screen.getByText('Get started'));
    expect(screen.queryByText('Skip')).toBeNull();
  });

  it('still leaves when the completion flag cannot be written', async () => {
    // A failed write used to reject inside the press handler and navigate
    // nowhere — the button looked dead for a reason that had nothing to do
    // with where it was drawn.
    jest.spyOn(AsyncStorage, 'setItem').mockRejectedValueOnce(new Error('disk full'));

    const screen = await render(<OnboardingScreen />);
    const skip = await waitFor(() => screen.getByText('Skip'));
    await fireEvent.press(skip);

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/auth'));
  });
});
