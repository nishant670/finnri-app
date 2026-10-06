import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { cssInterop } from 'nativewind';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { AnimatedBottomSheet } from '@/components/ui/AnimatedBottomSheet';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { Fonts } from '@/constants/theme';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import type { Account } from '@/lib/accounts';
import {
  defaultDueDate,
  defaultStatementDate,
  formatDisplayDate,
  fromISODate,
  parseAmountInput,
  toISODate,
} from '@/lib/statement-dates';
import type { CardStatementPayload, StatementUploadSource } from '@/lib/statements';

const TText = cssInterop(ThemedText, { className: 'style' });

/** The server's batch limit for statement screenshots. */
const MAX_STATEMENT_SCREENSHOTS = 8;

/**
 * Entering the bill.
 *
 * All four fields are prefilled from what the card already knows, because the
 * user is holding a statement and retyping what Finnri could have worked out
 * is friction for nothing. All four stay editable, because banks shift dates
 * for weekends and holidays and the paper in their hand wins.
 */
export function StatementFormSheet({
  visible,
  card,
  initial,
  submitting,
  error,
  onClose,
  onSubmit,
  screenshotsLocked = false,
  onSeePlans,
}: {
  visible: boolean;
  card: Account;
  /** Editing an existing bill; omitted when adding a new one. */
  initial?: { statement_date: string; due_date: string; total_due: number; minimum_due: number };
  submitting: boolean;
  error: string | null;
  onClose: () => void;
  /**
   * A statement file picked here, if any, comes along with the bill. The
   * caller saves the bill first and then hands the file to the review screen,
   * because reading a statement needs the bill's cycle to compare against.
   */
  onSubmit: (payload: CardStatementPayload, source?: StatementUploadSource) => void;
  /** Reading screenshots needs a paid plan; PDFs never do. */
  screenshotsLocked?: boolean;
  onSeePlans?: () => void;
}) {
  const themeTokens = useThemeTokens();
  const theme = themeTokens.colors;

  const [statementDate, setStatementDate] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [totalDue, setTotalDue] = useState('');
  const [minimumDue, setMinimumDue] = useState('');
  const [dueDateTouched, setDueDateTouched] = useState(false);
  const [picker, setPicker] = useState<'statement' | 'due' | null>(null);
  const [source, setSource] = useState<StatementUploadSource | null>(null);
  const [sourceError, setSourceError] = useState<string | null>(null);
  const [showScreenshotsLock, setShowScreenshotsLock] = useState(false);

  useEffect(() => {
    if (!visible) return;
    const nextStatement = initial?.statement_date ?? defaultStatementDate(card.statement_day);
    setStatementDate(nextStatement);
    setDueDate(initial?.due_date ?? defaultDueDate(nextStatement, card.due_day));
    setTotalDue(initial?.total_due ? String(initial.total_due) : '');
    setMinimumDue(initial?.minimum_due ? String(initial.minimum_due) : '');
    setDueDateTouched(Boolean(initial));
    setSource(null);
    setSourceError(null);
    setShowScreenshotsLock(false);
  }, [visible, initial, card.statement_day, card.due_day]);

  // Moving the statement date carries the due date with it, until the user
  // sets one themselves — after which their choice is left alone.
  const handleStatementDate = (next: string) => {
    setStatementDate(next);
    if (!dueDateTouched) setDueDate(defaultDueDate(next, card.due_day));
  };

  const total = parseAmountInput(totalDue);
  const minimum = parseAmountInput(minimumDue);

  const validationError = useMemo(() => {
    if (!totalDue.trim()) return null;
    if (total <= 0) return 'Enter the total on your statement.';
    if (minimum > total) return 'The minimum due cannot be more than the total.';
    if (fromISODate(dueDate) <= fromISODate(statementDate)) {
      return 'The due date has to be after the statement date.';
    }
    return null;
  }, [totalDue, total, minimum, dueDate, statementDate]);

  const canSubmit = total > 0 && !validationError && !submitting;

  const pickPDF = async () => {
    setSourceError(null);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'application/pdf',
        copyToCacheDirectory: true,
      });
      const asset = result.canceled ? null : result.assets?.[0];
      if (!asset) return;
      setSource({ kind: 'pdf', uri: asset.uri, name: asset.name ?? 'statement.pdf' });
    } catch {
      setSourceError('That file could not be opened. Please try again.');
    }
  };

  const pickScreenshots = async () => {
    setSourceError(null);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'image/*',
        multiple: true,
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets?.length) return;
      if (result.assets.length > MAX_STATEMENT_SCREENSHOTS) {
        setSourceError(`Choose up to ${MAX_STATEMENT_SCREENSHOTS} screenshots at a time.`);
        return;
      }
      setSource({
        kind: 'screenshots',
        files: result.assets.map((asset, index) => ({
          uri: asset.uri,
          name: asset.name ?? `statement-page-${index + 1}.jpg`,
          mimeType: asset.mimeType,
        })),
      });
    } catch {
      setSourceError('Those screenshots could not be opened. Please try again.');
    }
  };

  const openPicker = (which: 'statement' | 'due') => {
    const current = which === 'statement' ? statementDate : dueDate;
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: fromISODate(current),
        onValueChange: (_event, selected) => {
          if (!selected) return;
          if (which === 'statement') handleStatementDate(toISODate(selected));
          else {
            setDueDate(toISODate(selected));
            setDueDateTouched(true);
          }
        },
        onDismiss: () => undefined,
      });
      return;
    }
    setPicker(which);
  };

  return (
    <AnimatedBottomSheet visible={visible} onClose={onClose} avoidKeyboard>
      <View
        /*
         * The sheet paints its own surface. Without it the form floated on the
         * dimmed screen behind it — the backdrop was doing all the work and the
         * fields read as though they belonged to the page underneath.
         */
        className="rounded-t-[28px] border px-6 pb-8 pt-5"
        style={{ backgroundColor: theme.card, borderColor: theme.border }}>
        <View className="mb-5 flex-row items-center justify-between">
          <TText className="text-xl" style={{ fontFamily: Fonts.title, color: theme.text }}>
            {initial ? 'Edit statement' : 'Add statement'}
          </TText>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close"
            onPress={onClose}
            className="h-9 w-9 items-center justify-center rounded-full"
            style={{ backgroundColor: theme.secondary }}>
            <MaterialCommunityIcons name="close" size={18} color={theme.text} />
          </Pressable>
        </View>

        <TText className="mb-2 text-xs" style={{ fontFamily: Fonts.body, color: '#7C8EA8' }}>
          {card.name}
        </TText>

        {error && <ErrorBanner message={error} style={{ marginBottom: 12 }} />}

        <SheetLabel>Total due</SheetLabel>
        <SheetInput
          value={totalDue}
          onChangeText={setTotalDue}
          placeholder="12,400"
          keyboardType="decimal-pad"
          icon="currency-inr"
          autoFocus
        />

        <SheetLabel>Minimum due (optional)</SheetLabel>
        <SheetInput
          value={minimumDue}
          onChangeText={setMinimumDue}
          placeholder="620"
          keyboardType="decimal-pad"
          icon="currency-inr"
        />

        <View className="flex-row gap-3">
          <View className="flex-1">
            <SheetLabel>Statement date</SheetLabel>
            <DateField value={statementDate} onPress={() => openPicker('statement')} />
          </View>
          <View className="flex-1">
            <SheetLabel>Due date</SheetLabel>
            <DateField value={dueDate} onPress={() => openPicker('due')} />
          </View>
        </View>

        {validationError && (
          <TText className="mt-3 text-xs" style={{ fontFamily: Fonts.body, color: '#EF4444' }}>
            {validationError}
          </TText>
        )}

        {!initial && (
          <>
            <SheetLabel>Upload statement (optional)</SheetLabel>
            {source ? (
              <View
                testID="statement-upload-picked"
                className="h-14 flex-row items-center rounded-[18px] border px-4"
                style={{ backgroundColor: theme.background, borderColor: theme.border }}>
                <MaterialCommunityIcons
                  name={source.kind === 'pdf' ? 'file-pdf-box' : 'image-multiple-outline'}
                  size={20}
                  color={theme.accent}
                  style={{ marginRight: 8 }}
                />
                <TText
                  className="min-w-0 flex-1 text-sm"
                  numberOfLines={1}
                  style={{ fontFamily: Fonts.body, color: theme.text }}>
                  {source.kind === 'pdf'
                    ? source.name
                    : `${source.files.length} screenshot${source.files.length === 1 ? '' : 's'}`}
                </TText>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Remove statement file"
                  onPress={() => setSource(null)}
                  hitSlop={8}>
                  <MaterialCommunityIcons name="close-circle" size={20} color="#94A3B8" />
                </Pressable>
              </View>
            ) : (
              <View className="flex-row gap-3">
                <UploadChoice
                  testID="statement-upload-pdf"
                  icon="file-pdf-box"
                  label="PDF"
                  onPress={() => void pickPDF()}
                />
                <UploadChoice
                  testID="statement-upload-screenshots"
                  icon={screenshotsLocked ? 'lock-outline' : 'image-multiple-outline'}
                  label="Screenshots"
                  onPress={() => {
                    if (screenshotsLocked) {
                      setSourceError(null);
                      setShowScreenshotsLock(true);
                      return;
                    }
                    void pickScreenshots();
                  }}
                />
              </View>
            )}
            {showScreenshotsLock && !source ? (
              <View testID="statement-screenshots-locked" className="mt-2 flex-row flex-wrap">
                <TText className="text-[11px]" style={{ fontFamily: Fonts.body, color: '#7C8EA8' }}>
                  Reading screenshots needs a plan. A PDF works on every plan.{' '}
                </TText>
                {onSeePlans ? (
                  <Pressable accessibilityRole="link" onPress={onSeePlans} hitSlop={6}>
                    <TText
                      className="text-[11px]"
                      style={{ fontFamily: Fonts.title, color: theme.accent }}>
                      See plans
                    </TText>
                  </Pressable>
                ) : null}
              </View>
            ) : null}
            <TText
              className="mt-2 text-[11px]"
              style={{ fontFamily: Fonts.body, color: '#7C8EA8' }}>
              {sourceError ??
                'Finnri reads it right after the bill is added and shows what is missing. Screenshots use AI credits. The file and any password are never stored.'}
            </TText>
          </>
        )}

        {picker && Platform.OS !== 'android' && (
          <DateTimePicker
            value={fromISODate(picker === 'statement' ? statementDate : dueDate)}
            mode="date"
            display="spinner"
            onChange={(_event, selected) => {
              setPicker(null);
              if (!selected) return;
              if (picker === 'statement') handleStatementDate(toISODate(selected));
              else {
                setDueDate(toISODate(selected));
                setDueDateTouched(true);
              }
            }}
          />
        )}

        <Pressable
          accessibilityRole="button"
          disabled={!canSubmit}
          onPress={() =>
            onSubmit(
              {
                statement_date: statementDate,
                due_date: dueDate,
                total_due: total,
                minimum_due: minimum,
              },
              source ?? undefined
            )
          }
          className="mt-6 h-14 flex-row items-center justify-center gap-2 rounded-full"
          style={{ backgroundColor: canSubmit ? theme.accent : theme.secondary }}>
          {submitting ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <TText
              className="text-base"
              style={{
                fontFamily: Fonts.title,
                color: canSubmit ? '#FFFFFF' : '#94A3B8',
              }}>
              {initial ? 'Save changes' : source ? 'Add & read statement' : 'Add statement'}
            </TText>
          )}
        </Pressable>
      </View>
    </AnimatedBottomSheet>
  );
}

