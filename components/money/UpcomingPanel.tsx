import { useFocusEffect, useRouter, useScrollToTop } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { cardVisual, recurringVisuals, refundVisual } from '@/components/money/money-visuals';
import { useDueActions } from '@/components/money/useDueActions';
import { ThemedText } from '@/components/themed-text';
import { ListRow, type ListRowTone } from '@/components/ui/ListRow';
import { StateView } from '@/components/ui/StateView';
import { GroupHeader, SCREEN_GUTTER } from '@/components/ui/theme-primitives';
import { useAuthStore } from '@/hooks/use-auth-store';
import { kindOf } from '@/lib/recurring';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import { fetchAccounts, type Account } from '@/lib/accounts';
import { formatMoney } from '@/lib/money';
import { dueAction } from '@/lib/money-overview';
import { fetchSubscriptions, type Subscription } from '@/lib/subscriptions';
import { fetchRefundables, type RefundableEntry } from '@/lib/refundables';
import {
  buildUpcomingDues,
  formatDueLabel,
  totalUpcomingAmount,
  type UpcomingDue,
} from '@/lib/upcoming';

const HORIZON_DAYS = 30;

type UpcomingPanelProps = {
  /** Where a recurring payment's row, and the empty state's Add, lead. */
  onOpenRecurring: () => void;
  prefetchedAccounts?: Account[];
  prefetchedSubscriptions?: Subscription[];
  /**
   * False when the list sits at the top of Bills & dues (P18), inside the
   * Recurring list's own scroll; it then draws nothing when nothing is due.
   */
  scroll?: boolean;
  /** Bumped by the parent after it changes a recurring payment, to reload. */
  reloadKey?: number;
  /** Told after a due is marked paid or received here. */
  onChanged?: () => void;
};

/**
 * One list of everything with a date on it.
 *
 * A renewal was only visible on Subscriptions and a card statement only on
 * Accounts, so "what leaves my account this week" was a question the app held
 * both halves of and answered neither. The merge is in `lib/upcoming.ts` and
 * takes `today` as an argument, which is why it can be tested.
 */
