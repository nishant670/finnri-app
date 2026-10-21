import {
  FormRow,
  FormRowsCard,
  PrimaryModalButton,
  SplitModal,
} from '@/components/split/primitives/SplitPrimitives';
import { ThemedText } from '@/components/themed-text';

type SplitFriendFormModalProps = {
  visible: boolean;
  isEditing: boolean;
  errorMessage: string | null;
  saving: boolean;
  name: string;
  phone: string;
  email: string;
  onChangeName: (value: string) => void;
  onChangePhone: (value: string) => void;
  onChangeEmail: (value: string) => void;
  onSave: () => void;
  onClose: () => void;
};

/** Add or edit a friend (board R6-AddFriend): three rows in one card, and Save. */
export function SplitFriendFormModal({
  visible,
  isEditing,
  errorMessage,
  saving,
  name,
  phone,
  email,
  onChangeName,
  onChangePhone,
  onChangeEmail,
  onSave,
  onClose,
}: SplitFriendFormModalProps) {
  return (
    <SplitModal
      visible={visible}
      title={isEditing ? 'Edit friend' : 'Add friend'}
      errorMessage={errorMessage}
      footer={
        <PrimaryModalButton
          label={isEditing ? 'Update friend' : 'Save friend'}
          loading={saving}
          onPress={onSave}
        />
      }
      onClose={onClose}>
      <FormRowsCard>
        <FormRow label="Name" value={name} onChangeText={onChangeName} placeholder="Their name" />
        <FormRow
          label="Phone"
          value={phone}
          onChangeText={onChangePhone}
          placeholder="Optional"
          keyboardType="phone-pad"
          divider
        />
        <FormRow
          label="Email"
          value={email}
          onChangeText={onChangeEmail}
          placeholder="Optional"
          keyboardType="email-address"
          autoCapitalize="none"
          divider
        />
      </FormRowsCard>
      {/*
       * Saying what these are *for* is the point. Typing a phone number
       * into a friend row looks like the thing that reaches the person,
       * and it is not — nothing is ever sent to it. It is a matching hint,
       * and it only pays off if it happens to be the same address they
       * sign up with.
       */}
      <ThemedText tone="muted" style={{ fontSize: 13, lineHeight: 18 }}>
        Nothing is sent to these. They are how Finnri recognises this person if they join, so the
        balance you keep for them follows them in.
      </ThemedText>
    </SplitModal>
  );
}
