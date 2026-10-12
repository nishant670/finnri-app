import { Colors, Fonts } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

export default function Screen2() {
  const colorScheme = useColorScheme() ?? 'light';
  const theme = Colors[colorScheme];

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <View style={styles.visualContainer}>
          {/* AI Prompt Card */}
          <View style={[styles.aiCard, { backgroundColor: theme.card }]}>
            <View style={styles.aiHeader}>
              <View style={[styles.aiIconCircle, { backgroundColor: '#F5F5F7' }]}>
                <MaterialCommunityIcons name="robot" size={16} color={theme.accent} />
              </View>
              <View style={styles.aiDots}>
                <View style={[styles.dot, { backgroundColor: '#E0E0E0' }]} />
                <View style={[styles.dot, { backgroundColor: '#E0E0E0' }]} />
                <View style={[styles.dot, { backgroundColor: '#E0E0E0' }]} />
              </View>
            </View>

            <View style={styles.transactionItem}>
              <View style={[styles.amountLabel, { backgroundColor: theme.accent + '20' }]}>
                <Text style={[styles.labelText, { color: theme.accent }]}>₹ AMOUNT</Text>
                <Text style={[styles.valueText, { color: theme.text }]}>₹32.50</Text>
              </View>
            </View>

            <View style={styles.transactionItem}>
              <View style={[styles.categoryLabel, { backgroundColor: '#B088FF20' }]}>
                <Text style={[styles.labelText, { color: '#B088FF' }]}>⬙ CATEGORY</Text>
                <Text style={[styles.valueText, { color: theme.text }]}>Groceries</Text>
              </View>
            </View>

            <View style={styles.transactionItem}>
              <View style={[styles.accountLabel, { backgroundColor: '#4A90E220' }]}>
                <Text style={[styles.labelText, { color: '#4A90E2' }]}>💳 ACCOUNT</Text>
                <Text style={[styles.valueText, { color: theme.text }]}>Visa ****</Text>
                <MaterialCommunityIcons name="check-circle" size={14} color="#4A90E2" style={{ marginLeft: 4 }} />
              </View>
            </View>

            {/* The approval step used to be a whole slide. It is one line on
                the card it belongs to, next to the fields it governs. */}
            <View style={[styles.reviewRow, { borderTopColor: theme.border }]}>
              <MaterialCommunityIcons name="check-decagram" size={14} color={theme.accent} />
              <Text style={[styles.reviewText, { color: theme.text }]}>Review to save</Text>
            </View>
          </View>

          {/* Floating AI Bubble */}
          <View style={[styles.floatingAiHead, { backgroundColor: theme.accent }]}>
            <MaterialCommunityIcons name="robot" size={24} color={theme.onAccent} />
            <View style={styles.questionMark}>
              <Text style={{ color: theme.onAccent, fontSize: 10, fontWeight: 'bold' }}>?</Text>
            </View>
          </View>
        </View>

        <View style={styles.textGroup}>
          <Text style={[styles.title, { color: theme.text, fontFamily: Fonts.title }]}>
            Finnri understands {('\n')}<Text style={{ color: theme.accent }}>your words</Text>
          </Text>
          <Text style={[styles.subtitle, { color: theme.text, opacity: 0.6, fontFamily: Fonts.body }]}>
            Amount, category, date and account, pulled out for you. Nothing is saved until you have
            looked at it.
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
  },
  content: {
    alignItems: 'center',
    width: '100%',
  },
  visualContainer: {
    width: '100%',
    height: 300,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 40,
  },
  aiCard: {
    width: 240,
    borderRadius: 24,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.08,
    shadowRadius: 25,
    elevation: 5,
  },
  aiHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  aiIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  aiDots: {
    flexDirection: 'row',
    gap: 4,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  transactionItem: {
    marginBottom: 12,
  },
  amountLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 10,
    borderRadius: 12,
  },
  categoryLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 10,
    borderRadius: 12,
  },
  accountLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 10,
    borderRadius: 12,
  },
  labelText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  valueText: {
    fontSize: 12,
    fontWeight: '600',
    flex: 1,
    textAlign: 'right',
  },
  reviewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  reviewText: {
    fontSize: 11,
    fontWeight: '700',
  },
  floatingAiHead: {
    position: 'absolute',
    right: 40,
    top: 60,
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: 'rgba(0,0,0,0.18)',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 15,
    elevation: 8,
  },
  questionMark: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: '#90A4AE',
    width: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'white',
  },
  textGroup: {
    alignItems: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 16,
    lineHeight: 34,
  },
  subtitle: {
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
  },
});
