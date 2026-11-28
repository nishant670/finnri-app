/**
 * React Native's fetch on Android never times out, so a half-open connection can
 * leave a request waiting for good. This stops waiting for it. The request
 * itself is not aborted and may still reach the server, so only use it where a
 * lost answer is already safe.
 */
export const withDeadline = <T>(work: Promise<T>, ms: number): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("Finnri didn't answer in time. Check your connection and try again.")),
      ms
    );
    work.then(resolve, reject).finally(() => clearTimeout(timer));
  });

/** A save or any one of its later steps. */
export const SAVE_STEP_DEADLINE_MS = 30 * 1000;
/** A receipt photo going up on a slow connection. */
export const UPLOAD_DEADLINE_MS = 90 * 1000;
