import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { cssInterop } from 'nativewind';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { StateView } from '@/components/ui/StateView';
import { Fonts } from '@/constants/theme';
import { useAuthStore } from '@/hooks/use-auth-store';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import { Account, fetchAccounts } from '@/lib/accounts';
import { getFriendlyErrorMessage } from '@/lib/api-error';
import { formatMoney } from '@/lib/money';
import {
  CardStatement,
  fetchCardStatements,
  formatCycleRange,
  formatDueLabel,
  formatStatementMonth,
  statementStatusLabels,
} from '@/lib/statements';

const TText = cssInterop(ThemedText, { className: 'style' });

/**
 * A card's billing history — one row per cycle, newest first.
 *
 * This is the record the whole feature exists to build. Each row answers the
 * three questions someone looks back for: what was the bill, did I pay it, and
 * when was it due.
 */
export default function StatementHistoryScreen() {
  const { accountId } = useLocalSearchParams<{ accountId?: string }>();
  const cardId = Number(accountId);
  const themeTokens = useThemeTokens();
  const theme = themeTokens.colors;
  const { token } = useAuthStore();

  const [card, setCard] = useState<Account | null>(null);
  const [statements, setStatements] = useState<CardStatement[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token || !Number.isFinite(cardId) || cardId <= 0) {
      setIsLoading(false);
      setError('Card not found.');
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const [accounts, rows] = await Promise.all([
        fetchAccounts(token),
        fetchCardStatements(token, cardId),
      ]);
      setCard(accounts.find((candidate) => candidate.id === cardId) ?? null);
      setStatements(rows);
    } catch (loadError) {
      setError(getFriendlyErrorMessage(loadError, 'Unable to load statements.'));
    } finally {
      setIsLoading(false);
    }
  }, [cardId, token]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  return (
    <SafeAreaView className="flex-1" edges={['top', 'left', 'right', 'bottom']}>
      <View className="flex-1" style={{ backgroundColor: theme.background }}>
        <View className="flex-row items-center justify-between px-6 pb-4 pt-3">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Go back"
            onPress={() => router.back()}
            className="h-11 w-11 items-center justify-center rounded-full"
            style={{ backgroundColor: theme.card }}>
            <MaterialCommunityIcons name="chevron-left" size={28} color={theme.text} />
          </Pressable>
          <TText
            className="text-sm uppercase"
            style={{ fontFamily: Fonts.title, color: theme.text, letterSpacing: 1.2 }}>
            Statements
          </TText>
          <View className="h-11 w-11" />
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 60 }}>
          {error && <ErrorBanner message={error} style={{ marginBottom: 16 }} />}

          {card && (
            <TText
              className="mb-5 text-base"
              numberOfLines={1}
              style={{ fontFamily: Fonts.title, color: '#7C8EA8' }}>
              {card.name}
            </TText>
          )}

          {!isLoading && statements.length === 0 && !error && (
            <View className="mt-16">
              <StateView
                icon="file-document-outline"
                title="No statements yet"
                message="Add a bill from the card screen and it will appear here every month."
              />
            </View>
          )}

          <View className="gap-3">
            {statements.map((statement) => (
              <StatementRow key={statement.id} statement={statement} />
            ))}
          </View>
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

function StatementRow({ statement }: { statement: CardStatement }) {
  const themeTokens = useThemeTokens();
  const theme = themeTokens.colors;
  const light = themeTokens.mode === 'light';

  const isDraft = statement.status === 'draft';
  const settled = statement.status === 'paid';

  const statusColor = settled
    ? '#16A34A'
    : statement.is_overdue
      ? '#EF4444'
      : isDraft
        ? '#64748B'
        : '#B45309';

  const statusBackground = settled
    ? 'rgba(22,163,74,0.12)'
    : statement.is_overdue
      ? 'rgba(239,68,68,0.12)'
      : light
        ? '#F1F5F9'
        : '#243142';

  return (
    <Pressable
      accessibilityRole="button"
      onPress={() =>
        router.push({ pathname: '/statements/[id]', params: { id: String(statement.id) } })
      }
      className="rounded-[24px] border px-5 py-4"
      style={{ backgroundColor: theme.card, borderColor: theme.border }}>
      <View className="flex-row items-start justify-between gap-3">
        <View className="min-w-0 flex-1">
          <TText
            className="text-base"
            numberOfLines={1}
            style={{ fontFamily: Fonts.title, color: theme.text }}>
            {formatStatementMonth(statement.statement_date)}
          </TText>
          <TText
            className="mt-1 text-xs"
            numberOfLines={1}
            style={{ fontFamily: Fonts.body, color: '#7C8EA8' }}>
            {formatCycleRange(statement.cycle_start, statement.cycle_end)}
          </TText>
        </View>

        <View className="items-end">
          {/* A draft has no amount yet, so showing ₹0 would be a lie about the
              bill rather than an honest absence of one. */}
          <TText
            className="text-base"
            numberOfLines={1}
            style={{ fontFamily: Fonts.title, color: theme.text }}>
            {isDraft ? '—' : formatMoney(statement.total_due)}
          </TText>
          <View
            className="mt-1.5 rounded-full px-2.5 py-1"
            style={{ backgroundColor: statusBackground }}>
            <TText className="text-[11px]" style={{ fontFamily: Fonts.title, color: statusColor }}>
              {settled || isDraft
                ? statementStatusLabels[statement.status]
                : formatDueLabel(statement)}
            </TText>
          </View>
        </View>
      </View>

      {statement.paid_amount > 0 && !settled && (
        <TText className="mt-3 text-xs" style={{ fontFamily: Fonts.body, color: '#7C8EA8' }}>
          {formatMoney(statement.paid_amount)} paid · {formatMoney(statement.remaining_due)} left
        </TText>
      )}
    </Pressable>
  );
}
