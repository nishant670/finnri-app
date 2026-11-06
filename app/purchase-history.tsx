import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Platform, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ScreenHeader } from '@/components/navigation/ScreenHeader';
import { NeutralTile } from '@/components/profile/SettingsRow';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/Button';
import { PressableView } from '@/components/ui/PressableView';
import { SkeletonFrame, SkeletonRows } from '@/components/ui/Skeleton';
import { useAuthStore } from '@/hooks/use-auth-store';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import { getFriendlyErrorMessage } from '@/lib/api-error';
import { fetchBillingPayments, type BillingPayment } from '@/lib/billing';
import { describePayment, type PaymentBadgeTone } from '@/lib/purchase-history';

const intervalIcons: Record<string, keyof typeof MaterialCommunityIcons.glyphMap> = {
  weekly: 'calendar-week',
  monthly: 'calendar-month-outline',
  quarterly: 'calendar-range',
  yearly: 'calendar-star',
};

/** "October 2026", the month heading a purchase sits under. */
const monthTitle = (value?: string | null) => {
  const parsed = value ? new Date(value) : null;
  if (!parsed || Number.isNaN(parsed.getTime())) return 'Earlier';
  return parsed.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
};

/**
 * Every pass bought, with when it ran and what it cost.
 *
 * Until this existed the app forgot a pass the day it ended: billing status
 * only describes what is running, so someone whose Weekly Pass had expired saw
 * nothing anywhere to say they had ever paid — and was left guessing.
 */
