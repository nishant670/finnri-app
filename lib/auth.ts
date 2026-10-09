import { API_BASE_URL } from './transactions';
import { getFriendlyErrorMessage, NETWORK_ERROR_MESSAGE } from './api-error';

/**
 * Whether email/PIN/OTP sign-in is offered at all.
 *
 * **False for launch.** Google and guest are the two doors in. Email-only OTP
 * was a half-measure: almost anyone willing to type an email address picks
 * Google instead, and the people who actually want a one-time code want it on
 * a phone — which needs DLT registration India has not granted yet. So both
 * channels ship together later rather than half of one now.
 *
 * Nobody with a Google-backed address is stranded by this: the backend's
 * `authGoogle` matches an existing account by email and links the Google
 * subject to it, so an old email-and-PIN account signs in with Google and
 * lands on its own data.
 *
 * The backend gates the same flow with `AUTH_OTP_ENABLED`, and it is the
 * authority — the endpoints answer 503 whatever this flag says. Flip both
 * together, in the change that ships email *and* SMS.
 */
export const EMAIL_LOGIN_ENABLED = false;

/**
 * Whether a phone number may be used as a sign-in identifier.
 *
 * False until an SMS provider exists. India SMS needs DLT template
 * registration before any provider will accept transactional traffic, so the
 * backend refuses a phone identifier with `otp_channel_unavailable`. Offering
 * the field anyway means advertising a signup route that cannot complete —
 * which is the sort of dead end a store reviewer opens the app and finds.
 *
 * Flip this to true in the same change that wires the SMS driver, and set
 * OTP_PHONE_CHANNEL_ENABLED on the backend to match.
 */
export const PHONE_IDENTIFIER_ENABLED = false;

const AUTH_NETWORK_ERROR_MESSAGE = "Can't reach Finnri right now. Check your connection and try again.";

const authErrorMessages: Record<string, string> = {
  failed_lookup_guest: 'Could not continue as guest right now. Please try again.',
  failed_ensure_default_account: 'Could not finish setting up guest mode. Please try again.',
  failed_create_default_account: 'Could not finish setting up guest mode. Please try again.',
  failed_create_guest: 'Could not continue as guest right now. Please try again.',
  failed_create_session: 'Could not start your session. Please try again.',
  invalid_request: 'Something went wrong while starting guest mode. Please try again.',
  weak_pin: 'Choose a PIN that is not easy to guess.',
  // The server now actually sends the code, so it can also actually fail to.
  // Before this existed every one of these was "Failed to send OTP", which
  // told a user nothing about whether waiting would help.
  otp_send_failed: 'We could not send your code just now. Please try again in a moment.',
  otp_resend_too_soon: 'Your code is on its way. Give it a moment before asking for another.',
  otp_channel_unavailable:
    'Codes by SMS are not available yet. Please sign in with an email address instead.',
  otp_sign_in_disabled: 'Sign in with Google, or keep going as a guest.',
  invalid_phone: 'That does not look like a valid phone number.',
  identifier_required: 'Enter an email address to continue.',
};

/**
 * Carries the server's error code and, for a throttled resend, how long the
 * app should wait. The screens need the code itself — an OTP that cannot be
 * sent at all and one that was sent 10 seconds ago need different UI, and a
 * single message string cannot tell them apart.
 */
export class AuthOtpSendError extends Error {
  readonly code: string;
  readonly retryAfterSeconds: number | null;

  constructor(message: string, code: string, retryAfterSeconds: number | null) {
    super(message);
    this.name = 'AuthOtpSendError';
    this.code = code;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

// By reference: this matched the shared message by copying its text, so the
// first edit to that text would have quietly stopped the swap.
export const getFriendlyAuthErrorMessage = (error: unknown, fallback: string) =>
  getFriendlyErrorMessage(error, fallback).replace(NETWORK_ERROR_MESSAGE, AUTH_NETWORK_ERROR_MESSAGE);

const readAuthErrorPayload = async (response: Response, fallback: string) => {
  try {
    const text = await response.text();
    if (!text) {
      return fallback;
    }
    const payload = JSON.parse(text) as { error?: string; message?: string };
    if (payload.message) {
      return payload.message;
    }
    if (payload.error) {
      return authErrorMessages[payload.error] ?? fallback;
    }
    return fallback;
  } catch {
    return fallback;
  }
};

export type IdentifyResponse = {
  exists: boolean;
  is_guest: boolean;
  /**
   * False for an account that skipped PIN setup. Such an account has no keypad
   * to be sent to, so the flow has to route it to OTP instead.
   */
  has_pin?: boolean;
};

export const identifyUser = async (identifier: string): Promise<IdentifyResponse> => {
  const response = await fetch(`${API_BASE_URL}/v1/auth/identify`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ identifier }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || 'Unable to verify that identifier right now.');
  }

  return response.json();
};

type GuestCheckinPayload = {
  device_id: string;
};

type AuthResponse = {
  token: string;
  user: {
    uuid: string;
    is_guest: boolean;
    username: string;
  };
};

export const guestCheckin = async (payload: GuestCheckinPayload): Promise<AuthResponse> => {
  const response = await fetch(`${API_BASE_URL}/v1/auth/guest`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(
      await readAuthErrorPayload(
        response,
        'Could not continue as guest right now. Please try again.'
      )
    );
  }

  return response.json();
};

export type RegisterPayload = {
  claim_token: string;
  /** Omitted when the user chose "Set up later" on the security screen. */
  pin?: string;
  guest_uuid?: string;
  device_id: string;
  biometrics_enabled: boolean;
};

