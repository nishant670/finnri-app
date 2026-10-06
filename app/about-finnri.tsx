import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppHeader } from '@/components/navigation/AppHeader';
import { ThemedText } from '@/components/themed-text';
import { Fonts } from '@/constants/theme';
import { useThemeTokens } from '@/hooks/use-theme-tokens';

const values = [
  {
    icon: 'microphone-outline',
    title: 'Fast capture',
    body: 'Record, type, or tap quick prompts so expenses are logged before details are forgotten.',
    color: '#0288D1',
    surface: '#E1F5FE',
  },
  {
    icon: 'creation-outline',
    title: 'Assistive AI',
    body: 'AI can draft categories, merchants, tags, dates, and payment modes while keeping final save under your control.',
    color: '#7B1FA2',
    surface: '#F3E5F5',
  },
  {
    icon: 'shield-check-outline',
    title: 'Private by design',
    body: 'PIN lock, biometrics, stealth mode, and profile controls help keep your money data personal.',
    color: '#388E3C',
    surface: '#E8F5E9',
  },
] as const;

const stats = [
  { label: 'Budgets', value: 'Limits + alerts' },
  { label: 'Recurring', value: 'EMIs, SIPs, subscriptions and bills' },
  { label: 'Splits', value: 'Shared expenses' },
];

export default function AboutFinnriScreen() {
  const router = useRouter();
  const theme = useThemeTokens();
  const colors = theme.colors;

  return (
    <SafeAreaView className="flex-1" edges={['top', 'left', 'right']} style={{ backgroundColor: colors.background }}>
      <AppHeader title="About Finnri" onBack={() => router.back()} />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 40 }}>
        <View className="items-center pt-4 pb-8">
          <View className="h-24 w-24 items-center justify-center rounded-[28px]" style={{ backgroundColor: colors.secondary }}>
            <MaterialCommunityIcons name="wallet-bifold-outline" size={38} color={colors.accent} />
          </View>
          <ThemedText className="mt-5 text-2xl font-black text-center" style={{ fontFamily: Fonts.title }}>
            Your money, easier to read
          </ThemedText>
          <ThemedText className="mt-3 text-center text-sm leading-6 opacity-60">
            Finnri is a personal finance companion for everyday tracking, quick transaction capture,
            budgets, subscriptions, account views, and spending insights.
          </ThemedText>
        </View>

        <View className="mb-8 flex-row gap-3">
          {stats.map((item) => (
            <View key={item.label} className="flex-1 rounded-[24px] p-4" style={{ backgroundColor: colors.card }}>
              <ThemedText className="text-[10px] font-black uppercase opacity-40">{item.label}</ThemedText>
              <ThemedText className="mt-2 text-xs font-black leading-4" style={{ color: colors.text }}>
                {item.value}
              </ThemedText>
            </View>
          ))}
        </View>

        <View className="gap-4">
          {values.map((item) => (
            <View key={item.title} className="flex-row rounded-[28px] p-5" style={{ backgroundColor: colors.card }}>
              <View className="mr-4 h-12 w-12 items-center justify-center rounded-2xl" style={{ backgroundColor: item.surface }}>
                <MaterialCommunityIcons name={item.icon} size={24} color={item.color} />
              </View>
              <View className="flex-1">
                <ThemedText className="text-base font-black" style={{ fontFamily: Fonts.title }}>
                  {item.title}
                </ThemedText>
                <ThemedText className="mt-1 text-xs leading-5 opacity-55">{item.body}</ThemedText>
              </View>
            </View>
          ))}
        </View>

        <View className="mt-8 rounded-[28px] p-5" style={{ backgroundColor: colors.secondary }}>
          <ThemedText className="text-xs font-black uppercase tracking-widest" style={{ color: colors.accent }}>
            Version
          </ThemedText>
          <ThemedText className="mt-2 text-sm font-black" style={{ fontFamily: Fonts.title }}>
            Finnri Playbook V3.1.2
          </ThemedText>
          <ThemedText className="mt-1 text-xs leading-5 opacity-60">
            Built for quick personal finance tracking with review-first AI assistance.
          </ThemedText>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
