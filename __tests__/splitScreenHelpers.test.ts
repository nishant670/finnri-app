import type { SplitGroupSummary } from '@/components/split/split-types';
import { formatBalance } from '@/components/split/split-utils';
import type { SplitSelection } from '@/lib/split-preferences';
import {
  buildGroupExportCsv,
  buildParticipantsFromSelection,
  formatFriendlySplitError,
  friendsLookIdentical,
  getActivityIcon,
  getBalanceTone,
  getSafeExportFileName,
  toDeviceContactOption,
} from '@/lib/split-screen-helpers';
import type { SplitBill, SplitFriend } from '@/lib/splits';

const friend = (over: Partial<SplitFriend>) => ({ id: 1, name: 'Asha', ...over }) as SplitFriend;

describe('friendsLookIdentical', () => {
  it('matches on a shared linked user', () => {
    expect(
      friendsLookIdentical(friend({ linked_user_id: 9 }), friend({ id: 2, linked_user_id: 9 }))
    ).toBe(true);
  });

  it('matches emails ignoring case and padding, but not two blanks', () => {
    expect(
      friendsLookIdentical(friend({ email: ' A@x.com ' }), friend({ id: 2, email: 'a@X.com' }))
    ).toBe(true);
    expect(friendsLookIdentical(friend({ email: '' }), friend({ id: 2, email: '' }))).toBe(false);
  });

  it('matches phones by their last ten digits, preferring the normalised number', () => {
    expect(
      friendsLookIdentical(
        friend({ phone: '+91 98765 43210' }),
        friend({ id: 2, phone: '098765-43210' })
      )
    ).toBe(true);
    expect(
      friendsLookIdentical(
        friend({ phone_normalized: '9876543210' }),
        friend({ id: 2, phone: '9876543210' })
      )
    ).toBe(true);
  });

  it('does not treat short or different numbers as the same person', () => {
    expect(
      friendsLookIdentical(friend({ phone: '12345' }), friend({ id: 2, phone: '12345' }))
    ).toBe(false);
    expect(
      friendsLookIdentical(friend({ phone: '9876543210' }), friend({ id: 2, phone: '9876543211' }))
    ).toBe(false);
  });
});

describe('toDeviceContactOption', () => {
  it('prefers the contact name, then first and last, then a phone number', () => {
    expect(toDeviceContactOption({ id: '1', name: 'Priya' } as never)?.name).toBe('Priya');
    expect(
      toDeviceContactOption({ id: '1', firstName: 'Priya', lastName: 'S' } as never)?.name
    ).toBe('Priya S');
    expect(
      toDeviceContactOption({ id: '1', phoneNumbers: [{ number: '98765' }] } as never)?.name
    ).toBe('98765');
  });

  it('drops contacts with nothing to call them by', () => {
    expect(toDeviceContactOption({ id: '1' } as never)).toBeNull();
  });

  it('carries the first usable phone, email and image', () => {
    const option = toDeviceContactOption({
      id: '7',
      name: 'Ravi',
      phoneNumbers: [{ number: '' }, { number: '555' }],
      emails: [{ email: 'r@x.com' }],
      image: { uri: 'file://r.png' },
    } as never);
    expect(option).toEqual({
      id: '7',
      name: 'Ravi',
      phone: '555',
      email: 'r@x.com',
      imageUri: 'file://r.png',
    });
  });
});

describe('getBalanceTone', () => {
  const colors = { positive: 'g', negative: 'r', neutral: 'n' };

  it('words a positive and a negative balance from the viewer’s side', () => {
    expect(getBalanceTone(500, colors)).toEqual({
      label: `you are owed ${formatBalance(500)}`,
      color: 'g',
    });
    expect(getBalanceTone(-500, colors)).toEqual({
      label: `you owe ${formatBalance(-500)}`,
      color: 'r',
    });
  });

  it('says "settled up" only when there was activity to settle', () => {
    expect(getBalanceTone(0, colors, true)).toEqual({ label: 'settled up', color: 'n' });
    expect(getBalanceTone(0, colors, false)).toEqual({ label: 'No expenses yet', color: 'n' });
  });
});

describe('getActivityIcon', () => {
  it.each([
    ['group_created', 'account-group-outline'],
    ['friend_created', 'account-plus-outline'],
    ['settlement', 'hand-coin-outline'],
    ['bill', 'receipt-text-outline'],
  ] as const)('maps %s', (type, icon) => {
    expect(getActivityIcon(type)).toBe(icon);
  });
});

describe('getSafeExportFileName', () => {
  it('slugifies and falls back when nothing usable is left', () => {
    expect(getSafeExportFileName('  Goa Trip 2026!  ')).toBe('goa-trip-2026');
    expect(getSafeExportFileName('***')).toBe('split-group');
    expect(getSafeExportFileName('')).toBe('split-group');
  });
});

describe('formatFriendlySplitError', () => {
  it.each(['Network request failed', 'java.net.ConnectException', 'Request timed out'])(
    'reports a connectivity problem for "%s"',
    (message) => {
      expect(formatFriendlySplitError(new Error(message), 'x')).toBe(
        'We could not reach Finnri. Check your internet connection.'
      );
    }
  );

  it('reports an unresponsive server', () => {
    expect(formatFriendlySplitError(new Error('Failed to fetch'), 'x')).toBe(
      'Finnri is not responding right now.'
    );
  });

  it('falls back for empty and non-Error values', () => {
    expect(formatFriendlySplitError(new Error('  '), 'Fallback')).toBe('Fallback');
    expect(formatFriendlySplitError('boom', 'Fallback')).toBe('Fallback');
  });

  it('strips bullets and keeps the user-safe lines of a validation message', () => {
    expect(formatFriendlySplitError(new Error('• Name is required\n• Amount too small'), 'x')).toBe(
      'Name is required\nAmount too small'
    );
  });

  it('drops technical lines and falls back if nothing readable remains', () => {
    expect(
      formatFriendlySplitError(new Error('Name is required\nat stack trace 10.0.0.1:8080'), 'x')
    ).toBe('Name is required');
    expect(formatFriendlySplitError(new Error('stack trace'), 'Fallback')).toBe('Fallback');
  });
});

