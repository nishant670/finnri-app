import { readApiError } from './api-error';
import { API_BASE_URL } from './transactions';

export type FeedbackType = 'bug' | 'idea' | 'improvement' | 'feature_request' | 'other';
export type FeedbackImpact = 'critical' | 'high' | 'medium' | 'nice_to_have';

export type FeedbackPayload = {
  type: FeedbackType;
  area: string;
  title: string;
  message: string;
  impact: FeedbackImpact;
  /** Upload URLs from POST /v1/upload — at most three. */
  attachments?: string[];
};

/** How many screenshots or files one piece of feedback can carry. */
export const MAX_FEEDBACK_ATTACHMENTS = 3;

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
    throw await readApiError(response, 'Unable to send feedback right now.', {
      attachments: 'Attachments',
    });
  }

  return response.json();
};
