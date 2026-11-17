import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { SketchCard } from '@/components/cards/SketchCard';
import { ThemedText } from '@/components/themed-text';
import { PressableView } from '@/components/ui/PressableView';
import { Shimmer } from '@/components/ui/Shimmer';
import { withAlpha } from '@/constants/theme';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import { CARD_H, CARD_NETWORKS, CARD_W, cardNetworkLabel, productArt } from '@/lib/card-art';
import { fetchCardProducts, type CardProduct } from '@/lib/card-products';
import type { CardNetwork } from '@/lib/accounts';

const TILE_W = 136;
const TILE_H = Math.round((TILE_W * CARD_H) / CARD_W);

/**
 * Add card's product step (plan §6): once the bank is known, that bank's cards
 * as their sketches, most held first, then "My card isn't listed", which keeps
 * the old free-text path. Banks with nothing in the catalogue skip the step.
 */
export function CardProductPicker({
  token,
  issuerId,
  bankName,
  selectedId,
  notListed,
  onSelect,
  onNotListed,
}: {
  token: string | null | undefined;
  issuerId: string;
  /** "HDFC Bank": the question names the bank just picked. */
  bankName: string;
  selectedId: string;
  notListed: boolean;
  onSelect: (product: CardProduct) => void;
  onNotListed: () => void;
}) {
  const theme = useThemeTokens().colors;
  const [products, setProducts] = useState<CardProduct[] | null>(null);

  useEffect(() => {
    if (!token || !issuerId) {
      setProducts([]);
      return;
    }
    let active = true;
    setProducts(null);
    fetchCardProducts(token, issuerId)
      .then((list) => {
        if (active) setProducts(list);
      })
      .catch(() => {
        // The catalogue is a nicety: without it, the card is added as before.
        if (active) setProducts([]);
      });
    return () => {
      active = false;
    };
  }, [issuerId, token]);

  if (products !== null && products.length === 0) return null;

  return (
    <View style={styles.field} testID="card-product-picker">
      <ThemedText style={[styles.label, { color: theme.text }]}>{`Which ${bankName} card?`}</ThemedText>
      <ScrollView
        horizontal
        accessibilityRole="radiogroup"
        accessibilityLabel={`Which ${bankName} card`}
        keyboardShouldPersistTaps="handled"
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}>
        {products === null
          ? [0, 1, 2].map((index) => (
              <View key={index} style={styles.tile}>
                <Shimmer width={TILE_W} height={TILE_H} radius={10} index={index} />
                <Shimmer width="70%" height={12} index={index + 3} />
              </View>
            ))
          : products.map((product) => {
              const selected = product.id === selectedId;
              const art = productArt(product);
              return (
                <PressableView
                  key={product.id}
                  testID={`card-product-${product.id}`}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  accessibilityLabel={product.name}
                  onPress={() => onSelect(product)}
                  style={styles.tile}
                  pressedStyle={styles.pressed}>
                  <View style={styles.frame}>
                    {selected ? <View style={[styles.ring, { borderColor: theme.text }]} /> : null}
                    <SketchCard
                      art={art}
                      bank=""
                      bare
                      width={art.portrait ? (TILE_H * CARD_H) / CARD_W : TILE_W}
                    />
                    {selected ? (
                      <View style={[styles.check, { backgroundColor: theme.text }]}>
                        <MaterialCommunityIcons name="check" size={14} color={theme.background} />
                      </View>
                    ) : null}
                  </View>
                  <ThemedText
                    numberOfLines={2}
                    style={[styles.name, { color: theme.text, fontWeight: selected ? '700' : '500' }]}>
                    {product.name}
                  </ThemedText>
                </PressableView>
              );
            })}
        {products !== null ? (
          <PressableView
            testID="card-product-not-listed"
            accessibilityRole="radio"
            accessibilityState={{ selected: notListed }}
            onPress={onNotListed}
            style={styles.tile}
            pressedStyle={styles.pressed}>
            <View
              style={[
                styles.notListed,
                {
                  borderColor: notListed ? theme.selectedBorder : theme.borderStrong,
                  backgroundColor: notListed ? theme.selectedFill : withAlpha(theme.card, 0.6),
                },
              ]}>
              <MaterialCommunityIcons name="card-search-outline" size={22} color={theme.text} />
            </View>
            <ThemedText
              numberOfLines={2}
              style={[styles.name, { color: theme.text, fontWeight: notListed ? '700' : '500' }]}>
              {"My card isn't listed"}
            </ThemedText>
          </PressableView>
        ) : null}
      </ScrollView>
    </View>
  );
}

/** Optional: the network printed on the card, as plain text (P94). */
export function CardNetworkChips({
  value,
  onChange,
}: {
  value: CardNetwork | '';
  onChange: (network: CardNetwork | '') => void;
}) {
  const theme = useThemeTokens().colors;
  return (
    <View style={styles.field}>
      <ThemedText style={[styles.label, { color: theme.text }]}>
        Network <ThemedText tone="muted" style={styles.optional}>optional</ThemedText>
      </ThemedText>
      <View accessibilityRole="radiogroup" style={styles.chips}>
        {CARD_NETWORKS.map((network) => {
          const selected = value === network;
          return (
            <PressableView
              key={network}
              testID={`card-network-${network}`}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              onPress={() => onChange(selected ? '' : network)}
              style={[
                styles.chip,
                {
                  backgroundColor: selected ? theme.selectedFill : theme.card,
                  borderColor: selected ? theme.selectedBorder : theme.border,
                },
              ]}
              pressedStyle={styles.pressed}>
              <ThemedText style={[styles.chipLabel, { color: theme.text, fontWeight: selected ? '700' : '500' }]}>
                {cardNetworkLabel(network)}
              </ThemedText>
            </PressableView>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    marginTop: 16,
  },
  label: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600',
    marginBottom: 8,
  },
  optional: {
    fontSize: 13,
    fontWeight: '400',
  },
  row: {
    gap: 12,
    padding: 3,
  },
  tile: {
    width: TILE_W,
    gap: 6,
  },
  frame: {
    width: TILE_W,
    height: TILE_H,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    position: 'absolute',
    top: -3,
    left: -3,
    right: -3,
    bottom: -3,
    borderRadius: 16,
    borderWidth: 2,
  },
  check: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notListed: {
    width: TILE_W,
    height: TILE_H,
    borderRadius: 12,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: {
    fontSize: 13,
    lineHeight: 17,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    height: 40,
    justifyContent: 'center',
    paddingHorizontal: 14,
    borderWidth: 1,
    borderRadius: 20,
  },
  chipLabel: {
    fontSize: 14,
    lineHeight: 18,
  },
  pressed: {
    opacity: 0.7,
  },
});
