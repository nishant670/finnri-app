import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, View } from 'react-native';

import { AppHeader } from '@/components/navigation/AppHeader';
import { SplitFullScreenModal } from '@/components/split/primitives/SplitFullScreenModal';
import { TText } from '@/components/split/primitives/themed-interop';
import { formatBalance, formatBillListDate, getFirstName } from '@/components/split/split-utils';
import { StateView } from '@/components/ui/StateView';
import { Fonts } from '@/constants/theme';
import { useAuthStore } from '@/hooks/use-auth-store';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import { getFriendlyErrorMessage } from '@/lib/api-error';
import { buildFriendSettlementHistory, type FriendSettlementRow } from '@/lib/friend-settlements';
import { haptics } from '@/lib/haptics';
import {
  decideSplitSettlement,
  fetchFriendSettlementHistory,
  type SplitActivityItem,
  type SplitFriend,
} from '@/lib/splits';

/**
 * Every settlement between the reader and one friend, pushed over their page.
 *
 * Two people who share groups and settle up once a month had no record of it
 * in one place: each payment was a line in the whole feed, among every bill,
 * and the feed showed the latest twenty. This lists all of them, both
 * directions and both authors, with whether the other person agreed, and lets
 * the reader answer one that is waiting on them without leaving.
 */
export function FriendSettlementsModal({
  friend,
  onClose,
  onSettleUp,
  onChanged,
}: {
  friend: SplitFriend;
  onClose: () => void;
  onSettleUp: () => void;
  /** A confirm or deny moved a balance; the screens behind should re-read. */
  onChanged?: () => void;
}) {
  const theme = useThemeTokens().colors;
  const token = useAuthStore((state) => state.token);
  const [items, setItems] = useState<SplitActivityItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [decidingId, setDecidingId] = useState<number | null>(null);
  const friendFirstName = getFirstName(friend.name);

  const load = useCallback(async () => {
    if (!token) {
      // Nothing to ask with; a spinner here would never stop.
      setError('Please sign in again to see settlements.');
      return;
    }
    setError(null);
    try {
      setItems(await fetchFriendSettlementHistory(token, friend.id));
    } catch (loadError) {
      setError(getFriendlyErrorMessage(loadError, 'Unable to load settlements right now.'));
    }
  }, [friend.id, token]);

  useEffect(() => {
    void load();
  }, [load]);

  const history = useMemo(
    () => (items ? buildFriendSettlementHistory(items, friend.name) : null),
    [friend.name, items]
  );

  const decide = async (row: FriendSettlementRow, decision: 'confirm' | 'deny') => {
    if (!token || decidingId) return;
    setDecidingId(row.settlementId);
    try {
      await decideSplitSettlement(token, row.settlementId, decision);
      haptics.saved();
      await load();
      onChanged?.();
    } catch (decisionError) {
      haptics.rejected();
      setError(getFriendlyErrorMessage(decisionError, 'Unable to record that decision.'));
    } finally {
      setDecidingId(null);
    }
  };

  return (
    <SplitFullScreenModal onClose={onClose}>
      {(close) => (
        <>
          <AppHeader title="Settlements" subtitle={`With ${friend.name}`} onBack={close} />
          {!history ? (
            error ? (
              <StateView
                icon="wifi-off"
                title="Settlements did not load"
                message={error}
                actionLabel="Try again"
                onAction={() => void load()}
              />
            ) : (
              <View className="flex-1 items-center justify-center">
                <ActivityIndicator color={theme.accent} />
              </View>
            )
          ) : history.sections.length === 0 ? (
            <StateView
              icon="hand-coin-outline"
              title={`No settlements with ${friendFirstName} yet`}
              message="When one of you settles up, it shows here, with who recorded it and whether the other agreed."
              actionLabel="Settle up"
              onAction={() => {
                close();
                onSettleUp();
              }}
            />
          ) : (
            <ScrollView
              testID="friend-settlement-history"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 48, paddingTop: 8 }}>
              <View
                className="rounded-3xl border p-5"
                style={{ backgroundColor: theme.card, borderColor: theme.border }}>
                <View className="flex-row">
                  <View className="flex-1">
                    <TText className="text-xs" style={{ color: theme.muted }}>
                      {friendFirstName} paid you
                    </TText>
                    <TText
                      className="mt-1 text-xl"
                      style={{ color: theme.positive, fontFamily: Fonts.title }}>
                      {formatBalance(history.received)}
                    </TText>
                  </View>
                  <View className="flex-1">
                    <TText className="text-xs" style={{ color: theme.muted }}>
                      You paid {friendFirstName}
                    </TText>
                    <TText
                      className="mt-1 text-xl"
                      style={{ color: theme.text, fontFamily: Fonts.title }}>
                      {formatBalance(history.paid)}
                    </TText>
                  </View>
                </View>
                <TText className="mt-3 text-xs" style={{ color: theme.muted }}>
                  {history.count === 1 ? '1 settlement' : `${history.count} settlements`}
                  {history.awaitingYou > 0
                    ? ` · ${history.awaitingYou} waiting for you to confirm`
                    : ''}
                </TText>
              </View>

              {error ? (
                <TText className="mt-4 text-xs" style={{ color: theme.negative }}>
                  {error}
                </TText>
              ) : null}

              {history.sections.map((section) => (
                <View key={section.title} className="mt-7">
                  <TText
                    className="mb-2 text-base"
                    style={{ color: theme.mutedStrong, fontFamily: Fonts.title }}>
                    {section.title}
                  </TText>
                  {section.rows.map((row) => (
                    <SettlementHistoryRow
                      key={row.key}
                      row={row}
                      deciding={decidingId === row.settlementId}
                      disabled={decidingId !== null}
                      onDecide={(decision) => void decide(row, decision)}
                    />
                  ))}
                </View>
              ))}
            </ScrollView>
          )}
        </>
      )}
    </SplitFullScreenModal>
  );
}

