import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
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
import { PrimaryButton } from '@/components/ui/Button';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { PressableView } from '@/components/ui/PressableView';
import { Segments } from '@/components/ui/Segments';
import { StateView } from '@/components/ui/StateView';
import { Fonts, mixHex } from '@/constants/theme';
import { useAuthStore } from '@/hooks/use-auth-store';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import { CURRENCY_SYMBOL } from '@/constants/Currency';
import { getFriendlyErrorMessage } from '@/lib/api-error';
import { formatMoney } from '@/lib/money';
import { calculateEMI, type EMICalculation, type EMIScheduleMonth } from '@/lib/emi';
import {
  calculateSIP,
  sipPresets,
  type SIPCalculation,
  type SIPPreset,
  type SIPPresetID,
} from '@/lib/sip';

const ratePresets = [8.5, 9.5, 10.5, 12];
const tenurePresets = [
  { label: '1 yr', months: 12 },
  { label: '3 yrs', months: 36 },
  { label: '5 yrs', months: 60 },
  { label: '20 yrs', months: 240 },
];

type ToolID = 'sip' | 'emi';

const toolOptions = [
  { key: 'sip', label: 'SIP · Investments', testID: 'tools-tab-sip' },
  { key: 'emi', label: 'EMI · Loans', testID: 'tools-tab-emi' },
] as const;

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

const parseDecimalInput = (value: string) => Number(value.replace(/,/g, '').trim());

const sanitizeNumericInput = (value: string) => value.replace(/[^0-9.]/g, '');

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

