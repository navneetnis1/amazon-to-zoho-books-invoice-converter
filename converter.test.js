const { test } = require('node:test');
const assert = require('node:assert/strict');
const { financialYearPrefix, refundItem } = require('./index');

test('financial year changes on April 1, independently for each document', () => {
  assert.equal(financialYearPrefix('2026-03-31 23:59:59'), '25-26/');
  assert.equal(financialYearPrefix('2026-04-01 00:00:00'), '26-27/');
  assert.throws(() => financialYearPrefix('invalid'));
});

test('shipping-only refunds preserve their value without inventing product quantity', () => {
  const result = refundItem({ Quantity: '0', 'Tax Exclusive Gross': '-66.95',
    'Principal Amount Basis': '0', 'Shipping Amount Basis': '-66.95',
    'Shipping Promo Discount Basis': '0' });
  assert.equal(result['Item Price'], 66.95);
  assert.equal(result.Quantity, 1);
  assert.equal(result['Item Type'], 'services');
  assert.equal(result.SKU, '');
});

test('ordinary refunds retain product quantities and invalid refunds fail', () => {
  assert.equal(refundItem({ Quantity: '2', 'Tax Exclusive Gross': '-100' })['Item Price'], 50);
  assert.throws(() => refundItem({ Quantity: '0', 'Tax Exclusive Gross': '-100' }));
});
