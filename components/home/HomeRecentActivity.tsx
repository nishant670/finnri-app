import { useRouter } from 'expo-router';
import { View } from 'react-native';
import Animated from 'react-native-reanimated';

import { Card, SectionHeader } from '@/components/ui/theme-primitives';
import { SkeletonFrame, SkeletonRows } from '@/components/ui/Skeleton';
import { StateView } from '@/components/ui/StateView';
import { ThemedText } from '@/components/themed-text';
import { Transaction } from '@/types/transaction';
import { TransactionItem } from '@/components/home/TransactionItem';
import { encodeFrame } from '@/hooks/use-shared-element';
import { groupTransactionsBySection } from '@/lib/transactions';
import { toAmountString } from '@/lib/money';
import { useMotion } from '@/hooks/use-motion';
import { useThemeTokens } from '@/hooks/use-theme-tokens';

type HomeRecentActivityProps = {
  isEntriesLoading: boolean;
  entriesError: string | null;
  hasTransactions: boolean;
  transactions: Transaction[];
  newTransactionId: string | null;
  isStealthMode: boolean;
  onRetry: () => void;
  onAdd: () => void;
};

export function HomeRecentActivity({
  isEntriesLoading,
  entriesError,
  hasTransactions,
  transactions,
  newTransactionId,
  isStealthMode,
  onRetry,
  onAdd,
}: HomeRecentActivityProps) {
  const router = useRouter();
  const themeTokens = useThemeTokens();
  const isDark = themeTokens.mode === 'dark';
  const motion = useMotion();

  if (isEntriesLoading) {
    return (
      <SkeletonFrame label="Loading activity" testID="home-activity-skeleton">
        <SkeletonRows count={4} />
      </SkeletonFrame>
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
      <StateView
        icon="receipt-text-plus-outline"
        title="No activity yet"
        message="Record, type, or add your first transaction to start building your money story."
        actionLabel="Add"
        onAction={onAdd}
      />
    );
  }

  const recentTransactions = transactions.slice(0, 5);
  const groupedRecentTransactions = groupTransactionsBySection(recentTransactions);
  // The stagger counts down the feed rather than restarting at every date
  // heading — see the same note on the full list in app/transactions/index.tsx.
  let rowsAbove = 0;

  return (
    <View>
      <SectionHeader
        title="Recent Activity"
        actionLabel="See All"
        onAction={() => router.push('/transactions')}
      />

      <View className="px-6">
        {groupedRecentTransactions.map((group, groupIndex) => {
          const groupOffset = rowsAbove;
          rowsAbove += group.data.length;

          return (
            // Changing the month rewrites the feed under whatever survives it.
            <Animated.View key={group.title} layout={motion.reflow()}>
              <Card
                compact
                style={{
                  overflow: 'hidden',
                  padding: 0,
                  marginBottom:
                    groupIndex === groupedRecentTransactions.length - 1
                      ? 0
                      : themeTokens.spacing.md,
                }}>
                <View
                  style={{
                    paddingHorizontal: themeTokens.spacing.lg,
                    paddingTop: themeTokens.spacing.md,
                    paddingBottom: themeTokens.spacing.xs,
                  }}>
                  <ThemedText
                    variant="micro"
                    style={{
                      color: isDark ? 'rgba(255,255,255,0.5)' : '#9A9697',
                      textTransform: 'uppercase',
                      letterSpacing: 1,
                    }}>
                    {group.title}
                  </ThemedText>
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
              </Card>
            </Animated.View>
          );
        })}
      </View>
    </View>
  );
}
