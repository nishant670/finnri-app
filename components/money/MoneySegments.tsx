import { Segments } from '@/components/ui/Segments';

export const MONEY_SEGMENTS = ['upcoming', 'budgets', 'subscriptions', 'accounts'] as const;

export type MoneySegment = (typeof MONEY_SEGMENTS)[number];

export const isMoneySegment = (value: unknown): value is MoneySegment =>
  typeof value === 'string' && (MONEY_SEGMENTS as readonly string[]).includes(value);

export const moneySegmentMeta: Record<MoneySegment, { label: string }> = {
  upcoming: { label: 'Upcoming' },
  budgets: { label: 'Budgets' },
  // Key kept for deep links (`?segment=subscriptions`); the tab now holds loans,
  // investments and bills as well.
  subscriptions: { label: 'Recurring' },
  accounts: { label: 'Accounts' },
};

type MoneySegmentsProps = {
  active: MoneySegment;
  onChange: (segment: MoneySegment) => void;
};

/** Money-specific metadata over the shared segmented control. */
export function MoneySegments({ active, onChange }: MoneySegmentsProps) {
  return (
    <Segments
      active={active}
      options={MONEY_SEGMENTS.map((segment) => ({ key: segment, ...moneySegmentMeta[segment] }))}
      onChange={onChange}
      // The spacing the old scrolling row carried in its content inset; the
      // Money screen moves to the 16 gutter when it is rebuilt (area 4).
      style={{ marginHorizontal: 22, marginBottom: 14 }}
    />
  );
}
