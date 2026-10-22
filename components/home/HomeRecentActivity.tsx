import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { Card } from '@/components/ui/theme-primitives';
import { SkeletonFrame, SkeletonRows } from '@/components/ui/Skeleton';
import { StateView } from '@/components/ui/StateView';
import { ThemedText } from '@/components/themed-text';
import { Transaction } from '@/types/transaction';
import { TransactionItem } from '@/components/home/TransactionItem';
import { encodeFrame } from '@/hooks/use-shared-element';
import { groupTransactionsBySection } from '@/lib/transactions';
import { formatMoney, toAmountString } from '@/lib/money';
import { dayTotalsByTitle } from '@/lib/transaction-list';
import { useMotion } from '@/hooks/use-motion';
import { useThemeTokens } from '@/hooks/use-theme-tokens';

type HomeRecentActivityProps = {
  isEntriesLoading: boolean;
  entriesError: string | null;
  hasTransactions: boolean;
  transactions: Transaction[];
  /** More entries exist than were loaded, so the oldest loaded day may be partial. */
  hasMore?: boolean;
  newTransactionId: string | null;
  isStealthMode: boolean;
  onRetry: () => void;
};

/**
 * "Recent activity" with its "See all" link: 14/700 on the left, the link in
 * ink with a chevron on the right (board R3-Home). Not the shared
 * `SectionHeader`, which still sits on the old 24 gutter other screens use.
 */
function RecentActivityHeader({ onSeeAll }: { onSeeAll?: () => void }) {
  const { colors } = useThemeTokens();

  return (
    <View style={styles.header}>
      <ThemedText accessibilityRole="header" style={[styles.heading, { color: colors.text }]}>
        Recent activity
      </ThemedText>
      {onSeeAll ? (
        <Pressable
          accessibilityRole="button"
          onPress={onSeeAll}
          hitSlop={10}
          style={styles.seeAll}>
          <ThemedText style={[styles.seeAllLabel, { color: colors.text }]}>See all</ThemedText>
          <MaterialCommunityIcons name="chevron-right" size={18} color={colors.text} />
        </Pressable>
      ) : null}
    </View>
  );
}

