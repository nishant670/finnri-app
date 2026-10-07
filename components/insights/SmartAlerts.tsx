import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { TouchableOpacity, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import { DashboardResponse, InsightCard } from '@/lib/insights';
import { insightDetailParams } from '@/lib/insight-summary';
import { PillButton } from './PillButton';
import { SectionHeader } from './SectionHeader';

export function SmartAlerts({
  cards,
  dashboard,
  rangeLabel,
}: {
  cards: InsightCard[];
  dashboard: DashboardResponse;
  rangeLabel: string;
}) {
  if (cards.length === 0) return null;

  return (
    <SectionHeader title="Smart Alerts">
      <View className="gap-3">
        {cards.slice(0, 3).map((card) => (
          <AlertCard
            key={card.kind}
            card={card}
            params={insightDetailParams(card, dashboard, rangeLabel)}
          />
        ))}
      </View>
    </SectionHeader>
  );
}
function AlertCard({ card, params }: { card: InsightCard; params: Record<string, string> }) {
  const theme = useThemeTokens();
  const isWarning = card.severity === 'warning';
  const color = isWarning
    ? '#FF6680'
    : card.severity === 'success'
      ? '#00B878'
      : theme.colors.accent;
  const icon = isWarning
    ? 'calendar-alert'
    : card.severity === 'success'
      ? 'check-decagram'
      : 'creation';

  return (
    <TouchableOpacity
      activeOpacity={0.82}
      onPress={() => router.push({ pathname: '/insight-detail', params })}
      className="rounded-[22px] border p-4 shadow-sm"
      style={{
        backgroundColor: theme.colors.card,
        borderLeftColor: color,
        borderLeftWidth: 3,
        borderColor: theme.colors.border,
      }}>
      <View className="flex-row">
        <View
          className="mr-3 h-10 w-10 items-center justify-center rounded-full"
          style={{ backgroundColor: isWarning ? '#FFF3F5' : theme.colors.secondary }}>
          <MaterialCommunityIcons name={icon} size={20} color={color} />
        </View>
        <View className="flex-1">
          <ThemedText className="text-sm font-black">{card.title}</ThemedText>
          <ThemedText tone="muted" className="mt-1 text-xs leading-4">
            {card.body}
          </ThemedText>
          {isWarning && (
            <View className="mt-3 flex-row gap-2">
              <PillButton
                label="View Details"
                muted
                onPress={() => router.push({ pathname: '/insight-detail', params })}
              />
              {params.category && (
                <PillButton
                  label="Set Limit"
                  onPress={() =>
                    router.push({
                      pathname: '/budgets',
                      params: {
                        source: 'insight',
                        budgetId: params.budgetId ?? '',
                        category: params.category,
                        suggestedLimit: params.amount ?? '',
                      },
                    })
                  }
                />
              )}
            </View>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
}
