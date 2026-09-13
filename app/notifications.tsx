import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppHeader } from '@/components/navigation/AppHeader';
import { ThemedText } from '@/components/themed-text';
import { SkeletonFrame, SkeletonRows } from '@/components/ui/Skeleton';
import { Fonts } from '@/constants/theme';
import { useAuthStore } from '@/hooks/use-auth-store';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import { getFriendlyErrorMessage } from '@/lib/api-error';
import {
  AppNotification,
  fetchNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from '@/lib/notifications';
import { monthFromActionURL } from '@/lib/monthly-review';
import { confirmSubscriptionOccurrence, revertSubscriptionOccurrence } from '@/lib/subscriptions';

type Filter = 'all' | 'unread' | 'read';

const iconForType = (type: string): keyof typeof MaterialCommunityIcons.glyphMap => {
  // Before the generic `created`/`deleted` matches below, which
  // `split.settlement.*` would otherwise never reach.
  if (type === 'split.settlement.denied') return 'close-circle-outline';
  if (type === 'split.settlement.confirmed') return 'check-circle-outline';
  if (type.startsWith('split.settlement')) return 'hand-coin-outline';
  if (type.startsWith('split.')) return 'account-group-outline';
  if (type.includes('budget')) return 'chart-donut';
  if (type.includes('subscription')) return 'calendar-sync-outline';
  if (type.includes('created')) return 'plus-circle-outline';
  if (type.includes('updated')) return 'pencil-circle-outline';
  if (type.includes('deleted')) return 'trash-can-outline';
  return 'bell-outline';
};

const formatNotificationTime = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMinutes = Math.floor(diffMs / 60000);
  if (diffMinutes < 1) return 'Just now';
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
};

