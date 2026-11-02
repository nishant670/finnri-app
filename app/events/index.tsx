import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { EventFormSheet } from '@/components/events/EventFormSheet';
import { ScreenHeader } from '@/components/navigation/ScreenHeader';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/Button';
import { PressableView } from '@/components/ui/PressableView';
import { SkeletonFrame, SkeletonRows } from '@/components/ui/Skeleton';
import { useAuthStore } from '@/hooks/use-auth-store';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import { getFriendlyErrorMessage } from '@/lib/api-error';
import {
  DEFAULT_EVENT_EMOJI,
  describeEventDates,
  useEvents,
  type EventInput,
  type EventListItem,
} from '@/lib/events';
import { haptics } from '@/lib/haptics';
import { formatMoney } from '@/lib/money';

/**
 * Every occasion the user has grouped spending under, newest first, with what
 * each one cost. Private to the user: shared spending lives in split groups.
 */
export default function EventsScreen() {
  const { colors } = useThemeTokens();
  const router = useRouter();
  const token = useAuthStore((state) => state.token);
  const events = useEvents((state) => state.events);
  const loadEvents = useEvents((state) => state.load);
  const createEvent = useEvents((state) => state.create);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    setIsLoading(true);
    setError(null);
    try {
      // Totals change whenever a transaction moves, so the list is re-read here
      // rather than trusted from the picker's copy.
      await loadEvents(token, { force: true });
    } catch (err) {
      setError(getFriendlyErrorMessage(err, 'Unable to load your events right now.'));
    } finally {
      setIsLoading(false);
    }
  }, [loadEvents, token]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const handleCreate = async (input: EventInput) => {
    if (!token) throw new Error('Please sign in again.');
    const event = await createEvent(token, input);
    haptics.saved();
    setIsFormOpen(false);
    router.push({ pathname: '/events/[id]', params: { id: String(event.id) } });
  };

  return (
    <SafeAreaView
      style={[styles.flex, { backgroundColor: colors.background }]}
      edges={['top', 'left', 'right', 'bottom']}>
      <ScreenHeader
        title="Events"
        onBack={() => router.back()}
        rightIcon="plus"
        rightAccessibilityLabel="New event"
        onRightPress={() => setIsFormOpen(true)}
      />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        {isLoading && events.length === 0 ? (
          <SkeletonFrame label="Loading events" testID="events-skeleton">
            <SkeletonRows count={3} showAmount lines={2} />
          </SkeletonFrame>
        ) : error && events.length === 0 ? (
          <View
            style={[
              styles.card,
              styles.message,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}>
            <ThemedText style={[styles.body, { color: colors.text }]}>{error}</ThemedText>
            <Button variant="outline" height={40} label="Try again" onPress={() => void load()} />
          </View>
        ) : events.length === 0 ? (
          <View
            style={[
              styles.card,
              styles.message,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}>
            <ThemedText style={styles.bigEmoji}>{DEFAULT_EVENT_EMOJI}</ThemedText>
            <ThemedText style={[styles.emptyTitle, { color: colors.text }]}>
              No events yet
            </ThemedText>
            <ThemedText tone="muted" style={[styles.body, styles.center]}>
              Hosting, travelling, a wedding? Group what it cost — split with friends or not — and
              see the total in one place.
            </ThemedText>
            <Button
              testID="events-empty-create"
              label="New event"
              icon="plus"
              height={44}
              onPress={() => setIsFormOpen(true)}
            />
          </View>
        ) : (
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {events.map((event, index) => (
              <EventRow
                key={event.id}
                event={event}
                divider={index > 0}
                onPress={() =>
                  router.push({ pathname: '/events/[id]', params: { id: String(event.id) } })
                }
              />
            ))}
          </View>
        )}
      </ScrollView>

      <EventFormSheet
        visible={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        onSave={handleCreate}
      />
    </SafeAreaView>
  );
}

function EventRow({
  event,
  divider,
  onPress,
}: {
  event: EventListItem;
  divider: boolean;
  onPress: () => void;
}) {
  const { colors } = useThemeTokens();
  const dates = describeEventDates(event);
  const count = event.entry_count === 1 ? '1 transaction' : `${event.entry_count} transactions`;
  return (
    <PressableView
      testID={`event-row-${event.id}`}
      accessibilityRole="button"
      accessibilityLabel={`${event.name}, cost ${formatMoney(event.net_cost)}, ${count}`}
      onPress={onPress}
      style={[styles.row, divider && { borderTopWidth: 1, borderTopColor: colors.border }]}
      pressedStyle={styles.pressed}>
      <View style={[styles.tile, { backgroundColor: colors.selectedFill }]}>
        <ThemedText style={styles.tileEmoji}>{event.emoji || DEFAULT_EVENT_EMOJI}</ThemedText>
      </View>
      <View style={styles.rowText}>
        <ThemedText numberOfLines={1} style={[styles.rowTitle, { color: colors.text }]}>
          {event.name}
        </ThemedText>
        <ThemedText tone="muted" numberOfLines={2} style={styles.small}>
          {[dates, count].filter(Boolean).join(' · ')}
        </ThemedText>
      </View>
      <ThemedText style={[styles.amount, { color: colors.text }]}>
        {formatMoney(event.net_cost)}
      </ThemedText>
      <MaterialCommunityIcons name="chevron-right" size={18} color={colors.muted} />
    </PressableView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  content: {
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 40,
  },
  card: {
    borderWidth: 1,
    borderRadius: 16,
    overflow: 'hidden',
  },
  message: {
    alignItems: 'center',
    gap: 10,
    padding: 20,
  },
  bigEmoji: {
    fontSize: 36,
    lineHeight: 44,
  },
  emptyTitle: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '700',
  },
  body: {
    fontSize: 14,
    lineHeight: 20,
  },
  center: {
    textAlign: 'center',
  },
  row: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  tile: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileEmoji: {
    fontSize: 20,
    lineHeight: 24,
  },
  rowText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  rowTitle: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '600',
  },
  small: {
    fontSize: 12,
    lineHeight: 16,
  },
  amount: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '600',
  },
  pressed: {
    opacity: 0.7,
  },
});
