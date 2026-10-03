import { MaterialCommunityIcons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { useFocusEffect, useRouter, useScrollToTop } from 'expo-router';
import { cssInterop } from 'nativewind';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppHeader } from '@/components/navigation/AppHeader';
import { ThemedText } from '@/components/themed-text';
import { HapticSwitch } from '@/components/ui/HapticSwitch';
import { Fonts, getMoodIconName } from '@/constants/theme';
import { useAppSettingsStore } from '@/hooks/use-app-settings-store';
import { useAuthStore } from '@/hooks/use-auth-store';
import { useHasPassed } from '@/hooks/use-has-passed';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import { fetchBillingStatus, type BillingStatus } from '@/lib/billing';
import { userDisplayName } from '@/lib/display-name';
import { clearGuestUpgradeSnooze } from '@/lib/guest-upgrade';
import { getMonogram } from '@/lib/monogram';
import { logoutSession } from '@/lib/auth';

const TText = cssInterop(ThemedText, { className: 'style' });

/**
 * Identity, plan, security, support — and nothing else.
 *
 * Budgets, Subscriptions and the calculators used to sit here as feature
 * tiles, which put the paid features three taps inside a settings drawer next
 * to the logout button. They live in the Money tab now; what is left is the
 * four things a profile is actually for.
 */
/** What the build actually is, so the footer cannot drift from it again. */
const appVersion = Constants.expoConfig?.version ?? '1.0.0';

