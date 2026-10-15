import { View } from 'react-native';

import {
  DirectionChip,
  FormInput,
  PrimaryModalButton,
  SplitModal,
} from '@/components/split/primitives/SplitPrimitives';
import { SplitFriendChip } from '@/components/split/rows/SplitFriendChip';
import { TText } from '@/components/split/primitives/themed-interop';
import {
  SETTLEMENT_PAYMENT_MODES,
  type SettlementDirection,
  type SettlementPaymentMode,
  type SplitFriend,
} from '@/lib/splits';
import { useThemeTokens } from '@/hooks/use-theme-tokens';

type SplitSettlementModalProps = {
  visible: boolean;
  saving: boolean;
  friends: SplitFriend[];
  friendId: number | null;
  direction: SettlementDirection;
  amount: string;
  date: string;
  notes: string;
  paymentMode: SettlementPaymentMode | null;
  errorMessage: string | null;
  onChangeFriend: (id: number) => void;
  onChangeDirection: (direction: SettlementDirection) => void;
  onChangePaymentMode: (mode: SettlementPaymentMode) => void;
  onChangeAmount: (value: string) => void;
  onChangeDate: (value: string) => void;
  onChangeNotes: (value: string) => void;
  onSave: () => void;
  onClose: () => void;
};

export function SplitSettlementModal({
  visible,
  saving,
  friends,
  friendId,
  direction,
  amount,
  date,
  notes,
  paymentMode,
  errorMessage,
  onChangeFriend,
  onChangeDirection,
  onChangePaymentMode,
  onChangeAmount,
  onChangeDate,
  onChangeNotes,
  onSave,
  onClose,
}: SplitSettlementModalProps) {
  const theme = useThemeTokens().colors;
  return (
    <SplitModal
      visible={visible}
      title="Record Settlement"
      errorMessage={errorMessage}
      onClose={onClose}>
      <View className="gap-2">
        <TText className="text-xs" style={{ color: theme.muted }}>
          Friend
        </TText>
        <View className="flex-row flex-wrap gap-2">
          {friends.map((friend) => (
            <SplitFriendChip
              key={friend.id}
              friend={friend}
              selectedId={friendId}
              onSelect={onChangeFriend}
            />
          ))}
        </View>
      </View>
      <View className="flex-row gap-2">
        <DirectionChip
          label="Friend paid"
          selected={direction === 'friend_paid_user'}
          onPress={() => onChangeDirection('friend_paid_user')}
        />
        <DirectionChip
          label="You paid"
          selected={direction === 'user_paid_friend'}
          onPress={() => onChangeDirection('user_paid_friend')}
        />
      </View>
      <View className="gap-2">
        <TText className="text-xs" style={{ color: theme.muted }}>
          How was it paid?
        </TText>
        <View className="flex-row flex-wrap gap-2">
          {SETTLEMENT_PAYMENT_MODES.map((option) => (
            <DirectionChip
              key={option.value}
              label={option.label}
              selected={paymentMode === option.value}
              onPress={() => onChangePaymentMode(option.value)}
              fill={false}
            />
          ))}
        </View>
      </View>
      <FormInput
        label="Amount"
        value={amount}
        onChangeText={onChangeAmount}
        keyboardType="decimal-pad"
      />
      <FormInput label="Date" value={date} onChangeText={onChangeDate} />
      <FormInput label="Notes" value={notes} onChangeText={onChangeNotes} multiline />
      <PrimaryModalButton label="Save settlement" loading={saving} onPress={onSave} />
    </SplitModal>
  );
}