// The app's own scheme is `finnri://`. `ezmoney://` is the pre-rename scheme,
// still registered in app.json so links minted by an older build keep working;
// both spellings reduce to the same router path here.
const splitInviteTokenFromActionURL = (actionURL?: string) => {
  if (!actionURL) return null;
  const trimmed = actionURL.trim();
  const path = trimmed.replace(/^(?:finnri|ezmoney):\/\//, '/');
  const match = path.match(/^\/invite\/split\/([^/?#]+)$/);
  return match?.[1] ?? null;
};

export default function NotificationsScreen() {
  const router = useRouter();
  const { token } = useAuthStore();
  const theme = useThemeTokens();
  const colors = theme.colors;
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

  const emptyLabel = useMemo(() => {
    if (filter === 'unread') return 'No unread notifications';
    if (filter === 'read') return 'No read notifications';
    return 'No notifications yet';
  }, [filter]);

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

    const entryMatch = notification.action_url?.match(/^\/entry\/(\d+)$/);
    if (entryMatch) {
      router.push({ pathname: '/entry/[id]', params: { id: entryMatch[1] } });
      return;
    }

    const accountMatch = notification.action_url?.match(/^\/accounts\/(\d+)$/);
    if (accountMatch) {
      router.push({ pathname: '/accounts/[id]', params: { id: accountMatch[1] } });
      return;
    }

    const splitGroupMatch = notification.action_url?.match(/^\/split\/groups\/(\d+)$/);
    if (splitGroupMatch) {
      router.push('/(tabs)/split');
      return;
    }

    // A settlement has no screen of its own. Both sides of the decision belong
    // on Splits: the prompt to confirm or deny sits at the top of it, and the
    // outcome is a row in its activity feed.
    if (/^\/split\/settlements\/\d+$/.test(notification.action_url ?? '')) {
      router.push('/(tabs)/split');
      return;
    }

    const splitInviteToken = splitInviteTokenFromActionURL(notification.action_url);
    if (splitInviteToken) {
      router.push({ pathname: '/invite/split/[token]', params: { token: splitInviteToken } });
      return;
    }

    const reviewMonth = monthFromActionURL(notification.action_url);
    if (reviewMonth) {
      router.push({ pathname: '/monthly-review', params: { month: reviewMonth } });
    }
  };

  const handleMarkAllRead = async () => {
    if (!token || unreadCount === 0) return;
    await markAllNotificationsRead(token);
    await load(true);
  };

  const occurrenceID = (actionURL?: string) => {
    const match = actionURL?.match(/^\/subscription-occurrences\/(\d+)$/);
    return match ? Number(match[1]) : null;
  };

  const handleOccurrence = async (notification: AppNotification, action: 'confirm' | 'revert') => {
    if (!token) return;
    const id = occurrenceID(notification.action_url);
    if (!id) return;
    if (action === 'confirm') {
      await confirmSubscriptionOccurrence(token, id);
      await load(true);
      return;
    }
    const occurrence = await revertSubscriptionOccurrence(token, id);
    router.push({ pathname: '/entry/[id]', params: { id: String(occurrence.entry_id), edit: '1' } });
  };

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: colors.background }}>
      <AppHeader
        title="Notifications"
        subtitle={`${unreadCount} unread`}
        onBack={() => router.back()}
        rightNode={
          <Pressable
            onPress={handleMarkAllRead}
            disabled={unreadCount === 0}
            className="ml-4 h-10 w-10 items-center justify-center rounded-full"
            style={{ backgroundColor: colors.card, opacity: unreadCount === 0 ? 0.4 : 1 }}
            hitSlop={12}>
            <MaterialCommunityIcons name="check-all" size={22} color={colors.accent} />
          </Pressable>
        }
      />

      <View className="mx-6 mb-4 flex-row rounded-2xl p-1" style={{ backgroundColor: colors.card }}>
        {(['all', 'unread', 'read'] as Filter[]).map((item) => {
          const active = filter === item;
          return (
            <Pressable
              key={item}
              onPress={() => setFilter(item)}
              className="flex-1 items-center rounded-xl py-2"
              style={{ backgroundColor: active ? colors.secondary : 'transparent' }}>
              <ThemedText
                className="text-xs font-black uppercase"
                style={{ color: active ? colors.accent : '#8C8588' }}>
                {item}
              </ThemedText>
            </Pressable>
          );
        })}
      </View>

      {loading ? (
        <SkeletonFrame
          label="Loading notifications"
          testID="notifications-skeleton"
          style={{ paddingHorizontal: 20, paddingTop: 16 }}>
          <SkeletonRows count={6} showAmount={false} lines={3} />
        </SkeletonFrame>
      ) : error ? (
        <View className="flex-1 items-center justify-center px-8">
          <MaterialCommunityIcons name="alert-circle-outline" size={36} color="#D32F2F" />
          <ThemedText className="mt-3 text-center text-sm opacity-60">{error}</ThemedText>
        </View>
      ) : notifications.length === 0 ? (
        <View className="flex-1 items-center justify-center px-8">
          <MaterialCommunityIcons name="bell-sleep-outline" size={42} color="#A7A1A3" />
          <ThemedText className="mt-3 text-center text-sm font-black">{emptyLabel}</ThemedText>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 32 }}>
          <View className="gap-3">
            {notifications.map((notification) => {
              const unread = !notification.read_at;
              return (
                <Pressable
                  key={notification.id}
                  onPress={() => void openNotification(notification)}
                  className="flex-row items-start rounded-[28px] p-4"
                  style={{
                    backgroundColor: colors.card,
                    borderWidth: 1,
                    borderColor: unread ? colors.accent : colors.border,
                  }}>
                  <View
                    className="mr-4 h-11 w-11 items-center justify-center rounded-2xl"
                    style={{ backgroundColor: unread ? colors.secondary : '#F4F1F3' }}>
                    <MaterialCommunityIcons
                      name={iconForType(notification.type)}
                      size={22}
                      color={unread ? colors.accent : '#8C8588'}
                    />
                  </View>
                  <View className="flex-1">
                    <View className="flex-row items-start justify-between gap-3">
                      <ThemedText
                        className="flex-1 text-sm font-black"
                        style={{ fontFamily: Fonts.title }}>
                        {notification.title}
                      </ThemedText>
                      <ThemedText className="text-[11px] opacity-40">
                        {formatNotificationTime(notification.created_at)}
                      </ThemedText>
                    </View>
                    <ThemedText className="mt-1 text-xs leading-5 opacity-60">
                      {notification.body}
                    </ThemedText>
                    {occurrenceID(notification.action_url) && (
                      <View className="mt-3 flex-row gap-2">
                        <Pressable onPress={(event) => { event.stopPropagation(); void handleOccurrence(notification, 'confirm'); }} className="rounded-xl px-4 py-2" style={{ backgroundColor: colors.accent }}>
                          <ThemedText tone="onAccent" className="text-xs font-black">Confirm</ThemedText>
                        </Pressable>
                        <Pressable onPress={(event) => { event.stopPropagation(); void handleOccurrence(notification, 'revert'); }} className="rounded-xl border px-4 py-2" style={{ borderColor: colors.accent }}>
                          <ThemedText className="text-xs font-black" style={{ color: colors.accent }}>Correct / revert</ThemedText>
                        </Pressable>
                      </View>
                    )}
                  </View>
                  {unread && (
                    <View
                      className="ml-2 mt-2 h-2 w-2 rounded-full"
                      style={{ backgroundColor: colors.accent }}
                    />
                  )}
                </Pressable>
              );
            })}
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
