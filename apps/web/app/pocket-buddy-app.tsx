'use client';

import Link from 'next/link';
import { ApiError, apiRequest, apiUpload } from './api';
import { withBudgetSpending } from './budget-spending';
import { usePathname, useRouter } from 'next/navigation';
import { Pagination as MantinePagination, Paper, UnstyledButton, Modal, Popover, Select } from '@mantine/core';
import paginationStyles from './pagination.module.css';
import { DatePicker as MantineDatePicker, MonthPicker } from '@mantine/dates';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type FormEvent, type ReactNode } from 'react';
import {
  ArchiveRestore, ArrowDownLeft, ArrowLeft, ArrowRight, ArrowUpRight, Banknote, BarChart3, CalendarDays,
  Check, ChevronDown, ChevronLeft, ChevronRight, CircleHelp, FileDown,
  FileImage, Filter, Home, LayoutDashboard, LogOut, Pencil, ReceiptText,
  Plus, Play, Pause, Repeat2, RotateCcw, ScanText, Search, Settings, ShieldCheck, Sparkles, Tag,
  Trash2, Upload, Wallet, X, Utensils, ShoppingCart, Car, HeartPulse,
  BriefcaseBusiness, Gift, Music, PawPrint, Plane, BookOpen, Shirt,
} from 'lucide-react';

const demoAccountEmail = process.env.NEXT_PUBLIC_DEMO_ACCOUNT_EMAIL ?? '';
const demoAccountPassword = process.env.NEXT_PUBLIC_DEMO_ACCOUNT_PASSWORD ?? '';


type ApiTransaction = { categoryId: string | null; id: string; description: string; kind: Kind; amount: number; date: string; merchant: string; note: string; deletedAt?: string };
type ApiSettings = { currency: string; locale: string; openingBalance: number; transactionEntryDefault: 'scan' | 'manual' };
type ApiCategory = { id: string; name: string; kind: Kind; parentId: string | null; icon: string; color: string };
type ApiRecurring = { id: string; description: string; categoryId: string | null; kind: Kind; amount: number; frequency: 'weekly' | 'monthly' | 'yearly'; nextDate: string; paused: boolean };
type ApiOccurrence = { id: string; scheduleId: string; description: string; categoryId: string | null; kind: Kind; amount: number; date: string; merchant: string; note: string };
type ApiBudget = { id: string; categoryId: string; amount: number; period: 'weekly' | 'monthly'; spent: number };
const fromApiTransaction = (t: ApiTransaction, categories: ApiCategory[]): Transaction => ({ id: t.id, name: t.description || t.merchant || 'Transaction', category: categories.find((c) => c.id === t.categoryId && c.kind === t.kind)?.name || '', kind: t.kind, amount: t.amount, date: t.date, merchant: t.merchant, note: t.note });
const emptyAccount: DemoState = { transactions: [], deleted: [], budgets: [], schedules: [], categories: [], openingBalance: 0, currency: 'IDR', language: 'en', transactionEntryDefault: 'manual' };

type Session = { user: { id: string; email: string }; csrfToken: string };

function MobileAccountMenu({ session }: { session: Session | null }) {
  const [open, setOpen] = useState(false);
  return <Popover opened={open} onChange={setOpen} position="bottom-end" offset={8} withinPortal closeOnEscape closeOnClickOutside>
    <Popover.Target><button type="button" className="mobile-account-link" aria-label="Account menu" aria-expanded={open} aria-haspopup="dialog" onClick={() => setOpen((current) => !current)}><span className="profile-bubble">D</span></button></Popover.Target>
    <Popover.Dropdown className="mobile-account-menu"><strong>{session ? session.user.email : 'Demo account'}</strong><Link href="/settings" onClick={() => setOpen(false)}><Settings size={17}/>Settings</Link><Link href="/settings/account" onClick={() => setOpen(false)}><ShieldCheck size={17}/>Account &amp; security</Link></Popover.Dropdown>
  </Popover>;
}

// Editors report unsaved values to the shared navigation guard.
const unsavedEditors = new Set<symbol>();
const unsavedChangeEvent = 'pocket-buddy-unsaved-change';
let requestDiscard: (action: () => void) => void = (action) => action();
function useUnsavedChanges(dirty: boolean) {
  const editor = useRef(Symbol('editor'));
  useEffect(() => {
    const id = editor.current;
    if (dirty) unsavedEditors.add(id); else unsavedEditors.delete(id);
    window.dispatchEvent(new Event(unsavedChangeEvent));
    return () => { unsavedEditors.delete(id); };
  }, [dirty]);
}

type Kind = 'income' | 'expense';
type Transaction = { id: string; name: string; category: string; kind: Kind; amount: number; date: string; note?: string; merchant?: string; uncertainFields?: string[] };
type Budget = { id: string; category: string; limit: number; period: 'Weekly' | 'Monthly'; spent: number };
type Schedule = { id: string; name: string; category: string; kind: Kind; amount: number; cadence: 'Weekly' | 'Monthly' | 'Yearly'; nextDate: string; paused?: boolean; pending?: boolean; occurrenceId?: string; merchant?: string; note?: string };
type Category = { id: string; name: string; kind: Kind; color: string; icon?: string; parent?: string };
type DeletedTransaction = Transaction & { deletedAt: string };
type DemoState = { transactions: Transaction[]; budgets: Budget[]; schedules: Schedule[]; occurrences?: Schedule[]; categories: Category[]; deleted: DeletedTransaction[]; openingBalance: number; currency: string; language: 'en' | 'id'; transactionEntryDefault?: 'scan' | 'manual'; paginationSamplesAdded?: boolean; recurringSamplesAdded?: boolean };

const STORE_KEY = 'pocket-buddy-demo-v1';
let balanceHighlightHasPlayed = false;
const sampleTransactions: Transaction[] = Array.from({ length: 55 }, (_, index) => {
  const examples = [
    { name: 'Coffee break', category: 'Food & drink', amount: 32000 },
    { name: 'Grocery shop', category: 'Groceries', amount: 145000 },
    { name: 'Ride home', category: 'Transport', amount: 26000 },
    { name: 'Movie ticket', category: 'Fun', amount: 75000 },
    { name: 'Household supplies', category: 'Home', amount: 89000 },
  ];
  return { id: `pagination-sample-${index + 1}`, ...examples[index % examples.length], kind: 'expense', date: `2026-${index < 28 ? '10' : '09'}-${String(28 - index % 28).padStart(2, '0')}` };
});
const sampleDeleted: DeletedTransaction[] = Array.from({ length: 30 }, (_, index) => ({
  ...sampleTransactions[index], id: `pagination-deleted-${index + 1}`, deletedAt: '2026-11-14',
}));
const sampleSchedules: Schedule[] = [
  { id: 'recurring-sample-internet', name: 'Internet subscription', category: '', kind: 'expense', amount: 325_000, cadence: 'Monthly', nextDate: '2026-11-16', pending: true },
  { id: 'recurring-sample-groceries', name: 'Weekly groceries', category: '', kind: 'expense', amount: 200_000, cadence: 'Weekly', nextDate: '2026-11-17', pending: true },
  { id: 'recurring-sample-freelance', name: 'Freelance retainer', category: '', kind: 'income', amount: 1_500_000, cadence: 'Monthly', nextDate: '2026-11-18', pending: true },
];
const seed: DemoState = {
  paginationSamplesAdded: true,
  recurringSamplesAdded: true,
  openingBalance: 5_000_000,
  currency: 'IDR',
  language: 'en',
  transactions: [
    { id: 't1', name: 'Monthly salary', category: 'Salary', kind: 'income', amount: 8_500_000, date: '2026-11-14', note: 'November salary' },
    { id: 't2', name: 'Coffee with Rani', category: 'Food & drink', kind: 'expense', amount: 28_000, date: '2026-11-14', merchant: 'Kopi Kenangan' },
    { id: 't3', name: 'Ride to the office', category: 'Transport', kind: 'expense', amount: 24_500, date: '2026-11-13', merchant: 'Grab' },
    { id: 't4', name: 'Weekly groceries', category: 'Groceries', kind: 'expense', amount: 186_200, date: '2026-11-13', merchant: 'Super Indo' },
    { id: 't5', name: 'Internet bill', category: 'Home', kind: 'expense', amount: 325_000, date: '2026-11-11' },
    { id: 't6', name: 'Freelance project', category: 'Side income', kind: 'income', amount: 1_250_000, date: '2026-11-09' },
    { id: 't7', name: 'Movie night', category: 'Fun', kind: 'expense', amount: 115_000, date: '2026-11-08' },
    { id: 't8', name: 'Lunch', category: 'Food & drink', kind: 'expense', amount: 46_000, date: '2026-11-07' },
    ...sampleTransactions,
  ],
  budgets: [
    { id: 'b1', category: 'Food & drink', limit: 2_000_000, period: 'Monthly', spent: 1_240_000 },
    { id: 'b2', category: 'Home', limit: 2_500_000, period: 'Monthly', spent: 1_100_000 },
    { id: 'b3', category: 'Transport', limit: 500_000, period: 'Weekly', spent: 385_000 },
  ],
  schedules: [
    { id: 'r1', name: 'Rent', category: 'Home', kind: 'expense', amount: 3_000_000, cadence: 'Monthly', nextDate: '2026-12-01', pending: true },
    { id: 'r2', name: 'Phone plan', category: 'Bills', kind: 'expense', amount: 125_000, cadence: 'Monthly', nextDate: '2026-12-04' },
    { id: 'r3', name: 'Payday', category: 'Salary', kind: 'income', amount: 8_500_000, cadence: 'Monthly', nextDate: '2026-12-14' },
    ...sampleSchedules,
  ],
  categories: [
    { id: 'c1', name: 'Food & drink', icon: 'food', kind: 'expense', color: 'coral' },
    { id: 'c2', name: 'Groceries', icon: 'shopping', kind: 'expense', color: 'lime', parent: 'Food & drink' },
    { id: 'c3', name: 'Home', icon: 'home', kind: 'expense', color: 'violet' },
    { id: 'c4', name: 'Transport', icon: 'transport', kind: 'expense', color: 'aqua' },
    { id: 'c5', name: 'Fun', icon: 'music', kind: 'expense', color: 'pink' },
    { id: 'c6', name: 'Salary', icon: 'money', kind: 'income', color: 'lime' },
    { id: 'c7', name: 'Side income', icon: 'work', kind: 'income', color: 'aqua' },
  ],
  deleted: sampleDeleted,
};

const nav = [
  { href: '/', label: 'Overview', icon: LayoutDashboard },
  { href: '/transactions', label: 'Transactions', icon: ReceiptText },
  { href: '/budgets', label: 'Budgets', icon: BarChart3 },
  { href: '/recurring', label: 'Recurring', icon: Repeat2 },
  { href: '/categories', label: 'Categories', icon: Tag },
  { href: '/settings', label: 'Settings', icon: Settings },
];

function fmt(amount: number, currency = 'IDR') {
  const digits = new Intl.NumberFormat('en-US', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 0;
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: digits }).format(amount / (10 ** digits)).replace('IDR', 'Rp');
}
function formatAmount(value: string) {
  const [whole = '', fraction] = value.replace(/[^\d.]/g, '').split('.', 2);
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return fraction === undefined ? grouped : `${grouped}.${fraction}`;
}
function amountDigits(currency: string) { return new Intl.NumberFormat('en-US', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 0; }
function minorToInput(value: string, currency: string) {
  if (!value || !Number.isSafeInteger(Number(value))) return '';
  const digits = amountDigits(currency); const scale = 10 ** digits; const amount = BigInt(value);
  const whole = amount / BigInt(scale); const fraction = (amount % BigInt(scale)).toString().padStart(digits, '0').replace(/0+$/, '');
  return `${whole}${fraction ? `.${fraction}` : ''}`;
}
function inputToMinor(value: string, currency: string) {
  const digits = amountDigits(currency); const match = value.replace(/,/g, '').trim().match(/^(\d+)(?:\.(\d*))?$/);
  if (!match || (match[2] ?? '').length > digits) return NaN;
  const scale = BigInt(10) ** BigInt(digits); const fraction = (match[2] ?? '').padEnd(digits, '0');
  const minor = BigInt(match[1]) * scale + BigInt(fraction || '0');
  return minor <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(minor) : NaN;
}
function currencySymbol(currency: string) {
  if (currency === 'IDR') return 'Rp';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).formatToParts(0).find((part) => part.type === 'currency')?.value ?? currency;
}
function AmountInput({ value, onChange, currency = 'IDR', placeholder = '0', ariaLabel = 'Amount' }: { value: string; onChange: (value: string) => void; currency?: string; placeholder?: string; ariaLabel?: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [editingValue, setEditingValue] = useState(() => minorToInput(value, currency));
  const [focused, setFocused] = useState(false);
  useEffect(() => { if (!focused) setEditingValue(minorToInput(value, currency)); }, [value, currency, focused]);
  const pendingCaret = useRef<{ digits: number; afterDecimal: boolean } | null>(null);
  const [formatRevision, setFormatRevision] = useState(0);
  const formattedValue = formatAmount(editingValue);
  useLayoutEffect(() => {
    const input = inputRef.current;
    const digitPosition = pendingCaret.current;
    if (!input || digitPosition === null) return;
    let digitsSeen = 0;
    let caret = digitPosition.digits === 0 ? 0 : formattedValue.length;
    for (let index = 0; index < formattedValue.length; index += 1) {
      if (/\d/.test(formattedValue[index])) digitsSeen += 1;
      if (formattedValue[index] === '.' && digitPosition.afterDecimal && digitsSeen === digitPosition.digits) { caret = index + 1; break; }
      if (digitsSeen === digitPosition.digits && /\d/.test(formattedValue[index])) {
        caret = index + 1 + (digitPosition.afterDecimal && formattedValue[index + 1] === '.' ? 1 : 0);
        break;
      }
    }
    input.setSelectionRange(caret, caret);
    pendingCaret.current = null;
  }, [formattedValue, formatRevision]);
  return <div className="amount-input"><span>{currencySymbol(currency)}</span><input ref={inputRef} required inputMode={amountDigits(currency) ? 'decimal' : 'numeric'} type="text" placeholder={placeholder} value={formattedValue} onFocus={() => setFocused(true)} onBlur={() => { setFocused(false); setEditingValue(minorToInput(value, currency)); }} onChange={(event) => {
    const input = event.currentTarget;
    const caret = input.selectionStart ?? input.value.length;
    const beforeCaret = input.value.slice(0, caret);
    pendingCaret.current = { digits: beforeCaret.replace(/\D/g, '').length, afterDecimal: beforeCaret.includes('.') };
    const next = input.value.replace(/[^\d.]/g, '').replace(/\.(?=.*\.)/g, '');
    setEditingValue(next);
    setFormatRevision((revision) => revision + 1);
    const minor = inputToMinor(next, currency);
    onChange(Number.isSafeInteger(minor) ? String(minor) : '');
  }} aria-label={ariaLabel}/></div>;
}
function transactionInput({ name, category, kind, amount, date, note, merchant }: Transaction): Omit<Transaction, 'id'> {
  return { name, category, kind, amount, date, note, merchant };
}
function prettyDate(value: string) {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(`${value}T12:00:00`));
}
function getTitle(path: string) {
  if (path === '/') return 'Overview';
  if (path === '/transactions/new') return 'Add transaction';
  if (path === '/transactions/recently-deleted') return 'Recently deleted';
  if (path.startsWith('/transactions/')) return 'Transaction details';
  if (path === '/transactions') return 'Transactions';
  if (path === '/budgets/new') return 'Create a budget';
  if (path.startsWith('/budgets/')) return 'Budget details';
  if (path === '/budgets') return 'Budgets';
  if (path === '/recurring/new') return 'New recurring schedule';
  if (path === '/recurring/review') return 'Pending occurrences';
  if (path.startsWith('/recurring/')) return 'Schedule details';
  if (path === '/recurring') return 'Recurring';
  if (path === '/categories/new') return 'Add category';
  if (path.startsWith('/categories/')) return 'Category details';
  if (path === '/categories') return 'Categories';
  if (path === '/settings/account') return 'Account & security';
  if (path === '/settings') return 'Settings';
  return ({ '/sign-in': 'Welcome back', '/sign-up': 'Create your account', '/verify-email': 'Check your inbox', '/forgot-password': 'Reset your password', '/reset-password': 'Choose a new password' } as Record<string, string>)[path] ?? 'Pocket Buddy';
}

function Button({ children, href, variant = 'secondary', onClick, type = 'button', disabled = false, className = '' }: { children: ReactNode; href?: string; variant?: 'primary' | 'secondary' | 'quiet' | 'danger'; onClick?: () => void; type?: 'button' | 'submit'; disabled?: boolean; className?: string }) {
  const cls = `ui-button ${variant} ${className}`;
  return href ? <UnstyledButton component={Link} className={cls} href={href}>{children}</UnstyledButton> : <UnstyledButton className={cls} type={type} onClick={onClick} disabled={disabled}>{children}</UnstyledButton>;
}
function Card({ children, className = '' }: { children: ReactNode; className?: string }) { return <Paper component="section" unstyled className={`ui-card ${className}`}>{children}</Paper>; }
function Empty({ title, detail, action }: { title: string; detail: string; action?: ReactNode }) { return <div className="empty-state"><span className="empty-mark"><Sparkles size={20}/></span><strong>{title}</strong><p>{detail}</p>{action}</div>; }
function Field({ label, children, hint, required = false, labelControl = true, className = '' }: { label: string; children: ReactNode; hint?: string; required?: boolean; labelControl?: boolean; className?: string }) {
  const Wrapper = labelControl ? 'label' : 'div';
  return <Wrapper className={`field ${className}`}><span>{label}{required && <span className="required-marker" aria-hidden="true"> *</span>}</span>{children}{hint && <small>{hint}</small>}</Wrapper>;
}
type SelectOption = { value: string; label: string };
function SelectInput({ value, onChange, options, ariaLabel, required = false, className = '', leadingIcon }: { value: string; onChange: (value: string) => void; options: SelectOption[]; ariaLabel: string; required?: boolean; className?: string; leadingIcon?: ReactNode }) {
  const emptyValue = '__pocket_buddy_empty__';
  const inputRef = useRef<HTMLInputElement>(null);
  const keyboardSelection = useRef(false);
  return <div className={`select-control ${className}`}><Select
    aria-label={ariaLabel} required={required} value={value || emptyValue}
    ref={inputRef}
    onPointerDown={() => { keyboardSelection.current = false; }}
    onKeyDown={() => { keyboardSelection.current = true; }}
    onChange={(next) => {
      onChange(next === emptyValue || next === null ? '' : next);
      if (!keyboardSelection.current) requestAnimationFrame(() => inputRef.current?.blur());
    }}
    data={options.map((option) => ({ value: option.value || emptyValue, label: option.label }))}
    placeholder="Choose an option" searchable={options.length > 10} allowDeselect={false}
    leftSection={leadingIcon} rightSection={<ChevronDown size={15} aria-hidden="true"/>}
    comboboxProps={{ position: 'bottom', middlewares: { flip: true, shift: { padding: 12 } }, withinPortal: true }}
    classNames={{ input: 'select-trigger', dropdown: 'select-menu', option: 'select-option' }}
  /></div>;
}
function DatePicker({ value, onChange, ariaLabel, compact = false, required = false, mode = 'date', maxValue }: { value: string; onChange: (value: string) => void; ariaLabel: string; compact?: boolean; required?: boolean; mode?: 'date' | 'month'; maxValue?: string }) {
  const [open, setOpen] = useState(false);
  const selected = value ? new Date(`${value}${mode === 'month' ? '-01' : ''}T12:00:00`) : null;
  const displayValue = selected ? new Intl.DateTimeFormat('en', mode === 'month' ? { month: 'long', year: 'numeric' } : { month: 'short', day: 'numeric', year: 'numeric' }).format(selected) : mode === 'month' ? 'Choose month' : 'Choose date';
  const today = new Date();
  const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const pickerClasses = { calendarHeader: 'date-calendar-header', calendarHeaderControl: 'date-calendar-control', calendarHeaderLevel: 'date-calendar-level', day: 'date-calendar-day', weekday: 'date-calendar-weekday', monthsListControl: 'date-calendar-day', yearsListControl: 'date-calendar-day' };
  return <div className={`date-picker${compact ? ' compact' : ''}${mode === 'month' ? ' month-mode' : ''}`}><Popover opened={open} onChange={setOpen} position="bottom" offset={7} middlewares={{ flip: true, shift: { padding: 12 } }} withinPortal>
      <Popover.Target><button type="button" className="date-picker-trigger" aria-label={ariaLabel} aria-expanded={open} aria-haspopup="dialog" aria-required={required} onClick={() => setOpen((current) => !current)} onKeyDown={(event) => { if (event.key === 'Escape') setOpen(false); }}><span>{displayValue}</span>{mode === 'date' && <CalendarDays size={15}/>}</button></Popover.Target>
      <Popover.Dropdown className={`date-picker-popover${mode === 'month' ? ' month-picker-popover' : ''}`} aria-label={mode === 'month' ? 'Choose a month' : 'Choose a date'}>
        {mode === 'month' ? <MonthPicker key={`${open}-${value}`} value={value ? `${value}-01` : null} defaultDate={value ? `${value}-01` : undefined} maxDate={maxValue ? `${maxValue}-01` : undefined} onChange={(next) => { if (next) { onChange(next.slice(0, 7)); setOpen(false); } }} classNames={pickerClasses}/> : <><MantineDatePicker key={`${open}-${value}`} value={value || null} defaultDate={value || undefined} onChange={(next) => { if (next) { onChange(next); setOpen(false); } }} classNames={pickerClasses} getDayProps={(date) => ({ 'aria-label': new Intl.DateTimeFormat('en', { dateStyle: 'full' }).format(new Date(`${date}T12:00:00`)) })}/><div className="date-picker-footer"><button type="button" onClick={() => { onChange(todayIso); setOpen(false); }}>Today</button>{value && !required && <button type="button" onClick={() => { onChange(''); setOpen(false); }}>Clear</button>}</div></>}
      </Popover.Dropdown>
  </Popover></div>;
}
function AutoResizeTextarea({ value, onChange, placeholder }: { value: string; onChange: (value: string) => void; placeholder?: string }) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = '0px';
    textarea.style.height = `${textarea.scrollHeight}px`;
  }, [value]);
  return <textarea ref={textareaRef} rows={1} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder}/>;
}

