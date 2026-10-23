import { MaterialCommunityIcons } from '@expo/vector-icons';
import { cssInterop } from 'nativewind';
import { useRef, useState } from 'react';
import { Pressable, ScrollView, TextInput, View } from 'react-native';

import {
  AvatarCircle,
  PrimaryModalButton,
} from '@/components/split/primitives/SplitPrimitives';
import {
  formatBalance,
  getGroupBalanceRows,
  getGroupTotals,
} from '@/components/split/split-utils';
import type {
  GroupActionMode,
  SplitGroupRosterPerson,
  SplitGroupSummary,
} from '@/components/split/split-types';
import { ThemedText } from '@/components/themed-text';
import { AnimatedBottomSheet } from '@/components/ui/AnimatedBottomSheet';
import { StateView } from '@/components/ui/StateView';
import { Fonts } from '@/constants/theme';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import { useBottomInset } from '@/hooks/use-bottom-inset';
import { roundToPaise, toAmountString } from '@/lib/money';
import type { SplitFriend } from '@/lib/splits';

const TText = cssInterop(ThemedText, { className: 'style' });

export function GroupActionModal({
  summary: liveSummary,
  mode: liveMode,
  friendById,
  currentUserName,
  onClose,
  onSettleWithFriend,
  onShareExport,
}: {
  summary: SplitGroupSummary | null;
  mode: GroupActionMode | null;
  friendById: Map<number, SplitFriend>;
  currentUserName: string;
  onClose: () => void;
  /** `amount` is what the row collected: the whole balance, or a part of it. */
  onSettleWithFriend: (
    summary: SplitGroupSummary,
    friendId: number,
    balance: number,
    amount: number
  ) => void;
  onShareExport: (summary: SplitGroupSummary) => void;
}) {
  const theme = useThemeTokens().colors;
  const listBottom = useBottomInset(44);
  const presentationRef = useRef<{
    summary: SplitGroupSummary;
    mode: GroupActionMode;
  } | null>(null);
  if (liveSummary && liveMode) {
    presentationRef.current = { summary: liveSummary, mode: liveMode };
  }
  const presentation = presentationRef.current;
  if (!presentation) return null;
  const { summary, mode } = presentation;

  const balances = getGroupBalanceRows(summary);
  const totals = getGroupTotals(summary, friendById, currentUserName);
  const openBalances = balances.filter((row) => row.balance !== 0);
  const title =
    mode === 'settle'
      ? 'Settle up'
      : mode === 'totals'
        ? 'Totals'
        : mode === 'balances'
          ? 'Balances'
          : 'Export';

  return (
    <AnimatedBottomSheet
      visible={Boolean(liveSummary && liveMode)}
      onClose={onClose}
      sheetStyle={{ maxHeight: '92%' }}>
      <View
        className="overflow-hidden rounded-t-[28px] border"
        style={{ backgroundColor: theme.background, borderColor: theme.border, flexShrink: 1 }}>
        <View className="min-h-16 flex-row items-center border-b px-5" style={{ borderColor: theme.border }}>
          <View className="flex-1">
            <TText variant="screenTitle" style={{ color: theme.text }}>
              {title}
            </TText>
            <TText className="mt-1 text-xs" style={{ color: theme.muted }}>
              {summary.group.name}
            </TText>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Close ${title}`}
            onPress={onClose}
            className="h-11 w-11 items-center justify-center rounded-full"
            style={{ backgroundColor: theme.secondary }}>
            <MaterialCommunityIcons name="close" size={22} color={theme.text} />
          </Pressable>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 24, paddingBottom: listBottom }}>
          {mode === 'settle' ? (
            <View>
              <TText variant="screenTitle" style={{ color: theme.text }}>
                Outstanding balances
              </TText>
              <TText className="mt-2 text-sm leading-5" style={{ color: theme.muted }}>
                Each row starts at the full balance. Change the amount to record a part payment.
              </TText>
              <View className="mt-6 gap-3">
                {openBalances.length > 0 ? (
                  openBalances.map((row) => (
                    <GroupBalanceActionRow
                      key={row.person.slot}
                      person={row.person}
                      balance={row.balance}
                      actionLabel="Record payment"
                      onPress={(amount) =>
                        onSettleWithFriend(summary, row.person.friendId, row.balance, amount)
                      }
                    />
                  ))
                ) : summary.billCount > 0 ? (
                  <StateView
                    compact
                    icon="check-circle-outline"
                    title="Settled up"
                    message="There are no open balances in this group."
                  />
                ) : (
                  // Nothing has been recorded here yet, which is a different
                  // state from everything having been paid back — and the only
                  // one of the two that has a next step.
                  <StateView
                    compact
                    icon="receipt-text-outline"
                    title="No expenses yet"
                    message="Add the first expense and balances will appear here."
                  />
                )}
              </View>
            </View>
          ) : null}

          {mode === 'totals' ? (
            <View>
              <View className="gap-3">
                <GroupMetricRow label="Total expenses" value={formatBalance(totals.total)} icon="receipt-text-outline" />
                <GroupMetricRow label="You paid" value={formatBalance(totals.youPaid)} icon="wallet-outline" />
                <GroupMetricRow label="Friends paid" value={formatBalance(totals.friendPaid)} icon="account-cash-outline" />
                <GroupMetricRow label="You lent" value={formatBalance(totals.youLent)} icon="arrow-up-circle-outline" positive />
                <GroupMetricRow label="You borrowed" value={formatBalance(totals.youBorrowed)} icon="arrow-down-circle-outline" negative />
              </View>
              <TText variant="sectionTitle" className="mt-8" style={{ color: theme.text }}>
                Paid by
              </TText>
              <View className="mt-3 gap-2">
                {[...totals.payers.entries()].map(([name, value]) => (
                  <View
                    key={name}
                    className="flex-row items-center justify-between rounded-2xl px-4 py-3"
                    style={{ backgroundColor: theme.card, borderColor: theme.border, borderWidth: 1 }}>
                    <TText variant="cardTitle" style={{ color: theme.text }}>
                      {name}
                    </TText>
                    <TText variant="cardTitle" style={{ color: theme.text }}>
                      {formatBalance(value)}
                    </TText>
                  </View>
                ))}
              </View>
            </View>
          ) : null}

          {mode === 'balances' ? (
            <View>
              <TText variant="screenTitle" style={{ color: theme.text }}>
                Group balances
              </TText>
              <View className="mt-5 gap-3">
                {balances.map((row) => (
                  <GroupBalanceActionRow
                    key={row.person.slot}
                    person={row.person}
                    balance={row.balance}
                    hasActivity={summary.billCount > 0}
                  />
                ))}
              </View>
            </View>
          ) : null}

          {mode === 'export' ? (
            <View>
              <View
                className="rounded-2xl border p-5"
                style={{ backgroundColor: theme.secondary, borderColor: theme.border }}>
                <View className="flex-row items-center gap-3">
                  <View
                    className="h-12 w-12 items-center justify-center rounded-xl"
                    style={{ backgroundColor: theme.accent }}>
                    <MaterialCommunityIcons name="table-large" size={25} color={theme.onAccent} />
                  </View>
                  <View className="flex-1">
                    <TText
                      className="text-xl"
                      style={{ color: theme.text, fontFamily: Fonts.title }}>
                      Finnri split export
                    </TText>
                    <TText className="mt-1 text-sm" style={{ color: theme.muted }}>
                      Excel-compatible CSV report
                    </TText>
                  </View>
                </View>
                <TText className="mt-4 text-sm leading-5" style={{ color: theme.muted }}>
                  A simple spreadsheet with who owes whom at the top, followed by every expense,
                  who paid, who it was split with, and each person&apos;s share.
                </TText>
              </View>
              <View
                className="mt-6 rounded-2xl border p-4"
                style={{ backgroundColor: theme.card, borderColor: theme.border }}>
                <ExportPreviewRow label="Format" value=".csv for Excel, Numbers, Google Sheets" />
                <ExportPreviewRow label="Currency" value="INR numeric amounts" />
                <ExportPreviewRow label="Top section" value="Who owes whom" />
                <ExportPreviewRow label="Expense section" value="Paid by, split with, shares" />
              </View>
              <PrimaryModalButton
                label="Share CSV export"
                loading={false}
                onPress={() => onShareExport(summary)}
              />
            </View>
          ) : null}
        </ScrollView>
      </View>
    </AnimatedBottomSheet>
  );
}

function GroupMetricRow({
  label,
  value,
  icon,
  positive,
  negative,
}: {
  label: string;
  value: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  positive?: boolean;
  negative?: boolean;
}) {
  const theme = useThemeTokens().colors;
  const color = positive ? theme.positive : negative ? theme.negative : theme.neutral;
  return (
    <View
      className="min-h-16 flex-row items-center gap-4 rounded-2xl border px-4"
      style={{ backgroundColor: theme.card, borderColor: theme.border }}>
      <MaterialCommunityIcons name={icon} size={24} color={color} />
      <TText variant="cardTitle" className="flex-1" style={{ color: theme.text }}>
        {label}
      </TText>
      <TText variant="cardTitle" style={{ color }}>
        {value}
      </TText>
    </View>
  );
}

function ExportPreviewRow({ label, value }: { label: string; value: string }) {
  const theme = useThemeTokens().colors;
  return (
    <View className="min-h-10 flex-row items-center justify-between gap-4">
      <TText className="text-sm" style={{ color: theme.muted }}>{label}</TText>
      <TText
        className="flex-1 text-right text-sm"
        style={{ color: theme.text, fontFamily: Fonts.title }}>
        {value}
      </TText>
    </View>
  );
}

/**
 * One person's balance in a group, and — where the sheet offers it — the
 * payment that closes some or all of it.
 *
 * The amount box is the point. Settling used to be all-or-nothing at the full
 * balance, which is not how anybody pays a housemate back: it arrives in
 * instalments. The field starts at the whole figure, so the common case is
 * still one tap, and anything smaller is a part payment that leaves the rest
 * outstanding.
 *
 * `person` carries the *viewer's own* friend row for whoever this is. A row
 * with none (`friendId === 0`) can be shown but not settled with — there is no
 * record on this account to write the payment against.
 */
function GroupBalanceActionRow({
  person,
  balance,
  hasActivity = true,
  actionLabel,
  onPress,
}: {
  person: SplitGroupRosterPerson;
  balance: number;
  /** False when nothing has been split with this person yet. */
  hasActivity?: boolean;
  actionLabel?: string;
  onPress?: (amount: number) => void;
}) {
  const theme = useThemeTokens().colors;
  const settled = balance === 0;
  const outstanding = roundToPaise(Math.abs(balance));
  const [amount, setAmount] = useState('');
  const typed = Number(amount.replace(/,/g, '').trim());
  const chosen = amount.trim() === '' ? outstanding : typed;
  const amountValid = Number.isFinite(chosen) && chosen > 0;
  const color = balance > 0 ? theme.positive : balance < 0 ? theme.negative : theme.neutral;
  const canSettle = Boolean(actionLabel && onPress) && person.friendId > 0;

  return (
    <View
      className="rounded-2xl border p-4"
      style={{ backgroundColor: theme.card, borderColor: theme.border }}>
      <View className="flex-row items-center gap-4">
        <AvatarCircle label={person.name} size={46} />
        <View className="flex-1">
          <TText variant="cardTitle" style={{ color: theme.text }}>
            {person.name}
          </TText>
          <TText className="mt-1 text-sm" style={{ color }}>
            {settled
              ? hasActivity
                ? 'settled up'
                : 'no expenses yet'
              : balance > 0
                ? `owes you ${formatBalance(balance)}`
                : `you owe ${formatBalance(balance)}`}
          </TText>
        </View>
        <TText variant="cardTitle" style={{ color }}>
          {settled ? formatBalance(0) : formatBalance(balance)}
        </TText>
      </View>
      {actionLabel && onPress ? (
        canSettle ? (
          <View className="mt-4">
            <View
              className="min-h-12 flex-row items-center rounded-full border px-4"
              style={{ borderColor: theme.border, backgroundColor: theme.background }}>
              <TText className="text-base" style={{ color: theme.muted }}>
                ₹
              </TText>
              <TextInput
                value={amount}
                onChangeText={setAmount}
                keyboardType="decimal-pad"
                accessibilityLabel={`Amount to settle with ${person.name}`}
                placeholder={toAmountString(outstanding)}
                placeholderTextColor={theme.muted}
                style={{
                  flex: 1,
                  marginLeft: 6,
                  minHeight: 44,
                  color: theme.text,
                  fontFamily: Fonts.body,
                  fontSize: 16,
                }}
              />
              {amount.trim() !== '' ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Settle the full balance"
                  onPress={() => setAmount('')}
                  className="min-h-11 justify-center pl-3">
                  <TText className="text-sm" style={{ color: theme.accent, fontFamily: Fonts.title }}>
                    Full
                  </TText>
                </Pressable>
              ) : null}
            </View>
            {amount.trim() !== '' && !amountValid ? (
              <TText className="mt-2 text-xs" style={{ color: theme.negative }}>
                Enter an amount greater than zero.
              </TText>
            ) : amountValid && chosen < outstanding ? (
              <TText className="mt-2 text-xs" style={{ color: theme.muted }}>
                {formatBalance(roundToPaise(outstanding - chosen))} stays outstanding.
              </TText>
            ) : null}
            <Pressable
              accessibilityRole="button"
              disabled={!amountValid}
              onPress={() => onPress(chosen)}
              className="mt-3 min-h-11 items-center justify-center rounded-full"
              style={{ backgroundColor: theme.accent, opacity: amountValid ? 1 : 0.5 }}>
              <TText className="text-sm" style={{ color: theme.onAccent, fontFamily: Fonts.title }}>
                {actionLabel}
              </TText>
            </Pressable>
          </View>
        ) : (
          // Somebody in the group the viewer has no friend row for yet. Saying
          // so beats a button that cannot do anything — which is what this was.
          <TText className="mt-3 text-xs" style={{ color: theme.muted }}>
            Waiting for {person.name} to be linked to your friends list before payments can be
            recorded.
          </TText>
        )
      ) : null}
    </View>
  );
}
