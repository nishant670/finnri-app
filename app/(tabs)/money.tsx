import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AccountsPanel } from '@/components/money/AccountsPanel';
import { BudgetsPanel } from '@/components/money/BudgetsPanel';
import {
  MoneySegments,
  isMoneySegment,
  type MoneySegment,
} from '@/components/money/MoneySegments';
import { SubscriptionsPanel } from '@/components/money/SubscriptionsPanel';
import { UpcomingPanel } from '@/components/money/UpcomingPanel';
import { TabHeader } from '@/components/ui/TabHeader';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import { useAuthStore } from '@/hooks/use-auth-store';
import { fetchAccounts, type Account } from '@/lib/accounts';
import { fetchBudgets, type Budget } from '@/lib/budgets';
import { ApiError } from '@/lib/api-error';
import { fetchSubscriptions, type Subscription } from '@/lib/subscriptions';
import { deriveMoneyLandingSegment } from '@/lib/money-landing';

/**
 * Identity sentinel for "Budgets answered 402". It behaves as an empty list
 * everywhere downstream, while still letting the landing rule tell "no budgets
 * yet" apart from "budgets are not on this plan" — which route differently.
 */
const PAYWALLED_BUDGETS: Budget[] = [];

const toParam = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;

/**
 * Everything that decides where money goes, in one tab.
 *
 * Budgets, Subscriptions and the calculators used to live behind Profile,
 * three taps inside a settings drawer alongside logout — the paid features
 * filed under housekeeping. Accounts, meanwhile, held a permanent slot in the
 * bottom bar and is the one screen you finish setting up and stop opening.
 * They have swapped places.
 *
 * Only the active segment mounts. Each panel fetches on focus and would
 * otherwise fire four loads on every visit to the tab.
 */
export default function MoneyScreen() {
  const router = useRouter();
  const colors = useThemeTokens().colors;
  const { token } = useAuthStore();
  const params = useLocalSearchParams<{
    segment?: string;
    type?: string;
    name?: string;
    provider?: string;
    identifier?: string;
    color?: string;
  }>();
  const requestedSegment = toParam(params.segment);

  const [segment, setSegment] = useState<MoneySegment | null>(
    isMoneySegment(requestedSegment) ? requestedSegment : null
  );
  const [landingAccounts, setLandingAccounts] = useState<Account[]>([]);
  const [landingSubscriptions, setLandingSubscriptions] = useState<Subscription[]>([]);
  const [landingLoading, setLandingLoading] = useState(!isMoneySegment(requestedSegment));
  const [landingDataReady, setLandingDataReady] = useState(false);

  // A push from elsewhere — "Manage accounts" on the entry screen — lands on
  // this tab with a segment in the query rather than remounting the screen, so
  // the param has to be watched and not only read once.
  useEffect(() => {
    if (isMoneySegment(requestedSegment)) setSegment(requestedSegment);
  }, [requestedSegment]);

  useEffect(() => {
    if (isMoneySegment(requestedSegment)) {
      setLandingDataReady(false);
      setLandingLoading(false);
      return;
    }
    let active = true;
    if (!token) {
      setSegment('accounts');
      setLandingLoading(false);
      return;
    }
    setLandingLoading(true);
    void Promise.allSettled([
      fetchAccounts(token),
      // Budgets is entitlement-gated and answers 402 for every free and guest
      // user. That is an answer — "this user has no budgets" — not a failure,
      // and treating it as one sent the whole rule to its `upcoming` fallback
      // for exactly the new users it exists to route.
      fetchBudgets(token).catch((error) => {
        if (error instanceof ApiError && error.status === 402) return PAYWALLED_BUDGETS;
        throw error;
      }),
      fetchSubscriptions(token),
    ]).then(([accountResult, budgetResult, subscriptionResult]) => {
      if (!active) return;
      if (
        accountResult.status === 'rejected' ||
        budgetResult.status === 'rejected' ||
        subscriptionResult.status === 'rejected'
      ) {
        setLandingDataReady(false);
        setSegment('upcoming');
        setLandingLoading(false);
        return;
      }
      setLandingAccounts(accountResult.value);
      setLandingSubscriptions(subscriptionResult.value);
      setLandingDataReady(true);
      setSegment(
        deriveMoneyLandingSegment({
          accounts: accountResult.value,
          budgets: budgetResult.value,
          subscriptions: subscriptionResult.value,
          budgetsAvailable: budgetResult.value !== PAYWALLED_BUDGETS,
        })
      );
      setLandingLoading(false);
    });
    return () => {
      active = false;
    };
  }, [requestedSegment, token]);

  const activeSegment = segment ?? 'upcoming';

  return (
    <SafeAreaView
      className="flex-1"
      edges={['top', 'left', 'right']}
      style={{ backgroundColor: colors.background }}>
      <TabHeader
        title="Money"
        actions={[
          {
            icon: 'calculator-variant-outline',
            accessibilityLabel: 'Calculators',
            onPress: () => router.push('/tools'),
          },
        ]}
      />

      <MoneySegments active={activeSegment} onChange={setSegment} />

      {landingLoading || segment === null ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : null}
      {segment === 'upcoming' && (
        <UpcomingPanel
          onSelectSegment={setSegment}
          prefetchedAccounts={landingDataReady ? landingAccounts : undefined}
          prefetchedSubscriptions={landingDataReady ? landingSubscriptions : undefined}
        />
      )}
      {segment === 'budgets' && <BudgetsPanel embedded />}
      {segment === 'subscriptions' && <SubscriptionsPanel embedded />}
      {segment === 'accounts' && (
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
