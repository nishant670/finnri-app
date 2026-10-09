import { fireEvent, render } from '@testing-library/react-native';
import * as DocumentPicker from 'expo-document-picker';

import { StatementFormSheet } from '@/components/statements/StatementFormSheet';
import type { Account } from '@/lib/accounts';
import { StatementApiError, type StatementRead } from '@/lib/statements';

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

  it('reads the picked PDF, fills the bill in, and sends the read along', async () => {
    picker.getDocumentAsync.mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file:///cache/sept.pdf', name: 'sept.pdf', lastModified: 0 }],
    } as DocumentPicker.DocumentPickerResult);
    const read: StatementRead = {
      summary: {
        statement_date: '2026-09-05',
        due_date: '2026-09-25',
        total_due: 12400,
        minimum_due: 620,
      },
      lines: [],
      card_updates: [],
      warnings: [],
      source: 'pdf',
    };
    const onReadSource = jest.fn().mockResolvedValue(read);
    const onSubmit = jest.fn();
    const { findByTestId, findByText, findByDisplayValue } = await renderSheet({
      onSubmit,
      onReadSource,
    });

    await fireEvent.press(await findByTestId('statement-upload-pdf'));

    await findByDisplayValue('12400');
    await findByDisplayValue('620');
    await findByText(/Filled in the total, minimum due, statement date, due date/);
    expect(onReadSource).toHaveBeenCalledWith(
      { kind: 'pdf', uri: 'file:///cache/sept.pdf', name: 'sept.pdf' },
      undefined
    );

    await fireEvent.press(await findByText('Add & check statement'));
    expect(onSubmit).toHaveBeenCalledWith(
      {
        statement_date: '2026-09-05',
        due_date: '2026-09-25',
        total_due: 12400,
        minimum_due: 620,
      },
      read
    );
  });

  it('asks for the PDF password in the sheet and retries with it', async () => {
    picker.getDocumentAsync.mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file:///cache/locked.pdf', name: 'locked.pdf', lastModified: 0 }],
    } as DocumentPicker.DocumentPickerResult);
    const onReadSource = jest
      .fn()
      .mockRejectedValueOnce(new StatementApiError('locked', 422, 'statement_password_required'))
      .mockResolvedValueOnce({
        summary: { total_due: 900 },
        lines: [],
        card_updates: [],
        warnings: [],
        source: 'pdf',
      });
    const { findByTestId, findByPlaceholderText, findByText, findByDisplayValue } =
      await renderSheet({ onReadSource });

    await fireEvent.press(await findByTestId('statement-upload-pdf'));
    await findByTestId('statement-password');
    await fireEvent.changeText(await findByPlaceholderText('Statement password'), 'pw123');
    await fireEvent.press(await findByText('Open'));

    await findByDisplayValue('900');
    expect(onReadSource).toHaveBeenLastCalledWith(
      expect.objectContaining({ kind: 'pdf' }),
      'pw123'
    );
  });

  it('shows a different-card warning from the read', async () => {
    picker.getDocumentAsync.mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file:///cache/other.pdf', name: 'other.pdf', lastModified: 0 }],
    } as DocumentPicker.DocumentPickerResult);
    const onReadSource = jest.fn().mockResolvedValue({
      summary: {},
      lines: [],
      card_updates: [],
      warnings: ['This statement is for a card ending 1111, but this card ends 4321.'],
      source: 'pdf',
    });
    const { findByTestId, findByText } = await renderSheet({ onReadSource });

    await fireEvent.press(await findByTestId('statement-upload-pdf'));

    await findByTestId('statement-read-warning');
    await findByText(/card ending 1111/);
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
    const { findByTestId, findByText, queryByTestId } = await renderSheet({
      onReadSource: jest.fn(),
    });

    await fireEvent.press(await findByTestId('statement-upload-screenshots'));

    await findByText(/up to 8 screenshots/);
    expect(queryByTestId('statement-upload-picked')).toBeNull();
  });

  it('explains the plan instead of opening the picker when screenshots are locked', async () => {
    const onSeePlans = jest.fn();
    const { findByTestId, findByText } = await renderSheet({
      screenshotsLocked: true,
      onSeePlans,
      onReadSource: jest.fn(),
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
