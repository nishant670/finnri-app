import { MaterialCommunityIcons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { cardVisual } from '@/components/money/money-visuals';
import { SettingsRow } from '@/components/profile/SettingsRow';
import { ThemedText } from '@/components/themed-text';
import { AnimatedBottomSheet } from '@/components/ui/AnimatedBottomSheet';
import { SheetCloseButton } from '@/components/ui/SheetCloseButton';
import { mixHex } from '@/constants/theme';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import { categoryTile } from '@/lib/categories';
import { formatEMIProgress, type EMIPlan } from '@/lib/emi-plans';
import { formatMoney } from '@/lib/money';

/**
 * The EMI plan screen's ⋯ menu, laid out like the Recurring tab's row sheet
 * (RecurringActionsSheet) so a card EMI is managed the way every other
 * recurring payment is. The ⋯ used to go straight to the delete dialog.
 *
 * There is no Edit or Mark paid: the server cannot change a plan once made,
 * and its instalments are paid through the card's bill.
 */
export function EMIPlanActionsSheet({
  plan,
  visible,
  onClose,
  onForeclose,
  onDelete,
}: {
  plan: EMIPlan;
  visible: boolean;
  onClose: () => void;
  onForeclose: () => void;
  onDelete: () => void;
}) {
  const theme = useThemeTokens();
  const { colors } = theme;
  const tile = categoryTile(
    { color: cardVisual.hue, bgColor: mixHex('#FFFFFF', cardVisual.hue, 0.14) },
    theme.mode
  );
  const active = plan.status === 'active';
  const summary = [
    `${formatMoney(plan.monthly_amount)} a month`,
    formatEMIProgress(plan.progress),
  ].join(' · ');
  const run = (action: () => void) => () => {
    onClose();
    action();
  };

  return (
    <AnimatedBottomSheet
      visible={visible}
      onClose={onClose}
      sheetStyle={[styles.sheet, { backgroundColor: colors.card }]}>
      <View testID="emi-plan-actions" accessibilityLabel={plan.title}>
        <View style={[styles.handle, { backgroundColor: colors.borderStrong }]} />
        <View style={styles.sheetHead}>
          <View style={[styles.tile, { backgroundColor: tile.background }]}>
            <MaterialCommunityIcons name={cardVisual.icon} size={18} color={tile.foreground} />
          </View>
          <View style={styles.flex}>
            <ThemedText
              accessibilityRole="header"
              numberOfLines={1}
              style={[styles.sheetTitle, { color: colors.text }]}>
              {plan.title}
            </ThemedText>
            <ThemedText tone="muted" numberOfLines={1} style={styles.caption}>
              {summary}
            </ThemedText>
          </View>
          <SheetCloseButton onPress={onClose} />
        </View>
        {active ? (
          <SettingsRow
            icon="calendar-remove-outline"
            title="Foreclose plan"
            subtitle="Cancels the instalments still to come and frees the limit"
            accessibilityLabel={`Foreclose ${plan.title}`}
            onPress={run(onForeclose)}
          />
        ) : null}
        <SettingsRow
          tone="danger"
          icon="trash-can-outline"
          title="Delete"
          subtitle="Removes the plan and the instalments it created"
          accessibilityLabel={`Delete ${plan.title}`}
          divider={active}
          onPress={run(onDelete)}
        />
      </View>
    </AnimatedBottomSheet>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    minWidth: 0,
  },
  caption: {
    fontSize: 12,
    lineHeight: 16,
  },
  tile: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingBottom: 28,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 8,
    marginBottom: 8,
  },
  sheetHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingLeft: 16,
    paddingRight: 8,
    paddingTop: 4,
    paddingBottom: 12,
  },
  sheetTitle: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '700',
  },
});
