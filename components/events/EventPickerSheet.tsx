import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/Button';
import { PickerSheet } from '@/components/ui/PickerSheet';
import { PressableView } from '@/components/ui/PressableView';
import { useAuthStore } from '@/hooks/use-auth-store';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import { getFriendlyErrorMessage } from '@/lib/api-error';
import {
  DEFAULT_EVENT_EMOJI,
  EVENT_EMOJI_CHOICES,
  EVENT_NAME_MAX,
  describeEventDates,
  orderEventsForDay,
  useEvents,
  type FinnriEvent,
} from '@/lib/events';

type EventPickerSheetProps = {
  visible: boolean;
  /** The event already chosen, if any. */
  selectedId: number | null | undefined;
  /** `YYYY-MM-DD` of the transaction, so events covering that day come first. */
  day?: string | null;
  title?: string;
  /** Offers "No event" at the top. Off where the action is "put these in one". */
  allowNone?: boolean;
  /** What the none row says: "No event" on a transaction, "Any event" in a filter. */
  noneLabel?: string;
  /** Offers "New event". Off in the filter, where a new event would match nothing. */
  allowCreate?: boolean;
  onClose: () => void;
  onSelect: (event: FinnriEvent | null) => void;
};

/**
 * Chooses the event (occasion) a transaction belongs to, or makes a new one
 * in place: typing a name is all a new event needs, and its dates default to
 * the transaction's day.
 */
