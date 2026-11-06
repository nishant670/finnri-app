import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useMemo, useState, type ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ScreenHeader } from '@/components/navigation/ScreenHeader';
import { ThemedText } from '@/components/themed-text';
import { EMIYearsChart, SIPGrowthChart } from '@/components/tools/CalculatorCharts';
import { Button } from '@/components/ui/Button';
import { PressableView } from '@/components/ui/PressableView';
import { Segments } from '@/components/ui/Segments';
import { Slider } from '@/components/ui/Slider';
import { Fonts, mixHex } from '@/constants/theme';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import { CURRENCY_SYMBOL } from '@/constants/Currency';
import { formatMoney, toAmountString } from '@/lib/money';
import {
  calculateEMILocal,
  emiYears,
  prepaymentWhatIf,
  type EMIScheduleMonth,
} from '@/lib/emi';
import {
  SIP_INFLATION_PERCENT,
  calculateSIP,
  inTodaysMoney,
  sipPresets,
  type SIPPreset,
  type SIPPresetID,
} from '@/lib/sip';

type ToolID = 'sip' | 'emi';

const toolOptions = [
  { key: 'sip', label: 'SIP · Investments', testID: 'tools-tab-sip' },
  { key: 'emi', label: 'EMI · Loans', testID: 'tools-tab-emi' },
] as const;

/** Each slider's range and step (boards R11-SIP-Proposals, R11-EMI-Proposals). */
const RANGES = {
  sipMonthly: { min: 500, max: 250000, step: 500 },
  sipReturn: { min: 1, max: 30, step: 0.5 },
  sipYears: { min: 1, max: 40, step: 1 },
  sipStepUp: { min: 0, max: 25, step: 1 },
  emiPrincipal: { min: 10000, max: 5000000, step: 10000 },
  emiRate: { min: 5, max: 24, step: 0.1 },
  emiMonths: { min: 6, max: 360, step: 6 },
} as const;

/** What the "pay more each month" line can try (P54). */
const EXTRA_CHOICES = [1000, 2000, 5000, 10000, 25000];

/** `about ₹3.34 crore`, `about ₹12.5 lakh`; nothing under a lakh, where the figure says it all. */
const inWords = (amount: number) => {
  const trim = (value: number) => value.toFixed(2).replace(/\.?0+$/, '');
  if (amount >= 1e7) return `about ${CURRENCY_SYMBOL}${trim(amount / 1e7)} crore`;
  if (amount >= 1e5) return `about ${CURRENCY_SYMBOL}${trim(amount / 1e5)} lakh`;
  return null;
};

const yearsLabel = (months: number) => {
  const years = months / 12;
  if (!Number.isInteger(years)) return null;
  return `${years} year${years === 1 ? '' : 's'}`;
};

const monthsLabel = (months: number) => {
  if (months < 12) return `${months} month${months === 1 ? '' : 's'}`;
  const years = Math.floor(months / 12);
  const rest = months % 12;
  return [`${years} yr${years === 1 ? '' : 's'}`, rest ? `${rest} mo` : null].filter(Boolean).join(' ');
};

const parseDecimalInput = (value: string) => Number(value.replace(/,/g, '').trim());

const sanitizeNumericInput = (value: string) => value.replace(/[^0-9.]/g, '');

/** A slider's value as the field's text: `12.5`, not `12.500000001`. */
const fieldText = (value: number) => String(Number(value.toFixed(2)));

/** A sensible first "pay more" amount: about a third of the EMI, from the choices. */
const defaultExtra = (emi: number) =>
  EXTRA_CHOICES.reduce((best, choice) =>
    Math.abs(choice - emi / 3) < Math.abs(best - emi / 3) ? choice : best
  );

/**
 * `100000` as `1,00,000` while it is typed (board R11-SIP), the way the amount
 * reads everywhere else. Only the display: the commas are stripped again on
 * every change, and `parseDecimalInput` ignores them.
 */
const groupIndian = (raw: string) => {
  const [whole, ...rest] = raw.split('.');
  if (whole.length <= 3) return raw;
  const last = whole.slice(-3);
  const head = whole.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',');
  return [`${head},${last}`, ...rest].join('.');
};

