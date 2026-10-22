import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect, useRouter, useScrollToTop } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { cardVisual, recurringVisuals, refundVisual } from '@/components/money/money-visuals';
import { useDueActions } from '@/components/money/useDueActions';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/Button';
import { ListRow } from '@/components/ui/ListRow';
import { SkeletonCards, SkeletonFrame } from '@/components/ui/Skeleton';
import { SCREEN_GUTTER } from '@/components/ui/theme-primitives';
import { withAlpha } from '@/constants/theme';
import { useAuthStore } from '@/hooks/use-auth-store';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import { fetchAccounts, type Account } from '@/lib/accounts';
import { describeAccess, fetchBillingStatus, type BillingStatus } from '@/lib/billing';
import { categoryVisual } from '@/lib/categories';
import { formatApiDate } from '@/lib/datetime';
import { fetchDashboard, type DashboardBudgetStatus } from '@/lib/insights';
import { formatMoney } from '@/lib/money';
import {
  accountKindGroups,
  cardTotalSummary,
  dueAction,
  overviewDues,
} from '@/lib/money-overview';
import { kindOf } from '@/lib/recurring';
import { fetchRefundables, type RefundableEntry } from '@/lib/refundables';
import { fetchSubscriptions, type Subscription } from '@/lib/subscriptions';
import {
  buildUpcomingDues,
  formatDueLabel,
  totalUpcomingAmount,
  type UpcomingDue,
} from '@/lib/upcoming';

const HORIZON_DAYS = 30;

export type MoneyFullList = 'bills' | 'budgets' | 'accounts';

/**
 * Money opens on one overview (P17, board R5-Money-Proposals): what is due,
 * what the cards owe, the budget, and the accounts by kind. Each section's
 * "See all" opens its full list.
 */