export function EventPickerSheet({
  visible,
  selectedId,
  day = null,
  title = 'Event',
  allowNone = true,
  noneLabel = 'No event',
  allowCreate = true,
  onClose,
  onSelect,
}: EventPickerSheetProps) {
  const { colors } = useThemeTokens();
  const token = useAuthStore((state) => state.token);
  const events = useEvents((state) => state.events);
  const loadEvents = useEvents((state) => state.load);
  const createEvent = useEvents((state) => state.create);

  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState(DEFAULT_EVENT_EMOJI);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    if (token) void loadEvents(token);
    setCreating(false);
    setName('');
    setEmoji(DEFAULT_EVENT_EMOJI);
    setError(null);
  }, [loadEvents, token, visible]);

  const ordered = useMemo(() => orderEventsForDay(events, day), [day, events]);

  const handleCreate = async () => {
    const trimmed = name.trim();
    if (!trimmed || !token || saving) return;
    setSaving(true);
    setError(null);
    try {
      const event = await createEvent(token, {
        name: trimmed,
        emoji,
        ...(day ? { start_date: day, end_date: day } : {}),
      });
      onSelect(event);
    } catch (createError) {
      setError(getFriendlyErrorMessage(createError, 'Unable to create this event.'));
    } finally {
      setSaving(false);
    }
  };

  const renderRow = (
    key: string,
    label: string,
    caption: string,
    leading: React.ReactNode,
    selected: boolean,
    onPress: () => void,
    index: number
  ) => (
    <PressableView
      key={key}
      testID={`event-option-${key}`}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[
        styles.option,
        index > 0 && { borderTopWidth: 1, borderTopColor: colors.border },
        selected && { backgroundColor: colors.selectedFill },
      ]}
      pressedStyle={styles.pressed}>
      {leading}
      <View style={styles.optionText}>
        <ThemedText
          numberOfLines={1}
          style={[styles.optionLabel, { color: colors.text, fontWeight: selected ? '700' : '500' }]}>
          {label}
        </ThemedText>
        {caption ? (
          <ThemedText tone="muted" numberOfLines={1} style={styles.optionCaption}>
            {caption}
          </ThemedText>
        ) : null}
      </View>
      {selected ? <MaterialCommunityIcons name="check" size={20} color={colors.text} /> : null}
    </PressableView>
  );

  return (
    <PickerSheet visible={visible} title={title} onClose={onClose} avoidKeyboard>
      {creating ? (
        <View
          style={[styles.card, styles.createCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <TextInput
            testID="event-new-name"
            accessibilityLabel="Event name"
            autoFocus
            value={name}
            maxLength={EVENT_NAME_MAX}
            onChangeText={setName}
            onSubmitEditing={handleCreate}
            returnKeyType="done"
            placeholder="Diwali party, Goa trip…"
            placeholderTextColor={colors.muted}
            selectionColor={colors.accent}
            style={[styles.nameInput, { color: colors.text, borderColor: colors.borderStrong }]}
          />
          <View style={styles.emojiRow} accessibilityRole="radiogroup" accessibilityLabel="Event emoji">
            {EVENT_EMOJI_CHOICES.map((choice) => {
              const selected = choice === emoji;
              return (
                <PressableView
                  key={choice}
                  accessibilityRole="radio"
                  accessibilityLabel={choice}
                  accessibilityState={{ selected }}
                  onPress={() => setEmoji(choice)}
                  style={[
                    styles.emoji,
                    { borderColor: selected ? colors.selectedBorder : 'transparent' },
                    selected && { backgroundColor: colors.selectedFill },
                  ]}
                  pressedStyle={styles.pressed}>
                  <ThemedText style={styles.emojiText}>{choice}</ThemedText>
                </PressableView>
              );
            })}
          </View>
          {error ? (
            <ThemedText style={[styles.error, { color: colors.negative }]}>{error}</ThemedText>
          ) : null}
          <View style={styles.createActions}>
            <Button
              label="Cancel"
              variant="outline"
              height={44}
              style={styles.flex}
              onPress={() => setCreating(false)}
            />
            <Button
              testID="event-new-create"
              label="Create"
              height={44}
              style={styles.flex}
              loading={saving}
              disabled={!name.trim()}
              onPress={handleCreate}
            />
          </View>
        </View>
      ) : (
        <View
          accessibilityRole="radiogroup"
          accessibilityLabel={title}
          style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {allowCreate
            ? renderRow(
                'new',
                'New event',
                '',
                <MaterialCommunityIcons name="plus" size={20} color={colors.text} />,
                false,
                () => setCreating(true),
                0
              )
            : null}
          {allowNone
            ? renderRow(
                'none',
                noneLabel,
                '',
                <MaterialCommunityIcons name="close-circle-outline" size={20} color={colors.text} />,
                selectedId == null,
                () => onSelect(null),
                allowCreate ? 1 : 0
              )
            : null}
          {ordered.map((event, index) =>
            renderRow(
              String(event.id),
              event.name,
              describeEventDates(event),
              <ThemedText style={styles.leadingEmoji}>{event.emoji || DEFAULT_EVENT_EMOJI}</ThemedText>,
              event.id === selectedId,
              () => onSelect(event),
              index + (allowCreate ? 1 : 0) + (allowNone ? 1 : 0)
            )
          )}
        </View>
      )}
      {!creating && ordered.length === 0 ? (
        <ThemedText tone="muted" style={styles.hint}>
          Group what an occasion cost — a party you hosted, a trip, a wedding.
        </ThemedText>
      ) : null}
    </PickerSheet>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: 16,
    overflow: 'hidden',
  },
  createCard: {
    padding: 14,
    gap: 12,
  },
  option: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  optionText: {
    flex: 1,
    minWidth: 0,
  },
  optionLabel: {
    fontSize: 15,
    lineHeight: 20,
  },
  optionCaption: {
    fontSize: 12,
    lineHeight: 16,
  },
  leadingEmoji: {
    width: 20,
    fontSize: 18,
    lineHeight: 22,
    textAlign: 'center',
  },
  nameInput: {
    minHeight: 48,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    fontSize: 15,
  },
  emojiRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  emoji: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emojiText: {
    fontSize: 20,
    lineHeight: 24,
  },
  error: {
    fontSize: 13,
    lineHeight: 18,
  },
  createActions: {
    flexDirection: 'row',
    gap: 10,
  },
  flex: {
    flex: 1,
  },
  hint: {
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
    marginTop: 12,
    paddingHorizontal: 12,
  },
  pressed: {
    opacity: 0.7,
  },
});
