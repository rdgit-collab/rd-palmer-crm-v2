// Shared constants for the Training module customer-status pipeline.
// Each milestone maps to a nullable timestamp column on training_registrations:
// a value = done (date recorded), null = pending.

export const STATUS_GROUPS = [
  {
    label: 'Payment',
    tone: 'green',
    steps: [
      { key: 'proforma_at', label: 'Proforma' },
      { key: 'paid_at',     label: 'Paid' },
      { key: 'cash_at',     label: 'Cash in' },
    ],
  },
  {
    label: 'HRD Grant',
    tone: 'indigo',
    steps: [
      { key: 'hrd_applied_at',  label: 'Applied' },
      { key: 'hrd_approved_at', label: 'Approved' },
      { key: 'hrd_released_at', label: 'Released' },
    ],
  },
]

export const STATUS_KEYS = STATUS_GROUPS.flatMap(g => g.steps.map(s => s.key))
