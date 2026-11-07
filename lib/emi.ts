import { ApiFieldErrors, readApiError } from './api-error';
import { API_BASE_URL } from './transactions';

export type EMICalculationPayload = {
  principal_amount: number;
  annual_interest_rate_percent: number;
  tenure_months: number;
  currency?: 'INR';
};

export type EMIScheduleMonth = {
  month: number;
  opening_balance: number;
  payment_amount: number;
  principal_amount: number;
  interest_amount: number;
  closing_balance: number;
};

export type EMICalculation = {
  principal_amount: number;
  currency: 'INR';
  annual_interest_rate_percent: number;
  tenure_months: number;
  monthly_emi: number;
  total_payment: number;
  total_interest: number;
  schedule: EMIScheduleMonth[];
};

export class EMIApiError extends Error {
  status: number;
  code?: string;
  fields?: ApiFieldErrors;

  constructor(message: string, status: number, code?: string, fields?: ApiFieldErrors) {
    super(message);
    this.name = 'EMIApiError';
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

const emiFieldLabels: Record<string, string> = {
  principal_amount: 'Loan amount',
  annual_interest_rate_percent: 'Interest rate',
  tenure_months: 'Tenure',
  currency: 'Currency',
};

const readEMIError = async (response: Response, fallback: string): Promise<EMIApiError> => {
  const apiError = await readApiError(response, fallback, emiFieldLabels);
  return new EMIApiError(apiError.message, apiError.status, apiError.code, apiError.fields);
};

const authHeaders = (token: string) => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${token}`,
});

const coerceScheduleMonth = (month: EMIScheduleMonth): EMIScheduleMonth => ({
  ...month,
  opening_balance: Number(month.opening_balance),
  payment_amount: Number(month.payment_amount),
  principal_amount: Number(month.principal_amount),
  interest_amount: Number(month.interest_amount),
  closing_balance: Number(month.closing_balance),
});

export const calculateEMI = async (
  token: string,
  payload: EMICalculationPayload,
): Promise<EMICalculation> => {
  const response = await fetch(`${API_BASE_URL}/v1/tools/emi/calculate`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({ ...payload, currency: payload.currency ?? 'INR' }),
  });

  if (!response.ok) {
    throw await readEMIError(response, 'Unable to calculate EMI right now.');
  }

  const result = (await response.json()) as EMICalculation;
  return {
    ...result,
    principal_amount: Number(result.principal_amount),
    annual_interest_rate_percent: Number(result.annual_interest_rate_percent),
    monthly_emi: Number(result.monthly_emi),
    total_payment: Number(result.total_payment),
    total_interest: Number(result.total_interest),
    schedule: (result.schedule ?? []).map(coerceScheduleMonth),
  };
};

/**
 * The EMI worked out on the phone (P50), the same way the server does it in
 * `internal/http/emi.go`: everything in paise, the instalment rounded once,
 * each month's interest rounded, and the last month taking whatever is left.
 * The calculator no longer waits for a connection or a sign-in, and the
 * figure moves as the inputs do.
 */
export const calculateEMILocal = (
  principalAmount: number,
  annualRatePercent: number,
  tenureMonths: number
): EMICalculation | null => {
  if (
    !Number.isFinite(principalAmount) ||
    principalAmount <= 0 ||
    !Number.isFinite(annualRatePercent) ||
    annualRatePercent < 0 ||
    annualRatePercent > 100 ||
    !Number.isInteger(tenureMonths) ||
    tenureMonths < 1 ||
    tenureMonths > 360
  ) {
    return null;
  }
  const principal = Math.round(principalAmount * 100);
  const monthlyRate = annualRatePercent / 12 / 100;
  const factor = Math.pow(1 + monthlyRate, tenureMonths);
  const monthlyEMI =
    monthlyRate === 0
      ? Math.round(principal / tenureMonths)
      : Math.round((principal * monthlyRate * factor) / (factor - 1));

  const schedule: EMIScheduleMonth[] = [];
  let balance = principal;
  let totalPayment = 0;
  let totalInterest = 0;
  for (let month = 1; month <= tenureMonths; month += 1) {
    const opening = balance;
    const interest = Math.round(opening * monthlyRate);
    let principalPayment = monthlyEMI - interest;
    if (principalPayment <= 0 || principalPayment > balance || month === tenureMonths) {
      principalPayment = balance;
    }
    const payment = principalPayment + interest;
    balance = Math.max(0, balance - principalPayment);
    totalPayment += payment;
    totalInterest += interest;
    schedule.push({
      month,
      opening_balance: opening / 100,
      payment_amount: payment / 100,
      principal_amount: principalPayment / 100,
      interest_amount: interest / 100,
      closing_balance: balance / 100,
    });
    if (balance === 0) break;
  }

  return {
    principal_amount: principal / 100,
    currency: 'INR',
    annual_interest_rate_percent: annualRatePercent,
    tenure_months: tenureMonths,
    monthly_emi: monthlyEMI / 100,
    total_payment: totalPayment / 100,
    total_interest: totalInterest / 100,
    schedule,
  };
};

export type EMIYear = { year: number; principal: number; interest: number };

/** Each year's payments split into principal and interest, for the chart (P52). */
export const emiYears = (schedule: EMIScheduleMonth[]): EMIYear[] => {
  const years: EMIYear[] = [];
  schedule.forEach((month) => {
    const index = Math.ceil(month.month / 12) - 1;
    years[index] ??= { year: index + 1, principal: 0, interest: 0 };
    years[index].principal += month.principal_amount;
    years[index].interest += month.interest_amount;
  });
  return years.map((year) => ({
    ...year,
    principal: Math.round(year.principal * 100) / 100,
    interest: Math.round(year.interest * 100) / 100,
  }));
};

/**
 * What paying `extra` more each month does (P54): the same loan and rate, a
 * bigger instalment, so it ends sooner and carries less interest.
 */
export const prepaymentWhatIf = (base: EMICalculation, extra: number) => {
  if (!(extra > 0)) return null;
  const principal = Math.round(base.principal_amount * 100);
  const monthlyRate = base.annual_interest_rate_percent / 12 / 100;
  const instalment = Math.round((base.monthly_emi + extra) * 100);
  let balance = principal;
  let months = 0;
  let interestPaid = 0;
  while (balance > 0 && months < 360 * 2) {
    const interest = Math.round(balance * monthlyRate);
    const principalPayment = Math.min(balance, Math.max(0, instalment - interest));
    if (principalPayment <= 0) return null;
    interestPaid += interest;
    balance -= principalPayment;
    months += 1;
  }
  const monthsSooner = base.schedule.length - months;
  const interestSaved = Math.round((base.total_interest * 100 - interestPaid) / 100);
  if (monthsSooner <= 0 && interestSaved <= 0) return null;
  return { months, monthsSooner, interestSaved };
};
