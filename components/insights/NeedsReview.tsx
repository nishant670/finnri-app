import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, TouchableOpacity, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { useAuthStore } from '@/hooks/use-auth-store';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import { getFriendlyErrorMessage } from '@/lib/api-error';
import { fetchAccounts, type Account } from '@/lib/accounts';
import { linkEntryAccount } from '@/lib/entries';
import { formatMoney } from '@/lib/money';
import { DashboardResponse } from '@/lib/insights';
import { getReviewReasons } from '@/lib/insight-summary';
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
  const theme = useThemeTokens();
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
      title="Needs review"
      actionLabel={totalCount > entries.length ? `View all ${totalCount}` : `${totalCount} Items`}
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
      <View
        className="overflow-hidden rounded-[24px] border shadow-sm"
        style={{ backgroundColor: theme.colors.card, borderColor: theme.colors.border }}>
        {entries.map((entry, index) => {
          const reasons = getReviewReasons(entry);
          return (
            <TouchableOpacity
              key={entry.id ?? `${entry.date}-${index}`}
              activeOpacity={0.78}
              disabled={entry.id == null}
              onPress={() => openDashboardEntryForReview(entry)}
              className={`p-4 ${index < entries.length - 1 ? 'border-b border-gray-100 dark:border-gray-700' : ''}`}>
              <View className="flex-row items-start">
                <View className="mr-3 h-9 w-9 items-center justify-center rounded-full bg-gray-100">
                  <MaterialCommunityIcons name="help" size={16} color="#9B9692" />
                </View>
                <View className="min-w-0 flex-1 pr-3">
                  <ThemedText className="text-sm font-bold" numberOfLines={1}>
                    {entry.title || entry.merchant || entry.category || 'Transaction'}
                  </ThemedText>
                  <ThemedText tone="muted" className="mt-0.5 text-[11px]">
                    {entry.date || 'No date recorded'}
                  </ThemedText>
                </View>
                <View className="items-end">
                  <ThemedText className="text-sm font-black">
                    {formatMoney(Number(entry.amount || 0))}
                  </ThemedText>
                  <ThemedText
                    className="mt-1 text-[10px] font-bold"
                    style={{ color: theme.colors.accent }}>
                    Resolve
                  </ThemedText>
                </View>
              </View>
              <View className="ml-12 mt-3 flex-row flex-wrap gap-2">
                {reasons.map((reason) => (
                  <View
                    key={reason.label}
                    className="flex-row items-center rounded-full px-2.5 py-1"
                    style={{ backgroundColor: theme.colors.secondary }}>
                    <MaterialCommunityIcons
                      name={reason.icon as keyof typeof MaterialCommunityIcons.glyphMap}
                      size={12}
                      color={theme.colors.accent}
                    />
                    <ThemedText
                      className="ml-1 text-[10px] font-black"
                      style={{ color: theme.colors.accent }}>
                      {reason.label}
                    </ThemedText>
                  </View>
                ))}
              </View>
              {!entry.account_id && entry.id != null ? (
                <View className="ml-12 mt-3">
                  <Pressable
                    accessibilityRole="button"
                    onPress={(event) => {
                      event.stopPropagation();
                      setLinkError(null);
                      setPickerEntryID((current) => (current === entry.id ? null : entry.id!));
                    }}
                    className="self-start rounded-full px-3 py-2"
                    style={{ backgroundColor: theme.colors.accent }}>
                    <ThemedText tone="onAccent" className="text-[11px] font-black">
                      Choose account
                    </ThemedText>
                  </Pressable>
                  {pickerEntryID === entry.id ? (
                    <View
                      className="mt-3 gap-2 rounded-2xl p-3"
                      style={{ backgroundColor: theme.colors.secondary }}>
                      {accounts.length > 0 ? (
                        accounts.map((account) => (
                          <Pressable
                            key={account.id}
                            accessibilityRole="button"
                            disabled={linking}
                            onPress={(event) => {
                              event.stopPropagation();
                              void linkAccount(entry.id!, account);
                            }}
                            className="flex-row items-center justify-between rounded-xl px-3 py-2"
                            style={{ backgroundColor: theme.colors.card }}>
                            <ThemedText className="text-xs font-bold">{account.name}</ThemedText>
                            {linking ? (
                              <ActivityIndicator size="small" color={theme.colors.accent} />
                            ) : (
                              <MaterialCommunityIcons
                                name="link-variant"
                                size={16}
                                color={theme.colors.accent}
                              />
                            )}
                          </Pressable>
                        ))
                      ) : (
                        <Pressable
                          onPress={(event) => {
                            event.stopPropagation();
                            router.push('/money?segment=accounts');
                          }}>
                          <ThemedText
                            className="text-xs font-bold"
                            style={{ color: theme.colors.accent }}>
                            Set up an account first
                          </ThemedText>
                        </Pressable>
                      )}
                      {linkError ? (
                        <ThemedText tone="negative" className="text-xs">
                          {linkError}
                        </ThemedText>
                      ) : null}
                    </View>
                  ) : null}
                </View>
              ) : null}
            </TouchableOpacity>
          );
        })}
      </View>
    </SectionHeader>
  );
}
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
