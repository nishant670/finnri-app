import { fireEvent, render } from '@testing-library/react-native';
import React from 'react';
import { StyleSheet, type TextStyle, type ViewStyle } from 'react-native';

import { TransactionItem } from '@/components/home/TransactionItem';
import { Button } from '@/components/ui/Button';
import { LabelRow } from '@/components/ui/LabelRow';
import { Segments } from '@/components/ui/Segments';
import { GroupHeader } from '@/components/ui/theme-primitives';
import { getMoodColors } from '@/constants/theme';
import { useAppMoodStore } from '@/hooks/use-app-mood-store';
import { categoryTile, categoryVisual, UNKNOWN_VISUAL } from '@/lib/categories';
import { MINUS_SIGN } from '@/lib/money';

/**
 * The redesign's shared pieces (docs/redesign/HANDOFF.md, Step 1). Each screen
 * adopts them in its own area, so these pin the parts every screen will rely
 * on: the row's sign and ink, the colour roles, and what is a button.
 */

const flat = (style: unknown) => (StyleSheet.flatten(style as never) ?? {}) as TextStyle & ViewStyle;

afterEach(() => {
  useAppMoodStore.setState({ nightMode: false, themeColor: 'finnri' });
});

describe('the transaction row', () => {
  const row = {
    icon: 'cart-outline',
    title: 'Footwear',
    category: 'Shopping',
    subtitle: 'Flipkart Axis',
    amount: 1766,
    date: '2:44 PM',
    variant: 'list' as const,
  };

  it('signs an expense with a real minus and keeps the amount in ink', async () => {
    const screen = await render(<TransactionItem {...row} />);
    const amount = screen.getByText(`${MINUS_SIGN}₹1,766`);

    expect(flat(amount.props.style).color).toBe(getMoodColors('finnri').light.text);
  });

  it('keeps income in ink too — colour lives only in the tile', async () => {
    const screen = await render(<TransactionItem {...row} isIncome />);

    expect(flat(screen.getByText('+₹1,766').props.style).color).toBe(
      getMoodColors('finnri').light.text
    );
  });

  it('reads the category and account as one caption', async () => {
    const screen = await render(<TransactionItem {...row} />);

    expect(screen.getByText('Shopping · Flipkart Axis')).toBeTruthy();
    expect(screen.getByText('2:44 pm')).toBeTruthy();
  });

  it('still says when an entry has no account', async () => {
    const screen = await render(<TransactionItem {...row} subtitle="" unlinked />);

    expect(screen.getByText('Shopping')).toBeTruthy();
    expect(screen.getByText('Unlinked')).toBeTruthy();
  });
});

describe('category tiles', () => {
  it('shows an unknown category as a neutral tag, not the transfer arrows', () => {
    expect(categoryVisual('Fitness supplements').icon).toBe('tag-outline');
    expect(UNKNOWN_VISUAL).toEqual({ icon: 'tag-outline', color: '#64748B', bgColor: '#F1F5F9' });
  });

  it('uses the pastel tile in light mode', () => {
    expect(categoryTile({ color: '#42A5F5', bgColor: '#E3F2FD' }, 'light')).toEqual({
      background: '#E3F2FD',
      foreground: '#42A5F5',
    });
  });

  it('fades the hue into the card in dark mode instead of keeping the pastel', () => {
    // The dark boards draw shopping as rgba(66,165,245,0.18) behind a #90CAF9 glyph.
    expect(categoryTile({ color: '#42A5F5', bgColor: '#E3F2FD' }, 'dark')).toEqual({
      background: '#42A5F52E',
      foreground: '#8EC9F9',
    });
  });
});

describe('colour roles the pieces draw with', () => {
  it('derives an outline a step stronger than the card border, in both modes', () => {
    const { light, dark } = getMoodColors('finnri');

    // Board values: #E6D3D8 and #4A4A4A.
    expect(light.borderStrong).toBe('#E2D8DA');
    expect(dark.borderStrong).toBe('#494949');
  });

  it('draws the segmented track from the border in light and secondary in dark', () => {
    for (const mood of ['finnri', 'mint', 'sky', 'plum'] as const) {
      const colors = getMoodColors(mood);
      expect(colors.light.track).toBe(colors.light.border);
      expect(colors.dark.track).toBe(colors.dark.secondary);
      expect(colors.light.trackSelected).toBe(colors.light.card);
    }
  });
});

