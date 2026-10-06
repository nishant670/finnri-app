import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { cssInterop } from 'nativewind';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { KeyboardAvoidingScreen } from '@/components/ui/KeyboardAvoidingScreen';
import { Fonts } from '@/constants/theme';
import { useAuthStore } from '@/hooks/use-auth-store';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import {
  StatementApiError,
  StatementDiff,
  StatementLine,
  type StatementReconciliation,
  type StatementScreenshotFile,
  importStatementLines,
  parseStatementUploadSource,
  statementLineKindLabels,
  statementUploadErrorMessage,
  uploadStatementPDF,
  uploadStatementScreenshots,
} from '@/lib/statements';
import { formatMoney } from '@/lib/money';
import {
  type ProbableDecision,
  defaultMissingSelection,
  defaultProbableDecisions,
  isChargeLine,
  missingLineKey,
  planStatementCheck,
  probableKey,
} from '@/lib/statement-check';
import {
  ChargesCallout,
  CheckSection,
  ImportResultCard,
  ProbableRow,
  StatementTotalsCard,
  formatDay,
} from '@/components/statements/StatementCheck';

const TText = cssInterop(ThemedText, { className: 'style' });

const lineKey = (line: StatementLine, index: number) =>
  `${line.date}|${line.amount}|${line.description}|${index}`;

/**
 * Reading a statement and reconciling it against the ledger.
 *
 * The screen is built around the diff rather than an import: the useful
 * question is "what did I miss", not "replace my records with the bank's".
 * So nothing is selected by default in a destructive direction — the missing
 * rows are pre-ticked because adding them is additive and reversible, while
 * the extra rows are shown for review with no bulk action at all. Deleting a
 * user's own transactions to make a diff tidy is not this screen's job.
 */