function TransactionRows({ items, categories, currency, onDelete, overview = false }: { items: Transaction[]; categories: Category[]; currency: string; onDelete?: (item: Transaction) => void; overview?: boolean }) {
  return <div className="transaction-list">{items.map((item) => <article className="transaction-row" key={item.id}>
    <Link href={`/transactions/${item.id}`} className="transaction-row-link" aria-label={`Edit ${item.name}`}>
    <span className={`transaction-icon ${categoryColor(categories, item.category, item.kind)}`}>
      <CategoryIcon categories={categories} name={item.category} kind={item.kind}/>
    </span>
    <span className="transaction-description"><strong>{item.name}</strong><span>{item.merchant ? `${item.merchant} · ` : ''}{item.category || 'Uncategorized'}</span></span>
    <time>{prettyDate(item.date)}</time>
    <strong className={`transaction-amount ${item.kind}`}>{item.kind === 'income' ? '+' : '−'}{fmt(item.amount, currency)}</strong>
    {(onDelete || overview) && <ChevronRight className={overview ? "overview-row-chevron" : "mobile-row-chevron"} size={17} aria-hidden="true"/>}
    </Link>
    {onDelete && <span className="row-actions">
      <button className="icon-button row-action" onClick={() => onDelete(item)} aria-label={`Delete ${item.name}`}><Trash2 size={16}/></button>
    </span>}
  </article>)}</div>;
}

function BudgetRows({ budgets, categories, currency, showMobileChevron = false, overview = false }: { budgets: Budget[]; categories: Category[]; currency: string; showMobileChevron?: boolean; overview?: boolean }) {
  return <div className="budget-list">{budgets.map((budget) => {
    const pct = Math.min(100, Math.round((budget.spent / budget.limit) * 100));
    return <Link href={`/budgets/${budget.id}`} className="budget-row" key={budget.id}>
      <span className={`category-dot ${categoryColor(categories, budget.category, 'expense')}`}><CategoryIcon categories={categories} name={budget.category} kind="expense" size={15}/></span>
      <span className="budget-info"><span><strong>{budget.category}</strong><small>{budget.period} · {fmt(budget.spent, currency)} of {fmt(budget.limit, currency)}</small></span><b>{pct}%</b><i className="progress-track"><em style={{ width: `${pct}%` }}/></i></span>
      {(showMobileChevron || overview) && <ChevronRight className={overview ? "overview-row-chevron" : "mobile-row-chevron"} size={17} aria-hidden="true"/>}
    </Link>;
  })}</div>;
}

// Read URL state without introducing a client-only search-params render boundary.
const listQueryEvent = 'pocket-buddy-list-query';
let queuedListQuery: { path: string; params: URLSearchParams; replace: boolean } | null = null;
function subscribeListQuery(notify: () => void) {
  window.addEventListener('popstate', notify);
  window.addEventListener(listQueryEvent, notify);
  return () => { window.removeEventListener('popstate', notify); window.removeEventListener(listQueryEvent, notify); };
}
function useListQuery() {
  const path = usePathname() || '/';
  const snapshot = useSyncExternalStore(subscribeListQuery, () => window.location.pathname + window.location.search, () => '');
  const params = new URLSearchParams(snapshot.startsWith(path + '?') ? snapshot.slice(path.length + 1) : '');
  function update(patch: Record<string, string | null>, replace = false) {
    const pending = queuedListQuery?.path === path ? queuedListQuery : { path, params: new URLSearchParams(window.location.search), replace };
    pending.replace = pending.replace && replace;
    for (const [key, value] of Object.entries(patch)) {
      if (value === null || value === '') pending.params.delete(key); else pending.params.set(key, value);
    }
    if (!Object.hasOwn(patch, 'page')) pending.params.delete('page');
    if (queuedListQuery?.path === path) return;
    queuedListQuery = pending;
    queueMicrotask(() => {
      if (queuedListQuery !== pending) return;
      queuedListQuery = null;
      if (window.location.pathname !== pending.path) return;
      const query = pending.params.toString();
      const url = pending.path + (query ? '?' + query : '');
      if (url === window.location.pathname + window.location.search) return;
      window.history[pending.replace ? 'replaceState' : 'pushState'](null, '', url);
      window.dispatchEvent(new Event(listQueryEvent));
    });
  }
  return { params, update };
}
function validListDate(value: string | null) {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value ? value : '';
}
function listPage(params: URLSearchParams) {
  const value = params.get('page') || '';
  return /^[1-9]\d*$/.test(value) && Number.isSafeInteger(Number(value)) ? Number(value) - 1 : 0;
}
function filterQueryKey(label: string) {
  return ({ 'All types': 'type', 'All periods': 'period', 'All spending': 'spending', 'All statuses': 'status', 'All frequencies': 'frequency', 'All groups': 'group' } as Record<string, string>)[label] || label.toLowerCase().replaceAll(' ', '-');
}

