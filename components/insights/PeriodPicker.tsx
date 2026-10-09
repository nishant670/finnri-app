import { Fonts } from '@/constants/theme';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useMemo, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Dimensions,
} from 'react-native';
import { AnimatedBottomSheet } from '@/components/ui/AnimatedBottomSheet';
import { haptics } from '@/lib/haptics';

const { height: SCREEN_HEIGHT, width: SCREEN_WIDTH } = Dimensions.get('window');

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
  const accentSurface = themeTokens.mode === 'dark' ? theme.secondary : theme.secondary;
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
    <AnimatedBottomSheet visible={visible} onClose={onClose}>
        <View style={[styles.sheet, { backgroundColor: theme.background }]}>
          <View style={styles.handle} />

          {view === 'presets' ? (
            <PresetsView
              selectedPreset={selectedPreset}
              onSelectPreset={setSelectedPreset}
              onGoToCustom={() => setView('custom')}
              onApply={handleApplyPreset}
              onClose={onClose}
              theme={theme}
              accentSurface={accentSurface}
            />
          ) : (
            <CustomRangeView
              start={customStart}
              end={customEnd}
              onSelectStart={setCustomStart}
              onSelectEnd={setCustomEnd}
              onBack={() => setView('presets')}
              onConfirm={handleConfirmCustomRange}
              theme={theme}
              accentSurface={accentSurface}
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
  theme,
  accentSurface,
}: any) {
  return (
    <View style={styles.viewContainer}>
      <View style={styles.header}>
        <View>
          <Text style={[styles.title, { color: theme.text }]}>Choose a period</Text>
          <Text style={styles.subtitle}>QUICK PRESETS</Text>
        </View>
        <TouchableOpacity
          onPress={onClose}
          style={[styles.closeBtn, { backgroundColor: accentSurface }]}>
          <MaterialCommunityIcons name="close" size={20} color={theme.text} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.presetsList} showsVerticalScrollIndicator={false}>
        {PRESETS.map((p) => {
          const isSelected = selectedPreset === p.key;
          return (
            <TouchableOpacity
              key={p.key}
              style={[
                styles.presetItem,
                !isSelected && { backgroundColor: accentSurface, borderColor: theme.border },
                isSelected && { borderColor: theme.accent, backgroundColor: accentSurface },
              ]}
              onPress={() => {
                haptics.select();
                onSelectPreset(p.key);
              }}>
              <Text
                style={[
                  styles.presetText,
                  { color: theme.text },
                  isSelected && { color: theme.text },
                ]}>
                {p.label}
              </Text>
              {isSelected && (
                <View style={[styles.checkCircle, { backgroundColor: theme.accent }]}>
                  <MaterialCommunityIcons name="check" size={12} color="white" />
                </View>
              )}
            </TouchableOpacity>
          );
        })}

        <TouchableOpacity
          style={[
            styles.customRangeItem,
            { backgroundColor: accentSurface, borderColor: theme.border, borderWidth: 1 },
          ]}
          onPress={onGoToCustom}>
          <View style={styles.customRangeMain}>
            <MaterialCommunityIcons
              name="calendar-range"
              size={20}
              color={theme.mode === 'dark' ? 'rgba(255,255,255,0.6)' : '#90A4AE'}
            />
            <Text style={[styles.customRangeText, { color: theme.text }]}>Custom range</Text>
          </View>
          <MaterialCommunityIcons
            name="chevron-right"
            size={20}
            color={theme.mode === 'dark' ? 'rgba(255,255,255,0.6)' : '#90A4AE'}
          />
        </TouchableOpacity>
      </ScrollView>

      <TouchableOpacity
        style={[styles.applyBtn, { backgroundColor: theme.accent }]}
        onPress={onApply}>
        <Text style={styles.applyBtnText}>Apply</Text>
      </TouchableOpacity>
    </View>
  );
}