export default function PurchaseHistoryScreen() {
  const { colors } = useThemeTokens();
  const router = useRouter();
  const { token } = useAuthStore();
  const [payments, setPayments] = useState<BillingPayment[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadPayments = useCallback(async () => {
    if (!token) return;
    setIsLoading(true);
    setError(null);
    try {
      setPayments(await fetchBillingPayments(token));
    } catch (err) {
      setError(getFriendlyErrorMessage(err, 'Unable to load your purchases right now.'));
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  useFocusEffect(
    useCallback(() => {
      void loadPayments();
    }, [loadPayments])
  );

  const supportLink = (
    <PressableView
      testID="purchase-history-support"
      accessibilityRole="button"
      onPress={() => router.push('/help-support')}
      style={styles.support}
      pressedStyle={styles.pressed}>
      <ThemedText style={[styles.supportLabel, { color: colors.text }]}>Contact support</ThemedText>
      <MaterialCommunityIcons name="chevron-right" size={16} color={colors.text} />
    </PressableView>
  );

  const months: { title: string; payments: BillingPayment[] }[] = [];
  payments.forEach((payment) => {
    const title = monthTitle(payment.captured_at ?? payment.created_at);
    const last = months[months.length - 1];
    if (last && last.title === title) last.payments.push(payment);
    else months.push({ title, payments: [payment] });
  });

  return (
    <SafeAreaView style={[styles.flex, { backgroundColor: colors.background }]} edges={['top', 'left', 'right', 'bottom']}>
      <ScreenHeader title="Purchase history" onBack={() => router.back()} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        {isLoading && payments.length === 0 ? (
          <SkeletonFrame label="Loading purchases" testID="purchase-history-skeleton">
            <SkeletonRows count={3} showAmount lines={2} />
          </SkeletonFrame>
        ) : error ? (
          <View style={[styles.card, styles.message, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <ThemedText style={[styles.body, { color: colors.text }]}>{error}</ThemedText>
            <Button variant="outline" height={40} label="Try again" onPress={() => void loadPayments()} style={styles.retry} />
          </View>
        ) : payments.length === 0 ? (
          <View style={[styles.card, styles.message, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <NeutralTile icon="receipt-text-outline" />
            <ThemedText style={[styles.emptyTitle, { color: colors.text }]}>No purchases yet</ThemedText>
            <ThemedText tone="muted" style={[styles.body, styles.center]}>
              Passes you buy appear here with their dates and payment references.
            </ThemedText>
            {/* The one person who reaches this state needing help is someone
                who paid and sees nothing, so the way to it is right here. */}
            <ThemedText tone="muted" style={[styles.small, styles.center]}>
              Paid but don’t see it? Send us your Razorpay receipt and we’ll sort it out.
            </ThemedText>
            {supportLink}
          </View>
        ) : (
          <>
            {months.map((month) => (
              <View key={month.title}>
                <ThemedText tone="muted" style={styles.monthTitle}>
                  {month.title}
                </ThemedText>
                <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  {month.payments.map((payment, index) => (
                    <PaymentRow key={payment.id} payment={payment} divider={index > 0} />
                  ))}
                </View>
              </View>
            ))}
            <ThemedText tone="muted" style={[styles.body, styles.center, styles.footnote]}>
              Questions about a payment? Quote its reference to support.
            </ThemedText>
            {supportLink}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function PaymentRow({ payment, divider }: { payment: BillingPayment; divider: boolean }) {
  const { colors } = useThemeTokens();
  const row = describePayment(payment);
  const badgeColor: Record<PaymentBadgeTone, string> = {
    positive: colors.positive,
    accent: colors.text,
    neutral: colors.muted,
    negative: colors.negative,
  };
  return (
    <View style={[styles.payment, divider && { borderTopWidth: 1, borderTopColor: colors.border }]}>
      <NeutralTile icon={intervalIcons[payment.billing_interval] ?? 'creation'} size={40} />
      <View style={styles.paymentText}>
        <View style={styles.paymentHead}>
          <View style={styles.paymentTitleBlock}>
            <ThemedText numberOfLines={1} style={[styles.paymentTitle, { color: colors.text }]}>
              {row.title}
            </ThemedText>
            {row.offerLabel ? (
              <ThemedText tone="muted" style={styles.small}>
                {row.offerLabel}
              </ThemedText>
            ) : null}
          </View>
          <View style={styles.paymentAmount}>
            <View style={styles.priceLine}>
              {row.originalAmount ? (
                <ThemedText tone="muted" style={[styles.small, styles.struck]}>
                  {row.originalAmount}
                </ThemedText>
              ) : null}
              <ThemedText style={[styles.price, { color: colors.text }]}>{row.amount}</ThemedText>
            </View>
            <ThemedText style={[styles.small, styles.badge, { color: badgeColor[row.badge.tone] }]}>
              {row.badge.label}
            </ThemedText>
          </View>
        </View>
        {row.details.map((line) => (
          <ThemedText key={line} tone="muted" style={styles.body}>
            {line}
          </ThemedText>
        ))}
        {row.reference ? (
          <ThemedText selectable tone="muted" style={styles.reference}>
            Ref {row.reference}
          </ThemedText>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  content: {
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 40,
  },
  card: {
    borderWidth: 1,
    borderRadius: 16,
    overflow: 'hidden',
  },
  monthTitle: {
    marginBottom: 8,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
  },
  payment: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    padding: 14,
  },
  paymentText: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  paymentHead: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  paymentTitleBlock: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  paymentTitle: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '500',
  },
  paymentAmount: {
    alignItems: 'flex-end',
    gap: 2,
  },
  priceLine: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
  },
  price: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  struck: {
    textDecorationLine: 'line-through',
  },
  badge: {
    fontWeight: '600',
  },
  body: {
    fontSize: 13,
    lineHeight: 18,
  },
  small: {
    fontSize: 12,
    lineHeight: 16,
  },
  reference: {
    marginTop: 2,
    fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }),
    fontSize: 11,
    lineHeight: 14,
  },
  center: {
    textAlign: 'center',
  },
  footnote: {
    marginTop: 8,
  },
  message: {
    alignItems: 'center',
    gap: 8,
    padding: 20,
  },
  emptyTitle: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '700',
  },
  retry: {
    paddingHorizontal: 16,
  },
  support: {
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    gap: 2,
    paddingHorizontal: 8,
  },
  supportLabel: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600',
  },
  pressed: {
    opacity: 0.6,
  },
});
