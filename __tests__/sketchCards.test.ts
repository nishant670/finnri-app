import { mixHex } from '@/constants/theme';
import type { Account } from '@/lib/accounts';
import {
  cardArtFor,
  cardBankName,
  cardNetworkLabel,
  cardProductTitle,
  cardTone,
  compactMarks,
  drawingMarks,
  hasDrawing,
  LANDSCAPE_DRAWINGS,
  PORTRAIT_DRAWINGS,
  type Mark,
} from '@/lib/card-art';
import { cardsSummaryLine, describeCard, nextDueDate, orderCards, shortDate } from '@/lib/card-list';

// The 40 drawings of canvas Round 19 (docs/redesign/sketch-cards/library.json).
const CATALOGUE_LANDSCAPE = [
  'dotgrid', 'wedge', 'crossarrows', 'arrow', 'stripes', 'shards', 'globe', 'drop', 'playdots', 'tree',
  'constellation', 'burst', 'mandala', 'splash', 'octane', 'train', 'pulse', 'parcel', 'sphere', 'gem',
  'crystal', 'ribbons', 'silk', 'headphones', 'globe+route', 'signal', 'car', 'aurora', 'doodlering', 'fern',
  'laurel', 'orbits', 'blocks', 'plate', 'stitch', 'hairlines', 'facets', 'doodles',
];
const CATALOGUE_PORTRAIT = ['coins', 'tick', 'feather'];

const tone = cardTone('finnri', 'dark', 'deep');

const flatten = (marks: Mark[]): Mark[] => marks.flatMap((mark) => (mark.k === 'group' ? flatten(mark.marks) : [mark]));
const numbersIn = (d: string) => (d.match(/-?\d*\.?\d+(e-?\d+)?/g) ?? []).map(Number);

