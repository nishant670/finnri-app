import { getClientTimeZone } from './datetime';
import { API_BASE_URL, type ApiEntry } from './transactions';

export type DashboardSummary = {
    total_spent: number;
    total_income: number;
    daily_average: number;
    transaction_count: number;
    lifetime_transaction_count?: number;
    /**
     * Expenses only, where `transaction_count` is every entry in the window.
     * Anything pairing a count with a *spend* figure must read this one — a
     * salary counted inside "spent X across N transactions" describes a
     * different set of rows than the total does.
     */
    expense_count?: number;
    /** Expense total for the window named by `period.previous_start/_end`. */
    previous_total_spent?: number;
    /**
     * Percent change in total spend against that window. Always 0 when
     * `spend_change_comparable` is false — read the flag first, never this alone.
     */
    spend_change?: number;
    /**
     * False when the previous window was too thin to divide by (under ₹500 or
     * fewer than 5 transactions). Show no comparison rather than a percentage
     * that describes a near-empty base.
     */
    spend_change_comparable?: boolean;
    /**
     * Investments in the window (SIPs, anything tagged Investment). Not part of
     * `total_spent`: they are not consumption. Absent from an older API, whose
     * `total_spent` still includes them.
     */
    total_invested?: number;
    /** Everything that left the account: spent plus invested. */
    money_out?: number;
};

/**
 * What left the account in the window. Investments are not spending, but the
 * money is gone today, so surplus and "over income" are measured against this.
 * An older API folded investments into `total_spent`, which then is the answer.
 */
export const moneyOutOf = (summary: DashboardSummary) =>
  summary.money_out ?? summary.total_spent;

export type DashboardCategory = {
    category: string;
    amount: number;
    percentage: number;
    change: number;
    /**
     * False when the previous window was too thin to divide by — under ₹500 or
     * fewer than 5 transactions in that category. `change` is 0 in that case;
     * show no trend rather than a percentage that describes a near-empty base.
     */
    change_comparable?: boolean;
};

export type DashboardPeriod = {
    start: string;
    end: string;
    /** The window every change on this response is measured against. */
    previous_start?: string;
    previous_end?: string;
    comparison_kind?: 'same_days_previous_month' | 'preceding_period';
    /** The comparison stated for display, e.g. "Aug 1–11 vs Jul 1–11". */
    comparison_label?: string;
};

/**
 * How big a change is, phrased the way the backend phrases it (see
 * `formatChangeMagnitude` in `internal/http/insights_comparison.go`).
 *
 * Past roughly 300% a percentage stops reading as a quantity — "1218% higher"
 * looks like a broken calculation, while "13× higher" is a number someone can
 * picture. Only increases get there; a decrease bottoms out at -100%.
 */
export const formatChangeMagnitude = (change: number) => {
    if (change > 300) {
        const multiple = 1 + change / 100;
        if (multiple >= 10) {
            return `${Math.round(multiple)}×`;
        }
        return `${multiple.toFixed(1).replace(/\.0$/, '')}×`;
    }
    return `${Math.round(Math.abs(change))}%`;
};

/**
 * Just the window a change is measured against — "Jul 1–12" out of the
 * backend's "Aug 1–12 vs Jul 1–12".
 *
 * The label is built by `comparisonLabel` in `internal/http/insights_comparison.go`
 * and always has that shape, but a caller that only needs the second half
 * should not have to know that, and must not print a mangled string if the
 * shape ever changes — hence the fallback.
 */
export const previousWindowLabel = (period?: DashboardPeriod) => {
    const [, previous] = (period?.comparison_label ?? '').split(' vs ');
    return previous?.trim() || 'the same days last month';
};

export type DashboardMerchant = {
    merchant: string;
    amount: number;
    transaction_count: number;
};

export type DashboardAccount = {
    account_id: number | null;
    account_name: string;
    amount: number;
    percentage: number;
};

export type DashboardBudgetStatus = {
    budget_id: number;
    name: string;
    category: string;
    limit_amount: number;
    spent_amount: number;
    remaining_amount: number;
    percentage: number;
    alert_threshold_percent: number;
    days_left: number;
    status: 'safe' | 'watch' | 'exceeded';
};

export type DashboardDailySpend = {
    date: string;
    amount: number;
    count: number;
};

export type InsightCard = {
    kind:
        | 'period_comparison'
        | 'category_increase'
        | 'top_merchant'
        | 'account_usage'
        | 'unusual_spending'
        | 'recurring_candidate'
        | 'budget_watch'
        | 'budget_exceeded';
    severity: 'info' | 'warning' | 'success';
    title: string;
    body: string;
    explanation?: string;
    action_label?: string;
    category?: string;
    merchant?: string;
    budget_id?: number;
    account_id?: number | null;
    account_name?: string;
    amount?: number;
    limit_amount?: number;
    remaining_amount?: number;
    status?: string;
    percentage?: number;
    change_percentage?: number;
    transaction_count?: number;
    next_expected_date?: string;
    confidence?: number;
};

export type DashboardRecurringCandidate = {
    candidate_key: string;
    label: string;
    merchant: string;
    category: string;
    average_amount: number;
    interval_guess: 'weekly' | 'monthly';
    confidence: number;
    occurrences: number;
    last_seen_date: string;
    next_expected_date: string;
    review_due: boolean;
};

