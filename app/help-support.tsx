import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Linking, Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppHeader } from '@/components/navigation/AppHeader';
import { ThemedText } from '@/components/themed-text';
import { useAppDialog } from '@/components/ui/AppDialogProvider';
import { Fonts } from '@/constants/theme';
import { useThemeTokens } from '@/hooks/use-theme-tokens';

const faqs = [
  {
    question: 'How does Smart Sorting work?',
    answer:
      'When it is on, AI draft entries can fill category, title, tag, merchant, and payment mode. When it is off, Finnri leaves sorting fields for you to choose before saving.',
  },
  {
    question: 'Can I edit an AI draft?',
    answer:
      'Yes. AI suggestions are never saved until you review the draft and confirm the transaction.',
  },
  {
    question: 'Where do budget and subscription alerts appear?',
    answer:
      'Alerts appear in Notifications, and the controls live under Budgets and Subscriptions in the Money tab.',
  },
  {
    question: 'How do I secure the app?',
    answer:
      'Open Keep it Safe from your profile to enable PIN lock, biometrics, or stealth mode.',
  },
] as const;

const supportActions = [
  {
    icon: 'email-outline',
    title: 'Email support',
    body: 'Send app issues, account questions, or feedback.',
    url: 'mailto:support@finnri.app?subject=Finnri%20Support',
    color: '#D32F2F',
    surface: '#FFEBEE',
  },
  {
    icon: 'message-draw',
    title: 'Feedback & ideas',
    body: 'Send feature requests, improvement ideas, or bug reports.',
    route: '/feedback',
    color: '#00796B',
    surface: '#E0F2F1',
  },
  {
    icon: 'rocket-launch-outline',
    title: "What's next",
    body: 'See planned features, changes, and bug fixes.',
    route: '/upcoming',
    color: '#0288D1',
    surface: '#E1F5FE',
  },
] as const;

export default function HelpSupportScreen() {
  const router = useRouter();
  const theme = useThemeTokens();
  const colors = theme.colors;
  const dialog = useAppDialog();

  const openSupportLink = async (url: string) => {
    try {
      const canOpen = await Linking.canOpenURL(url);
      if (!canOpen) {
        void dialog.alert({
          title: 'Support',
          message: 'No email app is available on this device.',
        });
        return;
      }
      await Linking.openURL(url);
    } catch {
      void dialog.alert({
        title: 'Support',
        message: 'Unable to open support right now.',
        tone: 'danger',
      });
    }
  };

  return (
    <SafeAreaView className="flex-1" edges={['top', 'left', 'right']} style={{ backgroundColor: colors.background }}>
      <AppHeader title="Help & support" onBack={() => router.back()} />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 40 }}>
        <View className="rounded-[32px] p-6" style={{ backgroundColor: colors.card }}>
          <View className="h-14 w-14 items-center justify-center rounded-2xl" style={{ backgroundColor: colors.secondary }}>
            <MaterialCommunityIcons name="lifebuoy" size={28} color={colors.accent} />
          </View>
          <ThemedText className="mt-5 text-xl font-black" style={{ fontFamily: Fonts.title }}>
            We can help
          </ThemedText>
          <ThemedText className="mt-2 text-sm leading-6 opacity-60">
            Start with common answers below, or contact support with details about what happened.
          </ThemedText>
        </View>

        <View className="mt-8">
          <ThemedText className="mb-4 ml-2 text-xs font-black uppercase tracking-widest opacity-40">
            Contact
          </ThemedText>
          <View className="gap-3">
            {supportActions.map((item) => (
              <Pressable
                key={item.title}
                onPress={() => {
                  if ('route' in item) {
                    router.push(item.route);
                    return;
                  }
                  void openSupportLink(item.url);
                }}
                className="flex-row items-center rounded-[28px] p-5"
                style={{ backgroundColor: colors.card }}>
                <View className="mr-4 h-12 w-12 items-center justify-center rounded-2xl" style={{ backgroundColor: item.surface }}>
                  <MaterialCommunityIcons name={item.icon} size={24} color={item.color} />
                </View>
                <View className="flex-1">
                  <ThemedText className="text-base font-black" style={{ fontFamily: Fonts.title }}>
                    {item.title}
                  </ThemedText>
                  <ThemedText className="mt-1 text-xs leading-5 opacity-55">{item.body}</ThemedText>
                </View>
                <MaterialCommunityIcons name="chevron-right" size={22} color={colors.text} style={{ opacity: 0.3 }} />
              </Pressable>
            ))}
          </View>
        </View>

        <View className="mt-8">
          <ThemedText className="mb-4 ml-2 text-xs font-black uppercase tracking-widest opacity-40">
            Answers
          </ThemedText>
          <View className="gap-3">
            {faqs.map((item) => (
              <View key={item.question} className="rounded-[28px] p-5" style={{ backgroundColor: colors.card }}>
                <ThemedText className="text-sm font-black" style={{ fontFamily: Fonts.title }}>
                  {item.question}
                </ThemedText>
                <ThemedText className="mt-2 text-xs leading-5 opacity-60">{item.answer}</ThemedText>
              </View>
            ))}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
