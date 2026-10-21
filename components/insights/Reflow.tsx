import type { ReactNode } from 'react';
import Animated from 'react-native-reanimated';

import { useMotion } from '@/hooks/use-motion';

/**
 * One card of the Insights stack, allowed to move rather than jump.
 *
 * Choosing the period rewrites this whole screen: cards appear, disappear and
 * change height, and every card below each change used to land somewhere else
 * in a single frame. The wrapper is what carries the `layout` — the cards
 * themselves are plain views with their own borders and padding, and pushing
 * Reanimated into each of them would spread the same three lines nine ways.
 */
export function Reflow({ children }: { children: ReactNode }) {
  const motion = useMotion();

  return <Animated.View layout={motion.reflow()}>{children}</Animated.View>;
}
