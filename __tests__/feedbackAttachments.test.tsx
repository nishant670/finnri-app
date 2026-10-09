import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import * as DocumentPicker from 'expo-document-picker';

import FeedbackScreen from '@/app/feedback';
import { submitFeedback } from '@/lib/feedback';
import { uploadAttachment } from '@/lib/uploads';

jest.mock('expo-router', () => ({ useRouter: () => ({ back: jest.fn(), push: jest.fn() }) }));
jest.mock('@/hooks/use-auth-store', () => ({ useAuthStore: () => ({ token: 'session-token' }) }));
jest.mock('@/components/ui/AppDialogProvider', () => ({
  useAppDialog: () => ({ alert: jest.fn().mockResolvedValue(undefined), confirm: jest.fn() }),
}));
jest.mock('expo-document-picker', () => ({ getDocumentAsync: jest.fn() }));
jest.mock('@/lib/uploads', () => ({
  ...jest.requireActual('@/lib/uploads'),
  uploadAttachment: jest.fn(),
}));
jest.mock('@/lib/feedback', () => ({
  ...jest.requireActual('@/lib/feedback'),
  submitFeedback: jest.fn().mockResolvedValue({}),
}));

const mockedPicker = DocumentPicker.getDocumentAsync as jest.Mock;
const mockedUpload = uploadAttachment as jest.Mock;
const mockedSubmit = submitFeedback as jest.Mock;

const asset = (name: string, mimeType: string) => ({
  uri: `file:///cache/${name}`,
  name,
  mimeType,
  size: 1024,
  lastModified: 0,
});

beforeEach(() => {
  jest.clearAllMocks();
  mockedUpload.mockImplementation(async (_token: string, uri: string) =>
    uri.replace('file:///cache/', 'https://api.finnri.app/uploads/')
  );
});

const pick = async (
  screen: Awaited<ReturnType<typeof render>>,
  assets: ReturnType<typeof asset>[]
) => {
  mockedPicker.mockResolvedValueOnce({ canceled: false, assets });
  await act(async () => {
    fireEvent.press(screen.getByTestId('feedback-add-attachment'));
  });
};

describe('feedback attachments', () => {
  it('attaches a screenshot and sends it with the feedback', async () => {
    // The report: there was no way to show the screen being talked about.
    const screen = await render(<FeedbackScreen />);
    await pick(screen, [
      asset('ask-screen.png', 'image/png'),
      asset('notes.pdf', 'application/pdf'),
    ]);

    expect(screen.getAllByTestId('feedback-attachment')).toHaveLength(2);
    expect(screen.getByText('notes.pdf')).toBeTruthy();

    // Changed their mind about the PDF.
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Remove notes.pdf'));
    });
    expect(screen.getAllByTestId('feedback-attachment')).toHaveLength(1);

    await act(async () => {
      fireEvent.changeText(
        screen.getByPlaceholderText('Short title'),
        'Show AI credits purchase popup'
      );
      fireEvent.changeText(
        screen.getByPlaceholderText('What should we improve, add, or fix?'),
        'Offer to buy credits when I run out.'
      );
    });
    await act(async () => {
      fireEvent.press(screen.getByText('Send Feedback'));
    });

    await waitFor(() => expect(mockedSubmit).toHaveBeenCalledTimes(1));
    // Only the file that stayed is uploaded.
    expect(mockedUpload).toHaveBeenCalledTimes(1);
    expect(mockedUpload).toHaveBeenCalledWith(
      'session-token',
      'file:///cache/ask-screen.png',
      'image/png',
      { noun: 'file' }
    );
    expect(mockedSubmit.mock.calls[0][1]).toEqual(
      expect.objectContaining({
        title: 'Show AI credits purchase popup',
        attachments: ['https://api.finnri.app/uploads/ask-screen.png'],
      })
    );
  });

  it('keeps to three files and says so', async () => {
    const screen = await render(<FeedbackScreen />);
    await pick(screen, [
      asset('one.png', 'image/png'),
      asset('two.png', 'image/png'),
      asset('three.png', 'image/png'),
      asset('four.png', 'image/png'),
    ]);

    expect(screen.getAllByTestId('feedback-attachment')).toHaveLength(3);
    expect(screen.getByText('Only 3 files fit, so the first 3 were added.')).toBeTruthy();
    // Full: no more room to add.
    expect(screen.queryByTestId('feedback-add-attachment')).toBeNull();
  });

  it('sends feedback without attachments exactly as before', async () => {
    const screen = await render(<FeedbackScreen />);
    await act(async () => {
      fireEvent.changeText(screen.getByPlaceholderText('Short title'), 'Weekly summary');
      fireEvent.changeText(
        screen.getByPlaceholderText('What should we improve, add, or fix?'),
        'A weekly summary would help.'
      );
    });
    await act(async () => {
      fireEvent.press(screen.getByText('Send Feedback'));
    });

    await waitFor(() => expect(mockedSubmit).toHaveBeenCalledTimes(1));
    expect(mockedUpload).not.toHaveBeenCalled();
    expect(mockedSubmit.mock.calls[0][1]).not.toHaveProperty('attachments');
  });
});
