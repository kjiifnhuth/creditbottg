import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Home, CreditCard, TrendingDown, CalendarDays, Settings, LogOut, Plus,
  Pencil, Trash2, Check, Moon, Sun, Menu, X, Download, FileText,
  ShieldCheck, Eye, EyeOff, Search, ArrowDownRight, Upload, Target,
  WalletCards, ArrowUpRight, Calculator, RotateCcw, ArrowRight
} from 'lucide-react';
import './styles.css';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY || '';
const supabase = SUPABASE_URL && SUPABASE_ANON_KEY
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    })
  : null;
const cloudEnabled = Boolean(supabase);

const KEY = 'credit_manager_v2';
const LEGACY_KEY = 'credit_manager_v1';

// Pre-instantiated formatters for 50x faster rendering on mobile
const moneyFmt = new Intl.NumberFormat('uk-UA', {
  style: 'currency',
  currency: 'UAH',
  maximumFractionDigits: 0
});
const dateFormatter = new Intl.DateTimeFormat('uk-UA', {
  day: 'numeric',
  month: 'short',
  year: 'numeric'
});

const uid = () => crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const money = v => moneyFmt.format(Math.max(0, Number(v) || 0));
const n = v => Number(String(v ?? '').replace(/\s/g, '').replace(',', '.')) || 0;
const hash = s => {
  let h = 2166136261;
  for (const c of s) {
    h ^= c.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16);
};

const safeStorageGet = key => {
  try { return localStorage.getItem(key); } catch { return null; }
};
const safeStorageSet = (key, val) => {
  try { localStorage.setItem(key, val); } catch {}
};

const emptyState = () => ({ users: [], session: null, theme: 'light' });

const OVERPAY_MODES_KEY = 'credit_manager_overpay_modes_v1';
function getSavedOverpayModes() {
  try {
    return JSON.parse(safeStorageGet(OVERPAY_MODES_KEY) || '{}') || {};
  } catch {
    return {};
  }
}
function saveOverpayMode(id, mode) {
  if (!id) return;
  const map = getSavedOverpayModes();
  map[id] = mode === 'reduce_last' ? 'reduce_last' : 'reduce_payment';
  safeStorageSet(OVERPAY_MODES_KEY, JSON.stringify(map));
}

function normalizeCredit(c) {
  const savedModes = getSavedOverpayModes();
  const mode = c.overpayMode || savedModes[c.id] || 'reduce_last';
  return {
    ...c,
    interestPolicy: c.interestPolicy === 'full_term' ? 'full_term' : 'actual',
    overpayMode: mode === 'reduce_payment' ? 'reduce_payment' : 'reduce_last',
    payments: Array.isArray(c.payments) ? c.payments : []
  };
}

function normalizeLimit(l) {
  const savedModes = getSavedOverpayModes();
  const mode = l.overpayMode || savedModes[l.id] || 'reduce_payment';
  return {
    ...l,
    overpayMode: mode === 'reduce_last' ? 'reduce_last' : 'reduce_payment',
    payments: Array.isArray(l.payments) ? l.payments : []
  };
}

function load() {
  try {
    const rawCurrent = safeStorageGet(KEY);
    const current = rawCurrent ? JSON.parse(rawCurrent) : null;
    if (current?.users) {
      return {
        ...current,
        users: current.users.map(u => ({
          ...u,
          credits: (u.credits || []).map(normalizeCredit),
          limits: (u.limits || []).map(normalizeLimit)
        }))
      };
    }
    const rawLegacy = safeStorageGet(LEGACY_KEY);
    const legacy = rawLegacy ? JSON.parse(rawLegacy) : null;
    if (legacy?.users) {
      const migrated = {
        ...legacy,
        users: legacy.users.map(u => ({
          ...u,
          credits: (u.credits || []).map(normalizeCredit),
          limits: (u.limits || []).map(normalizeLimit)
        }))
      };
      safeStorageSet(KEY, JSON.stringify(migrated));
      return migrated;
    }
    return emptyState();
  } catch {
    return emptyState();
  }
}

function save(s) {
  safeStorageSet(KEY, JSON.stringify(s));
}

const localBackup = () => {
  try { return load(); } catch { return emptyState(); }
};

function mapCreditRow(r) {
  return normalizeCredit({
    id: r.id,
    name: r.name,
    initialAmount: r.initial_amount,
    balance: r.balance,
    rate: r.rate,
    type: r.type,
    payment: r.payment,
    dueDay: r.due_day,
    termMonths: r.term_months,
    interestPolicy: r.interest_policy,
    payments: Array.isArray(r.payments) ? r.payments : []
  });
}

function mapLimitRow(r) {
  return normalizeLimit({
    id: r.id,
    name: r.name,
    limit: r.credit_limit,
    used: r.used,
    rate: r.rate,
    minPayment: r.min_payment,
    gracePayment: r.grace_payment,
    dueDay: r.due_day,
    payments: Array.isArray(r.payments) ? r.payments : [],
    planPayment: r.plan_payment
  });
}

function creditRow(userId, c) {
  return {
    id: c.id,
    user_id: userId,
    name: String(c.name || ''),
    initial_amount: n(c.initialAmount),
    balance: n(c.balance),
    rate: n(c.rate),
    type: c.type === 'diff' ? 'diff' : 'annuity',
    payment: n(c.payment),
    due_day: Math.min(31, Math.max(1, n(c.dueDay) || 1)),
    term_months: Math.max(1, n(c.termMonths) || 1),
    interest_policy: c.interestPolicy === 'full_term' ? 'full_term' : 'actual',
    payments: Array.isArray(c.payments) ? c.payments : []
  };
}

function limitRow(userId, l) {
  return {
    id: l.id,
    user_id: userId,
    name: String(l.name || ''),
    credit_limit: n(l.limit),
    used: n(l.used),
    rate: n(l.rate),
    min_payment: n(l.minPayment),
    grace_payment: n(l.gracePayment),
    due_day: Math.min(31, Math.max(1, n(l.dueDay) || 1)),
    payments: Array.isArray(l.payments) ? l.payments : [],
    plan_payment: l.planPayment == null ? null : n(l.planPayment)
  };
}

async function fetchCloudUser(authUser) {
  if (!supabase) return null;
  const [
    { data: profileRow, error: profileError },
    { data: creditRows, error: creditError },
    { data: limitRows, error: limitError }
  ] = await Promise.all([
    supabase.from('profiles').select('id,name,theme').eq('id', authUser.id).maybeSingle(),
    supabase.from('credits').select('*').eq('user_id', authUser.id).order('created_at', { ascending: false }),
    supabase.from('credit_limits').select('*').eq('user_id', authUser.id).order('created_at', { ascending: false })
  ]);
  if (profileError) throw profileError;
  if (creditError) throw creditError;
  if (limitError) throw limitError;
  let profile = profileRow;
  if (!profile) {
    const name = authUser.user_metadata?.name || authUser.email?.split('@')[0] || 'Користувач';
    const { data: newProfile, error } = await supabase
      .from('profiles')
      .insert({ id: authUser.id, name, theme: 'light' })
      .select('id,name,theme')
      .single();
    if (error) throw error;
    profile = newProfile;
  }
  return {
    id: authUser.id,
    name: profile.name || authUser.user_metadata?.name || 'Користувач',
    email: authUser.email || '',
    credits: (creditRows || []).map(mapCreditRow),
    limits: (limitRows || []).map(mapLimitRow),
    theme: profile.theme === 'dark' ? 'dark' : 'light'
  };
}

async function upsertCloudProfile(user, theme) {
  if (!supabase) return;
  const { error } = await supabase.from('profiles').upsert({
    id: user.id,
    name: user.name || 'Користувач',
    theme: theme === 'dark' ? 'dark' : 'light'
  });
  if (error) throw error;
}

// Optimized differential sync: only deletes removed items and upserts modified/added items
async function syncCollection(table, userId, oldItems, newItems, mapper) {
  if (!supabase) return;
  const oldMap = new Map(oldItems.map(x => [x.id, JSON.stringify(mapper(userId, x))]));
  const newIds = new Set(newItems.map(x => x.id));
  const removed = [...oldMap.keys()].filter(id => !newIds.has(id));
  if (removed.length) {
    const { error } = await supabase.from(table).delete().eq('user_id', userId).in('id', removed);
    if (error) throw error;
  }
  const changed = newItems
    .map(x => mapper(userId, x))
    .filter(row => oldMap.get(row.id) !== JSON.stringify(row));
  if (changed.length) {
    const { error } = await supabase.from(table).upsert(changed, { onConflict: 'id' });
    if (error) throw error;
  }
}

async function syncCloudUser(userId, oldUser, newUser, theme) {
  if (!supabase) return;
  await Promise.all([
    upsertCloudProfile(newUser, theme),
    syncCollection('credits', userId, oldUser?.credits || [], newUser.credits || [], creditRow),
    syncCollection('credit_limits', userId, oldUser?.limits || [], newUser.limits || [], limitRow)
  ]);
}

async function importLocalDataToCloud(authUser, localUser) {
  if (!supabase || !localUser) return;
  const credits = (localUser.credits || []).map(c => creditRow(authUser.id, { ...c, id: c.id || uid() }));
  const limits = (localUser.limits || []).map(l => limitRow(authUser.id, { ...l, id: l.id || uid() }));
  if (credits.length) {
    const { error } = await supabase.from('credits').upsert(credits, { onConflict: 'id' });
    if (error) throw error;
  }
  if (limits.length) {
    const { error } = await supabase.from('credit_limits').upsert(limits, { onConflict: 'id' });
    if (error) throw error;
  }
  await upsertCloudProfile(
    { id: authUser.id, name: localUser.name || authUser.user_metadata?.name || 'Користувач' },
    localUser.theme || 'light'
  );
}

async function parseBackupFile(file, currentEmail) {
  if (!file) throw new Error('Файл не вибрано.');
  let backup;
  try {
    backup = JSON.parse(await file.text());
  } catch (error) {
    throw new Error(`Не вдалося прочитати JSON-файл: ${error?.message || 'невідомий формат'}`);
  }
  if (!backup || backup.version !== 1 || !Array.isArray(backup.users)) {
    throw new Error('Неправильний формат резервної копії. Потрібен credit-manager-backup.json версії 1.');
  }
  const users = backup.users.filter(Boolean);
  if (!users.length) throw new Error('У резервній копії немає користувачів.');
  const targetEmail = String(currentEmail || '').trim().toLowerCase();
  const exact = users.find(u => String(u?.email || '').trim().toLowerCase() === targetEmail);
  const source = exact || (users.length === 1 ? users[0] : users[0]);
  const sourceCredits = Array.isArray(source.credits) ? source.credits : [];
  const sourceLimits = Array.isArray(source.limits) ? source.limits : [];
  if (!sourceCredits.length && !sourceLimits.length) {
    throw new Error(`У резервній копії користувача «${source.name || source.email || 'без імені'}» немає записів.`);
  }
  return { source, sourceCredits, sourceLimits };
}

function annuity(balance, monthsCount, rate) {
  const r = n(rate) / 100 / 12;
  if (!balance || !monthsCount) return 0;
  if (!r) return balance / monthsCount;
  return (balance * r * Math.pow(1 + r, monthsCount)) / (Math.pow(1 + r, monthsCount) - 1);
}

function computeActualSchedule(c, extra = 0) {
  let b = n(c.balance);
  const p = n(c.payment) + n(extra);
  const r = n(c.rate) / 100 / 12;
  const rows = [];
  const diffBase = n(c.initialAmount) / Math.max(1, n(c.termMonths));
  for (let i = 1; b > 0.01 && i < 601; i++) {
    const interest = b * r;
    const principal = c.type === 'diff'
      ? Math.min(b, diffBase)
      : Math.min(b, Math.max(0, p - interest));
    if (principal <= 0.001) break;
    b = Math.max(0, b - principal);
    rows.push({
      month: i,
      payment: principal + interest,
      principal,
      interest,
      balance: b
    });
  }
  return rows;
}

function schedule(c, extra = 0) {
  const rows = computeActualSchedule(c, extra);
  if (c.interestPolicy === 'full_term' && rows.length) {
    const baseRows = extra === 0 ? rows : computeActualSchedule(c, 0);
    const contractualInterest = baseRows.reduce((sum, row) => sum + row.interest, 0);
    const shownInterest = rows.reduce((sum, row) => sum + row.interest, 0);
    if (contractualInterest > shownInterest + 0.01) {
      const diff = contractualInterest - shownInterest;
      const last = { ...rows[rows.length - 1] };
      last.interest += diff;
      last.payment += diff;
      rows[rows.length - 1] = last;
    }
  }
  return rows;
}

function months(c, extra = 0) {
  return computeActualSchedule(c, extra).length;
}

function forecastInterest(c, extra = 0) {
  return computeActualSchedule(c, extra).reduce((sum, row) => sum + row.interest, 0);
}

function earlyPaymentPreview(c, amount, modeOverride, kind = 'early') {
  const mode = modeOverride || c.overpayMode || 'reduce_last';
  const oldBalance = n(c.balance);
  const oldPayment = n(c.payment);
  const a = Math.min(Math.max(0, n(amount)), oldBalance);
  const baseSched = schedule(c, 0);
  const oldMonths = baseSched.length;
  const oldLastPayment = oldMonths ? baseSched[oldMonths - 1].payment : 0;
  const baseline = forecastInterest(c, 0);

  if (a <= 0 || oldBalance <= 0) {
    return {
      newBalance: oldBalance,
      oldPayment,
      newPayment: oldPayment,
      oldLastPayment,
      newLastPayment: oldLastPayment,
      oldMonths,
      newMonths: oldMonths,
      saving: 0,
      remainingInterest: baseline,
      mode
    };
  }

  const newBalance = Math.max(0, oldBalance - a);
  if (newBalance <= 0.01) {
    return {
      newBalance: 0,
      oldPayment,
      newPayment: 0,
      oldLastPayment,
      newLastPayment: 0,
      oldMonths,
      newMonths: 0,
      saving: c.interestPolicy === 'full_term' ? 0 : baseline,
      remainingInterest: c.interestPolicy === 'full_term' ? baseline : 0,
      mode
    };
  }

  const isOverpay = kind === 'early' || a > oldPayment;
  let newPayment = oldPayment;
  const targetMonths = Math.max(1, kind === 'regular' ? Math.max(1, oldMonths - 1) : oldMonths || n(c.termMonths) || 12);

  if (isOverpay && mode === 'reduce_payment') {
    if (c.type === 'diff') {
      const r = n(c.rate) / 100 / 12;
      newPayment = (newBalance / targetMonths) + newBalance * r;
    } else {
      newPayment = annuity(newBalance, targetMonths, n(c.rate));
    }
    newPayment = Math.min(oldPayment, newPayment);
  } else if (newBalance < oldPayment) {
    const r = n(c.rate) / 100 / 12;
    newPayment = newBalance + newBalance * r;
  }

  const reduced = {
    ...c,
    balance: newBalance,
    initialAmount: isOverpay && mode === 'reduce_payment' && c.type === 'diff' ? newBalance : c.initialAmount,
    termMonths: isOverpay && mode === 'reduce_payment' && c.type === 'diff' ? targetMonths : c.termMonths,
    payment: newPayment
  };
  const newSched = schedule(reduced, 0);
  const newMonths = newSched.length;
  const newLastPayment = newMonths ? newSched[newMonths - 1].payment : 0;
  const remaining = forecastInterest(reduced, 0);

  return {
    newBalance,
    oldPayment,
    newPayment,
    oldLastPayment,
    newLastPayment,
    oldMonths,
    newMonths,
    saving: c.interestPolicy === 'full_term' ? 0 : Math.max(0, baseline - remaining),
    remainingInterest: c.interestPolicy === 'full_term' ? baseline : remaining,
    mode
  };
}

function dateFor(day) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const safe = Math.min(28, Math.max(1, n(day) || 1));
  let d = new Date(today.getFullYear(), today.getMonth(), safe);
  if (d < today) d = new Date(today.getFullYear(), today.getMonth() + 1, safe);
  return d;
}

function daysUntilDue(day) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = dateFor(day);
  return Math.round((target - today) / 86400000);
}

function isPaidThisMonth(item) {
  const now = new Date();
  const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  return (item.payments || []).some(p => String(p.date || '').startsWith(ym));
}

const dateFmt = d => dateFormatter.format(d);

function DueBadge({ item, balance }) {
  if (n(balance) <= 0) return <span className="badge ok"><Check size={11}/> Погашено</span>;
  if (isPaidThisMonth(item)) return <span className="badge ok"><Check size={11}/> Внесено цього місяця</span>;
  const days = daysUntilDue(item.dueDay);
  if (days === 0) return <span className="badge urgent">Платіж сьогодні</span>;
  if (days <= 3) return <span className="badge urgent">Через {days} дн.</span>;
  if (days <= 7) return <span className="badge warn">Через {days} дн.</span>;
  return <span className="badge neutral">до {dateFmt(dateFor(item.dueDay))}</span>;
}

