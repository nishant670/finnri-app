import { MaterialCommunityIcons } from '@expo/vector-icons';
import { ActivityIndicator, Pressable, View } from 'react-native';

import { AppHeader } from '@/components/navigation/AppHeader';
import { type ActiveSection } from '@/components/split/primitives/SplitChrome';
import { useThemeTokens } from '@/hooks/use-theme-tokens';

type SplitHeaderProps = {
  loading: boolean;
  searchVisible: boolean;
  activeSection: ActiveSection;
  onToggleSearch: () => void;
  onCreate: () => void;
};

export function SplitHeader({
  loading,
  searchVisible,
  activeSection,
  onToggleSearch,
  onCreate,
}: SplitHeaderProps) {
  const theme = useThemeTokens().colors;
  return (
    <AppHeader
      title="Splits"
      style={{ marginBottom: 20, paddingHorizontal: 0, paddingVertical: 0 }}
      rightNode={
        <View className="ml-4 flex-row items-center gap-2">
          {loading ? <ActivityIndicator color={theme.accent} /> : null}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={searchVisible ? 'Hide split search' : 'Search splits'}
            onPress={onToggleSearch}
            className="h-10 w-10 items-center justify-center rounded-full"
            style={{ backgroundColor: theme.card }}>
            <MaterialCommunityIcons
              name={searchVisible ? 'close' : 'magnify'}
              size={22}
              color={theme.accent}
            />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              activeSection === 'friends'
                ? 'Add split friend'
                : activeSection === 'activity'
                  ? 'Create split group'
                  : 'Create split friend or group'
            }
            onPress={onCreate}
            className="h-10 w-10 items-center justify-center rounded-full"
            style={{ backgroundColor: theme.card }}>
            <MaterialCommunityIcons
              name={
                activeSection === 'friends'
                  ? 'account-plus-outline'
                  : activeSection === 'activity'
                    ? 'account-group-outline'
                    : 'account-multiple-plus-outline'
              }
              size={22}
              color={theme.accent}
            />
          </Pressable>
        </View>
      }
    />
  );
}