export default function ProfileScreen() {
  const theme = useThemeTokens();
  const colors = theme.colors;
  const isDark = theme.mode === 'dark';
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

  const backgroundColor = colors.background;
  const cardColor = colors.card;
  const borderColor = isDark ? colors.border : 'rgba(0,0,0,0.05)';
  const iconStyle = theme.mood.iconStyle;
  const { smartSorting, setSmartSorting } = useAppSettingsStore();
  const displayName = userDisplayName(user?.username);
  const monogram = getMonogram(displayName);
  const hasEmail = !!user?.email?.trim();
  const hasPhone = !!user?.phone?.trim();
  const isProfileIncomplete = !user?.username?.trim() || !hasEmail || !hasPhone;

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
  const trialHasExpired = useHasPassed(credits?.trial_expires_at);
  const hasPaidPlan =
    billingStatus?.subscription_status === 'active' || billingStatus?.subscription_status === 'cancelled';
  const creditLine = isBillingLoading
    ? 'Checking your balance'
    : !credits || credits.daily_limit <= 0
      ? 'Plans, credits and lifetime quote'
      : credits.daily_credits_remaining > 0
        ? `${credits.daily_credits_remaining} AI credits left today`
        : isGuest
          ? 'No AI credits left today — sign in for more'
          : trialHasExpired && !hasPaidPlan
            ? 'Free trial ended — choose a pass to use AI'
            : 'No AI credits left today — they reset tomorrow';

  return (
    <SafeAreaView className="flex-1" edges={['top', 'left', 'right']} style={{ backgroundColor }}>
      <AppHeader
        title="Profile"
        rightIcon="magic-staff"
        onRightPress={() => router.push('/app-mood')}
      />

      <ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 40 }}>
        <View className="px-6 gap-6">
          {/* Identity */}
          <View className="items-center py-2">
            {user?.profile_photo_uri ? (
              <View className="w-28 h-28 rounded-full border-4 border-white overflow-hidden shadow-sm">
                <Image
                  source={{ uri: user.profile_photo_uri }}
                  style={{ width: '100%', height: '100%' }}
                  resizeMode="cover"
                />
              </View>
            ) : (
              <View
                accessible
                accessibilityLabel={`${displayName} monogram`}
                className="w-28 h-28 rounded-full items-center justify-center border-4 border-white shadow-sm"
                style={{ backgroundColor: colors.secondary }}>
                <TText
                  className="text-4xl"
                  style={{ color: colors.accent, fontFamily: Fonts.title }}>
                  {monogram}
                </TText>
              </View>
            )}

            <TText
              className="text-xl mt-4 font-bold text-center px-4"
              style={{ fontFamily: Fonts.title }}>
              {displayName}
            </TText>
            <View className="mt-2 mb-6 items-center gap-1">
              {hasEmail && (
                <TText className="text-sm italic opacity-60" style={{ fontFamily: Fonts.body }}>
                  {user?.email}
                </TText>
              )}
              {hasPhone && (
                <TText className="text-sm italic opacity-60" style={{ fontFamily: Fonts.body }}>
                  {user?.phone}
                </TText>
              )}
            </View>

            <Pressable
              onPress={() => router.push('/edit-profile')}
              className="relative flex-row items-center px-8 py-3 rounded-full"
              style={{ backgroundColor: colors.secondary }}>
              <MaterialCommunityIcons
                name={getMoodIconName('pencil', iconStyle) as any}
                size={18}
                color={colors.accent}
                style={{ marginRight: 8 }}
              />
              <TText
                className="font-bold text-sm"
                style={{ color: colors.accent, fontFamily: Fonts.title }}>
                Edit My Profile
              </TText>
              {isProfileIncomplete && (
                <View
                  className="absolute -right-1 -top-1 h-3 w-3 rounded-full border-2 border-white"
                  style={{ backgroundColor: '#F9A825' }}
                />
              )}
            </Pressable>
          </View>

          {/* The one thing a guest most needs from this screen, so it opens the
            screen rather than closing it. Signing out is an exit and earns the
            bottom of the page; signing in is an invitation and does not. */}
          {isGuest ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push('/auth?mode=link')}
              className="flex-row items-center rounded-[28px] p-5"
              style={{ backgroundColor: colors.secondary }}>
              <View
                className="w-11 h-11 rounded-2xl items-center justify-center mr-4"
                style={{ backgroundColor: cardColor }}>
                <MaterialCommunityIcons
                  name={getMoodIconName('login', iconStyle) as any}
                  size={22}
                  color={colors.accent}
                />
              </View>
              <View className="flex-1 mr-3">
                <TText
                  className="text-base font-bold"
                  style={{ color: colors.accent, fontFamily: Fonts.title }}>
                  Sign in / Create account
                </TText>
                <TText className="text-xs opacity-60 mt-0.5" style={{ fontFamily: Fonts.body }}>
                  Keep your data safe and unlock more AI credits
                </TText>
              </View>
              <MaterialCommunityIcons name="chevron-right" size={20} color={colors.accent} />
            </Pressable>
          ) : null}

          {/* Plan */}
          <View>
            <SectionLabel>PLAN & AI</SectionLabel>

            <View className="rounded-[32px] overflow-hidden" style={{ backgroundColor: cardColor }}>
              <ProfileRow
                icon="creation"
                iconColor="#EF6C00"
                iconSurface="#FFF3E0"
                title="Plans & credits"
                subtitle={creditLine}
                borderColor={borderColor}
                onPress={() => router.push('/billing')}
              />

              <ProfileRow
                icon="history"
                iconColor="#7B1FA2"
                iconSurface="#F3E5F5"
                title="AI usage history"
                subtitle="What each AI action was spent on"
                borderColor={borderColor}
                onPress={() => router.push('/ai-usage')}
              />

              <View className="flex-row items-center p-5">
                <View
                  className="w-10 h-10 rounded-2xl items-center justify-center mr-4"
                  style={{ backgroundColor: colors.secondary }}>
                  <MaterialCommunityIcons name="creation" size={20} color={colors.accent} />
                </View>
                <View className="flex-1 mr-3">
                  <TText className="text-base font-bold" style={{ fontFamily: Fonts.title }}>
                    Smart Sorting
                  </TText>
                  <TText className="text-xs opacity-50" style={{ fontFamily: Fonts.body }}>
                    Auto-apply AI category, tag, and payment suggestions
                  </TText>
                </View>
                <HapticSwitch
                  value={smartSorting}
                  onValueChange={setSmartSorting}
                  trackColor={{ false: '#E0E0E0', true: colors.accent }}
                  thumbColor="white"
                />
              </View>
            </View>

            {isGuest ? (
              <TText className="mt-3 px-1 text-xs opacity-50" style={{ fontFamily: Fonts.body }}>
                Create an account before subscribing so your plan and credits stay with you.
              </TText>
            ) : null}
          </View>

          {/* Security */}
          <View>
            <SectionLabel>SECURITY</SectionLabel>

            <View className="rounded-[32px] overflow-hidden" style={{ backgroundColor: cardColor }}>
              <ProfileRow
                icon={getMoodIconName('shield-check', iconStyle) as any}
                iconColor="#388E3C"
                iconSurface="#E8F5E9"
                title="Keep it Safe"
                subtitle="PIN lock, biometrics and stealth mode"
                onPress={() => router.push('/security')}
              />
            </View>
          </View>

          {/* Support */}
          <View>
            <SectionLabel>SUPPORT</SectionLabel>

            <View className="rounded-[32px] overflow-hidden" style={{ backgroundColor: cardColor }}>
              <ProfileRow
                icon={getMoodIconName('help-circle', iconStyle) as any}
                iconColor="#7B1FA2"
                iconSurface="#F3E5F5"
                title="Help & Support"
                subtitle="Answers, contact and what's next"
                borderColor={borderColor}
                onPress={() => router.push('/help-support')}
              />

              <ProfileRow
                icon="message-draw"
                iconColor="#00796B"
                iconSurface="#E0F2F1"
                title="Feedback & Ideas"
                subtitle="Suggest features or report issues"
                borderColor={borderColor}
                onPress={() => router.push('/feedback')}
              />

              <ProfileRow
                icon={getMoodIconName('information', iconStyle) as any}
                iconColor="#EF6C00"
                iconSurface="#FFF3E0"
                title="About Finnri"
                subtitle="Our story & values"
                onPress={() => router.push('/about-finnri')}
              />
            </View>
          </View>

          {/* Sign out — last thing on the screen, where a destructive action
            belongs. A guest sees the sign-in invitation up top instead. */}
          {isGuest ? null : (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Log out of Finnri"
              disabled={isLoggingOut}
              onPress={() => void handleLogout()}
              className="flex-row items-center justify-center h-16 rounded-[24px] mt-2 mb-2"
              style={{ backgroundColor: '#FFF5F2' }}>
              {isLoggingOut ? (
                <ActivityIndicator size="small" color="#D32F2F" style={{ marginRight: 10 }} />
              ) : (
                <MaterialCommunityIcons
                  name={getMoodIconName('logout', iconStyle) as any}
                  size={20}
                  color="#D32F2F"
                  style={{ marginRight: 10 }}
                />
              )}
              <TText
                className="text-base font-bold"
                style={{ color: '#D32F2F', fontFamily: Fonts.title }}>
                Log out
              </TText>
            </Pressable>
          )}

          {/* Footer. The version is read rather than written: this line was a
              typed literal and had drifted three major versions ahead of the
              build, and it is the one string on the screen a user might quote
              back in a bug report. */}
          <TText
            className="text-center text-[10px] tracking-widest opacity-30 mt-2 mb-4 uppercase"
            style={{ fontFamily: Fonts.body }}>
            FINNRI V{appVersion} • HANDMADE WITH LOVE
          </TText>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function SectionLabel({ children }: { children: string }) {
  return (
    <TText
      className="text-xs tracking-widest font-bold opacity-40 mb-4 ml-2"
      style={{ fontFamily: Fonts.body }}>
      {children}
    </TText>
  );
}

