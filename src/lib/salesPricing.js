const MONEY_TOLERANCE = 0.009

function numericValue(value, fallback = 0) {
  const number = Number.parseFloat(value)
  return Number.isFinite(number) ? number : fallback
}

function roundMoney(value) {
  return Math.round((numericValue(value) + Number.EPSILON) * 100) / 100
}

export function finalSalesLineAmount(item) {
  const amount = Number.parseFloat(item?.amount)
  if (Number.isFinite(amount)) return amount
  return numericValue(item?.qty) * numericValue(item?.rate)
}

export function markedSalesUnitPrice(baseRate, markup) {
  const base = numericValue(baseRate)
  const percent = numericValue(markup)
  return roundMoney(base * (1 + percent / 100))
}

export function finalSalesUnitPrice(item) {
  const qty = numericValue(item?.qty)
  const rate = numericValue(item?.rate)
  const amount = finalSalesLineAmount(item)

  // Historical markup rows stored the catalogue/base rate in `rate` while
  // storing the marked-up result in `amount`. The customer-facing unit price
  // must always reconcile with the line amount, regardless of row age.
  if (qty !== 0 && Math.abs(amount - qty * rate) > MONEY_TOLERANCE) {
    return amount / qty
  }
  return rate
}

export function normalizeSalesLinePricing(item) {
  const parsedQty = Number.parseFloat(item?.qty)
  const qty = Number.isFinite(parsedQty) && parsedQty !== 0 ? parsedQty : 1
  const rate = roundMoney(finalSalesUnitPrice({ ...item, qty }))
  const amount = roundMoney(qty * rate)
  const markup = numericValue(item?.markup)
  const markupFactor = 1 + markup / 100
  const baseRate = markup !== 0 && markupFactor !== 0 ? rate / markupFactor : rate

  return {
    ...item,
    qty,
    rate,
    amount,
    base_rate: baseRate,
  }
}

export function salesLinePricingMatches(item) {
  const qty = numericValue(item?.qty)
  const rate = roundMoney(finalSalesUnitPrice(item))
  const amount = roundMoney(finalSalesLineAmount(item))
  return Math.abs(roundMoney(qty * rate) - amount) <= MONEY_TOLERANCE
}
