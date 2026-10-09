import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { TouchableOpacity, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import { DashboardResponse } from '@/lib/insights';
import { getTopTakeaway, insightDetailParams } from '@/lib/insight-summary';

export function TopTakeawayCard({
  dashboard,
  reviewCount,
}: {
  dashboard: DashboardResponse;
  reviewCount: number;
}) {
  const theme = useThemeTokens();
  const takeaway = getTopTakeaway(dashboard, reviewCount);
  const color = takeaway.tone === 'warning' ? '#FF6680' : theme.colors.accent;
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
    <View
      className="rounded-[24px] border p-5 shadow-sm"
      style={{ backgroundColor: theme.colors.card, borderColor: theme.colors.border }}>
      <View className="flex-row items-start">
        <View
          className="mr-4 h-12 w-12 items-center justify-center rounded-2xl"
          style={{ backgroundColor: `${color}1A` }}>
          <MaterialCommunityIcons
            name={takeaway.icon as keyof typeof MaterialCommunityIcons.glyphMap}
            size={23}
            color={color}
          />
        </View>
        <View className="flex-1">
          <ThemedText tone="muted" className="text-[10px] font-black uppercase tracking-widest">
            {takeaway.eyebrow}
          </ThemedText>
          <ThemedText className="mt-1 text-xl font-black">{takeaway.title}</ThemedText>
          <ThemedText tone="muted" className="mt-2 text-xs leading-5">
            {takeaway.body}
          </ThemedText>
        </View>
      </View>
      <TouchableOpacity
        onPress={handleAction}
        className="mt-4 h-11 flex-row items-center justify-center rounded-2xl"
        style={{ backgroundColor: theme.colors.secondary }}>
        <ThemedText className="text-xs font-black" style={{ color }}>
          Open next step
        </ThemedText>
        <MaterialCommunityIcons name="chevron-right" size={18} color={color} />
      </TouchableOpacity>
    </View>
  );
}
