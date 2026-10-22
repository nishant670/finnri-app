import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { BackHandler } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AccountsPanel } from '@/components/money/AccountsPanel';
import { BudgetsPanel } from '@/components/money/BudgetsPanel';
import { MoneyOverview, type MoneyFullList } from '@/components/money/MoneyOverview';
import { isMoneySegment, type MoneySegment } from '@/components/money/MoneySegments';
import { SubscriptionsPanel } from '@/components/money/SubscriptionsPanel';
import { UpcomingPanel } from '@/components/money/UpcomingPanel';
import { TabHeader } from '@/components/ui/TabHeader';
import { useThemeTokens } from '@/hooks/use-theme-tokens';

const toParam = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;

/** Old segment links still land: Upcoming and Recurring are now Bills & dues. */
const listForSegment = (segment: MoneySegment): MoneyFullList =>
  segment === 'upcoming' || segment === 'subscriptions' ? 'bills' : segment;

const LIST_TITLES: Record<MoneyFullList, string> = {
  bills: 'Bills & dues',
  budgets: 'Budgets',
  accounts: 'Accounts',
};

/**
 * Everything that decides where money goes, in one tab.
 *
 * It opens on one overview (P17): what is due, what the cards owe, the budget
 * and the accounts. "See all" on a section opens its full list in place, with
 * a back chevron to the overview. Upcoming and Recurring are one list now,
 * "Bills & dues" (P18): what is due on top, the recurring payments under it.
 *
 * A link with `?segment=` (Manage accounts, a notification) opens that list.
 */
export default function MoneyScreen() {
  const router = useRouter();
  const colors = useThemeTokens().colors;
  const params = useLocalSearchParams<{
    segment?: string;
    type?: string;
    name?: string;
    provider?: string;
    identifier?: string;
    color?: string;
  }>();
  const requestedSegment = toParam(params.segment);

  const [list, setList] = useState<MoneyFullList | null>(
    isMoneySegment(requestedSegment) ? listForSegment(requestedSegment) : null
  );

  // A push from elsewhere lands on this tab with a segment in the query rather
  // than remounting the screen, so the param has to be watched.
  useEffect(() => {
    if (isMoneySegment(requestedSegment)) setList(listForSegment(requestedSegment));
  }, [requestedSegment]);

  const closeList = useCallback(() => {
    setList(null);
    if (requestedSegment) router.setParams({ segment: undefined });
  }, [requestedSegment, router]);

  // Android's back takes a full list back to the overview before leaving.
  useFocusEffect(
    useCallback(() => {
      if (!list) return undefined;
      const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
        closeList();
        return true;
      });
      return () => subscription.remove();
    }, [closeList, list])
  );

  return (
    <SafeAreaView
      className="flex-1"
      edges={['top', 'left', 'right']}
      style={{ backgroundColor: colors.background }}>
      <TabHeader
        title={list ? LIST_TITLES[list] : 'Money'}
        onBack={list ? closeList : undefined}
        actions={
          list
            ? []
            : [
                {
                  icon: 'calculator-variant-outline',
                  accessibilityLabel: 'Calculators',
                  onPress: () => router.push('/tools'),
                },
              ]
        }
      />

      {list === null && <MoneyOverview onOpenList={setList} />}
      {list === 'bills' && (
        <SubscriptionsPanel
          embedded
          header={({ reload, version }) => (
            <UpcomingPanel
              scroll={false}
              reloadKey={version}
              onChanged={reload}
              onOpenRecurring={() => undefined}
            />
          )}
        />
      )}
      {list === 'budgets' && <BudgetsPanel embedded />}
      {list === 'accounts' && (
        <AccountsPanel
          suggestedAccount={
            params.type
              ? {
                  type: params.type as import('@/lib/accounts').AccountType,
                  name: params.name,
                  provider: params.provider,
                  identifier: params.identifier,
                  color: params.color,
                }
              : undefined
          }
        />
      )}
    </SafeAreaView>
  );
}
