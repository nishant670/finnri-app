import type { MaterialCommunityIcons } from '@expo/vector-icons';

import type { AIUsageEvent } from '@/lib/billing';

type AIVisual = { icon: keyof typeof MaterialCommunityIcons.glyphMap; hue: string };

/** Each kind of AI read's glyph and hue, shared by AI usage and the plans screen. */
export const AI_VISUALS = {
  text: { icon: 'keyboard-outline', hue: '#1E6FB8' },
  voice: { icon: 'microphone-outline', hue: '#16825D' },
  receipt: { icon: 'receipt-text-outline', hue: '#6A4BBC' },
  statementPdf: { icon: 'file-pdf-box', hue: '#C2410C' },
  statementScreenshots: { icon: 'image-multiple-outline', hue: '#B45309' },
  ask: { icon: 'chat-question-outline', hue: '#0E7490' },
} satisfies Record<string, AIVisual>;

const actionLabels: Record<string, string> = {
  // Bill scans read "transaction parse receipt" before this label existed
  // (a fix on board R8-Usage).
  transaction_parse_receipt: 'Bill scan',
  transaction_parse_text: 'Text capture',
  transaction_parse_voice_short: 'Short voice capture',
  transaction_parse_voice_medium: 'Voice capture',
  transaction_parse_voice_long: 'Long voice capture',
  statement_pdf_read: 'Statement PDF read',
  future_ai_statement_import: 'Statement screenshots read',
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
