import {
  FormInput,
  PrimaryModalButton,
  SplitModal,
} from '@/components/split/primitives/SplitPrimitives';
import { TText } from '@/components/split/primitives/themed-interop';
import { useThemeTokens } from '@/hooks/use-theme-tokens';

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
  const theme = useThemeTokens().colors;
  return (
    <SplitModal
      visible={visible}
      title={isEditing ? 'Edit Friend' : 'Add Friend'}
      errorMessage={errorMessage}
      footer={
        <PrimaryModalButton
          label={isEditing ? 'Update friend' : 'Save friend'}
          loading={saving}
          onPress={onSave}
        />
      }
      onClose={onClose}>
      <FormInput label="Name" value={name} onChangeText={onChangeName} />
      <FormInput
        label="Phone (optional)"
        value={phone}
        onChangeText={onChangePhone}
        keyboardType="phone-pad"
      />
      <FormInput
        label="Email (optional)"
        value={email}
        onChangeText={onChangeEmail}
        keyboardType="email-address"
        autoCapitalize="none"
      />
      {/*
       * Saying what these are *for* is the point. Typing a phone number
       * into a friend row looks like the thing that reaches the person,
       * and it is not — nothing is ever sent to it. It is a matching hint,
       * and it only pays off if it happens to be the same address they
       * sign up with.
       */}
      <TText className="text-xs" style={{ color: theme.muted }}>
        Nothing is sent to these. They are how Finnri recognises this person if they join, so the
        balance you keep for them follows them in.
      </TText>
    </SplitModal>
  );
}