describe('Sketch card art (canvas Round 18–19)', () => {
  it('derives every tone from the mood alone', () => {
    // Deep is the mood's dark background mixed with its accent.
    expect(cardTone('finnri', 'dark', 'deep').top).toBe(mixHex('#1A1A1A', '#FF8865', 0.22));
    expect(cardTone('sky', 'light', 'solid').text).toBe('#FFFFFF');
    expect(cardTone('finnri', 'light', 'solid').text).toBe('#2D2D2D');
    // Tint follows Light/Dark; Pale is pale in both.
    expect(cardTone('plum', 'dark', 'tint').top).not.toBe(cardTone('plum', 'light', 'tint').top);
    expect(cardTone('mint', 'dark', 'pale')).toEqual(cardTone('mint', 'light', 'pale'));
    for (const mood of ['finnri', 'mint', 'sky', 'plum'] as const) {
      for (const kind of ['deep', 'solid', 'tint', 'pale'] as const) {
        const t = cardTone(mood, 'dark', kind);
        for (const colour of [t.top, t.bot, t.line, t.text, t.hl]) expect(colour).toMatch(/^#[0-9A-F]{6}$/i);
      }
    }
  });

  it('draws every catalogue drawing with well-formed pen strokes', () => {
    for (const name of CATALOGUE_LANDSCAPE) expect(hasDrawing(name, false)).toBe(true);
    for (const name of CATALOGUE_PORTRAIT) expect(hasDrawing(name, true)).toBe(true);
    for (const [name, portrait] of [
      ...CATALOGUE_LANDSCAPE.map((n) => [n, false] as const),
      ...CATALOGUE_PORTRAIT.map((n) => [n, true] as const),
    ]) {
      const marks = flatten(drawingMarks(name, portrait, tone));
      expect(marks.length).toBeGreaterThan(2);
      for (const mark of marks) {
        if (mark.k === 'dot') {
          expect(Number.isFinite(mark.cx + mark.cy + mark.r + mark.opacity)).toBe(true);
        } else if (mark.k === 'path') {
          expect(numbersIn(mark.d).every(Number.isFinite)).toBe(true);
          expect(mark.d).not.toMatch(/NaN|undefined/);
        }
      }
    }
    // Exactly the approved drawings: none missing, none the canvas never saw.
    const bases = [...new Set(CATALOGUE_LANDSCAPE.map((name) => name.split('+')[0]))].sort();
    expect([...LANDSCAPE_DRAWINGS].sort()).toEqual(bases);
    expect([...PORTRAIT_DRAWINGS].sort()).toEqual([...CATALOGUE_PORTRAIT].sort());
  });

  it('draws each stroke twice, the second faint and offset, unless told not to', () => {
    const marks = flatten(drawingMarks('drop', false, tone)) as Extract<Mark, { k: 'path' }>[];
    const [firm, ghost] = marks;
    expect(ghost.d).toBe(firm.d);
    expect(ghost.ghost).toBe(true);
    expect(ghost.width).toBeCloseTo(firm.width * 0.5);
    expect(ghost.opacity).toBeCloseTo(firm.opacity * 0.45, 2);
  });

  it('draws the plain card for a drawing the app does not have yet', () => {
    expect(drawingMarks('a-drawing-from-the-future', false, tone)).toEqual([]);
    expect(drawingMarks(null, false, tone)).toEqual([]);
    // Portrait and landscape drawings are separate sets.
    expect(drawingMarks('coins', false, tone)).toEqual([]);
  });

  it('keeps the variant after a plus: the Atlas globe has a flight path', () => {
    const plain = flatten(drawingMarks('globe', false, tone));
    const route = flatten(drawingMarks('globe+route', false, tone));
    expect(route).not.toEqual(plain);
    expect(route.some((mark) => mark.k === 'path' && mark.dash === '4 5')).toBe(true);
  });

  it('merges dot fields into a handful of paths and drops the faint pass on thumbnails', () => {
    const dots = drawingMarks('dotgrid', false, tone);
    expect(dots.filter((mark) => mark.k === 'dot').length).toBeGreaterThan(400);
    const compact = compactMarks(dots);
    expect(compact.length).toBeLessThan(25);
    expect(compact.some((mark) => mark.k === 'dot')).toBe(false);

    const full = compactMarks(drawingMarks('splash', false, tone));
    const thumb = compactMarks(drawingMarks('splash', false, tone), { thumb: true });
    expect(thumb.length).toBeLessThan(full.length);
    expect(thumb.some((mark) => mark.k === 'path' && mark.ghost)).toBe(false);
  });

  it('draws a card without a product as a plain texture, never another product', () => {
    const art = cardArtFor({ id: 5, card_product: null });
    expect(['hairlines', 'facets', 'stitch']).toContain(art.drawing);
    expect(cardArtFor({ id: 5, card_product: null })).toEqual(art);
    expect(cardArtFor({ id: 6, card_product: null }).tone).not.toBe(art.tone);
    expect(
      cardArtFor({
        id: 5,
        card_product: { id: 'axis-magnus', issuer_id: 'axis', name: 'Magnus', tone: 'deep', drawing: 'feather', orientation: 'portrait' },
      })
    ).toEqual({ tone: 'deep', drawing: 'feather', portrait: true });
  });

  it('prints the bank as the card does and the network as plain text', () => {
    expect(cardBankName('sbi', 'State Bank of India')).toBe('SBI Card');
    expect(cardBankName('hdfc', 'HDFC Bank')).toBe('HDFC Bank');
    expect(cardBankName('', '', 'My card')).toBe('My card');
    expect(cardProductTitle('hdfc', 'HDFC Bank', 'Millennia')).toBe('HDFC Millennia');
    expect(cardProductTitle('sbi', 'State Bank of India', 'BPCL')).toBe('SBI BPCL');
    expect(cardNetworkLabel('rupay')).toBe('RuPay');
    expect(cardNetworkLabel('discover')).toBe('');
  });
});

const card = (overrides: Partial<Account> & { id: number }): Account =>
  ({ type: 'credit_card', name: `Card ${overrides.id}`, color: '#000000', provider_id: 'hdfc', provider: 'HDFC Bank', ...overrides }) as Account;

const statement = (due: string, remaining: number, extra: Record<string, unknown> = {}) => ({
  id: 1,
  statement_date: '2026-10-28',
  due_date: due,
  total_due: remaining,
  minimum_due: 100,
  paid_amount: 0,
  remaining_due: remaining,
  status: remaining > 0 ? 'unpaid' : 'paid',
  is_overdue: false,
  days_to_due: 5,
  ...extra,
});

describe('All cards list (board R18-AllCards)', () => {
  const today = '2026-11-13';

  it('puts the bill and Mark paid on a card that owes', () => {
    const item = describeCard(
      card({ id: 1, last4: '7924', card_network: 'visa', summary: { current_statement: statement('2026-11-18', 8412) } as never }),
      'bills',
      today
    );
    expect(item.figure).toEqual({ amount: '₹8,412', sub: 'Due 18 Nov' });
    expect(item.action).toBe('mark-paid');
    expect(item.network).toBe('Visa');
    expect(item.last4).toBe('7924');
  });

  it('asks for a bill when a card has none, with the next due date', () => {
    const item = describeCard(card({ id: 2, due_day: 2 }), 'bills', today);
    expect(item.figure).toEqual({ amount: 'No bill', sub: 'Next on 2 Dec' });
    expect(item.action).toBe('add-bill');
    expect(item.chip).toEqual({ label: "Add this month's bill", tone: 'accent', target: 'add-bill' });
  });

  it('shows one chip: overdue first, then the paid-in-full streak, then a waived fee', () => {
    const overdue = describeCard(
      card({ id: 3, summary: { current_statement: statement('2026-11-10', 500, { is_overdue: true, days_to_due: -3 }), paid_in_full_streak: 6 } as never }),
      'bills',
      today
    );
    expect(overdue.chip).toEqual({ label: 'Overdue by 3 days', tone: 'negative', target: 'details' });
    const streak = describeCard(
      card({ id: 4, summary: { current_statement: statement('2026-11-05', 0), paid_in_full_streak: 12 } as never }),
      'bills',
      today
    );
    expect(streak.figure).toEqual({ amount: '₹0', sub: 'Paid in full' });
    expect(streak.action).toBeNull();
    expect(streak.chip.label).toBe('Paid in full 12 times');
    const waived = describeCard(
      card({ id: 5, summary: { current_statement: statement('2026-11-25', 900), annual_fee: { waived: true } } as never }),
      'bills',
      today
    );
    expect(waived.chip.label).toBe('Fee waived this year');
  });

  it("shows this month's spend on the spend tab, with no button", () => {
    const item = describeCard(card({ id: 6, summary: { spent_this_month: 2450, entries_this_month: 3 } as never }), 'spend', today);
    expect(item.figure).toEqual({ amount: '₹2,450', sub: '3 entries' });
    expect(item.action).toBeNull();
  });

  it('orders cards to pay soonest first and sums what is due', () => {
    const cards = [
      card({ id: 1, summary: { spent_this_month: 10 } as never }),
      card({ id: 2, summary: { current_statement: statement('2026-11-25', 1960), spent_this_month: 900 } as never }),
      card({ id: 3, summary: { current_statement: statement('2026-11-18', 8412), spent_this_month: 50 } as never }),
    ];
    expect(orderCards(cards, 'bills').map((c) => c.id)).toEqual([3, 2, 1]);
    expect(orderCards(cards, 'spend').map((c) => c.id)).toEqual([2, 3, 1]);
    expect(cardsSummaryLine(cards, 'bills', '2026-11-13')).toEqual({ lead: '₹10,372 due on 2 cards', rest: 'next on 18 Nov' });
    const late = card({ id: 4, summary: { current_statement: statement('2026-11-04', 500, { is_overdue: true }) } as never });
    expect(cardsSummaryLine([late, cards[1]], 'bills', '2026-11-13')).toEqual({
      lead: '₹2,460 due on 2 cards',
      rest: '1 overdue · next on 25 Nov',
    });
    expect(cardsSummaryLine([cards[0]], 'bills')).toEqual({ lead: 'No bills due', rest: 'on 1 card' });
  });

  it('finds the next due date, clamping to short months', () => {
    expect(nextDueDate(18, '2026-11-13')).toBe('2026-11-18');
    expect(nextDueDate(13, '2026-11-13')).toBe('2026-11-13');
    expect(nextDueDate(2, '2026-11-13')).toBe('2026-12-02');
    expect(nextDueDate(31, '2026-02-10')).toBe('2026-02-28');
    expect(nextDueDate(5, '2026-12-20')).toBe('2027-01-05');
    expect(shortDate('2026-11-18')).toBe('18 Nov');
  });
});
