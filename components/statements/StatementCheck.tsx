import { MaterialCommunityIcons } from '@expo/vector-icons';
import { cssInterop } from 'nativewind';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Fonts } from '@/constants/theme';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import { formatMoney } from '@/lib/money';
import type { ProbableDecision, StatementCheckPlan } from '@/lib/statement-check';
import type {
  StatementDiff,
  StatementLine,
  StatementProbablePair,
  StatementReconciliation,
} from '@/lib/statements';

const TText = cssInterop(ThemedText, { className: 'style' });

const MUTED = '#7C8EA8';
const GOOD = '#16A34A';
const WARN = '#F97316';

export const formatDay = (value: string) => {
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
};

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;

/**
 * The one card that answers "does this add up?", in two lines at most.
 *
 * The first line is the count of what was read. The second is the bill: what
 * Finnri will hold once the ticked rows are added, against what the bank says.
 * A file whose own rows do not add up to the bill is a third, separate fact —
 * a missing page — and only appears when true.
 */
export function StatementTotalsCard({
  diff,
  plan,
}: {
  diff: StatementDiff;
  plan: StatementCheckPlan;
}) {
  const theme = useThemeTokens().colors;
  const { summary } = diff;
  const newCount = summary.missing_count;
  const parts = [
    `${summary.matched_count} already in Finnri`,
    summary.probable_count > 0 ? `${summary.probable_count} to confirm` : null,
    `${newCount} new`,
  ].filter(Boolean);

  const bill = diff.reconciliation;
  const balanced = plan.projectedState === 'balanced';
  const gap = plan.projectedGap ?? 0;

  return (
    <View
      testID="statement-totals-card"
      className="mb-5 rounded-[24px] border px-5 py-4"
      style={{ backgroundColor: theme.card, borderColor: theme.border }}>
      <TText className="text-base" style={{ fontFamily: Fonts.title, color: theme.text }}>
        {plural(summary.statement_lines, 'row')} on your statement
      </TText>
      <TText className="mt-1 text-xs" style={{ fontFamily: Fonts.body, color: MUTED }}>
        {parts.join(' · ')}
      </TText>

      {bill && plan.projectedState ? (
        <View className="mt-3 flex-row items-start gap-2">
          <MaterialCommunityIcons
            name={balanced ? 'check-circle-outline' : 'scale-unbalanced'}
            size={18}
            color={balanced ? GOOD : WARN}
          />
          <TText
            testID="statement-totals-projection"
            className="min-w-0 flex-1 text-xs"
            style={{ fontFamily: Fonts.body, color: theme.text }}>
            {balanced
              ? `With these added, Finnri matches your ${formatMoney(bill.statement_total)} bill.`
              : gap > 0
                ? `With these added, ${formatMoney(gap)} of your ${formatMoney(bill.statement_total)} bill is still unexplained. Finnri keeps it as “Unitemized card spends” so your monthly total stays right.`
                : `With these added, Finnri would hold ${formatMoney(-gap)} more than your ${formatMoney(bill.statement_total)} bill. Check “In Finnri, not billed” below for a duplicate or a spend on the wrong card.`}
          </TText>
        </View>
      ) : null}

      {diff.checksum && !diff.checksum.matches ? (
        <View className="mt-3 flex-row items-start gap-2">
          <MaterialCommunityIcons name="file-alert-outline" size={18} color={WARN} />
          <TText
            testID="statement-file-mismatch"
            className="min-w-0 flex-1 text-xs"
            style={{ fontFamily: Fonts.body, color: theme.text }}>
            {diff.checksum.message} The rows come to {formatMoney(diff.checksum.parsed_net)}; the
            bill expects {formatMoney(diff.checksum.expected_net)}.
          </TText>
        </View>
      ) : null}
    </View>
  );
}

/**
 * Bank charges, together, once. They are also ticked in the list below like
 * any other row — this is where they are noticed, not where they are decided.
 */
export function ChargesCallout({ charges, total }: { charges: StatementLine[]; total: number }) {
  const light = useThemeTokens().mode === 'light';
  if (charges.length === 0) return null;
  const ink = light ? '#9A3412' : '#FDBA74';
  return (
    <View
      testID="statement-charges-callout"
      className="mb-5 rounded-[22px] px-4 py-4"
      style={{ backgroundColor: light ? '#FFF7ED' : '#321C0E' }}>
      <View className="flex-row items-center gap-2">
        <MaterialCommunityIcons name="alert-circle-outline" size={18} color={WARN} />
        <TText className="text-sm" style={{ fontFamily: Fonts.title, color: ink }}>
          {formatMoney(total)} in bank charges this cycle
        </TText>
      </View>
      <View className="mt-2 gap-1">
        {charges.map((line, index) => (
          <View key={`${line.description}|${index}`} className="flex-row justify-between gap-3">
            <TText
              className="min-w-0 flex-1 text-xs"
              numberOfLines={1}
              style={{ fontFamily: Fonts.body, color: ink }}>
              {line.description}
            </TText>
            <TText className="text-xs" style={{ fontFamily: Fonts.title, color: ink }}>
              {formatMoney(line.amount)}
            </TText>
          </View>
        ))}
      </View>
      <TText className="mt-2 text-[11px]" style={{ fontFamily: Fonts.body, color: ink }}>
        Not expecting these? Banks often reverse an annual or late fee when asked.
      </TText>
    </View>
  );
}

