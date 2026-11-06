import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { cssInterop } from 'nativewind';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, View } from 'react-native';

import { DateField, SheetInput, SheetLabel } from '@/components/statements/StatementFormSheet';
import { ThemedText } from '@/components/themed-text';
import { AnimatedBottomSheet } from '@/components/ui/AnimatedBottomSheet';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { Fonts } from '@/constants/theme';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import { useBottomInset } from '@/hooks/use-bottom-inset';
import type { EMIPlanPayload } from '@/lib/emi-plans';
import { formatMoney } from '@/lib/money';
import { fromISODate, parseAmountInput, toISODate } from '@/lib/statement-dates';
import { previewEMISchedule } from '@/lib/emi-preview';

const TText = cssInterop(ThemedText, { className: 'style' });

const TENURE_OPTIONS = [3, 6, 9, 12, 18, 24];

/**
 * Setting up an EMI plan.
 *
 * Asks only what the bank actually tells the user — purchase amount, tenure,
 * and the rate (zero for the no-cost offers that are everywhere in India).
 * Everything else is derived, and the preview underneath shows the derived
 * figures before they commit, including the one people are surprised by: the
 * full purchase price is held against their limit from day one, not just the
 * monthly instalment.
 */
export function EMIPlanFormSheet({
  visible,
  cardName,
  submitting,
  error,
  onClose,
  onSubmit,
}: {
  visible: boolean;
  cardName: string;
  submitting: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (payload: EMIPlanPayload) => void;
}) {
  const theme = useThemeTokens().colors;
  const sheetBottom = useBottomInset(32);

  const [title, setTitle] = useState('');
  const [principal, setPrincipal] = useState('');
  const [tenure, setTenure] = useState(12);
  const [rate, setRate] = useState('');
  const [purchasedOn, setPurchasedOn] = useState('');
  const [showPicker, setShowPicker] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setTitle('');
    setPrincipal('');
    setTenure(12);
    setRate('');
    setPurchasedOn(toISODate(new Date()));
  }, [visible]);

  const principalValue = parseAmountInput(principal);
  const rateValue = Number.parseFloat(rate.replace(/[^0-9.]/g, '')) || 0;

  const preview = useMemo(
    () =>
      principalValue > 0 ? previewEMISchedule(principalValue, rateValue, tenure) : null,
    [principalValue, rateValue, tenure]
  );

  const canSubmit = title.trim().length > 0 && principalValue > 0 && !submitting;

  return (
    <AnimatedBottomSheet visible={visible} onClose={onClose} avoidKeyboard>
      <View
        /*
         * The sheet paints its own surface. Without it the form floated on the
         * dimmed screen behind it — the backdrop was doing all the work and the
         * fields read as though they belonged to the page underneath.
         */
        className="rounded-t-[28px] border px-6 pt-5"
        style={{ backgroundColor: theme.card, borderColor: theme.border, paddingBottom: sheetBottom }}>
        <View className="mb-4 flex-row items-center justify-between">
          <TText className="text-xl" style={{ fontFamily: Fonts.title, color: theme.text }}>
            Split into EMI
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

        <TText className="text-xs" style={{ fontFamily: Fonts.body, color: '#7C8EA8' }}>
          {cardName}
        </TText>

        {error && <ErrorBanner message={error} style={{ marginTop: 12 }} />}

        <SheetLabel>What did you buy?</SheetLabel>
        <SheetInput
          value={title}
          onChangeText={setTitle}
          placeholder="iPhone 17"
          icon="tag-outline"
          autoFocus
        />

        <SheetLabel>Purchase amount</SheetLabel>
        <SheetInput
          value={principal}
          onChangeText={setPrincipal}
          placeholder="60,000"
          keyboardType="decimal-pad"
          icon="currency-inr"
        />

        <SheetLabel>Tenure</SheetLabel>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="-mx-1">
          <View className="flex-row gap-2 px-1">
            {TENURE_OPTIONS.map((months) => (
              <Pressable
                key={months}
                accessibilityRole="button"
                accessibilityState={{ selected: tenure === months }}
                onPress={() => setTenure(months)}
                className="rounded-full border px-4 py-2"
                style={{
                  borderColor: tenure === months ? theme.accent : theme.border,
                  backgroundColor: tenure === months ? theme.accent : theme.card,
                }}>
                <TText
                  className="text-xs"
                  style={{
                    fontFamily: Fonts.title,
                    color: tenure === months ? theme.onAccent : theme.text,
                  }}>
                  {months} mo
                </TText>
              </Pressable>
            ))}
          </View>
        </ScrollView>

        <SheetLabel>Interest rate (leave blank for no-cost)</SheetLabel>
        <SheetInput
          value={rate}
          onChangeText={setRate}
          placeholder="0"
          keyboardType="decimal-pad"
          icon="percent-outline"
        />

        <SheetLabel>Purchased on</SheetLabel>
        <DateField
          value={purchasedOn}
          onPress={() => {
            if (Platform.OS === 'android') {
              DateTimePickerAndroid.open({
                value: fromISODate(purchasedOn),
                onValueChange: (_event, selected) => {
                  if (selected) setPurchasedOn(toISODate(selected));
                },
                onDismiss: () => undefined,
              });
              return;
            }
            setShowPicker(true);
          }}
        />

        {showPicker && Platform.OS !== 'android' && (
          <DateTimePicker
            value={fromISODate(purchasedOn)}
            mode="date"
            display="spinner"
            onChange={(_event, selected) => {
              setShowPicker(false);
              if (selected) setPurchasedOn(toISODate(selected));
            }}
          />
        )}

        {preview && (
          <View
            className="mt-5 rounded-[22px] px-4 py-4"
            style={{ backgroundColor: theme.secondary }}>
            <PreviewRow label="Monthly instalment" value={formatMoney(preview.monthlyAmount)} />
            {preview.totalInterest > 0 && (
              <PreviewRow label="Total interest" value={formatMoney(preview.totalInterest)} />
            )}
            <PreviewRow
              label="Total payable"
              value={formatMoney(preview.totalPayment)}
            />
            {/* The part people are caught out by: the whole purchase price is
                held against the limit immediately, not the instalment. */}
            <TText
              className="mt-3 text-[11px]"
              style={{ fontFamily: Fonts.body, color: '#7C8EA8' }}>
              {formatMoney(principalValue)} of your credit limit is held from the start and comes
              back as each instalment is paid.
            </TText>
          </View>
        )}

        <Pressable
          accessibilityRole="button"
          disabled={!canSubmit}
          onPress={() =>
            onSubmit({
              title: title.trim(),
              principal: principalValue,
              annual_rate_pct: rateValue,
              tenure_months: tenure,
              purchased_on: purchasedOn,
            })
          }
          className="mt-6 h-14 items-center justify-center rounded-full"
          style={{ backgroundColor: canSubmit ? theme.accent : theme.secondary }}>
          {submitting ? (
            <ActivityIndicator color={theme.onAccent} />
          ) : (
            <TText
              className="text-base"
              style={{ fontFamily: Fonts.title, color: canSubmit ? theme.onAccent : '#94A3B8' }}>
              Create plan
            </TText>
          )}
        </Pressable>
      </View>
    </AnimatedBottomSheet>
  );
}

function PreviewRow({ label, value }: { label: string; value: string }) {
  const theme = useThemeTokens().colors;
  return (
    <View className="flex-row items-center justify-between py-1">
      <TText className="text-xs" style={{ fontFamily: Fonts.body, color: '#7C8EA8' }}>
        {label}
      </TText>
      <TText className="text-sm" style={{ fontFamily: Fonts.title, color: theme.text }}>
        {value}
      </TText>
    </View>
  );
}
