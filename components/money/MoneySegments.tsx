import { MaterialCommunityIcons } from '@expo/vector-icons';

import { Segments } from '@/components/ui/Segments';

export const MONEY_SEGMENTS = ['upcoming', 'budgets', 'subscriptions', 'accounts'] as const;

export type MoneySegment = (typeof MONEY_SEGMENTS)[number];

export const isMoneySegment = (value: unknown): value is MoneySegment =>
  typeof value === 'string' && (MONEY_SEGMENTS as readonly string[]).includes(value);

export const moneySegmentMeta: Record<
  MoneySegment,
  { label: string; icon: keyof typeof MaterialCommunityIcons.glyphMap }
> = {
  upcoming: { label: 'Upcoming', icon: 'calendar-clock' },
  budgets: { label: 'Budgets', icon: 'chart-donut' },
  // Key kept for deep links (`?segment=subscriptions`); the tab now holds loans,
  // investments and bills as well.
  subscriptions: { label: 'Recurring', icon: 'repeat' },
  accounts: { label: 'Accounts', icon: 'wallet-outline' },
};

type MoneySegmentsProps = {
  active: MoneySegment;
  onChange: (segment: MoneySegment) => void;
};

/** Money-specific metadata over the shared scrolling segment control. */
export function MoneySegments({ active, onChange }: MoneySegmentsProps) {
  return (
    <Segments
      active={active}
      options={MONEY_SEGMENTS.map((segment) => ({ key: segment, ...moneySegmentMeta[segment] }))}
      onChange={onChange}
    />
  );
}
