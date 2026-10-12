import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ScreenHeader } from '@/components/navigation/ScreenHeader';
import { ThemedText } from '@/components/themed-text';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { StateView } from '@/components/ui/StateView';
import { Fonts } from '@/constants/theme';
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
  { label: '1Y', months: 12 },
  { label: '3Y', months: 36 },
  { label: '5Y', months: 60 },
  { label: '20Y', months: 240 },
];

type ToolID = 'sip' | 'emi';

const toolOptions: {
  id: ToolID;
  label: string;
  caption: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
}[] = [
  { id: 'sip', label: 'SIP', caption: 'Investments', icon: 'chart-timeline-variant' },
  { id: 'emi', label: 'EMI', caption: 'Loans', icon: 'calculator-variant' },
];

const parseDecimalInput = (value: string) => Number(value.replace(/,/g, '').trim());

const sanitizeNumericInput = (value: string) => value.replace(/[^0-9.]/g, '');

export default function ToolsScreen() {
  const router = useRouter();
  const { token } = useAuthStore();
  const themeTokens = useThemeTokens();
  const theme = themeTokens.colors;
  const borderColor = theme.border;
  const mutedText = `${theme.text}99`;

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
  const activeToolOption = useMemo(
    () => toolOptions.find((tool) => tool.id === activeTool) ?? toolOptions[0],
    [activeTool]
  );

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
      <SafeAreaView
        className="flex-1"
        style={{ backgroundColor: theme.background }}
        edges={['top', 'left', 'right']}>
        <ScreenHeader title="Tools" onBack={() => router.back()} />
        <View className="flex-1 justify-center">
          <StateView
            icon="calculator-variant-outline"
            title="Sign in required"
            message="Your session is needed before using financial tools."
          />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      className="flex-1"
      style={{ backgroundColor: theme.background }}
      edges={['top', 'left', 'right']}>
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScreenHeader
          title="Tools"
          subtitle={`${activeToolOption.label} calculator`}
          onBack={() => router.back()}
        />

        <ScrollView
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            paddingHorizontal: 16,
            paddingTop: 4,
            paddingBottom: 110,
            gap: 16,
          }}>
          <ToolSelector
            activeTool={activeTool}
            onSelect={(tool) => {
              setActiveTool(tool);
              setShowFullSchedule(false);
            }}
            accentColor={theme.accent}
            borderColor={borderColor}
            secondaryColor={theme.secondary}
            surfaceColor={theme.card}
            textColor={theme.text}
            mutedTextColor={mutedText}
          />

          {activeTool === 'sip' ? (
            <>
              <View
                className="rounded-3xl border p-4"
                style={{ backgroundColor: theme.card, borderColor }}>
                <View className="mb-4 flex-row items-center gap-3">
                  <View
                    className="h-11 w-11 items-center justify-center rounded-full"
                    style={{ backgroundColor: theme.secondary }}>
                    <MaterialCommunityIcons name="chart-timeline-variant" size={24} color={theme.accent} />
                  </View>
                  <View className="flex-1">
                    <ThemedText className="text-lg font-black">SIP details</ThemedText>
                    <ThemedText className="text-xs" style={{ color: mutedText }}>
                      Editable projection assumptions
                    </ThemedText>
                  </View>
                </View>

                <PresetRow
                  values={sipPresets.map((preset) => ({
                    label: preset.label,
                    active: activeSIPPresetID === preset.id,
                    onPress: () => applySIPPreset(preset),
                  }))}
                  accentColor={theme.accent}
                  borderColor={borderColor}
                  secondaryColor={theme.secondary}
                  textColor={theme.text}
                />

                <MoneyInput
                  label="Monthly investment"
                  value={sipMonthlyInvestment}
                  onChangeText={(value) => setSipMonthlyInvestment(sanitizeNumericInput(value))}
                  placeholder="10000"
                  accentColor={theme.accent}
                  borderColor={borderColor}
                  textColor={theme.text}
                  mutedTextColor={mutedText}
                />
                <LabeledInput
                  label="Expected return"
                  suffix="% p.a."
                  value={sipExpectedReturn}
                  onChangeText={(value) => setSipExpectedReturn(sanitizeNumericInput(value))}
                  placeholder="12"
                  accentColor={theme.accent}
                  borderColor={borderColor}
                  textColor={theme.text}
                  mutedTextColor={mutedText}
                />
                <LabeledInput
                  label="Tenure"
                  suffix="years"
                  value={sipTenureYears}
                  onChangeText={(value) => setSipTenureYears(sanitizeNumericInput(value))}
                  placeholder="10"
                  accentColor={theme.accent}
                  borderColor={borderColor}
                  textColor={theme.text}
                  mutedTextColor={mutedText}
                />
                <LabeledInput
                  label="Annual step-up"
                  suffix="%"
                  value={sipAnnualStepUp}
                  onChangeText={(value) => setSipAnnualStepUp(sanitizeNumericInput(value))}
                  placeholder="0"
                  accentColor={theme.accent}
                  borderColor={borderColor}
                  textColor={theme.text}
                  mutedTextColor={mutedText}
                />
                <MoneyInput
                  label="Current corpus"
                  value={sipCurrentCorpus}
                  onChangeText={(value) => setSipCurrentCorpus(sanitizeNumericInput(value))}
                  placeholder="0"
                  accentColor={theme.accent}
                  borderColor={borderColor}
                  textColor={theme.text}
                  mutedTextColor={mutedText}
                />

                {sipError ? (
                  <ErrorBanner message={sipError} style={{ marginTop: 16 }} />
                ) : null}

                <Pressable
                  accessibilityRole="button"
                  onPress={handleCalculateSIP}
                  className="mt-5 h-12 flex-row items-center justify-center rounded-full"
                  style={{ backgroundColor: theme.accent }}>
                  <ThemedText tone="onAccent" className="text-sm font-black">Calculate SIP</ThemedText>
                </Pressable>
              </View>

              {sipResult ? (
                <>
                  <View
                    className="rounded-3xl border p-4"
                    style={{ backgroundColor: theme.card, borderColor }}>
                    <ThemedText className="mb-3 text-lg font-black">Projection</ThemedText>
                    <View className="rounded-3xl p-4" style={{ backgroundColor: theme.secondary }}>
                      <ThemedText className="text-xs font-bold" style={{ color: theme.accent }}>
                        Maturity value
                      </ThemedText>
                      <ThemedText
                        className="mt-1 text-3xl font-black"
                        numberOfLines={1}
                        adjustsFontSizeToFit>
                        {formatMoney(sipResult.maturityValue)}
                      </ThemedText>
                    </View>

                    <View className="mt-4 flex-row gap-3">
                      <SummaryTile
                        label="Invested"
                        value={formatMoney(sipResult.investedAmount)}
                        icon="cash-plus"
                        accentColor={theme.accent}
                        borderColor={borderColor}
                        textColor={theme.text}
                        mutedTextColor={mutedText}
                      />
                      <SummaryTile
                        label="Returns"
                        value={formatMoney(sipResult.estimatedReturns)}
                        icon="trending-up"
                        accentColor={theme.accent}
                        borderColor={borderColor}
                        textColor={theme.text}
                        mutedTextColor={mutedText}
                      />
                    </View>
                  </View>

                  <View
                    className="rounded-3xl border p-4"
                    style={{ backgroundColor: theme.card, borderColor }}>
                    <View className="mb-3 flex-row items-center justify-between">
                      <ThemedText className="text-lg font-black">Yearly view</ThemedText>
                      <Pressable
                        accessibilityRole="button"
                        onPress={() => setShowFullSchedule((current) => !current)}
                        className="h-9 justify-center rounded-full px-3"
                        style={{ backgroundColor: theme.secondary }}>
                        <ThemedText className="text-xs font-black" style={{ color: theme.accent }}>
                          {showFullSchedule ? 'Show less' : 'Show all'}
                        </ThemedText>
                      </Pressable>
                    </View>

                    <View className="mb-2 flex-row rounded-2xl px-3 py-2" style={{ backgroundColor: theme.secondary }}>
                      <ScheduleHeader label="Year" flex={0.8} color={mutedText} />
                      <ScheduleHeader label="Invested" flex={1.3} color={mutedText} />
                      <ScheduleHeader label="Value" flex={1.3} color={mutedText} alignRight />
                    </View>
                    {visibleSIPBreakdown.map((year) => (
                      <View key={year.year} className="flex-row border-b px-3 py-3" style={{ borderColor }}>
                        <ThemedText className="text-xs font-black" style={{ flex: 0.8 }}>
                          {year.year}
                        </ThemedText>
                        <ThemedText className="text-xs font-bold" style={{ flex: 1.3, color: mutedText }}>
                          {formatMoney(year.yearlyInvestment)}
                        </ThemedText>
                        <ThemedText
                          className="text-xs font-bold"
                          style={{ flex: 1.3, color: mutedText, textAlign: 'right' }}>
                          {formatMoney(year.yearEndValue)}
                        </ThemedText>
                      </View>
                    ))}
                  </View>
                </>
              ) : (
                <StateView
                  compact
                  icon="chart-timeline-variant"
                  title="No projection yet"
                  message="Choose a preset or custom values to calculate projected maturity."
                />
              )}
            </>
          ) : null}

          {activeTool === 'emi' ? (
            <>
          <View
            className="rounded-3xl border p-4"
            style={{ backgroundColor: theme.card, borderColor }}>
            <View className="mb-4 flex-row items-center gap-3">
              <View
                className="h-11 w-11 items-center justify-center rounded-full"
                style={{ backgroundColor: theme.secondary }}>
                <MaterialCommunityIcons name="calculator-variant" size={24} color={theme.accent} />
              </View>
              <View className="flex-1">
                <ThemedText className="text-lg font-black">Loan details</ThemedText>
                <ThemedText className="text-xs" style={{ color: mutedText }}>
                  INR · fixed monthly payment
                </ThemedText>
              </View>
            </View>

            <MoneyInput
              label="Loan amount"
              value={principal}
              onChangeText={(value) => setPrincipal(sanitizeNumericInput(value))}
              placeholder="500000"
              accentColor={theme.accent}
              borderColor={borderColor}
              textColor={theme.text}
              mutedTextColor={mutedText}
            />

            <LabeledInput
              label="Annual interest"
              suffix="%"
              value={rate}
              onChangeText={(value) => setRate(sanitizeNumericInput(value))}
              placeholder="10.5"
              accentColor={theme.accent}
              borderColor={borderColor}
              textColor={theme.text}
              mutedTextColor={mutedText}
            />
            <PresetRow
              values={ratePresets.map((preset) => ({
                label: `${preset}%`,
                active: Number(rate) === preset,
                onPress: () => setRate(String(preset)),
              }))}
              accentColor={theme.accent}
              borderColor={borderColor}
              secondaryColor={theme.secondary}
              textColor={theme.text}
            />

            <LabeledInput
              label="Tenure"
              suffix="months"
              value={tenure}
              onChangeText={(value) => setTenure(sanitizeNumericInput(value))}
              placeholder="60"
              accentColor={theme.accent}
              borderColor={borderColor}
              textColor={theme.text}
              mutedTextColor={mutedText}
            />
            <PresetRow
              values={tenurePresets.map((preset) => ({
                label: preset.label,
                active: Number(tenure) === preset.months,
                onPress: () => setTenure(String(preset.months)),
              }))}
              accentColor={theme.accent}
              borderColor={borderColor}
              secondaryColor={theme.secondary}
              textColor={theme.text}
            />

            {error ? <ErrorBanner message={error} style={{ marginTop: 16 }} /> : null}

            <Pressable
              accessibilityRole="button"
              disabled={calculating}
              onPress={handleCalculateEMI}
              className="mt-5 h-12 flex-row items-center justify-center gap-2 rounded-full"
              style={{ backgroundColor: calculating ? `${theme.accent}88` : theme.accent }}>
              {calculating ? <ActivityIndicator color={theme.onAccent} size="small" /> : null}
              <ThemedText tone="onAccent" className="text-sm font-black">
                {calculating ? 'Calculating' : 'Calculate EMI'}
              </ThemedText>
            </Pressable>
          </View>

          {result ? (
            <>
              <View
                className="rounded-3xl border p-4"
                style={{ backgroundColor: theme.card, borderColor }}>
                <ThemedText className="mb-3 text-lg font-black">Result</ThemedText>
                <View
                  className="rounded-3xl p-4"
                  style={{ backgroundColor: theme.secondary }}>
                  <ThemedText className="text-xs font-bold" style={{ color: theme.accent }}>
                    Monthly EMI
                  </ThemedText>
                  <ThemedText
                    className="mt-1 text-3xl font-black"
                    numberOfLines={1}
                    adjustsFontSizeToFit>
                    {formatMoney(result.monthly_emi)}
                  </ThemedText>
                </View>

                <View className="mt-4 flex-row gap-3">
                  <SummaryTile
                    label="Interest"
                    value={formatMoney(result.total_interest)}
                    icon="percent-outline"
                    accentColor={theme.accent}
                    borderColor={borderColor}
                    textColor={theme.text}
                    mutedTextColor={mutedText}
                  />
                  <SummaryTile
                    label="Total"
                    value={formatMoney(result.total_payment)}
                    icon="cash-multiple"
                    accentColor={theme.accent}
                    borderColor={borderColor}
                    textColor={theme.text}
                    mutedTextColor={mutedText}
                  />
                </View>
              </View>

              <View
                className="rounded-3xl border p-4"
                style={{ backgroundColor: theme.card, borderColor }}>
                <View className="mb-3 flex-row items-center justify-between">
                  <ThemedText className="text-lg font-black">Schedule</ThemedText>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => setShowFullSchedule((current) => !current)}
                    className="h-9 justify-center rounded-full px-3"
                    style={{ backgroundColor: theme.secondary }}>
                    <ThemedText className="text-xs font-black" style={{ color: theme.accent }}>
                      {showFullSchedule ? 'Show less' : 'Show all'}
                    </ThemedText>
                  </Pressable>
                </View>

                <View
                  className="mb-2 flex-row rounded-2xl px-3 py-2"
                  style={{ backgroundColor: theme.secondary }}>
                  <ScheduleHeader label="Month" flex={0.8} color={mutedText} />
                  <ScheduleHeader label="Payment" flex={1.2} color={mutedText} />
                  <ScheduleHeader label="Principal" flex={1.2} color={mutedText} />
                  <ScheduleHeader label="Balance" flex={1.2} color={mutedText} alignRight />
                </View>

                {visibleSchedule.map((month) => (
                  <ScheduleRow
                    key={month.month}
                    month={month}
                    borderColor={borderColor}
                    mutedTextColor={mutedText}
                  />
                ))}
              </View>
            </>
          ) : (
            <StateView
              compact
              icon="calculator-variant-outline"
              title="No calculation yet"
              message="Enter loan details to see monthly EMI, total interest, and repayment schedule."
            />
          )}
            </>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

type InputProps = {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  accentColor: string;
  borderColor: string;
  textColor: string;
  mutedTextColor: string;
  suffix?: string;
};

function MoneyInput(props: InputProps) {
  return <LabeledInput {...props} prefix={CURRENCY_SYMBOL} />;
}

function LabeledInput({
  label,
  value,
  onChangeText,
  placeholder,
  accentColor,
  borderColor,
  textColor,
  mutedTextColor,
  prefix,
  suffix,
}: InputProps & { prefix?: string }) {
  return (
    <View className="mt-3">
      <ThemedText className="mb-2 text-xs font-black uppercase" style={{ color: mutedTextColor }}>
        {label}
      </ThemedText>
      <View
        className="flex-row items-center rounded-2xl border px-3"
        style={{ minHeight: 52, borderColor }}>
        {prefix ? (
          <ThemedText className="mr-2 text-lg font-black" style={{ color: accentColor }}>
            {prefix}
          </ThemedText>
        ) : null}
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={mutedTextColor}
          keyboardType="decimal-pad"
          className="min-h-12 flex-1 text-base"
          style={{ color: textColor, fontFamily: Fonts.title, fontWeight: '800' }}
        />
        {suffix ? (
          <ThemedText className="ml-2 text-sm font-bold" style={{ color: mutedTextColor }}>
            {suffix}
          </ThemedText>
        ) : null}
      </View>
    </View>
  );
}

type PresetRowProps = {
  values: {
    label: string;
    active: boolean;
    onPress: () => void;
  }[];
  accentColor: string;
  borderColor: string;
  secondaryColor: string;
  textColor: string;
};

function PresetRow({ values, accentColor, borderColor, secondaryColor, textColor }: PresetRowProps) {
  return (
    <View className="mt-2 flex-row flex-wrap gap-2">
      {values.map((preset) => (
        <Pressable
          key={preset.label}
          accessibilityRole="button"
          onPress={preset.onPress}
          className="h-9 justify-center rounded-full border px-4"
          style={{
            backgroundColor: preset.active ? secondaryColor : 'transparent',
            borderColor: preset.active ? accentColor : borderColor,
          }}>
          <ThemedText
            className="text-xs font-black"
            style={{ color: preset.active ? accentColor : textColor }}>
            {preset.label}
          </ThemedText>
        </Pressable>
      ))}
    </View>
  );
}

type ToolSelectorProps = {
  activeTool: ToolID;
  onSelect: (tool: ToolID) => void;
  accentColor: string;
  borderColor: string;
  secondaryColor: string;
  surfaceColor: string;
  textColor: string;
  mutedTextColor: string;
};

function ToolSelector({
  activeTool,
  onSelect,
  accentColor,
  borderColor,
  secondaryColor,
  surfaceColor,
  textColor,
  mutedTextColor,
}: ToolSelectorProps) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
      {toolOptions.map((tool) => {
        const active = activeTool === tool.id;
        return (
          <Pressable
            key={tool.id}
            accessibilityRole="button"
            onPress={() => onSelect(tool.id)}
            className="min-w-28 rounded-3xl border p-3"
            style={{
              backgroundColor: active ? secondaryColor : surfaceColor,
              borderColor: active ? accentColor : borderColor,
            }}>
            <View className="mb-3 flex-row items-center justify-between">
              <MaterialCommunityIcons
                name={tool.icon}
                size={20}
                color={accentColor}
              />
            </View>
            <ThemedText className="text-sm font-black" style={{ color: textColor }}>
              {tool.label}
            </ThemedText>
            <ThemedText className="mt-1 text-xs" style={{ color: mutedTextColor }}>
              {tool.caption}
            </ThemedText>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

type SummaryTileProps = {
  label: string;
  value: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  accentColor: string;
  borderColor: string;
  textColor: string;
  mutedTextColor: string;
};

function SummaryTile({
  label,
  value,
  icon,
  accentColor,
  borderColor,
  textColor,
  mutedTextColor,
}: SummaryTileProps) {
  return (
    <View className="flex-1 rounded-3xl border p-3" style={{ borderColor }}>
      <MaterialCommunityIcons name={icon} size={18} color={accentColor} />
      <ThemedText className="mt-2 text-xs font-bold" style={{ color: mutedTextColor }}>
        {label}
      </ThemedText>
      <ThemedText className="mt-1 text-base font-black" style={{ color: textColor }}>
        {value}
      </ThemedText>
    </View>
  );
}

function ScheduleHeader({
  label,
  flex,
  color,
  alignRight = false,
}: {
  label: string;
  flex: number;
  color: string;
  alignRight?: boolean;
}) {
  return (
    <ThemedText
      className="text-[10px] font-black uppercase"
      style={{ flex, color, textAlign: alignRight ? 'right' : 'left' }}>
      {label}
    </ThemedText>
  );
}

function ScheduleRow({
  month,
  borderColor,
  mutedTextColor,
}: {
  month: EMIScheduleMonth;
  borderColor: string;
  mutedTextColor: string;
}) {
  return (
    <View className="flex-row border-b px-3 py-3" style={{ borderColor }}>
      <ThemedText className="text-xs font-black" style={{ flex: 0.8 }}>
        {month.month}
      </ThemedText>
      <ThemedText className="text-xs font-bold" style={{ flex: 1.2, color: mutedTextColor }}>
        {formatMoney(month.payment_amount)}
      </ThemedText>
      <ThemedText className="text-xs font-bold" style={{ flex: 1.2, color: mutedTextColor }}>
        {formatMoney(month.principal_amount)}
      </ThemedText>
      <ThemedText
        className="text-xs font-bold"
        style={{ flex: 1.2, color: mutedTextColor, textAlign: 'right' }}>
        {formatMoney(month.closing_balance)}
      </ThemedText>
    </View>
  );
}
