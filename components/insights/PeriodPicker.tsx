import { MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useMemo, useState } from 'react';
import { Dimensions, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { AnimatedBottomSheet } from '@/components/ui/AnimatedBottomSheet';
import { PrimaryButton } from '@/components/ui/Button';
import { PickerOptionList } from '@/components/ui/PickerSheet';
import { PressableView } from '@/components/ui/PressableView';
import { SheetCloseButton } from '@/components/ui/SheetCloseButton';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import { haptics } from '@/lib/haptics';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

export type PeriodPreset =
  | 'this_month'
  | 'last_month'
  | 'last_7_days'
  | 'last_30_days'
  | 'last_3_months'
  | 'custom';

export interface DateRange {
  start: Date | null;
  end: Date | null;
  label: string;
  preset?: PeriodPreset;
}

interface PeriodPickerProps {
  visible: boolean;
  onClose: () => void;
  onSelect: (range: DateRange) => void;
  currentRange: DateRange;
}

const PRESETS: { key: PeriodPreset; label: string }[] = [
  { key: 'this_month', label: 'This month' },
  { key: 'last_month', label: 'Last month' },
  { key: 'last_7_days', label: 'Last 7 days' },
  { key: 'last_30_days', label: 'Last 30 days' },
  { key: 'last_3_months', label: 'Last 3 months' },
];

export function PeriodPicker({ visible, onClose, onSelect, currentRange }: PeriodPickerProps) {
  const themeTokens = useThemeTokens();
  const theme = themeTokens.colors;
  const [view, setView] = useState<'presets' | 'custom'>('presets');
  const [selectedPreset, setSelectedPreset] = useState<PeriodPreset | undefined>(
    currentRange.preset
  );

  // Custom range Local State
  const [customStart, setCustomStart] = useState<Date | null>(currentRange.start);
  const [customEnd, setCustomEnd] = useState<Date | null>(currentRange.end);

  const handleApplyPreset = () => {
    if (!selectedPreset) return;

    let start = new Date();
    let end = new Date();
    let label = '';

    const now = new Date();

    switch (selectedPreset) {
      case 'this_month':
        start = new Date(now.getFullYear(), now.getMonth(), 1);
        label = now.toLocaleString('default', { month: 'long', year: 'numeric' });
        break;
      case 'last_month':
        start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        end = new Date(now.getFullYear(), now.getMonth(), 0);
        label = start.toLocaleString('default', { month: 'long', year: 'numeric' });
        break;
      case 'last_7_days':
        start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        label = 'Last 7 days';
        break;
      case 'last_30_days':
        start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        label = 'Last 30 days';
        break;
      case 'last_3_months':
        start = new Date(now.getFullYear(), now.getMonth() - 3, 1);
        label = 'Last 3 months';
        break;
    }

    onSelect({ start, end, label, preset: selectedPreset });
    onClose();
  };

  const handleConfirmCustomRange = () => {
    if (customStart && customEnd) {
      const label = `${customStart.toLocaleDateString('default', { month: 'short', day: 'numeric' })} - ${customEnd.toLocaleDateString('default', { month: 'short', day: 'numeric' })}`;
      onSelect({ start: customStart, end: customEnd, label, preset: 'custom' });
      onClose();
    }
  };

  return (
    <AnimatedBottomSheet visible={visible} onClose={onClose} backdropOpacity={0.3}>
      <View
        style={[
          styles.sheet,
          view === 'custom' && styles.sheetTall,
          { backgroundColor: theme.background },
        ]}>
        <View style={[styles.handle, { backgroundColor: theme.borderStrong }]} />

        {view === 'presets' ? (
          <PresetsView
            selectedPreset={selectedPreset}
            onSelectPreset={setSelectedPreset}
            onGoToCustom={() => setView('custom')}
            onApply={handleApplyPreset}
            onClose={onClose}
          />
        ) : (
          <CustomRangeView
            start={customStart}
            end={customEnd}
            onSelectStart={setCustomStart}
            onSelectEnd={setCustomEnd}
            onBack={() => setView('presets')}
            onConfirm={handleConfirmCustomRange}
          />
        )}
      </View>
    </AnimatedBottomSheet>
  );
}

function PresetsView({
  selectedPreset,
  onSelectPreset,
  onGoToCustom,
  onApply,
  onClose,
}: {
  selectedPreset: PeriodPreset | undefined;
  onSelectPreset: (preset: PeriodPreset) => void;
  onGoToCustom: () => void;
  onApply: () => void;
  onClose: () => void;
}) {
  const { colors } = useThemeTokens();
  return (
    <View style={styles.body}>
      <View style={styles.header}>
        <ThemedText accessibilityRole="header" style={[styles.title, { color: colors.text }]}>
          Choose a period
        </ThemedText>
        <SheetCloseButton onPress={onClose} />
      </View>

      <PickerOptionList
        accessibilityLabel="Period"
        options={PRESETS}
        selectedKey={selectedPreset === 'custom' ? null : selectedPreset}
        onSelect={(key) => {
          haptics.select();
          onSelectPreset(key as PeriodPreset);
        }}
      />

      <PressableView
        accessibilityRole="button"
        onPress={onGoToCustom}
        style={[
          styles.customRow,
          selectedPreset === 'custom'
            ? { backgroundColor: colors.selectedFill, borderColor: colors.selectedBorder }
            : { backgroundColor: colors.card, borderColor: colors.border },
        ]}
        pressedStyle={styles.pressed}>
        <MaterialCommunityIcons name="calendar-range" size={20} color={colors.text} />
        <ThemedText
          style={[
            styles.customLabel,
            { color: colors.text, fontWeight: selectedPreset === 'custom' ? '700' : '500' },
          ]}>
          Custom range
        </ThemedText>
        <MaterialCommunityIcons name="chevron-right" size={20} color={colors.muted} />
      </PressableView>

      <PrimaryButton label="Apply" onPress={onApply} disabled={!selectedPreset} style={styles.apply} />
    </View>
  );
}

const formatPickedDate = (date: Date | null) =>
  date
    ? date.toLocaleDateString('default', { month: 'short', day: '2-digit', year: 'numeric' })
    : 'Choose a date';

function CustomRangeView({
  start,
  end,
  onSelectStart,
  onSelectEnd,
  onBack,
  onConfirm,
}: {
  start: Date | null;
  end: Date | null;
  onSelectStart: (date: Date | null) => void;
  onSelectEnd: (date: Date | null) => void;
  onBack: () => void;
  onConfirm: () => void;
}) {
  const { colors } = useThemeTokens();
  const months = useMemo(() => {
    const now = new Date();
    const m1 = new Date(now.getFullYear(), now.getMonth(), 1);
    const m2 = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    return [m1, m2];
  }, []);

  const handleDatePress = (date: Date) => {
    if (!start || (start && end)) {
      onSelectStart(date);
      onSelectEnd(null);
    } else if (start && !end) {
      if (date < start) {
        onSelectStart(date);
      } else {
        onSelectEnd(date);
      }
    }
  };

  // The box being filled next is the one ringed: the start until it is set,
  // then the end.
  const choosingEnd = Boolean(start && !end);

  return (
    <View style={[styles.body, styles.bodyTall]}>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back to periods"
          onPress={onBack}
          style={styles.back}>
          <MaterialCommunityIcons name="chevron-left" size={26} color={colors.text} />
        </Pressable>
        <ThemedText accessibilityRole="header" style={[styles.title, { color: colors.text }]}>
          Choose dates
        </ThemedText>
      </View>

      <View style={styles.dateDisplays}>
        {[
          { label: 'Start date', value: start, active: !choosingEnd },
          { label: 'End date', value: end, active: choosingEnd },
        ].map((box) => (
          <View
            key={box.label}
            style={[
              styles.dateBox,
              {
                backgroundColor: colors.card,
                borderColor: box.active ? colors.selectedBorder : colors.border,
              },
            ]}>
            <ThemedText tone="muted" style={styles.dateLabel}>
              {box.label}
            </ThemedText>
            <ThemedText style={[styles.dateValue, { color: colors.text }]}>
              {formatPickedDate(box.value)}
            </ThemedText>
          </View>
        ))}
      </View>

      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
        {months.map((m, idx) => (
          <CalendarMonth key={idx} monthDate={m} start={start} end={end} onPress={handleDatePress} />
        ))}
      </ScrollView>

      <PrimaryButton
        label="Confirm"
        onPress={onConfirm}
        disabled={!start || !end}
        style={styles.apply}
      />
    </View>
  );
}

function CalendarMonth({
  monthDate,
  start,
  end,
  onPress,
}: {
  monthDate: Date;
  start: Date | null;
  end: Date | null;
  onPress: (date: Date) => void;
}) {
  const { colors } = useThemeTokens();
  const days = useMemo(() => {
    const year = monthDate.getFullYear();
    const month = monthDate.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const arr: (Date | null)[] = [];
    for (let i = 0; i < firstDay; i++) arr.push(null);
    for (let i = 1; i <= daysInMonth; i++) arr.push(new Date(year, month, i));
    return arr;
  }, [monthDate]);

  const monthName = monthDate.toLocaleString('default', { month: 'long', year: 'numeric' });

  return (
    <View style={styles.monthContainer}>
      <ThemedText style={[styles.monthName, { color: colors.text }]}>{monthName}</ThemedText>
      <View style={styles.weekLabels}>
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, index) => (
          <ThemedText key={`${d}-${index}`} tone="muted" style={styles.weekLabel}>
            {d}
          </ThemedText>
        ))}
      </View>
      <View style={styles.daysGrid}>
        {days.map((d, idx) => {
          if (!d) return <View key={idx} style={styles.dayCell} />;

          const isStart = Boolean(start && d.toDateString() === start.toDateString());
          const isEnd = Boolean(end && d.toDateString() === end.toDateString());
          const isInRange = Boolean(start && end && d > start && d < end);

          return (
            <Pressable
              key={idx}
              accessibilityRole="button"
              accessibilityState={{ selected: isStart || isEnd }}
              accessibilityLabel={d.toDateString()}
              style={styles.dayCell}
              onPress={() => onPress(d)}>
              <View
                style={[
                  styles.dayDot,
                  (isStart || isEnd) && { backgroundColor: colors.accent },
                  isInRange && { backgroundColor: colors.selectedFill },
                ]}>
                <ThemedText
                  style={[
                    styles.dayText,
                    { color: isStart || isEnd ? colors.onAccent : colors.text },
                    (isStart || isEnd) && { fontWeight: '700' },
                  ]}>
                  {d.getDate()}
                </ThemedText>
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingBottom: 24,
  },
  sheetTall: {
    height: SCREEN_HEIGHT * 0.85,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginVertical: 8,
  },
  body: {
    paddingHorizontal: 16,
  },
  bodyTall: {
    flex: 1,
  },
  header: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginLeft: 4,
    marginRight: -8,
    marginBottom: 4,
  },
  title: {
    flex: 1,
    fontSize: 20,
    lineHeight: 26,
    fontWeight: '700',
  },
  back: {
    width: 40,
    height: 44,
    alignItems: 'flex-start',
    justifyContent: 'center',
    marginLeft: -8,
  },
  customRow: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 12,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderRadius: 16,
  },
  customLabel: {
    flex: 1,
    fontSize: 15,
    lineHeight: 20,
  },
  apply: {
    marginTop: 16,
  },
  dateDisplays: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  dateBox: {
    flex: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  dateLabel: {
    fontSize: 13,
    lineHeight: 18,
  },
  dateValue: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '600',
  },
  monthContainer: {
    marginBottom: 20,
  },
  monthName: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '700',
    marginBottom: 8,
  },
  weekLabels: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  weekLabel: {
    width: `${100 / 7}%`,
    fontSize: 12,
    lineHeight: 16,
    textAlign: 'center',
  },
  daysGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  dayCell: {
    width: `${100 / 7}%`,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayDot: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayText: {
    fontSize: 15,
    lineHeight: 20,
  },
  pressed: {
    opacity: 0.7,
  },
});
