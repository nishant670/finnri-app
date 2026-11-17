import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';

import EventScreen from '@/app/events/[id]';
import * as events from '@/lib/events';
import * as exportLib from '@/lib/export';
import * as transactions from '@/lib/transactions';
import type { Transaction } from '@/types/transaction';

/**
 * Device feedback 2026-11-17: on an event's page, a "Where it went" row narrows
 * the transaction list to that category; tapping it again (or Clear) undoes it.
 * The count and the CSV export follow the filter.
 */
jest.mock('expo-router', () => {
  const { useEffect } = jest.requireActual('react');
  return {
    useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }),
    useFocusEffect: (callback: () => void) => useEffect(callback, [callback]),
    useLocalSearchParams: () => ({ id: '4' }),
  };
});
jest.mock('@/hooks/use-auth-store', () => {
  const state = { token: 'test-token' };
  return {
    useAuthStore: (selector?: (value: typeof state) => unknown) =>
      selector ? selector(state) : state,
  };
});

jest.mock('@/components/ui/AppDialogProvider', () => ({
  ...jest.requireActual('@/components/ui/AppDialogProvider'),
  useAppDialog: () => ({ confirm: jest.fn(), alert: jest.fn() }),
}));

const row = (id: string, name: string, category: string) =>
  ({
    id,
    name,
    category,
    amount: -100,
    icon: 'food',
    section: 'Yesterday',
    entryType: 'expense',
    mode: 'Cash',
  }) as Transaction;

const all = [
  row('1', 'Chai and bun maska', 'Food & Drinks'),
  row('2', 'Prashad', 'Travel'),
  row('3', 'Breakfast', 'Food & Drinks'),
];

describe('Event screen — filter by category', () => {
  let loadPage: jest.SpyInstance;
  let exportSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.restoreAllMocks();
    jest.spyOn(events, 'fetchEvent').mockResolvedValue({
      event: {
        id: 4,
        name: 'Kanatal Trip',
        emoji: '🎉',
        start_date: '2026-11-09',
        end_date: null,
        budget: null,
        notes: '',
      },
      summary: {
        entry_count: 3,
        total_paid: 300,
        owed_back: 0,
        net_cost: 300,
        first_date: null,
        last_date: null,
        split_entry_count: 0,
      },
    });
    jest.spyOn(events, 'fetchEventCategories').mockResolvedValue([
      { label: 'Travel', amount: 9750, percentage: 52, count: 1 },
      { label: 'Food & Drinks', amount: 4826, percentage: 26, count: 2 },
    ]);
    loadPage = jest
      .spyOn(transactions, 'loadTransactionPage')
      .mockImplementation(async (_token, filters) => {
        const rows = filters?.category
          ? all.filter((item) => item.category === filters.category)
          : all;
        return { transactions: rows, total: rows.length, categoryCounts: {} };
      });
    exportSpy = jest.spyOn(exportLib, 'shareTransactionExport').mockResolvedValue();
  });

  it('narrows the list, count and export to the tapped category, and toggles back', async () => {
    await render(<EventScreen />);
    expect(await screen.findByText('Chai and bun maska')).toBeTruthy();
    expect(screen.getByTestId('event-transaction-count')).toHaveTextContent('3 transactions');

    await fireEvent.press(screen.getByTestId('event-category-Food & Drinks'));

    await waitFor(() => expect(screen.queryByText('Prashad')).toBeNull());
    expect(loadPage).toHaveBeenLastCalledWith(
      'test-token',
      expect.objectContaining({ event_id: 4, category: 'Food & Drinks' })
    );
    expect(screen.getByText('Breakfast')).toBeTruthy();
    expect(screen.getByTestId('event-transaction-count')).toHaveTextContent(
      '2 transactions in Food & Drinks'
    );
    expect(screen.getByTestId('event-category-filter')).toHaveTextContent(/Showing Food & Drinks/);
    expect(
      screen.getByTestId('event-category-Food & Drinks').props.accessibilityState
    ).toMatchObject({ selected: true });

    await fireEvent.press(screen.getByTestId('event-export'));
    await waitFor(() =>
      expect(exportSpy).toHaveBeenCalledWith('test-token', 'csv', {
        event_id: 4,
        category: 'Food & Drinks',
      })
    );

    // Tap the same row again: everything is back.
    await fireEvent.press(screen.getByTestId('event-category-Food & Drinks'));
    expect(await screen.findByText('Prashad')).toBeTruthy();
    expect(screen.queryByTestId('event-category-filter')).toBeNull();
    expect(screen.getByTestId('event-transaction-count')).toHaveTextContent('3 transactions');
  });

  it('clears from the "Showing …" chip', async () => {
    await render(<EventScreen />);
    await fireEvent.press(await screen.findByTestId('event-category-Travel'));
    await waitFor(() => expect(screen.queryByText('Breakfast')).toBeNull());

    await fireEvent.press(screen.getByTestId('event-category-filter'));
    expect(await screen.findByText('Breakfast')).toBeTruthy();
  });
});

describe('eventTransactionsQuery', () => {
  it('is the whole event without a category', () => {
    expect(events.eventTransactionsQuery(4, null)).toEqual({ event_id: 4 });
  });

  it('asks for the category by name', () => {
    expect(events.eventTransactionsQuery(4, 'Travel')).toEqual({ event_id: 4, category: 'Travel' });
  });

  it('maps the summary\'s "Uncategorized" bucket to the uncategorised filter', () => {
    expect(events.eventTransactionsQuery(4, 'Uncategorized')).toEqual({
      event_id: 4,
      uncategorised: '1',
    });
  });
});