export default function StatementReviewScreen() {
  const { id, source } = useLocalSearchParams<{ id?: string; source?: string }>();
  const statementId = Number(id);
  const themeTokens = useThemeTokens();
  const theme = themeTokens.colors;
  const { token } = useAuthStore();

  const [diff, setDiff] = useState<StatementDiff | null>(null);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [decisions, setDecisions] = useState<Record<string, ProbableDecision>>({});
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsPassword, setNeedsPassword] = useState(false);
  const [password, setPassword] = useState('');
  const [pickedFile, setPickedFile] = useState<{ uri: string; name: string } | null>(null);
  const [importResult, setImportResult] = useState<{
    imported: number;
    reconciliation: StatementReconciliation;
  } | null>(null);

  const applyDiff = useCallback((result: StatementDiff) => {
    setDiff(result);
    setSelected(defaultMissingSelection(result));
    setDecisions(defaultProbableDecisions(result));
  }, []);

  const runUpload = useCallback(
    async (file: { uri: string; name: string }, filePassword: string) => {
      if (!token || !Number.isFinite(statementId)) return;
      setIsBusy(true);
      setError(null);
      try {
        const result = await uploadStatementPDF(
          token,
          statementId,
          file,
          filePassword || undefined
        );
        applyDiff(result);
        setNeedsPassword(false);
        // The password is not kept a moment longer than the request needs it.
        setPassword('');
      } catch (uploadError) {
        const code = uploadError instanceof StatementApiError ? uploadError.code : undefined;
        if (code === 'statement_password_required' || code === 'statement_password_incorrect') {
          setNeedsPassword(true);
        }
        setError(statementUploadErrorMessage(code));
      } finally {
        setIsBusy(false);
      }
    },
    [applyDiff, statementId, token]
  );

  const pickStatement = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: 'application/pdf',
      copyToCacheDirectory: true,
    });
    if (result.canceled || !result.assets?.[0]) return;

    const asset = result.assets[0];
    const file = { uri: asset.uri, name: asset.name ?? 'statement.pdf' };
    setPickedFile(file);
    setImportResult(null);
    await runUpload(file, '');
  };

  const runScreenshotUpload = useCallback(
    async (files: StatementScreenshotFile[]) => {
      if (!token || !Number.isFinite(statementId)) return;
      setIsBusy(true);
      setError(null);
      setImportResult(null);
      setNeedsPassword(false);
      try {
        applyDiff(await uploadStatementScreenshots(token, statementId, files));
      } catch (uploadError) {
        const code = uploadError instanceof StatementApiError ? uploadError.code : undefined;
        setError(statementUploadErrorMessage(code));
      } finally {
        setIsBusy(false);
      }
    },
    [applyDiff, statementId, token]
  );

  const pickScreenshots = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: 'image/*',
      multiple: true,
      copyToCacheDirectory: true,
    });
    if (result.canceled || !result.assets?.length) return;

    if (result.assets.length > 8) {
      setError('Choose up to 8 statement screenshots at a time.');
      return;
    }
    await runScreenshotUpload(
      result.assets.map((asset, index) => ({
        uri: asset.uri,
        name: asset.name ?? `statement-page-${index + 1}.jpg`,
        mimeType: asset.mimeType,
      }))
    );
  };

  /*
   * Arriving from "Add statement" with a file already chosen: read it straight
   * away, once. A password-protected PDF lands on the normal password prompt.
   */
  const startedFromSheet = useRef(false);
  useEffect(() => {
    if (startedFromSheet.current || !token) return;
    const picked = parseStatementUploadSource(source);
    if (!picked) return;
    startedFromSheet.current = true;
    if (picked.kind === 'pdf') {
      const file = { uri: picked.uri, name: picked.name };
      setPickedFile(file);
      void runUpload(file, '');
    } else {
      void runScreenshotUpload(picked.files);
    }
  }, [runScreenshotUpload, runUpload, source, token]);

  const plan = useMemo(
    () => (diff ? planStatementCheck(diff, selected, decisions) : null),
    [decisions, diff, selected]
  );
  const linesToImport = plan?.linesToImport ?? [];

  const handleImport = async () => {
    if (!token || linesToImport.length === 0) return;
    setIsBusy(true);
    setError(null);
    try {
      const result = await importStatementLines(token, statementId, linesToImport);
      setImportResult(result);
      setDiff(null);
      setSelected({});
      setDecisions({});
    } catch (importError) {
      setError(
        importError instanceof StatementApiError
          ? importError.message
          : 'Unable to import these transactions.'
      );
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <SafeAreaView className="flex-1" edges={['top', 'left', 'right']}>
      <View className="flex-1" style={{ backgroundColor: theme.background }}>
        <View className="flex-row items-center justify-between px-6 pb-4 pt-3">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Go back"
            onPress={() => router.back()}
            className="h-11 w-11 items-center justify-center rounded-full"
            style={{ backgroundColor: theme.card }}>
            <MaterialCommunityIcons name="chevron-left" size={28} color={theme.text} />
          </Pressable>
          <TText
            className="text-sm uppercase"
            style={{ fontFamily: Fonts.title, color: theme.text, letterSpacing: 1.2 }}>
            Check statement
          </TText>
          <View className="h-11 w-11" />
        </View>

        <KeyboardAvoidingScreen
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 120 }}>
          {error && <ErrorBanner message={error} style={{ marginBottom: 16 }} />}

          {importResult && (
            <ImportResultCard
              imported={importResult.imported}
              reconciliation={importResult.reconciliation}
              onDone={() => router.back()}
            />
          )}

          {!diff && !importResult && (
            <View
              className="rounded-[26px] border px-5 py-6"
              style={{ backgroundColor: theme.card, borderColor: theme.border }}>
              <TText className="text-base" style={{ fontFamily: Fonts.title, color: theme.text }}>
                Read your card statement
              </TText>
              <TText className="mt-2 text-sm" style={{ fontFamily: Fonts.body, color: '#7C8EA8' }}>
                Use the bank&apos;s PDF, or choose cropped screenshots. Either route shows what
                Finnri already has before you add anything.
              </TText>

              {/* Users are right to hesitate here, and the honest answer is
                  short. */}
              <View className="mt-4 flex-row items-start gap-2">
                <MaterialCommunityIcons name="lock-outline" size={15} color="#7C8EA8" />
                <TText
                  className="min-w-0 flex-1 text-[11px]"
                  style={{ fontFamily: Fonts.body, color: '#7C8EA8' }}>
                  If your statement has a password, it is used once to open the file and then
                  discarded. Finnri never stores it, and never keeps the file.
                </TText>
              </View>

              <Pressable
                accessibilityRole="button"
                disabled={isBusy}
                onPress={() => void pickStatement()}
                className="mt-5 h-13 flex-row items-center justify-center gap-2 rounded-full py-3.5"
                style={{ backgroundColor: theme.accent }}>
                {isBusy ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <>
                    <MaterialCommunityIcons name="file-upload-outline" size={18} color="#FFFFFF" />
                    <TText
                      className="text-sm"
                      style={{ fontFamily: Fonts.title, color: '#FFFFFF' }}>
                      Choose PDF
                    </TText>
                  </>
                )}
              </Pressable>

              <View className="my-5 h-px" style={{ backgroundColor: theme.border }} />

              <TText className="text-sm" style={{ fontFamily: Fonts.title, color: theme.text }}>
                Prefer screenshots?
              </TText>
              <TText
                className="mt-2 text-[11px]"
                style={{ fontFamily: Fonts.body, color: '#7C8EA8' }}>
                An OpenAI service reads the selected images. Before choosing them, crop away the
                header block containing your card number and address. Finnri does not store the
                images, but the AI service must receive them to extract the rows.
              </TText>
              <Pressable
                accessibilityRole="button"
                disabled={isBusy}
                onPress={() => void pickScreenshots()}
                className="mt-4 h-13 flex-row items-center justify-center gap-2 rounded-full border py-3.5"
                style={{ borderColor: theme.accent, backgroundColor: theme.background }}>
                {isBusy ? (
                  <ActivityIndicator color={theme.accent} />
                ) : (
                  <>
                    <MaterialCommunityIcons
                      name="image-multiple-outline"
                      size={18}
                      color={theme.accent}
                    />
                    <TText
                      className="text-sm"
                      style={{ fontFamily: Fonts.title, color: theme.accent }}>
                      Choose screenshots
                    </TText>
                  </>
                )}
              </Pressable>
            </View>
          )}

          {needsPassword && pickedFile && (
            <View
              className="mt-4 rounded-[26px] border px-5 py-5"
              style={{ backgroundColor: theme.card, borderColor: theme.border }}>
              <TText className="text-sm" style={{ fontFamily: Fonts.title, color: theme.text }}>
                Statement password
              </TText>
              <TText
                className="mt-1 text-[11px]"
                style={{ fontFamily: Fonts.body, color: '#7C8EA8' }}>
                Usually a mix of your name, date of birth or card digits — your bank&apos;s email
                says which.
              </TText>
              <View
                className="mt-3 h-13 flex-row items-center rounded-[18px] border px-4 py-1"
                style={{ backgroundColor: theme.background, borderColor: theme.border }}>
                <TextInput
                  value={password}
                  onChangeText={setPassword}
                  placeholder="Password"
                  placeholderTextColor="#AAB7C6"
                  secureTextEntry
                  autoCapitalize="none"
                  autoCorrect={false}
                  // Never offered to a password manager or autofill: this is a
                  // document key, not an account credential, and storing it is
                  // exactly what we promise not to do.
                  autoComplete="off"
                  textContentType="none"
                  style={{ flex: 1, fontFamily: Fonts.body, fontSize: 16, color: theme.text }}
                />
              </View>
              <Pressable
                accessibilityRole="button"
                disabled={isBusy || password.length === 0}
                onPress={() => void runUpload(pickedFile, password)}
                className="mt-4 h-12 items-center justify-center rounded-full"
                style={{
                  backgroundColor: password.length > 0 ? theme.accent : theme.secondary,
                }}>
                {isBusy ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <TText
                    className="text-sm"
                    style={{
                      fontFamily: Fonts.title,
                      color: password.length > 0 ? '#FFFFFF' : '#94A3B8',
                    }}>
                    Open statement
                  </TText>
                )}
              </Pressable>
            </View>
          )}

          {diff && plan && (
            <>
              <StatementTotalsCard diff={diff} plan={plan} />
              <ChargesCallout charges={diff.charges} total={diff.summary.charges_amount} />

              {diff.probable.length > 0 && (
                <CheckSection
                  testID="statement-probable"
                  title="Already logged?"
                  subtitle="These look like transactions you added yourself, on another day or for a slightly different amount. Your entry is kept as it is either way."
                  count={diff.probable.length}>
                  {diff.probable.map((pair, index) => {
                    const key = probableKey(pair, index);
                    return (
                      <ProbableRow
                        key={key}
                        pair={pair}
                        decision={decisions[key] ?? 'same'}
                        onDecide={(next) => setDecisions((prev) => ({ ...prev, [key]: next }))}
                      />
                    );
                  })}
                </CheckSection>
              )}

              {diff.missing.length > 0 && (
                <CheckSection
                  testID="statement-missing"
                  title="New on your statement"
                  subtitle="Not in Finnri yet. Untick anything you do not want added."
                  count={diff.missing.length}>
                  {diff.missing.map((line, index) => {
                    const key = missingLineKey(line, index);
                    return (
                      <SelectableLine
                        key={key}
                        line={line}
                        selected={Boolean(selected[key])}
                        onToggle={() => setSelected((prev) => ({ ...prev, [key]: !prev[key] }))}
                      />
                    );
                  })}
                </CheckSection>
              )}

              {diff.matched.length > 0 && (
                <CheckSection
                  title="Already in Finnri"
                  subtitle="Matched to transactions you logged. Your titles and categories are kept."
                  count={diff.matched.length}
                  initiallyOpen={false}>
                  {diff.matched.map((pair) => (
                    <View
                      key={pair.entry.entry_id}
                      className="flex-row items-center justify-between rounded-[18px] px-4 py-3"
                      style={{ backgroundColor: theme.secondary }}>
                      <View className="min-w-0 flex-1 pr-3">
                        <TText
                          className="text-xs"
                          numberOfLines={1}
                          style={{ fontFamily: Fonts.body, color: '#7C8EA8' }}>
                          {pair.line.description}
                        </TText>
                        <TText
                          className="mt-0.5 text-[11px]"
                          numberOfLines={1}
                          style={{ fontFamily: Fonts.body, color: '#94A3B8' }}>
                          your “{pair.entry.title}” · {formatMoney(pair.entry.amount)}
                        </TText>
                      </View>
                      <MaterialCommunityIcons name="check" size={16} color="#16A34A" />
                    </View>
                  ))}
                </CheckSection>
              )}

              {diff.extra.length > 0 && (
                <CheckSection
                  title="In Finnri, not billed"
                  subtitle="You logged these on this card, but the bank did not bill them this cycle. Possibly a duplicate, the wrong card, or posting next cycle. Nothing is deleted."
                  count={diff.extra.length}
                  initiallyOpen={false}>
                  {diff.extra.map((entry) => (
                    <View
                      key={entry.entry_id}
                      className="flex-row items-center justify-between rounded-[18px] border px-4 py-3"
                      style={{ backgroundColor: theme.card, borderColor: theme.border }}>
                      <View className="min-w-0 flex-1 pr-3">
                        <TText
                          className="text-sm"
                          numberOfLines={1}
                          style={{ fontFamily: Fonts.title, color: theme.text }}>
                          {entry.title}
                        </TText>
                        <TText
                          className="mt-0.5 text-[11px]"
                          style={{ fontFamily: Fonts.body, color: '#7C8EA8' }}>
                          {formatDay(entry.date)}
                        </TText>
                      </View>
                      <TText
                        className="text-sm"
                        style={{ fontFamily: Fonts.title, color: theme.text }}>
                        {formatMoney(entry.amount)}
                      </TText>
                    </View>
                  ))}
                </CheckSection>
              )}

              {diff.ignored.length > 0 && (
                <CheckSection
                  title="Bill payments"
                  subtitle="Tracked on the bill itself, so these are never added as transactions."
                  count={diff.ignored.length}
                  initiallyOpen={false}>
                  {diff.ignored.map((line, index) => (
                    <View
                      key={lineKey(line, index)}
                      className="flex-row items-center justify-between rounded-[18px] px-4 py-3"
                      style={{ backgroundColor: theme.secondary }}>
                      <TText
                        className="min-w-0 flex-1 pr-3 text-xs"
                        numberOfLines={1}
                        style={{ fontFamily: Fonts.body, color: '#7C8EA8' }}>
                        {line.description}
                      </TText>
                      <TText
                        className="text-xs"
                        style={{ fontFamily: Fonts.title, color: '#7C8EA8' }}>
                        {formatMoney(line.amount)}
                      </TText>
                    </View>
                  ))}
                </CheckSection>
              )}
            </>
          )}
        </KeyboardAvoidingScreen>

        {diff && (diff.missing.length > 0 || diff.probable.length > 0) && (
          <View
            className="absolute inset-x-0 bottom-0 px-6 pb-8 pt-4"
            style={{ backgroundColor: theme.background }}>
            <Pressable
              accessibilityRole="button"
              disabled={isBusy || linesToImport.length === 0}
              onPress={() => void handleImport()}
              className="h-14 items-center justify-center rounded-full"
              style={{
                backgroundColor: linesToImport.length > 0 ? theme.accent : theme.secondary,
              }}>
              {isBusy ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <TText
                  className="text-base"
                  style={{
                    fontFamily: Fonts.title,
                    color: linesToImport.length > 0 ? '#FFFFFF' : '#94A3B8',
                  }}>
                  {linesToImport.length > 0
                    ? `Add ${linesToImport.length} · ${formatMoney(plan?.importNet ?? 0)}`
                    : 'Nothing to add'}
                </TText>
              )}
            </Pressable>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

function SelectableLine({
  line,
  selected,
  onToggle,
}: {
  line: StatementLine;
  selected: boolean;
  onToggle: () => void;
}) {
  const theme = useThemeTokens().colors;
  const isCredit = line.type === 'income';

  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={`${line.description}, ${formatMoney(line.amount)}`}
      onPress={onToggle}
      className="flex-row items-center rounded-[18px] border px-4 py-3"
      style={{
        backgroundColor: theme.card,
        borderColor: selected ? theme.accent : theme.border,
      }}>
      <View
        className="mr-3 h-5 w-5 items-center justify-center rounded-md border"
        style={{
          backgroundColor: selected ? theme.accent : 'transparent',
          borderColor: selected ? theme.accent : '#94A3B8',
        }}>
        {selected && <MaterialCommunityIcons name="check" size={13} color="#FFFFFF" />}
      </View>

      <View className="min-w-0 flex-1 pr-3">
        <TText
          className="text-sm"
          numberOfLines={1}
          style={{ fontFamily: Fonts.title, color: theme.text }}>
          {line.description}
        </TText>
        <TText className="mt-0.5 text-[11px]" style={{ fontFamily: Fonts.body, color: '#7C8EA8' }}>
          {formatDay(line.date)}
          {line.kind && line.kind !== 'spend' ? ` · ${statementLineKindLabels[line.kind]}` : ''}
          {isChargeLine(line) ? ' · bank charge' : ''}
        </TText>
      </View>

      <TText
        className="text-sm"
        style={{ fontFamily: Fonts.title, color: isCredit ? '#16A34A' : theme.text }}>
        {isCredit ? '+ ' : ''}
        {formatMoney(line.amount)}
      </TText>
    </Pressable>
  );
}
