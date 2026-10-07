import { API_BASE_URL } from './transactions';

export type FeedbackType = 'bug' | 'idea' | 'improvement' | 'feature_request' | 'other';
export type FeedbackImpact = 'critical' | 'high' | 'medium' | 'nice_to_have';

export type FeedbackPayload = {
  type: FeedbackType;
  area: string;
  title: string;
  message: string;
  impact: FeedbackImpact;
};

/**
 * A title made from the message, for when nobody wrote one: its first sentence,
 * or as much of its first line as fits. The list on the other end needs a
 * title; the person writing feedback should not have to compose two.
 */
export const titleFromMessage = (message: string) => {
  const firstLine = message.trim().split('\n')[0]?.trim() ?? '';
  const sentenceEnd = firstLine.search(/[.!?](\s|$)/);
  const base = sentenceEnd > 0 ? firstLine.slice(0, sentenceEnd + 1) : firstLine;
  return base.length > 80 ? `${base.slice(0, 79).trimEnd()}…` : base;
};

const authHeaders = (token: string) => ({
  Authorization: `Bearer ${token}`,
  'Content-Type': 'application/json',
});

export const submitFeedback = async (token: string, payload: FeedbackPayload) => {
  const response = await fetch(`${API_BASE_URL}/v1/feedback`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error('Unable to send feedback right now.');
  }

  return response.json();
};