export default function ToolsScreen() {
  const router = useRouter();
  const { token } = useAuthStore();
  const { colors } = useThemeTokens();

  const [activeTool, setActiveTool] = useState<ToolID>('sip');

  const [activeSIPPresetID, setActiveSIPPresetID] = useState<SIPPresetID>('mutual_fund');
  const [sipMonthlyInvestment, setSipMonthlyInvestment] = useState('10000');
  const [sipExpectedReturn, setSipExpectedReturn] = useState('12');
  const [sipTenureYears, setSipTenureYears] = useState('10');
  const [sipAnnualStepUp, setSipAnnualStepUp] = useState('10');
  const [sipCurrentCorpus, setSipCurrentCorpus] = useState('0');
  const [sipResult, setSipResult] = useState<SIPCalculation | null>(null);
  const [sipError, setSipError] = useState<string | null>(null);

  const [principal, setPrincipal] = useState('500000');
  const [rate, setRate] = useState('10.5');
  const [tenure, setTenure] = useState('60');
  const [result, setResult] = useState<EMICalculation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [calculating, setCalculating] = useState(false);
  const [showFullSchedule, setShowFullSchedule] = useState(false);

  const visibleSchedule = result?.schedule.slice(0, showFullSchedule ? undefined : 12) ?? [];
  const visibleSIPBreakdown = sipResult?.breakdown.slice(0, showFullSchedule ? undefined : 10) ?? [];

  /*
   * A result describes the inputs it was worked out from. Changing any of them
   * used to leave the old answer on screen under the new numbers (a fix drawn
   * into board R11-SIP), so an edit now clears it until Calculate is pressed.
   */
  const editSIP = (setter: (value: string) => void) => (value: string) => {
    setter(sanitizeNumericInput(value));
    setSipResult(null);
    setShowFullSchedule(false);
  };
  const editEMI = (setter: (value: string) => void) => (value: string) => {
    setter(sanitizeNumericInput(value));
    setResult(null);
    setShowFullSchedule(false);
  };

  const applySIPPreset = (preset: SIPPreset) => {
    setActiveSIPPresetID(preset.id);
    setSipMonthlyInvestment(String(preset.monthlyInvestment));
    setSipExpectedReturn(String(preset.expectedAnnualReturnPercent));
    setSipTenureYears(String(preset.tenureYears));
    setSipAnnualStepUp(String(preset.annualStepUpPercent));
    setSipCurrentCorpus(String(preset.currentCorpus));
    setSipError(null);
    setSipResult(null);
    setShowFullSchedule(false);
  };

  const handleCalculateSIP = () => {
    const monthlyInvestment = parseDecimalInput(sipMonthlyInvestment);
    const expectedAnnualReturnPercent = parseDecimalInput(sipExpectedReturn);
    const tenureYears = parseDecimalInput(sipTenureYears);
    const annualStepUpPercent = parseDecimalInput(sipAnnualStepUp || '0');
    const currentCorpus = parseDecimalInput(sipCurrentCorpus || '0');
    const clientErrors: string[] = [];

    if (!Number.isFinite(monthlyInvestment) || monthlyInvestment <= 0) {
      clientErrors.push('Monthly investment must be positive.');
    }
    if (
      !Number.isFinite(expectedAnnualReturnPercent) ||
      expectedAnnualReturnPercent < 0 ||
      expectedAnnualReturnPercent > 100
    ) {
      clientErrors.push('Expected return must be between 0 and 100.');
    }
    if (!Number.isFinite(tenureYears) || tenureYears <= 0 || tenureYears > 60) {
      clientErrors.push('Tenure must be between 1 month and 60 years.');
    }
    if (!Number.isFinite(annualStepUpPercent) || annualStepUpPercent < 0 || annualStepUpPercent > 100) {
      clientErrors.push('Annual step-up must be between 0 and 100.');
    }
    if (!Number.isFinite(currentCorpus) || currentCorpus < 0) {
      clientErrors.push('Current corpus cannot be negative.');
    }

    if (clientErrors.length > 0) {
      setSipError(clientErrors.join('\n'));
      return;
    }

    setSipError(null);
    setSipResult(
      calculateSIP({
        monthlyInvestment,
        expectedAnnualReturnPercent,
        tenureYears,
        annualStepUpPercent,
        currentCorpus,
      })
    );
    setShowFullSchedule(false);
  };

  const handleCalculateEMI = async () => {
    if (!token || calculating) return;

    const principalAmount = parseDecimalInput(principal);
    const annualRate = parseDecimalInput(rate);
    const tenureMonths = Math.round(parseDecimalInput(tenure));
    const clientErrors: string[] = [];

    if (!Number.isFinite(principalAmount) || principalAmount <= 0) {
      clientErrors.push('Loan amount must be positive.');
    }
    if (!Number.isFinite(annualRate) || annualRate < 0 || annualRate > 100) {
      clientErrors.push('Interest rate must be between 0 and 100.');
    }
    if (!Number.isInteger(tenureMonths) || tenureMonths < 1 || tenureMonths > 360) {
      clientErrors.push('Tenure must be between 1 and 360 months.');
    }

    if (clientErrors.length > 0) {
      setError(clientErrors.join('\n'));
      return;
    }

    setCalculating(true);
    setError(null);
    try {
      const nextResult = await calculateEMI(token, {
        principal_amount: principalAmount,
        annual_interest_rate_percent: annualRate,
        tenure_months: tenureMonths,
      });
      setResult(nextResult);
      setShowFullSchedule(false);
    } catch (calculationError) {
      setError(getFriendlyErrorMessage(calculationError, 'Unable to calculate EMI.'));
    } finally {
      setCalculating(false);
    }
  };

  if (!token) {
    return (
      <SafeAreaView style={[styles.flex, { backgroundColor: colors.background }]} edges={['top', 'left', 'right']}>
        <ScreenHeader title="Calculators" onBack={() => router.back()} />
        <View style={[styles.flex, { justifyContent: 'center' }]}>
          <StateView
            icon="calculator-variant-outline"
            title="Sign in required"
            message="Your session is needed before using financial tools."
          />
        </View>
      </SafeAreaView>
    );
  }

  const sipMonthly = parseDecimalInput(sipMonthlyInvestment);
  const emiPrincipal = parseDecimalInput(principal);

  return (
    <SafeAreaView style={[styles.flex, { backgroundColor: colors.background }]} edges={['top', 'left', 'right']}>
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
              setShowFullSchedule(false);
            }}
          />

          {activeTool === 'sip' ? (
            <>
              <ThemedText tone="muted" style={styles.intro}>
                What a monthly investment could grow to. Pick a type to fill in typical values.
              </ThemedText>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.chipRow}
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
                <InputRow label="Monthly investment" prefix={CURRENCY_SYMBOL} value={sipMonthlyInvestment} onChangeText={editSIP(setSipMonthlyInvestment)} placeholder="10000" />
                <InputRow label="Expected return" suffix="% a year" value={sipExpectedReturn} onChangeText={editSIP(setSipExpectedReturn)} placeholder="12" divider />
                <InputRow label="Time period" suffix="years" value={sipTenureYears} onChangeText={editSIP(setSipTenureYears)} placeholder="10" divider />
                <InputRow label="Yearly step-up" suffix="%" value={sipAnnualStepUp} onChangeText={editSIP(setSipAnnualStepUp)} placeholder="0" divider />
                <InputRow label="Already invested" prefix={CURRENCY_SYMBOL} value={sipCurrentCorpus} onChangeText={editSIP(setSipCurrentCorpus)} placeholder="0" divider />
              </View>

              {sipError ? <ErrorBanner message={sipError} /> : null}
              <PrimaryButton testID="tools-calculate-sip" label="Calculate" onPress={handleCalculateSIP} />

              {sipResult ? (
                <>
                  <ResultCard
                    eyebrow={`In ${sipTenureYears} year${sipTenureYears === '1' ? '' : 's'}, you could have`}
                    figure={formatMoney(sipResult.maturityValue)}
                    caption={inWords(sipResult.maturityValue)}
                    parts={[
                      { label: 'You put in', amount: sipResult.investedAmount, color: withInk(colors.text) },
                      { label: 'Growth', amount: sipResult.estimatedReturns, color: colors.positive },
                    ]}
                  />
                  <TableHeading
                    title="Year by year"
                    total={sipResult.breakdown.length}
                    visible={visibleSIPBreakdown.length}
                    expanded={showFullSchedule}
                    onToggle={() => setShowFullSchedule((current) => !current)}
                  />
                  {/* "Added that year", not "Invested": the column is each year's
                      deposits beside a running value, and the old label made year
                      10 read like everything put in (a fix on board R11-SIP). */}
                  <Table
                    columns={[
                      { label: 'Year', flex: 0.6 },
                      { label: 'Added that year', flex: 1.4, right: true },
                      { label: 'Value at year end', flex: 1.6, right: true },
                    ]}
                    rows={visibleSIPBreakdown.map((year) => [
                      String(year.year),
                      formatMoney(year.yearlyInvestment),
                      formatMoney(year.yearEndValue),
                    ])}
                  />
                </>
              ) : (
                <StartNote
                  text={
                    Number.isFinite(sipMonthly) && sipMonthly > 0
                      ? `Press Calculate to see what ${formatMoney(sipMonthly)} a month could grow to.`
                      : 'Enter a monthly amount, then press Calculate.'
                  }
                />
              )}
            </>
          ) : (
            <>
              <ThemedText tone="muted" style={styles.intro}>
                What a loan costs you each month, and how much of it is interest.
              </ThemedText>
              <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <InputRow label="Loan amount" prefix={CURRENCY_SYMBOL} value={principal} onChangeText={editEMI(setPrincipal)} placeholder="500000" />
                <InputRow label="Interest" suffix="% a year" value={rate} onChangeText={editEMI(setRate)} placeholder="10.5" divider>
                  <View style={styles.presets} accessibilityRole="radiogroup" accessibilityLabel="Common rates">
                    {ratePresets.map((preset) => (
                      <Chip
                        key={preset}
                        small
                        label={`${preset}%`}
                        selected={Number(rate) === preset}
                        onPress={() => editEMI(setRate)(String(preset))}
                      />
                    ))}
                  </View>
                </InputRow>
                <InputRow label="Time period" suffix="months" value={tenure} onChangeText={editEMI(setTenure)} placeholder="60" divider>
                  <View style={styles.presets} accessibilityRole="radiogroup" accessibilityLabel="Common periods">
                    {tenurePresets.map((preset) => (
                      <Chip
                        key={preset.label}
                        small
                        label={preset.label}
                        selected={Number(tenure) === preset.months}
                        onPress={() => editEMI(setTenure)(String(preset.months))}
                      />
                    ))}
                  </View>
                </InputRow>
              </View>

              {error ? <ErrorBanner message={error} /> : null}
              <PrimaryButton
                testID="tools-calculate-emi"
                label={calculating ? 'Calculating' : 'Calculate'}
                loading={calculating}
                onPress={handleCalculateEMI}
              />

              {result ? (
                <>
                  <ResultCard
                    eyebrow="Monthly EMI"
                    figure={formatMoney(result.monthly_emi)}
                    caption={[
                      `for ${result.schedule.length} months`,
                      yearsLabel(result.schedule.length),
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                    parts={[
                      { label: 'Loan', amount: result.principal_amount, color: withInk(colors.text) },
                      { label: 'Interest', amount: result.total_interest, color: colors.warning },
                    ]}
                    total={{ label: 'You pay in total', amount: result.total_payment }}
                  />
                  <TableHeading
                    title="Month by month"
                    total={result.schedule.length}
                    visible={visibleSchedule.length}
                    expanded={showFullSchedule}
                    onToggle={() => setShowFullSchedule((current) => !current)}
                  />
                  {/* Interest has its own column now; the server always sent it
                      and the table left it out (a fix on board R11-EMI). */}
                  <Table
                    columns={[
                      { label: 'Month', flex: 0.6 },
                      { label: 'Principal', flex: 1.1, right: true },
                      { label: 'Interest', flex: 1, right: true },
                      { label: 'Balance', flex: 1.4, right: true },
                    ]}
                    rows={visibleSchedule.map((month: EMIScheduleMonth) => [
                      String(month.month),
                      formatMoney(month.principal_amount),
                      formatMoney(month.interest_amount),
                      formatMoney(month.closing_balance),
                    ])}
                  />
                </>
              ) : (
                <StartNote
                  icon="calculator-variant-outline"
                  text={
                    Number.isFinite(emiPrincipal) && emiPrincipal > 0
                      ? `Press Calculate to see the monthly EMI on ${formatMoney(emiPrincipal)}.`
                      : 'Enter a loan amount, then press Calculate.'
                  }
                />
              )}
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/** Ink at 22%, the quiet half of a split bar (what you put in, the loan itself). */
const withInk = (ink: string) => `${ink}38`;

/** One labelled value on the left, its field on the right (boards R11-SIP, R11-EMI). */
function InputRow({
  label,
  value,
  onChangeText,
  placeholder,
  prefix,
  suffix,
  divider = false,
  children,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  prefix?: string;
  suffix?: string;
  divider?: boolean;
  /** Under the row — its quick-pick chips. */
  children?: React.ReactNode;
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
      {children}
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

/** Before the first Calculate (board R11-SIP-Start): what pressing it will show. */
function StartNote({ text, icon = 'chart-line-variant' }: { text: string; icon?: keyof typeof MaterialCommunityIcons.glyphMap }) {
  const { colors } = useThemeTokens();
  return (
    <View style={[styles.note, { borderColor: colors.borderStrong }]}>
      <View style={[styles.noteIcon, { backgroundColor: mixHex(colors.card, colors.positive, 0.14) }]}>
        <MaterialCommunityIcons name={icon} size={16} color={colors.positive} />
      </View>
      <ThemedText tone="muted" style={[styles.noteText]}>
        {text}
      </ThemedText>
    </View>
  );
}

/** The answer: the figure, what it is made of as one split bar, and the parts as rows. */
function ResultCard({
  eyebrow,
  figure,
  caption,
  parts,
  total,
}: {
  eyebrow: string;
  figure: string;
  caption?: string | null;
  parts: { label: string; amount: number; color: string }[];
  total?: { label: string; amount: number };
}) {
  const { colors } = useThemeTokens();
  const sum = parts.reduce((acc, part) => acc + Math.max(0, part.amount), 0) || 1;
  return (
    <View style={[styles.card, styles.result, { backgroundColor: colors.card, borderColor: colors.border }]}>
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
    </View>
  );
}

function TableHeading({
  title,
  total,
  visible,
  expanded,
  onToggle,
}: {
  title: string;
  total: number;
  visible: number;
  expanded: boolean;
  onToggle: () => void;
}) {
  const { colors } = useThemeTokens();
  const canToggle = expanded || total > visible;
  return (
    <View style={styles.tableHeading}>
      <ThemedText accessibilityRole="header" style={[styles.tableTitle, { color: colors.text }]}>
        {title}
      </ThemedText>
      {canToggle ? (
        <Pressable accessibilityRole="button" onPress={onToggle} hitSlop={8} style={styles.toggle}>
          <ThemedText style={[styles.toggleLabel, { color: colors.text }]}>
            {expanded ? 'Show less' : `Show all ${total}`}
          </ThemedText>
        </Pressable>
      ) : null}
    </View>
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
  intro: {
    fontSize: 13,
    lineHeight: 18,
  },
  chipRow: {
    gap: 8,
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
  presets: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 8,
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
  tableHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
  },
  tableTitle: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '700',
  },
  toggle: {
    minHeight: 32,
    justifyContent: 'center',
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
