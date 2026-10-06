import { fireEvent, render, waitFor } from '@testing-library/react-native';
import * as DocumentPicker from 'expo-document-picker';

import { StatementFormSheet } from '@/components/statements/StatementFormSheet';
import type { Account } from '@/lib/accounts';
import { parseStatementUploadSource } from '@/lib/statements';

jest.mock('expo-document-picker', () => ({ getDocumentAsync: jest.fn() }));

const picker = DocumentPicker as jest.Mocked<typeof DocumentPicker>;

const card = {
  id: 7,
  type: 'credit_card',
  name: 'HDFC Regalia',
  color: '#000000',
  statement_day: 5,
  due_day: 25,
} as Account;

const renderSheet = (props: Partial<React.ComponentProps<typeof StatementFormSheet>> = {}) =>
  render(
    <StatementFormSheet
      visible
      card={card}
      submitting={false}
      error={null}
      onClose={jest.fn()}
      onSubmit={jest.fn()}
      {...props}
    />
  );

describe('Uploading a statement from the Add statement sheet', () => {
  beforeEach(() => jest.clearAllMocks());

  it('sends the picked PDF along with the bill', async () => {
    picker.getDocumentAsync.mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file:///cache/sept.pdf', name: 'sept.pdf', lastModified: 0 }],
    } as DocumentPicker.DocumentPickerResult);
    const onSubmit = jest.fn();
    const { findByTestId, findByPlaceholderText, findByText } = await renderSheet({ onSubmit });

    await fireEvent.press(await findByTestId('statement-upload-pdf'));
    await findByText('sept.pdf');
    await fireEvent.changeText(await findByPlaceholderText('12,400'), '12400');
    await fireEvent.press(await findByText('Add & read statement'));

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ total_due: 12400 }), {
        kind: 'pdf',
        uri: 'file:///cache/sept.pdf',
        name: 'sept.pdf',
      })
    );
  });

  it('refuses more screenshots than the server reads at once', async () => {
    picker.getDocumentAsync.mockResolvedValue({
      canceled: false,
      assets: Array.from({ length: 9 }, (_, index) => ({
        uri: `file:///cache/${index}.png`,
        name: `${index}.png`,
        lastModified: 0,
      })),
    } as DocumentPicker.DocumentPickerResult);
    const { findByTestId, findByText, queryByTestId } = await renderSheet();

    await fireEvent.press(await findByTestId('statement-upload-screenshots'));

    await findByText(/up to 8 screenshots/);
    expect(queryByTestId('statement-upload-picked')).toBeNull();
  });

  it('explains the plan instead of opening the picker when screenshots are locked', async () => {
    const onSeePlans = jest.fn();
    const { findByTestId, findByText } = await renderSheet({
      screenshotsLocked: true,
      onSeePlans,
    });

    await fireEvent.press(await findByTestId('statement-upload-screenshots'));

    await findByTestId('statement-screenshots-locked');
    expect(picker.getDocumentAsync).not.toHaveBeenCalled();
    await fireEvent.press(await findByText('See plans'));
    expect(onSeePlans).toHaveBeenCalled();
  });

  it('does not offer an upload when editing a bill', async () => {
    const { queryByTestId } = await renderSheet({
      initial: {
        statement_date: '2026-09-05',
        due_date: '2026-09-25',
        total_due: 1000,
        minimum_due: 50,
      },
    });
    expect(queryByTestId('statement-upload-pdf')).toBeNull();
  });
});

describe('parseStatementUploadSource', () => {
  it('round-trips a source through a route param', () => {
    const source = {
      kind: 'screenshots' as const,
      files: [{ uri: 'file:///a.png', name: 'a.png', mimeType: 'image/png' }],
    };
    expect(parseStatementUploadSource(JSON.stringify(source))).toEqual(source);
  });

  it('ignores missing or malformed params', () => {
    expect(parseStatementUploadSource(undefined)).toBeUndefined();
    expect(parseStatementUploadSource('not json')).toBeUndefined();
    expect(parseStatementUploadSource('{"kind":"screenshots","files":[]}')).toBeUndefined();
  });
});
