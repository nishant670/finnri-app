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