function Field({ label, children }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}

function ConfirmSheet({ data, onCancel }) {
  if (!data) return null;
  return (
    <div className="overlay" onClick={onCancel}>
      <section className="modal" style={{ maxWidth: 420 }} onClick={e => e.stopPropagation()}>
        <div className="sheet-handle" />
        <header className="modal-head">
          <div>
            <p className="eyebrow">ПІДТВЕРДЖЕННЯ</p>
            <h2>{data.title || 'Підтвердити дію?'}</h2>
          </div>
          <button type="button" className="round" onClick={onCancel} aria-label="Закрити"><X/></button>
        </header>
        <p className="muted lead" style={{ marginBottom: 18 }}>{data.message}</p>
        <div className="modal-actions">
          <button type="button" className="btn secondary" onClick={onCancel}>Скасувати</button>
          <button
            type="button"
            className={`btn ${data.danger ? 'danger-soft' : 'primary'}`}
            onClick={() => { data.onConfirm(); onCancel(); }}
          >
            {data.confirmText || 'Підтвердити'}
          </button>
        </div>
      </section>
    </div>
  );
}

const DEMO_CREDITS = [
  {
    id: 'demo-c-1',
    name: 'ПриватБанк — Автокредит',
    initialAmount: 420000,
    balance: 264500,
    rate: 16.5,
    type: 'annuity',
    payment: 12400,
    dueDay: new Date().getDate() + 2 <= 28 ? new Date().getDate() + 2 : 15,
    termMonths: 36,
    interestPolicy: 'actual',
    overpayMode: 'reduce_payment',
    payments: [
      { id: 'p-1', date: new Date(Date.now() - 86400000 * 18).toISOString(), amount: 12400, principal: 8600, interest: 3800, kind: 'regular' }
    ]
  },
  {
    id: 'demo-c-2',
    name: 'Monobank — Оплата частинами (Ноутбук)',
    initialAmount: 54000,
    balance: 27000,
    rate: 0.01,
    type: 'annuity',
    payment: 4500,
    dueDay: 10,
    termMonths: 12,
    interestPolicy: 'actual',
    overpayMode: 'reduce_payment',
    payments: []
  }
];

const DEMO_LIMITS = [
  {
    id: 'demo-l-1',
    name: 'Monobank — Чорна картка',
    limit: 80000,
    used: 24500,
    rate: 37.2,
    minPayment: 1225,
    gracePayment: 24500,
    dueDay: 25,
    planPayment: 8500,
    payments: []
  },
  {
    id: 'demo-l-2',
    name: 'ПриватБанк — Універсальна',
    limit: 50000,
    used: 14200,
    rate: 42.0,
    minPayment: 710,
    gracePayment: 14200,
    dueDay: 20,
    planPayment: null,
    payments: []
  }
];

