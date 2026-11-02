import type { MaterialCommunityIcons } from '@expo/vector-icons';

import type { BillingStatus } from './billing';
import { captureCreditsFor } from './credit-gate';

export type PriceRow = {
  key: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  hue: string;
  title: string;
  meta: string;
  price: string;
};

const credits = (value: number) => `${value} credit${value === 1 ? '' : 's'}`;

/**
 * Every price comes from the server's own action registry (billing status
 * `capture_credits`), so this list cannot drift from what is charged. A
 * statement price an older API does not send yet is left out rather than
 * guessed.
 */
export const aiPriceRows = (status: Pick<BillingStatus, 'credits'> | null): PriceRow[] => {
  const prices = status?.credits.capture_credits;
  const voice = captureCreditsFor(status, 'voice');
  const voiceMax = prices?.voice_max;
  const rows: PriceRow[] = [
    {
      key: 'text',
      icon: 'keyboard-outline',
      hue: '#1E6FB8',
      title: 'Typed entry or question',
      meta: 'Typing "lunch 250" for Finnri to fill in, or asking Finnri a question',
      price: credits(captureCreditsFor(status, 'text')),
    },
    {
      key: 'voice',
      icon: 'microphone-outline',
      hue: '#16825D',
      title: 'Voice note',
      meta:
        voiceMax && voiceMax > voice
          ? `${voice} for up to 15 seconds, ${voiceMax} for up to 30`
          : 'A spoken expense, up to 15 seconds',
      price: voiceMax && voiceMax > voice ? `${voice}–${voiceMax} credits` : credits(voice),
    },
    {
      key: 'receipt',
      icon: 'receipt-text-outline',
      hue: '#6A4BBC',
      title: 'Bill or receipt photo',
      meta: "Free if Finnri can't read it",
      price: credits(captureCreditsFor(status, 'receipt')),
    },
  ];
  if (prices?.statement_pdf) {
    rows.push({
      key: 'statement_pdf',
      icon: 'file-pdf-box',
      hue: '#C2410C',
      title: 'Card statement PDF',
      meta: 'The bill and every transaction on it. Free if nothing can be read',
      price: credits(prices.statement_pdf),
    });
  }
  if (prices?.statement_screenshots) {
    rows.push({
      key: 'statement_screenshots',
      icon: 'image-multiple-outline',
      hue: '#B45309',
      title: 'Card statement screenshots',
      meta: 'Needs a plan. Free if nothing can be read',
      price: credits(prices.statement_screenshots),
    });
  }
  return rows;
};
