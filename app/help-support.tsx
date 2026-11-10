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
  // P60 (board R8-Help-Proposals): the questions people write in about most.
  // Prices are today's; the price list in Profile is the one that moves with
  // the server.
  {
    question: 'How do credits work?',
    answer:
      'Finnri uses credits only when its AI reads something for you: typing an entry uses 5, a voice note 12 to 18, a bill scan 25. Reading a card statement costs more — see What uses AI credits in your Profile. Adding or editing anything by hand is always free.',
  },
  {
    question: 'Do passes renew on their own?',
    answer:
      'No. A pass is a one-time purchase for its period and never charges you again. When it ends, everything you logged stays.',
  },
  {
    question: 'Can I get a refund?',
    answer:
      'Write to support@finnri.app within 7 days with your Razorpay payment ID if you were charged twice, charged the wrong amount or did not get your pass. Credits already largely used are generally not refunded. The full policy is at finnri.app/refunds.',
  },
  {
    question: 'How do I delete my data?',
    answer:
      'Open Security & privacy from your Profile and choose Delete Finnri account. It permanently removes your profile, transactions, accounts and credit history.',
  },
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
          tone: 'error',
        });
        return;
      }
      await Linking.openURL(url);
    } catch {
      void dialog.alert({
        title: 'Support',
        message: 'Unable to open support right now.',
        tone: 'error',
      });
    }
  };

  return (
    <SafeAreaView style={[styles.flex, { backgroundColor: colors.background }]} edges={['top', 'left', 'right', 'bottom']}>
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
                  // Feedback is told where it was opened from (P59).
                  router.push(
                    item.route === '/feedback'
                      ? { pathname: '/feedback', params: { from: 'Help & support' } }
                      : item.route
                  );
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
