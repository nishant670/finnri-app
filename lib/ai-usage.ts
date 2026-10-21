import type { AIUsageEvent } from '@/lib/billing';

const actionLabels: Record<string, string> = {
  transaction_parse_text: 'Text capture',
  transaction_parse_voice_short: 'Short voice capture',
  transaction_parse_voice_medium: 'Voice capture',
  transaction_parse_voice_long: 'Long voice capture',
};

export const ASK_FINNRI_USAGE_LABEL = 'Ask Finnri';

/**
 * A question goes through the same parse as a capture and is charged under the
 * same action, so only the server's `intent` tells the two apart. Events from
 * before the API recorded it have no intent and keep their capture label.
 */
export const isAskFinnriUsage = (event: Pick<AIUsageEvent, 'intent'>) =>
  event.intent === 'question';

/** The row title on the AI usage screen. */
export const aiUsageLabel = (event: Pick<AIUsageEvent, 'action_code' | 'intent'>) => {
  if (isAskFinnriUsage(event)) return ASK_FINNRI_USAGE_LABEL;
  return actionLabels[event.action_code] ?? event.action_code.replaceAll('_', ' ');
};
