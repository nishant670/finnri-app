import { aiUsageLabel, isAskFinnriUsage } from '@/lib/ai-usage';

describe('AI usage labels', () => {
  it('labels an answered question as Ask Finnri, not a text capture', () => {
    const event = { action_code: 'transaction_parse_text', intent: 'question' };
    expect(isAskFinnriUsage(event)).toBe(true);
    expect(aiUsageLabel(event)).toBe('Ask Finnri');
  });

  it('labels a voice question as Ask Finnri too', () => {
    expect(aiUsageLabel({ action_code: 'transaction_parse_voice_short', intent: 'question' })).toBe(
      'Ask Finnri',
    );
  });

  it('keeps the capture label when the parse produced a draft', () => {
    expect(aiUsageLabel({ action_code: 'transaction_parse_text' })).toBe('Text capture');
    expect(aiUsageLabel({ action_code: 'transaction_parse_text', intent: '' })).toBe('Text capture');
    expect(aiUsageLabel({ action_code: 'transaction_parse_voice_medium' })).toBe('Voice capture');
  });

  it('falls back to a readable action code for actions it has no label for', () => {
    expect(aiUsageLabel({ action_code: 'future_ai_weekly_summary' })).toBe('future ai weekly summary');
  });
});
