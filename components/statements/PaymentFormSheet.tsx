import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { cssInterop } from 'nativewind';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, View } from 'react-native';

import { DateField, SheetInput, SheetLabel } from '@/components/statements/StatementFormSheet';
import { ThemedText } from '@/components/themed-text';
import { AnimatedBottomSheet } from '@/components/ui/AnimatedBottomSheet';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { FormDisclosure } from '@/components/ui/FormDisclosure';
import { Fonts } from '@/constants/theme';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import { useBottomInset } from '@/hooks/use-bottom-inset';
import { normalizeAccountType, type Account } from '@/lib/accounts';
import { fromISODate, parseAmountInput, toISODate } from '@/lib/statement-dates';
import { formatMoney } from '@/lib/money';
import type { StatementPaymentPayload } from '@/lib/statements';

const TText = cssInterop(ThemedText, { className: 'style' });

const PAYMENT_METHODS = ['UPI', 'Net banking', 'Autopay', 'Card', 'Other'];

/**
 * Logging a payment the user made somewhere else.
 *
 * Finnri does not move money, so nothing in here is a transfer — it is a
 * record of one. The amount defaults to what is left on the bill, because
 * paying in full is the common case, but it is an editable field rather than a
 * fixed one: partial payments are ordinary on cards and the sheet should not
 * make the user fight to enter one.
 *
 * Naming the source account is optional. When given, the money is also shown
 * leaving that account, which is the only way its balance stays true.
 *
 * `paid-off` is the same sheet for a card with no statement: "Mark card paid
 * off" used to be a yes/no that cleared the card and wrote nothing, so the
 * bank account the bill was paid from never went down. Its amount is what was
 * spent on the card since it was last cleared, and a partial payment is not a
 * thing it can record — paid off is the whole of it.
 */
