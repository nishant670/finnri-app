import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppHeader } from '@/components/navigation/AppHeader';
import { ThemedText } from '@/components/themed-text';
import { Fonts } from '@/constants/theme';
import { useThemeTokens } from '@/hooks/use-theme-tokens';

const nextFeatures = [
  { title: 'Smarter weekly money recap', body: 'A clear weekly view of spend shifts, category changes, and unusual transactions.' },
  { title: 'Feedback-powered feature voting', body: 'Popular requests from early users will be grouped and promoted into the roadmap.' },
  { title: 'More automation for subscriptions', body: 'Cleaner renewal handling, reminders, and paid/unpaid flows for recurring expenses.' },
];

const changes = [
  'Faster review flow after AI capture.',
  'Cleaner profile and support area for first-time users.',
  'More helpful empty states across planning screens.',
];

const fixes = [
  'Reduce confusing validation messages in transaction forms.',
  'Tighten notification handling for subscription actions.',
  'Improve small-screen spacing in account and profile views.',
];

export default function UpcomingScreen() {
  const router = useRouter();
  const theme = useThemeTokens();
  const colors = theme.colors;

  return (
    <SafeAreaView className="flex-1" edges={['top', 'left', 'right']} style={{ backgroundColor: colors.background }}>
      <AppHeader title="What's next" subtitle="Release notes" onBack={() => router.back()} />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 40 }}>
        <View className="rounded-[28px] p-5" style={{ backgroundColor: colors.card }}>
          <View className="h-12 w-12 items-center justify-center rounded-2xl" style={{ backgroundColor: colors.secondary }}>
            <MaterialCommunityIcons name="rocket-launch-outline" size={24} color={colors.accent} />
          </View>
          <ThemedText className="mt-4 text-lg font-black" style={{ fontFamily: Fonts.title }}>
            What we are building next
          </ThemedText>
          <ThemedText className="mt-2 text-xs leading-5 opacity-60">
            Follow upcoming features, useful changes, and bug fixes planned for the next Finnri release.
          </ThemedText>
        </View>

        <View className="mt-8">
          <ThemedText className="mb-4 ml-1 text-xs font-black uppercase tracking-widest opacity-40">Upcoming features</ThemedText>
          <View className="gap-3">
            {nextFeatures.map((item) => (
              <View key={item.title} className="rounded-[24px] p-5" style={{ backgroundColor: colors.card }}>
                <View className="flex-row items-start">
                  <MaterialCommunityIcons name="star-four-points-outline" size={20} color={colors.accent} />
                  <View className="ml-3 flex-1">
                    <ThemedText className="text-sm font-black" style={{ fontFamily: Fonts.title }}>
                      {item.title}
                    </ThemedText>
                    <ThemedText className="mt-1 text-xs leading-5 opacity-60">{item.body}</ThemedText>
                  </View>
                </View>
              </View>
            ))}
          </View>
        </View>

        <ReleaseList title="Changes" icon="swap-horizontal-circle-outline" items={changes} />
        <ReleaseList title="Bug fixes" icon="bug-check-outline" items={fixes} />

        <Pressable
          onPress={() => router.push('/feedback')}
          className="mt-8 h-14 flex-row items-center justify-center rounded-[22px]"
          style={{ backgroundColor: colors.accent }}>
          <MaterialCommunityIcons name="message-draw" size={18} color="white" />
          <ThemedText tone="onAccent" className="ml-2 text-sm font-black" style={{ fontFamily: Fonts.title }}>
            Suggest what comes next
          </ThemedText>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function ReleaseList({
  title,
  icon,
  items,
}: {
  title: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  items: string[];
}) {
  const theme = useThemeTokens();
  const colors = theme.colors;

  return (
    <View className="mt-8">
      <ThemedText className="mb-4 ml-1 text-xs font-black uppercase tracking-widest opacity-40">{title}</ThemedText>
      <View className="rounded-[24px] p-2" style={{ backgroundColor: colors.card }}>
        {items.map((item) => (
          <View key={item} className="flex-row items-center px-3 py-3">
            <MaterialCommunityIcons name={icon} size={18} color={colors.accent} />
            <ThemedText className="ml-3 flex-1 text-xs leading-5 opacity-70">{item}</ThemedText>
          </View>
        ))}
      </View>
    </View>
  );
}
