# Shared transaction composer

Home manual capture, AI draft review, transaction edits, and Split expenses use
`components/transactions/TransactionFormModal.tsx`. Split's `AddExpenseModal`
is an adapter for group selection and the existing allocation screens; it does
not implement a second amount, category, payment, date, tag, notes, or receipt form.

`lib/transaction-composer.ts` owns payload mapping and the create flow (receipt
upload, transaction, optional card EMI/subscription). Transaction edits use the
same payload mapping. Successful steps are retained for a retry within an open
composer; changing the draft after a partial save is rejected explicitly.

## Financial behavior

- A new expense paid by the user creates the transaction and its split together,
  using the chosen payment mode and compatible account, including an optional
  unlinked account exactly as Home supports.
- A friend-paid expense creates only a split bill. Shared descriptive fields,
  including tags and receipts, are retained. Personal accounts, refund tracking,
  EMI conversion, and recurring payment creation apply to personal transactions.
- An existing linked expense loads the full transaction and accounts before
  opening. Edits save transaction and allocations atomically; bill ID is stable.
  The payer is fixed for an existing linked payment; its shares can be changed.
- Legacy standalone bills remain standalone when edited. Exact existing debts
  are retained unless the allocation or total is deliberately changed.
- Split receipts follow bill access, including active group members. Private
  account and reminder settings are not added to the shared bill response.

## Release order

Deploy the API and migration `0048_add_split_transaction_details.sql` before the
new app. The migration adds and backfills shared fields; older clients can omit
these fields without clearing them. Do not ship the app against an older API,
which does not persist standalone split details.

## Regression coverage

`splitExpenseComposer.test.tsx` exercises shared UI fields, payment selection,
allocation navigation, and friend-paid validation. `transactionComposer.test.ts`
covers payloads, receipt failures, retries, refunds, income, and exact debt amounts.
The API's `split_transaction_details_test.go` covers persisted details, legacy
updates, bill identity, balances, receipt permissions, and invalid inputs.

Device QA before release: open Home and a group expense on both iOS and Android;
check keypad/keyboard switching, native date/time and receipt pickers, returning
from split allocation, account creation, save/reopen, and slow-network retries.