/** One bank line beside the entry it probably is, and the user's call. */
export function ProbableRow({
  pair,
  decision,
  onDecide,
}: {
  pair: StatementProbablePair;
  decision: ProbableDecision;
  onDecide: (next: ProbableDecision) => void;
}) {
  const theme = useThemeTokens().colors;
  const why =
    pair.reason === 'date'
      ? `${plural(pair.day_gap, 'day')} apart`
      : `${formatMoney(Math.abs(pair.amount_gap))} ${pair.amount_gap > 0 ? 'more' : 'less'} on the bill`;
  return (
    <View
      className="rounded-[18px] border px-4 py-3"
      style={{ backgroundColor: theme.card, borderColor: theme.border }}>
      <View className="flex-row items-start justify-between gap-3">
        <View className="min-w-0 flex-1">
          <TText
            className="text-sm"
            numberOfLines={1}
            style={{ fontFamily: Fonts.title, color: theme.text }}>
            {pair.line.description}
          </TText>
          <TText className="mt-0.5 text-[11px]" style={{ fontFamily: Fonts.body, color: MUTED }}>
            Bank · {formatDay(pair.line.date)} · {formatMoney(pair.line.amount)}
          </TText>
          <TText
            className="mt-0.5 text-[11px]"
            numberOfLines={1}
            style={{ fontFamily: Fonts.body, color: MUTED }}>
            Yours · “{pair.entry.title}” · {formatDay(pair.entry.date)} ·{' '}
            {formatMoney(pair.entry.amount)}
          </TText>
          <TText className="mt-0.5 text-[11px]" style={{ fontFamily: Fonts.body, color: WARN }}>
            {why}
          </TText>
        </View>
      </View>
      <View className="mt-3 flex-row gap-2">
        {(
          [
            ['same', 'Same purchase'],
            ['different', 'Different · add it'],
          ] as const
        ).map(([value, label]) => {
          const active = decision === value;
          return (
            <Pressable
              key={value}
              accessibilityRole="radio"
              accessibilityState={{ selected: active }}
              testID={`probable-${value}`}
              onPress={() => onDecide(value)}
              className="h-9 flex-1 items-center justify-center rounded-full border"
              style={{
                backgroundColor: active ? theme.accent : 'transparent',
                borderColor: active ? theme.accent : theme.border,
              }}>
              <TText
                className="text-xs"
                style={{ fontFamily: Fonts.title, color: active ? '#FFFFFF' : theme.text }}>
                {label}
              </TText>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/** What importing actually did to the bill, said once, in place. */
export function ImportResultCard({
  imported,
  reconciliation,
  onDone,
}: {
  imported: number;
  reconciliation: StatementReconciliation;
  onDone: () => void;
}) {
  const theme = useThemeTokens().colors;
  const light = useThemeTokens().mode === 'light';
  const balanced = reconciliation.state === 'balanced';
  const headline =
    imported > 0 ? `${plural(imported, 'transaction')} added.` : 'Nothing new was added.';
  const detail = balanced
    ? `Finnri now matches your ${formatMoney(reconciliation.statement_total)} bill.`
    : reconciliation.state === 'under'
      ? `${formatMoney(reconciliation.gap)} of the bill is still unexplained. It is kept as “Unitemized card spends” until you itemise it.`
      : `Finnri holds ${formatMoney(-reconciliation.gap)} more than the bill. One of your entries may be a duplicate or on the wrong card.`;
  return (
    <View
      testID="statement-import-result"
      className="mb-5 rounded-[22px] px-4 py-4"
      style={{
        backgroundColor: balanced ? (light ? '#F0FDF4' : '#12281A') : light ? '#FFF7ED' : '#321C0E',
      }}>
      <View className="flex-row items-start gap-3">
        <MaterialCommunityIcons
          name={balanced ? 'check-circle-outline' : 'scale-unbalanced'}
          size={20}
          color={balanced ? GOOD : WARN}
        />
        <View className="min-w-0 flex-1">
          <TText className="text-sm" style={{ fontFamily: Fonts.title, color: theme.text }}>
            {headline}
          </TText>
          <TText className="mt-1 text-xs" style={{ fontFamily: Fonts.body, color: theme.text }}>
            {detail}
          </TText>
        </View>
      </View>
      <Pressable
        accessibilityRole="button"
        onPress={onDone}
        className="mt-3 h-10 items-center justify-center rounded-full"
        style={{ backgroundColor: theme.accent }}>
        <TText className="text-sm" style={{ fontFamily: Fonts.title, color: '#FFFFFF' }}>
          Done
        </TText>
      </Pressable>
    </View>
  );
}

/**
 * A section that can fold. What the user must act on is open; what is only
 * for reference (already tracked, payments, unbilled) starts folded so the
 * screen opens on the decisions.
 */
export function CheckSection({
  title,
  subtitle,
  count,
  initiallyOpen = true,
  testID,
  children,
}: {
  title: string;
  subtitle: string;
  count: number;
  initiallyOpen?: boolean;
  testID?: string;
  children: React.ReactNode;
}) {
  const theme = useThemeTokens().colors;
  const [open, setOpen] = useState(initiallyOpen);
  return (
    <View className="mb-6" testID={testID}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((value) => !value)}
        className="flex-row items-center gap-2">
        <TText className="text-base" style={{ fontFamily: Fonts.title, color: theme.text }}>
          {title}
        </TText>
        <TText className="text-xs" style={{ fontFamily: Fonts.body, color: '#8EA0B8' }}>
          {count}
        </TText>
        <View className="flex-1" />
        <MaterialCommunityIcons
          name={open ? 'chevron-up' : 'chevron-down'}
          size={20}
          color="#8EA0B8"
        />
      </Pressable>
      {open ? (
        <>
          <TText className="mb-3 mt-1 text-xs" style={{ fontFamily: Fonts.body, color: MUTED }}>
            {subtitle}
          </TText>
          <View className="gap-2">{children}</View>
        </>
      ) : null}
    </View>
  );
}