export default function PocketBuddyApp() {
  const pathname = usePathname() || '/';
  const router = useRouter();
  const [hasScrolled, setHasScrolled] = useState(false);
  useEffect(() => {
    const updateScrollState = () => setHasScrolled(window.scrollY > 0);
    updateScrollState();
    window.addEventListener('scroll', updateScrollState, { passive: true });
    return () => window.removeEventListener('scroll', updateScrollState);
  }, []);
  const [discardAction, setDiscardAction] = useState<(() => void) | null>(null);
  useEffect(() => {
    let restoring = false;
    let bypassPop = false;
    let atGuardEntry = Boolean(window.history.state?.__pocketBuddyGuard);
    const request = (action: () => void) => {
      if (!unsavedEditors.size) { action(); return; }
      setDiscardAction(() => action);
    };
    requestDiscard = request;
    const onDirty = () => {
      atGuardEntry = Boolean(window.history.state?.__pocketBuddyGuard);
      if (unsavedEditors.size && !atGuardEntry) {
        window.history.pushState({ ...window.history.state, __pocketBuddyGuard: true }, '', window.location.href);
        atGuardEntry = true;
      }
    };
    const onPop = (event: PopStateEvent) => {
      if (bypassPop) { bypassPop = false; atGuardEntry = Boolean(event.state?.__pocketBuddyGuard); return; }
      if (restoring) { restoring = false; atGuardEntry = true; event.stopImmediatePropagation(); return; }
      if (atGuardEntry && !event.state?.__pocketBuddyGuard) {
        event.stopImmediatePropagation();
        if (!unsavedEditors.size) {
          atGuardEntry = false;
          bypassPop = true;
          window.history.back();
          return;
        }
        restoring = true;
        window.history.forward();
        request(() => { bypassPop = true; atGuardEntry = false; window.history.go(-2); });
        return;
      }
      atGuardEntry = Boolean(event.state?.__pocketBuddyGuard);
    };
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || !unsavedEditors.size) return;
      const link = (event.target as Element | null)?.closest('a[href]') as HTMLAnchorElement | null;
      if (!link || link.target === '_blank' || link.hasAttribute('download') || link.href === window.location.href) return;
      event.preventDefault(); event.stopPropagation();
      const url = new URL(link.href);
      request(() => { if (url.origin === window.location.origin) router.push(url.pathname + url.search + url.hash); else window.location.assign(url.href); });
    };
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (unsavedEditors.size) { event.preventDefault(); event.returnValue = ''; }
    };
    window.addEventListener(unsavedChangeEvent, onDirty);
    window.addEventListener('popstate', onPop, true);
    document.addEventListener('click', onClick, true);
    window.addEventListener('beforeunload', onBeforeUnload);
    onDirty();
    return () => {
      requestDiscard = (action) => action();
      window.removeEventListener(unsavedChangeEvent, onDirty);
      window.removeEventListener('popstate', onPop, true);
      document.removeEventListener('click', onClick, true);
      window.removeEventListener('beforeunload', onBeforeUnload);
    };
  }, [router]);
  const discardDialog = <DeleteDialog opened={Boolean(discardAction)} onClose={() => setDiscardAction(null)} onConfirm={() => { const action = discardAction; setDiscardAction(null); unsavedEditors.clear(); setScanFile(''); setDrafts([]); action?.(); }} title="Discard your changes?" detail="Your unsaved changes will be lost." action="Discard changes" cancelLabel="Keep editing"/>;
  useEffect(() => { window.dispatchEvent(new Event(unsavedChangeEvent)); }, [pathname]);
  const [storedData, setData] = useState<DemoState>(seed);
  const [ready, setReady] = useState(false);
  const [notice, setNotice] = useState('');
  const [session, setSession] = useState<Session | null>(null);
  const sessionRef = useRef<Session | null>(null);
  sessionRef.current = session;
  const demoSnapshot = useRef<DemoState | null>(null);
  const [sessionReady, setSessionReady] = useState(false);
  const [accountLoading, setAccountLoading] = useState(false);
  const [dataMode, setDataMode] = useState<'demo' | 'account' | null>(null);
  const data = useMemo(() => dataMode === 'demo' ? { ...storedData, budgets: withBudgetSpending(storedData.budgets, storedData.transactions, storedData.categories, new Date()) } : storedData, [storedData, dataMode]);
  const [accountError, setAccountError] = useState('');
  const [sessionError, setSessionError] = useState('');
  const restoreSession = useCallback(async () => {
    setSessionError('');
    try { setSession(await apiRequest<Session>('/auth/me')); }
    catch (error) {
      if (error instanceof ApiError && error.status === 401) setSession(null);
      else { setSessionError('Could not check your sign-in status. Check your connection and retry.'); return; }
    }
    setSessionReady(true);
  }, []);
  useEffect(() => { void restoreSession(); }, [restoreSession]);
  async function loadAccount(current: Session) {
    const all = async (path: string) => {
      const items: ApiTransaction[] = [];
      for (let page = 1; ; page++) {
        const result = await apiRequest<{ transactions: ApiTransaction[]; total: number }>(`${path}?limit=100&page=${page}`);
        items.push(...result.transactions);
        if (items.length >= result.total || result.transactions.length === 0) return items;
      }
    };
    const today = new Date();
    const on = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    await apiRequest('/recurring/sync', { on }, current.csrfToken);
    const [settings, active, deleted, categoryResult, budgetResult, recurringResult] = await Promise.all([apiRequest<ApiSettings>('/settings'), all('/transactions'), all('/transactions/deleted'), apiRequest<{ categories: ApiCategory[] }>('/categories'), apiRequest<{ budgets: ApiBudget[] }>(`/budgets?on=${on}`), apiRequest<{ schedules: ApiRecurring[]; occurrences: ApiOccurrence[] }>('/recurring')]);
    const apiCategories = categoryResult.categories ?? [];
    const categories = apiCategories.map((c) => ({ id: c.id, name: c.name, kind: c.kind, icon: c.icon, color: c.color || 'aqua', parent: apiCategories.find((p) => p.id === c.parentId && p.kind === c.kind)?.name }));
    if (settings.currency !== 'IDR') throw new Error('This account uses a currency that the financial screens do not support yet.');
    const scheduleRows: Schedule[] = recurringResult.schedules.map((s) => ({ id: s.id, name: s.description, category: apiCategories.find((c) => c.id === s.categoryId)?.name || '', kind: s.kind, amount: s.amount, cadence: (s.frequency[0].toUpperCase() + s.frequency.slice(1)) as Schedule['cadence'], nextDate: s.nextDate, paused: s.paused }));
    const occurrences: Schedule[] = recurringResult.occurrences.map((o) => ({ id: o.id, occurrenceId: o.id, name: o.description, category: apiCategories.find((c) => c.id === o.categoryId)?.name || '', kind: o.kind, amount: o.amount, cadence: scheduleRows.find((s) => s.id === o.scheduleId)?.cadence || 'Monthly', nextDate: o.date, pending: true, merchant: o.merchant, note: o.note }));
    return { ...emptyAccount, schedules: scheduleRows, occurrences, openingBalance: settings.openingBalance, currency: settings.currency, language: settings.locale === 'id-ID' ? 'id' as const : 'en' as const, transactionEntryDefault: settings.transactionEntryDefault, categories, transactions: active.map((t) => fromApiTransaction(t, apiCategories)), deleted: deleted.map((t) => ({ ...fromApiTransaction(t, apiCategories), deletedAt: (t.deletedAt || '').slice(0, 10) })), budgets: (budgetResult.budgets ?? []).map((b) => ({ id: b.id, category: apiCategories.find((c) => c.id === b.categoryId && c.kind === 'expense')?.name || '', limit: b.amount, period: b.period === 'weekly' ? 'Weekly' as const : 'Monthly' as const, spent: b.spent })) };
  }
  async function refreshAccount(current: Session) { const account = await loadAccount(current); if (sessionRef.current?.user.id === current.user.id) setData(account); }
  useEffect(() => {
    if (!sessionReady) return;
    let cancelled = false;
    if (!session) {
      try { const saved = localStorage.getItem(STORE_KEY); const demo = saved ? { ...seed, ...JSON.parse(saved) } : seed; demoSnapshot.current = demo; setData(demo); } catch { demoSnapshot.current = seed; setData(seed); }
      setDataMode('demo'); setAccountError(''); setAccountLoading(false); return;
    }
    setDataMode(null); setData(emptyAccount); setAccountLoading(true); setAccountError('');
    loadAccount(session).then((account) => { if (!cancelled) { setData(account); setDataMode('account'); } }).catch((error) => { if (!cancelled) setAccountError(error instanceof Error && error.message.includes('currency') ? error.message : 'Could not load your account data. Reload to try again.'); }).finally(() => { if (!cancelled) setAccountLoading(false); });
    return () => { cancelled = true; };
  }, [sessionReady, session?.user.id]);
  const { params: listParams, update: updateList } = useListQuery();
  const search = listParams.get('q') || '';
  const setSearch = (value: string) => updateList({ q: value }, true);
  const kindFilter = ['income', 'expense'].includes(listParams.get('type') || '') ? listParams.get('type')! : 'all';
  const setKindFilter = (value: string) => updateList({ type: value === 'all' ? null : value });
  const categoryParameter = listParams.get('category');
  const categoryFilter = data.categories.find((c) => c.id === categoryParameter)?.id ?? data.categories.find((c) => c.name === categoryParameter)?.id ?? 'all';
  const setCategoryFilter = (value: string) => updateList({ category: value === 'all' ? null : value });
  const dateFrom = validListDate(listParams.get('from'));
  const rawDateTo = validListDate(listParams.get('to'));
  const dateTo = dateFrom && rawDateTo && rawDateTo < dateFrom ? '' : rawDateTo;
  const setDateFrom = (value: string) => updateList({ from: value });
  const setDateTo = (value: string) => updateList({ to: value });
  const [scanFile, setScanFile] = useState('');
  const [drafts, setDrafts] = useState<Transaction[]>([]);
  const [selectedMonth, setSelectedMonth] = useState(() => { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`; });
  const [balanceHighlightAvailable, setBalanceHighlightAvailable] = useState(() => !balanceHighlightHasPlayed);
  const lastPath = useRef(pathname);
  const inAppHistoryDepth = useRef(0);
  const pendingHistoryNavigation = useRef(false);
  useEffect(() => {
    const onPopState = () => { pendingHistoryNavigation.current = true; inAppHistoryDepth.current = Math.max(0, inAppHistoryDepth.current - 1); };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);
  useEffect(() => {
    if (lastPath.current !== pathname) {
      if (!pendingHistoryNavigation.current) inAppHistoryDepth.current += 1;
      lastPath.current = pathname;
    }
    pendingHistoryNavigation.current = false;
  }, [pathname]);
  function goBack(fallback: string) {
    const navigation = (window as Window & { navigation?: { currentEntry?: { index: number }; entries: () => { url?: string }[] } }).navigation;
    const previous = navigation?.entries()[(navigation.currentEntry?.index ?? 0) - (window.history.state?.__pocketBuddyGuard ? 2 : 1)]?.url;
    const hasSameOriginPrevious = previous ? new URL(previous, window.location.href).origin === window.location.origin : false;
    requestDiscard(() => { if (hasSameOriginPrevious || (!navigation && inAppHistoryDepth.current > 0)) router.back(); else router.push(fallback); });
  }

  useEffect(() => { setReady(sessionReady && !accountLoading && !accountError); }, [sessionReady, accountLoading, accountError]);
  useEffect(() => { if (ready && sessionReady && !session && dataMode === 'demo' && storedData !== demoSnapshot.current) { localStorage.setItem(STORE_KEY, JSON.stringify(storedData)); demoSnapshot.current = storedData; } }, [storedData, ready, sessionReady, session, dataMode]);
  useEffect(() => { if (!notice) return; const timer = window.setTimeout(() => setNotice(''), 2800); return () => window.clearTimeout(timer); }, [notice]);
  useEffect(() => { if (pathname === '/transactions/scan') router.replace('/transactions/new'); }, [pathname, router]);

  const currentMonth = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
  const monthTransactions = data.transactions.filter((t) => t.date.startsWith(selectedMonth));
  const throughMonthTransactions = data.transactions.filter((t) => t.date <= `${selectedMonth}-31`);
  const incomeTotal = monthTransactions.filter((t) => t.kind === 'income').reduce((sum, t) => sum + t.amount, 0);
  const expenseTotal = monthTransactions.filter((t) => t.kind === 'expense').reduce((sum, t) => sum + t.amount, 0);
  const cash = data.openingBalance + throughMonthTransactions.reduce((sum, t) => sum + (t.kind === 'income' ? t.amount : -t.amount), 0);
  const parts = pathname.split('/').filter(Boolean);
  const authPage = ['/sign-in', '/sign-up', '/verify-email', '/forgot-password', '/reset-password'].includes(pathname);
  const skipOccurrence = (id: string) => { if (session) { void apiRequest(`/recurring/occurrences/${id}/skip`, {}, session.csrfToken).then(() => refreshAccount(session)).then(() => setNotice('Occurrence skipped')).catch(() => setNotice('Could not skip occurrence')); return; } setData((old) => ({ ...old, schedules: old.schedules.map((s) => s.id === id ? { ...s, pending: false } : s) })); setNotice('Occurrence skipped'); };
  const confirmOccurrence = async (item: Schedule) => {
    if (session) { const categoryId = data.categories.find((c) => c.kind === item.kind && c.name === item.category)?.id || null; await apiRequest(`/recurring/occurrences/${item.id}/confirm`, { description: item.name, categoryId, kind: item.kind, amount: item.amount, date: item.nextDate, merchant: item.merchant || '', note: item.note || '' }, session.csrfToken); try { await refreshAccount(session); } catch { setAccountError('Your transaction was saved, but your account could not be refreshed. Reload to continue.'); return; } setNotice('Occurrence added to transactions'); return; }
    const id = `t${Date.now()}-${item.id}`;
    setData((old) => {
      const pending = old.schedules.find((schedule) => schedule.id === item.id && schedule.pending && !schedule.paused);
      if (!pending) return old;
      return { ...old, transactions: [{ id, name: item.name, category: item.category, kind: item.kind, amount: item.amount, date: item.nextDate }, ...old.transactions], schedules: old.schedules.map((schedule) => schedule.id === pending.id ? { ...schedule, pending: false } : schedule) };
    });
    setNotice('Occurrence added to transactions');
  };
  const pageTitle = getTitle(pathname);

  if (pathname === '/transactions/scan') return null;

  async function addTransaction(tx: Omit<Transaction, 'id'>, id?: string) {
    if (session) {
      try { const selectedCategory = tx.category ? data.categories.find((c) => c.kind === tx.kind && c.name === tx.category) : undefined; if (tx.category && !selectedCategory) throw new Error('Category is no longer available'); await apiRequest(id ? `/transactions/${id}` : '/transactions', { description: tx.name, kind: tx.kind, amount: tx.amount, date: tx.date, categoryId: selectedCategory?.id ?? null, merchant: tx.merchant || '', note: tx.note || '' }, session.csrfToken, id ? 'PUT' : 'POST'); try { await refreshAccount(session); } catch { setAccountError('Your transaction was saved, but your account could not be refreshed. Reload to continue.'); return; } setNotice(id ? 'Transaction updated' : 'Transaction saved'); router.push('/transactions'); } catch (error) { setNotice(error instanceof Error ? error.message : 'Could not save transaction'); }
      return;
    }
    setData((old) => ({ ...old, transactions: id ? old.transactions.map((t) => t.id === id ? { ...tx, id } : t) : [{ ...tx, id: `t${Date.now()}` }, ...old.transactions] }));
    setNotice(id ? 'Transaction updated' : 'Transaction saved');
    router.push('/transactions');
  }
  async function addTransactions(items: Omit<Transaction, 'id'>[]) {
    if (!items.length) return;
    if (session) {
      const transactions = items.map((tx) => {
        const category = tx.category ? data.categories.find((candidate) => candidate.kind === tx.kind && candidate.name === tx.category) : undefined;
        if (tx.category && !category) throw new Error('A selected category is no longer available');
        return { description: tx.name, kind: tx.kind, amount: tx.amount, date: tx.date, categoryId: category?.id ?? null, merchant: tx.merchant || '', note: tx.note || '' };
      });
      await apiRequest('/transactions/batch', { transactions }, session.csrfToken);
      setNotice(`${items.length} ${items.length === 1 ? 'transaction' : 'transactions'} saved`);
      router.push('/transactions');
      try { await refreshAccount(session); } catch { setAccountError('Your transactions were saved, but your account could not be refreshed. Reload to continue.'); }
      return;
    }
    const createdAt = Date.now();
    setData((old) => ({ ...old, transactions: [...items.map((tx, index) => ({ ...tx, id: `t${createdAt}-${index}` })), ...old.transactions] }));
    setNotice(`${items.length} ${items.length === 1 ? 'transaction' : 'transactions'} saved`);
    router.push('/transactions');
  }
  async function removeTransaction(tx: Transaction) {
    if (session) { try { await apiRequest(`/transactions/${tx.id}`, {}, session.csrfToken, 'DELETE'); await refreshAccount(session); setNotice('Moved to Recently deleted'); if (pathname === `/transactions/${tx.id}`) router.push('/transactions'); } catch { setNotice('Could not delete transaction'); } return; }
    setData((old) => ({ ...old, transactions: old.transactions.filter((item) => item.id !== tx.id), deleted: [{ ...tx, deletedAt: new Date().toISOString().slice(0, 10) }, ...old.deleted] }));
    setNotice('Moved to Recently deleted');
    if (pathname === `/transactions/${tx.id}`) router.push('/transactions');
  }
  const removeCategory = async (id: string) => { if (session) { try { await apiRequest(`/categories/${id}`, {}, session.csrfToken, 'DELETE'); try { await refreshAccount(session); } catch { setAccountError('Your category was deleted, but your account could not be refreshed. Reload to continue.'); return; } setNotice('Category removed'); if (pathname === `/categories/${id}`) router.push('/categories'); } catch (error) { setNotice(error instanceof Error ? error.message : 'Could not delete category'); } return; } setData((old) => { const deleted = old.categories.find((c) => c.id === id); if (!deleted || (deleted.kind === 'expense' && old.budgets.some((b) => b.category === deleted.name))) return old; return { ...old, categories: old.categories.filter((c) => c.id !== id).map((c) => c.kind === deleted.kind && c.parent === deleted.name ? { ...c, parent: undefined } : c), transactions: old.transactions.map((t) => t.kind === deleted.kind && t.category === deleted.name ? { ...t, category: '' } : t), deleted: old.deleted.map((t) => t.kind === deleted.kind && t.category === deleted.name ? { ...t, category: '' } : t), schedules: old.schedules.map((t) => t.kind === deleted.kind && t.category === deleted.name ? { ...t, category: '' } : t) }; }); setNotice('Category removed'); };
  async function addBudget(budget: Omit<Budget, 'id' | 'spent'>) {
    if (session) {
      const category = data.categories.find((c) => c.kind === 'expense' && c.name === budget.category);
      if (!category) throw new Error('Choose an available expense category.');
      await apiRequest('/budgets', { categoryId: category.id, amount: budget.limit, period: budget.period.toLowerCase() }, session.csrfToken);
      try { await refreshAccount(session); } catch { setAccountError('Your budget was saved, but your account could not be refreshed. Reload to continue.'); return; }
      setNotice('Budget created'); router.push('/budgets'); return;
    }
    setData((old) => ({ ...old, budgets: [...old.budgets, { ...budget, id: `b${Date.now()}`, spent: 0 }] }));
    setNotice('Budget created'); router.push('/budgets');
  }
  async function updateBudget(budget: Budget, updates: Omit<Budget, 'id' | 'spent'>) {
    if (session) {
      const category = data.categories.find((c) => c.kind === 'expense' && c.name === updates.category);
      if (!category) throw new Error('This budget category is no longer available.');
      await apiRequest(`/budgets/${budget.id}`, { categoryId: category.id, amount: updates.limit, period: updates.period.toLowerCase() }, session.csrfToken, 'PUT');
      try { await refreshAccount(session); } catch { setAccountError('Your budget was saved, but your account could not be refreshed. Reload to continue.'); return; }
    } else setData((old) => ({ ...old, budgets: old.budgets.map((b) => b.id === budget.id ? { ...b, ...updates } : b) }));
    setNotice('Budget saved');
  }
  async function removeBudget(id: string) {
    if (session) {
      await apiRequest(`/budgets/${id}`, {}, session.csrfToken, 'DELETE');
      try { await refreshAccount(session); } catch { setAccountError('Your budget was removed, but your account could not be refreshed. Reload to continue.'); return; }
    } else setData((old) => ({ ...old, budgets: old.budgets.filter((b) => b.id !== id) }));
    setNotice('Budget removed');
    if (pathname === `/budgets/${id}`) router.push('/budgets');
  }
  function schedulePayload(schedule: Omit<Schedule, 'id'>) { const now = new Date(); const on = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`; return { on, description: schedule.name, categoryId: data.categories.find((c) => c.kind === schedule.kind && c.name === schedule.category)?.id || null, kind: schedule.kind, amount: schedule.amount, frequency: schedule.cadence.toLowerCase(), nextDate: schedule.nextDate, paused: !!schedule.paused }; }
  function saveSchedule(id: string, updates: Partial<Schedule>) { const schedule = data.schedules.find((s) => s.id === id); if (!schedule) return; if (session) { void apiRequest(`/recurring/${id}`, schedulePayload({ ...schedule, ...updates }), session.csrfToken, 'PUT').then(() => refreshAccount(session)).then(() => setNotice('Schedule saved')).catch((error) => setNotice(error instanceof Error ? error.message : 'Could not save schedule')); return; } setData((old) => ({ ...old, schedules: old.schedules.map((s) => s.id === id ? { ...s, ...updates } : s) })); setNotice('Schedule saved'); }
  function deleteSchedule(id: string) { if (session) { void apiRequest(`/recurring/${id}`, {}, session.csrfToken, 'DELETE').then(() => refreshAccount(session)).then(() => { setNotice('Schedule deleted'); if (pathname === `/recurring/${id}`) router.push('/recurring'); }).catch(() => setNotice('Could not delete schedule')); return; } setData((old) => ({ ...old, schedules: old.schedules.filter((s) => s.id !== id) })); setNotice('Schedule deleted'); if (pathname === `/recurring/${id}`) router.push('/recurring'); }
  async function addSchedule(schedule: Omit<Schedule, 'id'>) {
    if (session) { await apiRequest('/recurring', schedulePayload(schedule), session.csrfToken); try { await refreshAccount(session); } catch { setAccountError('Your schedule was saved, but your account could not be refreshed. Reload to continue.'); return; } setNotice('Schedule created'); router.push('/recurring'); return; }
    setData((old) => ({ ...old, schedules: [...old.schedules, { ...schedule, id: `r${Date.now()}` }] }));
    setNotice('Schedule created'); router.push('/recurring');
  }
  async function addCategory(name: string, kind: Kind, parent: string, icon: string, color: string) {
    if (!name.trim()) return;
    if (session) { const parentId = parent ? data.categories.find((c) => c.kind === kind && c.name === parent)?.id : null; if (parent && !parentId) throw new Error('Parent category is no longer available'); await apiRequest('/categories', { name, kind, parentId, icon, color }, session.csrfToken); try { await refreshAccount(session); } catch { setAccountError('Your category was saved, but your account could not be refreshed. Reload to continue.'); return; } setNotice('Category added'); router.push('/categories'); return; }
    setData((old) => ({ ...old, categories: [...old.categories, { id: `c${Date.now()}`, name: name.trim(), kind, icon, color, ...(parent ? { parent } : {}) }] }));
    setNotice('Category added'); router.push('/categories');
  }
  async function updateCategory(id: string, name: string, kind: Kind, parent: string, icon: string, color: string) {
    if (session) { const parentId = parent ? data.categories.find((c) => c.kind === kind && c.name === parent)?.id : null; if (parent && !parentId) throw new Error('Parent category is no longer available'); await apiRequest(`/categories/${id}`, { name, kind, parentId, icon, color }, session.csrfToken, 'PUT'); try { await refreshAccount(session); } catch { setAccountError('Your category was saved, but your account could not be refreshed. Reload to continue.'); return; } setNotice('Category updated'); router.push('/categories'); return; }
    setData((old) => {
      const original = old.categories.find((c) => c.id === id);
      if (!original) return old;
      const updatedName = name.trim();
      return { ...old,
        categories: old.categories.map((c) => c.id === id ? { ...c, name: updatedName, kind, icon, color, parent: parent || undefined } : c.kind === original.kind && c.parent === original.name ? { ...c, parent: updatedName } : c),
        transactions: old.transactions.map((t) => t.kind === original.kind && t.category === original.name ? { ...t, category: updatedName } : t),
        deleted: old.deleted.map((t) => t.kind === original.kind && t.category === original.name ? { ...t, category: updatedName } : t),
        schedules: old.schedules.map((t) => t.kind === original.kind && t.category === original.name ? { ...t, category: updatedName } : t),
        budgets: original.kind === 'expense' ? old.budgets.map((b) => b.category === original.name ? { ...b, category: updatedName } : b) : old.budgets,
      };
    });
    setNotice('Category updated'); router.push('/categories');
  }
  function exportCSV(ordered?: Transaction[]) {
    const rows = [['Date', 'Name', 'Kind', 'Category', 'Amount', 'Note'], ...(ordered || filteredTransactions).map((t) => [t.date, t.name, t.kind, t.category, String(t.amount), t.note ?? ''])];
    const csv = rows.map((row) => row.map((cell) => { const safe = /^[\s]*[=+@-]/.test(cell) ? `'${cell}` : cell; return `"${safe.replaceAll('"', '""')}"`; }).join(',')).join('\n');
    const link = document.createElement('a'); link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); link.download = 'pocket-buddy-transactions.csv'; link.click(); URL.revokeObjectURL(link.href); setNotice('CSV downloaded');
  }

  const filteredTransactions = useMemo(() => data.transactions.filter((tx) => {
    const matchesSearch = `${tx.name} ${tx.category} ${tx.merchant ?? ''} ${tx.note ?? ''}`.toLowerCase().includes(search.toLowerCase());
    return matchesSearch && (kindFilter === 'all' || tx.kind === kindFilter) && (categoryFilter === 'all' || data.categories.some((c) => c.id === categoryFilter && c.name === tx.category && c.kind === tx.kind)) && (!dateFrom || tx.date >= dateFrom) && (!dateTo || tx.date <= dateTo);
  }), [data.transactions, data.categories, search, kindFilter, categoryFilter, dateFrom, dateTo]);

  async function signOut() {
    if (!session) { router.replace('/sign-in'); return; }
    try {
      await apiRequest('/auth/logout', {}, session.csrfToken);
      setSession(null);
      setNotice('Signed out');
      router.replace('/sign-in');
    } catch { setNotice('Could not sign out. Try again.'); }
  }

  if (authPage) return <div className="auth-screen"><Link className="wordmark" href="/"><BrandMark/>pocket buddy</Link><AuthContent key={pathname} path={pathname} go={router.push} goBack={goBack} notify={setNotice} setSession={setSession}/>{notice && <div className="toast">{notice}</div>}{discardDialog}</div>;

  if (sessionError) return <div className="auth-screen"><Card><p role="alert">{sessionError}</p><Button onClick={() => void restoreSession()}>Retry</Button></Card></div>;
  if (!sessionReady || (session && (accountLoading || (!accountError && dataMode !== 'account'))) || (!session && dataMode !== 'demo')) return <div className="auth-screen">Loading your account…</div>;
  if (session && accountError) return <div className="auth-screen"><Card><p role="alert">{accountError}</p><Button onClick={signOut}>Sign out</Button>{notice && <p role="alert">{notice}</p>}</Card></div>;
  const navItem = nav.find((item) => item.href === pathname || (item.href !== '/' && pathname.startsWith(item.href)));
  return <div className="app-frame">{discardDialog}
    <aside className="app-sidebar">
      <Link className="wordmark" href="/"><BrandMark/>pocket buddy</Link>
      <nav aria-label="Main navigation">{nav.map(({ href, label, icon: Icon }) => <Link key={href} href={href} className={navItem?.href === href ? 'active' : ''}><Icon size={17}/><span>{label}</span></Link>)}</nav>
      <Link className="sidebar-profile" href="/settings/account" aria-label="Demo account, account and security"><span className="profile-bubble">D</span><span><strong>{session ? session.user.email : 'Demo account'}</strong><small>{session ? 'Signed in' : 'Sample data'}</small></span><ChevronRight size={19} aria-hidden="true"/></Link>
    </aside>
    <div className="app-workspace">
      <header className={`mobile-account-bar${hasScrolled ? ' is-scrolled' : ''}`}><Link className="wordmark" href="/"><BrandMark/>pocket buddy</Link><MobileAccountMenu session={session}/></header>
      <main className={`app-content${pathname === '/transactions' ? ' transactions-content' : ''}${['/transactions', '/transactions/recently-deleted', '/categories', '/budgets', '/recurring', '/recurring/review'].includes(pathname) ? ' list-page' : ''}`}>
        <div className="page-heading"><div><div className="page-title-row">{['transactions', 'budgets', 'recurring', 'categories'].includes(parts[0]) && parts[1] && !parts[2] && !['new', 'scan'].includes(parts[1]) && <button type="button" className="icon-button page-back" aria-label="Go back" onClick={() => goBack(`/${parts[0]}`)}><ArrowLeft size={19}/></button>}<h1>{pageTitle}</h1><PageHint path={pathname}/></div></div>{pageAction(pathname)}</div>
        {pathname === '/' && <Dashboard data={data} cash={cash} income={incomeTotal} expenses={expenseTotal} month={selectedMonth} maxMonth={currentMonth} onMonthChange={setSelectedMonth} transactions={monthTransactions} animateBalance={balanceHighlightAvailable} onBalanceHighlightConsumed={() => { balanceHighlightHasPlayed = true; setBalanceHighlightAvailable(false); }} onConfirm={confirmOccurrence} onSkip={skipOccurrence} />}
        {pathname === '/transactions' && <TransactionsPage items={filteredTransactions} all={data.transactions} currency={data.currency} search={search} setSearch={setSearch} kindFilter={kindFilter} setKindFilter={setKindFilter} categoryFilter={categoryFilter} setCategoryFilter={setCategoryFilter} dateFrom={dateFrom} setDateFrom={setDateFrom} dateTo={dateTo} setDateTo={setDateTo} categories={data.categories} onDelete={removeTransaction} onExport={exportCSV}/ >}
        {pathname === '/transactions/new' && ready && <TransactionEntryPage defaultMode={data.transactionEntryDefault ?? 'scan'} categories={data.categories} currency={data.currency} onSave={addTransaction} onCommit={addTransactions} fileName={scanFile} setFileName={setScanFile} drafts={drafts} setDrafts={setDrafts} onDone={() => { setDrafts([]); setScanFile(''); }} extractImage={session ? async (file) => {
          const result = await apiUpload<{ drafts: Array<{ description: string; kind: Kind; amount: number; date: string; merchant: string; note: string; category: string; uncertainFields: string[] }> }>('/transactions/extract', file, session.csrfToken);
          return result.drafts.map((draft, index) => ({ id: `extract-${Date.now()}-${index}`, name: draft.description, kind: draft.kind, amount: draft.amount, date: draft.date, merchant: draft.merchant, note: draft.note, category: data.categories.some((category) => category.name === draft.category && category.kind === draft.kind) ? draft.category : '', uncertainFields: draft.uncertainFields || [] }));
        } : undefined} />}
        {parts[0] === 'transactions' && parts[1] && !parts[2] && parts[1] !== 'new' && parts[1] !== 'scan' && parts[1] !== 'recently-deleted' && (ready && (data.transactions.some((tx) => tx.id === parts[1]) ? <TransactionForm key={parts[1]} currency={data.currency} categories={data.categories} onSave={addTransaction} original={data.transactions.find((tx) => tx.id === parts[1])} onDelete={removeTransaction}/> : <Card><Empty title="Transaction not found" detail="It may have been deleted or the link may be out of date." action={<Button onClick={() => goBack('/transactions')}>Back</Button>}/></Card>))}
        {pathname === '/transactions/recently-deleted' && <RecentlyDeleted categories={data.categories} goBack={goBack} items={data.deleted} currency={data.currency} restore={async (id) => { if (session) { try { await apiRequest(`/transactions/${id}/restore`, {}, session.csrfToken); await refreshAccount(session); setNotice('Transaction restored'); } catch { setNotice('Could not restore transaction'); } return; } const item = data.deleted.find((tx) => tx.id === id); if (item) { const { deletedAt: _deletedAt, ...tx } = item; setData((old) => ({ ...old, deleted: old.deleted.filter((entry) => entry.id !== id), transactions: [tx, ...old.transactions] })); setNotice('Transaction restored'); } }}/ >}
        {pathname === '/budgets' && <BudgetsPage categories={data.categories} budgets={data.budgets} currency={data.currency} onDelete={removeBudget}/ >}
        {pathname === '/budgets/new' && <BudgetForm categories={data.categories.filter((c) => c.kind === 'expense')} budgets={data.budgets} currency={data.currency} onSave={addBudget}/>}
        {parts[0] === 'budgets' && parts[1] && parts[1] !== 'new' && <BudgetDetails goBack={goBack} budget={data.budgets.find((b) => b.id === parts[1])} budgets={data.budgets} categories={data.categories.filter((c) => c.kind === 'expense')} currency={data.currency} onSave={(updates) => { const budget = data.budgets.find((b) => b.id === parts[1]); if (budget) return updateBudget(budget, updates); return Promise.reject(new Error('Budget not found.')); }} onDelete={() => removeBudget(parts[1])}/ >}
        {pathname === '/recurring' && <RecurringPage categories={data.categories} schedules={data.schedules} pendingItems={data.occurrences} currency={data.currency} onDelete={deleteSchedule} onToggle={(id) => { const schedule = data.schedules.find((s) => s.id === id); if (schedule) saveSchedule(id, { paused: !schedule.paused }); }} onSkip={skipOccurrence} onConfirm={confirmOccurrence}/ >}
        {pathname === '/recurring/review' && <RecurringReviewPage schedules={data.occurrences ?? data.schedules} categories={data.categories} currency={data.currency} onSkip={skipOccurrence} onConfirm={confirmOccurrence}/>}
        {pathname === '/recurring/new' && <ScheduleForm categories={data.categories} currency={data.currency} onSave={addSchedule}/>}
        {parts[0] === 'recurring' && parts[1] && parts[1] !== 'new' && parts[1] !== 'review' && <ScheduleDetails categories={data.categories} currency={data.currency} goBack={goBack} schedule={data.schedules.find((s) => s.id === parts[1])} onDelete={() => deleteSchedule(parts[1])} onSave={(updates) => saveSchedule(parts[1], updates)}/ >}
        {pathname === '/categories' && <CategoriesPage categories={data.categories} budgets={data.budgets} transactions={data.transactions} deletedTransactions={data.deleted} schedules={data.schedules} remove={removeCategory}/ >}
        {pathname === '/categories/new' && <CategoryForm categories={data.categories} add={addCategory}/>}
        {parts[0] === 'categories' && parts[1] && parts[1] !== 'new' && !parts[2] && ready && (data.categories.find((c) => c.id === parts[1]) ? <CategoryForm key={parts[1]} categories={data.categories} editing={data.categories.find((c) => c.id === parts[1])} deleteContext={{ budgets: data.budgets, transactions: data.transactions, deletedTransactions: data.deleted, schedules: data.schedules, remove: (id) => { void removeCategory(id); if (!session) router.push('/categories'); } }} add={(name, kind, parent, icon, color) => updateCategory(parts[1], name, kind, parent, icon, color)}/> : <Card><Empty title="Category not found" detail="It may have been removed." action={<Button onClick={() => goBack('/categories')}>Back</Button>}/></Card>)}
        {pathname === '/settings' && <SettingsPage data={data} account={Boolean(session)} save={async (updates) => { if (session) { const next = { ...data, ...updates }; try { await apiRequest('/settings', { currency: next.currency, locale: next.language === 'id' ? 'id-ID' : 'en', openingBalance: next.openingBalance, transactionEntryDefault: next.transactionEntryDefault ?? 'manual' }, session.csrfToken, 'PUT'); if (sessionRef.current?.user.id === session.user.id) setData(next); setNotice('Settings saved'); } catch { setNotice('Could not save settings'); } return; } setData((old) => ({ ...old, ...updates })); setNotice('Settings saved'); }}/ >}
        {pathname === '/settings/account' && <AccountSettings session={session} onSignOut={signOut} onDelete={async (password) => { if (!session) return; await apiRequest('/auth/account', { password }, session.csrfToken, 'DELETE'); setSession(null); setNotice('Account deleted'); router.push('/sign-in'); }}/>}
        {!['/', '/transactions', '/transactions/new', '/transactions/recently-deleted', '/budgets', '/budgets/new', '/recurring', '/recurring/new', '/categories', '/categories/new', '/settings', '/settings/account'].includes(pathname) && !(parts[0] === 'transactions' && parts[1] && !parts[2]) && !(parts[0] === 'budgets' && parts[1]) && !(parts[0] === 'recurring' && parts[1]) && !(parts[0] === 'categories' && parts[1] && !parts[2]) && <Card><Empty title="That page is still on the map" detail="Head back to your overview." action={<Button href="/" variant="primary">Go to overview</Button>}/></Card>}
      </main>
    </div>
    <nav className="mobile-nav" aria-label="Mobile navigation">{nav.slice(0, 5).map(({ href, label, icon: Icon }) => <Link key={href} href={href} className={navItem?.href === href ? 'active' : ''}><Icon size={19}/><span>{label}</span></Link>)}</nav>
    {notice && <div className="toast" role="status"><Check size={16}/>{notice}<button onClick={() => setNotice('')} aria-label="Dismiss"><X size={14}/></button></div>}
  </div>;
}

