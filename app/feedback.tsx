import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppHeader } from '@/components/navigation/AppHeader';
import { ThemedText } from '@/components/themed-text';
import { useAppDialog } from '@/components/ui/AppDialogProvider';
import { FormDisclosure } from '@/components/ui/FormDisclosure';
import { KeyboardAvoidingScreen } from '@/components/ui/KeyboardAvoidingScreen';
import { Fonts } from '@/constants/theme';
import { useAuthStore } from '@/hooks/use-auth-store';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import { getFriendlyErrorMessage } from '@/lib/api-error';
import { FeedbackImpact, FeedbackType, submitFeedback, titleFromMessage } from '@/lib/feedback';

const typeOptions: { label: string; value: FeedbackType; icon: keyof typeof MaterialCommunityIcons.glyphMap }[] = [
  { label: 'Feature', value: 'feature_request', icon: 'lightbulb-on-outline' },
  { label: 'Improve', value: 'improvement', icon: 'tune-variant' },
  { label: 'Bug', value: 'bug', icon: 'bug-outline' },
  { label: 'Idea', value: 'idea', icon: 'creation-outline' },
];

const areaOptions = ['Capture', 'Insights', 'Budgets', 'Recurring', 'Splits', 'Accounts', 'Security', 'Other'];

const impactOptions: { label: string; value: FeedbackImpact }[] = [
  { label: 'Must fix', value: 'critical' },
  { label: 'Important', value: 'high' },
  { label: 'Useful', value: 'medium' },
  { label: 'Nice', value: 'nice_to_have' },
];

