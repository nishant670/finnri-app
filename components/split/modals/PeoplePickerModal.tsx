import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Contacts from 'expo-contacts/legacy';
import { cssInterop } from 'nativewind';
import { ActivityIndicator, Image, Pressable, ScrollView, TextInput, View } from 'react-native';

import { AppHeader } from '@/components/navigation/AppHeader';
import { contactMatchesFriend } from '@/components/split/split-utils';
import type { DeviceContactOption, SplitGroupSummary } from '@/components/split/split-types';
import { SplitFullScreenModal } from '@/components/split/primitives/SplitFullScreenModal';
import { ThemedText } from '@/components/themed-text';
import { KeyboardAvoidingScreen } from '@/components/ui/KeyboardAvoidingScreen';
import { SkeletonFrame, SkeletonRows } from '@/components/ui/Skeleton';
import { Fonts } from '@/constants/theme';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import type { SplitFriend } from '@/lib/splits';

const TText = cssInterop(ThemedText, { className: 'style' });

/** Who the picker is choosing people for. */
export type PeoplePickerTarget =
  | { kind: 'group'; summary: SplitGroupSummary }
  | { kind: 'friends' };

/**
 * One people picker for a group's members and for adding friends: your
 * friends first, then the phone's contacts that are not friends yet.
 *
 * "Friends on Finnri" used to sit at the very bottom, under the whole phone
 * book, and was never that: it listed every friend you had saved. Friends now
 * come first, and only those linked to an account wear "On Finnri".
 *
 * A contact you tap is only held here. It becomes a friend when you save, so
 * backing out leaves nothing behind, and a second tap lets it go again.
 */
