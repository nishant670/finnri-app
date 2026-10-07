import { titleFromMessage } from '@/lib/feedback';

describe('titleFromMessage', () => {
  it('takes the first sentence', () => {
    expect(titleFromMessage('Budgets reset on the wrong day. It happened twice.')).toBe(
      'Budgets reset on the wrong day.'
    );
  });

  it('takes the first line when there is no sentence end', () => {
    expect(titleFromMessage('dark mode for the widget\nwould be nice')).toBe('dark mode for the widget');
  });

  it('keeps a long first line to a title length', () => {
    const title = titleFromMessage('a'.repeat(200));
    expect(title).toHaveLength(80);
    expect(title.endsWith('…')).toBe(true);
  });

  it('does not end a sentence inside a number', () => {
    expect(titleFromMessage('Paid 2.5k but it shows 2500')).toBe('Paid 2.5k but it shows 2500');
  });
});
