import { fireEvent, render } from '@testing-library/react-native';

import { TransactionCategoryPicker } from '@/components/transactions/TransactionCategoryPicker';

const setup = async (
  overrides: Partial<React.ComponentProps<typeof TransactionCategoryPicker>> = {}
) => {
  const handlers = {
    onChangeCustomCategory: jest.fn(),
    onClose: jest.fn(),
    onSelect: jest.fn(),
    onAddCustom: jest.fn(),
  };
  const screen = await render(
    <TransactionCategoryPicker
      visible
      selected="Food & Drinks"
      options={['Food & Drinks', 'Travel']}
      suggestions={[]}
      customCategory=""
      {...handlers}
      {...overrides}
    />
  );
  return { screen, ...handlers };
};

describe('TransactionCategoryPicker', () => {
  it('lists the options and reports the tapped one', async () => {
    const { screen, onSelect } = await setup();
    expect(screen.getByText('Choose a category')).toBeTruthy();
    await fireEvent.press(screen.getByText('Travel'));
    expect(onSelect).toHaveBeenCalledWith('Travel');
  });

  it('shows history suggestions only when there are some', async () => {
    expect((await setup()).screen.queryByText('Suggested from history')).toBeNull();
    const { screen, onSelect } = await setup({ suggestions: ['Groceries'] });
    expect(screen.getByText('Suggested from history')).toBeTruthy();
    await fireEvent.press(screen.getByText('Groceries'));
    expect(onSelect).toHaveBeenCalledWith('Groceries');
  });

  it('hands the custom category up as typed, and asks to add it', async () => {
    const { screen, onChangeCustomCategory, onAddCustom } = await setup({
      customCategory: 'Pets',
    });
    expect(screen.getByDisplayValue('Pets')).toBeTruthy();
    await fireEvent.changeText(screen.getByTestId('entry-custom-category-input'), 'Pet food');
    expect(onChangeCustomCategory).toHaveBeenCalledWith('Pet food');
    await fireEvent.press(screen.getByTestId('entry-add-custom-category-button'));
    expect(onAddCustom).toHaveBeenCalledTimes(1);
  });

  it('renders nothing while hidden', async () => {
    expect((await setup({ visible: false })).screen.queryByText('Choose a category')).toBeNull();
  });
});
