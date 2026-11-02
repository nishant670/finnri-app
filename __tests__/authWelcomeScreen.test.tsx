import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';

import { AuthScreen1 } from '@/components/auth/AuthScreen1';

describe('welcome screen', () => {
  it('makes guest the primary action and Google the account path', async () => {
    const onGuest = jest.fn();
    const onGoogle = jest.fn();
    const screen = await render(
      <AuthScreen1 onGuest={onGuest} onIdentifier={jest.fn()} onGoogle={onGoogle} />
    );

    // The accent button — the one thing on the screen that leads straight to
    // the app — is the guest path.
    await fireEvent.press(screen.getByText('Start for free'));
    expect(onGuest).toHaveBeenCalledTimes(1);

    await fireEvent.press(screen.getByText('Continue with Google'));
    expect(onGoogle).toHaveBeenCalledTimes(1);
  });

  // Email and phone sign-in are off for launch and the backend refuses OTP
  // outright, so this button would lead to a 503 on the one screen a person
  // cannot get past.
  it('does not offer the email path while OTP sign-in is off', async () => {
    const onIdentifier = jest.fn();
    const screen = await render(
      <AuthScreen1 onGuest={jest.fn()} onIdentifier={onIdentifier} onGoogle={jest.fn()} />
    );

    expect(screen.queryByText('Use email or mobile')).toBeNull();
  });

  it('states the guest terms up front instead of on a screen after the tap', async () => {
    const screen = await render(
      <AuthScreen1 onGuest={jest.fn()} onIdentifier={jest.fn()} onGoogle={jest.fn()} />
    );

    // Guest entries live on Finnri's server under a guest ID this phone keeps,
    // so the promise is about the phone, not about where the data is stored.
    expect(screen.getByText(/Your entries stay linked to this phone until you sign in/)).toBeTruthy();
    expect(screen.queryByText(/stays on this device/)).toBeNull();
    expect(screen.getByText('No bank login needed')).toBeTruthy();
  });

  it('locks every action while a check-in is in flight', async () => {
    const onGoogle = jest.fn();
    const screen = await render(
      <AuthScreen1
        onGuest={jest.fn()}
        onIdentifier={jest.fn()}
        onGoogle={onGoogle}
        isGuestLoading
      />
    );

    await fireEvent.press(screen.getByText('Continue with Google'));
    expect(onGoogle).not.toHaveBeenCalled();
  });

  // A guest arriving from "save your workspace" already has data. Showing them
  // the first-run pitch and "Start for free" describes someone else's problem.
  describe('when a guest arrives to save their workspace', () => {
    const renderLink = () =>
      render(
        <AuthScreen1 mode="link" onGuest={jest.fn()} onIdentifier={jest.fn()} onGoogle={jest.fn()} />
      );

    it('is about keeping the data, not starting', async () => {
      const screen = await renderLink();
      expect(screen.getByText('Save your workspace')).toBeTruthy();
      expect(screen.queryByText('Track money the way you talk')).toBeNull();
    });

    it('offers a way to back out that does not read as starting over', async () => {
      const screen = await renderLink();
      expect(screen.getByText('Keep using guest')).toBeTruthy();
      expect(screen.queryByText('Start for free')).toBeNull();
    });

    it('says plainly what staying a guest costs', async () => {
      const screen = await renderLink();
      expect(screen.getByText(/Clearing app data or changing phone loses them/)).toBeTruthy();
    });
  });
});
