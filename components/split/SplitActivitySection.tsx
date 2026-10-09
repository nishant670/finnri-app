import { View } from 'react-native';

import { StateView } from '@/components/ui/StateView';
import { TText } from '@/components/split/primitives/themed-interop';
import { buildRecentActivity } from '@/lib/split-screen-model';
import { useThemeTokens } from '@/hooks/use-theme-tokens';

import type { ReactNode } from 'react';

type SplitActivitySectionProps = {
  activity: ReturnType<typeof buildRecentActivity>;
  normalizedSearch: string;
  renderActivityRow: (
    item: ReturnType<typeof buildRecentActivity>[number],
    entranceIndex: number
  ) => ReactNode;
};

export function SplitActivitySection({
  activity,
  normalizedSearch,
  renderActivityRow,
}: SplitActivitySectionProps) {
  const theme = useThemeTokens().colors;
  return (
    <View className="mt-9 gap-4">
      <View className="mb-2">
        <TText variant="sectionTitle" style={{ color: theme.text }}>
          Recent activity
        </TText>
      </View>
      {activity.length > 0 ? (
        activity.map(renderActivityRow)
      ) : (
        <StateView
          compact
          icon="history"
          title={normalizedSearch ? 'No matching activity' : 'No activity yet'}
          message={
            normalizedSearch
              ? 'Try another search.'
              : 'Group, friend, bill, and settlement activity will appear here.'
          }
        />
      )}
    </View>
  );
}
