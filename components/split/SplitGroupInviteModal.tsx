
import {
  FormInput,
  PrimaryModalButton,
  SplitModal,
} from '@/components/split/primitives/SplitPrimitives';
import { TText } from '@/components/split/primitives/themed-interop';
import { useThemeTokens } from '@/hooks/use-theme-tokens';

type SplitGroupInviteModalProps = {
  visible: boolean;
  errorMessage: string | null;
  saving: boolean;
  email: string;
  phone: string;
  onChangeEmail: (value: string) => void;
  onChangePhone: (value: string) => void;
  onSend: () => void;
  onClose: () => void;
};

export function SplitGroupInviteModal({
  visible,
  errorMessage,
  saving,
  email,
  phone,
  onChangeEmail,
  onChangePhone,
  onSend,
  onClose,
}: SplitGroupInviteModalProps) {
  const theme = useThemeTokens().colors;
  return (
    <SplitModal
      visible={visible}
      title="Invite a specific person"
      errorMessage={errorMessage}
      footer={<PrimaryModalButton label="Share invite link" loading={saving} onPress={onSend} />}
      onClose={onClose}>
      <TText className="text-xs" style={{ color: theme.muted }}>
        Finnri does not send emails or texts — the share sheet opens next and you send the link
        yourself. The address here is how Finnri recognises them when they open it, so they join on
        the balance you have already been keeping for them.
      </TText>
      <FormInput
        label="Email"
        value={email}
        onChangeText={onChangeEmail}
        keyboardType="email-address"
        autoCapitalize="none"
      />
      <FormInput
        label="Phone"
        value={phone}
        onChangeText={onChangePhone}
        keyboardType="phone-pad"
      />
    </SplitModal>
  );
}
