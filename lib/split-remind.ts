import { Share } from 'react-native';

import { formatMoney } from './money';

/**
 * The words a reminder sends (P25): who, how much, and that it came from the
 * user rather than from an app nagging on its own.
 */
export const remindMessage = (friendName: string, amount: number) => {
  const firstName = friendName.trim().split(/\s+/)[0] || friendName;
  return `Hi ${firstName}, a quick reminder: you owe me ${formatMoney(Math.abs(amount))} for our shared expenses. I'm keeping track in Finnri.`;
};

/**
 * "Remind" opens the phone's share sheet with that message, so it goes out
 * on WhatsApp, SMS or wherever the two of them talk. Finnri sends nothing
 * itself.
 */
export const remindFriend = async (friendName: string, amount: number) => {
  try {
    await Share.share({ message: remindMessage(friendName, amount) });
  } catch {
    // Closing the sheet, or a share target failing, is not an app error.
  }
};
