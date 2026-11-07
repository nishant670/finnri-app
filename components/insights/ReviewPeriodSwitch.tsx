import { router } from 'expo-router';

import { Segments } from '@/components/ui/Segments';
import { lastMonth, thisWeekRange } from '@/lib/insight-glance';

/**
 * The weekly and monthly reviews as one Review screen with a Week · Month
 * switch (P31). Each side is still its own route, so a link to either keeps
 * working; switching replaces one with the other instead of stacking them.
 */
export function ReviewPeriodSwitch({ active }: { active: 'week' | 'month' }) {
  return (
    <Segments
      active={active}
      options={[
        { key: 'week', label: 'Week', testID: 'review-switch-week' },
        { key: 'month', label: 'Month', testID: 'review-switch-month' },
      ]}
      onChange={(next) => {
        if (next === active) return;
        if (next === 'week') {
          const week = thisWeekRange();
          router.replace({
            pathname: '/weekly-review',
            params: { start: week.start, end: week.end, label: 'This week' },
          });
          return;
        }
        router.replace({ pathname: '/monthly-review', params: { month: lastMonth().key } });
      }}
      style={{ marginHorizontal: 16, marginBottom: 4 }}
    />
  );
}
