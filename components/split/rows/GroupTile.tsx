import { MaterialCommunityIcons } from '@expo/vector-icons';

import { GroupAvatar } from '@/components/split/GroupAvatar';

/**
 * The kind-icon-only group tile.
 *
 * Kept as the name the non-group rows use — "Non-group expenses" has no group
 * and therefore never has a photo. Anything drawing an actual group should use
 * `GroupAvatar` directly and pass its `photo_url`.
 */
export function GroupTile({
  icon,
  size,
  radius,
}: {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  size?: number;
  radius?: number;
}) {
  return <GroupAvatar icon={icon} size={size} radius={radius} />;
}
