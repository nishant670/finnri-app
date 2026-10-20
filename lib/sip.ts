export type SIPPresetID = 'mutual_fund' | 'ppf' | 'nps' | 'rd' | 'custom';

export type SIPPreset = {
  id: SIPPresetID;
  label: string;
  monthlyInvestment: number;
  expectedAnnualReturnPercent: number;
  tenureYears: number;
  annualStepUpPercent: number;
  currentCorpus: number;
};

export type SIPCalculationInput = Omit<SIPPreset, 'id' | 'label'>;

export type SIPYearBreakdown = {
  year: number;
  yearlyInvestment: number;
  yearEndValue: number;
};

export type SIPCalculation = {
  investedAmount: number;
  estimatedReturns: number;
  maturityValue: number;
  monthlyInvestment: number;
  expectedAnnualReturnPercent: number;
  tenureYears: number;
  annualStepUpPercent: number;
  currentCorpus: number;
  breakdown: SIPYearBreakdown[];
};

export const sipPresets: SIPPreset[] = [
  {
    id: 'mutual_fund',
    label: 'Mutual funds',
    monthlyInvestment: 10000,
    expectedAnnualReturnPercent: 12,
    tenureYears: 10,
    annualStepUpPercent: 10,
    currentCorpus: 0,
  },
  {
    id: 'ppf',
    label: 'PPF',
    monthlyInvestment: 12500,
    expectedAnnualReturnPercent: 7,
    tenureYears: 15,
    annualStepUpPercent: 0,
    currentCorpus: 0,
  },
  {
    id: 'nps',
    label: 'NPS',
    monthlyInvestment: 10000,
    expectedAnnualReturnPercent: 10,
    tenureYears: 20,
    annualStepUpPercent: 5,
    currentCorpus: 0,
  },
  {
    id: 'rd',
    label: 'RD',
    monthlyInvestment: 5000,
    expectedAnnualReturnPercent: 6.5,
    tenureYears: 5,
    annualStepUpPercent: 0,
    currentCorpus: 0,
  },
  {
    id: 'custom',
    label: 'Custom',
    monthlyInvestment: 10000,
    expectedAnnualReturnPercent: 8,
    tenureYears: 10,
    annualStepUpPercent: 0,
    currentCorpus: 0,
  },
];

export const calculateSIP = (input: SIPCalculationInput): SIPCalculation => {
  const monthlyRate = input.expectedAnnualReturnPercent / 12 / 100;
  const tenureMonths = Math.round(input.tenureYears * 12);
  let value = input.currentCorpus;
  let monthlyInvestment = input.monthlyInvestment;
  let investedAmount = input.currentCorpus;
  const breakdown: SIPYearBreakdown[] = [];

  for (let month = 1; month <= tenureMonths; month += 1) {
    value = value * (1 + monthlyRate) + monthlyInvestment;
    investedAmount += monthlyInvestment;

    if (month % 12 === 0 || month === tenureMonths) {
      breakdown.push({
        year: Math.ceil(month / 12),
        yearlyInvestment: monthlyInvestment * (month % 12 === 0 ? 12 : month % 12),
        yearEndValue: value,
      });
      monthlyInvestment *= 1 + input.annualStepUpPercent / 100;
    }
  }

  return {
    investedAmount,
    estimatedReturns: value - investedAmount,
    maturityValue: value,
    monthlyInvestment: input.monthlyInvestment,
    expectedAnnualReturnPercent: input.expectedAnnualReturnPercent,
    tenureYears: input.tenureYears,
    annualStepUpPercent: input.annualStepUpPercent,
    currentCorpus: input.currentCorpus,
    breakdown,
  };
};
