import { MaterialCommunityIcons } from '@expo/vector-icons';
import { CURRENCY_SYMBOL } from '@/constants/Currency';
import { formatMoney } from '@/lib/money';
import { DashboardResponse, InsightCard, moneyOutOf } from '@/lib/insights';
import { resolveCategoryMetadata } from '@/lib/transactions';

export const getInsightLevel = (dashboard: DashboardResponse) => {
  const count = dashboard.summary.lifetime_transaction_count ?? dashboard.summary.transaction_count;
  if (count === 0) return 0;
  if (count < 3) return 1;
  if (count < 10) return 2;
  if (count < 30) return 3;
  return 4;
};
export const getBurnRateCopy = (dashboard: DashboardResponse) => {
  const { total_income: income, daily_average: daily } = dashboard.summary;
  const out = moneyOutOf(dashboard.summary);
  if (daily <= 0) return 'Add more transactions to estimate your spending rhythm.';
  if (income > out) {
    const remaining = income - out;
    const days = Math.max(1, Math.round(remaining / daily));
    return `At your current spending pace, your surplus can cover ~${days} more days.`;
  }
  return 'Spending has caught up with recorded income for this period.';
};
export const getPeriodPulse = (dashboard: DashboardResponse, reviewCount: number) => {
  const { total_income: income, transaction_count: count } = dashboard.summary;
  // Investments are money going out too; the pulse weighs everything that left.
  const spent = moneyOutOf(dashboard.summary);
  if (count === 0) {
    return {
      label: 'Waiting for data',
      reason: 'Add confirmed transactions to build this period summary.',
      color: '#9B9692',
      icon: 'progress-clock',
    };
  }
  if (reviewCount > 0) {
    return {
      label: 'Needs review',
      reason: `${reviewCount} transaction${reviewCount === 1 ? '' : 's'} need category or account cleanup.`,
      color: '#FFB020',
      icon: 'playlist-check',
    };
  }
  if (income <= 0 && spent > 0) {
    return {
      label: 'No income recorded',
      reason: 'This period has expenses but no recorded income, so surplus cannot be estimated.',
      color: '#FFB020',
      icon: 'cash-remove',
    };
  }
  if (income > 0 && spent > income) {
    return {
      label: 'Watch spending',
      reason: 'Confirmed expenses are higher than recorded income for this period.',
      color: '#FF6680',
      icon: 'alert-circle-outline',
    };
  }
  return {
    label: 'On track',
    reason: 'Recorded income is higher than confirmed expenses for this period.',
    color: '#00B878',
    icon: 'check-decagram',
  };
};
const needsTransactionReview = (entry: DashboardResponse['recent_transactions'][number]) => {
  const category = String(entry.category ?? '')
    .trim()
    .toLowerCase();
  return !category || category === 'uncategorized' || !entry.account_id;
};
export const getNeedsReview = (dashboard: DashboardResponse) => {
  const apiItems = dashboard.review_items ?? [];
  if (apiItems.length > 0) return apiItems;
  return dashboard.recent_transactions.filter(needsTransactionReview);
};
export const getReviewReasons = (entry: DashboardResponse['recent_transactions'][number]) => {
  const reasons: { label: string; icon: keyof typeof MaterialCommunityIcons.glyphMap }[] = [];
  const category = String(entry.category ?? '').trim();
  if (!category) {
    reasons.push({ label: 'Missing category', icon: 'shape-outline' });
  } else if (category.toLowerCase() === 'uncategorized') {
    reasons.push({ label: 'Uncategorized', icon: 'shape-plus-outline' });
  }
  if (!entry.account_id) {
    reasons.push({ label: 'Missing account', icon: 'credit-card-outline' });
  }
  return reasons.length > 0 ? reasons : [{ label: 'Needs review', icon: 'playlist-check' }];
};
/**
 * The hero card. It returns the insight it promoted so Smart Alerts can drop
 * it — the same alert appearing twice on one screen made the analysis look
 * padded.
 */