/**
 * SIP and EMI calculators (boards R11-SIP-Proposals and R11-EMI-Proposals).
 *
 * The answer sits on top and moves as the inputs do (P50): both are worked
 * out on the phone, so there is no Calculate button, no sign-in and no
 * connection to wait for. Every input has a slider as well as its field
 * (P51). Each answer leads with a chart and keeps the table a tap away (P52),
 * ends with a way to track it in Finnri (P53), and carries one what-if line
 * (P54): today's money for a SIP, paying a little more for a loan.
 */
export default function ToolsScreen() {
  const router = useRouter();
  const { colors } = useThemeTokens();

  const [activeTool, setActiveTool] = useState<ToolID>('sip');
  const [showTable, setShowTable] = useState(false);

  const [activeSIPPresetID, setActiveSIPPresetID] = useState<SIPPresetID>('mutual_fund');
  const [sipMonthlyInvestment, setSipMonthlyInvestment] = useState('10000');
  const [sipExpectedReturn, setSipExpectedReturn] = useState('12');
  const [sipTenureYears, setSipTenureYears] = useState('10');
  const [sipAnnualStepUp, setSipAnnualStepUp] = useState('10');
  const [sipCurrentCorpus, setSipCurrentCorpus] = useState('0');

  const [principal, setPrincipal] = useState('500000');
  const [rate, setRate] = useState('10.5');
  const [tenure, setTenure] = useState('60');
  const [extra, setExtra] = useState<number | null>(null);
  const [isChoosingExtra, setIsChoosingExtra] = useState(false);

  const sipInputs = {
    monthlyInvestment: parseDecimalInput(sipMonthlyInvestment),
    expectedAnnualReturnPercent: parseDecimalInput(sipExpectedReturn),
    tenureYears: parseDecimalInput(sipTenureYears),
    annualStepUpPercent: parseDecimalInput(sipAnnualStepUp || '0'),
    currentCorpus: parseDecimalInput(sipCurrentCorpus || '0'),
  };
  const sipProblem = sipInputProblem(sipInputs);
  const sipResult = useMemo(
    () => (sipProblem ? null : calculateSIP(sipInputs)),
    // The parsed numbers are what matters; the object is rebuilt each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sipProblem, sipMonthlyInvestment, sipExpectedReturn, sipTenureYears, sipAnnualStepUp, sipCurrentCorpus]
  );

  const emiPrincipal = parseDecimalInput(principal);
  const emiRate = parseDecimalInput(rate);
  const emiMonths = Math.round(parseDecimalInput(tenure));
  const emiResult = useMemo(
    () => calculateEMILocal(emiPrincipal, emiRate, emiMonths),
    [emiMonths, emiPrincipal, emiRate]
  );
  const emiProblem = emiResult ? null : emiInputProblem(emiPrincipal, emiRate, emiMonths);
  const extraAmount = extra ?? (emiResult ? defaultExtra(emiResult.monthly_emi) : 0);
  const whatIf = useMemo(
    () => (emiResult ? prepaymentWhatIf(emiResult, extraAmount) : null),
    [emiResult, extraAmount]
  );

  const editSIP = (setter: (value: string) => void) => (value: string) => {
    setter(sanitizeNumericInput(value));
    setActiveSIPPresetID('custom');
  };
  const slideSIP = (setter: (value: string) => void) => (value: number) => {
    setter(fieldText(value));
    setActiveSIPPresetID('custom');
  };
  const editEMI = (setter: (value: string) => void) => (value: string) =>
    setter(sanitizeNumericInput(value));
  const slideEMI = (setter: (value: string) => void) => (value: number) => setter(fieldText(value));

  const applySIPPreset = (preset: SIPPreset) => {
    setActiveSIPPresetID(preset.id);
    setSipMonthlyInvestment(String(preset.monthlyInvestment));
    setSipExpectedReturn(String(preset.expectedAnnualReturnPercent));
    setSipTenureYears(String(preset.tenureYears));
    setSipAnnualStepUp(String(preset.annualStepUpPercent));
    setSipCurrentCorpus(String(preset.currentCorpus));
  };

  /** P53: the Recurring sheet, already filled in with what was worked out here. */
  const trackSIP = () => {
    if (!sipResult) return;
    router.push({
      pathname: '/(tabs)/money',
      params: {
        segment: 'subscriptions',
        source: 'calculator',
        kind: 'investment',
        amount: toAmountString(sipInputs.monthlyInvestment),
        stepUpPct: fieldText(sipInputs.annualStepUpPercent),
      },
    });
  };
  const trackLoan = () => {
    if (!emiResult) return;
    router.push({
      pathname: '/(tabs)/money',
      params: {
        segment: 'subscriptions',
        source: 'calculator',
        kind: 'loan',
        amount: toAmountString(emiResult.monthly_emi),
        principal: toAmountString(emiResult.principal_amount),
        ratePct: fieldText(emiResult.annual_interest_rate_percent),
        totalEmis: String(emiResult.tenure_months),
      },
    });
  };

  const sipYears = sipResult?.tenureYears ?? 0;
  const todaysMoney = sipResult ? inTodaysMoney(sipResult.maturityValue, sipYears) : 0;
  const emiYearRows = emiResult ? emiYears(emiResult.schedule) : [];

  return (
    <SafeAreaView style={[styles.flex, { backgroundColor: colors.background }]} edges={['top', 'left', 'right', 'bottom']}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScreenHeader title="Calculators" onBack={() => router.back()} />

        <ScrollView
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.content}>
          <Segments
            active={activeTool}
            options={toolOptions}
            onChange={(tool) => {
              setActiveTool(tool);
              setShowTable(false);
            }}
          />

          {activeTool === 'sip' ? (
            <>
              {sipResult ? (
                <ResultCard
                  testID="sip-result"
                  eyebrow={`In ${sipYears} year${sipYears === 1 ? '' : 's'}, you could have`}
                  figure={formatMoney(sipResult.maturityValue)}
                  caption={inWords(sipResult.maturityValue)}
                  parts={[
                    { label: 'You put in', amount: sipResult.investedAmount, color: withInk(colors.text) },
                    { label: 'Growth', amount: sipResult.estimatedReturns, color: colors.positive },
                  ]}
                  footnote={
                    <ThemedText tone="muted" style={styles.whatIf}>
                      {'In today’s money that is about '}
                      <ThemedText style={[styles.whatIf, styles.whatIfStrong, { color: colors.text }]}>
                        {inWords(todaysMoney) ?? formatMoney(todaysMoney)}
                      </ThemedText>
                      {`, if prices rise ${SIP_INFLATION_PERCENT}% a year.`}
                    </ThemedText>
                  }>
                  <SIPGrowthChart years={sipResult.breakdown} />
                </ResultCard>
              ) : (
                <ProblemNote text={sipProblem ?? 'Enter a monthly amount to see what it could grow to.'} />
              )}

              {sipResult ? (
                <TableToggle
                  label={showTable ? 'Hide year by year' : 'See year by year'}
                  expanded={showTable}
                  onPress={() => setShowTable((current) => !current)}
                />
              ) : null}
              {sipResult && showTable ? (
                // "Added that year", not "Invested": the column is each year's
                // deposits beside a running value (a fix on board R11-SIP).
                <Table
                  columns={[
                    { label: 'Year', flex: 0.6 },
                    { label: 'Added that year', flex: 1.4, right: true },
                    { label: 'Value at year end', flex: 1.6, right: true },
                  ]}
                  rows={sipResult.breakdown.map((year) => [
                    String(year.year),
                    formatMoney(year.yearlyInvestment),
                    formatMoney(year.yearEndValue),
                  ])}
                />
              ) : null}

              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.chipRow}
                style={styles.chipScroll}
                accessibilityRole="radiogroup"
                accessibilityLabel="Investment type">
                {sipPresets.map((preset) => (
                  <Chip
                    key={preset.id}
                    label={preset.label}
                    selected={activeSIPPresetID === preset.id}
                    onPress={() => applySIPPreset(preset)}
                  />
                ))}
              </ScrollView>

              <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <InputRow
                  label="Monthly investment"
                  prefix={CURRENCY_SYMBOL}
                  value={sipMonthlyInvestment}
                  onChangeText={editSIP(setSipMonthlyInvestment)}
                  placeholder="10000"
                  slider={{
                    ...RANGES.sipMonthly,
                    value: sipInputs.monthlyInvestment,
                    onChange: slideSIP(setSipMonthlyInvestment),
                    format: formatMoney,
                  }}
                />
                <InputRow
                  label="Expected return"
                  suffix="% a year"
                  value={sipExpectedReturn}
                  onChangeText={editSIP(setSipExpectedReturn)}
                  placeholder="12"
                  divider
                  slider={{
                    ...RANGES.sipReturn,
                    value: sipInputs.expectedAnnualReturnPercent,
                    onChange: slideSIP(setSipExpectedReturn),
                    format: (value) => `${value}%`,
                  }}
                />
                <InputRow
                  label="Time period"
                  suffix="years"
                  value={sipTenureYears}
                  onChangeText={editSIP(setSipTenureYears)}
                  placeholder="10"
                  divider
                  slider={{
                    ...RANGES.sipYears,
                    value: sipInputs.tenureYears,
                    onChange: slideSIP(setSipTenureYears),
                    format: (value) => `${value} yr${value === 1 ? '' : 's'}`,
                  }}
                />
                <InputRow
                  label="Yearly step-up"
                  suffix="%"
                  value={sipAnnualStepUp}
                  onChangeText={editSIP(setSipAnnualStepUp)}
                  placeholder="0"
                  divider
                  slider={{
                    ...RANGES.sipStepUp,
                    value: sipInputs.annualStepUpPercent,
                    onChange: slideSIP(setSipAnnualStepUp),
                    format: (value) => `${value}%`,
                  }}
                />
                <InputRow
                  label="Already invested"
                  prefix={CURRENCY_SYMBOL}
                  value={sipCurrentCorpus}
                  onChangeText={editSIP(setSipCurrentCorpus)}
                  placeholder="0"
                  divider
                />
              </View>

              <Button
                testID="tools-track-sip"
                label="Track this SIP in Finnri"
                icon="plus"
                variant="outline"
                height={48}
                disabled={!sipResult}
                onPress={trackSIP}
              />
            </>
          ) : (
            <>
              {emiResult ? (
                <ResultCard
                  testID="emi-result"
                  eyebrow="Monthly EMI"
                  figure={formatMoney(emiResult.monthly_emi)}
                  caption={[`for ${emiResult.schedule.length} months`, yearsLabel(emiResult.schedule.length)]
                    .filter(Boolean)
                    .join(' · ')}
                  parts={[
                    { label: 'Loan', amount: emiResult.principal_amount, color: withInk(colors.text) },
                    { label: 'Interest', amount: emiResult.total_interest, color: colors.warning },
                  ]}
                  total={{ label: 'You pay in total', amount: emiResult.total_payment }}
                  footnote={
                    whatIf ? (
                      <View style={styles.whatIfBlock}>
                        <ThemedText tone="muted" style={styles.whatIf}>
                          {'Pay '}
                          <ThemedText style={[styles.whatIf, styles.whatIfStrong, { color: colors.text }]}>
                            {`${formatMoney(extraAmount)} more`}
                          </ThemedText>
                          {' a month: done '}
                          <ThemedText style={[styles.whatIf, styles.whatIfStrong, { color: colors.text }]}>
                            {`${monthsLabel(whatIf.monthsSooner)} sooner`}
                          </ThemedText>
                          {', '}
                          <ThemedText style={[styles.whatIf, styles.whatIfStrong, { color: colors.positive }]}>
                            {formatMoney(whatIf.interestSaved)}
                          </ThemedText>
                          {' less interest. '}
                          <ThemedText
                            accessibilityRole="button"
                            onPress={() => setIsChoosingExtra((open) => !open)}
                            style={[styles.whatIf, styles.whatIfLink, { color: colors.text }]}>
                            Change
                          </ThemedText>
                        </ThemedText>
                        {isChoosingExtra ? (
                          <View style={styles.extraChoices} accessibilityRole="radiogroup" accessibilityLabel="Pay more each month">
                            {EXTRA_CHOICES.map((choice) => (
                              <Chip
                                key={choice}
                                small
                                label={`+${formatMoney(choice)}`}
                                selected={extraAmount === choice}
                                onPress={() => {
                                  setExtra(choice);
                                  setIsChoosingExtra(false);
                                }}
                              />
                            ))}
                          </View>
                        ) : null}
                      </View>
                    ) : null
                  }>
                  <ThemedText accessibilityRole="header" style={[styles.chartTitle, { color: colors.text }]}>
                    Each year’s payments
                  </ThemedText>
                  <EMIYearsChart years={emiYearRows} />
                </ResultCard>
              ) : (
                <ProblemNote text={emiProblem ?? 'Enter a loan amount to see the monthly EMI.'} />
              )}

              {emiResult ? (
                <TableToggle
                  label={showTable ? 'Hide month by month' : 'See month by month'}
                  expanded={showTable}
                  onPress={() => setShowTable((current) => !current)}
                />
              ) : null}
              {emiResult && showTable ? (
                <Table
                  columns={[
                    { label: 'Month', flex: 0.6 },
                    { label: 'Principal', flex: 1.1, right: true },
                    { label: 'Interest', flex: 1, right: true },
                    { label: 'Balance', flex: 1.4, right: true },
                  ]}
                  rows={emiResult.schedule.map((month: EMIScheduleMonth) => [
                    String(month.month),
                    formatMoney(month.principal_amount),
                    formatMoney(month.interest_amount),
                    formatMoney(month.closing_balance),
                  ])}
                />
              ) : null}

              <ThemedText accessibilityRole="header" style={[styles.sectionTitle, { color: colors.text }]}>
                Loan details
              </ThemedText>
              <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <InputRow
                  label="Loan amount"
                  prefix={CURRENCY_SYMBOL}
                  value={principal}
                  onChangeText={editEMI(setPrincipal)}
                  placeholder="500000"
                  slider={{
                    ...RANGES.emiPrincipal,
                    value: emiPrincipal,
                    onChange: slideEMI(setPrincipal),
                    format: formatMoney,
                  }}
                />
                <InputRow
                  label="Interest"
                  suffix="% a year"
                  value={rate}
                  onChangeText={editEMI(setRate)}
                  placeholder="10.5"
                  divider
                  slider={{
                    ...RANGES.emiRate,
                    value: emiRate,
                    onChange: slideEMI(setRate),
                    format: (value) => `${value}%`,
                  }}
                />
                <InputRow
                  label="Time period"
                  suffix="months"
                  value={tenure}
                  onChangeText={editEMI(setTenure)}
                  placeholder="60"
                  divider
                  slider={{
                    ...RANGES.emiMonths,
                    value: emiMonths,
                    onChange: slideEMI(setTenure),
                    format: (value) => (value < 12 ? `${value} mo` : monthsLabel(value)),
                  }}
                />
              </View>

              <Button
                testID="tools-track-loan"
                label="Track this loan in Finnri"
                icon="plus"
                variant="outline"
                height={48}
                disabled={!emiResult}
                onPress={trackLoan}
              />
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

type SIPInputs = Parameters<typeof calculateSIP>[0];

/** Why a SIP can't be worked out yet, in one line, or null when it can. */
const sipInputProblem = (input: SIPInputs): string | null => {
  if (!Number.isFinite(input.monthlyInvestment) || input.monthlyInvestment <= 0) {
    return 'Enter a monthly amount to see what it could grow to.';
  }
  if (
    !Number.isFinite(input.expectedAnnualReturnPercent) ||
    input.expectedAnnualReturnPercent < 0 ||
    input.expectedAnnualReturnPercent > 100
  ) {
    return 'Expected return must be between 0 and 100%.';
  }
  if (!Number.isFinite(input.tenureYears) || input.tenureYears <= 0 || input.tenureYears > 60) {
    return 'Time period must be between 1 and 60 years.';
  }
  if (
    !Number.isFinite(input.annualStepUpPercent) ||
    input.annualStepUpPercent < 0 ||
    input.annualStepUpPercent > 100
  ) {
    return 'Yearly step-up must be between 0 and 100%.';
  }
  if (!Number.isFinite(input.currentCorpus) || input.currentCorpus < 0) {
    return 'Already invested can’t be negative.';
  }
  return null;
};

/** Why an EMI can't be worked out yet, in one line. */
const emiInputProblem = (principalAmount: number, annualRate: number, months: number) => {
  if (!Number.isFinite(principalAmount) || principalAmount <= 0) {
    return 'Enter a loan amount to see the monthly EMI.';
  }
  if (!Number.isFinite(annualRate) || annualRate < 0 || annualRate > 100) {
    return 'Interest must be between 0 and 100% a year.';
  }
  return 'Time period must be between 1 and 360 months.';
};

/** Ink at 22%, the quiet half of a split bar (what you put in, the loan itself). */
const withInk = (ink: string) => `${ink}38`;

type SliderSpec = {
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (value: number) => void;
  /** How the range's ends and the spoken value read. */
  format: (value: number) => string;
};

/**
 * One labelled value on the left, its field on the right, and under them the
 * slider for it (boards R11-SIP-Proposals, R11-EMI-Proposals, P51).
 */
function InputRow({
  label,
  value,
  onChangeText,
  placeholder,
  prefix,
  suffix,
  divider = false,
  slider,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  prefix?: string;
  suffix?: string;
  divider?: boolean;
  slider?: SliderSpec;
}) {
  const { colors } = useThemeTokens();
  return (
    <View style={[styles.inputRow, divider && { borderTopWidth: 1, borderTopColor: colors.border }]}>
      <View style={styles.inputLine}>
        <ThemedText tone="muted" style={styles.inputLabel}>
          {label}
        </ThemedText>
        <View style={[styles.field, { backgroundColor: mixHex(colors.card, colors.track, 0.6) }]}>
          {prefix ? <ThemedText tone="muted" style={styles.prefix}>{prefix}</ThemedText> : null}
          <TextInput
            accessibilityLabel={label}
            value={prefix ? groupIndian(value) : value}
            onChangeText={onChangeText}
            placeholder={placeholder}
            placeholderTextColor={colors.muted}
            keyboardType="decimal-pad"
            selectTextOnFocus
            style={[styles.fieldInput, { color: colors.text, fontFamily: Fonts.title }]}
          />
          {suffix ? <ThemedText tone="muted" numberOfLines={1} style={styles.suffix}>{suffix}</ThemedText> : null}
        </View>
      </View>
      {slider ? (
        <View style={styles.slider}>
          <Slider
            min={slider.min}
            max={slider.max}
            step={slider.step}
            value={Number.isFinite(slider.value) ? slider.value : slider.min}
            onChange={slider.onChange}
            accessibilityLabel={`Adjust ${label.toLowerCase()}`}
            accessibilityValueText={Number.isFinite(slider.value) ? slider.format(slider.value) : undefined}
            minLabel={slider.format(slider.min)}
            maxLabel={slider.format(slider.max)}
          />
        </View>
      ) : null}
    </View>
  );
}

/** A pick chip: tinted and bold when chosen, never accent text. */
function Chip({
  label,
  selected,
  onPress,
  small = false,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  small?: boolean;
}) {
  const { colors } = useThemeTokens();
  return (
    <PressableView
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      style={[
        small ? styles.chipSmall : styles.chip,
        selected
          ? { backgroundColor: colors.selectedFill, borderColor: colors.selectedFill }
          : { backgroundColor: small ? 'transparent' : colors.card, borderColor: colors.border },
      ]}
      pressedStyle={styles.pressed}>
      <ThemedText style={[small ? styles.chipSmallLabel : styles.chipLabel, { color: colors.text, fontWeight: selected ? '700' : '500' }]}>
        {label}
      </ThemedText>
    </PressableView>
  );
}

/** In place of the answer while the inputs can't make one: what to fix. */
function ProblemNote({ text }: { text: string }) {
  const { colors } = useThemeTokens();
  return (
    <View style={[styles.note, { borderColor: colors.borderStrong }]}>
      <View style={[styles.noteIcon, { backgroundColor: mixHex(colors.card, colors.positive, 0.14) }]}>
        <MaterialCommunityIcons name="calculator-variant-outline" size={16} color={colors.positive} />
      </View>
      <ThemedText tone="muted" style={styles.noteText}>
        {text}
      </ThemedText>
    </View>
  );
}

/** The answer: the figure, what it is made of as one split bar, and the parts as rows. */
function ResultCard({
  testID,
  eyebrow,
  figure,
  caption,
  parts,
  total,
  footnote,
  children,
}: {
  testID?: string;
  eyebrow: string;
  figure: string;
  caption?: string | null;
  parts: { label: string; amount: number; color: string }[];
  total?: { label: string; amount: number };
  /** The what-if line under the parts (P54). */
  footnote?: ReactNode;
  /** The chart, at the card's foot (P52). */
  children?: ReactNode;
}) {
  const { colors } = useThemeTokens();
  const sum = parts.reduce((acc, part) => acc + Math.max(0, part.amount), 0) || 1;
  return (
    <View
      testID={testID}
      accessibilityLiveRegion="polite"
      style={[styles.card, styles.result, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <ThemedText tone="muted" style={styles.resultEyebrow}>
        {eyebrow}
      </ThemedText>
      <ThemedText numberOfLines={1} adjustsFontSizeToFit style={[styles.resultFigure, { color: colors.text }]}>
        {figure}
      </ThemedText>
      {caption ? (
        <ThemedText tone="muted" style={styles.resultEyebrow}>
          {caption}
        </ThemedText>
      ) : null}
      <View style={styles.split} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {parts.map((part) => (
          <View
            key={part.label}
            style={{ flex: Math.max(0.001, Math.max(0, part.amount) / sum), backgroundColor: part.color }}
          />
        ))}
      </View>
      <View style={styles.legend}>
        {parts.map((part, index) => (
          <View key={part.label} style={[styles.legendRow, index > 0 && { borderTopWidth: 1, borderTopColor: colors.border }]}>
            <View style={[styles.swatch, { backgroundColor: part.color }]} />
            <ThemedText tone="muted" style={styles.legendLabel}>
              {part.label}
            </ThemedText>
            <ThemedText style={[styles.legendValue, { color: colors.text }]}>{formatMoney(part.amount)}</ThemedText>
          </View>
        ))}
        {total ? (
          <View style={[styles.legendRow, { borderTopWidth: 1, borderTopColor: colors.border }]}>
            <View style={styles.swatch} />
            <ThemedText style={[styles.legendLabel, styles.bold, { color: colors.text }]}>{total.label}</ThemedText>
            <ThemedText style={[styles.legendValue, styles.bolder, { color: colors.text }]}>{formatMoney(total.amount)}</ThemedText>
          </View>
        ) : null}
      </View>
      {footnote ? <View style={[styles.footnote, { borderTopColor: colors.border }]}>{footnote}</View> : null}
      {children ? <View style={[styles.chartBlock, { borderTopColor: colors.border }]}>{children}</View> : null}
    </View>
  );
}

/** "See year by year" under a chart: the table is there, one tap away (P52). */
function TableToggle({
  label,
  expanded,
  onPress,
}: {
  label: string;
  expanded: boolean;
  onPress: () => void;
}) {
  const { colors } = useThemeTokens();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ expanded }}
      onPress={onPress}
      hitSlop={8}
      style={styles.toggle}>
      <ThemedText style={[styles.toggleLabel, { color: colors.text }]}>{label}</ThemedText>
      <MaterialCommunityIcons name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color={colors.text} />
    </Pressable>
  );
}

function Table({
  columns,
  rows,
}: {
  columns: { label: string; flex: number; right?: boolean }[];
  rows: string[][];
}) {
  const { colors } = useThemeTokens();
  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={[styles.tableRow, styles.tableHead, { backgroundColor: mixHex(colors.card, colors.track, 0.6) }]}>
        {columns.map((column) => (
          <ThemedText
            key={column.label}
            tone="muted"
            numberOfLines={1}
            style={[styles.headCell, { flex: column.flex, textAlign: column.right ? 'right' : 'left' }]}>
            {column.label}
          </ThemedText>
        ))}
      </View>
      {rows.map((row, rowIndex) => (
        <View key={rowIndex} style={[styles.tableRow, rowIndex > 0 && { borderTopWidth: 1, borderTopColor: colors.border }]}>
          {row.map((cell, cellIndex) => (
            <ThemedText
              key={cellIndex}
              numberOfLines={1}
              adjustsFontSizeToFit
              style={[
                styles.cell,
                { color: colors.text, flex: columns[cellIndex].flex, textAlign: columns[cellIndex].right ? 'right' : 'left' },
              ]}>
              {cell}
            </ThemedText>
          ))}
        </View>
      ))}
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
    paddingTop: 4,
    paddingBottom: 48,
  },
  chipRow: {
    gap: 8,
    paddingVertical: 2,
  },
  chipScroll: {
    flexGrow: 0,
    flexShrink: 0,
    marginTop: 4,
  },
  slider: {
    marginTop: 4,
    paddingRight: 4,
  },
  sectionTitle: {
    marginTop: 8,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '700',
  },
  chartTitle: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '700',
  },
  footnote: {
    borderTopWidth: 1,
    paddingVertical: 12,
  },
  chartBlock: {
    gap: 10,
    borderTopWidth: 1,
    paddingTop: 14,
    paddingBottom: 14,
  },
  whatIfBlock: {
    gap: 10,
  },
  whatIf: {
    fontSize: 13,
    lineHeight: 19,
  },
  whatIfStrong: {
    fontWeight: '700',
  },
  whatIfLink: {
    fontWeight: '700',
    textDecorationLine: 'underline',
  },
  extraChoices: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  chip: {
    height: 34,
    justifyContent: 'center',
    paddingHorizontal: 14,
    borderWidth: 1,
    borderRadius: 17,
  },
  chipLabel: {
    fontSize: 13,
    lineHeight: 18,
  },
  chipSmall: {
    height: 30,
    justifyContent: 'center',
    paddingHorizontal: 12,
    borderWidth: 1,
    borderRadius: 15,
  },
  chipSmallLabel: {
    fontSize: 12,
    lineHeight: 16,
  },
  card: {
    borderWidth: 1,
    borderRadius: 16,
    overflow: 'hidden',
  },
  inputRow: {
    paddingTop: 8,
    paddingBottom: 8,
    paddingLeft: 14,
    paddingRight: 10,
  },
  inputLine: {
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  inputLabel: {
    flex: 1,
    minWidth: 0,
    fontSize: 14,
    lineHeight: 18,
  },
  field: {
    width: 152,
    height: 40,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 4,
    paddingHorizontal: 12,
    borderRadius: 10,
  },
  prefix: {
    fontSize: 16,
    lineHeight: 20,
    fontWeight: '500',
  },
  fieldInput: {
    flex: 1,
    minWidth: 0,
    height: 40,
    padding: 0,
    textAlign: 'right',
    fontSize: 16,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  suffix: {
    flexShrink: 0,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500',
  },
  note: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: 16,
  },
  noteIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  noteText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
  },
  result: {
    paddingTop: 16,
    paddingHorizontal: 16,
    paddingBottom: 4,
  },
  resultEyebrow: {
    fontSize: 13,
    lineHeight: 18,
  },
  resultFigure: {
    marginTop: 4,
    marginBottom: 2,
    fontSize: 34,
    lineHeight: 40,
    fontWeight: '800',
    letterSpacing: -0.5,
    fontVariant: ['tabular-nums'],
  },
  split: {
    height: 10,
    flexDirection: 'row',
    gap: 2,
    marginTop: 14,
    borderRadius: 5,
    overflow: 'hidden',
  },
  legend: {
    marginTop: 10,
  },
  legendRow: {
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  swatch: {
    width: 10,
    height: 10,
    borderRadius: 3,
  },
  legendLabel: {
    flex: 1,
    fontSize: 14,
    lineHeight: 18,
  },
  legendValue: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  bold: {
    fontWeight: '600',
  },
  bolder: {
    fontWeight: '700',
  },
  toggle: {
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  toggleLabel: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
  },
  tableRow: {
    height: 42,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
  },
  tableHead: {
    height: 36,
  },
  headCell: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '500',
  },
  cell: {
    fontSize: 14,
    lineHeight: 18,
    fontVariant: ['tabular-nums'],
  },
  pressed: {
    opacity: 0.7,
  },
});