export function UpcomingPanel({
  onOpenRecurring,
  prefetchedAccounts,
  prefetchedSubscriptions,
  scroll = true,
  reloadKey = 0,
  onChanged,
}: UpcomingPanelProps) {
  const router = useRouter();
  const colors = useThemeTokens().colors;
  const { token } = useAuthStore();
  const scrollRef = useRef<ScrollView>(null);
  useScrollToTop(scrollRef);

  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [refundables, setRefundables] = useState<RefundableEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!token) {
      setSubscriptions([]);
      setAccounts([]);
      setRefundables([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    // Either source failing should not blank the other — a card due date is
    // still worth showing when the subscriptions call times out.
    const [loadedSubscriptions, loadedAccounts, loadedRefundables] = await Promise.all([
      fetchSubscriptions(token).catch(() => [] as Subscription[]),
      fetchAccounts(token).catch(() => [] as Account[]),
      fetchRefundables(token).catch(() => [] as RefundableEntry[]),
    ]);
    setSubscriptions(loadedSubscriptions);
    setAccounts(loadedAccounts);
    setRefundables(loadedRefundables);
    setLoading(false);
  }, [token]);

  useFocusEffect(
    useCallback(() => {
      if (prefetchedAccounts !== undefined && prefetchedSubscriptions !== undefined) {
        setAccounts(prefetchedAccounts);
        setSubscriptions(prefetchedSubscriptions);
        if (!token) {
          setRefundables([]);
          setLoading(false);
          return;
        }
        setLoading(true);
        void fetchRefundables(token)
          .then(setRefundables)
          .catch(() => setRefundables([]))
          .finally(() => setLoading(false));
        return;
      }
      void load();
      // `reloadKey` is read so a change made beside this list refreshes it.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [load, prefetchedAccounts, prefetchedSubscriptions, token, reloadKey])
  );

  const { accessoryFor, sheet } = useDueActions({
    token,
    accounts,
    subscriptions,
    onChanged: () => {
      void load();
      onChanged?.();
    },
  });

  const dues = useMemo(
    () => buildUpcomingDues({ subscriptions, accounts, refundables, horizonDays: HORIZON_DAYS }),
    [subscriptions, accounts, refundables]
  );

  const overdue = useMemo(() => dues.filter((due) => due.state === 'overdue'), [dues]);
  const upcoming = useMemo(() => dues.filter((due) => due.state !== 'overdue'), [dues]);
  const total = useMemo(() => totalUpcomingAmount(dues), [dues]);
  const overdueTotal = useMemo(() => totalUpcomingAmount(overdue), [overdue]);
  const upcomingTotal = useMemo(() => totalUpcomingAmount(upcoming), [upcoming]);
  const refundCount = dues.filter((due) => due.kind === 'refund').length;

  const openDue = (due: UpcomingDue) => {
    if (due.kind === 'card') {
      router.push({ pathname: '/accounts/[id]', params: { id: String(due.sourceID) } });
      return;
    }
    if (due.kind === 'refund') {
      router.push({ pathname: '/entry/[id]', params: { id: String(due.sourceID) } });
      return;
    }
    onOpenRecurring();
  };

  const visualFor = (due: UpcomingDue) => {
    if (due.kind === 'card') return cardVisual;
    if (due.kind === 'refund') return refundVisual;
    const item = subscriptions.find((subscription) => subscription.id === due.sourceID);
    return recurringVisuals[item ? kindOf(item) : 'subscription'];
  };

  // Red once it is late, amber when it wants doing this week, quiet otherwise.
  const statusTone = (due: UpcomingDue): ListRowTone =>
    due.state === 'overdue' ? 'negative' : due.state === 'scheduled' ? 'muted' : 'warning';

  const renderGroup = (group: UpcomingDue[]) => (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      {group.map((due, index) => {
        const visual = visualFor(due);
        const isRefund = due.kind === 'refund';
        const amount =
          due.amount === null
            ? '—'
            : isRefund
              ? formatMoney(due.amount, { sign: 'always' })
              : formatMoney(due.amount);
        // P20: a due that can be finished here says so on its row.
        if (dueAction(due)) {
          const status = isRefund ? `Expected back · ${formatDueLabel(due)}` : formatDueLabel(due);
          return (
            <ListRow
              key={due.key}
              icon={visual.icon}
              hue={visual.hue}
              title={`${due.title} · ${amount}`}
              meta={status}
              divider={index > 0}
              accessibilityLabel={`${due.title}, ${amount}, ${status}`}
              onPress={() => openDue(due)}
              accessory={<View style={styles.accessory}>{accessoryFor(due)}</View>}
            />
          );
        }
        return (
          <ListRow
            key={due.key}
            icon={visual.icon}
            hue={visual.hue}
            title={due.title}
            meta={due.subtitle}
            amount={
              due.amount === null
                ? '—'
                : isRefund
                  ? formatMoney(due.amount, { sign: 'always' })
                  : formatMoney(due.amount)
            }
            amountTone={isRefund ? 'positive' : 'default'}
            status={formatDueLabel(due)}
            statusTone={statusTone(due)}
            divider={index > 0}
            accessibilityLabel={`${due.title}, ${formatDueLabel(due)}`}
            onPress={() => openDue(due)}
          />
        );
      })}
    </View>
  );

  const summaryLine = [
    overdueTotal > 0 ? 'overdue' : null,
    refundCount > 0 ? `${refundCount} refund${refundCount === 1 ? '' : 's'} expected` : null,
  ].filter(Boolean);

  if (!scroll) {
    if (!loading && dues.length === 0) return null;
    return (
      <View style={styles.embedded}>
        {overdue.length > 0 ? (
          <>
            <GroupHeader label="Overdue" tone="negative" />
            {renderGroup(overdue)}
          </>
        ) : null}
        {upcoming.length > 0 ? (
          <>
            <GroupHeader
              label={`Due in the next ${HORIZON_DAYS} days`}
              total={upcomingTotal > 0 ? formatMoney(upcomingTotal) : undefined}
            />
            {renderGroup(upcoming)}
          </>
        ) : null}
        {sheet}
      </View>
    );
  }

  return (
    <>
      <ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        style={{ flex: 1, backgroundColor: colors.background }}
        contentContainerStyle={styles.content}>
        {!loading && dues.length === 0 ? (
          <View style={styles.empty}>
            <StateView
              icon="calendar-check"
              title="Nothing due yet"
              message="Renewals, credit card due dates, and money expected back land here once Finnri knows about them."
              actionLabel="Add a subscription"
              onAction={onOpenRecurring}
            />
          </View>
        ) : (
          <>
            {/* Board R5-Upcoming: what is due, as one figure, before the list of it. */}
            <View
              style={[
                styles.summary,
                { backgroundColor: colors.card, borderColor: colors.border },
              ]}>
              <ThemedText tone="muted" style={styles.eyebrow}>
                {`Due in the next ${HORIZON_DAYS} days`}
              </ThemedText>
              <ThemedText style={[styles.total, { color: colors.text }]}>
                {loading ? '…' : formatMoney(total)}
              </ThemedText>
              <ThemedText tone="muted" style={styles.caption}>
                {loading ? (
                  'Checking renewals and card due dates'
                ) : summaryLine.length > 0 ? (
                  <>
                    {overdueTotal > 0 ? 'Includes ' : ''}
                    {overdueTotal > 0 ? (
                      <ThemedText
                        style={[styles.caption, styles.strong, { color: colors.negative }]}>
                        {`${formatMoney(overdueTotal)} overdue`}
                      </ThemedText>
                    ) : null}
                    {overdueTotal > 0 && refundCount > 0 ? ' · ' : ''}
                    {refundCount > 0
                      ? `${refundCount} refund${refundCount === 1 ? '' : 's'} expected`
                      : ''}
                  </>
                ) : (
                  'Nothing overdue'
                )}
              </ThemedText>
            </View>

            {overdue.length > 0 ? (
              <>
                <GroupHeader label="Overdue" tone="negative" />
                {renderGroup(overdue)}
              </>
            ) : null}
            {upcoming.length > 0 ? (
              <>
                <GroupHeader
                  label={`Next ${HORIZON_DAYS} days`}
                  total={upcomingTotal > 0 ? formatMoney(upcomingTotal) : undefined}
                />
                {renderGroup(upcoming)}
              </>
            ) : null}
          </>
        )}
      </ScrollView>
      {sheet}
    </>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingTop: 12,
    paddingBottom: 40,
  },
  empty: {
    marginTop: 24,
  },
  summary: {
    gap: 2,
    marginHorizontal: SCREEN_GUTTER,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderRadius: 16,
  },
  eyebrow: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
  },
  total: {
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '700',
    letterSpacing: -0.3,
    fontVariant: ['tabular-nums'],
  },
  caption: {
    fontSize: 13,
    lineHeight: 18,
  },
  strong: {
    fontWeight: '600',
  },
  embedded: {
    paddingBottom: 8,
  },
  accessory: {
    paddingRight: 10,
  },
  card: {
    marginHorizontal: SCREEN_GUTTER,
    borderWidth: 1,
    borderRadius: 16,
    overflow: 'hidden',
  },
});
