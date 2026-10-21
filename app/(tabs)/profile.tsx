import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect, useRouter, useScrollToTop } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Image, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { SettingsRow, SettingsSection } from '@/components/profile/SettingsRow';
import { ThemedText } from '@/components/themed-text';
import { HapticSwitch } from '@/components/ui/HapticSwitch';
import { PressableView } from '@/components/ui/PressableView';
import { TabHeader } from '@/components/ui/TabHeader';
import { useAppSettingsStore } from '@/hooks/use-app-settings-store';
import { useAuthStore } from '@/hooks/use-auth-store';
import { useHasPassed } from '@/hooks/use-has-passed';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import { describeAccess, fetchBillingStatus, type BillingStatus } from '@/lib/billing';
import { userDisplayName } from '@/lib/display-name';
import { clearGuestUpgradeSnooze } from '@/lib/guest-upgrade';
import { getMonogram } from '@/lib/monogram';
import { logoutSession } from '@/lib/auth';
import { appVersionLabel } from '@/lib/app-version';


/**
 * Identity, plan, security, support — and nothing else.
 *
 * Budgets, Subscriptions and the calculators used to sit here as feature
 * tiles, which put the paid features three taps inside a settings drawer next
 * to the logout button. They live in the Money tab now; what is left is the
 * four things a profile is actually for.
 */

