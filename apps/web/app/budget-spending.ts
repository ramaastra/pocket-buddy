type Budget = { category: string; period: 'Weekly' | 'Monthly'; spent: number };
type Transaction = { category: string; kind: 'income' | 'expense'; amount: number; date: string };
type Category = { name: string; kind: 'income' | 'expense'; parent?: string };

function dateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function withBudgetSpending<B extends Budget>(budgets: B[], transactions: Transaction[], categories: Category[], today: Date): B[] {
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const mondayOffset = (start.getDay() + 6) % 7;
  const weeklyStart = new Date(start);
  weeklyStart.setDate(weeklyStart.getDate() - mondayOffset);
  const weeklyEnd = new Date(weeklyStart);
  weeklyEnd.setDate(weeklyEnd.getDate() + 7);
  const monthlyStart = new Date(start.getFullYear(), start.getMonth(), 1);
  const monthlyEnd = new Date(start.getFullYear(), start.getMonth() + 1, 1);

  return budgets.map((budget) => {
    const category = categories.find((item) => item.kind === 'expense' && item.name === budget.category);
    const children = category && !category.parent
      ? new Set(categories.filter((item) => item.kind === 'expense' && item.parent === category.name).map((item) => item.name))
      : new Set<string>();
    const [from, to] = budget.period === 'Weekly' ? [dateKey(weeklyStart), dateKey(weeklyEnd)] : [dateKey(monthlyStart), dateKey(monthlyEnd)];
    const spent = transactions.reduce((sum, transaction) => {
      if (transaction.kind !== 'expense' || transaction.date < from || transaction.date >= to) return sum;
      if (transaction.category !== budget.category && !children.has(transaction.category)) return sum;
      return sum + transaction.amount;
    }, 0);
    return { ...budget, spent };
  });
}
