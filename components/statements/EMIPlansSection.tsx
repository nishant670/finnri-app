import { MaterialCommunityIcons } from '@expo/vector-icons';
import { cssInterop } from 'nativewind';
import { Pressable, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { PressableView } from '@/components/ui/PressableView';
import { Fonts } from '@/constants/theme';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import { formatMoney } from '@/lib/money';
import { EMIPlan, formatEMIProgress, isNoCostEMI } from '@/lib/emi-plans';
import { calendarDay } from '@/lib/statement-dates';

const TText = cssInterop(ThemedText, { className: 'style' });

const formatDay = (value?: string) => {
  if (!value) return '';
  const parsed = new Date(`${calendarDay(value)}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
};

/**
 * The EMI plans holding part of this card's limit.
 *
 * The number this section exists to explain is the purple arc on the limit
 * ring. A user who cannot spend up to their limit is owed a straight answer
 * about what is in the way, and "₹55,000 is held for 11 remaining instalments"
 * is that answer.
 */
export function EMIPlansSection({
  plans,
  blockedPrincipal,
  onAdd,
  onOpenPlan,
}: {
  plans: EMIPlan[];
  blockedPrincipal: number;
  onAdd: () => void;
  onOpenPlan: (plan: EMIPlan) => void;
}) {
  const themeTokens = useThemeTokens();
  const theme = themeTokens.colors;

  const active = plans.filter((plan) => plan.status === 'active');

  return (
    <View>
      {/* Board R5-AcctCard: the section title with an outlined Add. */}
      <View className="mb-2 mt-6 min-h-8 flex-row items-center justify-between">
        <TText accessibilityRole="header" style={{ fontSize: 15, lineHeight: 20, fontWeight: '700', color: theme.text }}>
          EMI plans
        </TText>
        <PressableView
          accessibilityRole="button"
          accessibilityLabel="Add EMI plan"
          onPress={onAdd}
          style={{
            height: 32,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 4,
            paddingLeft: 8,
            paddingRight: 12,
            borderWidth: 1,
            borderRadius: 16,
            backgroundColor: theme.card,
            borderColor: theme.borderStrong,
          }}
          pressedStyle={{ opacity: 0.7 }}>
          <MaterialCommunityIcons name="plus" size={16} color={theme.text} />
          <TText style={{ fontSize: 13, lineHeight: 18, fontWeight: '600', color: theme.text }}>Add</TText>
        </PressableView>
      </View>

      {active.length === 0 ? (
        <TText style={{ fontSize: 13, lineHeight: 18, color: theme.muted }}>
          None yet. Split a big purchase into instalments and Finnri shows how much of your limit
          it holds.
        </TText>
      ) : (
        <>
          {blockedPrincipal > 0 && (
            <View className="flex-row items-center gap-2">
              <View className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: '#8B5CF6' }} />
              <TText className="text-xs" style={{ fontFamily: Fonts.body, color: theme.muted }}>
                {formatMoney(blockedPrincipal)} of your limit is held for instalments still to be
                billed
              </TText>
            </View>
          )}

          <View className="mt-3 gap-2">
            {active.map((plan) => (
              <EMIPlanRow key={plan.id} plan={plan} onPress={() => onOpenPlan(plan)} />
            ))}
          </View>
        </>
      )}
    </View>
  );
}

function EMIPlanRow({ plan, onPress }: { plan: EMIPlan; onPress: () => void }) {
  const theme = useThemeTokens().colors;
  const { progress } = plan;

  const paidFraction =
    progress.installments_total > 0
      ? progress.installments_paid / progress.installments_total
      : 0;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`EMI plan for ${plan.title}`}
      onPress={onPress}
      className="rounded-2xl border px-4 py-4"
      style={{ backgroundColor: theme.card, borderColor: theme.border }}>
      <View className="flex-row items-start justify-between gap-3">
        <View className="min-w-0 flex-1">
          <TText
            className="text-base"
            numberOfLines={1}
            style={{ fontFamily: Fonts.title, color: theme.text }}>
            {plan.title}
          </TText>
          <TText
            className="mt-1 text-xs"
            numberOfLines={1}
            style={{ fontFamily: Fonts.body, color: theme.muted }}>
            {formatMoney(plan.monthly_amount)}/mo · {formatEMIProgress(progress)}
            {isNoCostEMI(plan) ? ' · No cost' : ` · ${plan.annual_rate_pct}%`}
          </TText>
        </View>
        <MaterialCommunityIcons name="chevron-right" size={20} color={theme.muted} />
      </View>

      <View
        className="mt-3 h-1.5 overflow-hidden rounded-full"
        style={{ backgroundColor: theme.secondary }}
        accessibilityRole="progressbar"
        accessibilityValue={{ min: 0, max: 100, now: Math.round(paidFraction * 100) }}>
        <View
          className="h-full rounded-full"
          style={{
            width: `${Math.max(3, paidFraction * 100)}%`,
            backgroundColor: '#8B5CF6',
          }}
        />
      </View>

      <View className="mt-3 flex-row items-center justify-between">
        <TText className="text-[11px]" style={{ fontFamily: Fonts.body, color: theme.muted }}>
          {formatMoney(progress.principal_remaining)} left of {formatMoney(plan.principal)}
        </TText>
        {progress.next_due_date && (
          <TText className="text-[11px]" style={{ fontFamily: Fonts.body, color: theme.muted }}>
            Next {formatDay(progress.next_due_date)}
          </TText>
        )}
      </View>
    </Pressable>
  );
}
