import { MaterialCommunityIcons } from '@expo/vector-icons';
import { cssInterop } from 'nativewind';
import { Pressable, ScrollView, View } from 'react-native';

import { AppHeader } from '@/components/navigation/AppHeader';
import { AvatarCircle } from '@/components/split/primitives/SplitPrimitives';
import { SplitFullScreenModal } from '@/components/split/primitives/SplitFullScreenModal';
import { GroupAvatar } from '@/components/split/GroupAvatar';
import { getGroupKindConfig } from '@/components/split/split-utils';
import type { SplitGroupSummary } from '@/components/split/split-types';
import { ThemedText } from '@/components/themed-text';
import { SkeletonFrame, SkeletonRows } from '@/components/ui/Skeleton';
import { HapticSwitch } from '@/components/ui/HapticSwitch';
import { Fonts } from '@/constants/theme';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import type { SplitGroupDirectInvite } from '@/lib/splits';

const TText = cssInterop(ThemedText, { className: 'style' });

export function GroupSettingsModal({
  summary,
  currentUserName,
  currentUserContact,
  simplifyGroupDebts,
  defaultSplitLabel,
  pendingInvites,
  pendingInvitesLoading,
  onToggleSimplifyDebts,
  onOpenDefaultSplit,
  onClose,
  onAddPeople,
  onInvitePerson,
  onInviteViaLink,
  onSharePendingInvite,
  onRevokePendingInvite,
  onEditGroup,
  onDeleteGroup,
  onLeaveGroup,
  onReportGroup,
}: {
  summary: SplitGroupSummary | null;
  currentUserName: string;
  currentUserContact: string;
  simplifyGroupDebts: boolean;
  defaultSplitLabel: string;
  pendingInvites: SplitGroupDirectInvite[];
  pendingInvitesLoading: boolean;
  onToggleSimplifyDebts: () => void;
  onOpenDefaultSplit: (summary: SplitGroupSummary) => void;
  onClose: () => void;
  onAddPeople: (summary: SplitGroupSummary) => void;
  onInvitePerson: (summary: SplitGroupSummary) => void;
  onInviteViaLink: (summary: SplitGroupSummary) => void;
  onSharePendingInvite: (invite: SplitGroupDirectInvite) => void;
  onRevokePendingInvite: (invite: SplitGroupDirectInvite) => void;
  onEditGroup: (summary: SplitGroupSummary) => void;
  onDeleteGroup: (summary: SplitGroupSummary) => void;
  onLeaveGroup: (summary: SplitGroupSummary) => void;
  onReportGroup: (summary: SplitGroupSummary) => void;
}) {
  const theme = useThemeTokens().colors;
  if (!summary) return null;

  const kindConfig = getGroupKindConfig(summary.kind);
  const canManageGroup = summary.group.viewer_can_manage === true;
  const roleLabel = summary.group.viewer_role === 'owner' ? 'Owner' : 'Shared member';
  // Everybody in the group, the reader marked as themselves. Built from
  // `memberIds` this listed the owner's friend rows, so a member saw exactly
  // one name — her own — and the person whose group it is was absent from his
  // own group's member list.
  const roster = summary.roster;

  return (
    <SplitFullScreenModal onClose={onClose}>
      {(close) => (
        <>
          <AppHeader
            title="Group settings"
            subtitle={summary.group.name}
            onBack={close}
            style={{ borderBottomColor: theme.border, borderBottomWidth: 1 }}
          />

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 44 }}>
            <View
              className="flex-row items-center gap-5 border-b px-6 py-4"
              style={{ borderColor: theme.border }}>
              <GroupAvatar icon={kindConfig.icon} photoUri={summary.group.photo_url || null} />
              <View className="flex-1">
                <TText variant="screenTitle" style={{ color: theme.text }}>
                  {summary.group.name}
                </TText>
                <TText className="mt-1 text-base" style={{ color: theme.muted }}>
                  {kindConfig.label} • {roleLabel}
                </TText>
              </View>
              {canManageGroup ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Edit group"
                  onPress={() => onEditGroup(summary)}
                  className="h-11 w-11 items-center justify-center">
                  <MaterialCommunityIcons name="pencil-outline" size={25} color={theme.text} />
                </Pressable>
              ) : null}
            </View>

            <SettingsSectionTitle label="Group members" />
            {canManageGroup ? (
              <>
                <SettingsActionRow
                  icon="account-plus-outline"
                  label="Add existing friend"
                  onPress={() => onAddPeople(summary)}
                />
                <SettingsActionRow
                  icon="account-plus-outline"
                  label="Invite a specific person"
                  caption="Their email or phone connects them to the balance you keep for them"
                  onPress={() => onInvitePerson(summary)}
                />
                <SettingsActionRow
                  icon="link-variant"
                  label="Share a group link"
                  caption="Anyone with the link can join"
                  onPress={() => onInviteViaLink(summary)}
                />
              </>
            ) : null}
            {roster.length > 0 ? (
              roster.map((person) => (
                <SettingsMemberRow
                  key={person.slot}
                  label={person.isViewer ? `${person.name} (you)` : person.name}
                  subtitle={person.subtitle}
                />
              ))
            ) : (
              <SettingsMemberRow label={`${currentUserName} (you)`} subtitle={currentUserContact} />
            )}

            {canManageGroup && (pendingInvitesLoading || pendingInvites.length > 0) ? (
              <>
                <SettingsSectionTitle label="Pending invites" />
                {pendingInvitesLoading ? (
                  <SkeletonFrame
                    label="Loading pending invites"
                    testID="pending-invites-skeleton"
                    style={{ paddingHorizontal: 24, paddingVertical: 8 }}>
                    <SkeletonRows count={2} variant="list" showAmount={false} carded={false} />
                  </SkeletonFrame>
                ) : (
                  pendingInvites.map((invite) => (
                    <PendingInviteRow
                      key={invite.id}
                      invite={invite}
                      onShare={() => onSharePendingInvite(invite)}
                      onRevoke={() => onRevokePendingInvite(invite)}
                    />
                  ))
                )}
              </>
            ) : null}

            <SettingsSectionTitle label="Advanced settings" />
            <View className="flex-row items-start gap-5 px-6 py-4">
              <MaterialCommunityIcons name="call-split" size={27} color={theme.text} />
              <View className="flex-1">
                <TText variant="screenTitle" style={{ color: theme.text }}>
                  Simplify group debts
                </TText>
                <TText className="mt-3 text-base leading-6" style={{ color: theme.muted }}>
                  Automatically combines debts to reduce the total number of repayments between
                  group members.{' '}
                  <TText style={{ color: theme.accent, fontFamily: Fonts.title }}>Learn more</TText>
                </TText>
              </View>
              <HapticSwitch
                value={simplifyGroupDebts}
                onValueChange={onToggleSimplifyDebts}
                trackColor={{ false: theme.secondary, true: theme.accent }}
                thumbColor={theme.onAccent}
                ios_backgroundColor={theme.secondary}
              />
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Set the default split for this group"
              onPress={() => onOpenDefaultSplit(summary)}
              className="flex-row items-start gap-5 px-6 py-4">
              <MaterialCommunityIcons name="format-list-bulleted" size={27} color={theme.accent} />
              <View className="flex-1">
                <View className="flex-row items-center gap-2">
                  <TText variant="screenTitle" style={{ color: theme.text }}>
                    Default split
                  </TText>
                  <View
                    className="rounded-full px-2 py-0.5"
                    style={{ backgroundColor: theme.secondary }}>
                    <TText
                      className="text-xs"
                      style={{ color: theme.accent, fontFamily: Fonts.title }}>
                      PRO
                    </TText>
                  </View>
                </View>
                <TText className="mt-2 text-base" style={{ color: theme.muted }}>
                  {defaultSplitLabel}
                </TText>
                <TText className="mt-7 text-base leading-6" style={{ color: theme.muted }}>
                  New expenses in this group start from this split. It belongs to the group, so
                  every member sees it and any of them can change it.
                </TText>
              </View>
              <MaterialCommunityIcons name="chevron-right" size={26} color={theme.text} />
            </Pressable>
            {/* Anyone in the group can report it, owner included — the content
                that needs reporting is as likely to be a member's expense note
                as the group itself, and Play requires the route to be reachable
                from inside the app rather than by email. */}
            <SettingsActionRow
              icon="flag-outline"
              label="Report this group"
              onPress={() => onReportGroup(summary)}
            />
            {!canManageGroup ? (
              <SettingsActionRow
                icon="exit-to-app"
                label="Leave group"
                destructive
                onPress={() => onLeaveGroup(summary)}
              />
            ) : null}
            {canManageGroup ? (
              <SettingsActionRow
                icon="trash-can-outline"
                label="Delete group"
                destructive
                onPress={() => onDeleteGroup(summary)}
              />
            ) : null}
          </ScrollView>
        </>
      )}
    </SplitFullScreenModal>
  );
}