export const registerUser = async (payload: RegisterPayload): Promise<AuthResponse> => {
  const response = await fetch(`${API_BASE_URL}/v1/auth/register`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(await readAuthErrorPayload(response, 'Unable to register right now.'));
  }

  return response.json();
};

export type LoginPayload = {
  identifier: string;
  pin: string;
  device_id: string;
};

const readAuthError = async (response: Response, fallback: string) => {
  try {
    const payload = (await response.json()) as {
      error?: string;
      attempts_remaining?: number;
      locked_until?: string;
    };
    if (payload.error === 'login_locked') {
      return 'Too many wrong PIN attempts. Try again in 15 minutes or reset your PIN.';
    }
    if (payload.error === 'invalid_credentials' && typeof payload.attempts_remaining === 'number') {
      if (payload.attempts_remaining > 0) {
        return `Incorrect PIN. ${payload.attempts_remaining} attempts remaining.`;
      }
      return 'Incorrect PIN.';
    }
    if (payload.error === 'weak_pin') {
      return 'Choose a PIN that is not easy to guess.';
    }
    return payload.error || fallback;
  } catch {
    return fallback;
  }
};

export const loginUser = async (payload: LoginPayload): Promise<AuthResponse> => {
  const response = await fetch(`${API_BASE_URL}/v1/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(await readAuthError(response, 'Invalid credentials.'));
  }

  return response.json();
};

export type GoogleLoginPayload = {
  id_token: string;
  nonce?: string;
  guest_uuid?: string;
  device_id?: string;
  biometrics_enabled?: boolean;
};

export const loginWithGoogle = async (payload: GoogleLoginPayload): Promise<AuthResponse> => {
  const response = await fetch(`${API_BASE_URL}/v1/auth/google`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(
      await readAuthErrorPayload(response, 'Unable to sign in with Google right now.')
    );
  }

  return response.json();
};

export type ResetPinPayload = {
  claim_token: string;
  /**
   * Omitted to sign in on the OTP alone without touching the stored PIN — the
   * path an account that never set one takes on a new device.
   */
  pin?: string;
  device_id: string;
  biometrics_enabled?: boolean;
};

export const resetPin = async (payload: ResetPinPayload): Promise<AuthResponse> => {
  const response = await fetch(`${API_BASE_URL}/v1/auth/pin/reset`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(await readAuthError(response, 'Unable to reset PIN right now.'));
  }

  return response.json();
};

export type UpdateProfilePayload = {
  token: string;
  username: string;
  email: string;
  phone: string;
  claim_token?: string;
};

export const updateProfile = async (
  payload: UpdateProfilePayload
): Promise<{ user: AuthResponse['user'] }> => {
  const response = await fetch(`${API_BASE_URL}/v1/user`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${payload.token}`,
    },
    body: JSON.stringify({
      username: payload.username,
      email: payload.email,
      phone: payload.phone,
      claim_token: payload.claim_token,
    }),
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || 'Failed to update profile.');
  }

  return response.json();
};

export const deleteUserAccount = async (token: string): Promise<void> => {
  const response = await fetch(`${API_BASE_URL}/v1/user`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw new Error(
      await readAuthErrorPayload(response, 'Unable to delete your account right now.')
    );
  }
};

export const logoutSession = async (token: string): Promise<void> => {
  const response = await fetch(`${API_BASE_URL}/v1/auth/logout`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok && response.status !== 401) {
    throw new Error(await readAuthErrorPayload(response, 'Unable to end this session right now.'));
  }
};

export const revokeAllSessions = async (token: string): Promise<number> => {
  const response = await fetch(`${API_BASE_URL}/v1/auth/sessions/revoke-all`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    throw new Error(
      await readAuthErrorPayload(response, 'Unable to sign out your devices right now.')
    );
  }
  const payload = (await response.json()) as { revoked?: number };
  return payload.revoked ?? 0;
};

export type OtpSendResponse = {
  message: string;
  expires_at: string;
  channel: string;
  /** Only present when the server is running with OTP_DEBUG_RESPONSE on. */
  dev_otp?: string;
};

export const authOtpSend = async (identifier: string): Promise<OtpSendResponse> => {
  const response = await fetch(`${API_BASE_URL}/v1/auth/otp/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier }),
  });

  if (!response.ok) {
    // The body is read once and reused for both the code and the message —
    // a Response body cannot be consumed twice.
    let payload: { error?: string; retry_after_seconds?: number } = {};
    try {
      payload = JSON.parse(await response.text());
    } catch {
      // A proxy or gateway error is not JSON; the fallback message covers it.
    }
    const code = payload.error ?? 'otp_send_failed';
    const retryAfterHeader = Number.parseInt(response.headers.get('Retry-After') ?? '', 10);
    const retryAfter =
      payload.retry_after_seconds ?? (Number.isFinite(retryAfterHeader) ? retryAfterHeader : null);
    throw new AuthOtpSendError(
      authErrorMessages[code] ?? 'We could not send your code just now. Please try again.',
      code,
      retryAfter
    );
  }

  return response.json();
};

export const authOtpVerify = async (
  identifier: string,
  otp: string
): Promise<{ claim_token: string }> => {
  const response = await fetch(`${API_BASE_URL}/v1/auth/otp/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier, otp }),
  });
  if (!response.ok) throw new Error('Invalid OTP');
  return response.json();
};
