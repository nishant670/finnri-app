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
  const from = useRef(value);

  useEffect(() => {
    if (motion.reduced || from.current === value) {
      from.current = value;
      setShown(value);
      return undefined;
    }
    const start = from.current;
    const began = Date.now();
    let frame = 0;
    const tick = () => {
      const progress = Math.min(1, (Date.now() - began) / COUNT_MS);
      const eased = 1 - (1 - progress) ** 3;
      setShown(start + (value - start) * eased);
      if (progress < 1) {
        frame = requestAnimationFrame(tick);
      } else {
        from.current = value;
      }
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      from.current = value;
    };
  }, [motion.reduced, value]);

  return shown;
}