describe('buildParticipantsFromSelection', () => {
  const selection = (over: Partial<SplitSelection> = {}): SplitSelection => ({
    selfKey: 'me',
    payerKey: 'me',
    fullAmount: false,
    participantKeys: ['me', '3', '4'],
    tab: 'equally',
    weights: {},
    ...over,
  });

  it('records one row per friend when the user paid', () => {
    const result = buildParticipantsFromSelection(selection(), 300);
    expect(result).toEqual({
      ok: true,
      participants: [
        { friend_id: 3, share_amount: 100, direction: 'friend_owes_user' },
        { friend_id: 4, share_amount: 100, direction: 'friend_owes_user' },
      ],
    });
  });

  it('collapses to the single row the user owes when a friend paid', () => {
    const result = buildParticipantsFromSelection(selection({ payerKey: '3' }), 300);
    expect(result).toEqual({
      ok: true,
      participants: [{ friend_id: 3, share_amount: 100, direction: 'user_owes_friend' }],
    });
  });

  it('asks for a friend when only the user is in the split', () => {
    expect(buildParticipantsFromSelection(selection({ participantKeys: ['me'] }), 300)).toEqual({
      ok: false,
      error: 'Choose at least one friend for this split.',
    });
  });

  it('asks the user to add themselves when a friend paid and the user has no share', () => {
    const result = buildParticipantsFromSelection(
      selection({ payerKey: '3', participantKeys: ['3', '4'] }),
      300
    );
    expect(result).toEqual({
      ok: false,
      error: 'Add yourself to the split to record what you owe.',
    });
  });

  it('asks who paid when the payer is not a friend id', () => {
    const result = buildParticipantsFromSelection(selection({ payerKey: 'owner' }), 300);
    expect(result).toEqual({ ok: false, error: 'Choose who paid for this expense.' });
  });

  it('passes the amount error through', () => {
    expect(buildParticipantsFromSelection(selection(), 0)).toEqual({
      ok: false,
      error: 'Enter a bill amount before choosing the split.',
    });
  });

  it('with "owed the full amount" the payer carries no share', () => {
    const result = buildParticipantsFromSelection(
      selection({ fullAmount: true, participantKeys: ['me', '3'] }),
      200
    );
    expect(result).toEqual({
      ok: true,
      participants: [{ friend_id: 3, share_amount: 200, direction: 'friend_owes_user' }],
    });
  });
});

describe('buildGroupExportCsv', () => {
  const asha = friend({ id: 3, name: 'Asha' });
  const summary = (over: Partial<SplitGroupSummary> = {}) =>
    ({
      group: { id: 1, name: 'Goa "Trip"', viewer_balances: [{ friend_id: 3, net_balance: 250 }] },
      billCount: 1,
      bills: [
        {
          id: 1,
          title: 'Dinner, drinks',
          date: '2026-10-01',
          total_amount: 500,
          notes: null,
          participants: [{ friend_id: 3, share_amount: 250, direction: 'friend_owes_user' }],
        },
      ],
      detailLines: [],
      kind: 'trip',
      memberIds: [3],
      roster: [
        { slot: 'owner', friendId: 0, name: 'Me', subtitle: '', isViewer: true },
        { slot: '3', friendId: 3, name: 'Asha', subtitle: '', isViewer: false },
      ],
      netBalance: 250,
      ...over,
    }) as unknown as SplitGroupSummary;
  const friends = new Map([[3, asha]]);
  const lines = (csv: string) => csv.split('\n');

  it('titles the report and quotes every cell, doubling embedded quotes', () => {
    const rows = lines(buildGroupExportCsv(summary(), friends, 'Me'));
    expect(rows[0]).toBe('"Finnri Split Report"');
    expect(rows[1]).toBe('"Group","Goa ""Trip"""');
    expect(rows[3]).toBe('"Currency","INR"');
  });

  it('lists who owes whom from the viewer’s side', () => {
    const csv = buildGroupExportCsv(summary(), friends, 'Me');
    expect(csv).toContain('"Asha","Me","250.00","Open"');
    const owing = buildGroupExportCsv(
      summary({
        group: { id: 1, name: 'G', viewer_balances: [{ friend_id: 3, net_balance: -80 }] } as never,
      }),
      friends,
      'Me'
    );
    expect(owing).toContain('"Me","Asha","80.00","Open"');
  });

  it('says everyone is settled when no balance is open', () => {
    const csv = buildGroupExportCsv(
      summary({ group: { id: 1, name: 'G', viewer_balances: [] } as never }),
      friends,
      'Me'
    );
    expect(csv).toContain('"Everyone","Everyone","0","Settled up"');
  });

  it('writes each expense with who paid, the split and the share details', () => {
    const csv = buildGroupExportCsv(summary(), friends, 'Me');
    expect(csv).toContain(
      '"Date","Expense","Total amount","Paid by","Split with","Share details","Notes"'
    );
    expect(csv).toContain('"2026-10-01","Dinner, drinks","500.00"');
    expect(csv).toContain(`"Asha owes ${formatBalance(250)}"`);
  });
});