function PageHint({ path }: { path: string }) {
  const [open, setOpen] = useState(false);
  const hint = path === '/recurring'
    ? 'A schedule creates a pending occurrence for you to review. It never changes your totals until you confirm it.'
    : path === '/budgets'
      ? 'Budgets guide spending; they don’t change your available cash. Parent and child category budgets are tracked separately.'
      : null;
  if (!hint) return null;
  return <><button className="scan-help-trigger page-title-hint" type="button" aria-label={`More about ${path === '/recurring' ? 'recurring schedules' : 'budgets'}`} onClick={() => setOpen(true)}><CircleHelp size={18}/></button><Modal.Root opened={open} onClose={() => setOpen(false)} unstyled><Modal.Overlay className="radix-dialog-overlay"/><Modal.Content classNames={{ content: "scan-help-dialog page-hint-dialog" }} transitionProps={{ transition: "fade" }}><div className="scan-help-heading"><Modal.Title className="dialog-title">{path === '/recurring' ? 'How recurring works' : 'About budgets'}</Modal.Title><button className="icon-button" type="button" aria-label="Close hint" autoFocus onClick={() => setOpen(false)}><X size={17}/></button></div><p className="page-hint-copy">{hint}</p></Modal.Content></Modal.Root></>;
}

function BrandMark() { return <span className="brand-mark" aria-hidden="true"><svg viewBox="0 0 64 64"><path fill="#a994f5" d="M9 17c0-3 2-5 5-5h36c3 0 5 2 5 5v31c0 3-2 5-5 5H14c-3 0-5-2-5-5z"/><path fill="#9078dc" d="M35 12h15c3 0 5 2 5 5v31c0 3-2 5-5 5H35z"/><path fill="#c4b2ff" d="M14 12h1v41h-1c-3 0-5-2-5-5V17c0-3 2-5 5-5z"/><path fill="#c7f478" d="M31 12h4v41h-4z"/><path fill="#80dfd0" d="M42 27h13c3 0 5 2 5 5v5c0 3-2 5-5 5H42z"/><circle cx="50" cy="34" r="2.4" fill="#31443a"/></svg></span>; }
function pageAction(path: string) {
  const actions: Record<string, ReactNode> = {
    '/': <Button href="/transactions/new" variant="primary"><Plus size={17}/>Add transaction</Button>,
    '/transactions': <Button href="/transactions/new" variant="primary"><Plus size={17}/>Add transaction</Button>,
    '/budgets': <Button href="/budgets/new" variant="primary"><Plus size={17}/>New budget</Button>,
    '/recurring': <Button href="/recurring/new" variant="primary"><Plus size={17}/>New schedule</Button>,
    '/categories': <Button href="/categories/new" variant="primary"><Plus size={17}/>Add category</Button>,
  };
  return actions[path] ?? null;
}

function Dashboard({ data, cash, income, expenses, month, maxMonth, onMonthChange, transactions, animateBalance, onBalanceHighlightConsumed, onConfirm, onSkip }: { data: DemoState; cash: number; income: number; expenses: number; month: string; maxMonth: string; onMonthChange: (month: string) => void; transactions: Transaction[]; animateBalance: boolean; onBalanceHighlightConsumed: () => void; onConfirm: (item: Schedule) => void; onSkip: (id: string) => void }) {
  const [runInitialHighlight] = useState(animateBalance && cash !== 0);
  useEffect(() => { if (animateBalance) onBalanceHighlightConsumed(); }, [animateBalance, onBalanceHighlightConsumed]);
  const pending = pendingSchedules(data.occurrences ?? data.schedules);
  const previewBudgets = [...data.budgets].sort((a, b) => b.spent / b.limit - a.spent / a.limit).slice(0, 3);
  const monthDate = new Date(`${month}-01T12:00:00`);
  const monthLabel = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(monthDate);
  function shiftMonth(offset: number) {
    const next = new Date(monthDate.getFullYear(), monthDate.getMonth() + offset, 1);
    const value = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`;
    if (value <= maxMonth) onMonthChange(value);
  }
  return <>
    <section className="hero-balance">
      <div className="hero-copy"><span className="balance-label"><Wallet size={15}/> AVAILABLE CASH</span><strong className="balance-highlight" data-animate={runInitialHighlight}><span>{fmt(cash, data.currency)}</span><span className="highlight-text" aria-hidden="true">{fmt(cash, data.currency)}</span></strong><span className="balance-caption">Your balance at the end of <span className="month-control" aria-label="Dashboard month"><button type="button" aria-label="Previous month" onClick={() => shiftMonth(-1)}><ChevronLeft size={15}/></button><DatePicker compact mode="month" ariaLabel="Choose dashboard month" value={month} maxValue={maxMonth} onChange={onMonthChange}/><button type="button" aria-label="Next month" disabled={month >= maxMonth} onClick={() => shiftMonth(1)}><ChevronRight size={15}/></button></span></span></div>
      <div className="hero-orbit" aria-hidden="true"><i/><b>✳</b><span>✦</span></div>
      <div className="hero-stats"><div><span><ArrowDownLeft size={14}/>Income this month</span><strong className="income-text">{fmt(income, data.currency)}</strong></div><div><span><ArrowUpRight size={14}/>Spent this month</span><strong>{fmt(expenses, data.currency)}</strong></div></div>
    </section>
    <div className="dashboard-grid"><Card className="recent-card"><div className="card-heading"><div><span className="section-kicker">{monthLabel.toUpperCase()}</span><h2>Transactions</h2></div><Button href="/transactions" variant="quiet">View all</Button></div>{transactions.length ? <TransactionRows categories={data.categories} items={transactions.slice(0, 5)} currency={data.currency} overview/> : <Empty title="No transactions this month" detail="Try another month or add a transaction." action={<Button href="/transactions/new" variant="primary">Add transaction</Button>}/>}</Card>
      <div className="dashboard-side"><Card className="monthly-card"><div className="card-heading"><div><span className="section-kicker">A GENTLE NUDGE</span><h2>Budget check-in <span className="sparkle">✳</span></h2></div><Button href="/budgets" variant="quiet">View all</Button></div>{data.budgets.length ? <BudgetRows categories={data.categories} budgets={previewBudgets} currency={data.currency} overview/> : <Empty title="No budgets yet" detail="Set a limit that feels comfortable." action={<Button href="/budgets/new" variant="primary">Create budget</Button>}/>}</Card>
      {pending.length ? <Card className="cashflow-card overview-recurring"><div className="cashflow-top"><span className="cashflow-icon"><Repeat2 size={17}/></span><span className="section-kicker">PENDING REVIEW · {pending.length}</span>{pending.length > 1 && <Button href="/recurring/review" variant="quiet">View all</Button>}</div><h3>{pending[0].name} <strong>{fmt(pending[0].amount, data.currency)}</strong></h3><p>{pending[0].kind === 'income' ? 'Income' : 'Expense'} · {pending[0].category || 'Uncategorized'} · {prettyDate(pending[0].nextDate)}</p><div className="overview-recurring-actions"><Button onClick={() => onSkip(pending[0].id)}>Skip</Button><Button variant="primary" href="/recurring/review">Review</Button></div></Card> : <Card className="cashflow-card"><div className="cashflow-top"><span className="cashflow-icon"><BarChart3 size={17}/></span><span className="section-kicker">THIS MONTH</span></div><h3>You’re keeping <strong>{fmt(income - expenses, data.currency)}</strong></h3><p>That’s your income after this month’s spending.</p><div className="cashflow-line"><i style={{ width: `${Math.max(8, Math.min(100, Math.round((Math.max(0, income - expenses) / Math.max(1, income)) * 100)))}%` }}/></div></Card>}</div>
    </div>
  </>;
}

function TransactionsPage({ items, all, currency, search, setSearch, kindFilter, setKindFilter, categoryFilter, setCategoryFilter, dateFrom, setDateFrom, dateTo, setDateTo, categories, onDelete, onExport }: { items: Transaction[]; all: Transaction[]; currency: string; search: string; setSearch: (v: string) => void; kindFilter: string; setKindFilter: (v: string) => void; categoryFilter: string; setCategoryFilter: (v: string) => void; dateFrom: string; setDateFrom: (v: string) => void; dateTo: string; setDateTo: (v: string) => void; categories: Category[]; onDelete: (t: Transaction) => void; onExport: (ordered?: Transaction[]) => void }) {
  const [deleting, setDeleting] = useState<Transaction | null>(null);
  const { params, update } = useListQuery();
  const page = listPage(params);
  const setPage = (value: number) => update({ page: value ? String(value + 1) : null });
  const sort = transactionSorts.some((option) => option.value === params.get('sort')) ? params.get('sort')! : transactionSorts[0].value;
  const setSort = (value: string) => update({ sort: value === transactionSorts[0].value ? null : value });
  const [draftSort, setDraftSort] = useState(sort);
  const ordered = [...items].sort((transactionSorts.find((option) => option.value === sort) || transactionSorts[0]).compare);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [draft, setDraft] = useState({ kind: kindFilter, category: categoryFilter, from: dateFrom, to: dateTo });
  const activeFilters = [kindFilter !== 'all', categoryFilter !== 'all', !!dateFrom, !!dateTo].filter(Boolean).length;
  const reset = () => { setSearch(''); setKindFilter('all'); setCategoryFilter('all'); setDateFrom(''); setDateTo(''); setSort(transactionSorts[0].value); };


  const currentPage = Math.min(page, Math.max(0, Math.ceil(items.length / 25) - 1));
  const total = items.reduce((sum, t) => t.kind === 'income' ? sum + t.amount : sum - t.amount, 0);
  return <>
    <div className="summary-strip"><div><span>Showing</span><strong>{items.length} {items.length === 1 ? 'transaction' : 'transactions'}</strong></div><div><span>Net total</span><strong className={total >= 0 ? 'income-text' : ''}>{total < 0 ? '−' : '+'}{fmt(Math.abs(total), currency)}</strong></div><div><span>All time</span><strong>{all.length} entries</strong></div></div>
    <Card className="ledger-card transactions-ledger"><div className="filter-bar transaction-toolbar"><label className="search-box"><Search size={17}/><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search transactions" aria-label="Search transactions"/>{search && <button onClick={() => setSearch('')} aria-label="Clear search"><X size={14}/></button>}</label><div className="transaction-inline-filters"><div className="transaction-select-field"><SelectInput value={kindFilter} onChange={setKindFilter} ariaLabel="Filter by type" options={[{ value: 'all', label: 'All types' }, { value: 'income', label: 'Income' }, { value: 'expense', label: 'Expenses' }]}/></div><div className="transaction-select-field"><SelectInput value={categoryFilter} onChange={setCategoryFilter} ariaLabel="Filter by category" options={[{ value: 'all', label: 'All categories' }, ...categories.map((c) => ({ value: c.id, label: categories.some((other) => other.id !== c.id && other.name === c.name) ? `${c.name} · ${c.kind === 'income' ? 'Income' : 'Expense'}` : c.name }))]}/></div><div className="date-filter"><span>From</span><DatePicker compact ariaLabel="From date" value={dateFrom} onChange={setDateFrom}/></div><div className="date-filter"><span>To</span><DatePicker compact ariaLabel="To date" value={dateTo} onChange={setDateTo}/></div><div className="list-sort-field"><SelectInput value={sort} onChange={setSort} ariaLabel="Sort transactions" options={transactionSorts}/></div></div><button type="button" className="icon-button transaction-filter-button transaction-modal-trigger" aria-label={`Filter transactions${activeFilters ? `, ${activeFilters} active` : ''}`} onClick={() => { setDraft({ kind: kindFilter, category: categoryFilter, from: dateFrom, to: dateTo }); setDraftSort(sort); setFiltersOpen(true); }}><Filter size={18}/>{activeFilters > 0 && <span className="filter-count-badge" aria-hidden="true">{activeFilters}</span>}</button><button type="button" className="icon-button transaction-filter-button transaction-reset-button" aria-label="Reset search and filters" title="Reset search and filters" onClick={reset}><RotateCcw size={18}/></button></div>
      {items.length ? <><div className="transactions-scroll" key={currentPage} tabIndex={0} role="region" aria-label="Transaction rows"><TransactionRows categories={categories} items={ordered.slice(currentPage * 25, (currentPage + 1) * 25)} currency={currency} onDelete={setDeleting}/></div><Pagination page={currentPage} total={items.length} onChange={setPage}/></> : all.length ? <Empty title="No matches this time" detail="Try another search or clear a filter."/> : <Empty title="No transactions yet" detail="Add a transaction to get started."/>}
    </Card><div className="below-card-links"><Link className="recently-deleted-link" href="/transactions/recently-deleted"><Trash2 size={15}/>Recently deleted</Link><button type="button" className="export-csv-link" disabled={ordered.length === 0} onClick={() => onExport(ordered)}><FileDown size={15}/>Export CSV</button></div><DeleteDialog opened={!!deleting} onClose={() => setDeleting(null)} onConfirm={() => { if (deleting) onDelete(deleting); }} title="Delete transaction?" detail={`Move ${deleting?.name ?? 'this transaction'} to Recently deleted? You can restore it for 30 days.`} action="Delete transaction"/>
    <Modal.Root opened={filtersOpen} onClose={() => setFiltersOpen(false)} unstyled>
      <Modal.Overlay className="radix-dialog-overlay"/>
      <Modal.Content classNames={{ content: "commit-review-dialog transaction-filter-dialog" }} transitionProps={{ transition: "fade" }}>
        <div className="commit-review-heading"><Modal.Title className="dialog-title">Filter transactions</Modal.Title><button type="button" className="icon-button" aria-label="Close filters" onClick={() => setFiltersOpen(false)}><X size={18}/></button></div>
        <form onSubmit={(event) => { event.preventDefault(); setKindFilter(draft.kind); setCategoryFilter(draft.category); setDateFrom(draft.from); setDateTo(draft.to); setSort(draftSort); setFiltersOpen(false); }}>
          <Field label="Type"><SelectInput value={draft.kind} onChange={(kind) => setDraft({ ...draft, kind })} ariaLabel="Filter by type" options={[{ value: 'all', label: 'All types' }, { value: 'income', label: 'Income' }, { value: 'expense', label: 'Expenses' }]}/></Field>
          <Field label="Category"><SelectInput value={draft.category} onChange={(category) => setDraft({ ...draft, category })} ariaLabel="Filter by category" options={[{ value: 'all', label: 'All categories' }, ...categories.map((c) => ({ value: c.id, label: categories.some((other) => other.id !== c.id && other.name === c.name) ? `${c.name} · ${c.kind === 'income' ? 'Income' : 'Expense'}` : c.name }))]}/></Field>
          <div className="form-grid"><Field label="From" labelControl={false}><DatePicker ariaLabel="From date" value={draft.from} onChange={(from) => setDraft({ ...draft, from })}/></Field><Field label="To" labelControl={false}><DatePicker ariaLabel="To date" value={draft.to} onChange={(to) => setDraft({ ...draft, to })}/></Field></div>
          {draft.from && draft.to && draft.from > draft.to && <p className="form-error" role="alert">Choose an end date on or after the start date.</p>}
          <Field label="Sort by"><SelectInput value={draftSort} onChange={setDraftSort} ariaLabel="Sort transactions" options={transactionSorts}/></Field>
          <div className="form-actions"><Button onClick={() => setFiltersOpen(false)}>Cancel</Button><Button type="submit" variant="primary" disabled={!!draft.from && !!draft.to && draft.from > draft.to}>Apply filters</Button></div>
        </form>
      </Modal.Content>
    </Modal.Root>
  </>;
}

function TransactionEntryPage({ defaultMode, categories, currency, onSave, onCommit, fileName, setFileName, drafts, setDrafts, onDone, extractImage }: { defaultMode: 'scan' | 'manual'; categories: Category[]; currency: string; onSave: (tx: Omit<Transaction, 'id'>, id?: string) => void | Promise<void>; onCommit: (items: Omit<Transaction, 'id'>[]) => Promise<void> | void; fileName: string; setFileName: (name: string) => void; drafts: Transaction[]; setDrafts: (drafts: Transaction[]) => void; onDone: () => void; extractImage?: (file: File) => Promise<Transaction[]> }) {
  const [mode, setMode] = useState<'scan' | 'manual'>(defaultMode);
  if (mode === 'manual') return <TransactionForm categories={categories} currency={currency} onSave={onSave} onBackToScan={() => requestDiscard(() => setMode('scan'))}/>;
  return <ScanPage fileName={fileName} setFileName={setFileName} drafts={drafts} setDrafts={setDrafts} categories={categories} currency={currency} onCommit={onCommit} onDone={onDone} extractImage={extractImage} onManualEntry={() => requestDiscard(() => { setFileName(''); setDrafts([]); setMode('manual'); })}/>;
}

function DeleteDialog({ opened, onClose, onConfirm, title, detail, action, cancelLabel = "Cancel", actionVariant = "danger" }: { opened: boolean; onClose: () => void; onConfirm: () => void; title: string; detail: string; action: string; cancelLabel?: string; actionVariant?: "danger" | "primary" }) {
  return <Modal.Root opened={opened} onClose={onClose} unstyled><Modal.Overlay className="radix-dialog-overlay"/><Modal.Content classNames={{ content: 'commit-review-dialog' }} transitionProps={{ transition: 'fade' }}><div className="commit-review-heading"><Modal.Title className="dialog-title">{title}</Modal.Title><button type="button" className="icon-button" aria-label="Close confirmation" onClick={onClose}><X size={18}/></button></div><p className="helper-note">{detail}</p><div className="form-actions"><Button onClick={onClose}>{cancelLabel}</Button><Button variant={actionVariant} onClick={() => { onClose(); onConfirm(); }}>{action}</Button></div></Modal.Content></Modal.Root>;
}

function TransactionForm({ categories, currency = 'IDR', onSave, onBackToScan, original, onDelete }: { categories: Category[]; currency?: string; onSave: (tx: Omit<Transaction, 'id'>, id?: string) => void | Promise<void>; onBackToScan?: () => void; original?: Transaction; onDelete?: (tx: Transaction) => void }) {
  const editing = Boolean(original);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [saving, setSaving] = useState(false);
  const [kind, setKind] = useState<Kind>(original?.kind ?? 'expense');
  const [name, setName] = useState(original?.name ?? '');
  const [amount, setAmount] = useState(original ? String(original.amount) : '');
  const [initialDate] = useState(() => { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`; });
  const [date, setDate] = useState(original?.date ?? initialDate);
  const [category, setCategory] = useState(original?.category ?? '');
  const [merchant, setMerchant] = useState(original?.merchant ?? '');
  const [note, setNote] = useState(original?.note ?? '');
  const [error, setError] = useState('');
  const choices = categories.filter((c) => c.kind === kind);
  useUnsavedChanges(original ? name !== original.name || amount !== String(original.amount) || date !== original.date || kind !== original.kind || category !== original.category || merchant !== (original.merchant ?? '') || note !== (original.note ?? '') : Boolean(name || amount || merchant || note || category || kind !== 'expense' || date !== initialDate));
  const changed = Boolean(original && (name !== original.name || amount !== String(original.amount) || date !== original.date || kind !== original.kind || category !== original.category || merchant !== (original.merchant ?? '') || note !== (original.note ?? '')));
  async function submit(e: FormEvent) { e.preventDefault(); const value = Number(amount); if (saving) return; if (!name.trim() || !Number.isSafeInteger(value) || value <= 0) { setError('Add a description and an amount greater than zero.'); return; } setSaving(true); try { await onSave({ name: name.trim(), amount: value, date, kind, category, merchant: merchant.trim(), note: note.trim() }, original?.id); } finally { setSaving(false); } }
  return <><form className="form-layout transaction-form" onSubmit={submit}>
    <Card className="form-card">{!editing && <div className="form-intro"><span className="form-icon"><Banknote size={19}/></span><div><h2>What happened?</h2><p>Keep it simple. You can fill in more later.</p></div>{onBackToScan && <Button onClick={onBackToScan}><FileImage size={15}/>Scan a receipt</Button>}</div>}
      <div className="segmented-control" role="group" aria-label="Transaction type"><button type="button" className={kind === 'expense' ? 'selected expense-selected' : ''} onClick={() => { setKind('expense'); setCategory(''); }}><ArrowUpRight size={16}/>Expense</button><button type="button" className={kind === 'income' ? 'selected income-selected' : ''} onClick={() => { setKind('income'); setCategory(''); }}><ArrowDownLeft size={16}/>Income</button></div>
      <Field label="Amount" required><AmountInput value={amount} onChange={setAmount} currency={currency}/></Field>
      <div className="form-grid"><Field label="Description" required><input required value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Lunch with friends"/></Field><Field label="Date" required labelControl={false}><DatePicker ariaLabel="Transaction date" required value={date} onChange={setDate}/></Field><Field label="Category"><SelectInput value={category} onChange={setCategory} ariaLabel="Category" options={[{ value: '', label: 'Uncategorized' }, ...choices.map((c) => ({ value: c.name, label: c.name }))]} /></Field><Field label="Merchant"><input value={merchant} onChange={(e) => setMerchant(e.target.value)} placeholder="Where did it happen?"/></Field></div>
      <Field label="Note"><AutoResizeTextarea value={note} onChange={setNote} placeholder="Anything you’d like to remember"/></Field>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="form-actions">{!editing && <Button href="/transactions">Cancel</Button>}{original && onDelete && <Button variant="danger" onClick={() => setConfirmDelete(true)}><Trash2 size={15}/>Delete</Button>}<Button type="submit" variant="primary" disabled={saving || (editing && !changed) || !name.trim() || !date || !Number.isSafeInteger(Number(amount)) || Number(amount) <= 0}><Check size={16}/>{saving ? 'Saving…' : editing ? 'Save changes' : 'Save transaction'}</Button></div>
    </Card>
  </form><DeleteDialog opened={confirmDelete} onClose={() => setConfirmDelete(false)} onConfirm={() => { if (original && onDelete) onDelete(original); }} title="Delete transaction?" detail="This transaction will move to Recently deleted, where you can restore it for 30 days." action="Delete transaction"/></>;
}

