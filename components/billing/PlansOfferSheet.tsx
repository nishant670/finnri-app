import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Dimensions, Pressable, ScrollView, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { AnimatedBottomSheet } from '@/components/ui/AnimatedBottomSheet';
import { Fonts } from '@/constants/theme';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import {
  formatMinor,
  formatPlanPrice,
  planOffer,
  type BillingPlan,
  type BillingStatus,
} from '@/lib/billing';
import { haptics } from '@/lib/haptics';
import type { PlansPromptReason } from '@/lib/plans-prompt';

const ACCENTS: Record<string, string> = {
  weekly: '#FF8865',
  monthly: '#17A978',
  quarterly: '#2F80ED',
  yearly: '#8B5CF6',
};

const PERIOD: Record<string, string> = {
  weekly: 'week',
  monthly: 'month',
  quarterly: '3 months',
  yearly: 'year',
};

const DAYS: Record<string, number> = { weekly: 7, monthly: 30, quarterly: 90, yearly: 365 };

const CARD_GAP = 12;

/** What a plan costs a day, the figure that makes ₹37 a month concrete. */
const perDay = (minor: number, interval: string) => {
  const days = DAYS[interval];
  if (!days) return null;
  const rupees = minor / 100 / days;
  return rupees < 10 ? `₹${rupees.toFixed(2).replace(/\.00$/, '')}` : `₹${Math.round(rupees)}`;
};

const count = (value: number) => new Intl.NumberFormat('en-IN').format(value);

/**
 * The plans pop-up on Home: every pass side by side, monthly first in view.
 *
 * It opens only when Home decides the moment is right (see lib/plans-prompt),
 * and it never takes a payment itself — choosing a plan hands off to the
 * Plans screen, whose checkout already handles the browser, the wait and the
 * "your bank is still confirming" case.
 */