function CustomRangeView({
  start,
  end,
  onSelectStart,
  onSelectEnd,
  onBack,
  onConfirm,
  theme,
  accentSurface,
}: any) {
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

  return (
    <View style={styles.viewContainer}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <MaterialCommunityIcons name="chevron-left" size={24} color={theme.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: theme.text, flex: 1, textAlign: 'center' }]}>
          Choose dates
        </Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.dateDisplays}>
        <View
          style={[
            styles.dateBox,
            { backgroundColor: accentSurface, borderColor: theme.border },
            start && !end && { borderColor: theme.accent, borderWidth: 1 },
          ]}>
          <Text style={[styles.dateLabel, { color: theme.mode === 'dark' ? 'rgba(255,255,255,0.6)' : '#90A4AE' }]}>START DATE</Text>
          <Text style={[styles.dateValue, { color: theme.text }]}>
            {start
              ? start.toLocaleDateString('default', {
                  month: 'short',
                  day: '2-digit',
                  year: 'numeric',
                })
              : 'Choose a date'}
          </Text>
        </View>
        <View
          style={[
            styles.dateBox,
            { backgroundColor: accentSurface, borderColor: theme.border },
            end && { borderColor: theme.accent, borderWidth: 1 },
          ]}>
          <Text
            style={[
              styles.dateLabel,
              { color: theme.mode === 'dark' ? 'rgba(255,255,255,0.6)' : '#90A4AE' },
              end && { color: theme.accent },
            ]}>
            END DATE
          </Text>
          <Text style={[styles.dateValue, { color: theme.text }]}>
            {end
              ? end.toLocaleDateString('default', {
                  month: 'short',
                  day: '2-digit',
                  year: 'numeric',
                })
              : 'Choose a date'}
          </Text>
        </View>
      </View>

      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
        {months.map((m, idx) => (
          <CalendarMonth
            key={idx}
            monthDate={m}
            start={start}
            end={end}
            onPress={handleDatePress}
            theme={theme}
            accentSurface={accentSurface}
          />
        ))}
      </ScrollView>

      <TouchableOpacity
        style={[styles.applyBtn, { backgroundColor: theme.accent }]}
        onPress={onConfirm}
        disabled={!start || !end}>
        <Text style={styles.applyBtnText}>Confirm</Text>
      </TouchableOpacity>
    </View>
  );
}

function CalendarMonth({ monthDate, start, end, onPress, theme, accentSurface }: any) {
  const days = useMemo(() => {
    const year = monthDate.getFullYear();
    const month = monthDate.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const arr = [];
    for (let i = 0; i < firstDay; i++) arr.push(null);
    for (let i = 1; i <= daysInMonth; i++) arr.push(new Date(year, month, i));
    return arr;
  }, [monthDate]);

  const monthName = monthDate.toLocaleString('default', { month: 'long', year: 'numeric' });

  return (
    <View style={styles.monthContainer}>
      <Text style={[styles.monthName, { color: theme.text }]}>{monthName}</Text>
      <View style={styles.weekLabels}>
        {['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'].map((d) => (
          <Text key={d} style={styles.weekLabel}>
            {d}
          </Text>
        ))}
      </View>
      <View style={styles.daysGrid}>
        {days.map((d: Date | null, idx) => {
          if (!d) return <View key={idx} style={styles.dayCell} />;

          const isStart = start && d.toDateString() === start.toDateString();
          const isEnd = end && d.toDateString() === end.toDateString();
          const isInRange = start && end && d > start && d < end;

          return (
            <TouchableOpacity
              key={idx}
              style={[
                styles.dayCell,
                isStart && [styles.selectedDay, { backgroundColor: theme.accent }],
                isEnd && [styles.selectedDay, { backgroundColor: theme.accent }],
                isInRange && { backgroundColor: accentSurface },
              ]}
              onPress={() => onPress(d)}>
              <Text
                style={[
                  styles.dayText,
                  { color: theme.text },
                  (isStart || isEnd) && { color: 'white', fontWeight: 'bold' },
                ]}>
                {d.getDate()}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    borderTopLeftRadius: 40,
    borderTopRightRadius: 40,
    paddingTop: 8,
    paddingBottom: 40,
    height: SCREEN_HEIGHT * 0.85,
  },
  handle: {
    width: 40,
    height: 4,
    backgroundColor: '#E0E0E0',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 20,
  },
  viewContainer: {
    flex: 1,
    paddingHorizontal: 24,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 20,
    fontWeight: '900',
    fontFamily: Fonts.title,
  },
  subtitle: {
    fontSize: 10,
    fontWeight: '900',
    color: '#90A4AE',
    letterSpacing: 1,
    marginTop: 4,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F5F5F5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  presetsList: {
    gap: 12,
  },
  presetItem: {
    padding: 20,
    borderRadius: 24,
    backgroundColor: '#F5F5F5',
    borderWidth: 2,
    borderColor: 'transparent',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  presetText: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  checkCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  customRangeItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 20,
    borderRadius: 24,
    backgroundColor: '#F5F5F5',
    marginTop: 8,
  },
  customRangeMain: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  customRangeText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#455A64',
  },
  applyBtn: {
    height: 64,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 24,
  },
  applyBtnText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '900',
  },
  dateDisplays: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 32,
  },
  dateBox: {
    flex: 1,
    backgroundColor: '#F5F5F5',
    padding: 16,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  dateLabel: {
    fontSize: 10,
    fontWeight: '900',
    color: '#90A4AE',
    marginBottom: 4,
  },
  dateValue: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  monthContainer: {
    marginBottom: 32,
  },
  monthName: {
    fontSize: 16,
    fontWeight: '900',
    marginBottom: 16,
    fontFamily: Fonts.title,
  },
  weekLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  weekLabel: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#90A4AE',
    width: (SCREEN_WIDTH - 48) / 7,
    textAlign: 'center',
  },
  daysGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  dayCell: {
    width: (Dimensions.get('window').width - 48) / 7,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 24,
  },
  dayText: {
    fontSize: 14,
    fontWeight: '500',
  },
  selectedDay: {
    borderRadius: 24,
  },
});
