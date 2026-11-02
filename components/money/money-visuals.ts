import type { MaterialCommunityIcons } from '@expo/vector-icons';

import type { RecurringKind } from '@/lib/subscriptions';

type Visual = { icon: keyof typeof MaterialCommunityIcons.glyphMap; hue: string };

/** One hue and glyph per kind of thing on the Money tab (boards R5-*). */
export const recurringVisuals: Record<RecurringKind, Visual> = {
  loan: { icon: 'bank-outline', hue: '#1E6FB8' },
  subscription: { icon: 'calendar-sync-outline', hue: '#C2185B' },
  investment: { icon: 'chart-line', hue: '#16825D' },
  bill: { icon: 'file-document-outline', hue: '#26A69A' },
};

export const cardVisual: Visual = { icon: 'credit-card-outline', hue: '#6A4BBC' };
export const refundVisual: Visual = { icon: 'arrow-u-left-top', hue: '#16825D' };