export function PlansOfferSheet({
  visible,
  plans,
  status,
  reason,
  onChoose,
  onClose,
}: {
  visible: boolean;
  plans: BillingPlan[];
  status: BillingStatus | null;
  reason: PlansPromptReason;
  onChoose: (plan: BillingPlan) => void;
  onClose: () => void;
}) {
  const theme = useThemeTokens();
  const colors = theme.colors;
  const muted = `${colors.text}99`;
  const scrollRef = useRef<ScrollView>(null);
  const cardWidth = Math.min(260, Math.round(Dimensions.get('window').width * 0.66));

  const purchasable = useMemo(
    () =>
      plans.filter(
        (plan) =>
          plan.billing_interval !== 'lifetime_quote' &&
          plan.checkout_enabled &&
          (plan.price_minor ?? 0) > 0
      ),
    [plans]
  );
  const smartPick =
    purchasable.find((plan) => plan.billing_interval === 'monthly') ?? purchasable[0] ?? null;
  const [selected, setSelected] = useState<string | null>(smartPick?.code ?? null);
  const chosen = purchasable.find((plan) => plan.code === selected) ?? smartPick;
  const anyOffer = purchasable.some((plan) => planOffer(plan, status));
  const spotsLeft = status?.launch_offer?.spots_left ?? null;
  const percentOff =
    status?.launch_offer?.percent_off ?? purchasable.find((p) => p.offer)?.offer?.percent_off;

  // Open on the smart pick: the row starts scrolled so monthly sits in view
  // with the weekly pass peeking at the left edge.
  useEffect(() => {
    if (!visible || !smartPick) return;
    setSelected(smartPick.code);
    const index = purchasable.indexOf(smartPick);
    const timer = setTimeout(() => {
      scrollRef.current?.scrollTo({
        x: Math.max(0, index * (cardWidth + CARD_GAP) - 24),
        animated: false,
      });
    }, 0);
    return () => clearTimeout(timer);
  }, [cardWidth, purchasable, smartPick, visible]);

  if (!chosen) return null;
  const chosenOffer = planOffer(chosen, status);
  const chosenPrice = chosenOffer
    ? formatMinor(chosenOffer.price_minor, chosen.currency)
    : formatPlanPrice(chosen);

  return (
    <AnimatedBottomSheet
      visible={visible}
      onClose={onClose}
      sheetStyle={{
        backgroundColor: colors.card,
        borderTopLeftRadius: 32,
        borderTopRightRadius: 32,
        paddingTop: 22,
        paddingBottom: 28,
      }}>
      <View testID="plans-offer-sheet" style={{ paddingHorizontal: 24 }}>
        <View
          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          {anyOffer && percentOff ? (
            <View
              testID="plans-offer-badge"
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                paddingHorizontal: 10,
                paddingVertical: 5,
                borderRadius: 999,
                backgroundColor: '#E5484D',
              }}>
              <MaterialCommunityIcons name="rocket-launch" size={13} color="#FFFFFF" />
              <ThemedText
                style={{ color: '#FFFFFF', fontSize: 11, fontWeight: '900', letterSpacing: 0.6 }}>
                LAUNCH OFFER · {percentOff}% OFF
              </ThemedText>
            </View>
          ) : (
            <View />
          )}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close"
            hitSlop={12}
            onPress={onClose}
            style={{
              height: 32,
              width: 32,
              borderRadius: 16,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: colors.secondary,
            }}>
            <MaterialCommunityIcons name="close" size={18} color={colors.text} />
          </Pressable>
        </View>

        <ThemedText
          style={{
            marginTop: 14,
            color: colors.text,
            fontFamily: Fonts.title,
            fontSize: 22,
            fontWeight: '900',
          }}>
          {reason === 'low_credits' ? 'Running low on AI credits' : 'Let Finnri AI do the typing'}
        </ThemedText>
        <ThemedText style={{ marginTop: 4, color: muted }}>
          {reason === 'low_credits'
            ? 'Top up so your next voice or text capture goes straight through.'
            : 'Speak or type an expense once — Finnri files the amount, category and account.'}
          {anyOffer ? ' Launch prices for a limited time.' : ''}
        </ThemedText>
        {anyOffer && spotsLeft != null ? (
          <ThemedText style={{ marginTop: 6, color: '#E5484D', fontWeight: '800', fontSize: 12 }}>
            Only {spotsLeft} launch spot{spotsLeft === 1 ? '' : 's'} left
          </ThemedText>
        ) : null}
      </View>

      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        snapToInterval={cardWidth + CARD_GAP}
        decelerationRate="fast"
        contentContainerStyle={{ paddingHorizontal: 24, paddingVertical: 18, gap: CARD_GAP }}>
        {purchasable.map((plan) => {
          const offer = planOffer(plan, status);
          const accent = ACCENTS[plan.billing_interval] ?? colors.accent;
          const isSelected = plan.code === chosen.code;
          const isSmartPick = plan.code === smartPick?.code;
          const priceMinor = offer?.price_minor ?? plan.price_minor ?? 0;
          const daily = perDay(priceMinor, plan.billing_interval);
          return (
            <Pressable
              key={plan.code}
              testID={`plans-offer-card-${plan.code}`}
              accessibilityRole="radio"
              accessibilityState={{ selected: isSelected }}
              accessibilityLabel={`${plan.name}, ${offer ? formatMinor(offer.price_minor) : formatPlanPrice(plan)}`}
              onPress={() => {
                haptics.select();
                setSelected(plan.code);
              }}
              style={{
                width: cardWidth,
                borderRadius: 26,
                borderWidth: isSelected ? 2 : 1,
                borderColor: isSelected ? accent : colors.border,
                backgroundColor: isSelected ? `${accent}12` : colors.background,
                padding: 18,
                gap: 10,
              }}>
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}>
                <ThemedText
                  style={{
                    color: colors.text,
                    fontFamily: Fonts.title,
                    fontSize: 17,
                    fontWeight: '900',
                  }}>
                  {plan.name}
                </ThemedText>
                {isSmartPick ? (
                  <View
                    style={{
                      paddingHorizontal: 8,
                      paddingVertical: 3,
                      borderRadius: 999,
                      backgroundColor: accent,
                    }}>
                    <ThemedText style={{ color: '#FFFFFF', fontSize: 10, fontWeight: '900' }}>
                      MOST POPULAR
                    </ThemedText>
                  </View>
                ) : null}
              </View>

              <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}>
                <ThemedText
                  style={{
                    color: colors.text,
                    fontFamily: Fonts.title,
                    fontSize: 30,
                    fontWeight: '900',
                    lineHeight: 36,
                  }}>
                  {offer ? formatMinor(offer.price_minor, plan.currency) : formatPlanPrice(plan)}
                </ThemedText>
                {offer ? (
                  <ThemedText
                    style={{
                      marginBottom: 6,
                      color: muted,
                      textDecorationLine: 'line-through',
                      fontWeight: '700',
                    }}>
                    {formatMinor(offer.original_price_minor, plan.currency)}
                  </ThemedText>
                ) : null}
              </View>
              <ThemedText style={{ color: muted, fontSize: 12, marginTop: -6 }}>
                per {PERIOD[plan.billing_interval] ?? plan.billing_interval}
                {daily ? ` · ${daily}/day` : ''}
              </ThemedText>

              <View style={{ height: 1, backgroundColor: colors.border, marginVertical: 2 }} />
              <PlanLine
                icon="creation-outline"
                color={accent}
                label={`${count(plan.included_credits)} AI credits`}
              />
              {plan.daily_credit_limit > 0 ? (
                <PlanLine
                  icon="speedometer"
                  color={accent}
                  label={`Up to ${count(plan.daily_credit_limit)} a day`}
                />
              ) : null}
              <PlanLine
                icon="microphone-outline"
                color={accent}
                label="Voice, text and receipt capture"
              />
            </Pressable>
          );
        })}
      </ScrollView>

      <View style={{ paddingHorizontal: 24, gap: 10 }}>
        <Pressable
          testID="plans-offer-cta"
          accessibilityRole="button"
          onPress={() => {
            haptics.select();
            onChoose(chosen);
          }}
          style={{
            minHeight: 54,
            borderRadius: 20,
            alignItems: 'center',
            justifyContent: 'center',
            flexDirection: 'row',
            gap: 8,
            backgroundColor: ACCENTS[chosen.billing_interval] ?? colors.accent,
          }}>
          <ThemedText
            style={{ color: '#FFFFFF', fontFamily: Fonts.title, fontSize: 16, fontWeight: '900' }}>
            Get {chosen.name} for {chosenPrice}
          </ThemedText>
          <MaterialCommunityIcons name="arrow-right" size={18} color="#FFFFFF" />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={onClose}
          hitSlop={8}
          style={{ alignItems: 'center', paddingVertical: 6 }}>
          <ThemedText style={{ color: muted, fontWeight: '700' }}>Not now</ThemedText>
        </Pressable>
        <ThemedText style={{ color: `${colors.text}77`, fontSize: 11, textAlign: 'center' }}>
          One-time payment in your browser via Razorpay. Nothing renews automatically.
        </ThemedText>
      </View>
    </AnimatedBottomSheet>
  );
}

function PlanLine({
  icon,
  color,
  label,
}: {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  color: string;
  label: string;
}) {
  const colors = useThemeTokens().colors;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <MaterialCommunityIcons name={icon} size={16} color={color} />
      <ThemedText style={{ color: colors.text, fontSize: 13 }}>{label}</ThemedText>
    </View>
  );
}