function Auth({ state, setState, onAuthenticated, notify }) {
  const [m, setM] = useState('login');
  const [email, setE] = useState('');
  const [pass, setP] = useState('');
  const [name, setN] = useState('');
  const [show, setShow] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  const startDemo = () => {
    const demoUser = {
      id: 'demo-user',
      name: 'Олексій',
      email: 'demo@creditmanager.ua',
      password: hash('demo123'),
      credits: DEMO_CREDITS,
      limits: DEMO_LIMITS
    };
    const nextUsers = state.users.some(u => u.email === demoUser.email)
      ? state.users
      : [...state.users, demoUser];
    const target = nextUsers.find(u => u.email === demoUser.email) || demoUser;
    const s = { ...state, users: nextUsers, session: target.id };
    save(s);
    setState(s);
    notify?.('Демо-кабінет відкрито з тестовими даними', 'ok');
  };

  const go = async e => {
    e.preventDefault();
    setErr('');
    setResetSent(false);
    const em = email.trim().toLowerCase();
    if (!em || !pass) return setErr('Заповніть email та пароль.');
    if (!cloudEnabled) {
      if (m === 'reg') {
        if (pass.length < 6) return setErr('Пароль: мінімум 6 символів.');
        if (state.users.some(u => u.email === em)) return setErr('Такий email вже зареєстрований.');
        const u = { id: uid(), name: name.trim() || 'Користувач', email: em, password: hash(pass), credits: [], limits: [] };
        const s = { ...state, users: [...state.users, u], session: u.id };
        save(s);
        setState(s);
        return;
      }
      const u = state.users.find(u => u.email === em && u.password === hash(pass));
      if (!u) return setErr('Невірний email або пароль.');
      const s = { ...state, session: u.id };
      save(s);
      setState(s);
      return;
    }
    try {
      setBusy(true);
      if (m === 'reg') {
        if (pass.length < 6) return setErr('Пароль: мінімум 6 символів.');
        const { data, error } = await supabase.auth.signUp({
          email: em,
          password: pass,
          options: { data: { name: name.trim() || 'Користувач' }, emailRedirectTo: window.location.origin }
        });
        if (error) throw error;
        if (!data.session) {
          setErr('Акаунт створено. Перевірте пошту та підтвердіть email.');
          return;
        }
        await onAuthenticated(data.session.user);
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({ email: em, password: pass });
        if (error) throw error;
        await onAuthenticated(data.user);
      }
    } catch (error) {
      setErr(error.message || 'Не вдалося виконати дію.');
    } finally {
      setBusy(false);
    }
  };

  const forgot = async () => {
    setErr('');
    setResetSent(false);
    const em = email.trim().toLowerCase();
    if (!em) return setErr('Введіть email для відновлення пароля.');
    if (!cloudEnabled) return setErr('Відновлення пароля доступне після підключення хмарного акаунта.');
    try {
      setBusy(true);
      const { error } = await supabase.auth.resetPasswordForEmail(em, { redirectTo: window.location.origin });
      if (error) throw error;
      setResetSent(true);
    } catch (error) {
      setErr(error.message || 'Не вдалося надіслати лист.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="auth">
      <section className="auth-card">
        <div className="logo"><CreditCard/></div>
        <p className="eyebrow">PERSONAL FINANCE</p>
        <h1>Контроль фінансів<br/>в одному кабінеті.</h1>
        <p className="muted lead">Кредити, кредитні ліміти, платежі та план погашення — оптимізовано для смартфона та ПК.</p>
        {cloudEnabled && (
          <div className="cloud-status">
            <ShieldCheck/> Дані синхронізуються між пристроями
          </div>
        )}
        <form onSubmit={go} className="form">
          {m === 'reg' && (
            <Field label="Ім'я">
              <input value={name} onChange={e => setN(e.target.value)} placeholder="Олексій" autoComplete="name"/>
            </Field>
          )}
          <Field label="Email">
            <input type="email" value={email} onChange={e => setE(e.target.value)} placeholder="you@example.com" autoComplete="email"/>
          </Field>
          <Field label="Пароль">
            <div className="pass">
              <input
                type={show ? 'text' : 'password'}
                value={pass}
                onChange={e => setP(e.target.value)}
                placeholder="••••••••"
                autoComplete={m === 'login' ? 'current-password' : 'new-password'}
              />
              <button type="button" onClick={() => setShow(!show)} aria-label="Показати пароль">
                {show ? <EyeOff/> : <Eye/>}
              </button>
            </div>
          </Field>
          {err && <div className={resetSent ? 'success' : 'error'}>{err}</div>}
          {resetSent && <div className="success" style={{ padding: 10, borderRadius: 10, fontSize: 12 }}>Лист для відновлення пароля надіслано.</div>}
          <button disabled={busy} className="btn primary wide">
            {busy ? 'Зачекайте...' : m === 'login' ? 'Увійти' : 'Створити акаунт'}
          </button>
          {!cloudEnabled && (
            <button type="button" className="btn secondary wide" onClick={startDemo}>
              Швидкий демо-вхід (з прикладами)
            </button>
          )}
        </form>
        <div className="auth-links">
          {m === 'login' ? (
            <>
              <button type="button" onClick={() => setM('reg')}>Створити акаунт</button>
              <button type="button" onClick={forgot}>Забули пароль?</button>
            </>
          ) : (
            <button type="button" onClick={() => setM('login')}>Вже маєте акаунт? Увійти</button>
          )}
        </div>
        <small className="security">
          <ShieldCheck/> {cloudEnabled ? 'Акаунти та дані зберігаються у Supabase.' : 'Локальний режим: дані зберігаються у вашому браузері.'}
        </small>
      </section>
    </main>
  );
}

function CreditModal({ credit, onClose, onSave, notify }) {
  const blank = {
    name: '',
    initialAmount: '',
    balance: '',
    rate: 0,
    type: 'annuity',
    payment: '',
    dueDay: 10,
    termMonths: 12,
    interestPolicy: 'actual',
    overpayMode: 'reduce_last'
  };
  const [f, setF] = useState(credit || blank);
  const set = (k, v) => setF(x => ({ ...x, [k]: v }));
  const suggested = annuity(n(f.balance), n(f.termMonths), n(f.rate));

  return (
    <div className="overlay" onClick={onClose}>
      <section className="modal" onClick={e => e.stopPropagation()}>
        <div className="sheet-handle" />
        <header className="modal-head">
          <div>
            <p className="eyebrow">{credit ? 'EDIT CREDIT' : 'NEW CREDIT'}</p>
            <h2>{credit ? 'Редагувати кредит' : 'Додати кредит'}</h2>
          </div>
          <button type="button" className="round" onClick={onClose} aria-label="Закрити"><X/></button>
        </header>
        <form
          className="form"
          onSubmit={e => {
            e.preventDefault();
            if (!f.name.trim() || n(f.balance) <= 0 || n(f.termMonths) <= 0 || n(f.payment) <= 0) {
              notify('Заповніть назву, залишок, термін та щомісячний платіж.', 'error');
              return;
            }
            onSave({ ...f, id: f.id || uid(), payments: f.payments || [] });
          }}
        >
          <div className="two">
            <Field label="Назва / банк">
              <input required value={f.name} onChange={e => set('name', e.target.value)} placeholder="ПриватБанк — Автокредит"/>
            </Field>
            <Field label="День платежу (1–31)">
              <input type="number" inputMode="numeric" min="1" max="31" value={f.dueDay} onChange={e => set('dueDay', e.target.value)}/>
            </Field>
          </div>
          <div className="two">
            <Field label="Початкова сума, ₴">
              <input inputMode="decimal" value={f.initialAmount} onChange={e => set('initialAmount', e.target.value)} placeholder="420000"/>
            </Field>
            <Field label="Поточний залишок, ₴">
              <input required inputMode="decimal" value={f.balance} onChange={e => set('balance', e.target.value)} placeholder="286400"/>
            </Field>
          </div>
          <div className="two">
            <Field label="Річна ставка, %">
              <input inputMode="decimal" value={f.rate} onChange={e => set('rate', e.target.value)} placeholder="18.9"/>
            </Field>
            <Field label="Термін, місяців">
              <input required type="number" inputMode="numeric" min="1" value={f.termMonths} onChange={e => set('termMonths', e.target.value)}/>
            </Field>
          </div>
          <Field label="Тип нарахування">
            <select value={f.type} onChange={e => set('type', e.target.value)}>
              <option value="annuity">Ануїтетний (рівні платежі)</option>
              <option value="diff">Диференційований (спадна сума)</option>
            </select>
          </Field>
          <div className="policy-box">
            <div className="policy-head">
              <b>Дострокове погашення</b>
              <small>Як рахувати відсотки у прогнозі та при достроковій виплаті.</small>
            </div>
            <div className="policy-toggle">
              <button
                type="button"
                className={f.interestPolicy === 'actual' ? 'active' : ''}
                onClick={() => set('interestPolicy', 'actual')}
              >
                <span>Фактичні місяці</span>
                <small>Відсотки нараховуються лише на поточний залишок.</small>
              </button>
              <button
                type="button"
                className={f.interestPolicy === 'full_term' ? 'active' : ''}
                onClick={() => set('interestPolicy', 'full_term')}
              >
                <span>Весь договірний строк</span>
                <small>Фіксована переплата за весь строк (розстрочки з комісією).</small>
              </button>
            </div>
          </div>
          <div className="policy-box">
            <div className="policy-head">
              <b>Якщо платиш більше мінімального платежу</b>
              <small>Оберіть, як змінюється графік після переплати або дострокового внеску.</small>
            </div>
            <div className="policy-toggle">
              <button
                type="button"
                className={(f.overpayMode || 'reduce_last') === 'reduce_payment' ? 'active' : ''}
                onClick={() => set('overpayMode', 'reduce_payment')}
              >
                <span>Зменшується мінімальний платіж</span>
                <small>Наступні обов'язкові платежі стають меншими на весь залишок строку.</small>
              </button>
              <button
                type="button"
                className={(f.overpayMode || 'reduce_last') === 'reduce_last' ? 'active' : ''}
                onClick={() => set('overpayMode', 'reduce_last')}
              >
                <span>Зменшується тільки останній платіж</span>
                <small>Щомісячний платіж не змінюється, зменшується сума в кінці графіка.</small>
              </button>
            </div>
          </div>
          <div className="suggest">
            <div>
              <span>Розрахунковий платіж:</span>
              <b>{money(suggested)}</b>
            </div>
            <button type="button" onClick={() => set('payment', Math.ceil(suggested))}>
              Підставити
            </button>
          </div>
          <Field label="Ваш обов'язковий платіж, ₴ / міс.">
            <input required inputMode="decimal" value={f.payment} onChange={e => set('payment', e.target.value)} placeholder="11500"/>
          </Field>
          <div className="modal-actions">
            <button type="button" className="btn secondary" onClick={onClose}>Скасувати</button>
            <button className="btn primary"><Check/> Зберегти</button>
          </div>
        </form>
      </section>
    </div>
  );
}

function LimitModal({ limit, onClose, onSave, notify }) {
  const blank = { name: '', limit: '', used: '', rate: 37, minPayment: '', gracePayment: '', dueDay: 25, overpayMode: 'reduce_payment' };
  const [f, setF] = useState(limit || blank);
  const set = (k, v) => setF(x => ({ ...x, [k]: v }));
  const available = Math.max(0, n(f.limit) - n(f.used));

  return (
    <div className="overlay" onClick={onClose}>
      <section className="modal" onClick={e => e.stopPropagation()}>
        <div className="sheet-handle" />
        <header className="modal-head">
          <div>
            <p className="eyebrow">{limit ? 'EDIT LIMIT' : 'NEW CREDIT LIMIT'}</p>
            <h2>{limit ? 'Редагувати ліміт' : 'Додати кредитний ліміт'}</h2>
          </div>
          <button type="button" className="round" onClick={onClose} aria-label="Закрити"><X/></button>
        </header>
        <form
          className="form"
          onSubmit={e => {
            e.preventDefault();
            if (!f.name.trim() || n(f.limit) <= 0 || n(f.used) < 0 || n(f.used) > n(f.limit)) {
              notify('Перевірте назву, розмір ліміту та використану суму.', 'error');
              return;
            }
            onSave({ ...f, id: f.id || uid(), payments: f.payments || [] });
          }}
        >
          <Field label="Назва банку / картки">
            <input required value={f.name} onChange={e => set('name', e.target.value)} placeholder="Monobank — Чорна картка"/>
          </Field>
          <div className="two">
            <Field label="Кредитний ліміт, ₴">
              <input required inputMode="decimal" value={f.limit} onChange={e => set('limit', e.target.value)} placeholder="50000"/>
            </Field>
            <Field label="Використано (борг), ₴">
              <input
                required
                inputMode="decimal"
                value={f.used}
                onChange={e => {
                  const val = e.target.value;
                  setF(x => ({
                    ...x,
                    used: val,
                    minPayment: x.minPayment === '' ? Math.round(n(val) * 0.05) : x.minPayment,
                    gracePayment: x.gracePayment === '' ? val : x.gracePayment
                  }));
                }}
                placeholder="23000"
              />
            </Field>
          </div>
          <div className="two">
            <Field label="Ставка поза пільговим, % річних">
              <input inputMode="decimal" value={f.rate} onChange={e => set('rate', e.target.value)} placeholder="37.2"/>
            </Field>
            <Field label="Мінімальний платіж, ₴">
              <input required inputMode="decimal" value={f.minPayment} onChange={e => set('minPayment', e.target.value)} placeholder="1150"/>
            </Field>
          </div>
          <div className="two">
            <Field label="Платіж для пільгового періоду, ₴">
              <input required inputMode="decimal" value={f.gracePayment} onChange={e => set('gracePayment', e.target.value)} placeholder="23000"/>
            </Field>
            <Field label="День обов'язкового платежу">
              <input type="number" inputMode="numeric" min="1" max="31" value={f.dueDay} onChange={e => set('dueDay', e.target.value)}/>
            </Field>
          </div>
          <div className="policy-box">
            <div className="policy-head">
              <b>Якщо платиш більше мінімального платежу</b>
              <small>Як змінювати обов'язковий платіж після часткового погашення боргу.</small>
            </div>
            <div className="policy-toggle">
              <button
                type="button"
                className={(f.overpayMode || 'reduce_payment') === 'reduce_payment' ? 'active' : ''}
                onClick={() => set('overpayMode', 'reduce_payment')}
              >
                <span>Зменшується мінімальний платіж</span>
                <small>Мінімальний платіж зменшується пропорційно залишку боргу.</small>
              </button>
              <button
                type="button"
                className={f.overpayMode === 'reduce_last' ? 'active' : ''}
                onClick={() => set('overpayMode', 'reduce_last')}
              >
                <span>Зменшується тільки останній платіж</span>
                <small>Фіксований платіж зберігається до повного закриття залишку.</small>
              </button>
            </div>
          </div>
                    <div className="payment-info">
            <span>Доступний залишок ліміту <b>{money(available)}</b></span>
            <span>Завантаженість картки <b>{Math.round((n(f.used) / Math.max(1, n(f.limit))) * 100)}%</b></span>
          </div>
          <div className="modal-actions">
            <button type="button" className="btn secondary" onClick={onClose}>Скасувати</button>
            <button className="btn primary"><Check/> Зберегти</button>
          </div>
        </form>
      </section>
    </div>
  );
}

function PaymentModal({ item, onClose, onSave, isLimit = false, notify }) {
  const balance = isLimit ? n(item.used) : n(item.balance);
  const minScheduled = isLimit ? n(item.minPayment) : n(item.payment);
  const defaultAmount = Math.min(balance, minScheduled);
  const defaultOverpayMode = item.overpayMode || (isLimit ? 'reduce_payment' : 'reduce_last');
  const [f, setF] = useState({
    kind: 'regular',
    amount: defaultAmount || balance,
    date: new Date().toISOString().slice(0, 10),
    overpayMode: defaultOverpayMode
  });
  const set = (k, v) => setF(x => ({ ...x, [k]: v }));
  const isPayingMoreThanMin = f.kind === 'early' || n(f.amount) > minScheduled;
  const preview = !isLimit ? earlyPaymentPreview(item, n(f.amount), f.overpayMode, f.kind) : null;

  // Limit preview calculation
  const limitNewUsed = isLimit ? Math.max(0, balance - n(f.amount)) : 0;
  const limitNewMin = isLimit
    ? limitNewUsed <= 0.01
      ? 0
      : f.overpayMode === 'reduce_payment'
      ? Math.min(limitNewUsed, Math.round(minScheduled * (limitNewUsed / Math.max(1, balance))))
      : Math.min(limitNewUsed, minScheduled)
    : 0;

  const presets = isLimit
    ? [
        { label: `Мін. (${money(item.minPayment)})`, val: Math.min(balance, n(item.minPayment)), kind: 'regular' },
        ...(n(item.planPayment) > 0 ? [{ label: `За планом (${money(item.planPayment)})`, val: Math.min(balance, n(item.planPayment)), kind: 'early' }] : []),
        { label: `Пільговий (${money(item.gracePayment)})`, val: Math.min(balance, n(item.gracePayment)), kind: 'early' },
        { label: `Весь борг (${money(balance)})`, val: balance, kind: 'early' }
      ]
    : [
        { label: `Плановий (${money(item.payment)})`, val: Math.min(balance, n(item.payment)), kind: 'regular' },
        { label: '+1 000 ₴', val: Math.min(balance, n(item.payment) + 1000), kind: 'early' },
        { label: '+5 000 ₴', val: Math.min(balance, n(item.payment) + 5000), kind: 'early' },
        { label: `Повністю (${money(balance)})`, val: balance, kind: 'early' }
      ];

  return (
    <div className="overlay" onClick={onClose}>
      <section className="modal payment-modal" onClick={e => e.stopPropagation()}>
        <div className="sheet-handle" />
        <header className="modal-head">
          <div>
            <p className="eyebrow">ВНЕСЕННЯ ПЛАТЕЖУ</p>
            <h2>{item.name}</h2>
            <p className="muted">{isLimit ? 'Використано' : 'Поточний залишок'}: {money(balance)}</p>
          </div>
          <button type="button" className="round" onClick={onClose} aria-label="Закрити"><X/></button>
        </header>
        <div className="payment-types">
          <button type="button" className={f.kind === 'regular' ? 'active' : ''} onClick={() => set('kind', 'regular')}>
            Регулярний
          </button>
          <button type="button" className={f.kind === 'early' ? 'active' : ''} onClick={() => set('kind', 'early')}>
            Достроковий
          </button>
        </div>
        <div className="quick-chips" style={{ marginBottom: 12 }}>
          {presets.filter(p => p.val > 0).map((p, idx) => (
            <button
              key={idx}
              type="button"
              className={`chip ${n(f.amount) === p.val ? 'active' : ''}`}
              onClick={() => setF(x => ({ ...x, amount: p.val, kind: p.kind }))}
            >
              {p.label}
            </button>
          ))}
        </div>
        <form
          className="form"
          onSubmit={e => {
            e.preventDefault();
            if (n(f.amount) <= 0) {
              notify('Сума платежу має бути більшою за 0.', 'error');
              return;
            }
            onSave(f.kind, n(f.amount), f.date, f.overpayMode);
          }}
        >
          <div className="two">
            <Field label="Сума платежу, ₴">
              <input inputMode="decimal" min="0" value={f.amount} onChange={e => set('amount', e.target.value)}/>
            </Field>
            <Field label="Дата операції">
              <input type="date" value={f.date} onChange={e => set('date', e.target.value)}/>
            </Field>
          </div>

          {isPayingMoreThanMin && (
            <div className="policy-box">
              <div className="policy-head">
                <b>Якщо платиш більше мінімального ({money(minScheduled)})</b>
                <small>Оберіть, як перерахувати подальші платежі:</small>
              </div>
              <div className="policy-toggle">
                <button
                  type="button"
                  className={f.overpayMode === 'reduce_payment' ? 'active' : ''}
                  onClick={() => set('overpayMode', 'reduce_payment')}
                >
                  <span>Зменшується мін. платіж</span>
                  <small>Щомісячний обов'язковий платіж стане меншим.</small>
                </button>
                <button
                  type="button"
                  className={f.overpayMode === 'reduce_last' ? 'active' : ''}
                  onClick={() => set('overpayMode', 'reduce_last')}
                >
                  <span>Зменшується останній платіж</span>
                  <small>Щомісячний платіж той самий, списується хвіст з кінця.</small>
                </button>
              </div>
            </div>
          )}

          <div className="payment-info">
            <span>
              {isLimit ? 'Борг після платежу' : 'Залишок після платежу'}
              <b>{money(Math.max(0, balance - n(f.amount)))}</b>
            </span>
            {isLimit && (
              <>
                <span>
                  Новий мінімальний платіж
                  <b>
                    {money(limitNewMin)}
                    {limitNewMin < minScheduled ? ` (було ${money(minScheduled)})` : ' (без змін)'}
                  </b>
                </span>
                <span>
                  Доступний ліміт стане
                  <b>{money(n(item.limit) - Math.max(0, balance - n(f.amount)))}</b>
                </span>
              </>
            )}
            {preview && (
              <>
                <span>
                  Новий мінімальний платіж / міс.
                  <b>
                    {money(preview.newPayment)}
                    {Math.round(preview.newPayment) < Math.round(preview.oldPayment)
                      ? ` (було ${money(preview.oldPayment)})`
                      : ' (без змін)'}
                  </b>
                </span>
                <span>
                  Останній платіж у графіку
                  <b>
                    {preview.newMonths > 0
                      ? `${money(preview.newLastPayment)} (міс. #${preview.newMonths}, було ${money(preview.oldLastPayment)})`
                      : '0 ₴ (повністю закрито)'}
                  </b>
                </span>
                <span>
                  Орієнтовна економія відсотків
                  <b>{money(preview.saving)}</b>
                </span>
              </>
            )}
          </div>
          <div className="modal-actions">
            <button type="button" className="btn secondary" onClick={onClose}>Скасувати</button>
            <button className="btn primary"><Check/> Зберегти платіж</button>
          </div>
        </form>
      </section>
    </div>
  );
}

function CreditCardView({ c, onEdit, onDelete, onPayment, onOpen }) {
  const ms = useMemo(() => months(c), [c]);
  const prog = Math.min(100, Math.max(0, (1 - n(c.balance) / Math.max(1, n(c.initialAmount))) * 100));
  return (
    <article className="credit-card" onClick={onOpen}>
      <div className="card-top">
        <div className="credit-icon"><CreditCard/></div>
        <div className="card-menu">
          <DueBadge item={c} balance={c.balance} />
          <button type="button" onClick={e => { e.stopPropagation(); onEdit(); }} aria-label="Редагувати"><Pencil/></button>
          <button type="button" onClick={e => { e.stopPropagation(); onDelete(); }} aria-label="Видалити"><Trash2/></button>
        </div>
      </div>
      <p className="muted tiny">
        {c.rate}% річних · {c.type === 'annuity' ? 'Ануїтет' : 'Диференційований'} · {c.interestPolicy === 'full_term' ? 'фікс. строк' : 'фактичні %'}
      </p>
      <h3>{c.name}</h3>
      <strong className="card-balance">{money(c.balance)}</strong>
      <div className="meta">
        <span>Платіж / міс.<b>{money(c.payment)}</b></span>
        <span>Залишилось<b>{ms ? `${ms} міс.` : 'Погашено'}</b></span>
      </div>
      <div className="progress"><i style={{ width: `${prog}%` }}/></div>
      <div className="limit-meta">
        <span>Виплачено {Math.round(prog)}%</span>
        <span>Початкова: {money(c.initialAmount)}</span>
      </div>
      <button type="button" className="btn secondary wide" onClick={e => { e.stopPropagation(); onPayment(); }}>
        <Check/> Внести платіж
      </button>
    </article>
  );
}

function LimitCard({ c, onEdit, onDelete, onPayment, onPlan, onOpen }) {
  const used = n(c.used);
  const limit = n(c.limit);
  const pct = Math.min(100, Math.max(0, (used / Math.max(1, limit)) * 100));
  return (
    <article className="credit-card limit-card" onClick={onOpen}>
      <div className="card-top">
        <div className="credit-icon"><WalletCards/></div>
        <div className="card-menu">
          <DueBadge item={c} balance={c.used} />
          <button type="button" onClick={e => { e.stopPropagation(); onEdit(); }} aria-label="Редагувати"><Pencil/></button>
          <button type="button" onClick={e => { e.stopPropagation(); onDelete(); }} aria-label="Видалити"><Trash2/></button>
        </div>
      </div>
      <p className="muted tiny">{c.rate}% річних · використаний ліміт ({Math.round(pct)}%)</p>
      <h3>{c.name}</h3>
      <strong className="card-balance">{money(used)}</strong>
      <div className="meta">
        <span>Загальний ліміт<b>{money(limit)}</b></span>
        <span>Доступно<b>{money(Math.max(0, limit - used))}</b></span>
      </div>
      <div className={`progress ${pct > 75 ? 'warn' : ''}`}><i style={{ width: `${pct}%` }}/></div>
      <div className="limit-meta">
        <span>Мін. {money(c.minPayment)}</span>
        <span>Пільговий {money(c.gracePayment)}</span>
      </div>
      {n(c.planPayment) > 0 && (
        <div className="saved-plan">
          <Target/> За планом: <b>{money(c.planPayment)} / міс.</b>
        </div>
      )}
      <div className="limit-actions">
        <button type="button" className="btn secondary" onClick={e => { e.stopPropagation(); onPayment(); }}>
          Внести
        </button>
        <button type="button" className="btn primary" onClick={e => { e.stopPropagation(); onPlan(); }}>
          <Target/> План
        </button>
      </div>
    </article>
  );
}

function Stat({ label, value, sub, icon, badge }) {
  return (
    <div className="stat">
      <div className="stat-top">
        <div className="stat-icon">{icon}</div>
        {badge}
      </div>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
        <small>{sub}</small>
      </div>
    </div>
  );
}

function PanelHead({ title, action }) {
  return (
    <div className="panel-head">
      <h3>{title}</h3>
      {action}
    </div>
  );
}

function Empty({ onAdd, title = 'Кредитів ще немає', text = 'Додайте перший запис, щоб отримати графік та прогноз погашення.' }) {
  return (
    <div className="empty">
      <CreditCard/>
      <h3>{title}</h3>
      <p>{text}</p>
      {onAdd && <button type="button" className="btn primary" onClick={onAdd}><Plus/> Додати</button>}
    </div>
  );
}

function Nav({ icon, text, active, badge, click }) {
  return (
    <button type="button" className={`nav-item ${active ? 'active' : ''}`} onClick={click}>
      <span className="nav-item-left">{icon}<span>{text}</span></span>
      {badge != null && badge > 0 && <span className="nav-badge">{badge}</span>}
    </button>
  );
}

function Dashboard({
  user, credits, limits, onAddCredit, onAddLimit, onOpenCredit, onOpenLimit,
  onPaymentCredit, onPaymentLimit, onOpenForecast, onOpenPlan
}) {
  const debt = useMemo(() => credits.reduce((s, c) => s + n(c.balance), 0), [credits]);
  const used = useMemo(() => limits.reduce((s, c) => s + n(c.used), 0), [limits]);
  const monthly = useMemo(
    () => credits.reduce((s, c) => s + n(c.payment), 0) + limits.reduce((s, c) => s + n(c.minPayment), 0),
    [credits, limits]
  );
  const next = useMemo(() => {
    const activeItems = [
      ...credits.filter(c => n(c.balance) > 0 && !isPaidThisMonth(c)).map(c => ({ ...c, _type: 'credit' })),
      ...limits.filter(c => n(c.used) > 0 && !isPaidThisMonth(c)).map(c => ({ ...c, _type: 'limit' }))
    ];
    return activeItems.sort((a, b) => dateFor(a.dueDay) - dateFor(b.dueDay))[0];
  }, [credits, limits]);

  return (
    <div className="view">
      <div className="page-title">
        <div>
          <p className="eyebrow">ОСОБИСТИЙ КАБІНЕТ</p>
          <h2>Доброго дня, {user.name.split(' ')[0]} 👋</h2>
          <p className="muted">Загальний борг: {money(debt + used)} · Усі зобов'язання під контролем.</p>
        </div>
        <div className="title-actions">
          <button type="button" className="btn secondary" onClick={onOpenForecast}>
            <TrendingDown/> Прогноз
          </button>
          <button type="button" className="btn secondary" onClick={onAddLimit}>
            <WalletCards/> + Ліміт
          </button>
          <button type="button" className="btn primary" onClick={onAddCredit}>
            <Plus/> + Кредит
          </button>
        </div>
      </div>

      <div className="stats">
        <Stat
          label="Кредити та розстрочки"
          value={money(debt)}
          sub={`${credits.length} активних записів`}
          icon={<CreditCard/>}
        />
        <Stat
          label="Використано лімітів"
          value={money(used)}
          sub={`${limits.length} кредитних карток`}
          icon={<WalletCards/>}
        />
        <Stat
          label="Обов'язково / місяць"
          value={money(monthly)}
          sub="кредити + мін. платежі"
          icon={<ArrowDownRight/>}
        />
        <Stat
          label="Найближчий платіж"
          value={next ? dateFmt(dateFor(next.dueDay)) : 'Усе внесено'}
          sub={next ? `${next.name}: ${money(next._type === 'limit' ? next.minPayment : next.payment)}` : 'На цей місяць платежів немає'}
          icon={<CalendarDays/>}
          badge={next ? <DueBadge item={next} balance={next._type === 'limit' ? next.used : next.balance}/> : null}
        />
      </div>

      <div className="dashboard-grid">
        <section className="panel">
          <PanelHead
            title="Активні кредити"
            action={<button type="button" className="btn sm secondary" onClick={onAddCredit}><Plus/> Додати</button>}
          />
          <div className="credit-list">
            {credits.length ? (
              credits.slice(0, 6).map(c => (
                <div className="credit-row" key={c.id} onClick={() => onOpenCredit(c)}>
                  <div className="credit-icon"><CreditCard/></div>
                  <div>
                    <b>{c.name}</b>
                    <small>{c.rate}% річних · <DueBadge item={c} balance={c.balance}/></small>
                  </div>
                  <div>
                    <small>Залишок</small>
                    <b>{money(c.balance)}</b>
                  </div>
                  <div>
                    <small>Платіж</small>
                    <b>{money(c.payment)}</b>
                  </div>
                  <button
                    type="button"
                    className="tiny-btn"
                    onClick={e => { e.stopPropagation(); onPaymentCredit(c); }}
                  >
                    Внести
                  </button>
                </div>
              ))
            ) : (
              <Empty onAdd={onAddCredit}/>
            )}
          </div>
        </section>

        <section className="panel">
          <PanelHead
            title="Кредитні ліміти"
            action={
              limits.length > 0 ? (
                <button type="button" className="btn sm secondary" onClick={onOpenPlan}>
                  <Target/> План погашення
                </button>
              ) : (
                <button type="button" className="btn sm secondary" onClick={onAddLimit}>
                  <Plus/> Додати
                </button>
              )
            }
          />
          <div className="credit-list">
            {limits.length ? (
              limits.slice(0, 6).map(c => (
                <div className="credit-row" key={c.id} onClick={() => onOpenLimit(c)}>
                  <div className="credit-icon"><WalletCards/></div>
                  <div>
                    <b>{c.name}</b>
                    <small>{c.rate}% річних · <DueBadge item={c} balance={c.used}/></small>
                  </div>
                  <div>
                    <small>Борг</small>
                    <b>{money(c.used)}</b>
                  </div>
                  <div>
                    <small>Пільговий</small>
                    <b>{money(c.gracePayment)}</b>
                  </div>
                  <button
                    type="button"
                    className="tiny-btn"
                    onClick={e => { e.stopPropagation(); onPaymentLimit(c); }}
                  >
                    Внести
                  </button>
                </div>
              ))
            ) : (
              <Empty
                onAdd={onAddLimit}
                title="Лімітів ще немає"
                text="Додайте кредитну картку, щоб побудувати оптимальний план погашення."
              />
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function Forecast({ credits, extra, setExtra }) {
  const { base, sim, shownSaving, hasFull } = useMemo(() => {
    const b = Math.max(0, ...credits.map(c => months(c, 0)));
    const s = Math.max(0, ...credits.map(c => months(c, extra)));
    const saving = credits.reduce(
      (sum, c) =>
        c.interestPolicy === 'full_term'
          ? sum
          : sum + Math.max(0, forecastInterest(c, 0) - forecastInterest(c, extra)),
      0
    );
    return {
      base: b,
      sim: s,
      shownSaving: saving,
      hasFull: credits.some(c => c.interestPolicy === 'full_term')
    };
  }, [credits, extra]);

  const stepValues = [0, 1000, 2500, 5000, 10000];

  return (
    <div className="view">
      <div className="page-title">
        <div>
          <p className="eyebrow">PREDICTIVE ENGINE</p>
          <h2>Прогноз погашення</h2>
          <p className="muted">Моделюйте дострокове закриття кредитів та оцінюйте економію на відсотках.</p>
        </div>
      </div>

      <section className="panel simulator">
        <div>
          <h3>Додатковий платіж щомісяця</h3>
          <p className="muted">Оберіть суму понад обов'язковий платіж (поточні записи не змінюються).</p>
          <div className="quick-chips" style={{ marginTop: 10 }}>
            {stepValues.map(v => (
              <button
                key={v}
                type="button"
                className={`chip ${extra === v ? 'active' : ''}`}
                onClick={() => setExtra(v)}
              >
                {v === 0 ? 'Без доплати' : `+${money(v)}`}
              </button>
            ))}
          </div>
        </div>
        <div className="slider">
          <div className="slider-head">
            <span className="muted">Доплата / місяць:</span>
            <strong>+{money(extra)}</strong>
          </div>
          <input
            type="range"
            min="0"
            max="25000"
            step="250"
            value={extra}
            onChange={e => setExtra(n(e.target.value))}
          />
        </div>
      </section>

      <div className="stats">
        <Stat icon={<CalendarDays/>} label="Поточний строк" value={`${base} міс.`} sub="за базовим графіком"/>
        <Stat icon={<TrendingDown/>} label="Новий строк" value={`${sim} міс.`} sub="з додатковим платежем"/>
        <Stat icon={<ArrowDownRight/>} label="Економія відсотків" value={money(shownSaving)} sub={hasFull ? 'з урахуванням правил банків' : 'чиста вигода'}/>
        <Stat icon={<Check/>} label="Швидше на" value={`${Math.max(0, base - sim)} міс.`} sub="скорочення строку"/>
      </div>

      {hasFull && (
        <div className="hint">
          <b>У частини кредитів обрано правило «весь договірний строк».</b> Для таких розстрочок дострокове погашення скорочує кількість місяців, але не зменшує фіксовану комісію/відсотки.
        </div>
      )}

      <Schedule credits={credits} extra={extra}/>
    </div>
  );
}

function Schedule({ credits, extra }) {
  const [filterId, setFilterId] = useState('all');
  const [showAll, setShowAll] = useState(false);

  const allRows = useMemo(() => {
    const active = filterId === 'all' ? credits : credits.filter(c => c.id === filterId);
    if (filterId === 'all' && active.length > 1) {
      // Group by month across all credits for a practical monthly timeline
      const byMonth = new Map();
      active.forEach(c => {
        schedule(c, extra).slice(0, 120).forEach(r => {
          const prev = byMonth.get(r.month) || {
            name: `Усі кредити (${active.length})`,
            month: r.month,
            payment: 0,
            principal: 0,
            interest: 0,
            balance: 0
          };
          prev.payment += r.payment;
          prev.principal += r.principal;
          prev.interest += r.interest;
          prev.balance += r.balance;
          byMonth.set(r.month, prev);
        });
      });
      return [...byMonth.values()].sort((a, b) => a.month - b.month);
    }
    return active.flatMap(c => schedule(c, extra).slice(0, 120).map(r => ({ ...r, name: c.name })));
  }, [credits, extra, filterId]);

  const visibleRows = showAll ? allRows : allRows.slice(0, 12);

  const exportCsv = () => {
    const body = [
      ['Кредит', 'Місяць', 'Платіж', 'Тіло', 'Відсотки', 'Залишок'],
      ...allRows.map(r => [
        r.name,
        r.month,
        r.payment.toFixed(2),
        r.principal.toFixed(2),
        r.interest.toFixed(2),
        r.balance.toFixed(2)
      ])
    ]
      .map(r => r.join(';'))
      .join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['\uFEFF' + body], { type: 'text/csv' }));
    a.download = 'grafik-platezhiv.csv';
    a.click();
  };

  if (!credits.length) return null;

  return (
    <section className="panel table-panel">
      <PanelHead
        title={`Графік платежів (${allRows.length} міс.)`}
        action={
          <div className="actions">
            {credits.length > 1 && (
              <select
                value={filterId}
                onChange={e => setFilterId(e.target.value)}
                style={{
                  height: 36,
                  borderRadius: 10,
                  border: '1px solid var(--l)',
                  background: 'var(--s2)',
                  color: 'var(--t)',
                  padding: '0 10px',
                  fontSize: 12
                }}
              >
                <option value="all">Зведений по місяцях ({credits.length})</option>
                {credits.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            )}
            <button type="button" className="btn sm secondary" onClick={() => window.print()}>
              <FileText/> Друк / PDF
            </button>
            <button type="button" className="btn sm secondary" onClick={exportCsv}>
              <Download/> CSV
            </button>
          </div>
        }
      />

      {/* Desktop Table */}
      <div className="table-scroll desktop-schedule-table">
        <table>
          <thead>
            <tr>
              <th>Кредит / Режим</th>
              <th>Місяць</th>
              <th>Платіж</th>
              <th>Тіло боргу</th>
              <th>Відсотки</th>
              <th>Залишок</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((r, i) => (
              <tr key={i}>
                <td><b>{r.name}</b></td>
                <td>#{r.month}</td>
                <td><b>{money(r.payment)}</b></td>
                <td>{money(r.principal)}</td>
                <td>{money(r.interest)}</td>
                <td>{money(r.balance)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile Cards View (Zero Horizontal Scroll) */}
      <div className="schedule-mobile-list">
        {visibleRows.map((r, i) => (
          <div className="schedule-m-card" key={i}>
            <div className="schedule-m-top">
              <span><span className="badge neutral">Місяць #{r.month}</span> <b>{r.name}</b></span>
              <b>{money(r.payment)}</b>
            </div>
            <div className="schedule-m-grid">
              <div>Тіло<b>{money(r.principal)}</b></div>
              <div>Відсотки<b>{money(r.interest)}</b></div>
              <div>Залишок<b>{money(r.balance)}</b></div>
            </div>
          </div>
        ))}
      </div>

      {allRows.length > 12 && (
        <div style={{ marginTop: 14, textAlign: 'center' }}>
          <button type="button" className="btn secondary wide" onClick={() => setShowAll(!showAll)}>
            {showAll ? 'Згорнути до 12 місяців' : `Показати всі ${allRows.length} місяців`}
          </button>
        </div>
      )}
    </section>
  );
}

function LimitPlan({ limits, onClose, onSave }) {
  const minTotal = limits.reduce((s, c) => s + Math.min(n(c.used), n(c.minPayment)), 0);
  const graceTotal = limits.reduce((s, c) => s + Math.min(n(c.used), n(c.gracePayment)), 0);
  const totalUsed = limits.reduce((s, c) => s + n(c.used), 0);
  const [budget, setBudget] = useState(Math.max(minTotal, graceTotal || minTotal));

  const ordered = useMemo(
    () => [...limits].sort((a, b) => n(b.rate) - n(a.rate) || n(b.used) - n(a.used)),
    [limits]
  );

  const rows = useMemo(() => {
    let remaining = n(budget);
    const list = ordered.map(c => ({
      c,
      min: Math.min(n(c.used), Math.max(0, n(c.minPayment))),
      grace: Math.min(n(c.used), Math.max(0, n(c.gracePayment))),
      pay: 0,
      extra: 0
    }));
    list.forEach(r => {
      r.pay = Math.min(r.min, remaining);
      remaining = Math.max(0, remaining - r.pay);
    });
    if (n(budget) >= graceTotal) {
      list.forEach(r => {
        const add = Math.min(Math.max(0, r.grace - r.pay), remaining);
        r.extra += add;
        r.pay += add;
        remaining -= add;
      });
    }
    for (const r of list) {
      if (remaining <= 0) break;
      const need = Math.max(0, n(r.c.used) - r.pay);
      const add = Math.min(need, remaining);
      r.extra += add;
      r.pay += add;
      remaining -= add;
    }
    return list;
  }, [ordered, budget, graceTotal]);

  const totalAllocated = rows.reduce((s, r) => s + r.pay, 0);
  const canMinimum = n(budget) >= minTotal;
  const canGrace = n(budget) >= graceTotal;

  return (
    <div className="overlay" onClick={onClose}>
      <section className="modal plan-modal" onClick={e => e.stopPropagation()}>
        <div className="sheet-handle" />
        <header className="modal-head">
          <div>
            <p className="eyebrow">REPAYMENT PLAN (МЕТОД ЛАВИНИ)</p>
            <h2>План погашення лімітів</h2>
            <p className="muted">Спочатку закриваємо обов'язкові мінімуми, а залишок спрямовуємо на пільгові цілі або картку з найвищою ставкою.</p>
          </div>
          <button type="button" className="round" onClick={onClose} aria-label="Закрити"><X/></button>
        </header>

        <div className="plan-budget">
          <Field label="Ваш місячний бюджет на погашення лімітів, ₴">
            <input inputMode="decimal" value={budget} onChange={e => setBudget(n(e.target.value))}/>
          </Field>
          <div className="quick-chips">
            <button type="button" className={`chip ${n(budget) === minTotal ? 'active' : ''}`} onClick={() => setBudget(minTotal)}>
              Мінімуми ({money(minTotal)})
            </button>
            <button type="button" className={`chip ${n(budget) === graceTotal ? 'active' : ''}`} onClick={() => setBudget(graceTotal)}>
              Пільгові ({money(graceTotal)})
            </button>
            <button type="button" className={`chip ${n(budget) === totalUsed ? 'active' : ''}`} onClick={() => setBudget(totalUsed)}>
              Повне закриття ({money(totalUsed)})
            </button>
          </div>
          <div className="plan-summary">
            <span>Сума мінімумів<b>{money(minTotal)}</b></span>
            <span>Сума до пільгового<b>{money(graceTotal)}</b></span>
            <span>Розподілено в плані<b>{money(totalAllocated)}</b></span>
          </div>
        </div>

        <div className="plan-note">
          {!canMinimum ? (
            <>
              <Target/>
              <span>Увага: бюджету менше, ніж сума обов'язкових мінімальних платежів ({money(minTotal)}). Збільште бюджет, щоб уникнути штрафів банку.</span>
            </>
          ) : canGrace ? (
            <>
              <Check/>
              <span>Чудово! Бюджету вистачає для виконання всіх пільгових платежів без нарахування відсотків.</span>
            </>
          ) : (
            <>
              <Target/>
              <span>Після покриття мінімальних платежів увесь вільний ресурс іде на картку №1 з найвищою ставкою для максимальної економії.</span>
            </>
          )}
        </div>

        <div className="plan-list">
          {rows.map((r, i) => (
            <div className="plan-row" key={r.c.id}>
              <div className="plan-rank">{i + 1}</div>
              <div>
                <b>{r.c.name}</b>
                <small>{r.c.rate}% річних · борг {money(r.c.used)} · мін. {money(r.min)}</small>
              </div>
              <div className="plan-amount">
                <span>Рекомендовано</span>
                <b>{money(r.pay)}</b>
                {r.extra > 0 && <small>+{money(r.extra)} понад мін.</small>}
              </div>
            </div>
          ))}
        </div>

        <div className="modal-actions">
          <button type="button" className="btn secondary" onClick={onClose}>Закрити</button>
          <button
            type="button"
            className="btn primary"
            onClick={() => {
              onSave(rows.map(r => ({ limitId: r.c.id, amount: r.pay })));
              onClose();
            }}
          >
            <Check/> Зберегти план
          </button>
        </div>
      </section>
    </div>
  );
}

function Payments({ credits, limits, onPaymentCredit, onPaymentLimit, onDeletePayment }) {
  const history = useMemo(
    () =>
      [
        ...credits.flatMap(c =>
          (c.payments || []).map(p => ({ ...p, itemId: c.id, isLimit: false, name: c.name, group: 'Кредит' }))
        ),
        ...limits.flatMap(c =>
          (c.payments || []).map(p => ({ ...p, itemId: c.id, isLimit: true, name: c.name, group: 'Ліміт' }))
        )
      ].sort((a, b) => new Date(b.date) - new Date(a.date)),
    [credits, limits]
  );

  return (
    <div className="view">
      <div className="page-title">
        <div>
          <p className="eyebrow">PAYMENTS & HISTORY</p>
          <h2>Платежі та операції</h2>
          <p className="muted">Вносьте регулярні або дострокові платежі в один дотик.</p>
        </div>
      </div>

      <div className="dashboard-grid">
        <section className="panel payment-list">
          <PanelHead title="Швидка оплата кредитів"/>
          {credits.length ? (
            credits.map(c => (
              <div className="payment-item" key={c.id}>
                <span className={`dot ${isPaidThisMonth(c) ? 'ok' : ''}`}/>
                <div>
                  <b>{c.name}</b>
                  <small>Залишок: {money(c.balance)} · <DueBadge item={c} balance={c.balance}/></small>
                </div>
                <strong>{money(c.payment)}</strong>
                <button type="button" className="btn sm secondary" onClick={() => onPaymentCredit(c)}>
                  Внести
                </button>
              </div>
            ))
          ) : (
            <p className="muted empty-history">Кредитів немає.</p>
          )}
        </section>

        <section className="panel payment-list">
          <PanelHead title="Швидке поповнення лімітів"/>
          {limits.length ? (
            limits.map(c => (
              <div className="payment-item" key={c.id}>
                <span className={`dot ${isPaidThisMonth(c) ? 'ok' : ''}`}/>
                <div>
                  <b>{c.name}</b>
                  <small>Використано: {money(c.used)} · <DueBadge item={c} balance={c.used}/></small>
                </div>
                <strong>{money(c.minPayment)}</strong>
                <button type="button" className="btn sm secondary" onClick={() => onPaymentLimit(c)}>
                  Внести
                </button>
              </div>
            ))
          ) : (
            <p className="muted empty-history">Кредитних лімітів немає.</p>
          )}
        </section>
      </div>

      <section className="panel">
        <PanelHead title={`Історія проведених платежів (${history.length})`}/>
        <div className="payment-history">
          {history.map(p => (
            <div className="history-row" key={p.id}>
              <div>
                <b>{p.name}</b>
                <small>
                  {p.group} · {dateFmt(new Date(p.date))} · {p.kind === 'early' ? 'Достроковий' : 'Регулярний'}
                </small>
              </div>
              <div className="history-right">
                <strong>-{money(p.amount)}</strong>
                <button
                  type="button"
                  className="icon-btn"
                  style={{ width: 32, height: 32 }}
                  title="Скасувати платіж"
                  onClick={() => onDeletePayment(p.itemId, p.id, p.amount, p.isLimit)}
                >
                  <Trash2 size={14}/>
                </button>
              </div>
            </div>
          ))}
          {!history.length && <p className="muted empty-history">Проведених платежів ще немає.</p>}
        </div>
      </section>
    </div>
  );
}

function Details({ c, extra, setExtra, onBack, onEdit, onPaid, onDeletePayment }) {
  const rows = useMemo(() => schedule(c, extra), [c, extra]);
  const interest = useMemo(() => rows.reduce((s, r) => s + r.interest, 0), [rows]);

  return (
    <div className="view">
      <button type="button" className="back" onClick={onBack}>← До списку кредитів</button>
      <div className="page-title">
        <div>
          <p className="eyebrow">ДЕТАЛІ КРЕДИТУ</p>
          <h2>{c.name}</h2>
          <p className="muted">Залишок {money(c.balance)} з {money(c.initialAmount)} · {c.rate}% річних</p>
        </div>
        <div className="title-actions">
          <button type="button" className="btn secondary" onClick={() => onEdit(c)}>
            <Pencil/> Редагувати
          </button>
          <button type="button" className="btn primary" onClick={() => onPaid(c)}>
            <Check/> Внести платіж
          </button>
        </div>
      </div>

      <div className="stats">
        <Stat icon={<CreditCard/>} label="Поточний залишок" value={money(c.balance)} sub={`Платіж: ${money(c.payment)}`}/>
        <Stat icon={<CalendarDays/>} label="День оплати" value={`Щомісяця ${c.dueDay}-го`} sub={dateFmt(dateFor(c.dueDay))} badge={<DueBadge item={c} balance={c.balance}/>}/>
        <Stat icon={<TrendingDown/>} label="Залишилось місяців" value={`${rows.length} міс.`} sub={extra > 0 ? `з доплатою +${money(extra)}` : 'за поточним графіком'}/>
        <Stat icon={<ArrowDownRight/>} label="Прогноз відсотків" value={money(interest)} sub="за весь залишок строку"/>
      </div>

      <div className="policy-summary">
        <ShieldCheck/>
        <span>
          Відсотки: <b>{c.interestPolicy === 'full_term' ? 'весь договірний строк' : 'фактичні місяці'}</b>
          {' · '}
          При переплаті понад мінімум:{' '}
          <b>{c.overpayMode === 'reduce_payment' ? 'зменшується мінімальний платіж' : 'зменшується тільки останній платіж'}</b>
          {rows.length > 0 && (
            <>
              {' · '}Останній платіж (#{rows.length}): <b>{money(rows[rows.length - 1].payment)}</b>
            </>
          )}
        </span>
        <button type="button" className="btn sm secondary" onClick={() => onEdit(c)}>
          <Settings/> Змінити
        </button>
      </div>

      <section className="panel simulator">
        <div>
          <h3>Симулятор дострокової доплати</h3>
          <p className="muted">Додатково +{money(extra)} щомісяця</p>
        </div>
        <div className="slider">
          <input type="range" min="0" max="20000" step="250" value={extra} onChange={e => setExtra(n(e.target.value))}/>
        </div>
      </section>

      <Schedule credits={[c]} extra={extra}/>

      <section className="panel">
        <PanelHead title={`Історія платежів за кредитом (${(c.payments || []).length})`}/>
        <div className="payment-history">
          {(c.payments || []).slice().reverse().map(p => (
            <div className="history-row" key={p.id}>
              <div>
                <b>{p.kind === 'early' ? 'Достроковий платіж' : 'Регулярний платіж'}</b>
                <small>{dateFmt(new Date(p.date))}</small>
              </div>
              <div className="history-right">
                <strong>-{money(p.amount)}</strong>
                <button
                  type="button"
                  className="icon-btn"
                  style={{ width: 32, height: 32 }}
                  onClick={() => onDeletePayment(c.id, p.id, p.amount, false)}
                >
                  <Trash2 size={14}/>
                </button>
              </div>
            </div>
          ))}
          {!(c.payments || []).length && <p className="muted empty-history">За цим кредитом ще немає записаних платежів.</p>}
        </div>
      </section>
    </div>
  );
}

function LimitDetails({ c, onBack, onEdit, onPayment, onPlan, onDeletePayment }) {
  const used = n(c.used);
  const limit = n(c.limit);
  const pct = Math.min(100, (used / Math.max(1, limit)) * 100);

  return (
    <div className="view">
      <button type="button" className="back" onClick={onBack}>← До списку лімітів</button>
      <div className="page-title">
        <div>
          <p className="eyebrow">КРЕДИТНИЙ ЛІМІТ</p>
          <h2>{c.name}</h2>
          <p className="muted">Використано {money(used)} з {money(limit)} · {c.rate}% річних</p>
        </div>
        <div className="title-actions">
          <button type="button" className="btn secondary" onClick={() => onEdit(c)}>
            <Pencil/> Редагувати
          </button>
          <button type="button" className="btn secondary" onClick={() => onPlan(c)}>
            <Target/> План
          </button>
          <button type="button" className="btn primary" onClick={() => onPayment(c)}>
            <Check/> Внести
          </button>
        </div>
      </div>

      <div className="stats">
        <Stat icon={<WalletCards/>} label="Використано" value={money(used)} sub={`${Math.round(pct)}% ліміту`} badge={<DueBadge item={c} balance={c.used}/>}/>
        <Stat icon={<ArrowUpRight/>} label="Доступно" value={money(Math.max(0, limit - used))} sub="вільні кошти"/>
        <Stat icon={<ArrowDownRight/>} label="Мінімальний платіж" value={money(c.minPayment)} sub={`до ${c.dueDay}-го числа`}/>
        <Stat icon={<Target/>} label="Платіж для пільгового" value={money(c.gracePayment)} sub="без переплат"/>
      </div>

      <section className="panel">
        <PanelHead title="Стратегія користування лімітом"/>
        <div className="strategy-grid">
          <div>
            <b>1. Обов'язковий мінімум</b>
            <p className="muted">Вносьте щонайменше {money(c.minPayment)} до {c.dueDay}-го числа, щоб уникати штрафів.</p>
          </div>
          <div>
            <b>2. Збереження пільгового</b>
            <p className="muted">Закривайте {money(c.gracePayment)}, щоб не сплачувати {c.rate}% річних на залишок.</p>
          </div>
          <div>
            <b>3. Лавинне зменшення боргу</b>
            <p className="muted">Кожен додатковий платіж одразу збільшує доступний ліміт та зменшує базу нарахування.</p>
          </div>
        </div>
        {n(c.planPayment) > 0 && (
          <div className="saved-plan detail-plan">
            <Target/> Збережений персональний план для цієї картки: <b>{money(c.planPayment)} / міс.</b>
          </div>
        )}
      </section>

      <section className="panel">
        <PanelHead title={`Історія поповнень картки (${(c.payments || []).length})`}/>
        <div className="payment-history">
          {(c.payments || []).slice().reverse().map(p => (
            <div className="history-row" key={p.id}>
              <div>
                <b>{p.kind === 'early' ? 'Поповнення понад мінімум' : 'Обовʼязковий платіж'}</b>
                <small>{dateFmt(new Date(p.date))}</small>
              </div>
              <div className="history-right">
                <strong>-{money(p.amount)}</strong>
                <button
                  type="button"
                  className="icon-btn"
                  style={{ width: 32, height: 32 }}
                  onClick={() => onDeletePayment(c.id, p.id, p.amount, true)}
                >
                  <Trash2 size={14}/>
                </button>
              </div>
            </div>
          ))}
          {!(c.payments || []).length && <p className="muted empty-history">Поповнень за цією карткою ще не зафіксовано.</p>}
        </div>
      </section>
    </div>
  );
}

function SettingsView({
  state, user, cloudEnabled, onResetPassword, onMigrate, onToggleTheme,
  onImportBackup, onExportBackup, onLogout
}) {
  return (
    <div className="view">
      <div className="page-title">
        <div>
          <p className="eyebrow">ACCOUNT & DATA</p>
          <h2>Налаштування</h2>
          <p className="muted">Керування профілем, темою оформлення та резервними копіями.</p>
        </div>
      </div>

      <section className="panel settings">
        <div className="setting">
          <div>
            <b>Профіль користувача</b>
            <small>{user.name} · {user.email}</small>
          </div>
          <span className="badge ok">Активний</span>
        </div>

        <div className="setting">
          <div>
            <b>Тема оформлення</b>
            <small>Поточна: {state.theme === 'dark' ? 'Темна (OLED-friendly)' : 'Світла'}</small>
          </div>
          <button type="button" className="btn secondary" onClick={onToggleTheme}>
            {state.theme === 'dark' ? <><Sun/> Світла</> : <><Moon/> Темна</>}
          </button>
        </div>

        <div className="setting">
          <div>
            <b>Експорт резервної копії (JSON)</b>
            <small>Зберегти всі кредити, ліміти та історію платежів у файл на телефон або ПК.</small>
          </div>
          <button type="button" className="btn secondary" onClick={onExportBackup}>
            <Download/> Експортувати
          </button>
        </div>

        <div className="setting">
          <div>
            <b>Імпорт резервної копії</b>
            <small>Відновити або додати записи з файлу <code>credit-manager-backup.json</code>.</small>
          </div>
          <label className="btn secondary file-import">
            <Upload/> Вибрати JSON
            <input
              type="file"
              accept="application/json,.json"
              onChange={e => {
                const file = e.target.files?.[0];
                onImportBackup(file);
                e.target.value = '';
              }}
            />
          </label>
        </div>

        {onMigrate && (
          <div className="setting">
            <div>
              <b>Локальна резервна копія браузера</b>
              <small>Перенести старі кредити й ліміти з цього браузера у хмарний акаунт.</small>
            </div>
            <button type="button" className="btn secondary" onClick={onMigrate}>Імпортувати</button>
          </div>
        )}

        <div className="setting">
          <div>
            <b>Режим синхронізації</b>
            <small>
              {cloudEnabled
                ? 'Хмарний режим Supabase (RLS-захист). Дані синхронізуються між телефоном та ПК.'
                : 'Автономний локальний режим (localStorage). Дані зберігаються на цьому пристрої.'}
            </small>
          </div>
          <ShieldCheck color="var(--g)"/>
        </div>

        {cloudEnabled && (
          <div className="setting">
            <div>
              <b>Зміна пароля</b>
              <small>Надіслати посилання для скидання пароля на {user.email}</small>
            </div>
            <button type="button" className="btn secondary" onClick={onResetPassword}>Надіслати</button>
          </div>
        )}

        <div className="setting">
          <div>
            <b>Сесія</b>
            <small>Вийти з поточного облікового запису на цьому пристрої.</small>
          </div>
          <button type="button" className="btn danger-soft" onClick={onLogout}>
            <LogOut/> Вийти
          </button>
        </div>
      </section>
    </div>
  );
}


// Simulate applying virtual payments to a credit
function simulateCreditItem(c, virtualEntries, globalRecalcMode = 'per_item') {
  const entries = Array.isArray(virtualEntries) ? virtualEntries : [];
  const totalSimPaid = entries.reduce((s, e) => s + n(e.amount), 0);
  const effectiveMode =
    globalRecalcMode === 'per_item'
      ? (entries[entries.length - 1]?.overpayMode || c.overpayMode || 'reduce_last')
      : globalRecalcMode === 'reduce_term'
      ? 'reduce_last'
      : globalRecalcMode;

  const oldBalance = n(c.balance);
  const applied = Math.min(oldBalance, Math.max(0, totalSimPaid));
  const newBalance = Math.max(0, oldBalance - applied);

  const baseSched = schedule(c, 0);
  const oldMonths = baseSched.length;
  const oldLastPayment = oldMonths ? baseSched[oldMonths - 1].payment : 0;
  const oldInterest = baseSched.reduce((s, r) => s + r.interest, 0);
  const oldPayment = oldBalance > 0 ? n(c.payment) : 0;

  if (newBalance <= 0.01) {
    return {
      ...c,
      effectiveMode,
      oldBalance,
      newBalance: 0,
      simPaid: applied,
      oldPayment,
      newPayment: 0,
      paymentSaved: oldPayment,
      oldLastPayment,
      newLastPayment: 0,
      lastPaymentSaved: oldLastPayment,
      oldMonths,
      newMonths: 0,
      monthsSaved: oldMonths,
      oldInterest,
      newInterest: c.interestPolicy === 'full_term' ? oldInterest : 0,
      interestSaved: c.interestPolicy === 'full_term' ? 0 : oldInterest,
      simSchedule: [],
      baseSchedule: baseSched,
      entries
    };
  }

  let newPayment = oldPayment;
  if (applied > 0 && effectiveMode === 'reduce_payment') {
    const targetMonths = Math.max(1, oldMonths || n(c.termMonths) || 12);
    if (c.type === 'diff') {
      const r = n(c.rate) / 100 / 12;
      const principalPart = newBalance / targetMonths;
      newPayment = principalPart + newBalance * r;
    } else {
      newPayment = annuity(newBalance, targetMonths, n(c.rate));
    }
    newPayment = Math.min(oldPayment, newPayment);
  } else if (newBalance < oldPayment) {
    const r = n(c.rate) / 100 / 12;
    newPayment = newBalance + newBalance * r;
  }

  const simCreditObj = {
    ...c,
    balance: newBalance,
    initialAmount: effectiveMode === 'reduce_payment' && c.type === 'diff' ? newBalance : c.initialAmount,
    termMonths: effectiveMode === 'reduce_payment' && c.type === 'diff' ? Math.max(1, oldMonths) : c.termMonths,
    payment: newPayment
  };

  const simSched = schedule(simCreditObj, 0);
  const newMonths = simSched.length;
  const newLastPayment = newMonths ? simSched[newMonths - 1].payment : 0;
  const actualSimInterest = computeActualSchedule(simCreditObj, 0).reduce((s, r) => s + r.interest, 0);
  const newInterest = c.interestPolicy === 'full_term' ? oldInterest : actualSimInterest;
  const interestSaved = c.interestPolicy === 'full_term' ? 0 : Math.max(0, oldInterest - newInterest);

  return {
    ...c,
    effectiveMode,
    oldBalance,
    newBalance,
    simPaid: applied,
    oldPayment,
    newPayment,
    paymentSaved: Math.max(0, oldPayment - newPayment),
    oldLastPayment,
    newLastPayment,
    lastPaymentSaved: Math.max(0, oldLastPayment - newLastPayment),
    oldMonths,
    newMonths,
    monthsSaved: Math.max(0, oldMonths - newMonths),
    oldInterest,
    newInterest,
    interestSaved,
    simSchedule: simSched,
    baseSchedule: baseSched,
    entries
  };
}

// Simulate applying virtual payments to a credit limit
function simulateLimitItem(l, virtualEntries, globalRecalcMode = 'per_item') {
  const entries = Array.isArray(virtualEntries) ? virtualEntries : [];
  const totalSimPaid = entries.reduce((s, e) => s + n(e.amount), 0);
  const effectiveMode =
    globalRecalcMode === 'per_item'
      ? (entries[entries.length - 1]?.overpayMode || l.overpayMode || 'reduce_payment')
      : globalRecalcMode === 'reduce_term'
      ? 'reduce_last'
      : globalRecalcMode;

  const oldUsed = n(l.used);
  const applied = Math.min(oldUsed, Math.max(0, totalSimPaid));
  const newUsed = Math.max(0, oldUsed - applied);
  const limit = n(l.limit);
  const oldMin = oldUsed > 0 ? Math.min(oldUsed, n(l.minPayment)) : 0;
  const ratio = oldUsed > 0 ? newUsed / oldUsed : 0;
  const newMin =
    newUsed <= 0.01
      ? 0
      : effectiveMode === 'reduce_payment'
      ? Math.min(newUsed, Math.round(oldMin * ratio))
      : Math.min(newUsed, oldMin);
  const oldGrace = oldUsed > 0 ? Math.min(oldUsed, n(l.gracePayment)) : 0;
  const newGrace = Math.max(0, oldGrace - applied);
  const monthlyInterestSaved = (applied * (n(l.rate) / 100)) / 12;

  return {
    ...l,
    effectiveMode,
    oldUsed,
    newUsed,
    simPaid: applied,
    available: Math.max(0, limit - newUsed),
    oldMin,
    newMin,
    minSaved: Math.max(0, oldMin - newMin),
    oldGrace,
    newGrace,
    monthlyInterestSaved,
    entries
  };
}

function SandboxView({
  credits,
  limits,
  simPayments,
  recalcMode,
  setRecalcMode,
  onAddSimPayment,
  onRemoveSimPayment,
  onClearItemSim,
  onResetAllSim,
  onOpenSimModal,
  onApplySimToReal
}) {
  const [showAllMonths, setShowAllMonths] = useState(false);

  const simCredits = useMemo(
    () => credits.map(c => simulateCreditItem(c, simPayments[`c_${c.id}`], recalcMode)),
    [credits, simPayments, recalcMode]
  );

  const simLimits = useMemo(
    () => limits.map(l => simulateLimitItem(l, simPayments[`l_${l.id}`], recalcMode)),
    [limits, simPayments, recalcMode]
  );

  const stats = useMemo(() => {
    const oldCreditDebt = simCredits.reduce((s, c) => s + c.oldBalance, 0);
    const newCreditDebt = simCredits.reduce((s, c) => s + c.newBalance, 0);
    const oldLimitDebt = simLimits.reduce((s, l) => s + l.oldUsed, 0);
    const newLimitDebt = simLimits.reduce((s, l) => s + l.newUsed, 0);

    const oldTotalDebt = oldCreditDebt + oldLimitDebt;
    const newTotalDebt = newCreditDebt + newLimitDebt;
    const totalSimPaid = (oldCreditDebt - newCreditDebt) + (oldLimitDebt - newLimitDebt);

    const oldMandatory = simCredits.reduce((s, c) => s + c.oldPayment, 0) + simLimits.reduce((s, l) => s + l.oldMin, 0);
    const newMandatory = simCredits.reduce((s, c) => s + c.newPayment, 0) + simLimits.reduce((s, l) => s + l.newMin, 0);
    const mandatorySaved = Math.max(0, oldMandatory - newMandatory);

    const creditInterestSaved = simCredits.reduce((s, c) => s + c.interestSaved, 0);
    const limitAnnualInterestSaved = simLimits.reduce((s, l) => s + l.monthlyInterestSaved * 12, 0);

    const oldMaxMonths = Math.max(0, ...simCredits.map(c => c.oldMonths));
    const newMaxMonths = Math.max(0, ...simCredits.map(c => c.newMonths));
    const closedCount =
      simCredits.filter(c => c.oldBalance > 0 && c.newBalance <= 0.01).length +
      simLimits.filter(l => l.oldUsed > 0 && l.newUsed <= 0.01).length;

    return {
      oldTotalDebt,
      newTotalDebt,
      totalSimPaid,
      oldMandatory,
      newMandatory,
      mandatorySaved,
      creditInterestSaved,
      limitAnnualInterestSaved,
      oldMaxMonths,
      newMaxMonths,
      monthsSaved: Math.max(0, oldMaxMonths - newMaxMonths),
      closedCount
    };
  }, [simCredits, simLimits]);

  // Ranking which credit/limit gives the highest interest return per 1,000 UAH paid early
  const bestTargets = useMemo(() => {
    const candidates = [
      ...credits
        .filter(c => n(c.balance) > 0)
        .map(c => ({
          id: c.id,
          name: c.name,
          kind: 'Кредит',
          effectiveRate: c.interestPolicy === 'full_term' ? 0 : n(c.rate),
          balance: n(c.balance),
          payment: n(c.payment),
          note:
            c.interestPolicy === 'full_term'
              ? 'Фіксована переплата (дострокове зменшує лише строк/обовʼязковий платіж)'
              : `${c.rate}% річних на залишок`
        })),
      ...limits
        .filter(l => n(l.used) > 0)
        .map(l => ({
          id: l.id,
          name: l.name,
          kind: 'Кредитний ліміт',
          effectiveRate: n(l.rate),
          balance: n(l.used),
          payment: n(l.minPayment),
          note: `${l.rate}% річних поза пільговим періодом`
        }))
    ].sort((a, b) => b.effectiveRate - a.effectiveRate || a.balance - b.balance);
    return candidates.slice(0, 3);
  }, [credits, limits]);

  // Monthly forecast comparison (Before vs After across all credits)
  const monthlyComparison = useMemo(() => {
    const maxM = Math.max(
      0,
      ...simCredits.map(c => Math.max(c.baseSchedule.length, c.simSchedule.length))
    );
    const rows = [];
    for (let m = 1; m <= Math.min(maxM, 120); m++) {
      let oldPay = 0, newPay = 0, oldBal = 0, newBal = 0, newInt = 0;
      simCredits.forEach(c => {
        const bRow = c.baseSchedule[m - 1];
        const sRow = c.simSchedule[m - 1];
        if (bRow) {
          oldPay += bRow.payment;
          oldBal += bRow.balance;
        }
        if (sRow) {
          newPay += sRow.payment;
          newBal += sRow.balance;
          newInt += sRow.interest;
        }
      });
      rows.push({
        month: m,
        oldPay,
        newPay,
        payDiff: Math.max(0, oldPay - newPay),
        oldBal,
        newBal,
        newInt
      });
    }
    return rows;
  }, [simCredits]);

  const visibleComparison = showAllMonths ? monthlyComparison : monthlyComparison.slice(0, 12);

  return (
    <div className="view">
      <div className="page-title">
        <div>
          <p className="eyebrow">WHAT-IF SIMULATOR · ПЕРЕДПЕРЕГЛЯД</p>
          <h2>Пісочниця платежів</h2>
          <p className="muted">
            Вносьте тестові платежі за одним або кількома кредитами та дивіться нову статистику боргу й обов'язкового платежу без зміни реальних даних.
          </p>
        </div>
        {stats.totalSimPaid > 0 && (
          <div className="title-actions">
            <button type="button" className="btn secondary" onClick={onResetAllSim}>
              <RotateCcw/> Скинути все
            </button>
            <button type="button" className="btn primary" onClick={onApplySimToReal}>
              <Check/> Застосувати як реальні платежі
            </button>
          </div>
        )}
      </div>

      {/* Sandbox Status Banner */}
      <div className="sandbox-banner">
        <div className="sandbox-banner-info">
          <Calculator/>
          <div>
            <b>
              {stats.totalSimPaid > 0
                ? `У передперегляді внесено: ${money(stats.totalSimPaid)} (${stats.closedCount > 0 ? `закрито записів: ${stats.closedCount}` : 'часткове погашення'})`
                : 'Режим безпечного моделювання: жодні зміни тут не впливають на вашу реальну картину'}
            </b>
            <small>
              Натискайте «Внести віртуально» або швидкі кнопки на картках нижче, щоб комбінувати платежі між різними кредитами.
            </small>
          </div>
        </div>
        <div className="sandbox-mode-switch" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', width: '100%' }}>
          <button
            type="button"
            className={recalcMode === 'reduce_payment' ? 'active' : ''}
            onClick={() => setRecalcMode('reduce_payment')}
          >
            <b>Зменшується мінімальний платіж</b>
            <small>Перерахунок щомісячної суми у менший бік</small>
          </button>
          <button
            type="button"
            className={recalcMode === 'reduce_last' || recalcMode === 'reduce_term' ? 'active' : ''}
            onClick={() => setRecalcMode('reduce_last')}
          >
            <b>Зменшується тільки останній платіж</b>
            <small>Щомісячний платіж незмінний, списується хвіст графіка</small>
          </button>
          <button
            type="button"
            className={recalcMode === 'per_item' ? 'active' : ''}
            onClick={() => setRecalcMode('per_item')}
          >
            <b>За налаштуванням кожного кредиту</b>
            <small>Індивідуальне правило для кожного запису</small>
          </button>
        </div>
      </div>

      {/* New Statistics (Before -> After) */}
      <div className="stats">
        <Stat
          icon={<CreditCard/>}
          label="Новий залишок боргу"
          value={money(stats.newTotalDebt)}
          badge={stats.totalSimPaid > 0 ? <span className="delta-pill">-{money(stats.totalSimPaid)}</span> : null}
          sub={
            stats.totalSimPaid > 0 ? (
              <span className="delta-line">
                Було: <span className="delta-old">{money(stats.oldTotalDebt)}</span>
              </span>
            ) : (
              `Реальний борг: ${money(stats.oldTotalDebt)}`
            )
          }
        />
        <Stat
          icon={<ArrowDownRight/>}
          label="Новий обов'язковий платіж / міс."
          value={money(stats.newMandatory)}
          badge={stats.mandatorySaved > 0 ? <span className="delta-pill">-{money(stats.mandatorySaved)}/міс.</span> : null}
          sub={
            stats.totalSimPaid > 0 ? (
              <span className="delta-line">
                Було: <span className="delta-old">{money(stats.oldMandatory)}</span> · Вивільнено {money(stats.mandatorySaved)}
              </span>
            ) : (
              `Поточне навантаження: ${money(stats.oldMandatory)}/міс.`
            )
          }
        />
        <Stat
          icon={<TrendingDown/>}
          label="Економія на відсотках"
          value={money(stats.creditInterestSaved)}
          badge={
            stats.totalSimPaid > 0 && stats.creditInterestSaved > 0 ? (
              <span className="delta-pill">
                +{Math.round((stats.creditInterestSaved / stats.totalSimPaid) * 100)}% вигоди
              </span>
            ) : null
          }
          sub={
            stats.limitAnnualInterestSaved > 0
              ? `+ до ${money(stats.limitAnnualInterestSaved)}/рік на лімітах карток`
              : 'Чиста економія переплати за кредитами'
          }
        />
        <Stat
          icon={<CalendarDays/>}
          label="Новий строк закриття"
          value={`${stats.newMaxMonths} міс.`}
          badge={stats.monthsSaved > 0 ? <span className="delta-pill">-{stats.monthsSaved} міс.</span> : null}
          sub={
            stats.totalSimPaid > 0
              ? `Було: ${stats.oldMaxMonths} міс. · Внесено: ${money(stats.totalSimPaid)}`
              : `Поточний горизонт: ${stats.oldMaxMonths} міс.`
          }
        />
      </div>

      {/* Strategic Recommendation / Verdict */}
      {bestTargets.length > 0 && (
        <section className="panel">
          <PanelHead
            title="Аналіз стратегії: куди найвигідніше спрямувати гроші?"
            action={
              stats.totalSimPaid > 0 ? (
                <span className="badge ok">
                  Вивільнений грошовий потік: +{money(stats.mandatorySaved)} щомісяця
                </span>
              ) : null
            }
          />
          <div className="verdict-box">
            {bestTargets.map((t, idx) => (
              <div className="verdict-item" key={t.id}>
                <b>
                  Пріоритет #{idx + 1}: {t.name}
                </b>
                <p>
                  {t.kind} · Залишок {money(t.balance)} · Обов'язковий {money(t.payment)}/міс.
                  <br/>
                  <span style={{ color: t.effectiveRate > 0 ? 'var(--g)' : 'var(--m)', fontWeight: 600 }}>
                    {t.note}
                  </span>
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Simulated Credits Section */}
      <section className="panel">
        <PanelHead
          title={`Кредити в передперегляді (${simCredits.length})`}
          action={<span className="muted">Натисніть суму або «Внести віртуально»</span>}
        />
        {simCredits.length ? (
          <div className="credit-grid">
            {simCredits.map(c => (
              <article key={c.id} className={`sandbox-card ${c.simPaid > 0 ? 'simulated' : ''}`}>
                <div className="card-top">
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                    <div className="credit-icon"><CreditCard/></div>
                    <div>
                      <h3 style={{ margin: 0, fontSize: 15.5 }}>{c.name}</h3>
                      <small className="muted">
                        {c.rate}% річних · {c.interestPolicy === 'full_term' ? 'фікс. комісія' : 'фактичні %'}
                      </small>
                    </div>
                  </div>
                  {c.simPaid > 0 ? (
                    <span className="badge ok">Внесено -{money(c.simPaid)}</span>
                  ) : (
                    <span className="badge neutral">Без змін</span>
                  )}
                </div>

                <div className="sandbox-compare-box">
                  <div>
                    Залишок боргу
                    <b>{money(c.newBalance)}</b>
                    {c.simPaid > 0 && <small>Було: {money(c.oldBalance)}</small>}
                  </div>
                  <div>
                    Мінімальний платіж / міс.
                    <b>{money(c.newPayment)} / міс.</b>
                    {c.paymentSaved > 0 ? (
                      <small>-{money(c.paymentSaved)} / міс. (було {money(c.oldPayment)})</small>
                    ) : (
                      <small>Фіксований ({c.effectiveMode === 'reduce_last' ? 'зменш. останній' : 'зменш. мін.'})</small>
                    )}
                  </div>
                  <div>
                    Останній платіж (міс. #{c.newMonths})
                    <b>{money(c.newLastPayment)}</b>
                    {c.simPaid > 0 && (
                      <small>
                        Було: {money(c.oldLastPayment)} (міс. #{c.oldMonths})
                      </small>
                    )}
                  </div>
                  <div>
                    Економія відсотків
                    <b>{money(c.interestSaved)}</b>
                    <small>
                      {c.interestPolicy === 'full_term'
                        ? 'Фіксована переплата за договором'
                        : `Строк: ${c.oldMonths} → ${c.newMonths} міс.`}
                    </small>
                  </div>
                </div>

                {/* Quick 1-tap virtual payment chips */}
                <div className="quick-chips">
                  {[2000, 5000, 10000].map(amt => (
                    <button
                      key={amt}
                      type="button"
                      className="chip"
                      disabled={c.newBalance <= 0}
                      onClick={() => onAddSimPayment(`c_${c.id}`, Math.min(c.newBalance, amt))}
                    >
                      +{money(amt)}
                    </button>
                  ))}
                  {c.newBalance > 0 && (
                    <button
                      type="button"
                      className="chip"
                      onClick={() => onAddSimPayment(`c_${c.id}`, Math.round(c.newBalance / 2))}
                    >
                      50% залишку
                    </button>
                  )}
                  {c.newBalance > 0 && (
                    <button
                      type="button"
                      className="chip active"
                      onClick={() => onAddSimPayment(`c_${c.id}`, c.newBalance)}
                    >
                      Закрити повністю ({money(c.newBalance)})
                    </button>
                  )}
                </div>

                {/* List of added virtual payments for this credit */}
                {c.entries.length > 0 && (
                  <div className="sim-payments-tags">
                    {c.entries.map((e, idx) => (
                      <span className="sim-tag" key={e.id}>
                        Платіж #{idx + 1}: -{money(e.amount)}
                        <button
                          type="button"
                          onClick={() => onRemoveSimPayment(`c_${c.id}`, e.id)}
                          aria-label="Видалити тестовий платіж"
                        >
                          <X size={13}/>
                        </button>
                      </span>
                    ))}
                  </div>
                )}

                <div className="limit-actions">
                  <button
                    type="button"
                    className="btn primary"
                    disabled={c.newBalance <= 0}
                    onClick={() => onOpenSimModal(c, false, c.newBalance)}
                  >
                    <Plus/> Внести віртуально
                  </button>
                  {c.simPaid > 0 ? (
                    <button
                      type="button"
                      className="btn secondary"
                      onClick={() => onClearItemSim(`c_${c.id}`)}
                    >
                      <RotateCcw/> Скинути
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="btn secondary"
                      disabled={c.newBalance <= 0}
                      onClick={() => onAddSimPayment(`c_${c.id}`, Math.min(c.newBalance, n(c.payment)))}
                    >
                      +1 платіж ({money(c.payment)})
                    </button>
                  )}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <Empty title="Кредитів немає" text="Додайте кредити у основному меню, щоб протестувати їх дострокове погашення."/>
        )}
      </section>

      {/* Simulated Credit Limits Section */}
      {simLimits.length > 0 && (
        <section className="panel">
          <PanelHead
            title={`Кредитні ліміти в передперегляді (${simLimits.length})`}
            action={<span className="muted">Моделювання погашення карток</span>}
          />
          <div className="credit-grid">
            {simLimits.map(l => (
              <article key={l.id} className={`sandbox-card ${l.simPaid > 0 ? 'simulated' : ''}`}>
                <div className="card-top">
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                    <div className="credit-icon"><WalletCards/></div>
                    <div>
                      <h3 style={{ margin: 0, fontSize: 15.5 }}>{l.name}</h3>
                      <small className="muted">{l.rate}% річних · ліміт {money(l.limit)}</small>
                    </div>
                  </div>
                  {l.simPaid > 0 ? (
                    <span className="badge ok">Внесено -{money(l.simPaid)}</span>
                  ) : (
                    <span className="badge neutral">Без змін</span>
                  )}
                </div>

                <div className="sandbox-compare-box">
                  <div>
                    Використано (борг)
                    <b>{money(l.newUsed)}</b>
                    {l.simPaid > 0 && <small>Було: {money(l.oldUsed)}</small>}
                  </div>
                  <div>
                    Обов'язковий мін. платіж
                    <b>{money(l.newMin)} / міс.</b>
                    {l.minSaved > 0 && <small>-{money(l.minSaved)} / міс. (було {money(l.oldMin)})</small>}
                  </div>
                  <div>
                    Доступний ліміт
                    <b>{money(l.available)}</b>
                    {l.simPaid > 0 && <small>+{money(l.simPaid)} вільних коштів</small>}
                  </div>
                  <div>
                    Залишок до пільгового
                    <b>{money(l.newGrace)}</b>
                    {l.monthlyInterestSaved > 0 && (
                      <small>Економія ~{money(l.monthlyInterestSaved)}/міс. поза пільгою</small>
                    )}
                  </div>
                </div>

                <div className="quick-chips">
                  {l.newMin > 0 && (
                    <button
                      type="button"
                      className="chip"
                      onClick={() => onAddSimPayment(`l_${l.id}`, l.newMin)}
                    >
                      Мін. ({money(l.newMin)})
                    </button>
                  )}
                  {[2000, 5000].map(amt => (
                    <button
                      key={amt}
                      type="button"
                      className="chip"
                      disabled={l.newUsed <= 0}
                      onClick={() => onAddSimPayment(`l_${l.id}`, Math.min(l.newUsed, amt))}
                    >
                      +{money(amt)}
                    </button>
                  ))}
                  {l.newUsed > 0 && (
                    <button
                      type="button"
                      className="chip active"
                      onClick={() => onAddSimPayment(`l_${l.id}`, l.newUsed)}
                    >
                      Закрити борг ({money(l.newUsed)})
                    </button>
                  )}
                </div>

                {l.entries.length > 0 && (
                  <div className="sim-payments-tags">
                    {l.entries.map((e, idx) => (
                      <span className="sim-tag" key={e.id}>
                        Платіж #{idx + 1}: -{money(e.amount)}
                        <button
                          type="button"
                          onClick={() => onRemoveSimPayment(`l_${l.id}`, e.id)}
                          aria-label="Видалити тестовий платіж"
                        >
                          <X size={13}/>
                        </button>
                      </span>
                    ))}
                  </div>
                )}

                <div className="limit-actions">
                  <button
                    type="button"
                    className="btn primary"
                    disabled={l.newUsed <= 0}
                    onClick={() => onOpenSimModal(l, true, l.newUsed)}
                  >
                    <Plus/> Внести віртуально
                  </button>
                  {l.simPaid > 0 && (
                    <button
                      type="button"
                      className="btn secondary"
                      onClick={() => onClearItemSim(`l_${l.id}`)}
                    >
                      <RotateCcw/> Скинути
                    </button>
                  )}
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      {/* Next Months Forecast Table / Cards (Before vs After) */}
      {monthlyComparison.length > 0 && (
        <section className="panel table-panel">
          <PanelHead
            title={`Прогноз ситуації на наступні місяці (${monthlyComparison.length} міс.)`}
            action={<span className="muted">Порівняння: Реальний графік vs Після віртуальних платежів</span>}
          />

          <div className="table-scroll desktop-schedule-table">
            <table>
              <thead>
                <tr>
                  <th>Місяць</th>
                  <th>Платіж (Було)</th>
                  <th>Новий платіж</th>
                  <th>Різниця в бюджеті</th>
                  <th>Залишок боргу (Було)</th>
                  <th>Новий залишок боргу</th>
                </tr>
              </thead>
              <tbody>
                {visibleComparison.map(r => (
                  <tr key={r.month}>
                    <td><b>Місяць #{r.month}</b></td>
                    <td className="muted">{money(r.oldPay)}</td>
                    <td><b>{money(r.newPay)}</b></td>
                    <td>
                      {r.payDiff > 0 ? (
                        <span className="badge ok">-{money(r.payDiff)}</span>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                    <td className="muted">{money(r.oldBal)}</td>
                    <td><b>{money(r.newBal)}</b></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="schedule-mobile-list">
            {visibleComparison.map(r => (
              <div className="schedule-m-card" key={r.month}>
                <div className="schedule-m-top">
                  <span>
                    <span className="badge neutral">Місяць #{r.month}</span>{' '}
                    <b>Платіж: {money(r.newPay)}</b>
                  </span>
                  {r.payDiff > 0 ? (
                    <span className="badge ok">-{money(r.payDiff)} / міс.</span>
                  ) : (
                    <span className="muted">Було: {money(r.oldPay)}</span>
                  )}
                </div>
                <div className="schedule-m-grid">
                  <div>Було платіж<b>{money(r.oldPay)}</b></div>
                  <div>Було борг<b>{money(r.oldBal)}</b></div>
                  <div>Новий борг<b>{money(r.newBal)}</b></div>
                </div>
              </div>
            ))}
          </div>

          {monthlyComparison.length > 12 && (
            <div style={{ marginTop: 14, textAlign: 'center' }}>
              <button type="button" className="btn secondary wide" onClick={() => setShowAllMonths(!showAllMonths)}>
                {showAllMonths ? 'Згорнути до 12 місяців' : `Показати всі ${monthlyComparison.length} місяців`}
              </button>
            </div>
          )}
        </section>
      )}
    </div>
  );
}


function App() {
  const [localState, setLocalState] = useState(load);
  const [state, setState] = useState(load);
  const [ready, setReady] = useState(!cloudEnabled);
  const [syncError, setSyncError] = useState('');
  const [localCandidate, setLocalCandidate] = useState(null);
  const [view, setView] = useState('dashboard');
  const [modal, setModal] = useState(null);
  const [selected, setSelected] = useState(null);
  const [extra, setExtra] = useState(0);
  const [menu, setMenu] = useState(false);
  const [fabOpen, setFabOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [paymentModal, setPaymentModal] = useState(null);
  const [simModal, setSimModal] = useState(null);
  const [simPayments, setSimPayments] = useState({});
  const [recalcMode, setRecalcMode] = useState('reduce_payment');
  const [planModal, setPlanModal] = useState(null);
  const [confirmDialog, setConfirmDialog] = useState(null);
  const [toast, setToast] = useState(null);

  const notify = (msg, type = 'ok') => {
    setToast({ msg, type });
    setTimeout(() => setToast(t => (t?.msg === msg ? null : t)), 3600);
  };

  const hydrate = async authUser => {
    const u = await fetchCloudUser(authUser);
    const s = { users: [u], session: u.id, theme: u.theme || 'light' };
    setState(s);
    setReady(true);
    const backup = localBackup();
    const old = backup.users.find(x => x.email?.toLowerCase() === u.email?.toLowerCase());
    if (old && (old.credits?.length || old.limits?.length) && !u.credits.length && !u.limits.length) {
      setLocalCandidate(old);
    }
  };

  useEffect(() => {
    if (!supabase) return;
    let mounted = true;
    supabase.auth.getSession().then(async ({ data, error }) => {
      if (error) {
        setSyncError(error.message);
        setReady(true);
        return;
      }
      if (data.session) {
        try {
          if (mounted) await hydrate(data.session.user);
        } catch (e) {
          if (mounted) setSyncError(e.message || 'Не вдалося завантажити дані.');
        }
      } else if (mounted) {
        setState(emptyState());
        setReady(true);
      }
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;
      if (event === 'SIGNED_OUT') {
        setState(emptyState());
        setReady(true);
        return;
      }
      if (session && event !== 'INITIAL_SESSION') {
        setTimeout(() => hydrate(session.user).catch(e => setSyncError(e.message || 'Не вдалося синхронізувати дані.')), 0);
      }
    });
    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', state.theme === 'dark');
    if (!cloudEnabled) save(state);
  }, [state]);

  // Close modals on Escape key
  useEffect(() => {
    const onKey = e => {
      if (e.key === 'Escape') {
        setModal(null);
        setPaymentModal(null);
        setSimModal(null);
        setPlanModal(null);
        setConfirmDialog(null);
        setFabOpen(false);
        setMenu(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const user = state.users.find(u => u.id === state.session);

  if (!ready) {
    return (
      <main className="auth">
        <section className="auth-card">
          <div className="logo"><CreditCard/></div>
          <p className="eyebrow">SYNC</p>
          <h1>Завантажуємо ваші дані…</h1>
          <p className="muted lead">Підключаємо особистий кабінет та хмарну синхронізацію.</p>
        </section>
      </main>
    );
  }

  if (!user) {
    return (
      <>
        {toast && (
          <div className="toast-wrap">
            <div className={`toast ${toast.type}`}>{toast.msg}</div>
          </div>
        )}
        <Auth
          state={localState}
          setState={s => { setLocalState(s); setState(s); }}
          onAuthenticated={async authUser => { await hydrate(authUser); }}
          notify={notify}
        />
      </>
    );
  }

  const allCredits = user.credits || [];
  const allLimits = user.limits || [];
  const q = query.trim().toLowerCase();

  const credits = q
    ? allCredits.filter(c =>
        c.name.toLowerCase().includes(q) ||
        String(c.balance).includes(q) ||
        String(c.rate).includes(q)
      )
    : allCredits;

  const limits = q
    ? allLimits.filter(c =>
        c.name.toLowerCase().includes(q) ||
        String(c.used).includes(q) ||
        String(c.limit).includes(q)
      )
    : allLimits;

  const update = async fn => {
    const oldUser = { ...user, credits: [...allCredits], limits: [...allLimits] };
    const newUser = fn({ ...user });
    const s = { ...state, users: state.users.map(u => (u.id === user.id ? newUser : u)) };
    setState(s);
    if (!cloudEnabled) {
      save(s);
      setLocalState(s);
      return;
    }
    try {
      setSyncError('');
      await syncCloudUser(user.id, oldUser, newUser, s.theme);
      setLocalState(s);
    } catch (e) {
      setSyncError(e.message || 'Не вдалося зберегти зміни в хмарі.');
    }
  };

  const migrateLocal = async () => {
    if (!supabase || !localCandidate) return;
    try {
      await importLocalDataToCloud({ id: user.id, email: user.email, user_metadata: { name: user.name } }, localCandidate);
      await hydrate({ id: user.id, email: user.email, user_metadata: { name: user.name } });
      setLocalCandidate(null);
      notify('Локальні дані успішно імпортовано в хмару.');
    } catch (e) {
      setSyncError(e.message || 'Не вдалося імпортувати локальні дані.');
    }
  };

  const makePayment = async (item, kind, amount, date, isLimit, chosenOverpayMode) => {
    const requested = n(amount);
    const balance = isLimit ? n(item.used) : n(item.balance);
    if (requested <= 0) return notify('Сума платежу має бути більшою за 0.', 'error');
    if (balance <= 0) return notify('Ця заборгованість уже повністю погашена.', 'error');
    if (!date) return notify('Оберіть дату платежу.', 'error');
    const a = Math.min(requested, balance);
    const mode = chosenOverpayMode || item.overpayMode || (isLimit ? 'reduce_payment' : 'reduce_last');
    saveOverpayMode(item.id, mode);

    const rec = {
      id: uid(),
      date: new Date(`${date}T12:00:00`).toISOString(),
      amount: a,
      principal: a,
      interest: 0,
      kind,
      overpayMode: mode
    };
    await update(u =>
      isLimit
        ? {
            ...u,
            limits: u.limits.map(x => {
              if (x.id !== item.id) return x;
              const newUsed = Math.max(0, balance - a);
              const oldMin = n(x.minPayment);
              const isOver = kind === 'early' || a > oldMin;
              const newMin =
                newUsed <= 0.01
                  ? 0
                  : isOver && mode === 'reduce_payment'
                  ? Math.min(newUsed, Math.round(oldMin * (newUsed / Math.max(1, balance))))
                  : oldMin;
              return {
                ...x,
                used: newUsed,
                minPayment: newMin,
                overpayMode: mode,
                payments: [...(x.payments || []), rec]
              };
            })
          }
        : {
            ...u,
            credits: u.credits.map(x => {
              if (x.id !== item.id) return x;
              const prev = earlyPaymentPreview(x, a, mode, kind);
              const isOver = kind === 'early' || a > n(x.payment);
              return {
                ...x,
                balance: prev.newBalance,
                payment:
                  prev.newBalance > 0 && isOver && mode === 'reduce_payment'
                    ? Math.round(prev.newPayment)
                    : x.payment,
                overpayMode: mode,
                paid: kind === 'regular',
                payments: [...(x.payments || []), rec]
              };
            })
          }
    );
    setPaymentModal(null);
    notify(`Платіж ${money(a)} успішно збережено!`);
  };

  const deletePayment = (itemId, paymentId, amount, isLimit) => {
    setConfirmDialog({
      title: 'Скасувати платіж?',
      message: `Сума ${money(amount)} буде повернута до залишку заборгованості.`,
      confirmText: 'Скасувати платіж',
      danger: true,
      onConfirm: () => {
        update(u =>
          isLimit
            ? {
                ...u,
                limits: u.limits.map(x =>
                  x.id === itemId
                    ? { ...x, used: Math.min(n(x.limit), n(x.used) + n(amount)), payments: (x.payments || []).filter(p => p.id !== paymentId) }
                    : x
                )
              }
            : {
                ...u,
                credits: u.credits.map(x =>
                  x.id === itemId
                    ? { ...x, balance: n(x.balance) + n(amount), payments: (x.payments || []).filter(p => p.id !== paymentId) }
                    : x
                )
              }
        );
        notify('Платіж скасовано, залишок відновлено.');
      }
    });
  };

  const saveCredit = c => {
    saveOverpayMode(c.id, c.overpayMode || 'reduce_last');
    const x = normalizeCredit({
      ...c,
      overpayMode: c.overpayMode === 'reduce_payment' ? 'reduce_payment' : 'reduce_last',
      balance: n(c.balance),
      initialAmount: n(c.initialAmount) || n(c.balance),
      rate: n(c.rate),
      payment: n(c.payment),
      dueDay: Math.min(31, Math.max(1, n(c.dueDay) || 1)),
      termMonths: Math.max(1, n(c.termMonths) || 1)
    });
    update(u => ({
      ...u,
      credits: u.credits.some(z => z.id === x.id) ? u.credits.map(z => (z.id === x.id ? x : z)) : [x, ...u.credits]
    }));
    setModal(null);
    notify('Кредит збережено.');
  };

  const saveLimit = c => {
    saveOverpayMode(c.id, c.overpayMode || 'reduce_payment');
    const x = normalizeLimit({
      ...c,
      overpayMode: c.overpayMode === 'reduce_last' ? 'reduce_last' : 'reduce_payment',
      limit: n(c.limit),
      used: n(c.used),
      rate: n(c.rate),
      minPayment: n(c.minPayment),
      gracePayment: n(c.gracePayment),
      dueDay: Math.min(31, Math.max(1, n(c.dueDay) || 1))
    });
    update(u => ({
      ...u,
      limits: u.limits.some(z => z.id === x.id) ? u.limits.map(z => (z.id === x.id ? x : z)) : [x, ...u.limits]
    }));
    setModal(null);
    notify('Кредитний ліміт збережено.');
  };

  const removeCredit = id => {
    const target = allCredits.find(c => c.id === id);
    setConfirmDialog({
      title: 'Видалити кредит?',
      message: `Запис «${target?.name || 'Кредит'}» та його історію платежів буде видалено.`,
      confirmText: 'Видалити',
      danger: true,
      onConfirm: () => {
        update(u => ({ ...u, credits: u.credits.filter(c => c.id !== id) }));
        if (selected?.id === id) setView('credits');
        notify('Кредит видалено.');
      }
    });
  };

  const removeLimit = id => {
    const target = allLimits.find(c => c.id === id);
    setConfirmDialog({
      title: 'Видалити кредитний ліміт?',
      message: `Картку «${target?.name || 'Ліміт'}» буде видалено зі списку.`,
      confirmText: 'Видалити',
      danger: true,
      onConfirm: () => {
        update(u => ({ ...u, limits: u.limits.filter(c => c.id !== id) }));
        if (selected?.id === id) setView('limits');
        notify('Кредитний ліміт видалено.');
      }
    });
  };

  const exportBackup = () => {
    const payload = {
      version: 1,
      exportedAt: new Date().toISOString(),
      users: [{ name: user.name, email: user.email, theme: state.theme, credits: allCredits, limits: allLimits }]
    };
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));
    a.download = 'credit-manager-backup.json';
    a.click();
    notify('Резервну копію завантажено.');
  };

  const importBackup = async file => {
    if (!file) return;
    try {
      setSyncError('');
      const { sourceCredits, sourceLimits } = await parseBackupFile(file, user.email);
      const runImport = async () => {
        const importedCredits = sourceCredits.map(raw => ({ ...normalizeCredit(raw), id: uid() }));
        const importedLimits = sourceLimits.map(raw => ({ ...raw, id: uid() }));
        await update(u => ({
          ...u,
          credits: [...importedCredits, ...(u.credits || [])],
          limits: [...importedLimits, ...(u.limits || [])]
        }));
        notify(`Імпортовано: ${importedCredits.length} кредитів, ${importedLimits.length} лімітів.`);
      };
      if (allCredits.length || allLimits.length) {
        setConfirmDialog({
          title: 'Імпортувати резервну копію?',
          message: `У кабінеті вже є дані. Імпорт додасть ${sourceCredits.length} кредитів та ${sourceLimits.length} лімітів до поточних записів.`,
          confirmText: 'Імпортувати',
          onConfirm: runImport
        });
      } else {
        await runImport();
      }
    } catch (e) {
      notify(e.message || 'Не вдалося імпортувати файл.', 'error');
    }
  };

  const logout = async () => {
    if (supabase) await supabase.auth.signOut();
    else {
      const s = { ...state, session: null };
      save(s);
      setState(s);
    }
  };

  const toggleTheme = async () => {
    const next = state.theme === 'dark' ? 'light' : 'dark';
    const s = { ...state, theme: next };
    setState(s);
    if (!cloudEnabled) {
      save(s);
      return;
    }
    try {
      await upsertCloudProfile(user, next);
      setSyncError('');
    } catch (e) {
      setSyncError(e.message || 'Не вдалося зберегти тему.');
    }
  };

  const resetPassword = async () => {
    if (!supabase) return;
    const { error } = await supabase.auth.resetPasswordForEmail(user.email, { redirectTo: window.location.origin });
    if (error) return notify(error.message, 'error');
    notify('Лист для зміни пароля надіслано на ваш email.');
  };

  const simEntriesCount = Object.values(simPayments).reduce((s, arr) => s + (arr?.length || 0), 0);

  const addSimPayment = (key, amount, overpayMode) => {
    const val = n(amount);
    if (val <= 0) return notify('Сума віртуального платежу має бути більшою за 0.', 'error');
    setSimPayments(prev => ({
      ...prev,
      [key]: [
        ...(prev[key] || []),
        { id: uid(), amount: val, overpayMode, date: new Date().toISOString().slice(0, 10) }
      ]
    }));
    notify(`Додано у передперегляд: ${money(val)}`);
  };

  const removeSimPayment = (key, entryId) => {
    setSimPayments(prev => ({
      ...prev,
      [key]: (prev[key] || []).filter(e => e.id !== entryId)
    }));
  };

  const clearItemSim = key => {
    setSimPayments(prev => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    notify('Віртуальні платежі для запису скинуто.');
  };

  const resetAllSim = () => {
    setSimPayments({});
    notify('Усі віртуальні платежі передперегляду скинуто.');
  };

  const applySimToReal = () => {
    if (!simEntriesCount) return;
    setConfirmDialog({
      title: 'Застосувати віртуальні платежі?',
      message: 'Усі внесені у передперегляді платежі будуть записані у вашу реальну історію та зменшать фактичний залишок боргу.',
      confirmText: 'Застосувати реально',
      onConfirm: async () => {
        const nowIso = new Date().toISOString();
        await update(u => ({
          ...u,
          credits: (u.credits || []).map(c => {
            const entries = simPayments[`c_${c.id}`] || [];
            if (!entries.length) return c;
            const sim = simulateCreditItem(c, entries, recalcMode);
            const newRecs = entries.map(e => ({
              id: uid(),
              date: nowIso,
              amount: n(e.amount),
              principal: n(e.amount),
              interest: 0,
              kind: 'early'
            }));
            return {
              ...c,
              balance: sim.newBalance,
              payment: sim.newBalance > 0 && recalcMode === 'reduce_payment' ? Math.round(sim.newPayment) : c.payment,
              payments: [...(c.payments || []), ...newRecs]
            };
          }),
          limits: (u.limits || []).map(normalizeLimit).map(l => {
            const entries = simPayments[`l_${l.id}`] || [];
            if (!entries.length) return l;
            const sim = simulateLimitItem(l, entries);
            const newRecs = entries.map(e => ({
              id: uid(),
              date: nowIso,
              amount: n(e.amount),
              principal: n(e.amount),
              interest: 0,
              kind: 'early'
            }));
            return {
              ...l,
              used: sim.newUsed,
              minPayment: sim.newMin,
              gracePayment: sim.newGrace,
              payments: [...(l.payments || []), ...newRecs]
            };
          })
        }));
        setSimPayments({});
        notify('Віртуальні платежі успішно проведено!');
      }
    });
  };

  const switchView = nextView => {
    setView(nextView);
    setMenu(false);
    setFabOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="app">
      {toast && (
        <div className="toast-wrap">
          <div className={`toast ${toast.type}`}>{toast.msg}</div>
        </div>
      )}

      {/* Desktop Sidebar */}
      <aside className={`sidebar ${menu ? 'open' : ''}`}>
        <div className="side-brand">
          <div className="logo small"><CreditCard/></div>
          <span>Кредитний менеджер</span>
        </div>
        <nav>
          <Nav icon={<Home/>} text="Огляд" active={view === 'dashboard'} click={() => switchView('dashboard')}/>
          <Nav icon={<CreditCard/>} text="Мої кредити" badge={allCredits.length} active={view === 'credits' || view === 'details'} click={() => switchView('credits')}/>
          <Nav icon={<WalletCards/>} text="Кредитні ліміти" badge={allLimits.length} active={view === 'limits' || view === 'limit-details'} click={() => switchView('limits')}/>
          <Nav icon={<Calculator/>} text="Передперегляд" badge={simEntriesCount} active={view === 'sandbox'} click={() => switchView('sandbox')}/>
          <Nav icon={<TrendingDown/>} text="Прогноз" active={view === 'forecast'} click={() => switchView('forecast')}/>
          <Nav icon={<CalendarDays/>} text="Платежі" active={view === 'payments'} click={() => switchView('payments')}/>
        </nav>
        <div className="side-bottom">
          <Nav icon={<Settings/>} text="Налаштування" active={view === 'settings'} click={() => switchView('settings')}/>
          <Nav icon={<LogOut/>} text="Вийти" click={logout}/>
        </div>
      </aside>

      {menu && <div className="backdrop" onClick={() => setMenu(false)}/>}

      <div className="main">
        <header className="header">
          <div className="header-left">
            <div className="mobile-brand" onClick={() => switchView('dashboard')} style={{ cursor: 'pointer' }}>
              <div className="logo small"><CreditCard/></div>
            </div>
            <div className="search">
              <Search/>
              <input
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Пошук банку, кредиту або суми..."
                aria-label="Пошук"
              />
              {query && (
                <button type="button" className="search-clear" onClick={() => setQuery('')} aria-label="Очистити пошук">
                  <X/>
                </button>
              )}
            </div>
          </div>
          <div className="header-actions">
            <button type="button" className="icon-btn" onClick={toggleTheme} aria-label="Перемкнути тему">
              {state.theme === 'dark' ? <Sun/> : <Moon/>}
            </button>
            <button type="button" className="icon-btn" onClick={() => switchView('settings')} aria-label="Налаштування">
              <Settings/>
            </button>
            <div className="avatar" onClick={() => switchView('settings')} title={user.name}>
              {user.name?.[0]?.toUpperCase() || 'К'}
            </div>
          </div>
        </header>

        <main className="page">
          {syncError && <div className="sync-alert">{syncError}</div>}
          {localCandidate && (
            <div className="sync-alert">
              <b>Знайдено локальні дані з цього браузера.</b>
              <button type="button" onClick={migrateLocal}>Імпортувати в акаунт</button>
            </div>
          )}

          {view === 'dashboard' && (
            <Dashboard
              user={user}
              credits={credits}
              limits={limits}
              onAddCredit={() => setModal({ type: 'credit' })}
              onAddLimit={() => setModal({ type: 'limit' })}
              onOpenCredit={c => { setSelected(c); switchView('details'); }}
              onOpenLimit={c => { setSelected(c); switchView('limit-details'); }}
              onPaymentCredit={c => setPaymentModal({ item: c, isLimit: false })}
              onPaymentLimit={c => setPaymentModal({ item: c, isLimit: true })}
              onOpenForecast={() => switchView('forecast')}
              onOpenPlan={() => setPlanModal(allLimits)}
            />
          )}

          {view === 'credits' && (
            <div className="view">
              <div className="page-title">
                <div>
                  <p className="eyebrow">КРЕДИТИ ТА РОЗСТРОЧКИ</p>
                  <h2>Мої кредити</h2>
                  <p className="muted">Натисніть на картку для перегляду графіка та симуляції дострокового погашення.</p>
                </div>
                <div className="title-actions">
                  <button type="button" className="btn primary" onClick={() => setModal({ type: 'credit' })}>
                    <Plus/> Додати кредит
                  </button>
                </div>
              </div>
              <div className="credit-grid">
                {credits.map(c => (
                  <CreditCardView
                    key={c.id}
                    c={c}
                    onEdit={() => setModal({ type: 'credit', credit: c })}
                    onDelete={() => removeCredit(c.id)}
                    onPayment={() => setPaymentModal({ item: c, isLimit: false })}
                    onOpen={() => { setSelected(c); switchView('details'); }}
                  />
                ))}
                {!credits.length && <Empty onAdd={() => setModal({ type: 'credit' })}/>}
              </div>
            </div>
          )}

          {view === 'limits' && (
            <div className="view">
              <div className="page-title">
                <div>
                  <p className="eyebrow">КРЕДИТНІ КАРТКИ</p>
                  <h2>Мої кредитні ліміти</h2>
                  <p className="muted">Контроль використаного ліміту, пільгового періоду та пріоритету погашення.</p>
                </div>
                <div className="title-actions">
                  <button
                    type="button"
                    className="btn secondary"
                    onClick={() => setPlanModal(allLimits)}
                    disabled={!allLimits.length}
                  >
                    <Target/> План погашення ({allLimits.length})
                  </button>
                  <button type="button" className="btn primary" onClick={() => setModal({ type: 'limit' })}>
                    <Plus/> Додати ліміт
                  </button>
                </div>
              </div>
              <div className="credit-grid">
                {limits.map(c => (
                  <LimitCard
                    key={c.id}
                    c={c}
                    onEdit={() => setModal({ type: 'limit', limit: c })}
                    onDelete={() => removeLimit(c.id)}
                    onPayment={() => setPaymentModal({ item: c, isLimit: true })}
                    onPlan={() => setPlanModal([c])}
                    onOpen={() => { setSelected(c); switchView('limit-details'); }}
                  />
                ))}
                {!limits.length && (
                  <Empty
                    onAdd={() => setModal({ type: 'limit' })}
                    title="Кредитних лімітів ще немає"
                    text="Додайте банк, ліміт, використану суму та ваші платіжні цілі."
                  />
                )}
              </div>
            </div>
          )}

          {view === 'sandbox' && (
            <SandboxView
              credits={credits}
              limits={limits}
              simPayments={simPayments}
              recalcMode={recalcMode}
              setRecalcMode={setRecalcMode}
              onAddSimPayment={addSimPayment}
              onRemoveSimPayment={removeSimPayment}
              onClearItemSim={clearItemSim}
              onResetAllSim={resetAllSim}
              onOpenSimModal={(item, isLimit, remainingBalance) =>
                setSimModal({
                  item: isLimit ? { ...item, used: remainingBalance } : { ...item, balance: remainingBalance },
                  isLimit,
                  key: `${isLimit ? 'l' : 'c'}_${item.id}`
                })
              }
              onApplySimToReal={applySimToReal}
            />
          )}

          {view === 'forecast' && (
            <Forecast credits={credits} extra={extra} setExtra={setExtra}/>
          )}

          {view === 'payments' && (
            <Payments
              credits={credits}
              limits={limits}
              onPaymentCredit={c => setPaymentModal({ item: c, isLimit: false })}
              onPaymentLimit={c => setPaymentModal({ item: c, isLimit: true })}
              onDeletePayment={deletePayment}
            />
          )}

          {view === 'settings' && (
            <SettingsView
              state={state}
              user={user}
              cloudEnabled={cloudEnabled}
              onResetPassword={resetPassword}
              onMigrate={localCandidate ? migrateLocal : null}
              onToggleTheme={toggleTheme}
              onImportBackup={importBackup}
              onExportBackup={exportBackup}
              onLogout={logout}
            />
          )}

          {view === 'details' && selected && (
            <Details
              c={allCredits.find(x => x.id === selected.id) || selected}
              extra={extra}
              setExtra={setExtra}
              onBack={() => switchView('credits')}
              onEdit={c => setModal({ type: 'credit', credit: c })}
              onPaid={c => setPaymentModal({ item: c, isLimit: false })}
              onDeletePayment={deletePayment}
            />
          )}

          {view === 'limit-details' && selected && (
            <LimitDetails
              c={allLimits.find(x => x.id === selected.id) || selected}
              onBack={() => switchView('limits')}
              onEdit={c => setModal({ type: 'limit', limit: c })}
              onPayment={c => setPaymentModal({ item: c, isLimit: true })}
              onPlan={c => setPlanModal([c])}
              onDeletePayment={deletePayment}
            />
          )}
        </main>
      </div>

      {/* Mobile Quick Action FAB */}
      <div className="mobile-fab-wrap">
        {fabOpen && (
          <div className="fab-menu">
            <button type="button" onClick={() => { setFabOpen(false); setModal({ type: 'credit' }); }}>
              <CreditCard size={16}/> Додати кредит
            </button>
            <button type="button" onClick={() => { setFabOpen(false); setModal({ type: 'limit' }); }}>
              <WalletCards size={16}/> Додати ліміт
            </button>
            {allLimits.length > 0 && (
              <button type="button" onClick={() => { setFabOpen(false); setPlanModal(allLimits); }}>
                <Target size={16}/> План погашення
              </button>
            )}
          </div>
        )}
        <button
          type="button"
          className={`fab-main ${fabOpen ? 'open' : ''}`}
          onClick={() => setFabOpen(!fabOpen)}
          aria-label="Швидка дія"
        >
          <Plus/>
        </button>
      </div>

      {/* Mobile Bottom Navigation Bar */}
      <nav className="bottom-nav" aria-label="Мобільна навігація">
        <button type="button" className={`b-nav-btn ${view === 'dashboard' ? 'active' : ''}`} onClick={() => switchView('dashboard')}>
          <Home/>
          <span>Огляд</span>
        </button>
        <button type="button" className={`b-nav-btn ${view === 'credits' || view === 'details' ? 'active' : ''}`} onClick={() => switchView('credits')}>
          <CreditCard/>
          <span>Кредити</span>
        </button>
        <button type="button" className={`b-nav-btn ${view === 'limits' || view === 'limit-details' ? 'active' : ''}`} onClick={() => switchView('limits')}>
          <WalletCards/>
          <span>Ліміти</span>
        </button>
        <button type="button" className={`b-nav-btn ${view === 'sandbox' ? 'active' : ''}`} onClick={() => switchView('sandbox')}>
          <Calculator/>
          <span>Пісочниця</span>
        </button>
        <button type="button" className={`b-nav-btn ${view === 'forecast' ? 'active' : ''}`} onClick={() => switchView('forecast')}>
          <TrendingDown/>
          <span>Прогноз</span>
        </button>
        <button type="button" className={`b-nav-btn ${view === 'payments' ? 'active' : ''}`} onClick={() => switchView('payments')}>
          <CalendarDays/>
          <span>Платежі</span>
        </button>
      </nav>

      {modal?.type === 'credit' && (
        <CreditModal credit={modal.credit} onClose={() => setModal(null)} onSave={saveCredit} notify={notify}/>
      )}
      {modal?.type === 'limit' && (
        <LimitModal limit={modal.limit} onClose={() => setModal(null)} onSave={saveLimit} notify={notify}/>
      )}
      {paymentModal && (
        <PaymentModal
          item={paymentModal.item}
          isLimit={paymentModal.isLimit}
          onClose={() => setPaymentModal(null)}
          onSave={(kind, amount, date, mode) => makePayment(paymentModal.item, kind, amount, date, paymentModal.isLimit, mode)}
          notify={notify}
        />
      )}
      {simModal && (
        <PaymentModal
          item={simModal.item}
          isLimit={simModal.isLimit}
          onClose={() => setSimModal(null)}
          onSave={(kind, amount, _date, mode) => {
            addSimPayment(simModal.key, amount, mode);
            setSimModal(null);
          }}
          notify={notify}
        />
      )}
      {planModal && (
        <LimitPlan
          limits={planModal}
          onClose={() => setPlanModal(null)}
          onSave={plan => {
            update(u => ({
              ...u,
              limits: u.limits.map(l => {
                const p = plan.find(x => x.limitId === l.id);
                return p ? { ...l, planPayment: p.amount } : l;
              })
            }));
            notify('План погашення збережено!');
          }}
        />
      )}
      <ConfirmSheet data={confirmDialog} onCancel={() => setConfirmDialog(null)}/>
    </div>
  );
}

createRoot(document.getElementById('root')).render(<App/>);