export type RecurringCandidateDecision = {
    id: number;
    user_id: number;
    candidate_key: string;
    merchant: string;
    category: string;
    decision: 'dismissed' | 'snoozed' | 'tracked';
    snoozed_until?: string;
    last_reviewed_at: string;
    created_at: string;
    updated_at: string;
};

export type DashboardOverviewMonth = {
    /** YYYY-MM. */
    month: string;
    /** Short month name, for the strip. */
    label: string;
    spent: number;
    income: number;
    count: number;
};

/**
 * What the Insights tab knows regardless of which period is selected.
 *
 * Everything else on this response is filtered by the range, which is why the
 * tab used to go blank on a schedule: every month, from the 1st until the first
 * transaction was captured, an account with a year of history rendered ₹0 four
 * times over "Waiting for data". A window with nothing in it is not the same
 * thing as an account with nothing in it — and a single month means very little
 * without the months either side to read it against.
 */
export type DashboardOverview = {
    /** False only for a genuinely new account. */
    has_history: boolean;
    tracked_since?: string;
    months_tracked: number;
    lifetime_spent: number;
    lifetime_income: number;
    lifetime_transaction_count: number;
    /** Mean over the last six months that had activity. */
    average_monthly_spend: number;
    /**
     * How many complete months backed the two figures above. Check it before
     * calling anything "typical": one or two months is a sample, not a habit.
     */
    baseline_months?: number;
    /**
     * Median over the same months. Lead with this one — a single holiday or
     * insurance renewal drags the mean far enough to make an ordinary month
     * look frugal.
     */
    typical_monthly_spend: number;
    /** Twelve calendar months, oldest first, quiet ones included. */
    recent_months: DashboardOverviewMonth[];
    /**
     * The most recent month with any activity. This is what turns an empty
     * selected period from a dead end into one tap to where the data is.
     */
    last_active_month?: DashboardOverviewMonth | null;
    top_category?: string;
    top_category_amount: number;
    top_category_share: number;
    /** How many months the top-category window actually spans (at most six). */
    top_category_months?: number;
};

export type DashboardResponse = {
    period: DashboardPeriod;
    summary: DashboardSummary;
    top_categories: DashboardCategory[];
    top_merchants: DashboardMerchant[];
    account_spending: DashboardAccount[];
    budget_statuses: DashboardBudgetStatus[];
    daily_spending: DashboardDailySpend[];
    recent_transactions: ApiEntry[];
    review_items: ApiEntry[];
    insights: InsightCard[];
    recurring_candidates: DashboardRecurringCandidate[];
    /**
     * Absent on a backend that predates it, so every read has to tolerate
     * `undefined` rather than assuming the block is there.
     */
    overview?: DashboardOverview;
};

export const fetchDashboard = async (
    token: string,
    startDate?: string,
    endDate?: string,
): Promise<DashboardResponse> => {
    const params = new URLSearchParams();
    if (startDate) params.append('start_date', startDate);
    if (endDate) params.append('end_date', endDate);
    params.append('tz', getClientTimeZone());

    const response = await fetch(`${API_BASE_URL}/v1/dashboard?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
        let message = 'Unable to fetch dashboard right now.';
        try {
            const payload = await response.json() as { error?: string };
            message = payload.error || message;
        } catch {
            // Keep the stable fallback for non-JSON errors.
        }
        throw new Error(message);
    }
    return response.json();
};

export const saveRecurringCandidateDecision = async (
    token: string,
    payload: {
        candidate_key: string;
        merchant?: string;
        category?: string;
        decision: 'dismissed' | 'snoozed' | 'tracked';
        snoozed_until?: string;
    }
): Promise<RecurringCandidateDecision> => {
    const response = await fetch(`${API_BASE_URL}/v1/recurring-candidates/decision`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
    });
    if (!response.ok) {
        let message = 'Unable to save recurring review decision.';
        try {
            const body = await response.json() as { error?: string };
            message = body.error || message;
        } catch {
            // Keep stable fallback.
        }
        throw new Error(message);
    }
    return response.json();
};

export type TrackedRecurringCandidate = {
    candidate_key: string;
    subscription: {
        id: number;
        name: string;
        merchant: string;
        amount: number | string;
        billing_interval: string;
        next_due_date: string;
    };
};

export type TrackRecurringCandidatesResponse = {
    tracked: TrackedRecurringCandidate[];
    skipped: { candidate_key: string; reason: string }[];
};

/**
 * Turns detected patterns into subscriptions in one call.
 *
 * Only keys are sent. The server recomputes every figure it writes onto the
 * subscriptions, so the amount and renewal date come from the same detection
 * that produced the card the user just tapped — the client cannot drift from
 * what it displayed.
 */
export const trackRecurringCandidates = async (
    token: string,
    payload: { candidate_keys?: string[]; start_date?: string; end_date?: string } = {}
): Promise<TrackRecurringCandidatesResponse> => {
    const params = new URLSearchParams();
    params.append('tz', getClientTimeZone());
    const response = await fetch(
        `${API_BASE_URL}/v1/recurring-candidates/track?${params.toString()}`,
        {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
        }
    );
    if (!response.ok) {
        let message = 'Unable to track these recurring payments.';
        try {
            const body = await response.json() as { error?: string };
            message = body.error || message;
        } catch {
            // Keep stable fallback.
        }
        throw new Error(message);
    }
    return response.json();
};
