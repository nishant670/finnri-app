import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { SketchCard, sketchCardButtonBox, sketchCardHeight, useSketchCardTone } from '@/components/cards/SketchCard';
import { ScreenHeader } from '@/components/navigation/ScreenHeader';
import { PaymentFormSheet } from '@/components/statements/PaymentFormSheet';
import { ThemedText } from '@/components/themed-text';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { PressableView } from '@/components/ui/PressableView';
import { StateView } from '@/components/ui/StateView';
import { SCREEN_GUTTER } from '@/components/ui/theme-primitives';
import { withAlpha } from '@/constants/theme';
import { useAuthStore } from '@/hooks/use-auth-store';
import { useBottomInset } from '@/hooks/use-bottom-inset';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import { fetchAccounts, type Account } from '@/lib/accounts';
import { getFriendlyErrorMessage } from '@/lib/api-error';
import { CARD_H, CARD_W } from '@/lib/card-art';
import {
  billsDueCount,
  cardsSummaryLine,
  describeCard,
  isDrawnCard,
  orderCards,
  type CardListItem,
  type CardsTab,
} from '@/lib/card-list';
import { userDisplayName } from '@/lib/display-name';
import { haptics } from '@/lib/haptics';
import { recordStatementPayment, type StatementPaymentPayload } from '@/lib/statements';
import { todayISO } from '@/lib/subscription-form';
import { notifyTransactionsChanged } from '@/lib/transaction-events';

const MAX_CARD_WIDTH = 380;
const THUMB_W = 54;
const STRIP_H = 76;

/**
 * All cards, CRED-style (canvas board R18-AllCards, P93): every credit card
 * drawn in full as its sketch, the amount and Mark paid on the card's face,
 * one status chip under it, and a strip of thumbnails to jump between cards.
 */