export default function FeedbackScreen() {
  const router = useRouter();
  const { token } = useAuthStore();
  const theme = useThemeTokens();
  const colors = theme.colors;
  const dialog = useAppDialog();
  const [type, setType] = useState<FeedbackType>('feature_request');
  // Not "Capture": a default here is a label on someone else's report, and an
  // unchosen area is honestly "Other".
  const [area, setArea] = useState('Other');
  const [impact, setImpact] = useState<FeedbackImpact>('high');
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  const canSubmit = useMemo(
    () => !!token && message.trim().length > 0 && !submitting,
    [message, submitting, token]
  );
  const impactLabel = impactOptions.find((item) => item.value === impact)?.label ?? '';

  const handleSubmit = async () => {
    if (!token) {
      void dialog.alert({ title: 'Sign in first', message: 'Sending feedback needs an account.' });
      return;
    }
    if (!message.trim()) {
      void dialog.alert({
        title: 'Add a few words',
        message: 'Tell us what happened, or what you would like to see.',
      });
      return;
    }

    setSubmitting(true);
    try {
      await submitFeedback(token, {
        type,
        area,
        impact,
        title: title.trim() || titleFromMessage(message),
        message: message.trim(),
      });
      setTitle('');
      setMessage('');
      await dialog.alert({
        title: 'Thank you',
        message: 'Your feedback is with the Finnri team now.',
        tone: 'success',
        buttonLabel: 'Done',
      });
      router.back();
    } catch (error) {
      void dialog.alert({
        title: "Couldn't send",
        message: getFriendlyErrorMessage(
          error,
          'Check your connection and try again. Your message is still here.'
        ),
        tone: 'danger',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView className="flex-1" edges={['top', 'left', 'right']} style={{ backgroundColor: colors.background }}>
      <AppHeader title="Feedback" subtitle="Ideas, issues, and requests" onBack={() => router.back()} />

      <KeyboardAvoidingScreen showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 40 }}>
        <View className="rounded-[28px] p-5" style={{ backgroundColor: colors.card }}>
          <View className="h-12 w-12 items-center justify-center rounded-2xl" style={{ backgroundColor: colors.secondary }}>
            <MaterialCommunityIcons name="message-draw" size={24} color={colors.accent} />
          </View>
          <ThemedText className="mt-4 text-lg font-black" style={{ fontFamily: Fonts.title }}>
            Shape what comes next
          </ThemedText>
          <ThemedText className="mt-2 text-xs leading-5 opacity-60">
            Tell us what felt broken, confusing, missing, or worth building next.
          </ThemedText>
        </View>

        <View className="mt-6">
          <ThemedText className="mb-3 ml-1 text-xs font-black uppercase tracking-widest opacity-40">
            What kind of feedback?
          </ThemedText>
          <View className="flex-row flex-wrap gap-3">
            {typeOptions.map((item) => {
              const active = type === item.value;
              return (
                <Pressable
                  key={item.value}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: active }}
                  onPress={() => setType(item.value)}
                  className="min-w-[47%] flex-1 flex-row items-center rounded-2xl px-4 py-3"
                  style={{ backgroundColor: active ? colors.secondary : colors.card }}>
                  <MaterialCommunityIcons name={item.icon} size={18} color={active ? colors.accent : colors.text} />
                  <ThemedText className="ml-2 text-xs font-black" style={{ color: active ? colors.accent : colors.text }}>
                    {item.label}
                  </ThemedText>
                </Pressable>
              );
            })}
          </View>
        </View>

        <TextInput
          testID="feedback-message"
          value={message}
          onChangeText={setMessage}
          placeholder="What happened, or what would you like to see?"
          placeholderTextColor={`${colors.text}66`}
          multiline
          maxLength={2000}
          textAlignVertical="top"
          className="mt-6 min-h-40 rounded-[24px] px-5 py-4 text-sm"
          style={{ backgroundColor: colors.card, color: colors.text, fontFamily: Fonts.body }}
        />

        {/* A message is enough to send. Title, area and impact help sort the
            pile on the other end, so they are offered rather than demanded —
            the title is made from the message when it is left blank. */}
        <View className="mt-4">
          <FormDisclosure
            testID="feedback-details"
            label="Add details"
            icon="tag-text-outline"
            summary={`${title.trim() ? `“${title.trim()}” · ` : ''}${area} · ${impactLabel}`}
            expanded={showDetails}
            onToggle={() => setShowDetails((open) => !open)}>
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder="Short title (optional)"
              placeholderTextColor={`${colors.text}66`}
              maxLength={140}
              className="rounded-[24px] px-5 py-4 text-base font-bold"
              style={{ backgroundColor: colors.card, color: colors.text, fontFamily: Fonts.title }}
            />
            <ThemedText className="mb-3 ml-1 mt-5 text-xs font-black uppercase tracking-widest opacity-40">
              Area
            </ThemedText>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View className="flex-row gap-2">
                {areaOptions.map((item) => {
                  const active = area === item;
                  return (
                    <Pressable
                      key={item}
                      onPress={() => setArea(item)}
                      className="rounded-full px-4 py-2"
                      style={{ backgroundColor: active ? colors.secondary : colors.card }}>
                      <ThemedText className="text-xs font-black" style={{ color: active ? colors.accent : colors.text }}>
                        {item}
                      </ThemedText>
                    </Pressable>
                  );
                })}
              </View>
            </ScrollView>
            <ThemedText className="mb-3 ml-1 mt-5 text-xs font-black uppercase tracking-widest opacity-40">
              How much does it matter?
            </ThemedText>
            <View className="flex-row rounded-2xl p-1" style={{ backgroundColor: colors.card }}>
              {impactOptions.map((item) => {
                const active = impact === item.value;
                return (
                  <Pressable
                    key={item.value}
                    onPress={() => setImpact(item.value)}
                    className="flex-1 items-center rounded-xl py-2"
                    style={{ backgroundColor: active ? colors.secondary : 'transparent' }}>
                    <ThemedText className="text-[11px] font-black" style={{ color: active ? colors.accent : `${colors.text}88` }}>
                      {item.label}
                    </ThemedText>
                  </Pressable>
                );
              })}
            </View>
          </FormDisclosure>
        </View>

        <Pressable
          onPress={handleSubmit}
          disabled={!canSubmit}
          className="mt-6 h-14 flex-row items-center justify-center rounded-[22px]"
          style={{ backgroundColor: colors.accent, opacity: canSubmit ? 1 : 0.45 }}>
          {submitting ? (
            <ActivityIndicator color="white" />
          ) : (
            <>
              <MaterialCommunityIcons name="send" size={18} color="white" />
              <ThemedText tone="onAccent" className="ml-2 text-sm font-black" style={{ fontFamily: Fonts.title }}>
                Send feedback
              </ThemedText>
            </>
          )}
        </Pressable>
      </KeyboardAvoidingScreen>
    </SafeAreaView>
  );
}