function SettlementHistoryRow({
  row,
  deciding,
  disabled,
  onDecide,
}: {
  row: FriendSettlementRow;
  deciding: boolean;
  disabled: boolean;
  onDecide: (decision: 'confirm' | 'deny') => void;
}) {
  const theme = useThemeTokens().colors;
  const date = formatBillListDate(row.date);
  const denied = row.standing?.kind === 'denied';
  const badgeColor =
    row.standing?.kind === 'denied'
      ? theme.negative
      : row.standing?.kind === 'pending'
        ? theme.accent
        : theme.positive;

  return (
    <View
      testID={`settlement-row-${row.settlementId}`}
      className="flex-row gap-4 border-b py-4"
      style={{ borderColor: theme.border }}>
      <View className="w-10 items-center pt-1">
        <TText className="text-sm" style={{ color: theme.muted }}>
          {date.month}
        </TText>
        <TText className="text-xl" style={{ color: theme.muted }}>
          {date.day}
        </TText>
      </View>
      <View className="flex-1">
        <View className="flex-row items-start justify-between gap-3">
          <TText
            className="flex-1 text-base"
            style={{ color: theme.text, fontFamily: Fonts.title }}>
            {row.title}
          </TText>
          <TText
            className="text-base"
            style={{
              color: denied ? theme.muted : row.incoming ? theme.positive : theme.text,
              fontFamily: Fonts.title,
              textDecorationLine: denied ? 'line-through' : 'none',
            }}>
            {formatBalance(row.amount)}
          </TText>
        </View>
        <TText className="mt-1 text-xs leading-5" style={{ color: theme.muted }}>
          {row.details}
        </TText>
        {row.notes ? (
          <TText className="mt-1 text-xs leading-5" style={{ color: theme.mutedStrong }}>
            “{row.notes}”
          </TText>
        ) : null}
        {row.standing ? (
          <View
            className="mt-2 flex-row items-center gap-1.5 self-start rounded-full px-2.5 py-1"
            style={{ backgroundColor: `${badgeColor}1F` }}>
            <MaterialCommunityIcons
              name={
                row.standing.kind === 'denied'
                  ? 'close-circle-outline'
                  : row.standing.kind === 'pending'
                    ? 'clock-outline'
                    : 'check-circle-outline'
              }
              size={13}
              color={badgeColor}
            />
            <TText className="text-[11px]" style={{ color: badgeColor, fontFamily: Fonts.title }}>
              {row.standing.label}
            </TText>
          </View>
        ) : null}
        {row.standing?.yourMove ? (
          <View className="mt-3 flex-row gap-2">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Deny: ${row.title}`}
              disabled={disabled}
              onPress={() => onDecide('deny')}
              className="min-h-10 flex-1 items-center justify-center rounded-full border"
              style={{ borderColor: theme.border, opacity: disabled && !deciding ? 0.5 : 1 }}>
              <TText className="text-sm" style={{ color: theme.text, fontFamily: Fonts.title }}>
                Deny
              </TText>
            </Pressable>
            <Pressable
              testID={`settlement-confirm-${row.settlementId}`}
              accessibilityRole="button"
              accessibilityLabel={`Confirm: ${row.title}`}
              disabled={disabled}
              onPress={() => onDecide('confirm')}
              className="min-h-10 flex-1 items-center justify-center rounded-full"
              style={{ backgroundColor: theme.accent, opacity: disabled && !deciding ? 0.5 : 1 }}>
              {deciding ? (
                <ActivityIndicator color={theme.onAccent} />
              ) : (
                <TText
                  className="text-sm"
                  style={{ color: theme.onAccent, fontFamily: Fonts.title }}>
                  Confirm
                </TText>
              )}
            </Pressable>
          </View>
        ) : null}
      </View>
    </View>
  );
}
