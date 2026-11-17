import { useEffect, useRef, useState } from 'react';

import { useMotion } from '@/hooks/use-motion';

/** How long a figure takes to count to its new value (board R20-Motion). */
const COUNT_MS = 400;

/**
 * A number that counts to its new value instead of jumping, for the bill
 * tray's running total. With reduced motion it is simply the value.
 */
export function useCountUp(value: number) {
  const motion = useMotion();
  const [shown, setShown] = useState(value);
  // What is on screen right now, so a new value that arrives mid-count carries
  // on from there instead of jumping to the old target first.
  const current = useRef(value);

  useEffect(() => {
    if (motion.reduced || current.current === value) {
      current.current = value;
      setShown(value);
      return undefined;
    }
    const start = current.current;
    const began = Date.now();
    let frame = 0;
    const tick = () => {
      const progress = Math.min(1, (Date.now() - began) / COUNT_MS);
      const eased = 1 - (1 - progress) ** 3;
      current.current = start + (value - start) * eased;
      setShown(current.current);
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [motion.reduced, value]);

  return shown;
}
