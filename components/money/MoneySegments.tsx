/**
 * The lists Money used to switch between, kept as the values `?segment=`
 * links carry. Money opens on its overview now (P17) and maps these to its
 * full lists: Upcoming and Recurring both open Bills & dues (P18).
 */
export const MONEY_SEGMENTS = ['upcoming', 'budgets', 'subscriptions', 'accounts'] as const;

export type MoneySegment = (typeof MONEY_SEGMENTS)[number];

export const isMoneySegment = (value: unknown): value is MoneySegment =>
  typeof value === 'string' && (MONEY_SEGMENTS as readonly string[]).includes(value);
