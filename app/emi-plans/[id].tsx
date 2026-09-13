import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { cssInterop } from 'nativewind';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { StateView } from '@/components/ui/StateView';
import { ThemedConfirmDialog, ThemedDeleteDialog } from '@/components/ui/ThemedConfirmDialog';
import { Fonts } from '@/constants/theme';
import { useAuthStore } from '@/hooks/use-auth-store';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import { getFriendlyErrorMessage } from '@/lib/api-error';
import {
  EMIInstallment,
  EMIPlan,
  deleteEMIPlan,
  emiInstallmentStatusLabels,
  fetchEMIPlan,
  forecloseEMIPlan,
  isNoCostEMI,
} from '@/lib/emi-plans';
import { formatMoney } from '@/lib/money';
import { calendarDay } from '@/lib/statement-dates';

const TText = cssInterop(ThemedText, { className: 'style' });

const formatDay = (value: string) => {
  const parsed = new Date(`${calendarDay(value)}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
};

/**
 * One EMI plan and its full schedule.
 *
 * The schedule is shown month by month with the principal/interest split
 * visible, because on an interest-bearing plan those two numbers explain
 * something the monthly figure alone cannot: why the limit comes back more
 * slowly than the instalment suggests.
 */
export default function EMIPlanDetailScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const planId = Number(id);
  const themeTokens = useThemeTokens();
  const theme = themeTokens.colors;
  const { token } = useAuthStore();

  const [plan, setPlan] = useState<EMIPlan | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [isForecloseVisible, setIsForecloseVisible] = useState(false);
  const [isDeleteVisible, setIsDeleteVisible] = useState(false);

  const load = useCallback(async () => {
    if (!token || !Number.isFinite(planId) || planId <= 0) {
      setIsLoading(false);
      setError('Plan not found.');
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      setPlan(await fetchEMIPlan(token, planId));
    } catch (loadError) {
      setError(getFriendlyErrorMessage(loadError, 'Unable to load this EMI plan.'));
    } finally {
      setIsLoading(false);
    }
  }, [planId, token]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const handleForeclose = async () => {
    if (!token || !plan) return;
    setIsPending(true);
    try {
      setPlan(await forecloseEMIPlan(token, plan.id));
      setIsForecloseVisible(false);
    } catch (forecloseError) {
      setError(getFriendlyErrorMessage(forecloseError, 'Unable to foreclose this plan.'));
    } finally {
      setIsPending(false);
    }
  };

  const handleDelete = async () => {
    if (!token || !plan) return;
    setIsPending(true);
    try {
      await deleteEMIPlan(token, plan.id);
      router.back();
    } catch (deleteError) {
      setError(getFriendlyErrorMessage(deleteError, 'Unable to delete this plan.'));
      setIsPending(false);
    }
  };

  if (!plan) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }}>
        <View className="flex-1 justify-center">
          {isLoading ? null : (
            <StateView
              icon="calendar-sync-outline"
              title="Plan did not load"
              message={error ?? 'This EMI plan could not be found.'}
              actionLabel="Try again"
              onAction={() => void load()}
            />
          )}
        </View>
      </SafeAreaView>
    );
  }

  const { progress } = plan;
  const active = plan.status === 'active';

  return (
    <SafeAreaView className="flex-1" edges={['top', 'left', 'right']}>
      <View className="flex-1" style={{ backgroundColor: theme.background }}>
        <View className="flex-row items-center justify-between px-6 pb-4 pt-3">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Go back"
            onPress={() => router.back()}
            className="h-11 w-11 items-center justify-center rounded-full"
            style={{ backgroundColor: theme.card }}>
            <MaterialCommunityIcons name="chevron-left" size={28} color={theme.text} />
          </Pressable>
          <TText
            className="text-sm uppercase"
            style={{ fontFamily: Fonts.title, color: theme.text, letterSpacing: 1.2 }}>
            EMI Plan
          </TText>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Delete plan"
            onPress={() => setIsDeleteVisible(true)}
            className="h-11 w-11 items-center justify-center rounded-full"
            style={{ backgroundColor: theme.card }}>
            <MaterialCommunityIcons name="dots-horizontal" size={22} color={theme.text} />
          </Pressable>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 80 }}>
          {error && <ErrorBanner message={error} style={{ marginBottom: 16 }} />}

          <View
            className="rounded-[28px] border px-5 py-6"
            style={{ backgroundColor: theme.card, borderColor: theme.border }}>
            <TText
              className="text-xl"
              numberOfLines={2}
              style={{ fontFamily: Fonts.title, color: theme.text }}>
              {plan.title}
            </TText>
            <TText className="mt-1 text-xs" style={{ fontFamily: Fonts.body, color: '#7C8EA8' }}>
              {formatMoney(plan.principal)} over {plan.tenure_months} months
              {isNoCostEMI(plan) ? ' · No cost EMI' : ` · ${plan.annual_rate_pct}% p.a.`}
            </TText>

            <TText
              className="mt-5 text-xs uppercase"
              style={{ fontFamily: Fonts.title, color: '#8EA0B8', letterSpacing: 1.3 }}>
              Monthly instalment
            </TText>
            <TText
              className="mt-1 text-[32px]"
              numberOfLines={1}
              adjustsFontSizeToFit
              style={{ fontFamily: Fonts.title, color: theme.text }}>
              {formatMoney(plan.monthly_amount)}
            </TText>

            <View className="mt-5 flex-row flex-wrap gap-x-6 gap-y-3">
              <MetaItem
                label="Paid"
                value={`${progress.installments_paid} of ${progress.installments_total}`}
              />
              <MetaItem label="Left to repay" value={formatMoney(progress.principal_remaining)} />
              {progress.next_due_date && (
                <MetaItem label="Next" value={formatDay(progress.next_due_date)} />
              )}
              {plan.total_interest > 0 && (
                <MetaItem label="Total interest" value={formatMoney(plan.total_interest)} />
              )}
            </View>

            {/* The purple arc on the card's ring, explained. */}
            {progress.blocked_principal > 0 && (
              <View className="mt-5 flex-row items-start gap-2">
                <View
                  className="mt-1 h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: '#8B5CF6' }}
                />
                <TText
                  className="min-w-0 flex-1 text-xs"
                  style={{ fontFamily: Fonts.body, color: '#7C8EA8' }}>
                  {formatMoney(progress.blocked_principal)} of your credit limit is held for
                  instalments not yet billed. It comes back as each one is paid.
                </TText>
              </View>
            )}

            {!active && (
              <View
                className="mt-5 self-start rounded-full px-3 py-1.5"
                style={{ backgroundColor: theme.secondary }}>
                <TText className="text-xs" style={{ fontFamily: Fonts.title, color: '#64748B' }}>
                  {plan.status === 'foreclosed' ? 'Foreclosed' : 'Completed'}
                </TText>
              </View>
            )}

            {active && (
              <Pressable
                accessibilityRole="button"
                onPress={() => setIsForecloseVisible(true)}
                className="mt-5 h-12 items-center justify-center rounded-full border"
                style={{ borderColor: theme.border }}>
                <TText className="text-sm" style={{ fontFamily: Fonts.title, color: theme.text }}>
                  Foreclose plan
                </TText>
              </Pressable>
            )}
          </View>

          <TText className="mt-8 text-lg" style={{ fontFamily: Fonts.title, color: theme.text }}>
            Schedule
          </TText>

          <View className="mt-4 gap-2">
            {(plan.installments ?? []).map((installment) => (
              <InstallmentRow
                key={installment.id}
                installment={installment}
                showSplit={!isNoCostEMI(plan)}
              />
            ))}
          </View>
        </ScrollView>

        <ThemedConfirmDialog
          visible={isForecloseVisible}
          title="Foreclose this plan?"
          message="Every instalment still to come is cancelled, and the credit limit it was holding comes back at once. Instalments already on a bill stay."
          confirmLabel="Foreclose"
          loading={isPending}
          onCancel={() => setIsForecloseVisible(false)}
          onConfirm={() => void handleForeclose()}
        />

        <ThemedDeleteDialog
          visible={isDeleteVisible}
          title={`Delete ${plan.title}?`}
          message="The plan and the instalment transactions it created are removed. Transactions you added yourself are kept."
          confirmLabel="Delete"
          loading={isPending}
          onCancel={() => setIsDeleteVisible(false)}
          onConfirm={() => void handleDelete()}
        />
      </View>
    </SafeAreaView>
  );
}

function InstallmentRow({
  installment,
  showSplit,
}: {
  installment: EMIInstallment;
  showSplit: boolean;
}) {
  const themeTokens = useThemeTokens();
  const theme = themeTokens.colors;
  const light = themeTokens.mode === 'light';

  const paid = installment.status === 'paid';
  const billed = installment.status === 'billed';

  return (
    <View
      className="flex-row items-center justify-between rounded-[20px] border px-4 py-3"
      style={{ backgroundColor: theme.card, borderColor: theme.border }}>
      <View className="min-w-0 flex-1">
        <TText className="text-sm" style={{ fontFamily: Fonts.title, color: theme.text }}>
          {formatMoney(installment.amount)}
        </TText>
        <TText className="mt-0.5 text-[11px]" style={{ fontFamily: Fonts.body, color: '#7C8EA8' }}>
          {formatDay(installment.due_date)}
          {/* Only the principal releases limit, so on an interest-bearing plan
              the split is the difference between what is paid and what comes
              back. */}
          {showSplit
            ? ` · ${formatMoney(installment.principal_part)} principal + ${formatMoney(
                installment.interest_part
              )} interest`
            : ''}
        </TText>
      </View>
      <View
        className="rounded-full px-2.5 py-1"
        style={{
          backgroundColor: paid
            ? 'rgba(22,163,74,0.12)'
            : billed
              ? 'rgba(139,92,246,0.14)'
              : light
                ? '#F1F5F9'
                : '#243142',
        }}>
        <TText
          className="text-[11px]"
          style={{
            fontFamily: Fonts.title,
            color: paid ? '#16A34A' : billed ? '#8B5CF6' : '#64748B',
          }}>
          {emiInstallmentStatusLabels[installment.status]}
        </TText>
      </View>
    </View>
  );
}

function MetaItem({ label, value }: { label: string; value: string }) {
  const theme = useThemeTokens().colors;
  return (
    <View>
      <TText
        className="text-[10px] uppercase"
        style={{ fontFamily: Fonts.title, color: '#8EA0B8', letterSpacing: 1 }}>
        {label}
      </TText>
      <TText className="mt-1 text-sm" style={{ fontFamily: Fonts.title, color: theme.text }}>
        {value}
      </TText>
    </View>
  );
}
