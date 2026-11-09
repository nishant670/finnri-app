import { MaterialCommunityIcons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ListRow } from '@/components/ui/ListRow';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import { AI_VISUALS } from '@/lib/ai-usage';

/**
 * The plans screen's case for a pass. Everything in Finnri works by hand for
 * free, so a pass sells one thing — AI doing the typing — and these cards say
 * what that is, what it costs in credits, and what stays free without it.
 */

const credits = (count: number) => `${count.toLocaleString('en-IN')} credit${count === 1 ? '' : 's'}`;

export type CreditPrices = {
  text: number;
  voice: number;
  voiceMax?: number;
  receipt: number;
  statementPdf: number;
};

/** What credits are spent on, each with an example and its price. */
export function CreditUsesCard({ prices }: { prices: CreditPrices }) {
  const { colors } = useThemeTokens();
  const voicePrice =
    prices.voiceMax && prices.voiceMax > prices.voice
      ? `${prices.voice}–${credits(prices.voiceMax)}`
      : credits(prices.voice);
  const uses = [
    {
      key: 'voice',
      visual: AI_VISUALS.voice,
      title: 'Say it once',
      meta: '“Swiggy 450 on HDFC card” becomes an entry',
      amount: voicePrice,
    },
    {
      key: 'text',
      visual: AI_VISUALS.text,
      title: 'Or type it in a line',
      meta: 'Amount, category and account filled in for you',
      amount: credits(prices.text),
    },
    {
      key: 'receipt',
      visual: AI_VISUALS.receipt,
      title: 'Snap the bill',
      meta: 'Merchant, amount and date read off the photo',
      amount: credits(prices.receipt),
    },
    {
      key: 'statement',
      visual: AI_VISUALS.statementPdf,
      title: 'Drop your card statement',
      meta: 'Every line of the PDF comes back as a draft to confirm',
      amount: credits(prices.statementPdf),
    },
    {
      key: 'ask',
      visual: AI_VISUALS.ask,
      title: 'Ask Finnri',
      meta: '“How much did I spend on food in October?”',
      amount: credits(prices.text),
    },
  ];
  return (
    <View testID="credit-uses" style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      {uses.map((use, index) => (
        <ListRow
          key={use.key}
          testID={`credit-use-${use.key}`}
          icon={use.visual.icon}
          hue={use.visual.hue}
          title={use.title}
          meta={use.meta}
          metaLines={2}
          amount={use.amount}
          amountTone="muted"
          divider={index > 0}
        />
      ))}
    </View>
  );
}

/**
 * What someone's own AI history did for them. Their real numbers are the most
 * honest pitch there is: they already know what it was like.
 */
export function AIRecapCard({ line, partial }: { line: string; partial: boolean }) {
  const { colors } = useThemeTokens();
  return (
    <View testID="ai-recap" style={[styles.card, styles.recap, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={[styles.recapTile, { backgroundColor: colors.selectedFill }]}>
        <MaterialCommunityIcons name="creation" size={18} color={colors.text} />
      </View>
      <View style={styles.flexText}>
        <ThemedText style={[styles.recapTitle, { color: colors.text }]}>
          {`${partial ? 'Lately, ' : 'So far, '}Finnri AI ${line} for you`}
        </ThemedText>
        <ThemedText tone="muted" style={styles.small}>
          A pass keeps it doing that. Everything still works by hand without one.
        </ThemedText>
      </View>
    </View>
  );
}

const FREE_ROWS: { label: string; free: true | string }[] = [
  { label: 'Add and edit entries by hand', free: true },
  { label: 'Accounts, cards and statements', free: true },
  { label: 'Budgets, insights and reminders', free: true },
  { label: 'Splits with friends', free: true },
  { label: 'Search and export', free: true },
  { label: 'AI capture, bill scans, statement reads and Ask Finnri', free: 'Trial' },
];

/** The whole free/paid line in one table, so nobody pays for what is free. */
export function FreeVsPassCard() {
  const { colors } = useThemeTokens();
  const check = <MaterialCommunityIcons name="check" size={18} color={colors.positive} />;
  return (
    <View testID="free-vs-pass" style={[styles.card, styles.table, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.tableRow}>
        <ThemedText accessibilityRole="header" style={[styles.tableTitle, styles.flexText, { color: colors.text }]}>
          What you get
        </ThemedText>
        <ThemedText tone="muted" style={[styles.column, styles.columnHead]}>
          Free
        </ThemedText>
        <ThemedText tone="muted" style={[styles.column, styles.columnHead]}>
          Pass
        </ThemedText>
      </View>
      {FREE_ROWS.map((row) => (
        <View
          key={row.label}
          accessible
          accessibilityLabel={`${row.label}: ${row.free === true ? 'free' : 'free during the trial'}, and with a pass`}
          style={[styles.tableRow, styles.tableBody, { borderTopColor: colors.border }]}>
          <ThemedText style={[styles.small, styles.flexText, { color: colors.text }]}>{row.label}</ThemedText>
          <View style={styles.column}>
            {row.free === true ? (
              check
            ) : (
              <ThemedText tone="muted" style={styles.small}>
                {row.free}
              </ThemedText>
            )}
          </View>
          <View style={styles.column}>{check}</View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: 16,
    overflow: 'hidden',
  },
  flexText: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  small: {
    fontSize: 12,
    lineHeight: 16,
  },
  recap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  recapTile: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recapTitle: {
    fontSize: 14,
    lineHeight: 19,
    fontWeight: '600',
  },
  table: {
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
  },
  tableBody: {
    borderTopWidth: 1,
  },
  tableTitle: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '700',
  },
  column: {
    width: 44,
    alignItems: 'center',
  },
  columnHead: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
    textAlign: 'center',
  },
});