type ListSort<T> = { value: string; label: string; compare: (a: T, b: T) => number };
function sortPair<T>(key: string, label: string, value: (item: T) => string | number, ascending: string, descending: string): ListSort<T>[] {
  const compare = (a: T, b: T) => {
    const left = value(a), right = value(b);
    return typeof left === 'number' && typeof right === 'number' ? left - right : String(left).localeCompare(String(right), 'en', { numeric: true, sensitivity: 'base' });
  };
  return [{ value: key + '-asc', label: label + ': ' + ascending, compare }, { value: key + '-desc', label: label + ': ' + descending, compare: (a, b) => compare(b, a) }];
}
const transactionSorts: ListSort<Transaction>[] = [
  ...sortPair<Transaction>('date', 'Date', (t) => t.date, 'oldest first', 'newest first').reverse(),
  ...sortPair<Transaction>('amount', 'Amount', (t) => t.amount, 'lowest first', 'highest first').reverse(),
  ...sortPair<Transaction>('name', 'Name', (t) => t.name, 'A–Z', 'Z–A'),
];
const budgetSorts: ListSort<Budget>[] = [
  ...sortPair<Budget>('spent', 'Spending %', (b) => b.limit > 0 ? b.spent / b.limit : 0, 'lowest first', 'highest first').reverse(),
  ...sortPair<Budget>('remaining', 'Remaining', (b) => b.limit - b.spent, 'lowest first', 'highest first'),
  ...sortPair<Budget>('category', 'Category', (b) => b.category, 'A–Z', 'Z–A'),
];
const scheduleSorts: ListSort<Schedule>[] = [
  ...sortPair<Schedule>('next', 'Next date', (s) => s.nextDate, 'soonest first', 'latest first'),
  ...sortPair<Schedule>('amount', 'Amount', (s) => s.amount, 'lowest first', 'highest first').reverse(),
  ...sortPair<Schedule>('name', 'Name', (s) => s.name, 'A–Z', 'Z–A'),
];
const categorySorts = sortPair<Category>('name', 'Name', (c) => c.name, 'A–Z', 'Z–A');
const deletedSorts: ListSort<DeletedTransaction>[] = [
  ...sortPair<DeletedTransaction>('deleted', 'Deleted', (t) => t.deletedAt, 'oldest first', 'newest first').reverse(),
  ...transactionSorts.filter((option) => !option.value.startsWith('name')),
];

// Shared list controls keep domain-specific rows and mobile layouts intact.
function ListDisplay<T>({ items, label, searchText, filters = [], sorts, children, empty }: {
  items: T[]; label: string; searchText: (item: T) => string; sorts: ListSort<T>[]; empty?: ReactNode;
  filters?: { label: string; options: { value: string; label: string }[]; matches: (item: T, value: string) => boolean }[];
  children: (items: T[], compare: (a: T, b: T) => number) => ReactNode;
}) {
  const { params, update } = useListQuery();
  const search = params.get('q') || '';
  const setSearch = (value: string) => update({ q: value }, true);
  const values: Record<string, string> = Object.fromEntries(filters.map((filter) => {
    const value = params.get(filterQueryKey(filter.label)) || '';
    return [filter.label, filter.options.some((option) => option.value === value) ? value : ''];
  }));
  const setValues = (next: Record<string, string>) => update(Object.fromEntries(filters.map((filter) => [filterQueryKey(filter.label), next[filter.label] || null])));
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [open, setOpen] = useState(false);
  const page = listPage(params);
  const setPage = (value: number) => update({ page: value ? String(value + 1) : null });
  const sort = sorts.some((option) => option.value === params.get('sort')) ? params.get('sort')! : sorts[0].value;
  const setSort = (value: string) => update({ sort: value === sorts[0].value ? null : value });
  const [draftSort, setDraftSort] = useState(sort);
  const active = Object.values(values).filter(Boolean).length;
  const filtered = items.filter((item) => searchText(item).toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()) && filters.every((filter) => !values[filter.label] || filter.matches(item, values[filter.label]))).sort((sorts.find((option) => option.value === sort) || sorts[0]).compare);
  const currentPage = Math.min(page, Math.max(0, Math.ceil(filtered.length / 25) - 1));
  const clear = () => { setSearch(''); setValues({}); setSort(sorts[0].value); };
  const fields = (selection: Record<string, string>, change: (value: Record<string, string>) => void, modal = false) => filters.map((filter) => {
    const control = <SelectInput ariaLabel={filter.label} value={selection[filter.label] || ''} onChange={(value) => change({ ...selection, [filter.label]: value })} options={[{ value: '', label: filter.label }, ...filter.options]}/>;
    return modal ? <Field key={filter.label} label={filter.label}>{control}</Field> : <div className="transaction-select-field" key={filter.label} style={{ width: `${Math.min(28, Math.max(filter.label.length, ...filter.options.map((option) => option.label.length)) + 6)}ch` }}>{control}</div>;
  });
  return <section className="list-display shared-list-display" aria-label={label}>
    <div className="filter-bar transaction-toolbar">
      <label className="search-box"><Search size={17}/><input aria-label={`Search ${label}`} placeholder={`Search ${label}`} value={search} onChange={(event) => { setSearch(event.target.value); }}/>{search && <button type="button" aria-label="Clear search" onClick={() => { setSearch(''); }}><X size={14}/></button>}</label>
      <div className="transaction-inline-filters">{fields(values, (next) => { setValues(next); })}<div className="list-sort-field"><SelectInput value={sort} onChange={(value) => { setSort(value); }} ariaLabel={`Sort ${label}`} options={sorts}/></div></div>
      {filters.length > 0 && <button type="button" className="icon-button transaction-filter-button transaction-modal-trigger" aria-label={`Filter ${label}${active ? `, ${active} active` : ''}`} onClick={() => { setDraft(values); setDraftSort(sort); setOpen(true); }}><Filter size={18}/>{active > 0 && <span className="filter-count-badge" aria-hidden="true">{active}</span>}</button>}
      <button type="button" className="icon-button transaction-filter-button transaction-reset-button" aria-label="Reset search and filters" title="Reset search and filters" onClick={clear}><RotateCcw size={18}/></button>
    </div>
    {filtered.length ? <div className="shared-list-scroll" key={currentPage} tabIndex={0} role="region" aria-label={`${label} rows`}>{children(filtered.slice(currentPage * 25, (currentPage + 1) * 25), (sorts.find((option) => option.value === sort) || sorts[0]).compare)}</div> : items.length ? <Empty title="No matches this time" detail="Try another search or clear a filter."/> : (empty || <Empty title={`No ${label} yet`} detail="Use the add action above to get started."/>)}
    <Pagination page={currentPage} total={filtered.length} onChange={setPage}/>
    <Modal.Root opened={open} onClose={() => setOpen(false)} unstyled><Modal.Overlay className="radix-dialog-overlay"/><Modal.Content classNames={{ content: "commit-review-dialog transaction-filter-dialog" }} transitionProps={{ transition: "fade" }}>
      <div className="commit-review-heading"><Modal.Title className="dialog-title">Filter {label}</Modal.Title><button type="button" className="icon-button" aria-label="Close filters" onClick={() => setOpen(false)}><X size={18}/></button></div>
      <form onSubmit={(event) => { event.preventDefault(); setValues(draft); setSort(draftSort); setOpen(false); }}>{fields(draft, setDraft, true)}<Field label="Sort by"><SelectInput value={draftSort} onChange={setDraftSort} ariaLabel={`Sort ${label}`} options={sorts}/></Field><div className="form-actions"><Button onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" variant="primary">Apply filters</Button></div></form>
    </Modal.Content></Modal.Root>
  </section>;
}

function Pagination({ page, total, onChange }: { page: number; total: number; onChange: (page: number) => void }) {
  if (!total) return null;
  const count = Math.ceil(total / 25);
  return <nav className={`pagination ${paginationStyles.pagination}`} aria-label="Pagination"><span aria-live="polite">{page * 25 + 1}–{Math.min((page + 1) * 25, total)} of {total}</span><MantinePagination total={count} value={page + 1} onChange={(value) => onChange(value - 1)} withControls siblings={0} boundaries={1} getControlProps={(control) => ({ 'aria-label': control === 'previous' ? 'Previous page' : 'Next page' })} classNames={{ control: paginationStyles.control, dots: paginationStyles.dots }} getItemProps={(value) => ({ 'aria-label': `Page ${value}`, 'aria-current': value === page + 1 ? 'page' : undefined })}/></nav>;
}

function RecentlyDeleted({ items, categories, currency, restore, goBack }: { categories: Category[]; goBack: (fallback: string) => void; items: DeletedTransaction[]; currency: string; restore: (id: string) => void }) {
  const [restoring, setRestoring] = useState<DeletedTransaction | null>(null);
  return <><Card className="ledger-card">{items.length ? <ListDisplay sorts={deletedSorts} items={items} label="deleted transactions" searchText={(item) => `${item.name} ${item.category} ${item.note || ''}`} filters={[{ label: 'All types', options: [{ value: 'income', label: 'Income' }, { value: 'expense', label: 'Expenses' }], matches: (item, value) => item.kind === value }]}>{(rows) => <div className="deleted-list">{rows.map((item) => <div className="deleted-row" key={item.id}><span className={`transaction-icon ${categoryColor(categories, item.category, item.kind)}`}><CategoryIcon categories={categories} name={item.category} kind={item.kind} size={17}/></span><span><strong>{item.name}</strong><small>{prettyDate(item.date)} · deleted {prettyDate(item.deletedAt)}</small></span><b>{fmt(item.amount, currency)}</b><button type="button" className="icon-button row-action restore-action" aria-label={`Restore ${item.name}`} title="Restore" onClick={() => setRestoring(item)}><ArchiveRestore size={16}/></button></div>)}</div>}</ListDisplay> : <Empty title="Nothing to restore" detail="When you delete a transaction, you’ll find it here for 30 days." action={<Button onClick={() => goBack('/transactions')}>Back</Button>}/>}</Card><DeleteDialog opened={!!restoring} onClose={() => setRestoring(null)} onConfirm={() => { if (restoring) restore(restoring.id); }} title="Restore transaction?" detail={`Restore ${restoring?.name ?? 'this transaction'} to your transactions? It will be included in your totals again.`} action="Restore transaction" actionVariant="primary"/></>;
}

