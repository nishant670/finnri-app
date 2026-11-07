import type { ComponentType } from 'react';

import type { WhatsNewPreview } from '@/lib/whats-new/releases';

import { PaymentHabitPreview } from './PaymentHabitPreview';
import { ProfilePreview } from './ProfilePreview';
import { WalletsPreview } from './WalletsPreview';

export { PreviewFrame } from './PreviewFrame';

/**
 * Every live preview, by the key a release names. Add one when a release ships
 * a screen worth showing; delete it once no bundled release names it.
 */
export const PREVIEWS: Record<WhatsNewPreview, ComponentType> = {
  'payment-habit': PaymentHabitPreview,
  wallets: WalletsPreview,
  profile: ProfilePreview,
};
