import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { Fragment, useCallback, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { MarkPaidSheet, type MarkPaidChoice } from '@/components/money/subscriptions/MarkPaidSheet';
import { SwipeActionRow } from '@/components/split/rows/SwipeActionRow';
import { ThemedText } from '@/components/themed-text';
import { PressableView } from '@/components/ui/PressableView';
import { Segments } from '@/components/ui/Segments';
import { SkeletonFrame, SkeletonRows } from '@/components/ui/Skeleton';
import { mixHex, withAlpha } from '@/constants/theme';
import { useAuthStore } from '@/hooks/use-auth-store';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import { fetchAccounts, type Account } from '@/lib/accounts';
import { getFriendlyErrorMessage } from '@/lib/api-error';
import { haptics } from '@/lib/haptics';
import { formatMoney } from '@/lib/money';
import {
  buildNotificationSections,
  notificationAmount,
  type NotificationJob,
} from '@/lib/notification-jobs';
import { todayISO } from '@/lib/subscription-form';
import { decideSplitSettlement } from '@/lib/splits';
import { categoryTile } from '@/lib/categories';
import {
  notificationDestination,
  notificationKind,
  notificationTimeLabel,
  occurrenceIdFromActionURL,
} from '@/lib/notification-kinds';
import {
  AppNotification,
  accountIdFromActionURL,
  deleteNotification,
  fetchNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  recurringIdFromActionURL,
  settlementIdFromActionURL,
} from '@/lib/notifications';
import {
  confirmSubscriptionOccurrence,
  fetchSubscriptions,
  markSubscriptionPaid,
  revertSubscriptionOccurrence,
  type Subscription,
} from '@/lib/subscriptions';

/** P49: All · Unread. "Read" went: a job done clears itself, and what is left is read or not. */
type Filter = 'all' | 'unread';

const EMPTY_COPY: Record<Filter, { title: string; body: string }> = {
  all: {
    title: 'No notifications yet',
    body: 'Bill reminders, budget alerts and split updates show up here.',
  },
  unread: { title: 'Nothing unread', body: 'New reminders and updates show up here first.' },
};

/**
 * Notifications (R10-Notif, R10-Notif-Dark, R10-Kinds): grouped Today · Last 7
 * days · Earlier in cards of inset-divided rows, each with its type's own icon
 * and tile, and a next step that names the screen it opens. Unread rows are
 * bold, dotted and faintly warm, with the step drawn as an outlined chip; read
 * rows keep the step as a plain link. No accent borders.
 */
export default function NotificationsScreen() {
  const router = useRouter();
  const { token } = useAuthStore();
  const { colors, mode } = useThemeTokens();
  const [filter, setFilter] = useState<Filter>('all');
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (silent = false) => {
      if (!token) {
        setNotifications([]);
        setUnreadCount(0);
        setLoading(false);
        return;
      }
      if (!silent) setLoading(true);
      setError(null);
      try {
        const payload = await fetchNotifications(token, filter);
        setNotifications(payload.notifications);
        setUnreadCount(payload.unread_count);
      } catch (err) {
        setError(getFriendlyErrorMessage(err, 'Unable to load notifications right now.'));
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [filter, token]
  );

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const { needs, updates } = useMemo(() => buildNotificationSections(notifications), [notifications]);
  const unreadFill = mode === 'dark' ? withAlpha(colors.accent, 0.08) : mixHex(colors.card, colors.accent, 0.07);
  /** One swiped-open row at a time (P49 swipe to clear). */
  const [openSwipeKey, setOpenSwipeKey] = useState<string | null>(null);
  /** Settle-ups being answered, so their buttons wait. */
  const [deciding, setDeciding] = useState<number | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // P47: Mark paid in place, with the same sheet as Recurring.
  const [payingFor, setPayingFor] = useState<Subscription | null>(null);
  const [payAccounts, setPayAccounts] = useState<Account[]>([]);
  const [isPaying, setIsPaying] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);
  const payLists = useRef<[Subscription[], Account[]] | null>(null);

  const markRead = async (notification: AppNotification) => {
    if (!token || notification.read_at) return;
    await markNotificationRead(token, notification.id);
    setNotifications((current) =>
      current.map((item) =>
        item.id === notification.id ? { ...item, read_at: new Date().toISOString() } : item
      )
    );
    setUnreadCount((current) => Math.max(0, current - 1));
  };

  const openNotification = async (notification: AppNotification) => {
    await markRead(notification);
    const destination = notificationDestination(notification);
    if (destination) router.push(destination);
  };

  const handleMarkAllRead = async () => {
    if (!token || unreadCount === 0) return;
    await markAllNotificationsRead(token);
    await load(true);
  };

  /** P49: cleared for good — swiped away, or Updates' Clear. */
  const clearNotifications = async (items: AppNotification[]) => {
    if (!token || items.length === 0) return;
    haptics.select();
    const ids = new Set(items.map((item) => item.id));
    setNotifications((current) => current.filter((item) => !ids.has(item.id)));
    setUnreadCount((current) => Math.max(0, current - items.filter((item) => !item.read_at).length));
    setOpenSwipeKey(null);
    try {
      await Promise.all(items.map((item) => deleteNotification(token, item.id)));
    } catch {
      void load(true);
    }
  };

  const handleOccurrence = async (notification: AppNotification, action: 'confirm' | 'revert') => {
    if (!token) return;
    const id = occurrenceIdFromActionURL(notification.action_url);
    if (!id) return;
    if (action === 'confirm') {
      await confirmSubscriptionOccurrence(token, id);
      await load(true);
      return;
    }
    const occurrence = await revertSubscriptionOccurrence(token, id);
    router.push({
      pathname: '/entry/[id]',
      params: { id: String(occurrence.entry_id), edit: '1' },
    });
  };

  /** P47: answer a settle-up without leaving the list. */
  const decide = async (notification: AppNotification, decision: 'confirm' | 'deny') => {
    const id = settlementIdFromActionURL(notification.action_url);
    if (!token || !id || deciding) return;
    setDeciding(id);
    setActionError(null);
    try {
      const decided = await decideSplitSettlement(token, id, decision);
      decision === 'confirm' ? haptics.saved() : haptics.select();
      // Null: already answered elsewhere, or gone. Nothing is left to do,
      // so the prompt goes rather than staying in Needs you for good.
      if (!decided) await deleteNotification(token, notification.id).catch(() => undefined);
      await load(true);
    } catch (decideError) {
      haptics.rejected();
      setActionError(getFriendlyErrorMessage(decideError, 'Could not answer that settle-up.'));
    } finally {
      setDeciding(null);
    }
  };

  /** P47: Mark paid on a subscription reminder, as Recurring does it. */
  const startMarkPaid = async (notification: AppNotification) => {
    const id = recurringIdFromActionURL(notification.action_url);
    if (!token || !id) return;
    setPayError(null);
    setActionError(null);
    try {
      // Read once per visit: a second Mark paid opens straight away.
      payLists.current ??= await Promise.all([fetchSubscriptions(token), fetchAccounts(token)]);
      const [subscriptions, accounts] = payLists.current;
      const subscription = subscriptions.find((item) => item.id === id);
      if (!subscription) {
        setActionError('That payment is no longer in Recurring.');
        return;
      }
      setPayAccounts(accounts);
      setPayingFor(subscription);
    } catch (loadError) {
      setActionError(getFriendlyErrorMessage(loadError, 'Could not open that payment.'));
    }
  };

  const confirmMarkPaid = async (choice: MarkPaidChoice) => {
    if (!token || !payingFor || isPaying) return;
    setIsPaying(true);
    setPayError(null);
    try {
      await markSubscriptionPaid(token, payingFor.id, todayISO(), choice);
      haptics.saved();
      // Its next due date moved; read it again next time.
      payLists.current = null;
      setPayingFor(null);
      await load(true);
    } catch (paidError) {
      haptics.rejected();
      setPayError(getFriendlyErrorMessage(paidError, 'Unable to mark this paid.'));
    } finally {
      setIsPaying(false);
    }
  };

  /** The one step a job offers, done here or opening the screen for it (P47). */
  const jobActions = (notification: AppNotification) => {
    const destination = notificationDestination(notification);
    const kind = notificationKind(notification.type);
    const actions: { label: string; primary?: boolean; onPress: () => void }[] = [];
    if (notification.type === 'subscription.due' || notification.type === 'subscription.overdue') {
      if (recurringIdFromActionURL(notification.action_url)) {
        actions.push({ label: 'Mark paid', primary: true, onPress: () => void startMarkPaid(notification) });
      }
    }
    if (notification.type === 'card_statement.statement_expected') {
      const accountId = accountIdFromActionURL(notification.action_url);
      if (accountId) {
        actions.push({
          label: 'Add bill amount',
          primary: true,
          onPress: () => {
            void markRead(notification);
            router.push({ pathname: '/accounts/[id]', params: { id: accountId, add: 'statement' } });
          },
        });
        return actions;
      }
    }
    if (destination && kind.action) {
      actions.push({ label: kind.action, onPress: () => void openNotification(notification) });
    }
    return actions;
  };

  const renderJob = (job: NotificationJob) => {
    const notification = job.items[0];
    const unread = job.items.some((item) => !item.read_at);
    const kind = notificationKind(notification.type);
    const tile = categoryTile(kind, mode);
    const occurrenceId = occurrenceIdFromActionURL(notification.action_url);
    const isSettlements = notification.type === 'split.settlement.recorded';
    const isSetupStack = notification.type === 'account.needs_setup' && job.items.length > 1;
    const amount = isSettlements && job.items.length > 1 ? null : notificationAmount(notification);
    const repeats = !job.stackTitle && job.items.length > 1 ? job.items.length : 0;
    const title = job.stackTitle ?? notification.title;
    const body = isSettlements && job.items.length > 1 ? null : notification.body;
    const actions = isSettlements || occurrenceId ? [] : jobActions(notification);

    return (
      <SwipeActionRow
        actions={[{ label: 'Clear', icon: 'close', onPress: () => void clearNotifications(job.items) }]}
        open={openSwipeKey === job.key}
        onOpenChange={(open) => setOpenSwipeKey(open ? job.key : null)}>
        <View
          testID={`notification-${notification.id}`}
          style={[{ backgroundColor: unread ? unreadFill : colors.card }]}>
          <PressableView
            accessibilityRole="button"
            accessibilityLabel={`${unread ? 'Unread. ' : ''}${title}`}
            accessibilityHint={kind.action ?? undefined}
            onPress={() =>
              isSetupStack
                ? (job.items.forEach((item) => void markRead(item)),
                  router.push({ pathname: '/(tabs)/money', params: { segment: 'accounts' } }))
                : void openNotification(notification)
            }
            style={styles.row}
            pressedStyle={styles.pressed}>
            <View style={[styles.tile, { backgroundColor: tile.background }]}>
              <MaterialCommunityIcons name={kind.icon} size={22} color={tile.foreground} />
            </View>
            <View style={styles.rowText}>
              <View style={styles.titleLine}>
                <ThemedText style={[styles.title, { fontWeight: unread ? '700' : '500' }]}>{title}</ThemedText>
                {/* P48: the amount on the right, where amounts are everywhere else. */}
                {amount !== null ? (
                  <View style={styles.time}>
                    <ThemedText testID={`notification-amount-${notification.id}`} style={styles.amount}>
                      {formatMoney(amount)}
                    </ThemedText>
                    {unread ? (
                      <View accessibilityElementsHidden style={[styles.dot, { backgroundColor: colors.accent }]} />
                    ) : null}
                  </View>
                ) : (
                  <View style={styles.time}>
                    <ThemedText tone="muted" style={styles.timeLabel}>
                      {notificationTimeLabel(notification.created_at)}
                    </ThemedText>
                    {unread ? (
                      <View accessibilityElementsHidden style={[styles.dot, { backgroundColor: colors.accent }]} />
                    ) : null}
                  </View>
                )}
              </View>
              {body ? (
                <ThemedText tone="muted" numberOfLines={2} style={styles.body}>
                  {body}
                </ThemedText>
              ) : null}
              {amount !== null || repeats ? (
                <ThemedText tone="muted" style={styles.meta}>
                  {[
                    amount !== null ? notificationTimeLabel(notification.created_at) : null,
                    repeats ? `${repeats} reminders` : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </ThemedText>
              ) : null}
            </View>
          </PressableView>

          {/* P47: settle-ups answered here, one line each. */}
          {isSettlements ? (
            <View style={styles.inlineList}>
              {job.items.map((item) => {
                const id = settlementIdFromActionURL(item.action_url);
                const itemAmount = notificationAmount(item);
                return (
                  <View key={item.id} style={[styles.inlineItem, { borderTopColor: colors.border }]}>
                    <View style={styles.rowText}>
                      <ThemedText numberOfLines={1} style={styles.inlineTitle}>
                        {job.items.length > 1 ? item.title : 'Did it reach you?'}
                      </ThemedText>
                      {/* A lone settle-up has its amount on the row already. */}
                      {itemAmount !== null && job.items.length > 1 ? (
                        <ThemedText tone="muted" style={styles.meta}>
                          {formatMoney(itemAmount)}
                        </ThemedText>
                      ) : null}
                    </View>
                    <PressableView
                      testID={`settlement-deny-${id}`}
                      accessibilityRole="button"
                      disabled={deciding !== null}
                      onPress={() => void decide(item, 'deny')}
                      style={[styles.chip, styles.inlineButton, { backgroundColor: colors.card, borderColor: colors.borderStrong }]}
                      pressedStyle={styles.pressed}>
                      <ThemedText style={styles.actionLabel}>Deny</ThemedText>
                    </PressableView>
                    <PressableView
                      testID={`settlement-confirm-${id}`}
                      accessibilityRole="button"
                      disabled={deciding !== null}
                      onPress={() => void decide(item, 'confirm')}
                      style={[styles.chip, styles.inlineButton, { backgroundColor: colors.text, borderColor: colors.text }]}
                      pressedStyle={styles.pressed}>
                      <ThemedText style={[styles.actionLabel, { color: colors.background }]}>
                        {deciding === id ? 'Saving…' : 'Confirm'}
                      </ThemedText>
                    </PressableView>
                  </View>
                );
              })}
            </View>
          ) : null}

          {actions.length > 0 ? (
            <View style={styles.occurrenceActions}>
              {actions.map((action) => (
                <PressableView
                  key={action.label}
                  accessibilityRole="button"
                  onPress={action.onPress}
                  style={[
                    styles.chip,
                    styles.occurrenceChip,
                    action.primary
                      ? { backgroundColor: colors.text, borderColor: colors.text }
                      : { backgroundColor: colors.card, borderColor: colors.borderStrong },
                  ]}
                  pressedStyle={styles.pressed}>
                  <ThemedText style={[styles.actionLabel, action.primary && { color: colors.background }]}>
                    {action.label}
                  </ThemedText>
                  {action.primary ? null : (
                    <MaterialCommunityIcons name="chevron-right" size={16} color={colors.text} />
                  )}
                </PressableView>
              ))}
            </View>
          ) : null}

          {/* Outside the row's own press target, so each button is its own tap
              rather than a button nested in a button. */}
          {occurrenceId ? (
            <View style={styles.occurrenceActions}>
              {(['confirm', 'revert'] as const).map((choice) => (
                <PressableView
                  key={choice}
                  accessibilityRole="button"
                  onPress={() => void handleOccurrence(notification, choice)}
                  style={[styles.chip, styles.occurrenceChip, { backgroundColor: colors.card, borderColor: colors.borderStrong }]}
                  pressedStyle={styles.pressed}>
                  <ThemedText style={styles.actionLabel}>{choice === 'confirm' ? 'Confirm' : 'Fix it'}</ThemedText>
                </PressableView>
              ))}
            </View>
          ) : null}
        </View>
      </SwipeActionRow>
    );
  };

  const empty = EMPTY_COPY[filter];

  return (
    <SafeAreaView
      style={[styles.screen, { backgroundColor: colors.background }]}
      edges={['top', 'left', 'right', 'bottom']}>
      <View style={styles.header}>
        <PressableView
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={() => router.back()}
          style={styles.back}
          pressedStyle={styles.pressed}>
          <MaterialCommunityIcons name="chevron-left" size={28} color={colors.text} />
        </PressableView>
        <ThemedText accessibilityRole="header" numberOfLines={1} style={styles.heading}>
          Notifications
        </ThemedText>
        {/* Only when there is something to mark. */}
        {unreadCount > 0 ? (
          <PressableView
            testID="notifications-mark-all"
            accessibilityRole="button"
            onPress={() => void handleMarkAllRead()}
            style={styles.markAll}
            pressedStyle={styles.pressed}>
            <MaterialCommunityIcons name="check-all" size={18} color={colors.text} />
            <ThemedText style={styles.markAllLabel}>Mark all read</ThemedText>
          </PressableView>
        ) : null}
      </View>

      <Segments
        active={filter}
        onChange={setFilter}
        style={styles.filter}
        options={[
          { key: 'all', label: 'All' },
          { key: 'unread', label: 'Unread', count: unreadCount },
        ]}
      />

      {loading ? (
        <SkeletonFrame label="Loading notifications" testID="notifications-skeleton" style={styles.skeleton}>
          <SkeletonRows count={6} showAmount={false} lines={3} />
        </SkeletonFrame>
      ) : error ? (
        <View style={styles.message}>
          <MaterialCommunityIcons name="alert-circle-outline" size={32} color={colors.negative} />
          <ThemedText tone="muted" style={styles.messageBody}>
            {error}
          </ThemedText>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {unreadCount === 0 && notifications.length > 0 ? (
            <View
              accessibilityRole="summary"
              style={[styles.caughtUp, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={[styles.caughtUpIcon, { backgroundColor: withAlpha(colors.positive, 0.14) }]}>
                <MaterialCommunityIcons name="check" size={18} color={colors.positive} />
              </View>
              <View>
                <ThemedText style={styles.caughtUpTitle}>You’re all caught up</ThemedText>
                <ThemedText tone="muted" style={styles.caughtUpBody}>
                  Nothing new since you last looked.
                </ThemedText>
              </View>
            </View>
          ) : null}

          {actionError ? (
            <ThemedText tone="negative" style={styles.actionError}>
              {actionError}
            </ThemedText>
          ) : null}

          {needs.length === 0 && updates.length === 0 ? (
            <>
              <ThemedText tone="muted" style={styles.groupLabel}>
                Nothing yet
              </ThemedText>
              <View style={[styles.empty, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={[styles.emptyIcon, { backgroundColor: colors.track }]}>
                  <MaterialCommunityIcons name="bell-outline" size={22} color={colors.text} />
                </View>
                <ThemedText style={styles.emptyTitle}>{empty.title}</ThemedText>
                <ThemedText tone="muted" style={styles.emptyBody}>
                  {empty.body}
                </ThemedText>
              </View>
            </>
          ) : null}

          {/* P45: what needs you, one row per job, before what happened. */}
          {needs.length > 0 ? (
            <View testID="notifications-needs-you">
              <View style={styles.sectionHead}>
                <ThemedText accessibilityRole="header" style={styles.sectionTitle}>
                  Needs you
                </ThemedText>
                <ThemedText tone="muted" style={styles.sectionCount}>
                  {`${needs.length} to sort`}
                </ThemedText>
              </View>
              <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                {needs.map((job, index) => (
                  <Fragment key={job.key}>
                    {index > 0 ? <View style={[styles.divider, { backgroundColor: colors.border }]} /> : null}
                    {renderJob(job)}
                  </Fragment>
                ))}
              </View>
            </View>
          ) : null}

          {updates.length > 0 ? (
            <View testID="notifications-updates">
              <View style={styles.sectionHead}>
                <ThemedText accessibilityRole="header" style={styles.sectionTitle}>
                  Updates
                </ThemedText>
                <PressableView
                  testID="notifications-clear-updates"
                  accessibilityRole="button"
                  accessibilityLabel="Clear updates"
                  onPress={() => void clearNotifications(updates)}
                  hitSlop={8}
                  pressedStyle={styles.pressed}>
                  <ThemedText style={styles.clearLabel}>Clear</ThemedText>
                </PressableView>
              </View>
              <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                {updates.map((notification, index) => (
                  <Fragment key={notification.id}>
                    {index > 0 ? <View style={[styles.divider, { backgroundColor: colors.border }]} /> : null}
                    {renderJob({ key: `update:${notification.id}`, items: [notification], stackTitle: null })}
                  </Fragment>
                ))}
              </View>
            </View>
          ) : null}
        </ScrollView>
      )}
      <MarkPaidSheet
        key={payingFor?.id ?? 'none'}
        visible={payingFor !== null}
        subscription={payingFor}
        accounts={payAccounts}
        submitting={isPaying}
        error={payError}
        onClose={() => setPayingFor(null)}
        onConfirm={(choice) => void confirmMarkPaid(choice)}
        onAddAccount={() => {
          setPayingFor(null);
          router.push('/accounts/manage');
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  sectionHead: {
    minHeight: 36,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
    marginBottom: 6,
    // In line with the cards under it.
    marginHorizontal: 16,
    paddingHorizontal: 4,
  },
  sectionTitle: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '700',
  },
  sectionCount: {
    fontSize: 13,
    lineHeight: 18,
  },
  clearLabel: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
  },
  amount: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  meta: {
    marginTop: 2,
    fontSize: 12,
    lineHeight: 16,
  },
  inlineList: {
    paddingLeft: 66,
    paddingRight: 14,
    paddingBottom: 6,
  },
  inlineItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    borderTopWidth: 1,
  },
  inlineTitle: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
  },
  inlineButton: {
    marginTop: 0,
  },
  actionError: {
    marginTop: 8,
    fontSize: 13,
    lineHeight: 18,
  },
  screen: {
    flex: 1,
  },
  header: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
  },
  back: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heading: {
    flex: 1,
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '700',
  },
  markAll: {
    height: 40,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
  },
  markAllLabel: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
  },
  filter: {
    marginTop: 4,
    marginHorizontal: 16,
  },
  skeleton: {
    paddingHorizontal: 16,
    paddingTop: 20,
  },
  message: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 12,
  },
  messageBody: {
    textAlign: 'center',
    fontSize: 14,
    lineHeight: 20,
  },
  content: {
    paddingBottom: 32,
  },
  caughtUp: {
    marginTop: 14,
    marginHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderRadius: 16,
  },
  caughtUpIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  caughtUpTitle: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '600',
  },
  caughtUpBody: {
    fontSize: 12,
    lineHeight: 16,
  },
  groupLabel: {
    marginTop: 20,
    marginBottom: 8,
    marginHorizontal: 16,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
  },
  card: {
    marginHorizontal: 16,
    borderWidth: 1,
    borderRadius: 16,
    overflow: 'hidden',
  },
  divider: {
    height: 1,
    marginLeft: 66,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    padding: 14,
  },
  tile: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  titleLine: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  title: {
    flex: 1,
    minWidth: 0,
    fontSize: 15,
    lineHeight: 20,
  },
  time: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  timeLabel: {
    fontSize: 12,
    lineHeight: 16,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  body: {
    fontSize: 13,
    lineHeight: 18,
  },
  chip: {
    marginTop: 6,
    alignSelf: 'flex-start',
    height: 32,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingLeft: 14,
    paddingRight: 8,
    borderWidth: 1,
    borderRadius: 16,
  },
  link: {
    marginTop: 2,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  actionLabel: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
  },
  occurrenceActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: -8,
    paddingLeft: 66,
    paddingBottom: 14,
  },
  occurrenceChip: {
    marginTop: 0,
    paddingRight: 14,
  },
  empty: {
    marginHorizontal: 16,
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 24,
    borderWidth: 1,
    borderRadius: 16,
  },
  emptyIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '600',
    textAlign: 'center',
  },
  emptyBody: {
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
  },
  pressed: {
    opacity: 0.7,
  },
});