type ProfileRowProps = {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  iconColor: string;
  iconSurface: string;
  title: string;
  subtitle: string;
  onPress: () => void;
  /** Omit on the last row of a card — a divider under nothing is a stray line. */
  borderColor?: string;
};

function ProfileRow({
  icon,
  iconColor,
  iconSurface,
  title,
  subtitle,
  onPress,
  borderColor,
}: ProfileRowProps) {
  const colors = useThemeTokens().colors;

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      className={`flex-row items-center p-5${borderColor ? ' border-b' : ''}`}
      style={borderColor ? { borderColor } : undefined}>
      <View
        className="w-10 h-10 rounded-2xl items-center justify-center mr-4"
        style={{ backgroundColor: iconSurface }}>
        <MaterialCommunityIcons name={icon} size={20} color={iconColor} />
      </View>
      <View className="flex-1">
        <TText className="text-base font-bold" style={{ fontFamily: Fonts.title }}>
          {title}
        </TText>
        <TText className="text-xs opacity-50" style={{ fontFamily: Fonts.body }}>
          {subtitle}
        </TText>
      </View>
      <MaterialCommunityIcons
        name="chevron-right"
        size={20}
        color={colors.text}
        style={{ opacity: 0.3 }}
      />
    </Pressable>
  );
}