export function HomeRecentActivity({
  isEntriesLoading,
  entriesError,
  hasTransactions,
  transactions,
  hasMore = false,
  newTransactionId,
  isStealthMode,
  onRetry,
}: HomeRecentActivityProps) {
  const router = useRouter();
  const themeTokens = useThemeTokens();
  const colors = themeTokens.colors;
  const motion = useMotion();

  if (isEntriesLoading) {
    return (
      <View>
        <RecentActivityHeader />
        <SkeletonFrame label="Loading activity" testID="home-activity-skeleton">
          <Card inset style={styles.listCard}>
            <SkeletonRows count={4} variant="list" carded={false} />
          </Card>
        </SkeletonFrame>
      </View>
    );
  }

  if (entriesError) {
    return (
      <StateView
        icon="wifi-off"
        title="Activity did not load"
        message={entriesError}
        actionLabel="Try again"
        onAction={() => {
          // Retry everything the outage took down, not just the feed. The
          // month strip hides itself on failure rather than showing an
          // error, so without this it would stay missing until the next
          // time the screen regained focus.
          onRetry();
        }}
      />
    );
  }

  if (!hasTransactions) {
    return (
      <View>
        <RecentActivityHeader />
        <Card inset style={styles.emptyCard}>
          <View style={[styles.emptyTile, { backgroundColor: colors.secondary }]}>
            <MaterialCommunityIcons name="receipt-text-outline" size={20} color={colors.text} />
          </View>
          <View style={styles.emptyText}>
            <ThemedText style={[styles.emptyTitle, { color: colors.text }]}>
              No activity yet
            </ThemedText>
            <ThemedText tone="muted" style={styles.emptyBody}>
              Your entries show up here.
            </ThemedText>
          </View>
        </Card>
      </View>
    );
  }

  const recentTransactions = transactions.slice(0, 5);
  const groupedRecentTransactions = groupTransactionsBySection(recentTransactions);
  const dayTotals = dayTotalsByTitle(transactions, { hasMore });
  // The stagger counts down the feed rather than restarting at every date
  // heading — see the same note on the full list in app/transactions/index.tsx.
  let rowsAbove = 0;

  return (
    <View>
      <RecentActivityHeader onSeeAll={() => router.push('/transactions')} />

      {/* One card, each day labelled inside it with its total (board
          R3-Home-Proposals, P13). */}
      <Card inset style={styles.listCard}>
        {groupedRecentTransactions.map((group, groupIndex) => {
          const groupOffset = rowsAbove;
          rowsAbove += group.data.length;
          const dayTotal = dayTotals.get(group.title);

          return (
            // Changing the month rewrites the feed under whatever survives it.
            <Animated.View
              key={group.title}
              layout={motion.reflow()}
              style={
                groupIndex > 0
                  ? { borderTopWidth: 1, borderTopColor: colors.border }
                  : undefined
              }>
              <View style={styles.dayLabel}>
                <ThemedText accessibilityRole="header" tone="muted" style={styles.dayLabelText}>
                  {group.title}
                </ThemedText>
                {dayTotal != null && !isStealthMode ? (
                  <ThemedText
                    testID="home-day-total"
                    style={[styles.dayLabelText, styles.dayTotal, { color: colors.text }]}>
                    {formatMoney(dayTotal, { sign: dayTotal > 0 ? 'always' : 'auto' })}
                  </ThemedText>
                ) : null}
              </View>
              {group.data.map((item, index) => {
                const isLastInSection = index === group.data.length - 1;
                return (
                  <TransactionItem
                    key={item.id}
                    title={item.name}
                    icon={item.icon}
                    category={item.category}
                    subtitle={item.accountName ?? item.mode ?? ''}
                    amount={Math.abs(item.amount)}
                    maskAmount={isStealthMode}
                    date={item.timeLabel ?? item.dateLabel ?? ''}
                    color={item.color}
                    bgColor={item.bgColor}
                    isIncome={item.entryType === 'income'}
                    unlinked={item.accountId == null}
                    variant="list"
                    isNew={item.id === newTransactionId}
                    entranceIndex={groupOffset + index}
                    showDivider={!isLastInSection}
                    onPress={(origin) => {
                      router.push({
                        pathname: '/entry/[id]',
                        params: {
                          id: item.id,
                          name: item.name,
                          category: item.category,
                          amount: toAmountString(Math.abs(item.amount)),
                          entryType: item.entryType ?? 'expense',
                          section: item.section,
                          mode: item.mode ?? '',
                          notes: item.notes ?? '',
                          merchant: item.merchant ?? '',
                          dateLabel: item.dateLabel ?? '',
                          rawDate: item.rawDate ?? '',
                          tag: item.tag ?? '',
                          // C9 — the feed's rows travel into detail the same
                          // way the transaction list's do.
                          ...(origin?.icon ? { originIcon: encodeFrame(origin.icon) } : {}),
                          ...(origin?.amount ? { originAmount: encodeFrame(origin.amount) } : {}),
                        },
                      });
                    }}
                  />
                );
              })}
            </Animated.View>
          );
        })}
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 32,
    marginTop: 10,
    marginBottom: 8,
    marginHorizontal: 16,
  },
  heading: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '700',
  },
  seeAll: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    minHeight: 32,
  },
  seeAllLabel: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
  },
  listCard: {
    padding: 0,
    overflow: 'hidden',
  },
  dayLabel: {
    height: 34,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
  },
  dayTotal: {
    fontVariant: ['tabular-nums'],
  },
  dayLabelText: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
  },
  // `padding` restated so it replaces Card's own, not just its left side.
  emptyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    paddingLeft: 14,
  },
  emptyTile: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  emptyTitle: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '700',
  },
  emptyBody: {
    fontSize: 13,
    lineHeight: 18,
  },
});