export default function CardsScreen() {
  const tokens = useThemeTokens();
  const theme = tokens.colors;
  const { token, user } = useAuthStore();
  const { width: screenWidth } = useWindowDimensions();
  const bottomInset = useBottomInset(0);
  const scrollRef = useRef<ScrollView>(null);
  const offsets = useRef<Record<number, number>>({});

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<CardsTab>('bills');
  const [payingFor, setPayingFor] = useState<Account | null>(null);
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) {
      setIsLoading(false);
      return;
    }
    setError(null);
    try {
      setAccounts(await fetchAccounts(token));
    } catch (loadError) {
      setError(getFriendlyErrorMessage(loadError, 'Your cards did not load.'));
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const cards = useMemo(() => accounts.filter(isDrawnCard), [accounts]);
  const today = todayISO();
  const items = useMemo(
    () => orderCards(cards, tab).map((account) => describeCard(account, tab, today)),
    [cards, tab, today]
  );
  const summary = cardsSummaryLine(cards, tab, today);
  const dueCount = billsDueCount(cards);
  const holder = userDisplayName(user?.username, '');
  const cardWidth = Math.min(MAX_CARD_WIDTH, screenWidth - SCREEN_GUTTER * 2);

  const openCard = (item: CardListItem, addBill = false) =>
    router.push({
      pathname: '/accounts/[id]',
      params: { id: String(item.account.id), ...(addBill ? { add: 'statement' } : {}) },
    });

  const recordPayment = async (payload: StatementPaymentPayload) => {
    const statement = payingFor?.summary?.current_statement;
    if (!token || !statement || paying) return;
    setPaying(true);
    setPayError(null);
    try {
      await recordStatementPayment(token, statement.id, payload);
      haptics.saved();
      setPayingFor(null);
      if (payload.from_account_id) notifyTransactionsChanged();
      await load();
    } catch (paymentError) {
      haptics.rejected();
      setPayError(getFriendlyErrorMessage(paymentError, 'Unable to record this payment.'));
    } finally {
      setPaying(false);
    }
  };

  const jumpTo = (accountId: number) => {
    const y = offsets.current[accountId];
    if (typeof y === 'number') scrollRef.current?.scrollTo({ y: Math.max(0, y - 12), animated: true });
  };

  const header = <ScreenHeader title="Cards" onBack={() => router.back()} />;

  if (!isLoading && cards.length === 0) {
    return (
      <SafeAreaView style={[styles.screen, { backgroundColor: theme.background }]} edges={['top', 'left', 'right', 'bottom']}>
        {header}
        {error ? (
          <StateView icon="wifi-off" title="Your cards did not load" message={error} actionLabel="Try again" onAction={() => void load()} />
        ) : (
          <StateView
            icon="credit-card-outline"
            title="No credit cards yet"
            message="Add a card and pick which one it is. Finnri draws it here with its bill, due date and Mark paid."
            actionLabel="Add a card"
            onAction={() => router.push({ pathname: '/accounts/manage', params: { type: 'credit_card' } })}
          />
        )}
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: theme.background }]} edges={['top', 'left', 'right']}>
      {header}
      <View
        accessibilityRole="tablist"
        style={[styles.tabs, { backgroundColor: tokens.mode === 'dark' ? withAlpha('#FFFFFF', 0.08) : theme.border }]}>
        {(['bills', 'spend'] as const).map((key) => {
          const selected = tab === key;
          return (
            <PressableView
              key={key}
              testID={`cards-tab-${key}`}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              onPress={() => setTab(key)}
              style={[styles.tab, selected && [styles.tabSelected, { backgroundColor: theme.card }]]}
              pressedStyle={styles.pressed}>
              <ThemedText
                numberOfLines={1}
                style={[styles.tabLabel, { color: selected ? theme.text : theme.muted, fontWeight: selected ? '700' : '500' }]}>
                {key === 'bills' ? `Bills due · ${dueCount}` : "This month's spend"}
              </ThemedText>
            </PressableView>
          );
        })}
      </View>
      <ThemedText style={[styles.summary, { color: theme.muted }]}>
        <ThemedText style={[styles.summaryLead, { color: theme.text }]}>{summary.lead}</ThemedText>
        {summary.rest ? ` · ${summary.rest}` : ''}
      </ThemedText>

      <ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.list, { paddingBottom: STRIP_H + bottomInset + 24 }]}>
        {error ? <ErrorBanner message={error} onRetry={() => void load()} style={{ alignSelf: 'stretch' }} /> : null}
        {items.map((item) => (
          <View
            key={item.account.id}
            style={styles.item}
            onLayout={(event) => {
              offsets.current[item.account.id] = event.nativeEvent.layout.y;
            }}>
            <CardFace
              item={item}
              holder={holder}
              listWidth={cardWidth}
              onOpen={() => openCard(item)}
              onAction={() => {
                if (item.action === 'mark-paid') {
                  setPayError(null);
                  setPayingFor(item.account);
                } else if (item.action === 'add-bill') {
                  openCard(item, true);
                }
              }}
            />
            <PressableView
              testID={`card-chip-${item.account.id}`}
              accessibilityRole="button"
              accessibilityLabel={`${item.chip.label}, ${item.account.name}`}
              onPress={() => openCard(item, item.chip.target === 'add-bill')}
              style={[styles.chip, { borderColor: theme.border, backgroundColor: theme.card }]}
              pressedStyle={styles.pressed}>
              {item.chip.tone ? (
                <View
                  style={[
                    styles.chipDot,
                    {
                      backgroundColor:
                        item.chip.tone === 'positive' ? theme.positive : item.chip.tone === 'negative' ? theme.negative : theme.accent,
                    },
                  ]}
                />
              ) : null}
              <ThemedText style={[styles.chipLabel, { color: theme.text }]}>{item.chip.label}</ThemedText>
              <MaterialCommunityIcons name="chevron-right" size={14} color={theme.text} />
            </PressableView>
          </View>
        ))}
      </ScrollView>

      {/* Jump to a card. */}
      <View
        accessibilityLabel="Jump to a card"
        style={[
          styles.strip,
          { height: STRIP_H + bottomInset, paddingBottom: bottomInset, backgroundColor: theme.card, borderTopColor: theme.border },
        ]}>
        <View style={styles.stripCount}>
          <ThemedText style={[styles.stripCountLabel, { color: theme.text }]}>{`ALL ${cards.length}`}</ThemedText>
          <View style={[styles.stripCountBar, { backgroundColor: theme.accent }]} />
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.thumbs} style={styles.thumbScroll}>
          {items.map((item) => (
            <PressableView
              key={item.account.id}
              accessibilityRole="button"
              accessibilityLabel={`Go to ${item.account.name}`}
              onPress={() => jumpTo(item.account.id)}
              style={styles.thumb}
              pressedStyle={styles.pressed}>
              <SketchCard
                art={item.art}
                bank={item.bank}
                bare
                width={item.art.portrait ? (THUMB_W * CARD_H * CARD_H) / (CARD_W * CARD_W) : THUMB_W}
              />
            </PressableView>
          ))}
        </ScrollView>
        <PressableView
          testID="cards-add"
          accessibilityRole="button"
          onPress={() => router.push({ pathname: '/accounts/manage', params: { type: 'credit_card' } })}
          style={[styles.addButton, { borderColor: theme.border, backgroundColor: theme.background }]}
          pressedStyle={styles.pressed}>
          <ThemedText style={[styles.addLabel, { color: theme.text }]}>+ Add card</ThemedText>
        </PressableView>
      </View>

      <PaymentFormSheet
        visible={payingFor !== null}
        remainingDue={payingFor?.summary?.current_statement?.remaining_due ?? 0}
        minimumDue={payingFor?.summary?.current_statement?.minimum_due ?? 0}
        accounts={accounts}
        cardId={payingFor?.id ?? 0}
        submitting={paying}
        error={payError}
        onClose={() => setPayingFor(null)}
        onSubmit={(payload) => void recordPayment(payload)}
      />
    </SafeAreaView>
  );
}

