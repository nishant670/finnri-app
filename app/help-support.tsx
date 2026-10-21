import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Linking, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ScreenHeader } from '@/components/navigation/ScreenHeader';
import { SettingsRow } from '@/components/profile/SettingsRow';
import { ThemedText } from '@/components/themed-text';
import { useAppDialog } from '@/components/ui/AppDialogProvider';
import { PressableView } from '@/components/ui/PressableView';
import { useThemeTokens } from '@/hooks/use-theme-tokens';

const faqs = [
  {
    question: 'How does Smart Sorting work?',
    answer:
      'When it is on, AI drafts can fill category, title, tag, merchant and payment mode. When it is off, Finnri leaves those for you to choose before saving.',
  },
  {
    question: 'Can I edit an AI draft?',
    answer:
      'Yes. AI suggestions are never saved until you review the draft and confirm the transaction.',
  },
  // These two named screens that have since been renamed (a fix on board R8-Help).
  {
    question: 'Where do budget and bill alerts appear?',
    answer:
      'Alerts appear in Notifications, and the controls live under Budgets and Recurring in the Money tab.',
  },
  {
    question: 'How do I lock the app?',
    answer:
      'Open Security & privacy from your Profile to turn on the PIN lock, unlock with your fingerprint or Face ID, or stealth mode.',
  },
] as const;

const supportActions = [
  {
    icon: 'email-outline',
    title: 'Email support',
    body: 'support@finnri.app',
    url: 'mailto:support@finnri.app?subject=Finnri%20Support',
  },
  {
    icon: 'message-text-outline',
    title: 'Send feedback',
    body: 'Ideas, issues and requests',
    route: '/feedback',
  },
  {
    icon: 'rocket-launch-outline',
    title: 'What’s next',
    body: 'Planned features and fixes',
    route: '/upcoming',
  },
] as const;

export default function HelpSupportScreen() {
  const router = useRouter();
  const { colors } = useThemeTokens();
  const dialog = useAppDialog();
  // The first answer starts open, so the list reads as answers, not a menu.
  const [openQuestion, setOpenQuestion] = useState<number | null>(0);

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
    <SafeAreaView style={[styles.flex, { backgroundColor: colors.background }]} edges={['top', 'left', 'right']}>
      <ScreenHeader title="Help & support" onBack={() => router.back()} />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        <ThemedText tone="muted" style={styles.intro}>
          Start with a quick answer, or write to us with what happened.
        </ThemedText>

        <ThemedText tone="muted" accessibilityRole="header" style={styles.groupTitle}>
          Get in touch
        </ThemedText>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {supportActions.map((item, index) => (
            <SettingsRow
              key={item.title}
              icon={item.icon}
              title={item.title}
              subtitle={item.body}
              divider={index > 0}
              onPress={() => {
                if ('route' in item) {
                  router.push(item.route);
                  return;
                }
                void openSupportLink(item.url);
              }}
            />
          ))}
        </View>

        <ThemedText tone="muted" accessibilityRole="header" style={styles.groupTitle}>
          Common questions
        </ThemedText>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {faqs.map((item, index) => {
            const open = openQuestion === index;
            return (
              <View key={item.question} style={index > 0 && { borderTopWidth: 1, borderTopColor: colors.border }}>
                <PressableView
                  accessibilityRole="button"
                  accessibilityState={{ expanded: open }}
                  onPress={() => setOpenQuestion(open ? null : index)}
                  style={styles.question}
                  pressedStyle={styles.pressed}>
                  <ThemedText style={[styles.questionText, { color: colors.text }]}>{item.question}</ThemedText>
                  <MaterialCommunityIcons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={colors.muted} />
                </PressableView>
                {open ? (
                  <ThemedText tone="muted" style={styles.answer}>
                    {item.answer}
                  </ThemedText>
                ) : null}
              </View>
            );
          })}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 40,
  },
  intro: {
    fontSize: 13,
    lineHeight: 18,
  },
  groupTitle: {
    marginTop: 20,
    marginBottom: 8,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
  },
  card: {
    borderWidth: 1,
    borderRadius: 16,
    overflow: 'hidden',
  },
  question: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingLeft: 14,
    paddingRight: 12,
    paddingVertical: 10,
  },
  questionText: {
    flex: 1,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '500',
  },
  answer: {
    paddingHorizontal: 14,
    paddingBottom: 14,
    fontSize: 13,
    lineHeight: 19,
  },
  pressed: {
    opacity: 0.7,
  },
});