function ScanPage({ fileName, setFileName, drafts, setDrafts, categories, currency, onCommit, onDone, onManualEntry, extractImage }: { fileName: string; setFileName: (s: string) => void; drafts: Transaction[]; setDrafts: (v: Transaction[]) => void; categories: Category[]; currency: string; onCommit: (items: Omit<Transaction, 'id'>[]) => Promise<void> | void; onDone: () => void; onManualEntry?: () => void; extractImage?: (file: File) => Promise<Transaction[]> }) {
  const [stage, setStage] = useState<'upload' | 'drafts'>('upload');
  const [showHowItWorks, setShowHowItWorks] = useState(false);
  const [showImagePreview, setShowImagePreview] = useState(false);
  const [stagedDraftIds, setStagedDraftIds] = useState<string[]>([]);
  const [commitConfirmation, setCommitConfirmation] = useState<'include' | 'valid-only' | 'skip' | null>(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [extractedFileName, setExtractedFileName] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [extracting, setExtracting] = useState(false);
  useUnsavedChanges(Boolean(fileName || drafts.length));
  const fileInputRef = useRef<HTMLInputElement>(null);
  const selectedFileRef = useRef<File | null>(null);
  useEffect(() => { if (!previewUrl) return; return () => URL.revokeObjectURL(previewUrl); }, [previewUrl]);
  function chooseFile(file?: File) {
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 8 * 1024 * 1024) { selectedFileRef.current = null; setFileName(''); setPreviewUrl(''); setUploadError(file.size > 8 * 1024 * 1024 ? 'Choose an image smaller than 8 MB.' : 'Choose a JPEG, PNG, or WEBP image.'); return; }
    setUploadError('');
    setFileName(file.name);
    selectedFileRef.current = file;
    setPreviewUrl(URL.createObjectURL(file));
  }
  async function extract(sourceName = fileName || 'sample-receipt.jpg') {
    if (extractImage) {
      if (!selectedFileRef.current) return;
      setExtracting(true); setUploadError('');
      try { setDrafts(await extractImage(selectedFileRef.current)); }
      catch (error) { setUploadError(error instanceof Error ? error.message : 'Could not extract this image. Try again or enter it manually.'); setExtracting(false); return; }
      setExtracting(false);
    }
    setExtractedFileName(sourceName);
    selectedFileRef.current = null;
    setPreviewUrl('');
    setFileName('');
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (!extractImage) setDrafts([{ id: `draft-${Date.now()}-1`, name: 'Iced latte', category: 'Food & drink', kind: 'expense', amount: 32_000, date: '2026-11-14', merchant: 'Kopi Kenangan' }, { id: `draft-${Date.now()}-2`, name: 'Sandwich', category: '', kind: 'expense', amount: 48_000, date: '2026-11-14', merchant: 'Kopi Kenangan' }]); setStagedDraftIds([]); setStage('drafts');
  }
  function isDraftValid(draft: Transaction) { return Boolean(draft.name.trim() && draft.date) && Number.isSafeInteger(draft.amount) && draft.amount > 0; }
  const stagedDrafts = drafts.filter((draft) => stagedDraftIds.includes(draft.id));
  const unconfirmedDrafts = drafts.filter((draft) => !stagedDraftIds.includes(draft.id));
  const validUnconfirmedDrafts = unconfirmedDrafts.filter(isDraftValid);
  const invalidUnconfirmedDrafts = unconfirmedDrafts.filter((draft) => !isDraftValid(draft));
  const unconfirmedAreValid = unconfirmedDrafts.length > 0 && unconfirmedDrafts.every(isDraftValid);
  function requestCommit() {
    if (!unconfirmedDrafts.length) { commitDrafts('include'); return; }
    if (invalidUnconfirmedDrafts.length && validUnconfirmedDrafts.length) { setCommitConfirmation('valid-only'); return; }
    setCommitConfirmation(unconfirmedAreValid ? 'include' : 'skip');
  }
  async function commitDrafts(mode: 'include' | 'valid-only' | 'skip') {
    const selected = mode === 'include' ? drafts : mode === 'valid-only' ? drafts.filter((draft) => stagedDraftIds.includes(draft.id) || isDraftValid(draft)) : stagedDrafts;
    const transactions = selected.map(transactionInput);
    setUploadError('');
    try {
      if (transactions.length) await onCommit(transactions);
      setDrafts([]);
      setStagedDraftIds([]);
      setCommitConfirmation(null);
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : 'Could not save these transactions. Your drafts are still here.');
      setCommitConfirmation(null);
    }
  }
  if (stage === 'drafts') return <div className="scan-review-layout">
    <Card className="scan-results">
      <div className="scan-success"><span><ScanText size={19}/></span><div><h2>{drafts.length ? `We found ${drafts.length} ${drafts.length === 1 ? 'transaction' : 'transactions'}` : 'No transactions found'}</h2><p>{extractImage ? `Extracted from ${extractedFileName}. Review each draft before saving.` : `Demo extraction from ${extractedFileName || 'sample-receipt.jpg'}. Review each draft before saving.`}</p></div>{drafts.length > 0 && <Button className="scan-commit-button" variant="primary" onClick={requestCommit} disabled={!stagedDrafts.length && !validUnconfirmedDrafts.length}>{stagedDrafts.length ? `Add ${stagedDrafts.length} ${stagedDrafts.length === 1 ? 'transaction' : 'transactions'}` : unconfirmedAreValid ? 'Add transactions' : 'Finish review'}</Button>}</div>
      {uploadError && <p className="upload-error" role="alert">{uploadError}</p>}
      {drafts.length ? drafts.map((draft, index) => <DraftReviewItem key={draft.id} draft={draft} index={index} categories={categories.filter((category) => category.kind === draft.kind)} currency={currency} isValid={isDraftValid(draft)} isStaged={stagedDraftIds.includes(draft.id)} onChange={(updates) => setDrafts(drafts.map((item) => item.id === draft.id ? { ...item, ...updates } : item))} onToggleStage={() => setStagedDraftIds((ids) => ids.includes(draft.id) ? ids.filter((id) => id !== draft.id) : [...ids, draft.id])} onSkip={() => setDrafts(drafts.filter((item) => item.id !== draft.id))}/>) : <Empty title="No transactions found" detail="Try a clearer image or enter the transaction manually." action={<Button onClick={() => { onDone(); setExtractedFileName(''); setStagedDraftIds([]); setStage('upload'); }} variant="primary">Scan another image</Button>}/>}
    </Card>
    <Modal.Root opened={Boolean(commitConfirmation)} onClose={() => setCommitConfirmation(null)} unstyled><Modal.Overlay className="radix-dialog-overlay"/><Modal.Content classNames={{ content: "commit-review-dialog" }} transitionProps={{ transition: "fade" }}>
      <div className="commit-review-heading"><Modal.Title className="dialog-title">{commitConfirmation === 'include' ? 'Add remaining drafts?' : commitConfirmation === 'valid-only' ? 'Add complete drafts?' : stagedDrafts.length ? 'Skip the other drafts?' : 'Skip these drafts?'}</Modal.Title><button className="icon-button" type="button" aria-label="Close confirmation" autoFocus onClick={() => setCommitConfirmation(null)}><X size={17}/></button></div>
      <p>{commitConfirmation === 'include' ? `${unconfirmedDrafts.length} drafts look complete, but you haven't confirmed them. Add them as they are? This will save all ${drafts.length} drafts.` : commitConfirmation === 'valid-only' ? `There are ${stagedDrafts.length + validUnconfirmedDrafts.length} complete drafts and ${invalidUnconfirmedDrafts.length} that need more detail. Add the complete drafts as entered and skip the incomplete ones?` : stagedDrafts.length ? `${unconfirmedDrafts.length} drafts haven't been confirmed, and at least one needs more detail. Skip the unconfirmed drafts and add only the ${stagedDrafts.length} ready ${stagedDrafts.length === 1 ? 'transaction' : 'transactions'}?` : `These ${unconfirmedDrafts.length} drafts need more detail and haven't been confirmed. Skip them without adding anything?`}</p>
      <div className="commit-review-actions"><Button variant="quiet" onClick={() => setCommitConfirmation(null)}>Keep reviewing</Button>{(commitConfirmation === 'include' || commitConfirmation === 'valid-only') && stagedDrafts.length > 0 && <Button variant="danger" onClick={() => commitDrafts('skip')}>Add ready drafts only</Button>}<Button variant={commitConfirmation !== 'skip' || stagedDrafts.length > 0 ? 'primary' : 'danger'} onClick={() => commitDrafts(commitConfirmation ?? 'skip')}>{commitConfirmation === 'include' ? `Add all ${drafts.length} drafts` : commitConfirmation === 'valid-only' ? 'Add complete drafts' : stagedDrafts.length ? `Add ${stagedDrafts.length} ready ${stagedDrafts.length === 1 ? 'transaction' : 'transactions'}` : 'Skip drafts'}</Button></div>
    </Modal.Content></Modal.Root>
    </div>;
  return <div className="scan-layout upload-only">
    <Card className="upload-card">
      <div className="upload-icon"><FileImage size={26}/></div>
      <div className="upload-heading"><h2>Bring a receipt or screenshot</h2><button className="scan-help-trigger" type="button" aria-label="How receipt scanning works" onClick={() => setShowHowItWorks(true)}><CircleHelp size={18}/></button></div>
      <p>One image at a time. We’ll turn it into editable drafts for you to review.</p>
      {previewUrl ? <div className={`drop-zone has-preview ${isDragging ? 'is-dragging' : ''}`} onDragOver={(event) => { event.preventDefault(); setIsDragging(true); }} onDragLeave={() => setIsDragging(false)} onDrop={(event) => { event.preventDefault(); setIsDragging(false); chooseFile(event.dataTransfer.files?.[0]); }}><div className="upload-preview-content"><button className="upload-preview-button" type="button" aria-label="Open full size receipt preview" onClick={() => setShowImagePreview(true)}><img className="upload-preview" src={previewUrl} alt="Selected receipt preview"/></button><span className="upload-preview-copy"><strong>{fileName}</strong><button className="upload-preview-hint" type="button" onClick={() => setShowImagePreview(true)}>Click to preview full size</button><button className="upload-replace-prompt" type="button" onClick={() => fileInputRef.current?.click()}><Upload size={14}/>Choose a different image</button></span></div></div> : <button className={`drop-zone drop-zone-empty ${isDragging ? 'is-dragging' : ''}`} type="button" onClick={() => fileInputRef.current?.click()} onDragOver={(event) => { event.preventDefault(); setIsDragging(true); }} onDragLeave={() => setIsDragging(false)} onDrop={(event) => { event.preventDefault(); setIsDragging(false); chooseFile(event.dataTransfer.files?.[0]); }}><span className="drop-zone-icon"><Upload size={20}/></span><strong>Drop an image here or browse</strong><small>PNG, JPG, or WEBP · one image at a time</small><span className="drop-zone-choose">Choose image</span></button>}
      <input ref={fileInputRef} className="file-input-hidden" type="file" accept="image/*" capture="environment" onChange={(event) => { chooseFile(event.currentTarget.files?.[0]); event.currentTarget.value = ''; }}/>
      {uploadError && <p className="upload-error" role="alert">{uploadError}</p>}
      <div className="upload-actions">{onManualEntry && <Button onClick={onManualEntry}>Enter manually</Button>}<Button onClick={() => { void extract(); }} disabled={!fileName || extracting} variant="primary"><Sparkles size={16}/>{extracting ? 'Extracting…' : 'Extract drafts'}</Button></div>
      <p className="entry-settings-prompt">Choose your default transaction entry in <Link href="/settings">Settings</Link>.</p>
    </Card>
    <aside className="scan-help-aside"><ScanInstructions/></aside>
    <Modal.Root opened={showHowItWorks} onClose={() => setShowHowItWorks(false)} unstyled><Modal.Overlay className="radix-dialog-overlay"/><Modal.Content classNames={{ content: "scan-help-dialog" }} transitionProps={{ transition: "fade" }}>
      <div className="scan-help-heading"><div><span className="section-kicker">RECEIPT SCAN</span><Modal.Title className="dialog-title">How it works</Modal.Title></div><button className="icon-button" type="button" aria-label="Close how it works" autoFocus onClick={() => setShowHowItWorks(false)}><X size={17}/></button></div>
      <ScanInstructions/>
    </Modal.Content></Modal.Root>
    <Modal.Root opened={showImagePreview} onClose={() => setShowImagePreview(false)} unstyled><Modal.Overlay className="radix-dialog-overlay"/><Modal.Content classNames={{ content: "receipt-preview-dialog" }} transitionProps={{ transition: "fade" }}>
      <div className="receipt-preview-heading"><Modal.Title className="dialog-title">{fileName}</Modal.Title><button className="icon-button" type="button" aria-label="Close receipt preview" autoFocus onClick={() => setShowImagePreview(false)}><X size={17}/></button></div>
      <div className="receipt-preview-body">{previewUrl && <img className="receipt-preview-full" src={previewUrl} alt="Full size preview of the selected receipt"/>}</div>
    </Modal.Content></Modal.Root>
  </div>;
}

function ScanInstructions() {
  return <div className="scan-steps"><span className="section-kicker">HOW IT WORKS</span><div><b>1</b><p><strong>Add one image</strong><small>Receipt, order confirmation, or screenshot.</small></p></div><div><b>2</b><p><strong>Check the details</strong><small>Edit, confirm, or skip each draft.</small></p></div><div><b>3</b><p><strong>Only confirmed items stay</strong><small>The source image is discarded after extraction.</small></p></div><div className="scan-privacy-step"><b aria-hidden="true"><ShieldCheck size={15}/></b><p><strong>Your image is temporary</strong><small>Only drafts you confirm become transactions. Scanning sends your image to an external service. Pocket Buddy doesn’t save the image.</small></p></div></div>;
}

function DraftReviewItem({ draft, index, categories, currency, isValid, isStaged, onChange, onToggleStage, onSkip }: { draft: Transaction; index: number; categories: Category[]; currency: string; isValid: boolean; isStaged: boolean; onChange: (updates: Partial<Transaction>) => void; onToggleStage: () => void; onSkip: () => void }) {
  if (isStaged) return <article className="draft-review-item staged"><div className="draft-staged-summary"><div className="draft-staged-main"><div className="draft-staged-title"><strong>{draft.name}</strong><span className="confidence-pill"><Check size={12}/>Ready to add</span></div><strong className={`draft-staged-amount ${draft.kind}`}>{draft.kind === 'income' ? '+' : '−'}{fmt(draft.amount, currency)}</strong></div><div className="draft-staged-details"><span>{draft.category} · {prettyDate(draft.date)}{draft.merchant ? ` · ${draft.merchant}` : ''}</span><Button variant="quiet" onClick={onToggleStage}><Pencil size={14}/>Edit</Button></div></div></article>;
  const uncertain = draft.uncertainFields ?? [];
  return <article className="draft-review-item"><div className="draft-review-heading"><strong>Draft {index + 1}</strong><span className={`confidence-pill ${uncertain.length || !draft.category ? 'needs-review' : ''}`}><Sparkles size={12}/>{uncertain.length ? `Check ${uncertain.join(', ')}` : !draft.category ? 'Choose a category' : 'Review details'}</span></div>{uncertain.length > 0 && <p className="draft-uncertain-note">Some details may be missing or unclear. Check the highlighted fields before adding.</p>}<div className="draft-review-amount"><Field label="Amount" required className={uncertain.includes('amount') ? 'field-uncertain' : ''}><AmountInput value={String(draft.amount || '')} currency={currency} onChange={(value) => onChange({ amount: Number(value), uncertainFields: uncertain.filter((field) => field !== 'amount') })}/></Field></div><div className="draft-review-fields"><Field label="Description" required className={uncertain.includes('description') ? 'field-uncertain' : ''}><input required value={draft.name} onChange={(event) => onChange({ name: event.target.value, uncertainFields: uncertain.filter((field) => field !== 'description') })}/></Field><Field label="Type" required className={uncertain.includes('kind') ? 'field-uncertain' : ''}><SelectInput required value={draft.kind} onChange={(value) => onChange({ kind: value as Kind, category: '', uncertainFields: uncertain.filter((field) => field !== 'kind' && field !== 'category') })} ariaLabel={`Draft ${index + 1} type`} options={[{ value: 'expense', label: 'Expense' }, { value: 'income', label: 'Income' }]}/></Field><Field label="Category" className={!draft.category || uncertain.includes('category') ? 'field-uncertain' : ''}><SelectInput value={draft.category} onChange={(value) => onChange({ category: value, uncertainFields: uncertain.filter((field) => field !== 'category') })} ariaLabel={`Draft ${index + 1} category`} options={[{ value: '', label: 'Uncategorized' }, ...categories.map((category) => ({ value: category.name, label: category.name }))]} /></Field><Field label="Date" required labelControl={false} className={uncertain.includes('date') ? 'field-uncertain' : ''}><DatePicker ariaLabel={`Draft ${index + 1} date`} required value={draft.date} onChange={(date) => onChange({ date, uncertainFields: uncertain.filter((field) => field !== 'date') })}/></Field><Field label="Merchant" className={uncertain.includes('merchant') ? 'field-uncertain' : ''}><input value={draft.merchant ?? ''} onChange={(event) => onChange({ merchant: event.target.value, uncertainFields: uncertain.filter((field) => field !== 'merchant') })} placeholder="Add a merchant"/></Field><Field label="Note" className="draft-note-field"><AutoResizeTextarea value={draft.note ?? ''} onChange={(note) => onChange({ note })} placeholder="Purchased items and other receipt details"/></Field></div><div className="draft-review-actions"><Button variant="quiet" onClick={onSkip}>Skip draft</Button><Button variant="primary" disabled={!isValid} onClick={onToggleStage}><Check size={15}/>Looks good</Button></div></article>;
}

function BudgetsPage({ budgets, categories, currency, onDelete }: { budgets: Budget[]; categories: Category[]; currency: string; onDelete: (id: string) => Promise<void> }) {
  const [deleting, setDeleting] = useState<Budget | null>(null);
  const [error, setError] = useState('');
  return <><div className="summary-strip"><div><span>Active budgets</span><strong>{budgets.length}</strong></div><div><span>Over budget</span><strong>{budgets.filter((b) => b.spent > b.limit).length}</strong></div><div><span>Within budget</span><strong className="income-text">{budgets.filter((b) => b.spent <= b.limit).length}</strong></div></div><Card className="ledger-card">{budgets.length ? <ListDisplay sorts={budgetSorts} items={budgets} label="budgets" searchText={(b) => b.category} filters={[{ label: "All periods", options: ["Weekly", "Monthly"].map((value) => ({ value, label: value })), matches: (b, value) => b.period === value }, { label: "All spending", options: [{ value: "over", label: "Over budget" }, { value: "within", label: "Within budget" }], matches: (b, value) => value === "over" ? b.spent > b.limit : b.spent <= b.limit }]}>{(rows) => <div className="budget-manage-list">{rows.map((b) => <div className="budget-manage-row" key={b.id}><BudgetRows categories={categories} budgets={[b]} currency={currency} showMobileChevron/><button className="icon-button budget-delete" aria-label={`Delete ${b.category} budget`} onClick={() => { setError(''); setDeleting(b); }}><Trash2 size={15}/></button></div>)}</div>}</ListDisplay> : <Empty title="No budgets yet" detail="Start with a category you’d like to keep an eye on." action={<Button href="/budgets/new" variant="primary">Create a budget</Button>}/>}</Card><DeleteDialog opened={!!deleting} onClose={() => setDeleting(null)} onConfirm={() => { if (deleting) void onDelete(deleting.id).catch((error) => setError(error instanceof Error ? error.message : 'Could not remove budget')); }} title="Remove budget?" detail={`Remove the ${deleting?.category ?? 'selected'} budget? Transactions will remain. This cannot be undone.`} action="Remove budget"/>{error && <p className="form-error" role="alert">{error}</p>}</>;
}

function BudgetForm({ categories, budgets, currency = 'IDR', onSave }: { categories: Category[]; budgets: Budget[]; currency?: string; onSave: (b: Omit<Budget, 'id' | 'spent'>) => Promise<void> }) {
  const [category, setCategory] = useState(''); const [period, setPeriod] = useState<'Weekly' | 'Monthly'>('Monthly'); const [limit, setLimit] = useState(''); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  useUnsavedChanges(Boolean(category || limit || period !== 'Monthly'));
  const duplicate = budgets.some((b) => b.category === category && b.period === period);
  async function submit(e: FormEvent) { e.preventDefault(); if (busy) return; const value = Number(limit); if (!Number.isSafeInteger(value) || value <= 0) { setError('Enter a spending limit greater than zero.'); return; } if (!categories.some((item) => item.name === category)) { setError('Choose an available category.'); return; } if (duplicate) { setError('A budget already exists for this category and period.'); return; } setBusy(true); setError(''); try { await onSave({ category, period, limit: value }); } catch (error) { setError(error instanceof Error ? error.message : 'Could not create budget.'); } finally { setBusy(false); } }
  return <form className="form-layout budget-form" onSubmit={(event) => { void submit(event); }}><Card className="form-card"><div className="form-intro"><span className="form-icon violet-icon"><BarChart3 size={18}/></span><div><h2>Make a little room</h2><p>Budgets are a guide, not a grade.</p></div></div><Field label="Spending limit" required><AmountInput value={limit} onChange={setLimit} currency={currency} ariaLabel="Spending limit"/></Field><div className="form-grid"><Field label="Category" required><SelectInput required value={category} onChange={setCategory} ariaLabel="Category" options={categories.map((c) => ({ value: c.name, label: `${c.name}${c.parent ? ` · under ${c.parent}` : ''}` }))} /></Field><Field label="Budget period" required><SelectInput required value={period} onChange={(value) => setPeriod(value as 'Weekly' | 'Monthly')} ariaLabel="Budget period" options={[{ value: 'Weekly', label: 'Weekly' }, { value: 'Monthly', label: 'Monthly' }]} /></Field></div>{duplicate && <p className="form-error" role="alert">A budget already exists for this category and period.</p>}{error && <p className="form-error" role="alert">{error}</p>}<div className="form-actions"><Button href="/budgets">Cancel</Button><Button type="submit" variant="primary" disabled={busy || duplicate || !Number.isSafeInteger(Number(limit)) || Number(limit) <= 0 || !categories.some((item) => item.name === category) || !period}><Check size={16}/>{busy ? 'Creating…' : 'Create budget'}</Button></div></Card></form>;
}

function BudgetDetails({ budget, budgets, categories, currency, onSave, onDelete, goBack }: { goBack: (fallback: string) => void; budget?: Budget; budgets: Budget[]; categories: Category[]; currency: string; onSave: (updates: Omit<Budget, 'id' | 'spent'>) => Promise<void>; onDelete: () => Promise<void> }) {
  const [limit, setLimit] = useState(budget ? String(budget.limit) : '');
  const [category, setCategory] = useState(budget?.category || '');
  const [period, setPeriod] = useState<'Weekly' | 'Monthly'>(budget?.period || 'Monthly');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { setLimit(budget ? String(budget.limit) : ''); setCategory(budget?.category || ''); setPeriod(budget?.period || 'Monthly'); }, [budget]);
  const changed = Boolean(budget && (limit !== String(budget.limit) || category !== budget.category || period !== budget.period));
  useUnsavedChanges(changed);
  if (!budget) return <Card><Empty title="Budget not found" detail="This budget may have been removed." action={<Button onClick={() => goBack('/budgets')}>Back</Button>}/></Card>;
  const pct = Math.min(100, Math.round(budget.spent / budget.limit * 100));
  const duplicate = budgets.some((b) => b.id !== budget.id && b.category === category && b.period === period);
  const valid = Number.isSafeInteger(Number(limit)) && Number(limit) > 0 && categories.some((c) => c.name === category) && !duplicate;
  const canSave = changed && valid;
  function submit(e: FormEvent) {
    e.preventDefault();
    if (!canSave || busy) return;
    setBusy(true); setError('');
    void onSave({ category, period, limit: Number(limit) }).catch((failure) => setError(failure instanceof Error ? failure.message : 'Could not save budget.')).finally(() => setBusy(false));
  }
  return <><div className="detail-layout detail-full-width"><Card className="detail-card budget-detail">
    <span className="section-kicker">{budget.period.toUpperCase()} CATEGORY BUDGET</span><h2>{budget.category}</h2>
    <div className="budget-big-progress"><i><em style={{ width: `${pct}%` }}/></i><small>{fmt(Math.max(0, budget.limit - budget.spent), currency)} left of {fmt(budget.limit, currency)}</small><strong>{pct}%</strong></div>
    <form onSubmit={submit}>
      <Field label="Spending limit" required><AmountInput value={limit} onChange={setLimit} currency={currency} ariaLabel="Spending limit"/></Field>
      <div className="form-grid"><Field label="Category" required><SelectInput required value={category} onChange={setCategory} ariaLabel="Category" options={categories.map((c) => ({ value: c.name, label: `${c.name}${c.parent ? ` · under ${c.parent}` : ''}` }))}/></Field><Field label="Budget period" required><SelectInput required value={period} onChange={(value) => setPeriod(value as 'Weekly' | 'Monthly')} ariaLabel="Budget period" options={[{ value: 'Weekly', label: 'Weekly' }, { value: 'Monthly', label: 'Monthly' }]}/></Field></div>
      {duplicate && <p className="form-error" role="alert">A budget already exists for this category and period.</p>}{error && <p className="form-error" role="alert">{error}</p>}
      <div className="form-actions"><Button onClick={() => setConfirmDelete(true)} variant="danger" disabled={busy}><Trash2 size={15}/>Remove</Button><Button type="submit" variant="primary" disabled={busy || !canSave}><Check size={15}/>{busy ? 'Saving…' : 'Save budget'}</Button></div>
    </form>
  </Card></div><DeleteDialog opened={confirmDelete} onClose={() => setConfirmDelete(false)} onConfirm={() => { void onDelete().catch((failure) => setError(failure instanceof Error ? failure.message : 'Could not remove budget.')); }} title="Remove budget?" detail="This budget will be removed. Transactions will remain. This cannot be undone." action="Remove budget"/></>;
}

