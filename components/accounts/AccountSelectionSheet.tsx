import { MaterialCommunityIcons } from '@expo/vector-icons';
import { ScrollView, TouchableOpacity, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { AnimatedBottomSheet } from '@/components/ui/AnimatedBottomSheet';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import { styles } from './account-form-styles';

type AccountSelectionSheetProps = {
  visible: boolean;
  onClose: () => void;
  data: string[];
  onSelect: (item: string) => void;
  title: string;
};

export function AccountSelectionSheet({
  visible,
  onClose,
  data,
  onSelect,
  title,
}: AccountSelectionSheetProps) {
  const theme = useThemeTokens().colors;

  return (
    <AnimatedBottomSheet visible={visible} onClose={onClose}>
      <View style={[styles.modalContent, { backgroundColor: theme.card }]}>
        <View style={styles.modalHeader}>
          <ThemedText style={[styles.modalTitle, { color: theme.text }]}>{title}</ThemedText>
          <TouchableOpacity onPress={onClose}>
            <MaterialCommunityIcons name="close" size={24} color={theme.text} />
          </TouchableOpacity>
        </View>
        <ScrollView style={styles.modalList}>
          {data.map((item) => (
            <TouchableOpacity
              key={item}
              style={styles.modalItem}
              onPress={() => {
                onSelect(item);
                onClose();
              }}>
              <ThemedText style={[styles.modalItemText, { color: theme.text }]}>{item}</ThemedText>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
    </AnimatedBottomSheet>
  );
}
