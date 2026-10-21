import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';

import { useThemeTokens } from '@/hooks/use-theme-tokens';
import { DashboardResponse } from '@/lib/insights';
import { getTopTakeaway, insightDetailParams } from '@/lib/insight-summary';
import { NavCard } from './insight-ui';

export function TopTakeawayCard({
  dashboard,
  reviewCount,
}: {
  dashboard: DashboardResponse;
  reviewCount: number;
}) {
  const theme = useThemeTokens();
  const takeaway = getTopTakeaway(dashboard, reviewCount);
  const color = takeaway.tone === 'warning' ? theme.colors.warning : theme.colors.accent;
  const topCategory = dashboard.top_categories[0];

  const handleAction = () => {
    if (reviewCount > 0) {
      router.push({
        pathname: '/transactions',
        params: {
          review: '1',
          start_date: dashboard.period.start,
          end_date: dashboard.period.end,
        },
      });
      return;
    }
    if (takeaway.tone === 'warning') {
      const warning = dashboard.insights.find((item) => item.severity === 'warning');
      if (warning) {
        router.push({
          pathname: '/insight-detail',
          params: insightDetailParams(warning, dashboard, dashboard.period.start),
        });
        return;
      }
    }
    if (topCategory) {
      router.push({
        pathname: '/category-detail',
        params: {
          category: topCategory.category,
          start: dashboard.period.start,
          end: dashboard.period.end,
          label: dashboard.period.start,
        },
      });
      return;
    }
    router.push('/spending-analysis');
  };

  return (
    <NavCard
      icon={takeaway.icon as keyof typeof MaterialCommunityIcons.glyphMap}
      hue={color}
      eyebrow={takeaway.eyebrow}
      title={takeaway.title}
      body={takeaway.body}
      accessibilityLabel={`${takeaway.title}. Open next step`}
      onPress={handleAction}
    />
  );
}
