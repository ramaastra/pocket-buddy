import assert from 'node:assert/strict';
import test from 'node:test';
import { withBudgetSpending } from '../app/budget-spending.ts';

test('a Pertalite expense fills its current weekly category budget', () => {
  const budgets = [{ id: 'transport', category: 'Transport', period: 'Weekly', spent: 385000 }];
  const transactions = [{ category: 'Transport', kind: 'expense', amount: 25000, date: '2026-11-16' }];
  const categories = [{ name: 'Transport', kind: 'expense' }];
  const result = withBudgetSpending(budgets, transactions, categories, new Date('2026-11-16T12:00:00'));
  assert.equal(result[0].spent, 25000);
});

test('weekly budgets use Monday through Sunday and ignore income', () => {
  const budgets = [{ category: 'Transport', period: 'Weekly', spent: 999 }];
  const categories = [{ name: 'Transport', kind: 'expense' }];
  const transactions = [
    { category: 'Transport', kind: 'expense', amount: 10, date: '2026-11-15' },
    { category: 'Transport', kind: 'expense', amount: 20, date: '2026-11-16' },
    { category: 'Transport', kind: 'expense', amount: 30, date: '2026-11-22' },
    { category: 'Transport', kind: 'expense', amount: 40, date: '2026-11-23' },
    { category: 'Transport', kind: 'income', amount: 500, date: '2026-11-16' },
  ];
  assert.equal(withBudgetSpending(budgets, transactions, categories, new Date('2026-11-16T12:00:00'))[0].spent, 50);
  assert.equal(budgets[0].spent, 999, 'saved demo data stays untouched');
});

test('a parent budget includes child spending while the child budget stays separate', () => {
  const budgets = [
    { category: 'Transport', period: 'Monthly', spent: 0 },
    { category: 'Fuel', period: 'Monthly', spent: 0 },
  ];
  const categories = [
    { name: 'Transport', kind: 'expense' },
    { name: 'Fuel', kind: 'expense', parent: 'Transport' },
  ];
  const transactions = [
    { category: 'Transport', kind: 'expense', amount: 10, date: '2026-11-01' },
    { category: 'Fuel', kind: 'expense', amount: 25, date: '2026-11-16' },
    { category: 'Fuel', kind: 'expense', amount: 50, date: '2026-10-31' },
  ];
  const result = withBudgetSpending(budgets, transactions, categories, new Date('2026-11-16T12:00:00'));
  assert.deepEqual(result.map((budget) => budget.spent), [35, 25]);
});