export function SheetLabel({ children }: { children: React.ReactNode }) {
  return (
    <TText
      className="mb-2 mt-4 text-xs uppercase"
      style={{ fontFamily: Fonts.title, color: '#8EA0B8', letterSpacing: 1.1 }}>
      {children}
    </TText>
  );
}

export function SheetInput({
  value,
  onChangeText,
  placeholder,
  keyboardType = 'default',
  icon,
  autoFocus = false,
}: {
  value: string;
  onChangeText: (next: string) => void;
  placeholder: string;
  keyboardType?: 'default' | 'decimal-pad' | 'number-pad';
  icon?: keyof typeof MaterialCommunityIcons.glyphMap;
  autoFocus?: boolean;
}) {
  const theme = useThemeTokens().colors;
  return (
    <View
      className="h-14 flex-row items-center rounded-[18px] border px-4"
      style={{ backgroundColor: theme.background, borderColor: theme.border }}>
      {icon && (
        <MaterialCommunityIcons
          name={icon}
          size={20}
          color={theme.accent}
          style={{ marginRight: 8 }}
        />
      )}
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#AAB7C6"
        keyboardType={keyboardType}
        autoFocus={autoFocus}
        style={{ flex: 1, fontFamily: Fonts.body, fontSize: 16, color: theme.text }}
      />
    </View>
  );
}

