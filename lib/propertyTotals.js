// invoice_summary supplies verified payments and the outstanding balance per invoice.
export function invoiceTotals(invoices, month) {
  let billedMonth = 0;
  let paidAgainstMonth = 0;
  let outstanding = 0;
  for (const invoice of invoices) {
    if (invoice.status === 'batal') continue;
    outstanding += invoice.outstanding;
    if (invoice.due_date.startsWith(month)) {
      billedMonth += invoice.amount;
      paidAgainstMonth += invoice.paid;
    }
  }
  return { billedMonth, paidAgainstMonth, outstanding };
}
