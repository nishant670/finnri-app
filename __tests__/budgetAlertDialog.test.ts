import { budgetAlertDialog } from '@/lib/notifications';

const notification = (type: string) => ({ type, title: 'Title', body: 'Body' });

describe('budgetAlertDialog', () => {
  it('treats a blown budget as a stop', () => {
    expect(budgetAlertDialog(notification('budget.exceeded')).tone).toBe('danger');
  });

  it('treats a budget nearing its limit as a caution', () => {
    expect(budgetAlertDialog(notification('budget.nearing')).tone).toBe('warning');
  });

  it('shows the words the server wrote', () => {
    expect(budgetAlertDialog(notification('budget.exceeded'))).toMatchObject({
      title: 'Title',
      message: 'Body',
    });
  });
});