export function PeoplePickerModal({
  target,
  friends,
  contacts,
  contactsPermissionStatus,
  contactsAccessPrivileges,
  contactsLoading,
  searchQuery,
  selectedFriendIds,
  selectedContactIds,
  saving,
  onChangeSearchQuery,
  onToggleFriend,
  onToggleContact,
  onRequestContactsAccess,
  onCreateFriend,
  onClose,
  onSave,
}: {
  target: PeoplePickerTarget | null;
  friends: SplitFriend[];
  contacts: DeviceContactOption[];
  contactsPermissionStatus: Contacts.PermissionStatus | null;
  contactsAccessPrivileges: Contacts.ContactsPermissionResponse['accessPrivileges'] | null;
  contactsLoading: boolean;
  searchQuery: string;
  selectedFriendIds: number[];
  selectedContactIds: string[];
  saving: boolean;
  onChangeSearchQuery: (value: string) => void;
  onToggleFriend: (friendId: number) => void;
  onToggleContact: (contact: DeviceContactOption) => void;
  onRequestContactsAccess: () => void;
  onCreateFriend: () => void;
  onClose: () => void;
  onSave: () => void;
}) {
  const theme = useThemeTokens().colors;
  if (!target) return null;

  const forGroup = target.kind === 'group';
  const normalizedSearch = searchQuery.trim().toLowerCase();
  const matchesSearch = (values: (string | undefined)[]) =>
    values.filter(Boolean).join(' ').toLowerCase().includes(normalizedSearch);
  const contactAccessGranted = contactsPermissionStatus === Contacts.PermissionStatus.GRANTED;
  // A contact who is already a friend is listed once, as the friend.
  const newContacts = contacts.filter(
    (contact) => !friends.some((friend) => contactMatchesFriend(contact, friend))
  );
  const alreadyFriendsCount = contacts.length - newContacts.length;
  const filteredContacts = newContacts.filter((contact) =>
    matchesSearch([contact.name, contact.phone, contact.email])
  );
  const filteredFriends = friends.filter((friend) =>
    matchesSearch([friend.name, friend.phone, friend.email])
  );
  const chosen = [
    ...friends
      .filter((friend) => selectedFriendIds.includes(friend.id))
      .map((friend) => ({ key: `friend-${friend.id}`, name: friend.name, onRemove: () => onToggleFriend(friend.id) })),
    ...contacts
      .filter((contact) => selectedContactIds.includes(contact.id))
      .map((contact) => ({ key: `contact-${contact.id}`, name: contact.name, onRemove: () => onToggleContact(contact) })),
  ];
  // Adding friends with nobody picked has nothing to save.
  const saveDisabled = saving || (!forGroup && selectedContactIds.length === 0);

  return (
    <SplitFullScreenModal onClose={onClose}>
      {(close) => (
        <>
          <AppHeader
            title={forGroup ? 'Group members' : 'Add friends'}
            subtitle={forGroup ? target.summary.group.name : undefined}
            onBack={close}
            rightNode={
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={forGroup ? 'Save group members' : 'Add the chosen friends'}
                disabled={saveDisabled}
                onPress={onSave}
                className="ml-4 min-h-10 min-w-12 items-center justify-center rounded-full px-3"
                style={{ backgroundColor: theme.card, opacity: saveDisabled && !saving ? 0.5 : 1 }}>
                {saving ? (
                  <ActivityIndicator color={theme.accent} />
                ) : (
                  <TText variant="button" style={{ color: theme.accent }}>
                    {forGroup ? 'Save' : 'Add'}
                  </TText>
                )}
              </Pressable>
            }
          />
          <View
            className="mx-6 mb-3 flex-row items-center rounded-2xl px-4"
            style={{ backgroundColor: theme.card }}>
            <MaterialCommunityIcons name="magnify" size={21} color={theme.accent} />
            <TextInput
              value={searchQuery}
              onChangeText={onChangeSearchQuery}
              autoFocus
              autoCapitalize="none"
              placeholder="Enter name, email, or phone #"
              placeholderTextColor={theme.mutedStrong}
              style={{
                flex: 1,
                minHeight: 48,
                marginLeft: 10,
                color: theme.text,
                fontFamily: Fonts.body,
                fontSize: 16,
              }}
            />
          </View>

          {chosen.length > 0 ? (
            <ScrollView
              horizontal
              keyboardShouldPersistTaps="handled"
              showsHorizontalScrollIndicator={false}
              style={{ flexGrow: 0 }}
              contentContainerStyle={{ gap: 8, paddingHorizontal: 24, paddingBottom: 8 }}>
              {chosen.map((person) => (
                <Pressable
                  key={person.key}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${person.name}`}
                  onPress={person.onRemove}
                  className="min-h-9 flex-row items-center gap-1 rounded-full pl-3 pr-2"
                  style={{ backgroundColor: theme.selectedFill, borderWidth: 1, borderColor: theme.selectedBorder }}>
                  <TText className="text-sm" numberOfLines={1} style={{ color: theme.text, fontFamily: Fonts.title }}>
                    {person.name}
                  </TText>
                  <MaterialCommunityIcons name="close" size={16} color={theme.text} />
                </Pressable>
              ))}
            </ScrollView>
          ) : null}

          <KeyboardAvoidingScreen
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 44 }}>
            <Pressable
              accessibilityRole="button"
              onPress={onCreateFriend}
              className="min-h-16 flex-row items-center gap-8 py-2">
              <View className="w-12 items-center">
                <MaterialCommunityIcons name="account-plus-outline" size={28} color={theme.text} />
              </View>
              <TText
                className="flex-1 text-xl"
                style={{ color: theme.text, fontFamily: Fonts.body }}>
                {searchQuery.trim()
                  ? `Add "${searchQuery.trim()}" as new friend`
                  : 'Add someone new'}
              </TText>
            </Pressable>

            {forGroup ? (
              <>
                <SectionLabel label="Your friends" />
                {filteredFriends.length > 0 ? (
                  <View className="mt-3">
                    {filteredFriends.map((friend) => (
                      <MemberDirectoryRow
                        key={friend.id}
                        title={friend.name}
                        subtitle={[friend.phone, friend.email].filter(Boolean).join(', ')}
                        onFinnri={Boolean(friend.linked_user_id)}
                        selected={selectedFriendIds.includes(friend.id)}
                        onPress={() => onToggleFriend(friend.id)}
                      />
                    ))}
                  </View>
                ) : (
                  <TText className="mt-6 text-sm" style={{ color: theme.muted }}>
                    {normalizedSearch ? 'No matching friends.' : 'No friends yet.'}
                  </TText>
                )}
              </>
            ) : null}

            <SectionLabel label="From your contacts" />
            {!contactAccessGranted ? (
              <ContactsPermissionPrompt
                loading={contactsLoading}
                denied={contactsPermissionStatus === Contacts.PermissionStatus.DENIED}
                onRequest={onRequestContactsAccess}
              />
            ) : contactsLoading ? (
              <SkeletonFrame label="Loading contacts" testID="contacts-skeleton">
                <SkeletonRows count={5} variant="list" showAmount={false} carded={false} />
              </SkeletonFrame>
            ) : filteredContacts.length > 0 ? (
              <View className="mt-3">
                {contactsAccessPrivileges === 'limited' ? (
                  <TText className="mb-2 text-xs" style={{ color: theme.muted }}>
                    Showing contacts you allowed Finnri to access.
                  </TText>
                ) : null}
                {!forGroup && alreadyFriendsCount > 0 && !normalizedSearch ? (
                  <TText className="mb-2 text-xs" style={{ color: theme.muted }}>
                    {alreadyFriendsCount === 1
                      ? '1 contact is already your friend.'
                      : `${alreadyFriendsCount} contacts are already your friends.`}
                  </TText>
                ) : null}
                {filteredContacts.map((contact) => (
                  <MemberDirectoryRow
                    key={contact.id}
                    title={contact.name}
                    subtitle={[contact.phone, contact.email].filter(Boolean).join(', ')}
                    imageUri={contact.imageUri}
                    selected={selectedContactIds.includes(contact.id)}
                    onPress={() => onToggleContact(contact)}
                  />
                ))}
              </View>
            ) : (
              <TText className="mt-6 text-sm" style={{ color: theme.muted }}>
                {normalizedSearch
                  ? 'No matching contacts.'
                  : newContacts.length === 0 && contacts.length > 0
                    ? 'All your contacts are already friends.'
                    : 'No contacts available.'}
              </TText>
            )}
          </KeyboardAvoidingScreen>
        </>
      )}
    </SplitFullScreenModal>
  );
}

function SectionLabel({ label }: { label: string }) {
  const theme = useThemeTokens().colors;
  return (
    <TText className="mt-6 text-base" style={{ color: theme.mutedStrong, fontFamily: Fonts.title }}>
      {label}
    </TText>
  );
}

function ContactsPermissionPrompt({
  loading,
  denied,
  onRequest,
}: {
  loading: boolean;
  denied: boolean;
  onRequest: () => void;
}) {
  const theme = useThemeTokens().colors;
  return (
    <View className="items-center px-4 py-12">
      <View
        className="h-36 w-36 items-center justify-center rounded-full"
        style={{ backgroundColor: theme.secondary }}>
        <MaterialCommunityIcons name="contacts-outline" size={72} color={theme.accent} />
      </View>
      <TText className="mt-8 text-center text-lg leading-7" style={{ color: theme.muted }}>
        Allow Finnri to access your contacts to add people faster.
      </TText>
      <Pressable
        accessibilityRole="button"
        disabled={loading}
        onPress={onRequest}
        className="mt-8 min-h-12 min-w-[230px] items-center justify-center rounded"
        style={{ backgroundColor: theme.accent, opacity: loading ? 0.75 : 1 }}>
        {loading ? (
          <ActivityIndicator color={theme.onAccent} />
        ) : (
          <TText variant="button" style={{ color: theme.onAccent }}>
            {denied ? 'Request contact access' : 'Allow contact access'}
          </TText>
        )}
      </Pressable>
    </View>
  );
}

function MemberDirectoryRow({
  title,
  subtitle,
  imageUri,
  onFinnri = false,
  selected,
  onPress,
}: {
  title: string;
  subtitle?: string;
  imageUri?: string;
  /** Linked to a Finnri account, so the split reaches them in the app. */
  onFinnri?: boolean;
  selected: boolean;
  onPress: () => void;
}) {
  const theme = useThemeTokens().colors;
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      className="min-h-[76px] flex-row items-center gap-8 py-2">
      <View className="w-12 items-center">
        {imageUri ? (
          <Image source={{ uri: imageUri }} className="h-12 w-12 rounded-full" />
        ) : (
          <View
            className="h-12 w-12 items-center justify-center rounded-full"
            style={{ backgroundColor: selected ? theme.accent : theme.secondary }}>
            <MaterialCommunityIcons
              name={subtitle ? 'phone-outline' : 'account-outline'}
              size={22}
              color={selected ? theme.onAccent : theme.text}
            />
          </View>
        )}
      </View>
      <View className="flex-1">
        <View className="flex-row items-center gap-2">
          <TText
            className="shrink text-xl"
            numberOfLines={1}
            style={{ color: theme.text, fontFamily: Fonts.body }}>
            {title}
          </TText>
          {onFinnri ? (
            <View className="rounded-full px-2 py-0.5" style={{ backgroundColor: theme.selectedFill }}>
              <TText className="text-xs" style={{ color: theme.text, fontFamily: Fonts.title }}>
                On Finnri
              </TText>
            </View>
          ) : null}
        </View>
        {subtitle ? (
          <TText className="mt-1 text-sm" style={{ color: theme.muted }} numberOfLines={1}>
            {subtitle}
          </TText>
        ) : null}
      </View>
      {selected ? (
        <MaterialCommunityIcons name="check-circle" size={22} color={theme.accent} />
      ) : null}
    </Pressable>
  );
}
