import type { Account, CardNetwork, CardProductSummary } from '@/lib/accounts';

import { CARD_TONES, isCardTone, type CardToneKind } from './tones';

export * from './drawings';
export * from './tones';

/**
 * What a card is drawn as: the product's sketch when the card is linked to the
 * catalogue, otherwise a plain texture that still tells neighbouring cards
 * apart.
 */
export type CardArt = {
  tone: CardToneKind;
  drawing: string;
  portrait: boolean;
};

/**
 * Textures for cards with no product. They come from the owner's own cards
 * (brushed metal, faceted silver, stitched leather), which are not catalogue
 * products, so an unlinked card never borrows another product's drawing and
 * reads as "that's my card" for the wrong one.
 */
const PLAIN_DRAWINGS = ['hairlines', 'facets', 'stitch'];

export function cardArtFor(account: Pick<Account, 'id' | 'card_product'>): CardArt {
  const product = account.card_product;
  if (product && isCardTone(product.tone)) {
    return { tone: product.tone, drawing: product.drawing, portrait: product.orientation === 'portrait' };
  }
  const seed = Math.abs(account.id ?? 0);
  return {
    tone: CARD_TONES[seed % CARD_TONES.length],
    drawing: PLAIN_DRAWINGS[Math.floor(seed / CARD_TONES.length) % PLAIN_DRAWINGS.length],
    portrait: false,
  };
}

export function productArt(product: Pick<CardProductSummary, 'tone' | 'drawing' | 'orientation'>): CardArt {
  return {
    tone: isCardTone(product.tone) ? product.tone : 'deep',
    drawing: product.drawing,
    portrait: product.orientation === 'portrait',
  };
}

/**
 * The bank as a card prints it. Provider names are written for lists
 * ("State Bank of India", "AU Small Finance Bank"); the card face has room for
 * what the card itself says.
 */
const CARD_BANK_NAMES: Record<string, string> = {
  sbi: 'SBI Card',
  'au-small-finance': 'AU Bank',
  'idfc-first': 'IDFC FIRST',
  'standard-chartered': 'Standard Chartered',
  'bank-of-baroda': 'BOB Card',
  'kotak': 'Kotak',
  'yes-bank': 'YES BANK',
  'punjab-national-bank': 'PNB',
  pnb: 'PNB',
  'union-bank': 'Union Bank',
  'central-bank': 'Central Bank',
  'bank-of-india': 'Bank of India',
};

export function cardBankName(providerId?: string | null, provider?: string | null, fallback = 'Credit card') {
  const id = (providerId ?? '').trim().toLowerCase();
  return CARD_BANK_NAMES[id] ?? (provider?.trim() || fallback);
}

/**
 * What to call a catalogued card: "HDFC Millennia", "SBI BPCL", "Axis Magnus".
 * The bank's "Bank"/"Card" suffix is dropped once the product names the card.
 */
export function cardProductTitle(providerId: string | null | undefined, provider: string | null | undefined, productName: string) {
  const bank = cardBankName(providerId, provider, '').replace(/\s+(Bank|Card)$/i, '');
  return [bank, productName].filter(Boolean).join(' ');
}

const NETWORK_LABELS: Record<CardNetwork, string> = {
  visa: 'Visa',
  mastercard: 'Mastercard',
  rupay: 'RuPay',
  amex: 'Amex',
  diners: 'Diners',
};
export const CARD_NETWORKS = Object.keys(NETWORK_LABELS) as CardNetwork[];

/** The network as plain text (P94): never a logo. */
export function cardNetworkLabel(network?: string | null) {
  return network && network in NETWORK_LABELS ? NETWORK_LABELS[network as CardNetwork] : '';
}
