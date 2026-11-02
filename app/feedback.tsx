import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ScreenHeader } from '@/components/navigation/ScreenHeader';
import { ThemedText } from '@/components/themed-text';
import { useAppDialog } from '@/components/ui/AppDialogProvider';
import { PrimaryButton } from '@/components/ui/Button';
import { FormDisclosure } from '@/components/ui/FormDisclosure';
import { KeyboardAvoidingScreen } from '@/components/ui/KeyboardAvoidingScreen';
import { PressableView } from '@/components/ui/PressableView';
import { Segments } from '@/components/ui/Segments';
import { useAuthStore } from '@/hooks/use-auth-store';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import { useBottomInset } from '@/hooks/use-bottom-inset';
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
  const { colors } = useThemeTokens();
  const footerBottom = useBottomInset(20);
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
    <SafeAreaView style={[styles.flex, { backgroundColor: colors.background }]} edges={['top', 'left', 'right']}>
      <ScreenHeader title="Feedback" onBack={() => router.back()} />

      <KeyboardAvoidingScreen showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        <ThemedText tone="muted" style={styles.intro}>
          Tell us what felt broken, confusing, missing, or worth building next.
        </ThemedText>

        <View style={styles.block}>
          <Segments
            active={type}
            options={typeOptions.map((item) => ({ key: item.value, label: item.label }))}
            onChange={(next) => setType(next)}
          />
        </View>

        <View style={[styles.card, styles.messageCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <TextInput
            testID="feedback-message"
            accessibilityLabel="Your feedback"
            value={message}
            onChangeText={setMessage}
            placeholder="What happened, or what would you like to see?"
            placeholderTextColor={colors.muted}
            multiline
            maxLength={2000}
            textAlignVertical="top"
            style={[styles.message, { color: colors.text }]}
          />
          <ThemedText tone="muted" style={styles.counter}>
            {message.length} / 2000
          </ThemedText>
        </View>

        {/* A message is enough to send. Title, area and impact help sort the
            pile on the other end, so they are offered rather than demanded —
            the title is made from the message when it is left blank. */}
        <View style={styles.block}>
          <FormDisclosure
            testID="feedback-details"
            label="More details"
            summary={`${title.trim() ? `“${title.trim()}” · ` : ''}${area} · ${impactLabel}`}
            expanded={showDetails}
            onToggle={() => setShowDetails((open) => !open)}>
            <TextInput
              accessibilityLabel="Short title"
              value={title}
              onChangeText={setTitle}
              placeholder="Short title (optional)"
              placeholderTextColor={colors.muted}
              maxLength={140}
              style={[styles.titleInput, { backgroundColor: colors.card, borderColor: colors.border, color: colors.text }]}
            />
            <ThemedText style={[styles.label, { color: colors.text }]}>Area</ThemedText>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
              {areaOptions.map((item) => {
                const active = area === item;
                return (
                  <PressableView
                    key={item}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: active }}
                    onPress={() => setArea(item)}
                    style={[
                      styles.chip,
                      active
                        ? { backgroundColor: colors.selectedFill, borderColor: colors.selectedFill }
                        : { backgroundColor: colors.card, borderColor: colors.border },
                    ]}
                    pressedStyle={styles.pressed}>
                    <ThemedText style={[styles.chipLabel, { color: colors.text, fontWeight: active ? '700' : '500' }]}>
                      {item}
                    </ThemedText>
                  </PressableView>
                );
              })}
            </ScrollView>
            <ThemedText style={[styles.label, { color: colors.text }]}>How much does it matter?</ThemedText>
            <Segments
              active={impact}
              options={impactOptions.map((item) => ({ key: item.value, label: item.label }))}
              onChange={(next) => setImpact(next)}
            />
          </FormDisclosure>
        </View>

        {attachments.length > 0 ? (
          <View style={styles.thumbs}>
            {attachments.map((attachment) => (
              <View
                key={attachment.uri}
                testID="feedback-attachment"
                style={[styles.thumb, { backgroundColor: colors.card, borderColor: colors.border }]}>
                {attachment.isPdf ? (
                  <View style={styles.pdf}>
                    <MaterialCommunityIcons name="file-pdf-box" size={26} color={colors.text} />
                    <ThemedText numberOfLines={2} style={[styles.pdfName, { color: colors.text }]}>
                      {attachment.name}
                    </ThemedText>
                  </View>
                ) : (
                  <Image source={{ uri: attachment.uri }} style={styles.fill} contentFit="cover" />
                )}
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${attachment.name}`}
                  disabled={submitting}
                  onPress={() => removeAttachment(attachment.uri)}
                  hitSlop={8}
                  style={styles.remove}>
                  <MaterialCommunityIcons name="close" size={14} color="#FFFFFF" />
                </Pressable>
              </View>
            ))}
          </View>
        ) : null}

        <View style={styles.addRow}>
          {attachments.length < MAX_FEEDBACK_ATTACHMENTS ? (
            <PressableView
              testID="feedback-add-attachment"
              accessibilityRole="button"
              accessibilityLabel="Add a screenshot or file"
              disabled={submitting}
              onPress={() => void pickAttachments()}
              style={[styles.addButton, { borderColor: colors.borderStrong, backgroundColor: colors.card }]}
              pressedStyle={styles.pressed}>
              <MaterialCommunityIcons name="image-plus" size={18} color={colors.text} />
              <ThemedText style={[styles.addLabel, { color: colors.text }]}>Add a file</ThemedText>
            </PressableView>
          ) : null}
          <ThemedText tone="muted" style={[styles.small, styles.flexText]}>
            Up to {MAX_FEEDBACK_ATTACHMENTS} photos, screenshots or PDFs
          </ThemedText>
        </View>
        {attachmentNote ? (
          <ThemedText style={[styles.small, styles.note, { color: colors.warning }]}>{attachmentNote}</ThemedText>
        ) : null}
      </KeyboardAvoidingScreen>

      <View
        style={[
          styles.footer,
          { backgroundColor: colors.background, borderTopColor: colors.border, paddingBottom: footerBottom },
        ]}>
        <PrimaryButton
          icon="send"
          label={submitting && uploadProgress ? uploadProgress : 'Send feedback'}
          loading={submitting}
          disabled={!canSubmit}
          onPress={() => void handleSubmit()}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  fill: {
    width: '100%',
    height: '100%',
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 24,
  },
  intro: {
    fontSize: 13,
    lineHeight: 18,
  },
  block: {
    marginTop: 12,
  },
  card: {
    borderWidth: 1,
    borderRadius: 16,
  },
  messageCard: {
    marginTop: 12,
    minHeight: 168,
    padding: 14,
  },
  message: {
    flex: 1,
    minHeight: 120,
    padding: 0,
    fontSize: 15,
    lineHeight: 21,
  },
  counter: {
    alignSelf: 'flex-end',
    fontSize: 12,
    lineHeight: 16,
  },
  titleInput: {
    height: 48,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderRadius: 12,
    fontSize: 15,
    fontWeight: '600',
  },
  label: {
    marginTop: 14,
    marginBottom: 8,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
  },
  chips: {
    gap: 8,
  },
  chip: {
    height: 34,
    justifyContent: 'center',
    paddingHorizontal: 14,
    borderWidth: 1,
    borderRadius: 17,
  },
  chipLabel: {
    fontSize: 13,
    lineHeight: 18,
  },
  thumbs: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 14,
  },
  thumb: {
    width: 88,
    height: 88,
    overflow: 'hidden',
    borderWidth: 1,
    borderRadius: 12,
  },
  pdf: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  pdfName: {
    marginTop: 4,
    textAlign: 'center',
    fontSize: 10,
    lineHeight: 13,
  },
  remove: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  addRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 14,
  },
  addButton: {
    height: 40,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingLeft: 10,
    paddingRight: 14,
    borderWidth: 1,
    borderRadius: 20,
  },
  addLabel: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
  },
  flexText: {
    flex: 1,
  },
  small: {
    fontSize: 12,
    lineHeight: 16,
  },
  note: {
    marginTop: 6,
  },
  footer: {
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: 1,
  },
  pressed: {
    opacity: 0.7,
  },
});
