import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/Button';
import { PressableView } from '@/components/ui/PressableView';
import { useAuthStore } from '@/hooks/use-auth-store';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import { getFriendlyErrorMessage } from '@/lib/api-error';
import { fetchAccounts, type Account } from '@/lib/accounts';
import { linkEntryAccount } from '@/lib/entries';
import { formatMoney } from '@/lib/money';
import { DashboardResponse } from '@/lib/insights';
import { getReviewReasons } from '@/lib/insight-summary';
import { HueTile, InsightCard } from './insight-ui';
import { SectionHeader } from './SectionHeader';

export function NeedsReview({
  entries,
  totalCount,
  periodStart,
  periodEnd,
  onLinked,
}: {
  entries: DashboardResponse['recent_transactions'];
  totalCount: number;
  periodStart: string;
  periodEnd: string;
  onLinked: () => void;
}) {
  const { colors } = useThemeTokens();
  const { token } = useAuthStore();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [pickerEntryID, setPickerEntryID] = useState<string | number | null>(null);
  const [linking, setLinking] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);

  useEffect(() => {
    if (!token || !entries.some((entry) => !entry.account_id)) return;
    void fetchAccounts(token)
      .then(setAccounts)
      .catch(() => setAccounts([]));
  }, [entries, token]);

  const linkAccount = async (entryID: string | number, account: Account) => {
    if (!token || linking) return;
    setLinking(true);
    setLinkError(null);
    try {
      await linkEntryAccount(token, entryID, account.id);
      setPickerEntryID(null);
      onLinked();
    } catch (error) {
      setLinkError(getFriendlyErrorMessage(error, 'Unable to link this transaction right now.'));
    } finally {
      setLinking(false);
    }
  };

  return (
    <SectionHeader
      title={`Needs review · ${totalCount}`}
      actionLabel={totalCount > entries.length ? `View all ${totalCount}` : 'Open'}
      onAction={() =>
        router.push({
          pathname: '/transactions',
          params: {
            review: '1',
            start_date: periodStart,
            end_date: periodEnd,
          },
        })
      }>
      <InsightCard flush>
        {entries.map((entry, index) => {
          const reasons = getReviewReasons(entry);
          const title = entry.title || entry.merchant || entry.category || 'Transaction';
          const needsAccount = !entry.account_id && entry.id != null;
          return (
            <View
              key={entry.id ?? `${entry.date}-${index}`}
              style={[styles.row, index > 0 && { borderTopWidth: 1, borderTopColor: colors.border }]}>
              <View style={styles.rowMain}>
                <PressableView
                  accessibilityRole="button"
                  accessibilityLabel={`Resolve ${title}`}
                  disabled={entry.id == null}
                  onPress={() => openDashboardEntryForReview(entry)}
                  style={styles.rowPress}
                  pressedStyle={styles.pressed}>
                  <HueTile icon="help-circle-outline" hue={colors.warning} />
                  <View style={styles.rowText}>
                    <View style={styles.titleLine}>
                      <ThemedText numberOfLines={1} style={[styles.title, { color: colors.text }]}>
                        {title}
                      </ThemedText>
                      <ThemedText style={[styles.amount, { color: colors.text }]}>
                        {formatMoney(Number(entry.amount || 0))}
                      </ThemedText>
                    </View>
                    <ThemedText numberOfLines={2} style={styles.meta}>
                      <ThemedText tone="muted" style={styles.meta}>
                        {shortReviewDate(entry.date)}
                        {' · '}
                      </ThemedText>
                      <ThemedText style={[styles.meta, styles.reason, { color: colors.warning }]}>
                        {reasons.map((reason) => reason.label).join(' · ')}
                      </ThemedText>
                    </ThemedText>
                  </View>
                </PressableView>
                {needsAccount ? (
                  <Button
                    variant="outline"
                    height={36}
                    label="Choose account"
                    accessibilityState={{ expanded: pickerEntryID === entry.id }}
                    onPress={() => {
                      setLinkError(null);
                      setPickerEntryID((current) => (current === entry.id ? null : entry.id!));
                    }}
                    style={styles.choose}
                  />
                ) : null}
              </View>
              {needsAccount && pickerEntryID === entry.id ? (
                <View style={[styles.picker, { borderColor: colors.border }]}>
                  {accounts.length > 0 ? (
                    accounts.map((account, accountIndex) => (
                      <PressableView
                        key={account.id}
                        accessibilityRole="button"
                        accessibilityLabel={`Link to ${account.name}`}
                        disabled={linking}
                        onPress={() => void linkAccount(entry.id!, account)}
                        style={[
                          styles.account,
                          accountIndex > 0 && { borderTopWidth: 1, borderTopColor: colors.border },
                        ]}
                        pressedStyle={styles.pressed}>
                        <ThemedText style={[styles.accountName, { color: colors.text }]}>
                          {account.name}
                        </ThemedText>
                        {linking ? (
                          <ActivityIndicator size="small" color={colors.muted} />
                        ) : (
                          <MaterialCommunityIcons name="link-variant" size={18} color={colors.text} />
                        )}
                      </PressableView>
                    ))
                  ) : (
                    <PressableView
                      accessibilityRole="button"
                      onPress={() => router.push('/money?segment=accounts')}
                      style={styles.account}
                      pressedStyle={styles.pressed}>
                      <ThemedText style={[styles.accountName, { color: colors.text }]}>
                        Set up an account first
                      </ThemedText>
                      <MaterialCommunityIcons name="chevron-right" size={18} color={colors.text} />
                    </PressableView>
                  )}
                  {linkError ? (
                    <ThemedText tone="negative" style={[styles.meta, styles.linkError]}>
                      {linkError}
                    </ThemedText>
                  ) : null}
                </View>
              ) : null}
            </View>
          );
        })}
      </InsightCard>
    </SectionHeader>
  );
}

