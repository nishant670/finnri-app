import { useState, type Dispatch, type SetStateAction } from 'react';
import { StyleSheet, View } from 'react-native';

import {
  InputRow,
  RECURRING_LABEL_WIDTH,
  RowsCard,
  RowsNote,
  ToggleRow,
} from '@/components/money/subscriptions/FormRows';
import { DateRow } from '@/components/money/subscriptions/DateRow';
import {
  INCOME_PAYMENT_MODES,
  PaymentAccountPicker,
  RECURRING_PAYMENT_MODES,
  usablePayment,
} from '@/components/money/subscriptions/PaymentAccountPicker';
import { SegmentedControl } from '@/components/money/subscriptions/SegmentedControl';
import { LabelRow } from '@/components/ui/LabelRow';
import { PickerOptionList, PickerSheet } from '@/components/ui/PickerSheet';
import { type Account } from '@/lib/accounts';
import { categoryVisual, INCOME_CATEGORIES } from '@/lib/categories';
import { haptics } from '@/lib/haptics';
import {
  reminderOptions,
  reminderLabel,
  categoryOptions,
  statusOptions,
} from '@/lib/subscription-form';
import { BillingInterval, RecurringKind, SubscriptionStatus } from '@/lib/subscriptions';
import { useThemeTokens } from '@/hooks/use-theme-tokens';

/** What each kind's notes usually hold. */
const NOTES_PLACEHOLDER: Record<RecurringKind, string> = {
  subscription: 'Plan tier, cancellation link, family plan details',
  loan: 'Loan account number, branch, prepayment terms',
  investment: 'Folio number, goal, nominee',
  bill: 'Consumer number, biller ID',
  income: 'Employer, payslip or arrangement notes',
};

type SubscriptionAdvancedFieldsProps = {
  accountID: number | null;
  accounts: Account[];
  autopay: boolean;
  cancelBeforeDue: boolean;
  cancelOnDate: string;
  category: string;
  formKind: RecurringKind;
  interval: BillingInterval;
  isEditing: boolean;
  merchant: string;
  name: string;
  notes: string;
  onAddAccount: () => void;
  openCancellationDatePicker: () => void;
  paymentMode: string;
  reminderDays: number;
  setAccountID: Dispatch<SetStateAction<number | null>>;
  setAutopay: Dispatch<SetStateAction<boolean>>;
  setCancelBeforeDue: Dispatch<SetStateAction<boolean>>;
  setCategory: Dispatch<SetStateAction<string>>;
  setName: Dispatch<SetStateAction<string>>;
  setNotes: Dispatch<SetStateAction<string>>;
  setPaymentMode: Dispatch<SetStateAction<string>>;
  setReminderDays: Dispatch<SetStateAction<number>>;
  setStatus: Dispatch<SetStateAction<SubscriptionStatus>>;
  status: SubscriptionStatus;
};

/**
 * Under "More options": how the item is named and filed, when to remind, and
 * how it is paid — as rows of two cards (the rows of board R5-NewLoan). A
 * choice from a list opens a picker sheet, as Repeats does.
 */
