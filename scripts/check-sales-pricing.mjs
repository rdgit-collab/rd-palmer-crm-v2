import assert from 'node:assert/strict'
import {
  finalSalesLineAmount,
  finalSalesUnitPrice,
  markedSalesUnitPrice,
  normalizeSalesLinePricing,
  salesLinePricingMatches,
} from '../src/lib/salesPricing.js'

const screenshotCase = normalizeSalesLinePricing({
  qty: 1,
  rate: 3161,
  amount: 3319.05,
  markup: '5',
})
assert.equal(screenshotCase.rate, 3319.05)
assert.equal(screenshotCase.amount, 3319.05)
assert.equal(screenshotCase.base_rate, 3161)
assert.equal(salesLinePricingMatches(screenshotCase), true)

const multiQuantityMarkup = normalizeSalesLinePricing({
  qty: 20,
  rate: 21160,
  amount: 444360,
  markup: '5',
})
assert.equal(multiQuantityMarkup.rate, 22218)
assert.equal(multiQuantityMarkup.amount, 444360)
assert.equal(multiQuantityMarkup.base_rate, 21160)
assert.equal(salesLinePricingMatches(multiQuantityMarkup), true)
assert.equal(markedSalesUnitPrice(multiQuantityMarkup.base_rate, 10), 23276)

const alreadyConsistent = normalizeSalesLinePricing({ qty: 3, rate: 19.95, amount: 59.85, markup: '' })
assert.equal(alreadyConsistent.rate, 19.95)
assert.equal(alreadyConsistent.amount, 59.85)
assert.equal(salesLinePricingMatches(alreadyConsistent), true)

const missingAmount = { qty: 2, rate: 12.5 }
assert.equal(finalSalesLineAmount(missingAmount), 25)
assert.equal(finalSalesUnitPrice(missingAmount), 12.5)
assert.equal(salesLinePricingMatches(missingAmount), true)

const negativeAdjustmentLine = normalizeSalesLinePricing({ qty: 1, rate: -125.5, amount: -125.5 })
assert.equal(negativeAdjustmentLine.rate, -125.5)
assert.equal(negativeAdjustmentLine.amount, -125.5)
assert.equal(salesLinePricingMatches(negativeAdjustmentLine), true)

console.log('Sales pricing checks passed: markup, clone/edit reconciliation, quantity, and negative-rate cases.')