/** `11 Oct` from the entry's `YYYY-MM-DD`; the raw text when it is not one. */
const shortReviewDate = (value?: string | null) => {
  if (!value) return 'No date recorded';
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return value;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return `${date.getDate()} ${date.toLocaleString('en-US', { month: 'short' })}`;
};

const styles = StyleSheet.create({
  row: {
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  rowMain: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  rowPress: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  rowText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  titleLine: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
  },
  title: {
    flexShrink: 1,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '500',
  },
  amount: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  meta: {
    fontSize: 13,
    lineHeight: 18,
  },
  reason: {
    fontWeight: '700',
  },
  choose: {
    paddingHorizontal: 12,
  },
  picker: {
    marginTop: 10,
    marginLeft: 48,
    borderWidth: 1,
    borderRadius: 12,
    overflow: 'hidden',
  },
  account: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
  },
  accountName: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600',
  },
  linkError: {
    padding: 12,
  },
  pressed: {
    opacity: 0.7,
  },
});

const openDashboardEntryForReview = (entry: DashboardResponse['recent_transactions'][number]) => {
  if (entry.id == null) return;
  const reasons = getReviewReasons(entry);
  const reviewFields = reasons
    .map((reason) => {
      if (reason.label === 'Missing account') return 'account';
      if (reason.label === 'Missing category' || reason.label === 'Uncategorized')
        return 'category';
      return '';
    })
    .filter(Boolean);
  const reviewFocus = reviewFields.includes('category') ? 'category' : reviewFields[0];
  router.push({
    pathname: '/entry/[id]',
    params: {
      id: String(entry.id),
      name: entry.title || entry.merchant || entry.category || 'Transaction',
      category: entry.category ?? '',
      amount: String(Math.abs(Number(entry.amount || 0))),
      entryType: String(entry.type ?? 'expense').toLowerCase() === 'income' ? 'income' : 'expense',
      section: 'Needs review',
      mode: entry.mode ?? '',
      notes: entry.notes ?? '',
      merchant: entry.merchant ?? '',
      dateLabel: entry.date ?? '',
      rawDate: entry.date ?? '',
      tag: entry.tag ?? '',
      edit: '1',
      reviewFocus: reviewFocus ?? '',
      reviewFields: reviewFields.join(','),
      categorySuggestions: JSON.stringify(entry.category_suggestions ?? []),
    },
  });
};
