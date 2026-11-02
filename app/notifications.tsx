import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { Fragment, useCallback, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { PressableView } from '@/components/ui/PressableView';
import { Segments } from '@/components/ui/Segments';
import { SkeletonFrame, SkeletonRows } from '@/components/ui/Skeleton';
import { mixHex, withAlpha } from '@/constants/theme';
import { useAuthStore } from '@/hooks/use-auth-store';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import { getFriendlyErrorMessage } from '@/lib/api-error';
import { categoryTile } from '@/lib/categories';
import {
  groupNotifications,
  notificationDestination,
  notificationKind,
  notificationTimeLabel,
  occurrenceIdFromActionURL,
} from '@/lib/notification-kinds';
import {
  AppNotification,
  fetchNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from '@/lib/notifications';
import { confirmSubscriptionOccurrence, revertSubscriptionOccurrence } from '@/lib/subscriptions';

type Filter = 'all' | 'unread' | 'read';

const EMPTY_COPY: Record<Filter, { title: string; body: string }> = {
  all: {
    title: 'No notifications yet',
    body: 'Bill reminders, budget alerts and split updates show up here.',
  },
  unread: { title: 'Nothing unread', body: 'New reminders and updates show up here first.' },
  read: { title: 'Nothing read yet', body: 'Notifications you have opened move here.' },
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

  const groups = useMemo(() => groupNotifications(notifications), [notifications]);
  const unreadFill = mode === 'dark' ? withAlpha(colors.accent, 0.08) : mixHex(colors.card, colors.accent, 0.07);

  const openNotification = async (notification: AppNotification) => {
    if (token && !notification.read_at) {
      await markNotificationRead(token, notification.id);
      setNotifications((current) =>
        current.map((item) =>
          item.id === notification.id ? { ...item, read_at: new Date().toISOString() } : item
        )
      );
      setUnreadCount((current) => Math.max(0, current - 1));
    }
    const destination = notificationDestination(notification);
    if (destination) router.push(destination);
  };

  const handleMarkAllRead = async () => {
    if (!token || unreadCount === 0) return;
    await markAllNotificationsRead(token);
    await load(true);
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

  const renderRow = (notification: AppNotification) => {
    const unread = !notification.read_at;
    const kind = notificationKind(notification.type);
    const tile = categoryTile(kind, mode);
    const occurrenceId = occurrenceIdFromActionURL(notification.action_url);
    const destination = notificationDestination(notification);
    const action = destination ? kind.action : null;

    return (
      <View
        testID={`notification-${notification.id}`}
        style={unread ? { backgroundColor: unreadFill } : undefined}>
        <PressableView
          accessibilityRole="button"
          accessibilityLabel={`${unread ? 'Unread. ' : ''}${notification.title}`}
          accessibilityHint={action ?? undefined}
          onPress={() => void openNotification(notification)}
          style={styles.row}
          pressedStyle={styles.pressed}>
          <View style={[styles.tile, { backgroundColor: tile.background }]}>
            <MaterialCommunityIcons name={kind.icon} size={22} color={tile.foreground} />
          </View>
          <View style={styles.rowText}>
            <View style={styles.titleLine}>
              <ThemedText style={[styles.title, { fontWeight: unread ? '700' : '500' }]}>
                {notification.title}
              </ThemedText>
              <View style={styles.time}>
                <ThemedText tone="muted" style={styles.timeLabel}>
                  {notificationTimeLabel(notification.created_at)}
                </ThemedText>
                {unread ? (
                  <View
                    accessibilityElementsHidden
                    style={[styles.dot, { backgroundColor: colors.accent }]}
                  />
                ) : null}
              </View>
            </View>
            {notification.body ? (
              <ThemedText tone="muted" numberOfLines={2} style={styles.body}>
                {notification.body}
              </ThemedText>
            ) : null}
            {action ? (
              unread ? (
                <View
                  style={[styles.chip, { backgroundColor: colors.card, borderColor: colors.borderStrong }]}>
                  <ThemedText style={styles.actionLabel}>{action}</ThemedText>
                  <MaterialCommunityIcons name="chevron-right" size={16} color={colors.text} />
                </View>
              ) : (
                <View style={styles.link}>
                  <ThemedText style={styles.actionLabel}>{action}</ThemedText>
                  <MaterialCommunityIcons name="chevron-right" size={16} color={colors.text} />
                </View>
              )
            ) : null}
          </View>
        </PressableView>
        {/* Outside the row's own press target, so each button is its own tap
            rather than a button nested in a button. Outlined, never accent. */}
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
          { key: 'read', label: 'Read' },
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
          {unreadCount === 0 && filter !== 'read' && notifications.length > 0 ? (
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

          {groups.length === 0 ? (
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
          ) : (
            groups.map(({ group, items }) => (
              <View key={group}>
                <ThemedText tone="muted" style={styles.groupLabel}>
                  {group}
                </ThemedText>
                <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  {items.map((notification, index) => (
                    <Fragment key={notification.id}>
                      {index > 0 ? <View style={[styles.divider, { backgroundColor: colors.border }]} /> : null}
                      {renderRow(notification)}
                    </Fragment>
                  ))}
                </View>
              </View>
            ))
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
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
