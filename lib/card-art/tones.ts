import { mixHex, ThemeMoods, type ThemeMoodId } from '@/constants/theme';

/**
 * The four card tones (canvas Round 18, P92). Every colour comes from the app
 * mood, so changing the mood or Light/Dark recolours every card with it.
 *
 * - Deep: the mood's dark background mixed with its accent.
 * - Solid: the accent itself.
 * - Tint: the card colour mixed with the accent.
 * - Pale: near-white with a touch of accent.
 *
 * A port of `tone()` in docs/redesign/sketch-cards/lib.mjs; keep them in step.
 */
export type CardToneKind = 'deep' | 'solid' | 'tint' | 'pale';
export const CARD_TONES: CardToneKind[] = ['deep', 'solid', 'tint', 'pale'];

export type CardTone = {
  /** The card's gradient, top-left to bottom-right. */
  top: string;
  bot: string;
  /** Pen ink and how strongly it is laid down. */
  line: string;
  lineOp: number;
  text: string;
  /** Secondary text: the product line, the holder's name. */
  soft: string;
  /** The hairline round the card. */
  edge: string;
  /** A filled button drawn on the card. */
  btnBg: string;
  btnInk: string;
  /** The one highlight stroke per drawing. */
  hl: string;
};

const channel = (hex: string, index: number) => parseInt(hex.slice(1 + index * 2, 3 + index * 2), 16);
export const rgba = (hex: string, alpha: number) =>
  `rgba(${channel(hex, 0)}, ${channel(hex, 1)}, ${channel(hex, 2)}, ${alpha})`;

export const isCardTone = (value: unknown): value is CardToneKind =>
  typeof value === 'string' && (CARD_TONES as string[]).includes(value);

export function cardTone(
  moodId: ThemeMoodId,
  mode: 'light' | 'dark',
  kind: CardToneKind
): CardTone {
  const mood = ThemeMoods[moodId] ?? ThemeMoods.finnri;
  const L = mood.light;
  const D = mood.dark;
  const A = mood.accent;
  const on = mood.onAccent;
  if (kind === 'deep') {
    return {
      top: mixHex(D.background, A, 0.22),
      bot: mixHex(D.background, '#000000', 0.3),
      line: mixHex(A, '#FFFFFF', 0.4),
      lineOp: 0.8,
      text: D.text,
      soft: rgba(D.text, 0.72),
      edge: 'rgba(255, 255, 255, 0.16)',
      btnBg: D.text,
      btnInk: D.background,
      hl: A,
    };
  }
  if (kind === 'solid') {
    return {
      top: mixHex(A, '#FFFFFF', 0.16),
      bot: mixHex(A, '#000000', 0.16),
      line: on,
      lineOp: 0.42,
      text: on,
      soft: rgba(on, 0.8),
      edge: 'rgba(255, 255, 255, 0.34)',
      btnBg: on,
      btnInk: A,
      hl: on,
    };
  }
  if (kind === 'tint') {
    return mode === 'dark'
      ? {
          top: mixHex(D.card, A, 0.4),
          bot: mixHex(D.card, A, 0.18),
          line: mixHex(A, '#FFFFFF', 0.5),
          lineOp: 0.75,
          text: D.text,
          soft: rgba(D.text, 0.75),
          edge: 'rgba(255, 255, 255, 0.18)',
          btnBg: D.text,
          btnInk: D.background,
          hl: mixHex(A, '#FFFFFF', 0.25),
        }
      : {
          top: mixHex(L.card, A, 0.26),
          bot: mixHex(L.card, A, 0.13),
          line: mixHex(A, '#000000', 0.22),
          lineOp: 0.7,
          text: L.text,
          soft: rgba(L.text, 0.75),
          edge: 'rgba(255, 255, 255, 0.9)',
          btnBg: L.text,
          btnInk: '#FFFFFF',
          hl: A,
        };
  }
  return {
    top: mixHex('#FFFFFF', A, 0.04),
    bot: mixHex(L.background, A, 0.12),
    line: mixHex(A, L.text, 0.45),
    lineOp: 0.62,
    text: L.text,
    soft: rgba(L.text, 0.72),
    edge: 'rgba(255, 255, 255, 0.95)',
    btnBg: L.text,
    btnInk: '#FFFFFF',
    hl: A,
  };
}
