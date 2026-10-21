import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import React from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';

import { styles } from './styles';
import { ScreenProps } from './types';

export const AuthScreen4 = ({ onContinue }: ScreenProps) => {
  const colorScheme = useColorScheme() ?? 'light';
  const theme = Colors[colorScheme];

  return (
    <ScrollView
      contentContainerStyle={[styles.authScrollContent, { flexGrow: 1, justifyContent: 'center' }]}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.topSection}>
        <View style={styles.imageContainer}>
          <View style={styles.glowCircle} />
          <View style={[styles.mainCircle, { borderColor: theme.border }]}>
            <View style={[styles.iconBox, { backgroundColor: '#FFCCBC' }]}>
              <MaterialCommunityIcons name="check" size={40} color="#E64A19" />
            </View>
            <View style={[styles.smallIcon, styles.pos1, { backgroundColor: '#C8E6C9' }]}>
              <MaterialCommunityIcons name="check-circle" size={12} color="#43A047" />
            </View>
            <View style={[styles.smallIcon, styles.pos2, { backgroundColor: '#BBDEFB' }]}>
              <MaterialCommunityIcons name="piggy-bank" size={16} color="#1976D2" />
            </View>
            <View style={[styles.smallIcon, styles.pos3, { backgroundColor: '#FFF9C4' }]}>
              <MaterialCommunityIcons name="lock" size={12} color="#FBC02D" />
            </View>
          </View>
        </View>
      </View>

      <View style={styles.textSection}>
        <Text style={[styles.title, { color: theme.text }]}>You’re all set!</Text>
        <Text style={[styles.subtitle, { color: theme.text, opacity: 0.6 }]}>
          Your data will now be safely backed up.
        </Text>
      </View>

      <View style={styles.buttonSection}>
        <TouchableOpacity
          style={[styles.primaryButton, { backgroundColor: theme.accent }]}
          onPress={() => onContinue()}
        >
          <Text style={[styles.primaryButtonText, { color: theme.onAccent }]}>Go to Finnri</Text>
          <MaterialCommunityIcons name="arrow-right" size={20} color={theme.onAccent} style={{ marginLeft: 8 }} />
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
};
