import { View } from 'react-native';

import { zeroBalanceLabel } from '@/components/split/split-utils';
import { CountUpMoney } from '@/components/ui/CountUpMoney';
import { TText } from '@/components/split/primitives/themed-interop';

/**
 * A zero balance, and which of the two things it means.
 *
 * "Settled up" is a claim about what happened: money was owed and it came back.
 * A group made ten seconds ago has a zero balance for the opposite reason —
 * nothing has happened in it at all — and saying "settled up" there is the app
 * congratulating the user on an event that never took place. It also erases
 * the one thing the row should be prompting: add the first expense.
 *
 * `hasActivity` is what tells them apart. It is false only when there is
 * nothing on the ledger to settle, so a group that genuinely balanced out to
 * zero still reads "settled up" and keeps its meaning.
 */
export function BalanceFigure({
  value,
  color,
  overall = false,
  hasActivity = true,
}: {
  value: number;
  color: string;
  overall?: boolean;
  hasActivity?: boolean;
}) {
  const variant = overall ? 'sectionTitle' : 'cardTitle';
  if (value === 0) {
    return (
      <TText variant={variant} style={{ color }}>
        {zeroBalanceLabel({ hasActivity, overall })}
      </TText>
    );
  }
  const relationship = value > 0 ? 'you are owed' : 'you owe';
  return (
    <View className="flex-row flex-wrap items-baseline">
      <TText variant={variant} style={{ color }}>
        {overall ? `Overall, ${relationship} ` : `${relationship} `}
      </TText>
      <CountUpMoney variant={variant} amount={Math.abs(value)} sign="never" style={{ color }} />
    </View>
  );
}
