import { cleanup, render } from '@testing-library/react-native';
import React from 'react';
import { StyleSheet, type TextStyle } from 'react-native';

import {
  ThemedText,
  type ThemedTextProps,
  type ThemedTextTone,
} from '@/components/themed-text';
import { getMoodColors, ThemeMoods, type ThemeMoodId } from '@/constants/theme';
import { useAppMoodStore } from '@/hooks/use-app-mood-store';

/**
 * Text on the accent fill must be the on-accent ink in *both* modes.
 *
 * `className="text-white"` could not do this: `ThemedText` passes its colour in
 * the `style` prop, and NativeWind ranks inline styles above class rules, so
 * the class was dropped and the label took the theme's ink instead — near-black
 * on the light theme, near-white on the dark one. On the orange accent that
 * read as a badge whose number changed colour with the time of day.
 */

/** The flattened style a rendered `ThemedText` actually applies. */
function styleOf(element: { props: { style?: unknown } }): TextStyle {
  return (StyleSheet.flatten(element.props.style as never) ?? {}) as TextStyle;
}

/**
 * The colour a `ThemedText` lands on under a given mood.
 *
 * Mounted and unmounted inside the one call so the mood is only ever set while
 * nothing is on screen — switching it under a live tree is a state update
 * outside `act`, which is a warning rather than a fact about the component.
 */
async function colorUnder(
  { nightMode, themeColor = 'finnri' }: { nightMode: boolean; themeColor?: ThemeMoodId },
  props: ThemedTextProps = {}
) {
  useAppMoodStore.setState({ appearance: nightMode ? 'dark' : 'light', themeColor });
  const screen = await render(<ThemedText {...props}>Label</ThemedText>);
  const color = styleOf(screen.getByText('Label')).color;
  await cleanup();
  return color;
}

afterEach(() => {
  useAppMoodStore.setState({ appearance: 'light', themeColor: 'finnri' });
});

describe('ThemedText tone', () => {
  it("is the mood's on-accent ink in light mode", async () => {
    // Finnri's coral is too light for white (2.3:1), so its labels take the
    // mood's dark ink instead.
    expect(await colorUnder({ nightMode: false }, { tone: 'onAccent' })).toBe('#2D2D2D');
  });

  it('is the same ink in dark mode — the accent under it did not invert', async () => {
    expect(await colorUnder({ nightMode: true }, { tone: 'onAccent' })).toBe('#2D2D2D');
    expect(await colorUnder({ nightMode: true }, { tone: 'onAccent' })).not.toBe(
      ThemeMoods.finnri.dark.text
    );
  });

  it('is white only on the moods whose accent is deep enough for it', async () => {
    expect(getMoodColors('finnri').light.onAccent).toBe('#2D2D2D');
    expect(getMoodColors('mint').light.onAccent).toBe('#182C24');
    expect(getMoodColors('sky').light.onAccent).toBe('#FFFFFF');
    expect(getMoodColors('plum').light.onAccent).toBe('#FFFFFF');
  });

  it('does not change colour between the two modes', async () => {
    expect(await colorUnder({ nightMode: false }, { tone: 'onAccent' })).toBe(
      await colorUnder({ nightMode: true }, { tone: 'onAccent' })
    );
  });

  it('holds for every mood, since each one fills with its own accent', async () => {
    for (const themeColor of Object.keys(ThemeMoods) as ThemeMoodId[]) {
      for (const nightMode of [false, true]) {
        expect({
          themeColor,
          nightMode,
          color: await colorUnder({ nightMode, themeColor }, { tone: 'onAccent' }),
        }).toEqual({
          themeColor,
          nightMode,
          color: getMoodColors(themeColor)[nightMode ? 'dark' : 'light'].onAccent,
        });
      }
    }
  });

  it('leaves ordinary text on the theme ink, which does follow the mode', async () => {
    expect(await colorUnder({ nightMode: false })).toBe(ThemeMoods.finnri.light.text);
    expect(await colorUnder({ nightMode: true })).toBe(ThemeMoods.finnri.dark.text);
  });

  it('still yields to an explicit colour from the caller', async () => {
    expect(
      await colorUnder({ nightMode: false }, { tone: 'onAccent', style: { color: '#123456' } })
    ).toBe('#123456');
  });

  it('resolves every tone to its own token, in both modes and every mood', async () => {
    // The tones are the only way colour reaches this component, so each one
    // has to land on the token it names rather than on the default ink.
    const tones: Record<Exclude<ThemedTextTone, 'default'>, string> = {
      muted: 'muted',
      mutedStrong: 'mutedStrong',
      onAccent: 'onAccent',
      positive: 'positive',
      negative: 'negative',
      warning: 'warning',
    };

    for (const themeColor of Object.keys(ThemeMoods) as ThemeMoodId[]) {
      for (const nightMode of [false, true]) {
        const palette = getMoodColors(themeColor)[nightMode ? 'dark' : 'light'];
        for (const [tone, token] of Object.entries(tones)) {
          expect({ themeColor, nightMode, tone, color: await colorUnder(
            { nightMode, themeColor },
            { tone: tone as ThemedTextTone }
          ) }).toEqual({
            themeColor,
            nightMode,
            tone,
            color: palette[token as keyof typeof palette],
          });
        }
      }
    }
  });

  it('keeps caution readable against the card it sits on, both ways round', async () => {
    // The warning surface is amber in both modes, so the ink has to invert
    // while the surface does not — a deep amber on the pale card, a pale one
    // on the dark card.
    const light = await colorUnder({ nightMode: false }, { tone: 'warning' });
    const dark = await colorUnder({ nightMode: true }, { tone: 'warning' });

    expect(light).not.toBe(dark);
  });
});
