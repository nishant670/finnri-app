import { fireEvent, render } from '@testing-library/react-native';

import { HomeHeader } from '@/components/home/HomeHeader';

/**
 * Ask Finnri's entry on Home (device feedback 2026-11-17): the "Or ask" link
 * under the capture field went, so the header carries a labelled Ask pill.
 */
describe('HomeHeader Ask pill', () => {
  it('opens Ask Finnri', async () => {
    const onAskPress = jest.fn();
    const screen = await render(<HomeHeader onAskPress={onAskPress} />);
    expect(screen.getByText('Ask')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('home-ask-finnri'));
    expect(onAskPress).toHaveBeenCalledTimes(1);
  });

  it('is not drawn without a handler', async () => {
    const screen = await render(<HomeHeader />);
    expect(screen.queryByTestId('home-ask-finnri')).toBeNull();
    expect(screen.getByLabelText('Notifications')).toBeTruthy();
  });
});
