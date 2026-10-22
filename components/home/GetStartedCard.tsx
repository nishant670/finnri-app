import { MaterialCommunityIcons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { PressableView } from '@/components/ui/PressableView';
import { withAlpha } from '@/constants/theme';
import { useThemeTokens } from '@/hooks/use-theme-tokens';

export type GetStartedStep = {
  key: 'accounts' | 'budget' | 'lock';
  title: string;
  detail: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  done: boolean;
};

/**
 * The three set-up steps a new Home offers, in order (P5). Each is done when
 * the thing exists: an account other than cash, any budget, a PIN lock.
 */
export const getStartedSteps = ({
  hasAccount,
  hasBudget,
  hasLock,
}: {
  hasAccount: boolean;
  hasBudget: boolean;
  hasLock: boolean;
}): GetStartedStep[] => [
  {
    key: 'accounts',
    title: 'Add your accounts',
    detail: 'Drafts pick the right bank or card',
    icon: 'bank-outline',
    done: hasAccount,
  },
  {
    key: 'budget',
    title: 'Set a monthly budget',
    detail: 'See what is left as you spend',
    icon: 'target',
    done: hasBudget,
  },
  {
    key: 'lock',
    title: 'Turn on app lock',
    detail: 'PIN or fingerprint to open Finnri',
    icon: 'lock-outline',
    done: hasLock,
  },
];

/**
 * "Get started" on an empty Home (board R1-Home-Empty-Proposals, P5): a 14/700
 * heading with "N of 3 done", then one card of 56dp rows, each a tinted tile,
 * a title and what it gets you, and a chevron. A finished step keeps its row
 * with a tick, so the count and the list agree.
 */
export function GetStartedCard({
  steps,
  onOpen,
}: {
  steps: GetStartedStep[];
  onOpen: (step: GetStartedStep) => void;
}) {
  const { colors } = useThemeTokens();
  const done = steps.filter((step) => step.done).length;

  return (
    <View style={styles.section}>
      <View style={styles.header}>
        <ThemedText accessibilityRole="header" style={[styles.heading, { color: colors.text }]}>
          Get started
        </ThemedText>
        <ThemedText tone="muted" style={styles.count}>
          {done} of {steps.length} done
        </ThemedText>
      </View>
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        {steps.map((step, index) => (
          <PressableView
            key={step.key}
            accessibilityRole="button"
            accessibilityState={{ checked: step.done }}
            accessibilityLabel={`${step.title}${step.done ? ', done' : ''}`}
            onPress={() => onOpen(step)}
            style={[
              styles.row,
              index > 0 ? { borderTopWidth: 1, borderTopColor: colors.border } : null,
            ]}
            pressedStyle={styles.pressed}>
            <View
              style={[
                styles.tile,
                {
                  backgroundColor: step.done
                    ? withAlpha(colors.positive, 0.14)
                    : colors.secondary,
                },
              ]}>
              <MaterialCommunityIcons
                name={step.done ? 'check' : step.icon}
                size={18}
                color={step.done ? colors.positive : colors.text}
              />
            </View>
            <View style={styles.text}>
              <ThemedText
                numberOfLines={1}
                style={[
                  styles.title,
                  { color: step.done ? colors.muted : colors.text },
                  step.done ? styles.titleDone : null,
                ]}>
                {step.title}
              </ThemedText>
              <ThemedText tone="muted" numberOfLines={1} style={styles.detail}>
                {step.detail}
              </ThemedText>
            </View>
            <MaterialCommunityIcons
              name="chevron-right"
              size={18}
              color={withAlpha(colors.text, 0.6)}
            />
          </PressableView>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginTop: 8,
    marginBottom: 14,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginHorizontal: 16,
    marginBottom: 10,
  },
  heading: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '700',
  },
  count: {
    fontSize: 12,
    lineHeight: 16,
  },
  card: {
    marginHorizontal: 16,
    borderWidth: 1,
    borderRadius: 16,
    overflow: 'hidden',
  },
  row: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingLeft: 14,
    paddingRight: 12,
    paddingVertical: 8,
  },
  tile: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '600',
  },
  titleDone: {
    textDecorationLine: 'line-through',
  },
  detail: {
    fontSize: 12,
    lineHeight: 16,
  },
  pressed: {
    opacity: 0.7,
  },
});
