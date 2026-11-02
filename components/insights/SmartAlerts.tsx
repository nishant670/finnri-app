import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { useThemeTokens } from '@/hooks/use-theme-tokens';
import { DashboardResponse, InsightCard as InsightCardData } from '@/lib/insights';
import { insightDetailParams } from '@/lib/insight-summary';
import { InsightCard, NavRow } from './insight-ui';
import { PillButton } from './PillButton';
import { SectionHeader } from './SectionHeader';

/** The period's alerts as one card of rows (board R7-Analysis, "What stands out"). */
export function SmartAlerts({
  cards,
  dashboard,
  rangeLabel,
}: {
  cards: InsightCardData[];
  dashboard: DashboardResponse;
  rangeLabel: string;
}) {
  if (cards.length === 0) return null;

  return (
    <SectionHeader title="Alerts">
      <InsightCard flush>
        {cards.slice(0, 3).map((card, index) => (
          <AlertRow
            key={card.kind}
            card={card}
            divider={index > 0}
            params={insightDetailParams(card, dashboard, rangeLabel)}
          />
        ))}
      </InsightCard>
    </SectionHeader>
  );
}

function AlertRow({
  card,
  params,
  divider,
}: {
  card: InsightCardData;
  params: Record<string, string>;
  divider: boolean;
}) {
  const { colors } = useThemeTokens();
  const isWarning = card.severity === 'warning';
  const hue = isWarning ? colors.warning : card.severity === 'success' ? colors.positive : colors.accent;
  const icon = isWarning ? 'calendar-alert' : card.severity === 'success' ? 'check-decagram' : 'creation';
  const open = () => router.push({ pathname: '/insight-detail', params });

  return (
    <NavRow icon={icon} hue={hue} title={card.title} body={card.body} divider={divider} onPress={open}>
      {isWarning ? (
        <View style={styles.actions}>
          <PillButton label="View details" muted onPress={open} />
          {params.category ? (
            <PillButton
              label="Set a limit"
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
          ) : null}
        </View>
      ) : null}
    </NavRow>
  );
}

const styles = StyleSheet.create({
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10,
  },
});
