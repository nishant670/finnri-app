import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { useAuthStore } from '@/hooks/use-auth-store';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import { isLocalAttachmentUri, resolveAttachmentForDisplay } from '@/lib/uploads';

/**
 * A group's tile: its photo when it has one, its kind icon when it does not.
 *
 * The two share one component so a photo can never be half-adopted — the
 * fallback is the same square, the same radius and the same border, so a list
 * of groups where only some have pictures still reads as one list.
 *
 * Hosted photos are exchanged for a short-lived signed URL here rather than at
 * each of the three call sites, for the same reason: a group photo that only
 * some screens knew how to fetch would be exactly the half-adoption the single
 * component exists to prevent.
 */
export function GroupAvatar({
  icon,
  photoUri,
  size = 58,
  radius: radiusOverride,
}: {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  /** A hosted URL, or a local file the user has just picked and not yet saved. */
  photoUri?: string | null;
  size?: number;
  /** The corner, for a tile drawn smaller than the default (the 36dp list tile uses 10). */
  radius?: number;
}) {
  const theme = useThemeTokens();
  const { token } = useAuthStore();
  const radius = radiusOverride ?? theme.icon.containerRadius;
  // A freshly picked file is already displayable and must not wait on the
  // network; anything hosted needs the signature before it will load.
  const isLocal = isLocalAttachmentUri(photoUri);
  const [displayUri, setDisplayUri] = useState<string | null>(isLocal ? photoUri! : null);

  useEffect(() => {
    if (!photoUri) {
      setDisplayUri(null);
      return;
    }
    if (isLocalAttachmentUri(photoUri)) {
      setDisplayUri(photoUri);
      return;
    }
    if (!token) {
      setDisplayUri(null);
      return;
    }
    let active = true;
    resolveAttachmentForDisplay(token, photoUri)
      .then((url) => {
        if (active) setDisplayUri(url);
      })
      .catch(() => {
        // Fall back to the kind icon. A group with an unreachable photo still
        // has to draw as a group, not as an empty square.
        if (active) setDisplayUri(null);
      });
    return () => {
      active = false;
    };
  }, [photoUri, token]);

  if (displayUri) {
    return (
      <Image
        // The signature and expiry rotate on every resolve, so the URL is no
        // longer a usable cache key — keyed on it, the disk cache would miss
        // every single time. The stored path is the stable identity of these
        // bytes, so cache against that instead.
        source={{ uri: displayUri, cacheKey: photoUri ?? displayUri }}
        style={{
          height: size,
          width: size,
          borderRadius: radius,
          borderWidth: 1,
          borderColor: theme.colors.border,
          backgroundColor: theme.colors.secondary,
        }}
        contentFit="cover"
        // The photo is the same bytes on every screen that draws the group, so
        // it is worth keeping on disk rather than refetching per list render.
        cachePolicy="memory-disk"
        transition={0}
        accessibilityIgnoresInvertColors
      />
    );
  }

  return (
    <View
      className="items-center justify-center border"
      style={{
        height: size,
        width: size,
        backgroundColor: theme.colors.secondary,
        borderColor: theme.colors.border,
        borderRadius: radius,
      }}>
      <MaterialCommunityIcons
        name={icon}
        size={Math.round(size * 0.47)}
        color={theme.colors.accent}
      />
    </View>
  );
}
