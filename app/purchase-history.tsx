import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppHeader } from '@/components/navigation/AppHeader';
import { ThemedText } from '@/components/themed-text';
import { SkeletonFrame, SkeletonRows } from '@/components/ui/Skeleton';
import { Card } from '@/components/ui/theme-primitives';
import { Fonts } from '@/constants/theme';
import { useAuthStore } from '@/hooks/use-auth-store';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import { getFriendlyErrorMessage } from '@/lib/api-error';
import { fetchBillingPayments, type BillingPayment } from '@/lib/billing';
import { describePayment, type PaymentBadgeTone } from '@/lib/purchase-history';

const intervalIcons: Record<string, keyof typeof MaterialCommunityIcons.glyphMap> = {
  weekly: 'calendar-week',
  monthly: 'creation',
  quarterly: 'calendar-range',
  yearly: 'calendar-star',
};

const badgeColors: Record<PaymentBadgeTone, { text: string; background: string }> = {
  positive: { text: '#17A978', background: 'rgba(23,169,120,0.12)' },
  accent: { text: '#2F80ED', background: 'rgba(47,128,237,0.12)' },
  neutral: { text: '#8A8486', background: 'rgba(138,132,134,0.14)' },
  negative: { text: '#D32F2F', background: 'rgba(211,47,47,0.10)' },
};

/**
 * Every pass bought, with when it ran and what it cost.
 *
 * Until this existed the app forgot a pass the day it ended: billing status
 * only describes what is running, so someone whose Weekly Pass had expired saw
 * nothing anywhere to say they had ever paid — and was left guessing.
 */
export default function PurchaseHistoryScreen() {
  const theme = useThemeTokens();
  const colors = theme.colors;
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
    <Pressable
      testID="purchase-history-support"
      accessibilityRole="button"
      onPress={() => router.push('/help-support')}
      style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1, alignSelf: 'center' })}>
      <ThemedText variant="captionStrong" style={{ color: colors.accent }}>
        Contact support
      </ThemedText>
    </Pressable>
  );

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: colors.background }}
      edges={['top', 'left', 'right']}>
      <AppHeader title="Purchase history" onBack={() => router.back()} />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 42 }}>
        <View style={{ paddingHorizontal: 24, gap: theme.spacing.lg }}>
          {isLoading && payments.length === 0 ? (
            <SkeletonFrame label="Loading purchases" testID="purchase-history-skeleton">
              <SkeletonRows count={3} showAmount lines={2} />
            </SkeletonFrame>
          ) : error ? (
            <Card compact style={{ padding: theme.spacing.lg, gap: theme.spacing.sm }}>
              <ThemedText style={{ color: colors.text }}>{error}</ThemedText>
              <Pressable
                accessibilityRole="button"
                onPress={() => void loadPayments()}
                style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
                <ThemedText variant="captionStrong" style={{ color: colors.accent }}>
                  Try again
                </ThemedText>
              </Pressable>
            </Card>
          ) : payments.length === 0 ? (
            <Card
              compact
              style={{ padding: theme.spacing.xl, alignItems: 'center', gap: theme.spacing.sm }}>
              <MaterialCommunityIcons name="receipt-text-outline" size={30} color={colors.accent} />
              <ThemedText
                style={{ fontFamily: Fonts.title, fontWeight: '800', color: colors.text }}>
                No purchases yet
              </ThemedText>
              <ThemedText style={{ textAlign: 'center', color: `${colors.text}99` }}>
                Passes you buy appear here with their dates and payment references.
              </ThemedText>
              {/* The one person who reaches this state needing help is someone
                  who paid and sees nothing, so the way to it is right here. */}
              <ThemedText
                variant="caption"
                style={{ textAlign: 'center', color: `${colors.text}99`, marginTop: 8 }}>
                Paid but don’t see it? Send us your Razorpay receipt and we’ll sort it out.
              </ThemedText>
              {supportLink}
            </Card>
          ) : (
            <>
              {payments.map((payment) => (
                <PaymentCard key={payment.id} payment={payment} />
              ))}
              <View style={{ gap: theme.spacing.xs, paddingTop: theme.spacing.sm }}>
                <ThemedText
                  variant="caption"
                  style={{ textAlign: 'center', color: `${colors.text}99` }}>
                  Questions about a payment? Quote its reference to support.
                </ThemedText>
                {supportLink}
              </View>
            </>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function PaymentCard({ payment }: { payment: BillingPayment }) {
  const theme = useThemeTokens();
  const colors = theme.colors;
  const row = describePayment(payment);
  const badge = badgeColors[row.badge.tone];
  return (
    <Card compact style={{ padding: theme.spacing.lg, gap: theme.spacing.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}>
        <View
          style={{
            height: 40,
            width: 40,
            borderRadius: 20,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: colors.secondary,
          }}>
          <MaterialCommunityIcons
            name={intervalIcons[payment.billing_interval] ?? 'creation'}
            size={19}
            color={colors.accent}
          />
        </View>
        <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
          <ThemedText
            numberOfLines={1}
            style={{ fontFamily: Fonts.title, fontWeight: '800', color: colors.text }}>
            {row.title}
          </ThemedText>
          <View
            style={{
              alignSelf: 'flex-start',
              borderRadius: 999,
              paddingHorizontal: 8,
              paddingVertical: 2,
              backgroundColor: badge.background,
            }}>
            <ThemedText variant="micro" style={{ color: badge.text, fontWeight: '800' }}>
              {row.badge.label}
            </ThemedText>
          </View>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <ThemedText style={{ fontFamily: Fonts.title, fontWeight: '800', color: colors.text }}>
            {row.amount}
          </ThemedText>
          {row.originalAmount ? (
            <ThemedText
              variant="micro"
              style={{ color: `${colors.text}88`, textDecorationLine: 'line-through' }}>
              {row.originalAmount}
            </ThemedText>
          ) : null}
        </View>
      </View>

      <View style={{ gap: 2, paddingLeft: 40 + theme.spacing.md }}>
        {row.offerLabel ? (
          <ThemedText variant="caption" style={{ color: colors.accent }}>
            {row.offerLabel}
          </ThemedText>
        ) : null}
        {row.details.map((line) => (
          <ThemedText key={line} variant="caption" style={{ color: `${colors.text}99` }}>
            {line}
          </ThemedText>
        ))}
        {row.reference ? (
          <ThemedText selectable variant="micro" style={{ color: `${colors.text}77` }}>
            Ref {row.reference}
          </ThemedText>
        ) : null}
      </View>
    </Card>
  );
}