export function DateField({ value, onPress }: { value: string; onPress: () => void }) {
  const theme = useThemeTokens().colors;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      className="h-14 flex-row items-center rounded-[18px] border px-4"
      style={{ backgroundColor: theme.background, borderColor: theme.border }}>
      <MaterialCommunityIcons
        name="calendar-outline"
        size={18}
        color={theme.accent}
        style={{ marginRight: 8 }}
      />
      <TText
        className="min-w-0 flex-1 text-sm"
        numberOfLines={1}
        style={{ fontFamily: Fonts.body, color: theme.text }}>
        {value ? formatDisplayDate(value) : 'Pick a date'}
      </TText>
    </Pressable>
  );
}

function UploadChoice({
  testID,
  icon,
  label,
  onPress,
}: {
  testID: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  label: string;
  onPress: () => void;
}) {
  const theme = useThemeTokens().colors;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={`Upload statement ${label}`}
      onPress={onPress}
      className="h-14 flex-1 flex-row items-center justify-center gap-2 rounded-[18px] border"
      style={{ backgroundColor: theme.background, borderColor: theme.border }}>
      <MaterialCommunityIcons name={icon} size={20} color={theme.accent} />
      <TText className="text-sm" style={{ fontFamily: Fonts.title, color: theme.text }}>
        {label}
      </TText>
    </Pressable>
  );
}
