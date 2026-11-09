import { ParseApiError, describeParseFailure, isCreditParseError, parseEntryDraft } from '@/lib/parse';

const errorResponse = (payload: unknown, status: number) =>
  ({
    ok: false,
    status,
    json: jest.fn().mockResolvedValue(payload),
    text: jest.fn().mockResolvedValue(JSON.stringify(payload)),
  }) as unknown as Response;

beforeEach(() => {
  global.fetch = jest.fn();
});

afterEach(() => {
  jest.resetAllMocks();
});

describe('what the app says when a capture fails', () => {
  it('carries the transcript and the schema details off the response', async () => {
    (global.fetch as jest.MockedFunction<typeof fetch>).mockResolvedValueOnce(
      errorResponse(
        {
          error: 'schema_invalid',
          message: 'I heard the words but could not turn them into a transaction.',
          details: ['split_candidate_details.participants.0.direction: Invalid type'],
          transcript: 'paid 10000 rent, split with bubu-dudu',
        },
        422
      )
    );

    await expect(
      parseEntryDraft({ token: 'token', hintText: 'paid 10000 rent, split with bubu-dudu' })
    ).rejects.toBeInstanceOf(ParseApiError);
  });

  it('offers a retry when the parse failed on its own terms', () => {
    const failure = describeParseFailure(
      new ParseApiError(
        { error: 'schema_invalid', transcript: 'paid 10000 rent, split with bubu-dudu' },
        422,
        'fallback'
      )
    );

    expect(failure.canRetry).toBe(true);
    expect(failure.heard).toBe('paid 10000 rent, split with bubu-dudu');
    expect(failure.examples.length).toBeGreaterThan(0);
  });

  // Retrying a sentence with no money in it spends another credit to arrive
  // back at the same card.
  it('withholds the retry when the sentence itself was the problem', () => {
    const failure = describeParseFailure(
      new ParseApiError({ error: 'non_transactional_prompt' }, 422, 'fallback')
    );

    expect(failure.canRetry).toBe(false);
    expect(failure.examples.length).toBeGreaterThan(0);
  });

  it('falls back to a connection failure when there was no response at all', () => {
    const failure = describeParseFailure(new TypeError('Network request failed'));

    expect(failure.title).toBe('Could not reach Finnri');
    expect(failure.canRetry).toBe(true);
    expect(failure.code).toBeUndefined();
  });

  it('leaves the credit errors to the credit card on Home', () => {
    expect(
      isCreditParseError(new ParseApiError({ error: 'insufficient_ai_credits' }, 402, 'fallback'))
    ).toBe(true);
    expect(
      isCreditParseError(new ParseApiError({ error: 'schema_invalid' }, 422, 'fallback'))
    ).toBe(false);
  });

  it('explains a silent recording, says it was free, and offers no retry', () => {
    const failure = describeParseFailure(
      new ParseApiError({ error: 'empty_transcript', message: 'server words', credits_charged: 0 }, 400, 'fallback')
    );
    expect(failure.title).toBe("Didn't catch that");
    expect(failure.message).toContain('no credits were used');
    expect(failure.canRetry).toBe(false);
  });
});
