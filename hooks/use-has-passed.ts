import { useEffect, useState } from 'react';

/**
 * Whether an ISO timestamp is already in the past.
 *
 * The obvious spelling — comparing against `Date.now()` straight in the render
 * body — is banned by `react-hooks/purity`, and rightly: the clock makes the
 * render non-idempotent, so two renders of the same props can disagree. Read
 * once in an effect instead, and re-read whenever the timestamp changes.
 *
 * The first frame therefore reports `false`. For the copy this drives — "trial
 * expires" versus "trial ended" — that is a frame of the gentler wording, not
 * a wrong number, and it settles before anyone can read it.
 */
export function useHasPassed(timestamp?: string | null): boolean {
  const [hasPassed, setHasPassed] = useState(false);

  useEffect(() => {
    if (!timestamp) {
      setHasPassed(false);
      return;
    }
    const time = new Date(timestamp).getTime();
    setHasPassed(!Number.isNaN(time) && time <= Date.now());
  }, [timestamp]);

  return hasPassed;
}
