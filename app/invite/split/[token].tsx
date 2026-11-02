import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { UpgradeSheet } from '@/components/billing/UpgradeSheet';
import { ThemedText } from '@/components/themed-text';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { Shimmer } from '@/components/ui/Shimmer';
import { SkeletonFrame } from '@/components/ui/Skeleton';
import { Card } from '@/components/ui/theme-primitives';
import { Fonts } from '@/constants/theme';
import { useAuthStore } from '@/hooks/use-auth-store';
import { useEntitlementGate } from '@/hooks/use-entitlement-gate';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import { getFriendlyErrorMessage } from '@/lib/api-error';
import {
  acceptSplitGroupInvite,
  fetchSplitGroupInvite,
  type SplitGroupInviteDetails,
} from '@/lib/splits';

export default function SplitInviteScreen() {
  const router = useRouter();
  const { token: routeToken } = useLocalSearchParams<{ token?: string }>();
  const authToken = useAuthStore((state) => state.token);
  const user = useAuthStore((state) => state.user);
  const theme = useThemeTokens().colors;
  const [invite, setInvite] = useState<SplitGroupInviteDetails | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const inviteToken = Array.isArray(routeToken) ? routeToken[0] : routeToken;
  const {
    entitlement,
    sheetVisible: upgradeSheetVisible,
    capture: captureEntitlement,
    present: presentUpgrade,
    dismiss: dismissUpgrade,
  } = useEntitlementGate();

  const loadInvite = useCallback(async () => {
    if (!authToken || !inviteToken) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setInvite(await fetchSplitGroupInvite(authToken, inviteToken));
    } catch (loadError) {
      // The invite endpoints sit inside the entitlement-gated split group.
      if (captureEntitlement(loadError)) return;
      setError(getFriendlyErrorMessage(loadError, 'Unable to load this invite.'));
    } finally {
      setLoading(false);
    }
  }, [authToken, captureEntitlement, inviteToken]);

  useEffect(() => {
    void loadInvite();
  }, [loadInvite]);

  const acceptInvite = async () => {
    if (!authToken || !inviteToken || accepting) return;
    setAccepting(true);
    setError(null);
    try {
      await acceptSplitGroupInvite(authToken, inviteToken);
      router.replace('/(tabs)/split');
    } catch (acceptError) {
      if (captureEntitlement(acceptError)) {
        presentUpgrade();
        return;
      }
      setError(getFriendlyErrorMessage(acceptError, 'Unable to join this group.'));
    } finally {
      setAccepting(false);
    }
  };

  const goToAuth = () => {
    router.replace({ pathname: '/auth', params: { inviteToken } });
  };

  return (
    <SafeAreaView className="flex-1 px-6" style={{ backgroundColor: theme.background }}>
      <View className="flex-row items-center py-3">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close invite"
          onPress={() => router.replace('/(tabs)/split')}
          className="h-11 w-11 items-center justify-center">
          <MaterialCommunityIcons name="arrow-left" size={28} color={theme.text} />
        </Pressable>
      </View>

      <View className="flex-1 justify-center">
        <Card style={{ alignItems: 'center', padding: 28 }}>
          <View
            className="h-16 w-16 items-center justify-center rounded-full"
            style={{ backgroundColor: theme.secondary }}>
            <MaterialCommunityIcons name="account-group-outline" size={34} color={theme.accent} />
          </View>
          {/* The group's name and who is inviting you are the whole content of
              this card, so they are what waits — a spinner underneath two lines
              of fallback copy was the card claiming to be finished. */}
          {loading ? (
            <SkeletonFrame
              label="Loading invite"
              testID="split-invite-skeleton"
              style={{ marginTop: 20, width: '100%', alignItems: 'center', gap: 12 }}>
              <Shimmer width="70%" height={26} radius={8} index={0} />
              <Shimmer width="92%" height={14} index={1} />
              <Shimmer width="64%" height={14} index={2} />
            </SkeletonFrame>
          ) : (
            <>
              <ThemedText
                className="mt-5 text-center text-2xl"
                style={{ color: theme.text, fontFamily: Fonts.title }}>
                {invite ? `Join ${invite.group.name}` : 'Split group invite'}
              </ThemedText>
              <ThemedText tone="muted" className="mt-3 text-center text-base leading-6">
                {invite
                  ? `${invite.owner_name} invited you to track shared expenses with ${invite.member_count} people on Finnri.`
                  : 'Open this invite while signed in to Finnri.'}
              </ThemedText>
            </>
          )}

          {error ? <ErrorBanner message={error} style={{ marginTop: 20, width: '100%' }} /> : null}

          <Pressable
            accessibilityRole="button"
            disabled={loading || accepting}
            onPress={user ? acceptInvite : goToAuth}
            className="mt-7 min-h-14 w-full items-center justify-center rounded-2xl px-5"
            style={{ backgroundColor: theme.accent, opacity: loading || accepting ? 0.65 : 1 }}>
            {accepting ? (
              <ActivityIndicator color={theme.onAccent} />
            ) : (
              <ThemedText tone="onAccent" className="text-base" style={{ fontFamily: Fonts.title }}>
                {user ? 'Join group' : 'Sign in to join'}
              </ThemedText>
            )}
          </Pressable>
        </Card>
      </View>

      <UpgradeSheet
        visible={upgradeSheetVisible}
        entitlement={entitlement}
        onClose={dismissUpgrade}
      />
    </SafeAreaView>
  );
}