function SettingsSectionTitle({ label }: { label: string }) {
  const theme = useThemeTokens().colors;

  return (
    <TText
      className="px-6 pb-3 pt-6 text-base"
      style={{ color: theme.mutedStrong, fontFamily: Fonts.title }}>
      {label}
    </TText>
  );
}

function SettingsActionRow({
  icon,
  label,
  caption,
  destructive,
  onPress,
}: {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  label: string;
  /** One line under the label, for a row whose name cannot carry the whole of
   *  what it does — the two invite rows differ in a way "invite" does not say. */
  caption?: string;
  destructive?: boolean;
  onPress: () => void;
}) {
  const theme = useThemeTokens().colors;
  const color = destructive ? theme.negative : theme.text;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      className="min-h-[76px] flex-row items-center gap-8 px-8 py-3">
      <View className="w-10 items-center">
        <MaterialCommunityIcons name={icon} size={27} color={color} />
      </View>
      <View className="flex-1">
        <TText className="text-xl" style={{ color, fontFamily: Fonts.body }}>
          {label}
        </TText>
        {caption ? (
          <TText className="mt-1 text-xs" style={{ color: theme.muted }}>
            {caption}
          </TText>
        ) : null}
      </View>
    </Pressable>
  );
}

function PendingInviteRow({
  invite,
  onShare,
  onRevoke,
}: {
  invite: SplitGroupDirectInvite;
  onShare: () => void;
  onRevoke: () => void;
}) {
  const theme = useThemeTokens().colors;
  const label = invite.target_email || invite.target_phone || 'Invite';
  const subtitle = [
    // Nothing was sent. For somebody already on Finnri the invite really is
    // waiting in their notifications; for everybody else the link is still
    // sitting with the owner, and saying so is the only way they know to send
    // it again.
    invite.matched_user ? 'Waiting in their Finnri notifications' : 'Share the link with them',
    invite.status,
  ]
    .filter(Boolean)
    .join(' • ');
  return (
    <View className="min-h-[72px] flex-row items-center gap-4 px-6 py-3">
      <View
        className="h-10 w-10 items-center justify-center rounded-full"
        style={{ backgroundColor: theme.secondary }}>
        <MaterialCommunityIcons name="email-outline" size={21} color={theme.accent} />
      </View>
      <View className="flex-1">
        <TText
          className="text-base"
          numberOfLines={1}
          style={{ color: theme.text, fontFamily: Fonts.title }}>
          {label}
        </TText>
        <TText className="mt-1 text-xs" style={{ color: theme.muted }} numberOfLines={1}>
          {subtitle}
        </TText>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Share invite"
        onPress={onShare}
        className="h-10 w-10 items-center justify-center rounded-full"
        style={{ backgroundColor: theme.card }}>
        <MaterialCommunityIcons name="share-variant-outline" size={21} color={theme.text} />
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Revoke invite"
        onPress={onRevoke}
        className="h-10 w-10 items-center justify-center rounded-full"
        style={{ backgroundColor: theme.card }}>
        <MaterialCommunityIcons name="trash-can-outline" size={21} color={theme.negative} />
      </Pressable>
    </View>
  );
}

function SettingsMemberRow({ label, subtitle }: { label: string; subtitle?: string }) {
  const theme = useThemeTokens().colors;
  return (
    <View className="min-h-[82px] flex-row items-center gap-5 px-6">
      <AvatarCircle label={label} size={58} />
      <View className="flex-1">
        <TText variant="cardTitle" style={{ color: theme.text }}>
          {label}
        </TText>
        {subtitle ? (
          <TText className="mt-1 text-base" style={{ color: theme.muted }} numberOfLines={1}>
            {subtitle}
          </TText>
        ) : null}
      </View>
    </View>
  );
}