export function MoneyOverview({ onOpenList }: { onOpenList: (list: MoneyFullList) => void }) {
  const router = useRouter();
  const { colors } = useThemeTokens();
  const { token } = useAuthStore();
  const scrollRef = useRef<ScrollView>(null);
  useScrollToTop(scrollRef);

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [refundables, setRefundables] = useState<RefundableEntry[]>([]);
  const [budgets, setBudgets] = useState<DashboardBudgetStatus[]>([]);
  const [billing, setBilling] = useState<BillingStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(
    async (mode: 'first' | 'refresh' | 'quiet' = 'quiet') => {
      if (!token) {
        setLoading(false);
        return;
      }
      if (mode === 'refresh') setRefreshing(true);
      const now = new Date();
      const monthStart = formatApiDate(new Date(now.getFullYear(), now.getMonth(), 1));
      // Each source stands alone: a slow dashboard should not blank the dues.
      const [nextAccounts, nextSubscriptions, nextRefundables, dashboard, nextBilling] =
        await Promise.all([
          fetchAccounts(token).catch(() => null),
          fetchSubscriptions(token).catch(() => null),
          fetchRefundables(token).catch(() => null),
          fetchDashboard(token, monthStart, formatApiDate(now)).catch(() => null),
          fetchBillingStatus(token).catch(() => null),
        ]);
      if (nextAccounts) setAccounts(nextAccounts);
      if (nextSubscriptions) setSubscriptions(nextSubscriptions);
      if (nextRefundables) setRefundables(nextRefundables);
      if (dashboard) setBudgets(dashboard.budget_statuses ?? []);
      setBilling(nextBilling);
      setLoading(false);
      setRefreshing(false);
    },
    [token]
  );

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const dues = useMemo(
    () => buildUpcomingDues({ subscriptions, accounts, refundables, horizonDays: HORIZON_DAYS }),
    [accounts, refundables, subscriptions]
  );
  const dueTotal = totalUpcomingAmount(dues);
  const overdueTotal = totalUpcomingAmount(dues.filter((due) => due.state === 'overdue'));
  const shownDues = overviewDues(dues);
  const cards = cardTotalSummary(accounts);
  const groups = accountKindGroups(accounts);
  const spentThisMonth = accounts.reduce(
    (sum, account) => sum + (account.summary?.spent_this_month ?? 0),
    0
  );
  const access = describeAccess(billing);
  const hasPass = access.kind === 'pass' || access.kind === 'trial';
  // P22: one budget is free. Past it, the section's link is the way to more.
  const budgetLink = !hasPass && budgets.length >= 1 ? 'Unlock' : 'See all';

  const { accessoryFor, sheet } = useDueActions({
    token,
    accounts,
    subscriptions,
    onChanged: () => void load(),
  });

  const visualFor = (due: UpcomingDue) => {
    if (due.kind === 'card') return cardVisual;
    if (due.kind === 'refund') return refundVisual;
    const item = subscriptions.find((subscription) => subscription.id === due.sourceID);
    return recurringVisuals[item ? kindOf(item) : 'subscription'];
  };

  const openDue = (due: UpcomingDue) => {
    if (due.kind === 'card') {
      router.push({ pathname: '/accounts/[id]', params: { id: String(due.sourceID) } });
    } else if (due.kind === 'refund') {
      router.push({ pathname: '/entry/[id]', params: { id: String(due.sourceID) } });
    } else {
      onOpenList('bills');
    }
  };

  const cardStyle = [styles.card, { backgroundColor: colors.card, borderColor: colors.border }];

  if (loading) {
    return (
      <View style={styles.loading}>
        <SkeletonFrame label="Loading money" testID="money-overview-skeleton">
          <SkeletonCards count={3} lines={2} radius={16} />
        </SkeletonFrame>
      </View>
    );
  }

  return (
    <>
      <ScrollView
        ref={scrollRef}
        testID="money-overview"
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void load('refresh')}
            tintColor={colors.muted}
          />
        }
        contentContainerStyle={styles.content}>
        {/* The two figures Money is opened for. */}
        <View style={styles.stats}>
          <Pressable
            accessibilityRole="button"
            onPress={() => onOpenList('bills')}
            style={[styles.stat, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <ThemedText tone="muted" style={styles.statLabel}>
              {`Due in ${HORIZON_DAYS} days`}
            </ThemedText>
            <ThemedText
              numberOfLines={1}
              adjustsFontSizeToFit
              style={[styles.statValue, { color: colors.text }]}>
              {formatMoney(dueTotal)}
            </ThemedText>
            <ThemedText
              numberOfLines={2}
              style={[
                styles.statCaption,
                overdueTotal > 0 ? { color: colors.negative, fontWeight: '600' } : { color: colors.muted },
              ]}>
              {overdueTotal > 0 ? `${formatMoney(overdueTotal)} overdue` : 'Nothing overdue'}
            </ThemedText>
          </Pressable>
          {cards.cards > 0 ? (
            <Pressable
              testID="money-card-total"
              accessibilityRole="button"
              accessibilityLabel={`${cards.headline}, ${cards.caption}`}
              onPress={() => onOpenList('accounts')}
              style={[styles.stat, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <ThemedText tone="muted" style={styles.statLabel}>
                Owed on cards
              </ThemedText>
              <ThemedText
                numberOfLines={1}
                adjustsFontSizeToFit
                style={[styles.statValue, { color: colors.text }]}>
                {formatMoney(cards.outstanding)}
              </ThemedText>
              <ThemedText tone="muted" numberOfLines={2} style={styles.statCaption}>
                {cards.caption}
              </ThemedText>
            </Pressable>
          ) : (
            <View style={[styles.stat, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <ThemedText tone="muted" style={styles.statLabel}>
                Spent this month
              </ThemedText>
              <ThemedText
                numberOfLines={1}
                adjustsFontSizeToFit
                style={[styles.statValue, { color: colors.text }]}>
                {formatMoney(spentThisMonth)}
              </ThemedText>
              <ThemedText tone="muted" numberOfLines={2} style={styles.statCaption}>
                across {accounts.length} account{accounts.length === 1 ? '' : 's'}
              </ThemedText>
            </View>
          )}
        </View>

        {/* Bills & dues (P18): renewals, card statements and refunds in one place. */}
        <SectionHeading
          title="Bills & dues"
          link={dues.length > 0 ? 'See all' : undefined}
          onLink={() => onOpenList('bills')}
        />
        {shownDues.length > 0 ? (
          <View style={cardStyle}>
            {shownDues.map((due, index) => {
              const visual = visualFor(due);
              const isRefund = due.kind === 'refund';
              const amount =
                due.amount === null
                  ? '—'
                  : isRefund
                    ? formatMoney(due.amount, { sign: 'always' })
                    : formatMoney(due.amount);
              const action = dueAction(due);
              const status = isRefund ? `Expected back · ${formatDueLabel(due)}` : formatDueLabel(due);
              const tone =
                due.state === 'overdue' ? 'negative' : due.state === 'scheduled' ? 'muted' : 'warning';
              return action ? (
                <ListRow
                  key={due.key}
                  icon={visual.icon}
                  hue={visual.hue}
                  title={`${due.title} · ${amount}`}
                  meta={status}
                  divider={index > 0}
                  onPress={() => openDue(due)}
                  accessibilityLabel={`${due.title}, ${amount}, ${status}`}
                  accessory={<View style={styles.accessory}>{accessoryFor(due)}</View>}
                />
              ) : (
                <ListRow
                  key={due.key}
                  icon={visual.icon}
                  hue={visual.hue}
                  title={due.title}
                  meta={due.subtitle}
                  amount={amount}
                  amountTone={isRefund ? 'positive' : 'default'}
                  status={status}
                  statusTone={tone}
                  divider={index > 0}
                  onPress={() => openDue(due)}
                />
              );
            })}
          </View>
        ) : (
          <EmptyRow
            icon="calendar-check"
            title="Nothing due in the next 30 days"
            body="Renewals, card due dates and money expected back show up here."
            actionLabel="Add"
            onAction={() => onOpenList('bills')}
          />
        )}

        {/* Budgets (P22): one is free; the link says how to get more. */}
        <SectionHeading
          title="Budgets"
          link={budgets.length > 0 ? budgetLink : undefined}
          onLink={() => (budgetLink === 'Unlock' ? router.push('/billing') : onOpenList('budgets'))}
        />
        {budgets.length > 0 ? (
          <View style={cardStyle}>
            {budgets.map((budget, index) => {
              const visual = budget.category ? categoryVisual(budget.category) : null;
              const share =
                budget.limit_amount > 0 ? Math.min(1, budget.spent_amount / budget.limit_amount) : 0;
              const barColor =
                budget.status === 'exceeded'
                  ? colors.negative
                  : budget.status === 'watch'
                    ? colors.warning
                    : (visual?.color ?? colors.accent);
              return (
                <ListRow
                  key={budget.budget_id}
                  icon={visual ? visual.icon : 'chart-donut'}
                  hue={visual ? visual.color : '#64748B'}
                  title={budget.name}
                  amount={`${formatMoney(budget.spent_amount)} of ${formatMoney(budget.limit_amount)}`}
                  divider={index > 0}
                  onPress={() => onOpenList('budgets')}>
                  <View style={[styles.track, { backgroundColor: colors.track }]}>
                    <View
                      style={[styles.fill, { width: `${share * 100}%`, backgroundColor: barColor }]}
                    />
                  </View>
                </ListRow>
              );
            })}
          </View>
        ) : (
          <EmptyRow
            icon="target"
            title="Set a monthly budget"
            body="One budget is free. See what is left as you spend."
            actionLabel="Add"
            onAction={() => onOpenList('budgets')}
          />
        )}

        {/* Accounts by kind. */}
        <SectionHeading
          title="Accounts"
          link={accounts.length > 0 ? 'See all' : undefined}
          onLink={() => onOpenList('accounts')}
        />
        {groups.length > 0 ? (
          <View style={cardStyle}>
            {groups.map((group, index) => (
              <ListRow
                key={group.key}
                icon={group.icon as never}
                hue={group.hue}
                title={group.label}
                meta={
                  group.key === 'cards'
                    ? `${group.accounts.length} card${group.accounts.length === 1 ? '' : 's'}`
                    : `${group.accounts.length} account${group.accounts.length === 1 ? '' : 's'}`
                }
                amount={group.amount !== null ? formatMoney(group.amount) : undefined}
                status={group.amount !== null ? group.amountLabel : undefined}
                divider={index > 0}
                onPress={() => onOpenList('accounts')}
              />
            ))}
          </View>
        ) : (
          <EmptyRow
            icon="bank-outline"
            title="Add your first account"
            body="Drafts pick the right bank or card once Finnri knows them."
            actionLabel="Add"
            onAction={() => router.push('/accounts/manage')}
          />
        )}
      </ScrollView>
      {sheet}
    </>
  );
}

function SectionHeading({
  title,
  link,
  onLink,
}: {
  title: string;
  link?: string;
  onLink: () => void;
}) {
  const { colors } = useThemeTokens();
  return (
    <View style={styles.heading}>
      <ThemedText accessibilityRole="header" style={[styles.headingText, { color: colors.text }]}>
        {title}
      </ThemedText>
      {link ? (
        <Pressable
          accessibilityRole="link"
          accessibilityLabel={`${link}, ${title}`}
          onPress={onLink}
          hitSlop={10}
          style={styles.link}>
          <ThemedText style={[styles.linkLabel, { color: colors.text }]}>{link}</ThemedText>
          <MaterialCommunityIcons name="chevron-right" size={18} color={colors.text} />
        </Pressable>
      ) : null}
    </View>
  );
}

function EmptyRow({
  icon,
  title,
  body,
  actionLabel,
  onAction,
}: {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  title: string;
  body: string;
  actionLabel: string;
  onAction: () => void;
}) {
  const { colors } = useThemeTokens();
  return (
    <View style={[styles.card, styles.empty, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={[styles.emptyTile, { backgroundColor: withAlpha(colors.accent, 0.14) }]}>
        <MaterialCommunityIcons name={icon} size={18} color={colors.text} />
      </View>
      <View style={styles.flex}>
        <ThemedText style={[styles.emptyTitle, { color: colors.text }]}>{title}</ThemedText>
        <ThemedText tone="muted" style={styles.emptyBody}>
          {body}
        </ThemedText>
      </View>
      <Button label={actionLabel} icon="plus" variant="outline" height={36} onPress={onAction} />
    </View>
  );
}

const styles = StyleSheet.create({
  loading: {
    paddingHorizontal: SCREEN_GUTTER,
    paddingTop: 12,
  },
  content: {
    paddingTop: 4,
    paddingBottom: 40,
  },
  stats: {
    flexDirection: 'row',
    gap: 10,
    marginHorizontal: SCREEN_GUTTER,
  },
  stat: {
    flex: 1,
    minWidth: 0,
    gap: 2,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderRadius: 16,
  },
  statLabel: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
  },
  statValue: {
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  statCaption: {
    fontSize: 12,
    lineHeight: 16,
  },
  heading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 32,
    marginTop: 22,
    marginBottom: 8,
    marginHorizontal: SCREEN_GUTTER,
  },
  headingText: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '700',
  },
  link: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    minHeight: 32,
  },
  linkLabel: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
  },
  card: {
    marginHorizontal: SCREEN_GUTTER,
    borderWidth: 1,
    borderRadius: 16,
    overflow: 'hidden',
  },
  accessory: {
    paddingRight: 10,
  },
  track: {
    height: 6,
    marginTop: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  fill: {
    height: 6,
    borderRadius: 3,
  },
  empty: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    paddingLeft: 14,
  },
  emptyTile: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flex: {
    flex: 1,
    minWidth: 0,
  },
  emptyTitle: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '600',
  },
  emptyBody: {
    fontSize: 12,
    lineHeight: 16,
  },
});
