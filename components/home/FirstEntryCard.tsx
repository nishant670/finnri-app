import { MaterialCommunityIcons } from '@expo/vector-icons';
import { ActivityIndicator, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { PressableView } from '@/components/ui/PressableView';
import { Fonts, mixHex } from '@/constants/theme';
import { useThemeTokens } from '@/hooks/use-theme-tokens';

type FirstEntryCardProps = {
  /** What will be sent; seeded with the example sentence. */
  text: string;
  /** Shown when the field is emptied: the same sentence, as a hint. */
  placeholder: string;
  onChangeText: (text: string) => void;
  onSend: () => void;
  isSending: boolean;
  /** Back to the usual card, with the microphone. */
  onSayInstead: () => void;
  onAddByHand: () => void;
};

/**
 * A first entry, ready to go (board R13-FirstEntry-Proposals, P70).
 *
 * A brand-new Home used to open on an empty microphone and a blank list. Now
 * it offers one sentence — in the language chosen on onboarding — that can be
 * sent as it is or changed to something real, so the first thing a new user
 * does is the thing Finnri is for. Sending only makes a draft: nothing is
 * saved until it has been looked at.
 */
export function FirstEntryCard({
  text,
  placeholder,
  onChangeText,
  onSend,
  isSending,
  onSayInstead,
  onAddByHand,
}: FirstEntryCardProps) {
  const { colors } = useThemeTokens();
  const canSend = text.trim().length > 0 && !isSending;

  return (
    <View
      testID="first-entry-card"
      style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <ThemedText accessibilityRole="header" style={[styles.title, { color: colors.text }]}>
        Your first entry
      </ThemedText>

      <View style={[styles.field, { backgroundColor: mixHex(colors.card, colors.track, 0.6) }]}>
        <TextInput
          testID="first-entry-input"
          accessibilityLabel="Your first entry"
          value={text}
          placeholder={placeholder}
          placeholderTextColor={colors.muted}
          onChangeText={onChangeText}
          onSubmitEditing={() => canSend && onSend()}
          returnKeyType="send"
          editable={!isSending}
          multiline
          blurOnSubmit
          style={[styles.input, { color: colors.text, fontFamily: Fonts.body }]}
        />
        <Pressable
          testID="first-entry-send"
          accessibilityRole="button"
          accessibilityLabel="Send"
          accessibilityState={{ disabled: !canSend, busy: isSending }}
          disabled={!canSend}
          onPress={onSend}
          style={[styles.send, { backgroundColor: canSend ? colors.accent : colors.track }]}>
          {isSending ? (
            <ActivityIndicator size="small" color={colors.onAccent} />
          ) : (
            <MaterialCommunityIcons name="arrow-up" size={20} color={canSend ? colors.onAccent : colors.muted} />
          )}
        </Pressable>
      </View>

      <ThemedText tone="muted" style={styles.help}>
        Send this, or change it to something you spent today. You’ll see the draft before anything
        is saved.
      </ThemedText>

      <View style={[styles.actions, { borderTopColor: colors.border }]}>
        <PressableView
          testID="first-entry-say"
          accessibilityRole="button"
          onPress={onSayInstead}
          style={styles.action}
          pressedStyle={styles.pressed}>
          <MaterialCommunityIcons name="microphone-outline" size={18} color={colors.text} />
          <ThemedText style={[styles.actionLabel, { color: colors.text }]}>Say it instead</ThemedText>
        </PressableView>
        <View style={[styles.rule, { backgroundColor: colors.border }]} />
        <PressableView
          testID="first-entry-manual"
          accessibilityRole="button"
          onPress={onAddByHand}
          style={styles.action}
          pressedStyle={styles.pressed}>
          <MaterialCommunityIcons name="plus" size={18} color={colors.text} />
          <ThemedText style={[styles.actionLabel, { color: colors.text }]}>Add by hand</ThemedText>
        </PressableView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 16,
    borderWidth: 1,
    borderRadius: 24,
    paddingTop: 18,
    overflow: 'hidden',
  },
  title: {
    paddingHorizontal: 18,
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '700',
  },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
    marginHorizontal: 14,
    paddingLeft: 14,
    paddingRight: 6,
    paddingVertical: 6,
    borderRadius: 24,
  },
  input: {
    flex: 1,
    minHeight: 40,
    paddingVertical: 8,
    fontSize: 16,
    lineHeight: 22,
  },
  send: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  help: {
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 14,
    fontSize: 13,
    lineHeight: 18,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: 1,
  },
  action: {
    flex: 1,
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  actionLabel: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '600',
  },
  rule: {
    width: 1,
    height: 24,
  },
  pressed: {
    opacity: 0.7,
  },
});
