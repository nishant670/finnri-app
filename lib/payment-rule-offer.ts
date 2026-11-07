import AsyncStorage from '@react-native-async-storage/async-storage';

import type { AppConfirmOptions } from '@/components/ui/AppDialogProvider';
import { savePaymentRule, type PaymentSpendKind } from './payment-rules';

/**
 * "Always use SBI BPCL for fuel?" — asked the second time the user moves an
 * expense of one kind onto the same account by hand, so a habit they keep
 * correcting the app towards becomes a rule after two corrections instead of
 * waiting for three in the history.
 *
 * Counts live on this device. "Not now" is final for that kind and account;
 * the card's page can still add the rule.
 */
const OFFER_KEY = 'finnri.paymentRuleOffer.v1';

/** Corrections towards one account before the question is asked. */
export const PAYMENT_RULE_OFFER_AFTER = 2;

type OfferState = Record<string, { count: number; dismissed?: boolean }>;

const readState = async (): Promise<OfferState> => {
  try {
    const raw = await AsyncStorage.getItem(OFFER_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    return parsed && typeof parsed === 'object' ? (parsed as OfferState) : {};
  } catch {
    return {};
  }
};

const writeState = async (state: OfferState) => {
  try {
    await AsyncStorage.setItem(OFFER_KEY, JSON.stringify(state));
  } catch {
    // A count that did not stick only means the question comes a save later.
  }
};

/**
 * Records one correction and, on the second, asks. Never throws: the expense
 * is already saved, and a rule that failed to save is not worth an error.
 */
export async function notePaymentCorrection({
  token,
  kind,
  accountId,
  accountName,
  confirm,
}: {
  token: string;
  kind: PaymentSpendKind;
  accountId: number;
  accountName: string;
  confirm: (options: AppConfirmOptions) => Promise<boolean>;
}): Promise<'asked-yes' | 'asked-no' | 'counted' | 'skipped'> {
  const key = `${kind.key}|${accountId}`;
  const state = await readState();
  const entry = state[key] ?? { count: 0 };
  if (entry.dismissed) return 'skipped';
  entry.count += 1;
  state[key] = entry;
  if (entry.count < PAYMENT_RULE_OFFER_AFTER) {
    await writeState(state);
    return 'counted';
  }
  const yes = await confirm({
    title: `Always use ${accountName} for ${kind.label}?`,
    message: `New ${kind.label} expenses will start on ${accountName}. You can still change it each time, and remove the rule from the account's page.`,
    confirmLabel: 'Always use',
    cancelLabel: 'Not now',
    iconName: 'credit-card-check-outline',
  });
  if (yes) {
    try {
      await savePaymentRule(token, accountId, kind.label);
      delete state[key];
    } catch {
      // Ask again next time rather than pretend it was saved.
      entry.count = PAYMENT_RULE_OFFER_AFTER - 1;
    }
  } else {
    entry.dismissed = true;
  }
  await writeState(state);
  return yes ? 'asked-yes' : 'asked-no';
}