export const getTopTakeaway = (dashboard: DashboardResponse, reviewCount: number) => {
  const warning = dashboard.insights.find((item) => item.severity === 'warning');
  const topCategory = dashboard.top_categories[0];

  if (reviewCount > 0) {
    return {
      eyebrow: 'Fix first',
      title: `${reviewCount} transaction${reviewCount === 1 ? '' : 's'} need review`,
      body: 'Resolve missing categories or accounts so the rest of your insights stay accurate.',
      icon: 'playlist-check',
      tone: 'warning' as const,
      promotedKind: null,
    };
  }

  if (warning) {
    return {
      eyebrow: 'Worth attention',
      title: warning.title,
      body: warning.body,
      icon: 'alarm-light-outline',
      tone: 'warning' as const,
      promotedKind: warning.kind,
    };
  }

  if (topCategory) {
    return {
      eyebrow: 'Main driver',
      title: `${topCategory.category} is ${Math.round(topCategory.percentage)}% of spend`,
      body: `${formatMoney(topCategory.amount)} recorded in this category during the selected period.`,
      icon: resolveCategoryMetadata(topCategory.category).icon,
      tone: 'info' as const,
      promotedKind: null,
    };
  }

  return {
    eyebrow: 'Spending pace',
    title: `${formatMoney(dashboard.summary.daily_average)} per day`,
    body: 'This is your average confirmed expense pace for the selected period.',
    icon: 'speedometer',
    tone: 'info' as const,
    promotedKind: null,
  };
};
export const insightDetailParams = (
  card: InsightCard,
  dashboard: DashboardResponse,
  rangeLabel: string
) => {
  const params: Record<string, string> = {
    kind: card.kind,
    severity: card.severity,
    title: card.title,
    body: card.body,
    start: dashboard.period.start,
    end: dashboard.period.end,
    label: rangeLabel,
  };

  if (card.kind === 'category_increase') {
    const categoryName = card.category ?? card.title.replace(/\s+increased$/i, '').trim();
    const category =
      dashboard.top_categories.find(
        (item) => item.category.toLowerCase() === categoryName.toLowerCase()
      ) ?? dashboard.top_categories[0];
    if (category) {
      params.category = category.category;
    }
  }
  if (card.category) params.category = card.category;
  if (card.budget_id != null) params.budgetId = String(card.budget_id);
  if (card.amount != null) params.amount = String(card.amount);
  if (card.limit_amount != null) params.limitAmount = String(card.limit_amount);
  if (card.remaining_amount != null) params.remainingAmount = String(card.remaining_amount);
  if (card.status) params.status = card.status;
  if (card.percentage != null) params.percentage = String(card.percentage);
  if (card.change_percentage != null) params.change = String(card.change_percentage);
  if (card.explanation) params.explanation = card.explanation;
  if (card.action_label) params.actionLabel = card.action_label;

  if (card.kind === 'top_merchant') {
    const merchant = card.merchant
      ? dashboard.top_merchants.find((item) => item.merchant === card.merchant)
      : dashboard.top_merchants[0];
    if (merchant) {
      params.merchant = merchant.merchant;
    }
  }
  if (card.merchant) params.merchant = card.merchant;
  if (card.transaction_count != null) params.transactionCount = String(card.transaction_count);

  if (card.kind === 'account_usage') {
    const account =
      card.account_id != null
        ? dashboard.account_spending.find((item) => item.account_id === card.account_id)
        : dashboard.account_spending[0];
    if (account) {
      params.accountName = account.account_name;
      if (account.account_id != null) params.accountId = String(account.account_id);
    }
  }
  if (card.account_name) params.accountName = card.account_name;
  if (card.account_id != null) params.accountId = String(card.account_id);

  if (card.kind === 'recurring_candidate') {
    const candidate = card.merchant
      ? dashboard.recurring_candidates.find((item) => item.merchant === card.merchant)
      : dashboard.recurring_candidates[0];
    if (candidate) {
      params.merchant = candidate.merchant;
      params.category = candidate.category;
    }
  }
  if (card.next_expected_date) params.nextExpectedDate = card.next_expected_date;
  if (card.confidence != null) params.confidence = String(card.confidence);

  if (card.kind === 'unusual_spending' && !params.amount) {
    const match = card.body.match(new RegExp(`${CURRENCY_SYMBOL}([\\d,.]+)`));
    if (match?.[1]) params.amount = match[1].replace(/,/g, '');
  }

  return params;
};