describe('Button', () => {
  it("puts the mood's on-accent ink on the primary fill", async () => {
    const screen = await render(<Button label="Save" onPress={jest.fn()} />);

    expect(flat(screen.getByText('Save').props.style).color).toBe('#2D2D2D');
  });

  it('is white on Sky, whose accent is deep enough for it', async () => {
    useAppMoodStore.setState({ themeColor: 'sky' });
    const screen = await render(<Button label="Save" onPress={jest.fn()} />);

    expect(flat(screen.getByText('Save').props.style).color).toBe('#FFFFFF');
  });

  it('draws the outline variant in ink with the stronger border', async () => {
    const screen = await render(
      <Button variant="outline" icon="plus" label="Add" onPress={jest.fn()} />
    );
    const button = screen.getByRole('button', { name: 'Add' });

    expect(flat(screen.getByText('Add').props.style).color).toBe(
      getMoodColors('finnri').light.text
    );
    expect(flat(button.props.style).borderColor).toBe(getMoodColors('finnri').light.borderStrong);
    expect(flat(button.props.style).height).toBe(36);
  });

  it('does not fire while loading', async () => {
    const onPress = jest.fn();
    const screen = await render(<Button label="Save" loading onPress={onPress} />);

    fireEvent.press(screen.getByRole('button', { name: 'Save' }));
    expect(onPress).not.toHaveBeenCalled();
  });
});

describe('LabelRow', () => {
  it('is plain text when read-only', async () => {
    const screen = await render(<LabelRow label="Tag" value="General" />);

    expect(screen.getByText('General')).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('becomes a button named by its field when it opens a picker', async () => {
    const onPress = jest.fn();
    const screen = await render(
      <LabelRow label="Paid via" value="Cash" icon="cash" onPress={onPress} />
    );

    fireEvent.press(screen.getByRole('button', { name: 'Paid via, Cash' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('carries a muted aside after the value', async () => {
    const screen = await render(
      <LabelRow label="Paid with" value="UPI" detail="· no account linked" />
    );

    expect(screen.getByText(' · no account linked')).toBeTruthy();
  });
});

describe('GroupHeader', () => {
  it('shows the group total beside its label', async () => {
    const screen = await render(<GroupHeader label="Today" total={`${MINUS_SIGN}₹9,672`} />);

    expect(screen.getByRole('header', { name: 'Today' })).toBeTruthy();
    expect(screen.getByText(`${MINUS_SIGN}₹9,672`)).toBeTruthy();
  });

  it('leaves the total off when the caller has none to give', async () => {
    const screen = await render(<GroupHeader label="9 Oct" />);

    expect(screen.queryByText(/₹/)).toBeNull();
  });
});

describe('Segments', () => {
  const options = [
    { key: 'groups', label: 'Groups' },
    { key: 'friends', label: 'Friends' },
    { key: 'activity', label: 'Activity', badge: true },
  ] as const;

  it('marks the selected part with ink and weight, not accent', async () => {
    const screen = await render(<Segments active="groups" options={options} onChange={jest.fn()} />);
    const label = flat(screen.getByText('Groups').props.style);

    expect(label.color).toBe(getMoodColors('finnri').light.text);
    expect(label.fontWeight).toBe('700');
    expect(flat(screen.getByText('Friends').props.style).fontWeight).toBe('500');
  });

  it('announces the dot on a part with something new', async () => {
    const screen = await render(<Segments active="groups" options={options} onChange={jest.fn()} />);

    expect(screen.getByLabelText('Activity, new items')).toBeTruthy();
  });

  it('reports the pressed part', async () => {
    const onChange = jest.fn();
    const screen = await render(<Segments active="groups" options={options} onChange={onChange} />);

    fireEvent.press(screen.getByLabelText('Friends'));
    expect(onChange).toHaveBeenCalledWith('friends');
  });
});
