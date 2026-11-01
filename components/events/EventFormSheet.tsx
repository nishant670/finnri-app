import { MaterialCommunityIcons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useEffect, useState } from 'react';
import { Platform, StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/Button';
import { PickerSheet } from '@/components/ui/PickerSheet';
import { PressableView } from '@/components/ui/PressableView';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import { getFriendlyErrorMessage } from '@/lib/api-error';
import { formatApiDate } from '@/lib/datetime';
import {
  DEFAULT_EVENT_EMOJI,
  EVENT_EMOJI_CHOICES,
  EVENT_NAME_MAX,
  describeEventDates,
  type EventInput,
  type FinnriEvent,
} from '@/lib/events';

type EventFormSheetProps = {
  visible: boolean;
  /** The event being edited; absent for a new one. */
  event?: FinnriEvent | null;
  onClose: () => void;
  onSave: (input: EventInput) => Promise<void>;
};

const dayToDate = (value: string | null) => {
  if (!value) return new Date();
  const parsed = new Date(`${value}T12:00:00`);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
};

/**
 * Names an event and, if the user wants, its dates and a budget. Only the
 * name is needed: dates are for display and for suggesting the event on the
 * right days, and a budget adds a bar to the event page.
 */
export function EventFormSheet({ visible, event, onClose, onSave }: EventFormSheetProps) {
  const { colors } = useThemeTokens();
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState(DEFAULT_EVENT_EMOJI);
  const [startDate, setStartDate] = useState<string | null>(null);
  const [endDate, setEndDate] = useState<string | null>(null);
  const [budget, setBudget] = useState('');
  const [notes, setNotes] = useState('');
  const [picking, setPicking] = useState<'start' | 'end' | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setName(event?.name ?? '');
    setEmoji(event?.emoji || DEFAULT_EVENT_EMOJI);
    setStartDate(event?.start_date ?? null);
    setEndDate(event?.end_date ?? null);
    setBudget(event?.budget ? String(event.budget) : '');
    setNotes(event?.notes ?? '');
    setPicking(null);
    setError(null);
  }, [event, visible]);

  const budgetValue = budget.trim() ? Number(budget.replace(/[^0-9.]/g, '')) : null;
  const budgetInvalid = budgetValue !== null && !(budgetValue > 0);
  const datesInvalid = Boolean(startDate && endDate && startDate > endDate);
  const canSave = name.trim().length > 0 && !budgetInvalid && !datesInvalid && !saving;

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    try {
      await onSave({
        name: name.trim(),
        emoji,
        start_date: startDate,
        end_date: endDate,
        budget: budgetValue,
        notes: notes.trim(),
      });
    } catch (saveError) {
      setError(getFriendlyErrorMessage(saveError, 'Unable to save this event.'));
    } finally {
      setSaving(false);
    }
  };

  const onDatePicked = (selected?: Date) => {
    const target = picking;
    setPicking(null);
    if (!selected || !target) return;
    const day = formatApiDate(selected);
    if (target === 'start') {
      setStartDate(day);
      // A one-day event is the common case: its end follows its start.
      if (!endDate || endDate < day) setEndDate(day);
    } else {
      setEndDate(day);
    }
  };

  const dateRow = (which: 'start' | 'end', value: string | null, divider: boolean) => (
    <PressableView
      testID={`event-form-${which}`}
      accessibilityRole="button"
      accessibilityLabel={`${which === 'start' ? 'Starts' : 'Ends'}, ${value ?? 'not set'}`}
      onPress={() => setPicking(which)}
      style={[styles.row, divider && { borderTopWidth: 1, borderTopColor: colors.border }]}
      pressedStyle={styles.pressed}>
      <ThemedText style={[styles.rowLabel, { color: colors.text }]}>
        {which === 'start' ? 'Starts' : 'Ends'}
      </ThemedText>
      <ThemedText tone={value ? 'default' : 'muted'} style={styles.rowValue}>
        {value ? describeEventDates({ start_date: value, end_date: value }) : 'Optional'}
      </ThemedText>
      {value ? (
        <PressableView
          accessibilityRole="button"
          accessibilityLabel={`Clear ${which === 'start' ? 'start' : 'end'} date`}
          hitSlop={8}
          onPress={() => (which === 'start' ? setStartDate(null) : setEndDate(null))}
          pressedStyle={styles.pressed}>
          <MaterialCommunityIcons name="close-circle" size={18} color={colors.muted} />
        </PressableView>
      ) : (
        <MaterialCommunityIcons name="calendar-blank-outline" size={18} color={colors.muted} />
      )}
    </PressableView>
  );

  return (
    <PickerSheet
      visible={visible}
      title={event ? 'Edit event' : 'New event'}
      onClose={onClose}
      avoidKeyboard
      maxBodyHeight={600}>
      <View style={styles.body}>
        <TextInput
          testID="event-form-name"
          accessibilityLabel="Event name"
          value={name}
          maxLength={EVENT_NAME_MAX}
          onChangeText={setName}
          placeholder="Diwali party, Goa trip…"
          placeholderTextColor={colors.muted}
          selectionColor={colors.accent}
          style={[styles.input, { color: colors.text, borderColor: colors.borderStrong, backgroundColor: colors.card }]}
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

        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {dateRow('start', startDate, false)}
          {dateRow('end', endDate, true)}
        </View>
        {datesInvalid ? (
          <ThemedText tone="negative" style={styles.small}>
            The end date is before the start.
          </ThemedText>
        ) : (
          <ThemedText tone="muted" style={styles.small}>
            Dates are only a guide — anything you add still counts, whenever you paid.
          </ThemedText>
        )}

        <TextInput
          testID="event-form-budget"
          accessibilityLabel="Budget"
          value={budget}
          keyboardType="decimal-pad"
          onChangeText={setBudget}
          placeholder="Budget (optional)"
          placeholderTextColor={colors.muted}
          selectionColor={colors.accent}
          style={[styles.input, { color: colors.text, borderColor: colors.borderStrong, backgroundColor: colors.card }]}
        />
        <TextInput
          testID="event-form-notes"
          accessibilityLabel="Notes"
          value={notes}
          multiline
          maxLength={500}
          onChangeText={setNotes}
          placeholder="Notes (optional)"
          placeholderTextColor={colors.muted}
          selectionColor={colors.accent}
          style={[
            styles.input,
            styles.notes,
            { color: colors.text, borderColor: colors.borderStrong, backgroundColor: colors.card },
          ]}
        />

        {error ? (
          <ThemedText tone="negative" style={styles.small}>
            {error}
          </ThemedText>
        ) : null}

        <Button
          testID="event-form-save"
          label={event ? 'Save' : 'Create event'}
          height={50}
          loading={saving}
          disabled={!canSave}
          onPress={handleSave}
        />
      </View>

      {picking && (
        <DateTimePicker
          value={dayToDate(picking === 'start' ? startDate : endDate)}
          mode="date"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onValueChange={(_event, selected) => onDatePicked(selected)}
          onDismiss={() => setPicking(null)}
        />
      )}
    </PickerSheet>
  );
}

const styles = StyleSheet.create({
  body: {
    gap: 12,
    paddingBottom: 8,
  },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    fontSize: 15,
  },
  notes: {
    minHeight: 72,
    paddingTop: 12,
    textAlignVertical: 'top',
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
  card: {
    borderWidth: 1,
    borderRadius: 16,
    overflow: 'hidden',
  },
  row: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
  },
  rowLabel: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '500',
  },
  rowValue: {
    flex: 1,
    textAlign: 'right',
    fontSize: 15,
    lineHeight: 20,
  },
  small: {
    fontSize: 12,
    lineHeight: 16,
  },
  pressed: {
    opacity: 0.7,
  },
});