export function SubscriptionAdvancedFields({
  accountID,
  accounts,
  autopay,
  cancelBeforeDue,
  cancelOnDate,
  category,
  formKind,
  interval,
  isEditing,
  merchant,
  name,
  notes,
  onAddAccount,
  openCancellationDatePicker,
  paymentMode,
  reminderDays,
  setAccountID,
  setAutopay,
  setCancelBeforeDue,
  setCategory,
  setName,
  setNotes,
  setPaymentMode,
  setReminderDays,
  setStatus,
  status,
}: SubscriptionAdvancedFieldsProps) {
  const { colors } = useThemeTokens();
  const [picker, setPicker] = useState<'category' | 'reminder' | null>(null);
  // Daily payments are added as they fall due, so there is nothing to remind.
  const remindable = interval !== 'daily' && interval !== 'business_daily';
  // An investment is not spending, and offering "Food & Drinks" for a PPF
  // instalment was the first thing questioned on device, so it is not asked.
  const asksCategory = formKind !== 'investment';
  // For a trial or a plan to stop — not a loan or an SIP. Still shown when an
  // older item already has it on, so it can be turned off.
  const offersCancel = formKind === 'subscription' || formKind === 'bill' || cancelBeforeDue;
  // Income is filed under income categories, lands in an account (never a
  // card) and is added on the day rather than paid.
  const income = formKind === 'income';
  const modes = income ? INCOME_PAYMENT_MODES : RECURRING_PAYMENT_MODES;
  const categories: readonly string[] = income ? INCOME_CATEGORIES : categoryOptions;
  const visual = categoryVisual(category, income ? 'income' : undefined);

  return (
    <View style={styles.stack}>
      {isEditing && (
        <SegmentedControl
          label="Status"
          values={statusOptions}
          active={status}
          onSelect={setStatus}
          colors={colors}
        />
      )}

      <View>
        <RowsCard>
          <InputRow
            label="Display name"
            value={name}
            onChangeText={setName}
            placeholder={merchant.trim() || 'Same as merchant'}
          />
          {asksCategory ? (
            <LabelRow
              testID="recurring-category"
              label="Category"
              value={category}
              icon={visual.icon}
              iconColor={colors.text}
              divider
              labelWidth={RECURRING_LABEL_WIDTH}
              onPress={() => setPicker('category')}
            />
          ) : null}
          <LabelRow
            testID="recurring-reminder"
            label="Reminder"
            value={remindable ? reminderLabel(reminderDays) : 'None'}
            valueMuted={!remindable}
            icon="bell-outline"
            iconColor={remindable ? colors.text : colors.muted}
            divider
            labelWidth={RECURRING_LABEL_WIDTH}
            onPress={remindable ? () => setPicker('reminder') : undefined}
          />
          <InputRow
            label="Notes"
            value={notes}
            onChangeText={setNotes}
            placeholder={NOTES_PLACEHOLDER[formKind]}
            multiline
            divider
          />
        </RowsCard>
        {!remindable ? (
          <RowsNote>Daily transactions are added automatically. No daily reminder is sent.</RowsNote>
        ) : asksCategory ? (
          <RowsNote>Each payment this adds is filed under its category.</RowsNote>
        ) : null}
      </View>

      <RowsCard>
        <ToggleRow
          title={income ? 'Add it automatically' : 'Autopay'}
          caption={
            income
              ? 'Finnri adds it on the day, then asks you to confirm it arrived.'
              : 'Finnri adds each payment for you, then asks you to confirm it.'
          }
          value={autopay}
          onValueChange={(enabled) => {
            setAutopay(enabled);
            if (!enabled) return;
            const next = usablePayment(accounts, paymentMode, accountID, modes);
            setPaymentMode(next.paymentMode);
            setAccountID(next.accountID);
          }}
        />
        {autopay && (
          <PaymentAccountPicker
            testID="recurring-autopay-account"
            accounts={accounts}
            accountID={accountID}
            paymentMode={paymentMode}
            onChange={(next) => {
              setPaymentMode(next.paymentMode);
              setAccountID(next.accountID);
            }}
            onAddAccount={onAddAccount}
            accountLabel={income ? 'Add to' : 'Pay from'}
            modeLabel={income ? 'Received via' : undefined}
            modes={modes}
            divider
          />
        )}
        {offersCancel ? (
          <ToggleRow
            title="Remind me to cancel"
            caption="For a trial or a plan you mean to stop. You’ll get a nudge before it renews."
            value={cancelBeforeDue}
            onValueChange={(enabled) => {
              setCancelBeforeDue(enabled);
              if (enabled && reminderDays === 0) setReminderDays(1);
            }}
            divider
          />
        ) : null}
        {cancelBeforeDue && (
          <DateRow
            label="Remind on"
            accessibilityLabel="Cancellation reminder date"
            value={cancelOnDate}
            placeholder="Choose date"
            onPress={openCancellationDatePicker}
            divider
          />
        )}
      </RowsCard>

      <PickerSheet
        visible={picker === 'category'}
        title={income ? 'Income category' : 'Spending category'}
        onClose={() => setPicker(null)}>
        <PickerOptionList
          accessibilityLabel={income ? 'Income category' : 'Spending category'}
          options={categories.map((option) => ({
            key: option,
            label: option,
            icon: categoryVisual(option, income ? 'income' : undefined).icon,
          }))}
          selectedKey={category}
          onSelect={(key) => {
            haptics.select();
            setCategory(key);
            setPicker(null);
          }}
        />
      </PickerSheet>
      <PickerSheet visible={picker === 'reminder'} title="Reminder" onClose={() => setPicker(null)}>
        <PickerOptionList
          accessibilityLabel="Reminder"
          options={reminderOptions.map((days) => ({ key: String(days), label: reminderLabel(days) }))}
          selectedKey={String(reminderDays)}
          onSelect={(key) => {
            haptics.select();
            setReminderDays(Number(key));
            setPicker(null);
          }}
        />
      </PickerSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  stack: {
    gap: 10,
  },
});
