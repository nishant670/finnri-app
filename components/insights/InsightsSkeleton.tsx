import { View } from 'react-native';

import { Shimmer } from '@/components/ui/Shimmer';
import {
  SkeletonCard,
  SkeletonFrame,
  SkeletonStat,
  SkeletonTextCard,
} from '@/components/ui/Skeleton';

/**
 * The Insights stack before it has anything to say.
 *
 * Insights is the screen a spinner served worst: it is nine cards of wildly
 * different heights, so the whole screen used to assemble itself in one frame
 * after a blank one. The shape here is the first three cards — the takeaway,
 * the period pulse, and the spending analysis with its donut — because those
 * are what fits above the fold and the rest arrives below the scroll anyway.
 *
 * The donut is drawn as a ring rather than a disc. A filled circle where a
 * ring is coming is the one placeholder on this screen that would visibly
 * *change shape* when the data lands, rather than just filling in.
 */

/** Matches `CategoryDonut`'s footprint, so the card lands at its own height. */
const DONUT_SIZE = 168;
const DONUT_THICKNESS = 26;

export function InsightsSkeleton() {
  return (
    <SkeletonFrame
      label="Loading insights"
      testID="insights-skeleton"
      style={{ paddingHorizontal: 16, paddingTop: 4, gap: 16 }}>
      <SkeletonTextCard index={0} lines={2} />
      <SkeletonTextCard index={1} lines={1} />

      <SkeletonCard radius={16} padding={16}>
        <Shimmer width="46%" height={14} index={8} />
        <View style={{ marginTop: 20, alignItems: 'center' }}>
          <View
            style={{
              width: DONUT_SIZE,
              height: DONUT_SIZE,
              alignItems: 'center',
              justifyContent: 'center',
            }}>
            <Shimmer width={DONUT_SIZE} height={DONUT_SIZE} radius={DONUT_SIZE / 2} index={9} />
            {/* The hole. It reads the card's own surface rather than a shimmer,
                because the middle of a donut is not content that is loading. */}
            <View
              style={{
                position: 'absolute',
                width: DONUT_SIZE - DONUT_THICKNESS * 2,
                height: DONUT_SIZE - DONUT_THICKNESS * 2,
                borderRadius: DONUT_SIZE,
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
              }}>
              <Shimmer width={48} height={9} index={10} />
              <Shimmer width={76} height={18} radius={8} index={11} />
            </View>
          </View>
        </View>
        <View style={{ marginTop: 24, flexDirection: 'row', gap: 20 }}>
          <SkeletonStat index={6} />
          <SkeletonStat index={7} />
        </View>
      </SkeletonCard>
    </SkeletonFrame>
  );
}