export default function ProfileScreen() {
  const { colors } = useThemeTokens();
  const router = useRouter();
  const { user, token, clearAuth } = useAuthStore();
  const [billingStatus, setBillingStatus] = useState<BillingStatus | null>(null);
  const [isBillingLoading, setIsBillingLoading] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  useScrollToTop(scrollRef);

  const handleLogout = async () => {
    if (isLoggingOut) return;
    setIsLoggingOut(true);
    if (token) {
      // A connection failure must not trap the person in the account. Clear
      // the device either way; the server call revokes the token when online.
      await logoutSession(token).catch(() => undefined);
    }
    clearAuth();
    // The next session on this device starts as a guest again, and it deserves
    // to be asked about backing its data up rather than inheriting a snooze the
    // previous account left behind.
    void clearGuestUpgradeSnooze();
    router.replace('/auth');
  };
  const isGuest = !!user?.is_guest;

  useFocusEffect(
    useCallback(() => {
      if (!token) {
        setBillingStatus(null);
        return;
      }
      setIsBillingLoading(true);
      fetchBillingStatus(token)
        .then(setBillingStatus)
        .catch(() => setBillingStatus(null))
        .finally(() => setIsBillingLoading(false));
    }, [token])
  );

  const { smartSorting, setSmartSorting } = useAppSettingsStore();
  const displayName = userDisplayName(user?.username);
  const monogram = getMonogram(displayName);
  const hasEmail = !!user?.email?.trim();
  /*
   * Name and email only. The dot also waited for a phone number, but the
   * phone field is hidden until SMS sign-in exists, so it could never clear
   * (a bug noted in the design review).
   */
  const isProfileIncomplete = !user?.username?.trim() || !hasEmail;

  /**
   * One fact, one line — and the fact has to be the one the balance is in.
   *
   * This was a progress bar plus "12/50 used today", "38 daily left" and
   * "214 total credits left" — four renderings of one number, two of which
   * were the same number subtracted from different things. What a user wants
   * off this screen is whether they can run another AI capture right now.
   *
   * The line that replaced them called that one fact "AI actions", which it is
   * not: a capture costs several credits, so "50 AI actions left" promised ten
   * times the captures it could pay for. Everything else in the app — the
   * credit card on Home, the billing screen, the out-of-credits prompt — says
   * credits, and so does this now. At zero the number has nothing left to
   * report, so the line points at the way out instead, which differs for a
   * guest.
   */
  const credits = billingStatus?.credits;
  // An expired trial with no paid plan does not refill tomorrow — the balance
  // stays at zero until a pass is bought, so "they reset tomorrow" is false.
  // Read so the line redraws the moment the trial runs out.
  useHasPassed(credits?.trial_expires_at);
  const access = describeAccess(billingStatus);
  const creditLine = isBillingLoading
    ? 'Checking your balance'
    : !credits || credits.daily_limit <= 0
      ? 'Plans, credits and lifetime quote'
      : credits.daily_credits_remaining > 0
        ? `${credits.daily_credits_remaining} AI credits left today`
        : isGuest
          ? 'No AI credits left today — sign in for more'
          : access.kind === 'ended'
            ? access.ended.kind === 'pass'
              ? `${access.ended.planName} ${access.ended.refunded ? 'refunded' : 'ended'} — choose a pass to use AI`
              : 'Free trial ended — choose a pass to use AI'
            : 'No AI credits left today — they reset tomorrow';

  return (
    <SafeAreaView style={[styles.flex, { backgroundColor: colors.background }]} edges={['top', 'left', 'right']}>
      <TabHeader
        title="Profile"
        actions={[{ icon: 'magic-staff', accessibilityLabel: 'App mood', onPress: () => router.push('/app-mood') }]}
      />

      <ScrollView ref={scrollRef} showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        <View style={[styles.card, styles.identity, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {user?.profile_photo_uri ? (
            <Image source={{ uri: user.profile_photo_uri }} style={styles.avatar} resizeMode="cover" />
          ) : (
            <View
              accessible
              accessibilityLabel={`${displayName} monogram`}
              style={[styles.avatar, styles.monogram, { backgroundColor: colors.selectedFill }]}>
              <ThemedText style={[styles.monogramText, { color: colors.text }]}>{monogram}</ThemedText>
            </View>
          )}
          <View style={styles.identityText}>
            <ThemedText numberOfLines={1} style={[styles.name, { color: colors.text }]}>
              {displayName}
            </ThemedText>
            {hasEmail || user?.phone ? (
              <ThemedText tone="muted" numberOfLines={1} style={styles.contact}>
                {[user?.email, user?.phone].filter((value) => value?.trim()).join(' · ')}
              </ThemedText>
            ) : null}
          </View>
          <PressableView
            accessibilityRole="button"
            accessibilityLabel={isProfileIncomplete ? 'Edit profile, incomplete' : 'Edit profile'}
            onPress={() => router.push('/edit-profile')}
            style={[styles.editButton, { borderColor: colors.borderStrong, backgroundColor: colors.card }]}
            pressedStyle={styles.pressed}>
            <MaterialCommunityIcons name="pencil-outline" size={16} color={colors.text} />
            <ThemedText style={[styles.editLabel, { color: colors.text }]}>Edit</ThemedText>
            {isProfileIncomplete ? (
              <View style={[styles.dot, { backgroundColor: colors.warning, borderColor: colors.card }]} />
            ) : null}
          </PressableView>
        </View>

        {/* The one thing a guest most needs from this screen, so it opens the
            screen rather than closing it. Signing out is an exit and earns the
            bottom of the page; signing in is an invitation and does not. */}
        {isGuest ? (
          <SettingsSection>
            <SettingsRow
              icon="login"
              title="Sign in / Create account"
              subtitle="Keep your data safe and unlock more AI credits"
              onPress={() => router.push('/auth?mode=link')}
            />
          </SettingsSection>
        ) : null}

        <SettingsSection title="Plan & AI">
          <SettingsRow icon="creation" title="Plans & credits" subtitle={creditLine} onPress={() => router.push('/billing')} />
          <SettingsRow
            icon="history"
            title="AI usage history"
            subtitle="What each AI action was spent on"
            onPress={() => router.push('/ai-usage')}
            divider
          />
          <SettingsRow
            icon="auto-fix"
            title="Smart Sorting"
            subtitle="Auto-apply AI category, tag and payment suggestions"
            divider
            accessory={<HapticSwitch accessibilityLabel="Smart Sorting" value={smartSorting} onValueChange={setSmartSorting} />}
          />
        </SettingsSection>
        {isGuest ? (
          <ThemedText tone="muted" style={styles.note}>
            Create an account before subscribing so your plan and credits stay with you.
          </ThemedText>
        ) : null}

        <SettingsSection title="Security">
          <SettingsRow
            icon="shield-check-outline"
            title="Security & privacy"
            subtitle="PIN lock, biometrics and stealth mode"
            onPress={() => router.push('/security')}
          />
        </SettingsSection>

        <SettingsSection title="Support">
          <SettingsRow
            icon="help-circle-outline"
            title="Help & support"
            subtitle="Answers, contact and what’s next"
            onPress={() => router.push('/help-support')}
          />
          <SettingsRow
            icon="message-text-outline"
            title="Feedback & ideas"
            subtitle="Suggest features or report issues"
            onPress={() => router.push('/feedback')}
            divider
          />
          <SettingsRow
            icon="information-outline"
            title="About Finnri"
            subtitle="Our story and values"
            onPress={() => router.push('/about-finnri')}
            divider
          />
        </SettingsSection>

        {/* Sign out — last thing on the screen, where a destructive action
            belongs. A guest sees the sign-in invitation up top instead. */}
        {isGuest ? null : (
          <PressableView
            accessibilityRole="button"
            accessibilityLabel="Log out of Finnri"
            disabled={isLoggingOut}
            onPress={() => void handleLogout()}
            style={[styles.card, styles.logout, { backgroundColor: colors.card, borderColor: colors.border }]}
            pressedStyle={styles.pressed}>
            {isLoggingOut ? (
              <ActivityIndicator size="small" color={colors.negative} />
            ) : (
              <MaterialCommunityIcons name="logout" size={18} color={colors.negative} />
            )}
            <ThemedText style={[styles.logoutLabel, { color: colors.negative }]}>Log out</ThemedText>
          </PressableView>
        )}

        {/* The version is read rather than written: this line was a typed
            literal and had drifted three major versions ahead of the build,
            and it is the one string a user might quote back in a bug report. */}
        <ThemedText tone="muted" style={styles.footer}>
          Finnri v{appVersionLabel} · Handmade with love
        </ThemedText>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  content: {
    gap: 22,
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 40,
  },
  card: {
    borderWidth: 1,
    borderRadius: 16,
  },
  identity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 14,
    paddingLeft: 16,
    paddingRight: 12,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
  },
  monogram: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  monogramText: {
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '700',
  },
  identityText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  name: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '700',
  },
  contact: {
    fontSize: 13,
    lineHeight: 18,
  },
  editButton: {
    height: 36,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingLeft: 10,
    paddingRight: 14,
    borderWidth: 1,
    borderRadius: 18,
  },
  editLabel: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
  },
  dot: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 2,
  },
  note: {
    marginTop: -14,
    fontSize: 12,
    lineHeight: 16,
  },
  logout: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    marginTop: -6,
  },
  logoutLabel: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '600',
  },
  footer: {
    marginTop: -8,
    textAlign: 'center',
    fontSize: 12,
    lineHeight: 16,
  },
  pressed: {
    opacity: 0.7,
  },
});
