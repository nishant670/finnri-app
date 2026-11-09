import { API_BASE_URL } from './transactions';
import { ApiFieldErrors, readApiError } from './api-error';

/**
 * Card EMI plans.
 *
 * The behaviour worth holding on to while reading this: converting a purchase
 * to instalments blocks its **full principal** against the card's limit right
 * away, and gives it back a slice at a time as each instalment's principal is
 * paid. Only the principal releases limit — interest is a charge, not a
 * repayment of what was borrowed — so a card on an interest-bearing plan frees
 * up less headroom each month than the instalment it pays.
 *
 * See `internal/http/card_emi.go`.
 */

/**
 * `scheduled` — blocking the limit.
 * `billed` — on a statement, so already inside that bill's total; it stops
 *   counting as blocked at the same moment, or the same rupee would reduce the
 *   available limit twice.
 * `paid` — the statement was settled and the principal is released.
 */
export type EMIInstallmentStatus = 'scheduled' | 'billed' | 'paid';

export type EMIPlanStatus = 'active' | 'closed' | 'foreclosed';

export type EMIInstallment = {
    id: number;
    plan_id: number;
    account_id: number;
    seq: number;
    due_date: string;
    /** Principal plus interest — what the statement bills. */
    amount: number;
    /** The only part that releases limit. */
    principal_part: number;
    interest_part: number;
    status: EMIInstallmentStatus;
    statement_id?: number | null;
    entry_id?: number | null;
};

export type EMIPlanProgress = {
    installments_total: number;
    /** Billed or paid: once on a bill, an instalment is owed on the card, not the plan. */
    installments_paid: number;
    /** Principal of the instalments not yet on a bill. */
    principal_remaining: number;
    principal_repaid: number;
    /** Still holding limit — scheduled instalments only. */
    blocked_principal: number;
    amount_remaining: number;
    /** The first instalment not yet on a bill. */
    next_due_date?: string;
    next_amount?: number;
};

export type EMIPlan = {
    id: number;
    account_id: number;
    title: string;
    merchant?: string;
    category?: string;
    /** The purchase amount, and what was blocked at the start. */
    principal: number;
    annual_rate_pct: number;
    tenure_months: number;
    monthly_amount: number;
    total_interest: number;
    currency: string;
    purchased_on: string;
    first_installment: string;
    status: EMIPlanStatus;
    source_entry_id?: number | null;
    notes?: string;
    installments?: EMIInstallment[];
    progress: EMIPlanProgress;
    created_at?: string;
    updated_at?: string;
};

export type EMIPlanPayload = {
    title: string;
    merchant?: string;
    category?: string;
    principal: number;
    annual_rate_pct: number;
    tenure_months: number;
    purchased_on: string;
    first_installment?: string;
    /** An already-logged purchase to convert. That entry is removed. */
    source_entry_id?: number | null;
    notes?: string;
};

export class EMIPlanApiError extends Error {
    status: number;
    code?: string;
    fields?: ApiFieldErrors;

    constructor(message: string, status: number, code?: string, fields?: ApiFieldErrors) {
        super(message);
        this.name = 'EMIPlanApiError';
        this.status = status;
        this.code = code;
        this.fields = fields;
    }
}

const emiFieldLabels: Record<string, string> = {
    title: 'What you bought',
    principal: 'Purchase amount',
    annual_rate_pct: 'Interest rate',
    tenure_months: 'Tenure',
    purchased_on: 'Purchase date',
    first_installment: 'First instalment',
};

const readEMIError = async (response: Response, fallback: string): Promise<EMIPlanApiError> => {
    const apiError = await readApiError(response, fallback, emiFieldLabels);
    return new EMIPlanApiError(apiError.message, apiError.status, apiError.code, apiError.fields);
};

export const fetchCardEMIPlans = async (token: string, accountId: number): Promise<EMIPlan[]> => {
    const response = await fetch(`${API_BASE_URL}/v1/accounts/${accountId}/emi-plans`, {
        headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
        throw await readEMIError(response, 'Unable to load EMI plans right now.');
    }
    const payload: unknown = await response.json();
    return Array.isArray(payload) ? (payload as EMIPlan[]) : [];
};

export const createCardEMIPlan = async (
    token: string,
    accountId: number,
    payload: EMIPlanPayload,
): Promise<EMIPlan> => {
    const response = await fetch(`${API_BASE_URL}/v1/accounts/${accountId}/emi-plans`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
    });
    if (!response.ok) {
        throw await readEMIError(response, 'Unable to create this EMI plan right now.');
    }
    return response.json();
};

export const fetchEMIPlan = async (token: string, planId: number): Promise<EMIPlan> => {
    const response = await fetch(`${API_BASE_URL}/v1/emi-plans/${planId}`, {
        headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
        throw await readEMIError(response, 'Unable to load this EMI plan right now.');
    }
    return response.json();
};

/** Pays a plan off early, releasing all remaining principal at once. */
export const forecloseEMIPlan = async (token: string, planId: number): Promise<EMIPlan> => {
    const response = await fetch(`${API_BASE_URL}/v1/emi-plans/${planId}/foreclose`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
        throw await readEMIError(response, 'Unable to foreclose this plan right now.');
    }
    return response.json();
};

export const deleteEMIPlan = async (token: string, planId: number): Promise<void> => {
    const response = await fetch(`${API_BASE_URL}/v1/emi-plans/${planId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
        throw await readEMIError(response, 'Unable to delete this plan right now.');
    }
};

/* ------------------------------------------------------------------ *
 * Display helpers
 * ------------------------------------------------------------------ */

/** "4 of 12 paid" */
export const formatEMIProgress = (progress: EMIPlanProgress) =>
    `${progress.installments_paid} of ${progress.installments_total} paid`;

export const emiInstallmentStatusLabels: Record<EMIInstallmentStatus, string> = {
    scheduled: 'Upcoming',
    billed: 'On this bill',
    paid: 'Paid',
};

/**
 * A no-cost EMI is the common case in India, and it is worth naming: every
 * rupee of the instalment repays principal, so the limit comes back at exactly
 * the rate the user pays.
 */
export const isNoCostEMI = (plan: EMIPlan) => plan.annual_rate_pct === 0;
