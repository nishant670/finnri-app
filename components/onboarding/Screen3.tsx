import { Colors, Fonts } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

/**
 * Splitting. This slot used to hold a second slide about reviewing a draft
 * entry — the same point the slide before it already made, spent twice — while
 * split groups, the feature people actually open the app with someone else
 * standing next to them for, went unmentioned until they found the tab.
 *
 * The vocabulary here is the Split tab's own: groups, friends, split equally,
 * owed to me, settled up. An onboarding slide that names things differently
 * from the screen it is describing is a slide the user has to translate.
 */

const MEMBERS = ['A', 'M', 'R', 'S'];

const BALANCES = [
  { initial: 'A', name: 'Aarav', detail: 'owes you', amount: '₹600', owed: true },
  { initial: 'M', name: 'Meera', detail: 'you owe', amount: '₹450', owed: false },
];

export default function Screen3() {
  const colorScheme = useColorScheme() ?? 'light';
  const theme = Colors[colorScheme];

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <View style={styles.visualContainer}>
          {/* Group Card */}
          <View style={[styles.groupCard, { backgroundColor: theme.card }]}>
            <View style={styles.groupHeader}>
              <View style={[styles.groupIcon, { backgroundColor: theme.accent + '20' }]}>
                <MaterialCommunityIcons name="account-group" size={16} color={theme.accent} />
              </View>
              <View style={styles.groupTitleGroup}>
                <Text style={[styles.groupName, { color: theme.text }]}>Goa trip</Text>
                <Text style={[styles.groupMeta, { color: theme.text }]}>4 friends</Text>
              </View>
              <View style={styles.avatarStack}>
                {MEMBERS.map((initial, index) => (
                  <View
                    key={initial}
                    style={[
                      styles.avatar,
                      {
                        backgroundColor: theme.accent,
                        borderColor: theme.card,
                        marginLeft: index === 0 ? 0 : -8,
                      },
                    ]}>
                    <Text style={[styles.avatarText, { color: theme.onAccent }]}>{initial}</Text>
                  </View>
                ))}
              </View>
            </View>

            <View style={[styles.billRow, { backgroundColor: theme.accent + '12' }]}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.billTitle, { color: theme.text }]}>Dinner</Text>
                <Text style={[styles.billMeta, { color: theme.text }]}>You paid · split equally</Text>
              </View>
              <Text style={[styles.billAmount, { color: theme.text }]}>₹2,400</Text>
            </View>

            {BALANCES.map((balance) => (
              <View key={balance.initial} style={styles.balanceRow}>
                <View style={[styles.balanceAvatar, { backgroundColor: theme.border }]}>
                  <Text style={[styles.balanceAvatarText, { color: theme.text }]}>
                    {balance.initial}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.balanceName, { color: theme.text }]}>{balance.name}</Text>
                  <Text style={[styles.balanceMeta, { color: theme.text }]}>{balance.detail}</Text>
                </View>
                <Text
                  style={[styles.balanceAmount, { color: balance.owed ? '#27C93F' : theme.accent }]}>
                  {balance.amount}
                </Text>
              </View>
            ))}
          </View>

          {/* Floating "Owed to me" pill */}
          <View style={[styles.floatingPill, { backgroundColor: theme.card }]}>
            <MaterialCommunityIcons name="scale-balance" size={14} color="#27C93F" />
            <View style={{ marginLeft: 8 }}>
              <Text style={[styles.pillLabel, { color: theme.text }]}>Owed to me</Text>
              <Text style={[styles.pillValue, { color: theme.text }]}>₹1,150</Text>
            </View>
          </View>
        </View>

        <View style={styles.textGroup}>
          <Text style={[styles.title, { color: theme.text, fontFamily: Fonts.title }]}>
            Split bills without{('\n')}
            <Text style={{ color: theme.accent }}>the awkward math</Text>
          </Text>
          <Text style={[styles.subtitle, { color: theme.text, opacity: 0.6, fontFamily: Fonts.body }]}>
            Trips, dinners, rent. Add friends from your contacts, split equally or not, and Finnri
            keeps the running balance until everyone is settled up.
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
  groupCard: {
    width: 260,
    borderRadius: 24,
    padding: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.08,
    shadowRadius: 25,
    elevation: 5,
  },
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  groupIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  groupTitleGroup: {
    flex: 1,
    marginLeft: 10,
  },
  groupName: {
    fontSize: 13,
    fontWeight: '800',
  },
  groupMeta: {
    fontSize: 10,
    opacity: 0.5,
    marginTop: 1,
  },
  avatarStack: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: 'white',
    fontSize: 8,
    fontWeight: '800',
  },
  billRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderRadius: 12,
    marginBottom: 12,
  },
  billTitle: {
    fontSize: 12,
    fontWeight: '700',
  },
  billMeta: {
    fontSize: 9,
    opacity: 0.5,
    marginTop: 2,
  },
  billAmount: {
    fontSize: 13,
    fontWeight: '800',
  },
  balanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },
  balanceAvatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  balanceAvatarText: {
    fontSize: 10,
    fontWeight: '800',
    opacity: 0.7,
  },
  balanceName: {
    fontSize: 11,
    fontWeight: '700',
  },
  balanceMeta: {
    fontSize: 9,
    opacity: 0.5,
    marginTop: 1,
  },
  balanceAmount: {
    fontSize: 12,
    fontWeight: '800',
  },
  floatingPill: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
    left: 4,
    bottom: 6,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 6,
  },
  pillLabel: {
    fontSize: 9,
    opacity: 0.5,
    fontWeight: '600',
  },
  pillValue: {
    fontSize: 13,
    fontWeight: '800',
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