function pendingSchedules(schedules: Schedule[]) {
  return schedules.filter((schedule) => schedule.pending && !schedule.paused).sort((a, b) => a.nextDate.localeCompare(b.nextDate));
}

function PendingRow({ item, currency, onSkip, onConfirm, categories }: { item: Schedule; currency: string; onSkip: (id: string) => void; onConfirm: (item: Schedule) => Promise<void>; categories: Category[] }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(item);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const valid = draft.name.trim() && Number.isSafeInteger(draft.amount) && draft.amount > 0 && validListDate(draft.nextDate);
  return <><div className="pending-row"><span className="pending-date">{prettyDate(item.nextDate)}</span><span><strong>{item.name}</strong><small>{item.category || 'Uncategorized'} · {fmt(item.amount, currency)}</small></span><div><Button onClick={() => onSkip(item.id)}>Skip</Button><Button onClick={() => { setDraft(item); setError(''); setEditing(true); }} variant="primary">Review</Button></div></div><Modal.Root opened={editing} onClose={() => setEditing(false)} unstyled><Modal.Overlay className="radix-dialog-overlay"/><Modal.Content classNames={{ content: 'commit-review-dialog' }} transitionProps={{ transition: 'fade' }}><div className="commit-review-heading"><Modal.Title className="dialog-title">Review occurrence</Modal.Title><button type="button" className="icon-button" aria-label="Close" onClick={() => setEditing(false)}><X size={18}/></button></div><div className="form-grid"><Field label="Amount" required><AmountInput value={String(draft.amount)} currency={currency} onChange={(value) => setDraft({ ...draft, amount: Number(value) })} ariaLabel="Occurrence amount"/></Field><Field label="Name" required><input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })}/></Field><Field label="Date" required labelControl={false}><DatePicker ariaLabel="Occurrence date" value={draft.nextDate} onChange={(value) => setDraft({ ...draft, nextDate: value })}/></Field><Field label="Category"><SelectInput value={draft.category} onChange={(value) => setDraft({ ...draft, category: value })} ariaLabel="Category" options={[{ value: '', label: 'Uncategorized' }, ...categories.filter((c) => c.kind === draft.kind).map((c) => ({ value: c.name, label: c.name }))]}/></Field></div>{error && <p className="form-error" role="alert">{error}</p>}<div className="form-actions"><Button disabled={busy} onClick={() => setEditing(false)}>Cancel</Button><Button variant="primary" disabled={!valid || busy} onClick={() => { setBusy(true); setError(''); void onConfirm(draft).then(() => setEditing(false)).catch((failure) => setError(failure instanceof Error ? failure.message : 'Could not save occurrence')).finally(() => setBusy(false)); }}>Add to transactions</Button></div></Modal.Content></Modal.Root></>;
}

function RecurringReviewPage({ schedules, categories, currency, onSkip, onConfirm }: { schedules: Schedule[]; categories: Category[]; currency: string; onSkip: (id: string) => void; onConfirm: (item: Schedule) => Promise<void> }) {
  const pending = pendingSchedules(schedules);
  return <Card className="ledger-card pending-review-card"><ListDisplay items={pending} label="pending occurrences" searchText={(item) => `${item.name} ${item.category}`} sorts={scheduleSorts} filters={[
    { label: 'All types', options: [{ value: 'income', label: 'Income' }, { value: 'expense', label: 'Expenses' }], matches: (item, value) => item.kind === value },
    { label: 'All frequencies', options: ['Weekly', 'Monthly', 'Yearly'].map((value) => ({ value, label: value })), matches: (item, value) => item.cadence === value },
  ]} empty={<Empty title="All caught up" detail="New occurrences will wait here for your review." action={<Button href="/recurring">Back to recurring</Button>}/>}>{(rows) => <div>{rows.map((item) => <PendingRow key={item.id} item={item} categories={categories} currency={currency} onSkip={onSkip} onConfirm={onConfirm}/>)}</div>}</ListDisplay></Card>;
}

function RecurringPage({ schedules, pendingItems, categories, currency, onDelete, onToggle, onSkip, onConfirm }: { schedules: Schedule[]; pendingItems?: Schedule[]; categories: Category[]; currency: string; onDelete: (id: string) => void; onToggle: (id: string) => void; onSkip: (id: string) => void; onConfirm: (s: Schedule) => Promise<void> }) {
  const [deleting, setDeleting] = useState<Schedule | null>(null);
  const pending = pendingSchedules(pendingItems ?? schedules);
  return <><Card className="pending-card"><div className="card-heading"><div><span className="section-kicker">UP NEXT FOR REVIEW</span><h2>{pending.length ? `${pending.length} pending ${pending.length === 1 ? 'occurrence' : 'occurrences'}` : 'All caught up'}</h2></div>{pending.length > 1 && <Button href="/recurring/review" variant="quiet">View all</Button>}</div>{pending.length ? <PendingRow item={pending[0]} categories={categories} currency={currency} onSkip={onSkip} onConfirm={onConfirm}/> : <p className="subtle-copy">Upcoming occurrences will appear here for you to review and confirm. Nothing is added automatically.</p>}</Card><Card className="ledger-card schedule-card">{schedules.length ? <ListDisplay sorts={scheduleSorts} items={schedules} label="schedules" searchText={(s) => `${s.name} ${s.category}`} filters={[{ label: "All statuses", options: [{ value: "active", label: "Active" }, { value: "paused", label: "Paused" }], matches: (s, value) => value === "paused" ? !!s.paused : !s.paused }, { label: "All frequencies", options: ["Weekly", "Monthly", "Yearly"].map((value) => ({ value, label: value })), matches: (s, value) => s.cadence === value }]}>{(rows) => <div className="schedule-list">{rows.map((s) => <div className={`schedule-row ${s.paused ? 'paused' : ''}`} key={s.id}><span className={`transaction-icon ${categoryColor(categories, s.category, s.kind)}`}><CategoryIcon categories={categories} name={s.category} kind={s.kind}/></span><Link href={`/recurring/${s.id}`} className="schedule-copy"><strong>{s.name}</strong><small>{s.category || 'Uncategorized'} · {s.cadence} · next {prettyDate(s.nextDate)}{s.paused ? ' · paused' : ''}</small></Link><b className={s.kind}>{s.kind === 'income' ? '+' : '−'}{fmt(s.amount, currency)}</b><div className="schedule-actions"><button type="button" className="icon-button row-action schedule-toggle" aria-label={`${s.paused ? 'Resume' : 'Pause'} ${s.name}`} title={s.paused ? 'Resume' : 'Pause'} onClick={() => onToggle(s.id)}>{s.paused ? <Play size={16}/> : <Pause size={16}/>}</button><button type="button" className="icon-button row-action schedule-delete" aria-label={`Delete ${s.name}`} title="Delete" onClick={() => setDeleting(s)}><Trash2 size={16}/></button><ChevronRight className="mobile-row-chevron" size={17} aria-hidden="true"/></div></div>)}</div>}</ListDisplay> : <Empty title="No schedules yet" detail="Add a regular bill or income and review it when it comes up." action={<Button href="/recurring/new" variant="primary">Create a schedule</Button>}/>}</Card><Modal.Root opened={!!deleting} onClose={() => setDeleting(null)} unstyled><Modal.Overlay className="radix-dialog-overlay"/><Modal.Content classNames={{ content: 'commit-review-dialog' }} transitionProps={{ transition: 'fade' }}><div className="commit-review-heading"><Modal.Title className="dialog-title">Delete schedule?</Modal.Title><button type="button" className="icon-button" aria-label="Close" onClick={() => setDeleting(null)}><X size={18}/></button></div><p className="helper-note">Delete {deleting?.name} and its pending occurrence? Existing transactions will remain. This cannot be undone.</p><div className="form-actions"><Button onClick={() => setDeleting(null)}>Keep schedule</Button><Button variant="danger" onClick={() => { if (deleting) onDelete(deleting.id); setDeleting(null); }}>Delete schedule</Button></div></Modal.Content></Modal.Root></>;
}