/**
 * One card at the list's scale. A portrait card keeps the same scale as its
 * landscape neighbours, so it stands upright rather than growing wider.
 */
function CardFace({
  item,
  holder,
  listWidth,
  onOpen,
  onAction,
}: {
  item: CardListItem;
  holder: string;
  listWidth: number;
  onOpen: () => void;
  onAction: () => void;
}) {
  const { mode } = useThemeTokens();
  const t = useSketchCardTone(item.art);
  const portrait = item.art.portrait;
  const width = portrait ? (listWidth * CARD_H) / CARD_W : listWidth;
  const scale = width / (portrait ? CARD_H : CARD_W);
  const box = sketchCardButtonBox(portrait);
  const ghost = item.action === 'add-bill';
  const actionLabel = item.action === 'mark-paid' ? 'Mark paid' : item.action === 'add-bill' ? 'Add bill' : null;

  return (
    <View
      style={[
        styles.face,
        { width, height: sketchCardHeight(width, portrait) },
        mode === 'dark' ? styles.shadowDark : styles.shadowLight,
      ]}>
      <PressableView
        testID={`card-face-${item.account.id}`}
        accessibilityRole="button"
        accessibilityLabel={`${item.account.name}: ${item.figure.amount}, ${item.figure.sub}`}
        accessibilityHint="Opens the card"
        onPress={onOpen}
        pressedStyle={styles.pressedCard}>
        <SketchCard
          art={item.art}
          bank={item.bank}
          product={item.product}
          last4={item.last4}
          network={item.network}
          holder={holder}
          width={width}
          figure={item.figure}
        />
      </PressableView>
      {actionLabel ? (
        <PressableView
          testID={`card-action-${item.account.id}`}
          accessibilityRole="button"
          accessibilityLabel={`${actionLabel}, ${item.account.name}`}
          hitSlop={6}
          onPress={onAction}
          style={[
            styles.faceButton,
            {
              right: box.right * scale,
              ...(box.top !== undefined ? { top: box.top * scale } : { bottom: box.bottom * scale }),
              height: box.height,
            },
            ghost
              ? { borderWidth: 1.5, borderColor: t.text, backgroundColor: 'transparent' }
              : { backgroundColor: t.btnBg },
          ]}
          pressedStyle={styles.pressed}>
          <ThemedText style={[styles.faceButtonLabel, { color: ghost ? t.text : t.btnInk }]}>{actionLabel}</ThemedText>
        </PressableView>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  tabs: {
    marginTop: 2,
    marginHorizontal: 24,
    height: 40,
    padding: 3,
    borderRadius: 20,
    flexDirection: 'row',
  },
  tab: {
    flex: 1,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  tabSelected: {
    shadowColor: '#000000',
    shadowOpacity: 0.12,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  tabLabel: {
    fontSize: 13,
    lineHeight: 18,
  },
  summary: {
    marginTop: 14,
    marginHorizontal: 24,
    fontSize: 13,
    lineHeight: 18,
  },
  summaryLead: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '700',
  },
  list: {
    paddingTop: 16,
    paddingHorizontal: SCREEN_GUTTER,
    alignItems: 'center',
    gap: 22,
  },
  item: {
    alignItems: 'center',
    gap: 10,
  },
  face: {
    borderRadius: 14,
  },
  shadowLight: {
    shadowColor: '#281E3C',
    shadowOpacity: 0.3,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6,
  },
  shadowDark: {
    shadowColor: '#000000',
    shadowOpacity: 0.6,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 12 },
    elevation: 8,
  },
  faceButton: {
    position: 'absolute',
    paddingHorizontal: 16,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  faceButtonLabel: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '700',
  },
  chip: {
    height: 32,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingLeft: 12,
    paddingRight: 10,
    borderRadius: 16,
    borderWidth: 1,
  },
  chipDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  chipLabel: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
  },
  strip: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    borderTopWidth: 1,
    shadowColor: '#000000',
    shadowOpacity: 0.15,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: -6 },
    elevation: 10,
  },
  stripCount: {
    alignItems: 'center',
    gap: 4,
  },
  stripCountLabel: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  stripCountBar: {
    width: 22,
    height: 3,
    borderRadius: 2,
  },
  thumbScroll: {
    flex: 1,
  },
  thumbs: {
    gap: 8,
    alignItems: 'center',
    paddingVertical: 8,
  },
  thumb: {
    borderRadius: 6,
    overflow: 'hidden',
  },
  addButton: {
    height: 36,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    justifyContent: 'center',
  },
  addLabel: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
  },
  pressed: {
    opacity: 0.7,
  },
  pressedCard: {
    opacity: 0.92,
  },
});
