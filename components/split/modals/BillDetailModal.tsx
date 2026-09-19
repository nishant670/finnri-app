import { MaterialCommunityIcons } from '@expo/vector-icons';
import { cssInterop } from 'nativewind';
import { useEffect, useRef, useState } from 'react';
import * as WebBrowser from 'expo-web-browser';
import { useAuthStore } from '@/hooks/use-auth-store';
import { resolveAttachmentForDisplay } from '@/lib/uploads';
import { formatTime } from '@/lib/datetime';
import { Pressable, ScrollView, View } from 'react-native';

import { formatBalance, readBillForViewer } from '@/components/split/split-utils';
import { ThemedText } from '@/components/themed-text';
import { AnimatedBottomSheet } from '@/components/ui/AnimatedBottomSheet';
import { Fonts } from '@/constants/theme';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import type { SplitBill, SplitFriend } from '@/lib/splits';

const TText = cssInterop(ThemedText, { className: 'style' });

export function BillDetailModal({
  bill,
  friendById,
  currentUserName,
  onClose,
  onEdit,
  onDelete,
}: {
  bill: SplitBill | null;
  friendById: Map<number, SplitFriend>;
  currentUserName: string;
  onClose: () => void;
  onEdit: (bill: SplitBill) => void;
  onDelete: (bill: SplitBill) => void;
}) {
  const theme = useThemeTokens().colors;
  const { token } = useAuthStore();
  const [receiptError, setReceiptError] = useState<string | null>(null);
  const [openingReceipt, setOpeningReceipt] = useState(false);
  useEffect(() => {
    setReceiptError(null);
  }, [bill?.id]);
  const presentedBillRef = useRef<SplitBill | null>(bill);
  if (bill) presentedBillRef.current = bill;
  const presentedBill = presentedBillRef.current;

  if (!presentedBill) return null;

  // Read for whoever opened it, not for whoever wrote it — see
  // `readBillForViewer`. This sheet used to tell a member she had paid for an
  // expense her husband entered, and then list her own share as his debt.
  const reading = readBillForViewer(presentedBill, friendById, currentUserName);
  const paidLine = `${reading.paidByYou ? 'You' : reading.payerName} paid ${formatBalance(
    presentedBill.total_amount
  )}`;
  const canEdit = presentedBill.viewer_can_edit === true;
  const canDelete = presentedBill.viewer_can_delete === true;

  return (
    <AnimatedBottomSheet
      visible={Boolean(bill)}
      onClose={onClose}
      sheetStyle={{ maxHeight: '92%' }}>
      <View
        className="overflow-hidden rounded-t-[28px] border"
        style={{ backgroundColor: theme.card, borderColor: theme.border, flexShrink: 1 }}>
        <View
          className="min-h-16 flex-row items-center border-b px-5 pt-2"
          style={{ borderColor: theme.border }}>
          <View className="flex-1">
            <TText variant="sectionTitle" style={{ color: theme.text }}>
              Expense details
            </TText>
          </View>
          {canDelete ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Delete expense"
              onPress={() => onDelete(presentedBill)}
              className="h-11 w-11 items-center justify-center rounded-full">
              <MaterialCommunityIcons name="trash-can-outline" size={24} color={theme.negative} />
            </Pressable>
          ) : null}
          {canEdit ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Edit expense"
              onPress={() => onEdit(presentedBill)}
              className="h-11 w-11 items-center justify-center rounded-full">
              <MaterialCommunityIcons name="pencil-outline" size={24} color={theme.text} />
            </Pressable>
          ) : null}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close expense details"
            onPress={onClose}
            className="h-11 w-11 items-center justify-center rounded-full"
            style={{ backgroundColor: theme.secondary }}>
            <MaterialCommunityIcons name="close" size={22} color={theme.text} />
          </Pressable>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 44, paddingTop: 24 }}>
          <View className="flex-row items-start gap-5">
            <View
              className="h-20 w-20 items-center justify-center rounded-xl border"
              style={{ backgroundColor: theme.card, borderColor: theme.border }}>
              <MaterialCommunityIcons name="receipt-text-outline" size={44} color={theme.text} />
            </View>
            <View className="flex-1">
              <TText variant="screenTitle" style={{ color: theme.text }}>
                {presentedBill.title}
              </TText>
              <TText variant="amount" className="mt-2" style={{ color: theme.text }}>
                {formatBalance(presentedBill.total_amount)}
              </TText>
              <TText className="mt-4 text-base leading-6" style={{ color: theme.muted }}>
                {presentedBill.date}
                {presentedBill.time
                  ? `, ${formatTime(presentedBill.time) ?? presentedBill.time}`
                  : ''}
                {presentedBill.created_at
                  ? `\nAdded on ${presentedBill.created_at.slice(0, 10)}`
                  : ''}
              </TText>
            </View>
          </View>

          <View className="mt-5 gap-2">
            {[
              ['Payment mode', presentedBill.mode],
              ['Category', presentedBill.category],
              ['Merchant', presentedBill.merchant],
              ['Tag', presentedBill.tag],
            ]
              .filter(([, value]) => Boolean(value))
              .map(([label, value]) => (
                <View key={label} className="flex-row justify-between gap-4">
                  <TText style={{ color: theme.muted }}>{label}</TText>
                  <TText className="flex-1 text-right" style={{ color: theme.text }}>
                    {value}
                  </TText>
                </View>
              ))}
            {presentedBill.attachment ? (
              <Pressable
                accessibilityRole="button"
                disabled={openingReceipt}
                onPress={async () => {
                  if (!token) return;
                  setOpeningReceipt(true);
                  setReceiptError(null);
                  try {
                    const url = await resolveAttachmentForDisplay(
                      token,
                      presentedBill.attachment ?? ''
                    );
                    if (url) await WebBrowser.openBrowserAsync(url);
                  } catch {
                    setReceiptError('Could not open this receipt. Please try again.');
                  } finally {
                    setOpeningReceipt(false);
                  }
                }}
                className="py-3">
                <TText style={{ color: theme.accent }}>
                  {openingReceipt ? 'Opening receipt…' : 'View receipt'}
                </TText>
              </Pressable>
            ) : null}
            {receiptError ? <TText style={{ color: theme.negative }}>{receiptError}</TText> : null}
          </View>

          <View className="mt-10">
            <TText variant="screenTitle" style={{ color: theme.text }}>
              {paidLine}
            </TText>
            <View className="mt-5 gap-4">
              {reading.people
                .filter((person) => person.share > 0)
                .map((person) => {
                  const label = person.isViewer
                    ? `Your share is ${formatBalance(person.share)}`
                    : `${person.name}'s share is ${formatBalance(person.share)}`;
                  return (
                    <View key={person.key} className="flex-row items-center">
                      <View
                        className="mr-4 h-10 w-10 items-center justify-center rounded-full"
                        style={{ backgroundColor: theme.secondary }}>
                        <TText style={{ color: theme.accent, fontFamily: Fonts.title }}>
                          {person.name.charAt(0).toUpperCase()}
                        </TText>
                      </View>
                      <TText className="flex-1 text-lg" style={{ color: theme.muted }}>
                        {label}
                      </TText>
                    </View>
                  );
                })}
            </View>
          </View>

          {presentedBill.notes ? (
            <View className="mt-10 rounded-2xl border p-4" style={{ borderColor: theme.border }}>
              <TText className="text-xs" style={{ color: theme.muted, fontFamily: Fonts.title }}>
                Notes
              </TText>
              <TText className="mt-2 text-base leading-6" style={{ color: theme.text }}>
                {presentedBill.notes}
              </TText>
            </View>
          ) : null}
        </ScrollView>
      </View>
    </AnimatedBottomSheet>
  );
}
