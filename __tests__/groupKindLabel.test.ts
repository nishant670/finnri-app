import {
  groupBalanceAlertReached,
  groupKindDisplay,
  groupKindIconChoices,
  suggestGroupKindIcon,
} from '@/components/split/split-utils';

describe("an Other group's own label and icon", () => {
  it('suggests an icon from the words in the label', () => {
    expect(suggestGroupKindIcon('Office team')).toBe('briefcase-outline');
    expect(suggestGroupKindIcon('Dyninno Diwali lunch')).toBe('party-popper');
    expect(suggestGroupKindIcon('Sunday lunch')).toBe('silverware-fork-knife');
    expect(suggestGroupKindIcon('Flatmates')).toBe('account-group-outline');
  });

  it('matches whole word starts, not letters buried inside a word', () => {
    // "scar" contains "car", but is not about a car.
    expect(suggestGroupKindIcon('Scar fund')).toBe(groupKindIconChoices[0]);
  });

  it('falls back to the plain Other icon when nothing matches', () => {
    expect(suggestGroupKindIcon('')).toBe('format-list-bulleted');
    expect(suggestGroupKindIcon('Misc')).toBe('format-list-bulleted');
  });

  it('shows the label and icon only on an Other group that has a label', () => {
    expect(
      groupKindDisplay({ kind: 'other', kind_label: 'Office', kind_icon: 'briefcase-outline' })
    ).toEqual({
      label: 'Office',
      icon: 'briefcase-outline',
    });
    expect(groupKindDisplay({ kind: 'other', kind_label: '', kind_icon: '' })).toEqual({
      label: 'Other',
      icon: 'format-list-bulleted',
    });
    expect(
      groupKindDisplay({ kind: 'trip', kind_label: 'Office', kind_icon: 'briefcase-outline' })
    ).toEqual({
      label: 'Trip',
      icon: 'airplane',
    });
  });

  it('keeps the label but uses the Other icon for an icon this build lacks', () => {
    expect(
      groupKindDisplay({ kind: 'other', kind_label: 'Office', kind_icon: 'not-an-icon' })
    ).toEqual({
      label: 'Office',
      icon: 'format-list-bulleted',
    });
  });
});

describe('whether a group is past its balance alert', () => {
  const balances = (...amounts: number[]) =>
    amounts.map((net_balance, index) => ({ friend_id: index + 1, net_balance }));

  it('is past it when any one balance reaches the limit, either way round', () => {
    expect(
      groupBalanceAlertReached({ balance_alert_amount: 1000, viewer_balances: balances(200, 1000) })
    ).toBe(true);
    expect(
      groupBalanceAlertReached({ balance_alert_amount: 1000, viewer_balances: balances(-1200) })
    ).toBe(true);
  });

  it('is not past it under the limit, or with the alert off', () => {
    expect(
      groupBalanceAlertReached({ balance_alert_amount: 1000, viewer_balances: balances(600, -999) })
    ).toBe(false);
    expect(
      groupBalanceAlertReached({ balance_alert_amount: 0, viewer_balances: balances(5000) })
    ).toBe(false);
    expect(groupBalanceAlertReached({ viewer_balances: balances(5000) })).toBe(false);
  });
});