function ScheduleForm({ categories, currency = 'IDR', onSave }: { categories: Category[]; currency?: string; onSave: (s: Omit<Schedule, 'id'>) => Promise<void> }) {
  const [kind, setKind] = useState<Kind>('expense'); const [name, setName] = useState(''); const [amount, setAmount] = useState(''); const [category, setCategory] = useState(''); const [cadence, setCadence] = useState<'Weekly' | 'Monthly' | 'Yearly'>('Monthly'); const [initialDate] = useState(() => { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`; }); const [date, setDate] = useState(initialDate); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const choices = categories.filter((c) => c.kind === kind);
  useEffect(() => { if (category && !choices.some((c) => c.name === category)) setCategory(''); }, [category, choices]);
  useUnsavedChanges(Boolean(name || amount || kind !== 'expense' || cadence !== 'Monthly' || date !== initialDate || category));
  function submit(e: FormEvent) { e.preventDefault(); const value = Number(amount); if (!name.trim() || !Number.isSafeInteger(value) || value <= 0) { setError('Add a description and an amount greater than zero.'); return; } setBusy(true); setError(''); void onSave({ name: name.trim(), amount: value, category, kind, cadence, nextDate: date }).catch((failure) => setError(failure instanceof Error ? failure.message : 'Could not create schedule')).finally(() => setBusy(false)); }
  return <form className="form-layout recurring-form" onSubmit={submit}><Card className="form-card"><div className="form-intro"><span className="form-icon"><Repeat2 size={18}/></span><div><h2>What comes around?</h2><p>We’ll make each occurrence a draft for you to review.</p></div></div><div className="segmented-control"><button type="button" className={kind === 'expense' ? 'selected expense-selected' : ''} onClick={() => setKind('expense')}><ArrowUpRight size={16}/>Expense</button><button type="button" className={kind === 'income' ? 'selected income-selected' : ''} onClick={() => setKind('income')}><ArrowDownLeft size={16}/>Income</button></div><div className="form-grid"><Field label="Amount" required><AmountInput value={amount} onChange={setAmount} currency={currency} ariaLabel="Schedule amount"/></Field><Field label="Name" required><input required value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Rent"/></Field><Field label="Category"><SelectInput value={category} onChange={setCategory} ariaLabel="Category" options={[{ value: "", label: "Uncategorized" }, ...choices.map((c) => ({ value: c.name, label: c.name }))]} /></Field><Field label="Repeats" required><SelectInput required value={cadence} onChange={(value) => setCadence(value as typeof cadence)} ariaLabel="Repeats" options={['Weekly', 'Monthly', 'Yearly'].map((value) => ({ value, label: value }))} /></Field><Field label="Next occurrence" required labelControl={false}><DatePicker ariaLabel="Next occurrence date" required value={date} onChange={setDate}/></Field></div>{error && <p className="form-error">{error}</p>}<div className="form-actions"><Button href="/recurring">Cancel</Button><Button type="submit" variant="primary" disabled={busy || !name.trim() || !Number.isSafeInteger(Number(amount)) || Number(amount) <= 0 || !date || !cadence || (category !== '' && !choices.some((item) => item.name === category))}><Check size={16}/>Create schedule</Button></div></Card></form>;
}

function ScheduleDetails({ schedule, categories, currency = 'IDR', onSave, onDelete, goBack }: { categories: Category[]; currency?: string; goBack: (fallback: string) => void; schedule?: Schedule; onDelete: () => void; onSave: (updates: Partial<Schedule>) => void }) {
  const [name, setName] = useState(schedule?.name ?? ''); const [amount, setAmount] = useState(String(schedule?.amount ?? '')); const [date, setDate] = useState(schedule?.nextDate ?? ''); const [category, setCategory] = useState(schedule?.category ?? ''); const [cadence, setCadence] = useState<Schedule['cadence']>(schedule?.cadence ?? 'Monthly'); const [paused, setPaused] = useState(!!schedule?.paused); const [confirmDelete, setConfirmDelete] = useState(false);
  useEffect(() => { setName(schedule?.name ?? ''); setAmount(String(schedule?.amount ?? '')); setDate(schedule?.nextDate ?? ''); setCategory(schedule?.category ?? ''); setCadence(schedule?.cadence ?? 'Monthly'); setPaused(!!schedule?.paused); }, [schedule]);
  useUnsavedChanges(Boolean(schedule && (name !== schedule.name || amount !== String(schedule.amount) || date !== schedule.nextDate || category !== schedule.category || cadence !== schedule.cadence || paused !== !!schedule.paused)));
  const changed = Boolean(schedule && (name !== schedule.name || amount !== String(schedule.amount) || date !== schedule.nextDate || category !== schedule.category || cadence !== schedule.cadence || paused !== !!schedule.paused));
  if (!schedule) return <Card><Empty title="Schedule not found" detail="This schedule may have been removed." action={<Button onClick={() => goBack('/recurring')}>Back</Button>}/></Card>;
  return <><div className="detail-layout detail-full-width"><Card className="detail-card"><form onSubmit={(e) => { e.preventDefault(); const value = Number(amount); if (name.trim() && Number.isSafeInteger(value) && value > 0) onSave({ name: name.trim(), amount: value, nextDate: date, category, cadence, paused }); }}><div className="form-grid"><Field label="Amount" required><AmountInput value={amount} onChange={setAmount} currency={currency} ariaLabel="Schedule amount"/></Field><Field label="Name" required><input required value={name} onChange={(e) => setName(e.target.value)}/></Field><Field label="Next occurrence" required labelControl={false}><DatePicker ariaLabel="Next occurrence date" required value={date} onChange={setDate}/></Field><Field label="Category"><SelectInput value={category} onChange={setCategory} ariaLabel="Category" options={[{ value: "", label: "Uncategorized" }, ...categories.filter((c) => c.kind === schedule.kind).map((c) => ({ value: c.name, label: c.name }))]} /></Field></div><div className="form-grid"><Field label="Repeats" required><SelectInput required value={cadence} onChange={(value) => setCadence(value as Schedule['cadence'])} ariaLabel="Repeats" options={['Weekly', 'Monthly', 'Yearly'].map((value) => ({ value, label: value }))} /></Field><Field label="Status" labelControl={false}><div className="schedule-status"><button type="button" className="schedule-status-switch" role="switch" aria-label="Schedule active" aria-checked={!paused} onClick={() => setPaused(!paused)}><span /></button><span>{paused ? 'Paused' : 'Active'}</span></div></Field></div><p className="helper-note">Schedule edits affect future occurrences. Each due item appears in Recurring for you to confirm, skip, or leave waiting.</p><div className="form-actions"><Button variant="danger" onClick={() => setConfirmDelete(true)}><Trash2 size={15}/>Delete</Button><Button type="submit" variant="primary" disabled={!changed || !name.trim() || !Number.isSafeInteger(Number(amount)) || Number(amount) <= 0 || !date || !cadence}><Check size={15}/>Save future details</Button></div></form></Card></div><DeleteDialog opened={confirmDelete} onClose={() => setConfirmDelete(false)} onConfirm={onDelete} title="Delete schedule?" detail="The schedule and its pending occurrence will be deleted. Existing transactions will remain. This cannot be undone." action="Delete schedule"/></>;
}

const categoryIcons = [
  { id: 'sparkles', label: 'General', Icon: Sparkles },
  { id: 'home', label: 'Home', Icon: Home },
  { id: 'food', label: 'Food', Icon: Utensils },
  { id: 'shopping', label: 'Shopping', Icon: ShoppingCart },
  { id: 'transport', label: 'Transport', Icon: Car },
  { id: 'health', label: 'Health', Icon: HeartPulse },
  { id: 'work', label: 'Work', Icon: BriefcaseBusiness },
  { id: 'gift', label: 'Gifts', Icon: Gift },
  { id: 'music', label: 'Music', Icon: Music },
  { id: 'pets', label: 'Pets', Icon: PawPrint },
  { id: 'travel', label: 'Travel', Icon: Plane },
  { id: 'learning', label: 'Learning', Icon: BookOpen },
  { id: 'clothing', label: 'Clothing', Icon: Shirt },
  { id: 'money', label: 'Money', Icon: Banknote },
  { id: 'wallet', label: 'Wallet', Icon: Wallet },
  { id: 'calendar', label: 'Calendar', Icon: CalendarDays },
  { id: 'receipt', label: 'Receipt', Icon: ReceiptText },
  { id: 'tag', label: 'Tag', Icon: Tag },
];
function categoryColor(categories: Category[], name: string, kind: Kind) {
  return categories.find((item) => item.kind === kind && item.name === name)?.color || 'aqua';
}
function CategoryIcon({ categories, name, kind, size = 18 }: { categories: Category[]; name: string; kind: Kind; size?: number }) {
  const category = categories.find((item) => item.kind === kind && item.name === name);
  const Icon = categoryIcons.find((option) => option.id === category?.icon)?.Icon ?? Sparkles;
  return <Icon size={size} aria-hidden="true"/>;
}
const categoryColors = ['red', 'coral', 'orange', 'lime', 'teal', 'aqua', 'blue', 'indigo', 'violet', 'pink'];

function CategoriesPage({ categories, budgets, transactions, deletedTransactions, schedules, remove }: { categories: Category[]; budgets: Budget[]; transactions: Transaction[]; deletedTransactions: DeletedTransaction[]; schedules: Schedule[]; remove: (id: string) => void }) {
  const [deleting, setDeleting] = useState<Category | null>(null);
  const visible = categories;
  const roots = visible.filter((c) => !c.parent || !visible.some((parent) => parent.kind === c.kind && parent.name === c.parent && !parent.parent));
  return <><Card className="category-card"><ListDisplay sorts={categorySorts} items={roots} label="categories" filters={[{ label: "All types", options: [{ value: "expense", label: "Expenses" }, { value: "income", label: "Income" }], matches: (root, value) => root.kind === value }, { label: "All groups", options: [{ value: "children", label: "With subcategories" }, { value: "single", label: "Without subcategories" }], matches: (root, value) => visible.some((c) => c.kind === root.kind && c.parent === root.name) === (value === "children") }]} searchText={(root) => [root.name, ...visible.filter((c) => c.kind === root.kind && c.parent === root.name).map((c) => c.name)].join(" ")}>{(rows, compare) => <div className="category-list">{rows.flatMap((root) => [root, ...visible.filter((c) => c.kind === root.kind && c.parent === root.name).sort(compare)]).map((c) => { const transactionCount = transactions.filter((t) => t.kind === c.kind && t.category === c.name).length; const budgetCount = c.kind === 'expense' ? budgets.filter((b) => b.category === c.name).length : 0; const scheduleCount = schedules.filter((schedule) => schedule.kind === c.kind && schedule.category === c.name).length; return <div key={c.id} className={`category-item ${c.parent ? 'child-category' : ''}`}><span className={`category-dot ${c.color}`}><CategoryIcon categories={categories} name={c.name} kind={c.kind} size={15}/></span><span className="category-name"><Link className="category-link" href={`/categories/${c.id}`}><strong>{c.name}</strong></Link><span className="category-stats">{transactionCount} {transactionCount === 1 ? 'transaction' : 'transactions'} · {budgetCount} {budgetCount === 1 ? 'budget' : 'budgets'} · {scheduleCount} {scheduleCount === 1 ? 'schedule' : 'schedules'}</span></span><ChevronRight className="mobile-row-chevron category-chevron" size={17} aria-hidden="true"/><div className="row-actions"><button className="icon-button row-action" aria-label={`Delete ${c.name}`} onClick={() => setDeleting(c)}><Trash2 size={16}/></button></div></div>; })}</div>}</ListDisplay></Card><CategoryDeleteDialog deleting={deleting} setDeleting={setDeleting} categories={categories} budgets={budgets} transactions={transactions} deletedTransactions={deletedTransactions} schedules={schedules} remove={remove}/></>;
}

type CategoryDeleteContext = { budgets: Budget[]; transactions: Transaction[]; deletedTransactions: DeletedTransaction[]; schedules: Schedule[]; remove: (id: string) => void };
function CategoryDeleteDialog({ deleting, setDeleting, categories, budgets, transactions, deletedTransactions, schedules, remove }: CategoryDeleteContext & { deleting: Category | null; setDeleting: (category: Category | null) => void; categories: Category[] }) {
  const budgetCount = deleting?.kind === 'expense' ? budgets.filter((b) => b.category === deleting.name).length : 0;
  const transactionCount = deleting ? transactions.filter((t) => t.kind === deleting.kind && t.category === deleting.name).length : 0;
  const deletedCount = deleting ? deletedTransactions.filter((t) => t.kind === deleting.kind && t.category === deleting.name).length : 0;
  const scheduleCount = deleting ? schedules.filter((s) => s.kind === deleting.kind && s.category === deleting.name).length : 0;
  return <Modal.Root opened={!!deleting} onClose={() => setDeleting(null)} unstyled><Modal.Overlay className="radix-dialog-overlay"/><Modal.Content classNames={{ content: "commit-review-dialog" }} transitionProps={{ transition: "fade" }}><div className="commit-review-heading"><Modal.Title className="dialog-title">Delete {deleting?.name}?</Modal.Title><button className="icon-button" type="button" aria-label="Close confirmation" onClick={() => setDeleting(null)}><X size={17}/></button></div><p>{budgetCount > 0 ? `This category is used by ${budgetCount} ${budgetCount === 1 ? 'budget' : 'budgets'} and cannot be deleted. Remove or change the affected budgets first.` : <>{'This category will be removed. '}{deleting && categories.some((c) => c.kind === deleting.kind && c.parent === deleting.name) ? 'Its subcategories will be kept as top-level categories. ' : ''}{transactionCount > 0 && deletedCount > 0 ? `${transactionCount + deletedCount} transactions, including recently deleted ones, will become uncategorized. ` : transactionCount > 0 ? `${transactionCount} ${transactionCount === 1 ? 'transaction' : 'transactions'} will become uncategorized. ` : deletedCount > 0 ? `${deletedCount} ${deletedCount === 1 ? 'recently deleted transaction' : 'recently deleted transactions'} will become uncategorized. ` : ''}{scheduleCount > 0 ? `${scheduleCount} recurring ${scheduleCount === 1 ? 'schedule' : 'schedules'} will become uncategorized.` : ''}</>}</p><div className="commit-review-actions"><Button onClick={() => setDeleting(null)}>{budgetCount ? 'Close' : 'Cancel'}</Button>{!budgetCount && <Button variant="danger" onClick={() => { if (deleting) remove(deleting.id); setDeleting(null); }}>Delete category</Button>}</div></Modal.Content></Modal.Root>;
}

function CategoryForm({ categories, add, editing, deleteContext }: { categories: Category[]; editing?: Category; deleteContext?: CategoryDeleteContext; add: (name: string, kind: Kind, parent: string, icon: string, color: string) => void | Promise<void> }) {
  const [deleting, setDeleting] = useState<Category | null>(null);
  const [saving, setSaving] = useState(false);
  const [kind, setKind] = useState<Kind>(editing?.kind ?? 'expense'); const [name, setName] = useState(editing?.name ?? ''); const [parent, setParent] = useState(editing?.parent ?? ''); const [icon, setIcon] = useState(editing?.icon ?? categoryIcons[0].id); const [color, setColor] = useState(editing?.color ?? 'aqua'); const [error, setError] = useState('');
  const visible = categories.filter((c) => c.kind === kind);
  const hasChildren = !!editing && categories.some((c) => c.kind === editing.kind && c.parent === editing.name);
  useUnsavedChanges(editing ? name !== editing.name || kind !== editing.kind || parent !== (editing.parent ?? '') || icon !== (editing.icon ?? categoryIcons[0].id) || color !== editing.color : Boolean(name || kind !== 'expense' || parent || icon !== categoryIcons[0].id || color !== 'aqua'));
  async function submit(e: FormEvent) { e.preventDefault(); if (saving) return; if (!name.trim()) { setError('Give your category a name first.'); return; } if (categories.some((c) => c.id !== editing?.id && c.kind === kind && c.name.toLowerCase() === name.trim().toLowerCase())) { setError('A category with this name already exists.'); return; } setSaving(true); setError(''); try { await add(name, kind, parent, icon, color); } catch (error) { setError(error instanceof Error ? error.message : 'Could not save category'); } finally { setSaving(false); } }
  return <><form className="form-layout category-form" onSubmit={submit}><Card className="form-card">{!editing && <div className="form-intro"><span className="form-icon violet-icon"><Tag size={18}/></span><div><h2>Add a category</h2><p>Make a label that sounds like you.</p></div></div>}<div className="form-grid"><Field label="Category type" required><SelectInput required value={kind} onChange={(value) => { setKind(value as Kind); setParent(""); }} ariaLabel="Category type" options={editing ? [{ value: editing.kind, label: editing.kind === "expense" ? "Expense" : "Income" }] : [{ value: "expense", label: "Expense" }, { value: "income", label: "Income" }]} /></Field><Field label="Parent category"><SelectInput value={parent} onChange={setParent} ariaLabel="Parent category" options={[{ value: "", label: "No parent category" }, ...visible.filter((c) => !c.parent && c.id !== editing?.id && !hasChildren).map((c) => ({ value: c.name, label: c.name }))]} /></Field></div><Field label="Name" required><input required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Pet care"/></Field>{name.trim() && categories.some((c) => c.id !== editing?.id && c.kind === kind && c.name.toLowerCase() === name.trim().toLowerCase()) && <p className="form-error">A category with this name already exists. Choose a different name.</p>}<Field label="Icon"><div className="category-choice-grid" role="group" aria-label="Choose category icon">{categoryIcons.map(({ id, label, Icon }) => <button key={id} type="button" className={`category-choice ${icon === id ? 'selected' : ''}`} aria-label={`${label} icon`} aria-pressed={icon === id} onClick={() => setIcon(id)}><Icon size={17}/></button>)}</div></Field><Field label="Color"><div className="category-color-choices" role="group" aria-label="Choose category color">{categoryColors.map((value) => <button key={value} type="button" className={`category-color-choice ${value} ${color === value ? 'selected' : ''}`} aria-label={`${value} color`} aria-pressed={color === value} onClick={() => setColor(value)}><span/></button>)}</div></Field>{error && <p className="form-error">{error}</p>}<div className="form-actions">{!editing && <Button href="/categories">Cancel</Button>}{editing && deleteContext && <Button variant="danger" onClick={() => setDeleting(editing)}><Trash2 size={15}/>Delete</Button>}<Button type="submit" variant="primary" disabled={saving || (editing && name === editing.name && kind === editing.kind && parent === (editing.parent ?? '') && icon === (editing.icon ?? categoryIcons[0].id) && color === editing.color) || !name.trim() || categories.some((c) => c.id !== editing?.id && c.kind === kind && c.name.toLowerCase() === name.trim().toLowerCase())}><Check size={15}/>{saving ? 'Saving…' : editing ? 'Save changes' : 'Add category'}</Button></div></Card></form>{deleteContext && <CategoryDeleteDialog {...deleteContext} categories={categories} deleting={deleting} setDeleting={setDeleting}/>}</>;
}

function SettingsPage({ data, save, account }: { data: DemoState; account: boolean; save: (updates: Partial<DemoState>) => void }) {
  const [balance, setBalance] = useState(String(data.openingBalance)); const [currency, setCurrency] = useState(data.currency); const [confirmCurrencyChange, setConfirmCurrencyChange] = useState(false);
  useEffect(() => { setBalance(String(data.openingBalance)); setCurrency(data.currency); }, [data.openingBalance, data.currency]);
  useUnsavedChanges(balance !== String(data.openingBalance) || currency !== data.currency);
  return <div className="settings-layout"><Card className="settings-card"><div className="card-heading"><div><span className="section-kicker">YOUR STARTING POINT</span><h2>Money &amp; display</h2></div><Wallet size={18}/></div><p className="settings-description">Available cash starts with your opening balance, then includes all income and expenses.</p><form onSubmit={(e) => { e.preventDefault(); if (currency !== data.currency) { setConfirmCurrencyChange(true); return; } save({ openingBalance: Number(balance), currency }); }}><Field label="Opening balance" required hint="This amount is separate from income and expenses."><AmountInput value={balance} onChange={setBalance} currency={currency} ariaLabel="Opening balance"/></Field><Field label="Display currency" required hint="Changing display currency does not convert saved amounts."><SelectInput required value={currency} onChange={setCurrency} ariaLabel="Display currency" options={[{ value: "IDR", label: "Indonesian rupiah (IDR)" }, { value: "USD", label: "US dollar (USD)" }, { value: "SGD", label: "Singapore dollar (SGD)" }, { value: "AUD", label: "Australian dollar (AUD)" }]} /></Field><div className="form-actions"><Button type="submit" variant="primary" disabled={!balance || !Number.isSafeInteger(Number(balance)) || !currency || (Number(balance) === data.openingBalance && currency === data.currency)}><Check size={15}/>Save settings</Button></div></form></Card><div className="settings-options"><Link href="/settings/account" className="settings-option"><span className="settings-option-icon"><ShieldCheck size={18}/></span><span><strong>Account &amp; security</strong><small>Profile, password, and account actions</small></span><ArrowRight size={16}/></Link><Card className="settings-language"><Field label="Language"><SelectInput value={data.language === 'id' ? 'id' : 'en'} onChange={(language) => save({ language: language === 'id' ? 'id' : 'en' })} ariaLabel="Language" options={[{ value: 'en', label: 'English' }, { value: 'id', label: 'Bahasa Indonesia' }]} /></Field></Card><Card className="settings-language"><Field label="Default add transaction view"><SelectInput value={data.transactionEntryDefault ?? 'scan'} onChange={(value) => save({ transactionEntryDefault: value === 'manual' ? 'manual' : 'scan' })} ariaLabel="Default add transaction view" options={[{ value: 'manual', label: 'Manual form' }, { value: 'scan', label: 'Scan form' }]} /></Field></Card></div><DeleteDialog opened={confirmCurrencyChange} onClose={() => setConfirmCurrencyChange(false)} onConfirm={() => { setConfirmCurrencyChange(false); save({ openingBalance: Number(balance), currency }); }} title="Change display currency?" detail={`This will relabel your saved amounts from ${data.currency} to ${currency} without converting them. The numbers will stay the same.`} action="Change currency" actionVariant="primary" cancelLabel="Keep current currency"/></div>;
}

function AccountSettings({ session, onSignOut, onDelete }: { session: Session | null; onSignOut: () => void; onDelete: (password: string) => Promise<void> }) {
  const [confirm, setConfirm] = useState(false); const [password, setPassword] = useState(''); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  async function deleteAccount(e: FormEvent) { e.preventDefault(); setBusy(true); setError(''); try { await onDelete(password); setPassword(''); setConfirm(false); } catch (err) { setError(err instanceof Error ? err.message : 'Could not delete account'); } finally { setBusy(false); } }
  return <div className="account-layout"><Card className="account-profile"><span className="large-avatar">{session ? session.user.email[0].toUpperCase() : 'D'}</span><div><h2>{session ? 'Signed in' : 'Demo account'}</h2><p>{session ? session.user.email : 'Browser-local preview'}</p></div></Card><Card className="account-settings"><div className="card-heading"><div><span className="section-kicker">SIGN-IN &amp; SAFETY</span><h2>Account security</h2></div><ShieldCheck size={18}/></div><p className="settings-description">{session ? 'Your transactions, categories, budgets and money settings are saved to your account. Recurring transactions are coming soon.' : 'Sign in to manage your account.'}</p><Link href="/forgot-password" className="security-row"><span><strong>Password</strong><small>Reset your password</small></span><ArrowRight size={16}/></Link><div className="account-buttons"><Button onClick={onSignOut}><LogOut size={15}/>{session ? 'Sign out' : 'Sign in'}</Button>{session && <Button onClick={() => setConfirm(true)} variant="danger"><Trash2 size={15}/>Delete account</Button>}</div></Card><Modal.Root opened={confirm} onClose={() => { if (!busy) { setConfirm(false); setPassword(''); setError(''); } }} unstyled><Modal.Overlay className="radix-dialog-overlay"/><Modal.Content classNames={{ content: "commit-review-dialog" }} transitionProps={{ transition: "fade" }}><div className="commit-review-heading"><Modal.Title className="dialog-title">Delete account</Modal.Title><button type="button" className="icon-button" aria-label="Close confirmation" disabled={busy} onClick={() => setConfirm(false)}><X size={18}/></button></div><form onSubmit={deleteAccount}><p>Access ends immediately. Your account and its saved data will be permanently erased after 30 days.</p><Field label="Password" required><input required type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)}/></Field>{error && <p className="form-error" role="alert">{error}</p>}<div className="form-actions"><Button onClick={() => setConfirm(false)} disabled={busy}>Cancel</Button><Button type="submit" variant="danger" disabled={!password || busy}>{busy ? 'Deleting…' : 'Delete account'}</Button></div></form></Modal.Content></Modal.Root></div>;
}

function AuthContent({ path, go, goBack, notify, setSession }: { path: string; go: (path: string) => void; goBack: (fallback: string) => void; notify: (s: string) => void; setSession: (session: Session | null) => void }) {
  const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [error, setError] = useState(''); const [submitted, setSubmitted] = useState(false); const [busy, setBusy] = useState(false); const [token, setToken] = useState('');
  const isSignIn = path === '/sign-in'; const isSignUp = path === '/sign-up'; const isVerify = path === '/verify-email'; const isForgot = path === '/forgot-password'; const isReset = path === '/reset-password';
  const tokenRef = useRef('');
  const [linkStatus, setLinkStatus] = useState<'checking' | 'valid' | 'invalid' | 'unavailable'>('checking');
  const [linkCheckAttempt, setLinkCheckAttempt] = useState(0);
  useEffect(() => { const readToken = () => { const params = new URLSearchParams(window.location.hash.slice(1)); const value = params.get('token'); if (value) { if (value !== tokenRef.current) setPassword(''); tokenRef.current = value; setToken(value); setLinkStatus('checking'); setLinkCheckAttempt((attempt) => attempt + 1); setError(''); setSubmitted(false); } else if ((isVerify || isReset) && !tokenRef.current) { setLinkStatus('invalid'); } if (window.location.hash) history.replaceState(history.state, '', window.location.pathname + window.location.search); }; readToken(); window.addEventListener('hashchange', readToken); return () => window.removeEventListener('hashchange', readToken); }, [isVerify, isReset]);
  useEffect(() => { if ((!isVerify && !isReset) || !token) return; let active = true; setLinkStatus('checking'); apiRequest(isVerify ? '/auth/verification/check' : '/auth/password-reset/check', { token }).then(() => { if (active) setLinkStatus('valid'); }).catch((err) => { if (active) setLinkStatus(err instanceof ApiError && err.code === 'invalid_link' ? 'invalid' : 'unavailable'); }); return () => { active = false; }; }, [token, isVerify, isReset, linkCheckAttempt]);
  async function submit(e: FormEvent) {
    e.preventDefault(); setError(''); setBusy(true);
    const submittedToken = token;
    try {
      if (isSignIn) { const result = await apiRequest<Session>('/auth/login', { email, password }); setSession(result); setPassword(''); notify('Signed in'); go('/'); }
      else if (isSignUp) { await apiRequest('/auth/register', { email }); setSubmitted(true); }
      else if (isForgot) { await apiRequest('/auth/password-reset/request', { email }); setSubmitted(true); }
      else if (isReset) { await apiRequest('/auth/password-reset/confirm', { token, password }); if (tokenRef.current !== submittedToken) return; setPassword(''); setSubmitted(true); }
      else if (isVerify) { await apiRequest('/auth/verification/confirm', { token, password }); if (tokenRef.current !== submittedToken) return; setPassword(''); setSubmitted(true); }
    } catch (err) { if ((isVerify || isReset) && tokenRef.current !== submittedToken) return; if ((isVerify || isReset) && err instanceof ApiError && err.code === 'invalid_link') { setPassword(''); setLinkStatus('invalid'); } else { setError(err instanceof Error ? err.message : 'Could not reach the server. Try again.'); } } finally { setBusy(false); }
  }
  if ((isVerify || isReset) && !submitted && linkStatus !== 'valid') {
    if (linkStatus === 'checking') return <Card className="auth-card"><span className="auth-icon"><ShieldCheck size={23}/></span><h1>Checking your link</h1><p>Please wait a moment.</p></Card>;
    if (linkStatus === 'unavailable') return <Card className="auth-card"><span className="auth-icon"><ShieldCheck size={23}/></span><h1>Couldn’t check your link</h1><p>Something went wrong. Please try again.</p><Button variant="primary" onClick={() => setLinkCheckAttempt((attempt) => attempt + 1)}>Try again</Button></Card>;
    return <Card className="auth-card"><span className="auth-icon"><ShieldCheck size={23}/></span><h1>Link expired or invalid</h1><p>This link may have expired or already been used. Request a new one to continue.</p><Button className="auth-recovery-primary" href={isVerify ? '/sign-up' : '/forgot-password'} variant="primary">{isVerify ? 'Request a new verification link' : 'Request a new reset link'}<ArrowRight size={15}/></Button><Link className="auth-inline" href="/sign-in">Back to sign in</Link></Card>;
  }
  if (submitted) return <Card className="auth-card"><span className="auth-icon"><ShieldCheck size={23}/></span><h1>{isSignUp || isForgot ? 'Check your inbox' : isVerify ? 'Email verified' : 'Password changed'}</h1><p>{isSignUp ? 'If this email can be used to create an account, you’ll receive a verification link. Please wait a minute between requests.' : isForgot ? 'If an account exists for this email, you’ll receive a link to reset your password.' : 'You can now sign in.'}</p><Button href="/sign-in" variant="primary">Continue to sign in <ArrowRight size={15}/></Button></Card>;
  return <Card className="auth-card"><span className="auth-icon">{isSignIn ? <Wallet size={22}/> : <Sparkles size={22}/>}</span><h1>{isVerify ? 'Verify your email' : getTitle(path)}</h1>{isVerify && <p>Choose a password to finish setting up your account.</p>}<form onSubmit={submit}>{!isVerify && !isReset && <Field label="Email address" required><input required type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com"/></Field>}{!isForgot && !isSignUp && <Field label={isVerify ? 'Create password' : isReset ? 'New password' : 'Password'} required hint={isSignIn ? undefined : 'At least 12 characters.'}><input required minLength={isSignIn ? 1 : 12} maxLength={128} type="password" autoComplete={isVerify || isReset ? 'new-password' : 'current-password'} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••"/></Field>}{(isVerify || isReset) && !token && <p className="form-error">Open the link from your email to continue.</p>}{error && <p className="form-error" role="alert">{error}</p>}<div className="auth-actions">{isSignIn && demoAccountEmail && demoAccountPassword && <Button type="button" variant="secondary" onClick={() => { setEmail(demoAccountEmail); setPassword(demoAccountPassword); setError(''); }}>Demo</Button>}<Button type="submit" variant="primary" disabled={busy || ((isVerify || isReset) && !token) || (!isVerify && !isReset && !/^[^\s@]+@[^\s@]+$/.test(email)) || (!isForgot && !isSignUp && password.length < (isSignIn ? 1 : 12))}>{busy ? 'Please wait…' : isSignIn ? 'Sign in' : isSignUp ? 'Send verification link' : isForgot ? 'Send reset link' : isVerify ? 'Verify and create account' : 'Save new password'}<ArrowRight size={15}/></Button></div></form>{isSignIn && <Link className="auth-inline" href="/forgot-password">Forgot password?</Link>}<div className="auth-foot">{isSignIn ? <>New to Pocket Buddy? <Link href="/sign-up">Create an account</Link></> : isSignUp ? <>Already have an account? <Link href="/sign-in">Sign in</Link></> : <button type="button" className="auth-back" onClick={() => goBack('/sign-in')}>Back</button>}</div></Card>;
}