export function PaymentFormSheet({
  variant = 'statement',
  visible,
  remainingDue,
  minimumDue,
  accounts,
  cardId,
  submitting,
  error,
  onClose,
  onSubmit,
}: {
  variant?: 'statement' | 'paid-off';
  visible: boolean;
  remainingDue: number;
  minimumDue: number;
  accounts: Account[];
  cardId: number;
  submitting: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (payload: StatementPaymentPayload) => void;
}) {
  const theme = useThemeTokens().colors;
  const sheetBottom = useBottomInset(32);

  const [amount, setAmount] = useState('');
  const [paidOn, setPaidOn] = useState('');
  const [method, setMethod] = useState<string>('');
  const [fromAccountId, setFromAccountId] = useState<number | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [showSource, setShowSource] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setAmount(remainingDue > 0 ? String(remainingDue) : '');
    setPaidOn(toISODate(new Date()));
    setMethod('');
    setFromAccountId(null);
    setShowSource(false);
  }, [visible, remainingDue]);

  // Paying a card from the same card is not a thing, so it is not offered.
  const sourceAccounts = useMemo(
    () => accounts.filter((account) => account.id !== cardId && normalizeAccountType(account.type) !== 'credit_card'),
    [accounts, cardId]
  );

  const value = parseAmountInput(amount);
  const canSubmit = value > 0 && !submitting;
  const paidOff = variant === 'paid-off';
  const isPartial = !paidOff && value > 0 && value < remainingDue;
  const sourceName = sourceAccounts.find((account) => account.id === fromAccountId)?.name;

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
            {paidOff ? 'Mark card paid off' : 'Record payment'}
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
          {paidOff
            ? `${formatMoney(remainingDue)} spent on this card since it was last cleared. Marking it paid off resets that to zero.`
            : `${formatMoney(remainingDue)} left on this bill`}
        </TText>

        {error && <ErrorBanner message={error} style={{ marginTop: 12 }} />}

        <SheetLabel>Amount paid</SheetLabel>
        <SheetInput
          value={amount}
          onChangeText={setAmount}
          placeholder="12,400"
          keyboardType="decimal-pad"
          icon="currency-inr"
          autoFocus
        />

        <View className="mt-3 flex-row flex-wrap gap-2">
          {remainingDue > 0 && (
            <QuickAmount
              label={`Full ${formatMoney(remainingDue)}`}
              onPress={() => setAmount(String(remainingDue))}
            />
          )}
          {minimumDue > 0 && minimumDue < remainingDue && (
            <QuickAmount
              label={`Minimum ${formatMoney(minimumDue)}`}
              onPress={() => setAmount(String(minimumDue))}
            />
          )}
        </View>

        {/* Paying only the minimum is the expensive mistake, so it is named at
            the moment the user is about to make it — not afterwards. */}
        {isPartial && (
          <TText className="mt-3 text-xs" style={{ fontFamily: Fonts.body, color: '#B45309' }}>
            {formatMoney(remainingDue - value)} will stay unpaid and accrue interest on the full
            balance.
          </TText>
        )}

        <SheetLabel>Paid on</SheetLabel>
        <DateField
          value={paidOn}
          onPress={() => {
            if (Platform.OS === 'android') {
              DateTimePickerAndroid.open({
                value: fromISODate(paidOn),
                onValueChange: (_event, selected) => {
                  if (selected) setPaidOn(toISODate(selected));
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
            value={fromISODate(paidOn)}
            mode="date"
            display="spinner"
            onChange={(_event, selected) => {
              setShowPicker(false);
              if (selected) setPaidOn(toISODate(selected));
            }}
          />
        )}

        {/* How and where from are both optional, and most payments are
            logged without either — so they wait behind one row, which says
            what has been picked. */}
        <View className="mt-5">
          <FormDisclosure
            testID="payment-source-options"
            label="Paid from"
            summary={
              [sourceName, method].filter(Boolean).join(' · ') ||
              (paidOff
                ? 'Optional — leave empty if someone else paid'
                : 'Optional — keeps that account’s balance right')
            }
            expanded={showSource}
            onToggle={() => setShowSource((open) => !open)}>
            {sourceAccounts.length > 0 && (
              <>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} className="-mx-1">
                  <View className="flex-row gap-2 px-1">
                    {sourceAccounts.map((account) => (
                      <Chip
                        key={account.id}
                        label={account.name}
                        selected={fromAccountId === account.id}
                        onPress={() =>
                          setFromAccountId(fromAccountId === account.id ? null : account.id)
                        }
                      />
                    ))}
                  </View>
                </ScrollView>
                <TText
                  className="mb-4 mt-2 text-[11px]"
                  style={{ fontFamily: Fonts.body, color: theme.muted }}>
                  The money shows leaving that account, so its balance stays right. It is not
                  counted as new spending.
                </TText>
              </>
            )}
            <TText
              className="mb-2 text-[11px] uppercase"
              style={{ fontFamily: Fonts.title, color: theme.muted, letterSpacing: 1 }}>
              How you paid
            </TText>
            <View className="flex-row flex-wrap gap-2">
              {PAYMENT_METHODS.map((option) => (
                <Chip
                  key={option}
                  label={option}
                  selected={method === option}
                  onPress={() => setMethod(method === option ? '' : option)}
                />
              ))}
            </View>
          </FormDisclosure>
        </View>

        <Pressable
          accessibilityRole="button"
          disabled={!canSubmit}
          onPress={() =>
            onSubmit({
              amount: value,
              paid_on: paidOn,
              method: method || undefined,
              from_account_id: fromAccountId,
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
              {paidOff ? 'Mark paid off' : 'Record payment'}
            </TText>
          )}
        </Pressable>
      </View>
    </AnimatedBottomSheet>
  );
}

function QuickAmount({ label, onPress }: { label: string; onPress: () => void }) {
  const theme = useThemeTokens().colors;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      className="rounded-full border px-3 py-2"
      style={{ borderColor: theme.border, backgroundColor: theme.card }}>
      <TText className="text-xs" style={{ fontFamily: Fonts.title, color: theme.text }}>
        {label}
      </TText>
    </Pressable>
  );
}

function Chip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  const theme = useThemeTokens().colors;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      className="rounded-full border px-4 py-2"
      style={{
        borderColor: selected ? theme.accent : theme.border,
        backgroundColor: selected ? theme.accent : theme.card,
      }}>
      <TText
        className="text-xs"
        numberOfLines={1}
        style={{ fontFamily: Fonts.title, color: selected ? theme.onAccent : theme.text }}>
        {label}
      </TText>
    </Pressable>
  );
}
