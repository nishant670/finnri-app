import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { Image } from 'expo-image';
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
import {
  FeedbackImpact,
  FeedbackType,
  MAX_FEEDBACK_ATTACHMENTS,
  submitFeedback,
  titleFromMessage,
} from '@/lib/feedback';
import { ATTACHMENT_PICKER_TYPES, isPdfAttachment, uploadAttachment } from '@/lib/uploads';

/** A file picked on this device, not yet uploaded — that happens on send. */
type PickedAttachment = { uri: string; name: string; mimeType: string | null; isPdf: boolean };

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
  /*
   * Words alone often cannot say which screen, which button, which number.
   * The feedback that asked for this was itself about a screen, and had to
   * describe it.
   */
  const [attachments, setAttachments] = useState<PickedAttachment[]>([]);
  const [attachmentNote, setAttachmentNote] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);

  const pickAttachments = async () => {
    const remaining = MAX_FEEDBACK_ATTACHMENTS - attachments.length;
    if (remaining <= 0) return;
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ATTACHMENT_PICKER_TYPES,
        copyToCacheDirectory: true,
        multiple: true,
      });
      if (result.canceled) return;
      const picked = result.assets
        .filter((asset) => !!asset.uri)
        .map((asset) => ({
          uri: asset.uri,
          name: asset.name || 'Attachment',
          mimeType: asset.mimeType ?? null,
          isPdf: asset.mimeType === 'application/pdf' || isPdfAttachment(asset.name || asset.uri),
        }));
      setAttachments((current) => [...current, ...picked.slice(0, remaining)]);
      setAttachmentNote(
        picked.length > remaining
          ? `Only ${MAX_FEEDBACK_ATTACHMENTS} files fit, so the first ${remaining} were added.`
          : null
      );
    } catch {
      setAttachmentNote('That file could not be read. Please pick another one.');
    }
  };

  const removeAttachment = (uri: string) => {
    setAttachments((current) => current.filter((attachment) => attachment.uri !== uri));
    setAttachmentNote(null);
  };

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
      // Uploaded only now, so a file picked and then removed never leaves the
      // phone. One at a time, so a failure can say which file it was.
      const uploaded: string[] = [];
      for (const [index, attachment] of attachments.entries()) {
        setUploadProgress(`Attaching ${index + 1} of ${attachments.length}…`);
        uploaded.push(
          await uploadAttachment(token, attachment.uri, attachment.mimeType, { noun: 'file' })
        );
      }
      setUploadProgress(null);
      await submitFeedback(token, {
        type,
        area,
        impact,
        title: title.trim() || titleFromMessage(message),
        message: message.trim(),
        ...(uploaded.length > 0 ? { attachments: uploaded } : {}),
      });
      setTitle('');
      setMessage('');
      setAttachments([]);
      setAttachmentNote(null);
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
      setUploadProgress(null);
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

        <View className="mt-6">
          <ThemedText className="mb-3 ml-1 text-xs font-black uppercase tracking-widest opacity-40">
            Screenshots or files
          </ThemedText>
          <View className="flex-row flex-wrap gap-3">
            {attachments.map((attachment) => (
              <View
                key={attachment.uri}
                testID="feedback-attachment"
                className="h-24 w-24 overflow-hidden rounded-2xl"
                style={{ backgroundColor: colors.card }}>
                {attachment.isPdf ? (
                  <View className="flex-1 items-center justify-center px-2">
                    <MaterialCommunityIcons name="file-pdf-box" size={28} color={colors.accent} />
                    <ThemedText numberOfLines={2} className="mt-1 text-center text-[10px]">
                      {attachment.name}
                    </ThemedText>
                  </View>
                ) : (
                  <Image
                    source={{ uri: attachment.uri }}
                    style={{ width: '100%', height: '100%' }}
                    contentFit="cover"
                  />
                )}
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${attachment.name}`}
                  disabled={submitting}
                  onPress={() => removeAttachment(attachment.uri)}
                  hitSlop={8}
                  className="absolute right-1 top-1 h-6 w-6 items-center justify-center rounded-full"
                  style={{ backgroundColor: 'rgba(0,0,0,0.55)' }}>
                  <MaterialCommunityIcons name="close" size={14} color="#FFFFFF" />
                </Pressable>
              </View>
            ))}
            {attachments.length < MAX_FEEDBACK_ATTACHMENTS ? (
              <Pressable
                testID="feedback-add-attachment"
                accessibilityRole="button"
                accessibilityLabel="Add a screenshot or file"
                disabled={submitting}
                onPress={() => void pickAttachments()}
                className="h-24 w-24 items-center justify-center rounded-2xl border border-dashed"
                style={{ borderColor: `${colors.text}33`, backgroundColor: colors.card }}>
                <MaterialCommunityIcons name="image-plus" size={24} color={colors.accent} />
                <ThemedText
                  className="mt-1 text-[10px] font-black"
                  style={{ color: colors.accent }}>
                  Add
                </ThemedText>
              </Pressable>
            ) : null}
          </View>
          <ThemedText className="ml-1 mt-2 text-[11px] opacity-50">
            Show us what you mean — up to {MAX_FEEDBACK_ATTACHMENTS} photos, screenshots or PDFs.
          </ThemedText>
          {attachmentNote ? (
            <ThemedText className="ml-1 mt-1 text-[11px]" style={{ color: colors.accent }}>
              {attachmentNote}
            </ThemedText>
          ) : null}
        </View>

        <Pressable
          onPress={handleSubmit}
          disabled={!canSubmit}
          className="mt-6 h-14 flex-row items-center justify-center rounded-[22px]"
          style={{ backgroundColor: colors.accent, opacity: canSubmit ? 1 : 0.45 }}>
          {submitting ? (
            <>
              <ActivityIndicator color="white" />
              {uploadProgress ? (
                <ThemedText tone="onAccent" className="ml-2 text-sm font-black">
                  {uploadProgress}
                </ThemedText>
              ) : null}
            </>
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
