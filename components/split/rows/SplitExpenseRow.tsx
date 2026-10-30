import { ListRow } from '@/components/ui/ListRow';
import {
  formatBalance,
  getExpenseIconConfig,
  readBillForViewer,
} from '@/components/split/split-utils';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import type { SplitBill, SplitFriend } from '@/lib/splits';

/** `10 Oct` from an expense's `YYYY-MM-DD`. */
const shortBillDate = (value: string) => {
  const [year, month, day] = value.slice(0, 10).split('-').map(Number);
  const date = new Date(year || 2000, (month || 1) - 1, day || 1);
  return `${date.getDate()} ${date.toLocaleString('en-US', { month: 'short' })}`;
};

/** One expense, as a group's page and a friend's page list it: who paid, and what you lent or borrowed. */
export function SplitExpenseRow({
  bill,
  currentUserName,
  friendById,
  divider,
  onPress,
}: {
  bill: SplitBill;
  currentUserName: string;
  friendById: Map<number, SplitFriend>;
  divider: boolean;
  onPress: () => void;
}) {
  const theme = useThemeTokens().colors;
  // Read for whoever is holding the phone. Straight off `participants` this row
  // said "You paid ₹5,880 … you lent ₹2,352" to the member who had done
  // neither: both figures belonged to the man who entered the expense.
  const { payerName, paidByYou, net } = readBillForViewer(bill, friendById, currentUserName);
  const iconConfig = getExpenseIconConfig(bill.title);

  return (
    <ListRow
      icon={iconConfig.icon}
      hue={theme.neutral}
      title={bill.title}
      meta={`${paidByYou ? 'You' : payerName} paid ${formatBalance(bill.total_amount)} · ${shortBillDate(bill.date)}`}
      amount={net !== 0 ? formatBalance(Math.abs(net)) : undefined}
      amountTone={net > 0 ? 'positive' : 'negative'}
      status={net > 0 ? 'you lent' : net < 0 ? 'you borrowed' : undefined}
      statusTone="muted"
      divider={divider}
      onPress={onPress}
    />
  );
}
