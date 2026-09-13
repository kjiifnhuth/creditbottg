import React,{useEffect,useMemo,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {Home,CreditCard,TrendingDown,CalendarDays,Settings,LogOut,Plus,Pencil,Trash2,Check,Moon,Sun,Menu,X,Download,FileText,ShieldCheck,Eye,EyeOff,Search,ArrowDownRight,Upload,Target,WalletCards,ArrowUpRight} from 'lucide-react';
import './styles.css';
import { createClient } from '@supabase/supabase-js';

const KEY='credit_manager_v2';
const LEGACY_KEY='credit_manager_v1';
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || '';
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY || '';
const SUPABASE_ANON_KEY = SUPABASE_PUBLISHABLE_KEY;
const supabase = SUPABASE_URL && SUPABASE_ANON_KEY
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    })
  : null;
const cloudEnabled = Boolean(supabase);

const emptyState=()=>({users:[],session:null,theme:'light'});
const localBackup=()=>{try{return load()}catch{return emptyState()}};
function mapCreditRow(r){return normalizeCredit({
  id:r.id,name:r.name,initialAmount:r.initial_amount,balance:r.balance,rate:r.rate,
  type:r.type,payment:r.payment,dueDay:r.due_day,termMonths:r.term_months,
  interestPolicy:r.interest_policy,paid:Boolean(r.paid),payments:Array.isArray(r.payments)?r.payments:[]
})}
function mapLimitRow(r){return {
  id:r.id,name:r.name,limit:r.credit_limit,used:r.used,rate:r.rate,
  minPayment:r.min_payment,gracePayment:r.grace_payment,dueDay:r.due_day,
  payments:Array.isArray(r.payments)?r.payments:[],planPayment:r.plan_payment
}}
function creditRow(userId,c){return {
  id:c.id,user_id:userId,name:String(c.name||''),initial_amount:n(c.initialAmount),balance:n(c.balance),
  rate:n(c.rate),type:c.type==='diff'?'diff':'annuity',payment:n(c.payment),due_day:Math.min(31,Math.max(1,n(c.dueDay)||1)),
  term_months:Math.max(1,n(c.termMonths)||1),interest_policy:c.interestPolicy==='full_term'?'full_term':'actual',
  payments:Array.isArray(c.payments)?c.payments:[]
}}
function limitRow(userId,l){return {
  id:l.id,user_id:userId,name:String(l.name||''),credit_limit:n(l.limit),used:n(l.used),rate:n(l.rate),
  min_payment:n(l.minPayment),grace_payment:n(l.gracePayment),due_day:Math.min(31,Math.max(1,n(l.dueDay)||1)),
  payments:Array.isArray(l.payments)?l.payments:[],plan_payment:l.planPayment==null?null:n(l.planPayment)
}}
async function fetchCloudUser(authUser){
  if(!supabase) return null;
  const [{data:profileRow,error:profileError},{data:creditRows,error:creditError},{data:limitRows,error:limitError}]=await Promise.all([
    supabase.from('profiles').select('id,name,theme').eq('id',authUser.id).maybeSingle(),
    supabase.from('credits').select('*').eq('user_id',authUser.id).order('created_at',{ascending:false}),
    supabase.from('credit_limits').select('*').eq('user_id',authUser.id).order('created_at',{ascending:false})
  ]);
  if(profileError) throw profileError;
  if(creditError) throw creditError;
  if(limitError) throw limitError;
  let profile=profileRow;
  if(!profile){
    const name=authUser.user_metadata?.name||authUser.email?.split('@')[0]||'Користувач';
    const {data:newProfile,error}=await supabase.from('profiles').insert({id:authUser.id,name,theme:'light'}).select('id,name,theme').single();
    if(error) throw error;
    profile=newProfile;
  }
  return {
    id:authUser.id,name:profile.name||authUser.user_metadata?.name||'Користувач',email:authUser.email||'',
    credits:(creditRows||[]).map(mapCreditRow),limits:(limitRows||[]).map(mapLimitRow),theme:profile.theme==='dark'?'dark':'light'
  };
}
async function upsertCloudProfile(user,theme){
  if(!supabase) return;
  const {error}=await supabase.from('profiles').upsert({id:user.id,name:user.name||'Користувач',theme:theme==='dark'?'dark':'light'});
  if(error) throw error;
}
async function syncCollection(table,userId,oldItems,newItems,mapper){
  if(!supabase) return;
  const oldIds=new Set(oldItems.map(x=>x.id));
  const newIds=new Set(newItems.map(x=>x.id));
  const removed=[...oldIds].filter(id=>!newIds.has(id));
  if(removed.length){
    const {error}=await supabase.from(table).delete().eq('user_id',userId).in('id',removed);
    if(error) throw error;
  }
  if(newItems.length){
    const {error}=await supabase.from(table).upsert(newItems.map(x=>mapper(userId,x)),{onConflict:'id'});
    if(error) throw error;
  }
}
async function syncCloudUser(userId,oldUser,newUser,theme){
  if(!supabase) return;
  await upsertCloudProfile(newUser,theme);
  await syncCollection('credits',userId,oldUser?.credits||[],newUser.credits||[],creditRow);
  await syncCollection('credit_limits',userId,oldUser?.limits||[],newUser.limits||[],limitRow);
}
async function importLocalDataToCloud(authUser,localUser){
  if(!supabase||!localUser) return;
  const credits=(localUser.credits||[]).map(c=>creditRow(authUser.id,{...c,id:c.id||uid()}));
  const limits=(localUser.limits||[]).map(l=>limitRow(authUser.id,{...l,id:l.id||uid()}));
  if(credits.length){const {error}=await supabase.from('credits').upsert(credits,{onConflict:'id'});if(error)throw error}
  if(limits.length){const {error}=await supabase.from('credit_limits').upsert(limits,{onConflict:'id'});if(error)throw error}
  await upsertCloudProfile({id:authUser.id,name:localUser.name||authUser.user_metadata?.name||'Користувач'},localUser.theme||'light');
}

async function importBackupFileToCloud(authUser, file){
  if(!supabase) throw new Error('Хмарне сховище Supabase не підключене.');
  if(!file) throw new Error('Файл не вибрано.');
  const text=await file.text();
  let backup;
  try{backup=JSON.parse(text)}catch{throw new Error('Файл має некоректний JSON-формат.')}
  if(backup?.version!==1 || !Array.isArray(backup.users)) throw new Error('Це не резервна копія Credit Manager версії 1.');
  const targetEmail=(authUser.email||'').trim().toLowerCase();
  const sourceUser=backup.users.find(u=>(u?.email||'').trim().toLowerCase()===targetEmail);
  if(!sourceUser) throw new Error(`У резервній копії не знайдено користувача ${authUser.email||''}.`);
  const sourceCredits=Array.isArray(sourceUser.credits)?sourceUser.credits:[];
  const sourceLimits=Array.isArray(sourceUser.limits)?sourceUser.limits:[];
  if(!sourceCredits.length && !sourceLimits.length) throw new Error('У резервній копії немає розстрочок або кредитних лімітів.');

  const {data:existingCredits,error:creditsError}=await supabase.from('credits').select('id').eq('user_id',authUser.id);
  if(creditsError) throw creditsError;
  const {data:existingLimits,error:limitsError}=await supabase.from('credit_limits').select('id').eq('user_id',authUser.id);
  if(limitsError) throw limitsError;
  const existingCreditIds=new Set((existingCredits||[]).map(x=>x.id));
  const existingLimitIds=new Set((existingLimits||[]).map(x=>x.id));

  // Keep source IDs whenever possible. If an ID already exists in this account, generate a new one to avoid overwriting cloud data.
  const credits=sourceCredits.map(raw=>{
    const normalized=normalizeCredit(raw);
    return creditRow(authUser.id,{...normalized,id:normalized.id && !existingCreditIds.has(normalized.id)?normalized.id:uid()});
  });
  const limits=sourceLimits.map(raw=>{
    const normalized={...raw,payments:Array.isArray(raw.payments)?raw.payments:[]};
    return limitRow(authUser.id,{...normalized,id:normalized.id && !existingLimitIds.has(normalized.id)?normalized.id:uid()});
  });
  if(credits.length){const {error}=await supabase.from('credits').insert(credits);if(error)throw error}
  if(limits.length){const {error}=await supabase.from('credit_limits').insert(limits);if(error)throw error}
  return {credits:credits.length,limits:limits.length,sourceName:sourceUser.name||'Користувач'};
}

const uid=()=>crypto.randomUUID?.()||`${Date.now()}-${Math.random()}`;
const money=v=>new Intl.NumberFormat('uk-UA',{style:'currency',currency:'UAH',maximumFractionDigits:0}).format(Math.max(0,Number(v)||0));
const n=v=>Number(String(v??'').replace(/\s/g,'').replace(',','.'))||0;
const hash=s=>{let h=2166136261;for(const c of s){h^=c.charCodeAt(0);h=Math.imul(h,16777619)}return(h>>>0).toString(16)};
function normalizeCredit(c){return {...c,interestPolicy:c.interestPolicy==='full_term'?'full_term':'actual',payments:Array.isArray(c.payments)?c.payments:[]}}
function load(){try{const current=JSON.parse(localStorage.getItem(KEY));if(current?.users){const normalized={...current,users:current.users.map(u=>({...u,credits:(u.credits||[]).map(normalizeCredit),limits:u.limits||[]}))};return normalized}const legacy=JSON.parse(localStorage.getItem(LEGACY_KEY));if(legacy?.users){const migrated={...legacy,users:legacy.users.map(u=>({...u,credits:(u.credits||[]).map(normalizeCredit),limits:u.limits||[]}))};localStorage.setItem(KEY,JSON.stringify(migrated));return migrated}return {users:[],session:null,theme:'light'}}catch{return {users:[],session:null,theme:'light'}}}
function save(s){localStorage.setItem(KEY,JSON.stringify(s))}
function annuity(balance,months,rate){const r=n(rate)/100/12;if(!balance||!months)return 0;if(!r)return balance/months;return balance*r*Math.pow(1+r,months)/(Math.pow(1+r,months)-1)}
function schedule(c,extra=0){let b=n(c.balance),p=n(c.payment)+n(extra),r=n(c.rate)/100/12,rows=[];for(let i=1;b>.01&&i<601;i++){const interest=b*r;let principal;if(c.type==='diff')principal=Math.min(b,n(c.initialAmount)/Math.max(1,n(c.termMonths)));else principal=Math.min(b,Math.max(0,p-interest));if(principal<=.001)break;b=Math.max(0,b-principal);rows.push({month:i,payment:principal+interest,principal,interest,balance:b})}if(c.interestPolicy==='full_term'&&rows.length){const baseRows=schedule({...c,interestPolicy:'actual'},0);const contractualInterest=baseRows.reduce((sum,row)=>sum+row.interest,0);const shownInterest=rows.reduce((sum,row)=>sum+row.interest,0);if(contractualInterest>shownInterest+0.01){rows[rows.length-1].interest+=contractualInterest-shownInterest;rows[rows.length-1].payment+=contractualInterest-shownInterest}}return rows}
function months(c,extra=0){return schedule(c,extra).length}
function forecastInterest(c,extra=0){return schedule({...c,interestPolicy:'actual'},extra).reduce((sum,row)=>sum+row.interest,0)}
function earlyPaymentPreview(c,amount){const a=Math.min(Math.max(0,n(amount)),n(c.balance));const baseline=forecastInterest(c,0);if(a<=0||n(c.balance)<=0)return {newBalance:n(c.balance),saving:0,remainingInterest:baseline};const reduced={...c,balance:Math.max(0,n(c.balance)-a)};const remaining=forecastInterest(reduced,0);return {newBalance:reduced.balance,saving:c.interestPolicy==='full_term'?0:Math.max(0,baseline-remaining),remainingInterest:c.interestPolicy==='full_term'?baseline:remaining}}
function dateFor(day){const x=new Date();const safe=Math.min(28,Math.max(1,n(day)));let d=new Date(x.getFullYear(),x.getMonth(),safe);if(d<x)d=new Date(x.getFullYear(),x.getMonth()+1,safe);return d}
const dateFmt=d=>new Intl.DateTimeFormat('uk-UA',{day:'numeric',month:'short',year:'numeric'}).format(d);

function Field({label,children}){return <label className="field"><span>{label}</span>{children}</label>}
function Auth({state,setState,onAuthenticated}){
  const[m,setM]=useState('login'),[email,setE]=useState(''),[pass,setP]=useState(''),[name,setN]=useState(''),[show,setShow]=useState(false),[err,setErr]=useState(''),[busy,setBusy]=useState(false),[resetSent,setResetSent]=useState(false);
  const go=async e=>{
    e.preventDefault();setErr('');setResetSent(false);
    const em=email.trim().toLowerCase();
    if(!em||!pass)return setErr('Заповніть email та пароль.');
    if(!cloudEnabled){
      if(m==='reg'){
        if(pass.length<6)return setErr('Пароль: мінімум 6 символів.');
        if(state.users.some(u=>u.email===em))return setErr('Такий email вже зареєстрований.');
        const u={id:uid(),name:name.trim()||'Користувач',email:em,password:hash(pass),credits:[],limits:[]};
        const s={...state,users:[...state.users,u],session:u.id};save(s);setState(s);return;
      }
      const u=state.users.find(u=>u.email===em&&u.password===hash(pass));
      if(!u)return setErr('Невірний email або пароль.');
      const s={...state,session:u.id};save(s);setState(s);return;
    }
    try{
      setBusy(true);
      if(m==='reg'){
        if(pass.length<6)return setErr('Пароль: мінімум 6 символів.');
        const {data,error}=await supabase.auth.signUp({email:em,password:pass,options:{data:{name:name.trim()||'Користувач'},emailRedirectTo:window.location.origin}});
        if(error)throw error;
        if(!data.session){setErr('Акаунт створено. Перевірте пошту та підтвердіть email.');return;}
        await onAuthenticated(data.session.user);
      }else{
        const {data,error}=await supabase.auth.signInWithPassword({email:em,password:pass});
        if(error)throw error;
        await onAuthenticated(data.user);
      }
    }catch(error){setErr(error.message||'Не вдалося виконати дію.')}finally{setBusy(false)}
  };
  const forgot=async()=>{
    setErr('');setResetSent(false);const em=email.trim().toLowerCase();
    if(!em)return setErr('Введіть email для відновлення пароля.');
    if(!cloudEnabled)return setErr('Відновлення пароля доступне після підключення хмарного акаунта.');
    try{setBusy(true);const {error}=await supabase.auth.resetPasswordForEmail(em,{redirectTo:window.location.origin});if(error)throw error;setResetSent(true)}catch(error){setErr(error.message||'Не вдалося надіслати лист.')}finally{setBusy(false)}
  };
  return <main className="auth"><section className="auth-card"><div className="logo"><CreditCard/></div><p className="eyebrow">PERSONAL FINANCE</p><h1>Контроль фінансів<br/>в одному кабінеті.</h1><p className="muted lead">Кредити, кредитні ліміти, платежі та план погашення без зайвої складності.</p>{cloudEnabled&&<div className="cloud-status"><ShieldCheck/> Дані синхронізуються між пристроями</div>}<form onSubmit={go} className="form">{m==='reg'&&<Field label="Ім'я"><input value={name} onChange={e=>setN(e.target.value)} placeholder="Олексій"/></Field>}<Field label="Email"><input type="email" value={email} onChange={e=>setE(e.target.value)} placeholder="you@example.com" autoComplete="email"/></Field><Field label="Пароль"><div className="pass"><input type={show?'text':'password'} value={pass} onChange={e=>setP(e.target.value)} placeholder="••••••••" autoComplete={m==='login'?'current-password':'new-password'}/><button type="button" onClick={()=>setShow(!show)}>{show?<EyeOff/>:<Eye/>}</button></div></Field>{err&&<div className={resetSent?'success':'error'}>{err}</div>}{resetSent&&<div className="success">Лист для відновлення пароля надіслано.</div>}<button disabled={busy} className="btn primary wide">{busy?'Зачекайте...':m==='login'?'Увійти':'Створити акаунт'}</button></form><div className="auth-links">{m==='login'?<><button onClick={()=>setM('reg')}>Створити акаунт</button><button onClick={forgot}>Забули пароль?</button></>:<button onClick={()=>setM('login')}>Вже маєте акаунт? Увійти</button>}</div><small className="security"><ShieldCheck/> {cloudEnabled?'Акаунти та дані зберігаються у Supabase.':'Локальний режим: дані зберігаються лише у браузері.'}</small></section></main>
}

function CreditModal({credit,onClose,onSave}){const blank={name:'',initialAmount:'',balance:'',rate:0,type:'annuity',payment:'',dueDay:1,termMonths:12,interestPolicy:'actual'};const[f,setF]=useState(credit||blank);const set=(k,v)=>setF(x=>({...x,[k]:v}));const suggested=annuity(n(f.balance),n(f.termMonths),n(f.rate));return <div className="overlay"><section className="modal"><header className="modal-head"><div><p className="eyebrow">{credit?'EDIT':'NEW CREDIT'}</p><h2>{credit?'Редагувати кредит':'Додати кредит'}</h2></div><button className="round" onClick={onClose}><X/></button></header><form className="form" onSubmit={e=>{e.preventDefault();if(!f.name||n(f.balance)<=0||n(f.termMonths)<=0||n(f.payment)<=0)return alert('Заповніть обовʼязкові поля.');onSave({...f,id:f.id||uid(),payments:f.payments||[]})}}><div className="two"><Field label="Назва / банк"><input required value={f.name} onChange={e=>set('name',e.target.value)} placeholder="ПриватБанк — Автокредит"/></Field><Field label="День платежу"><input type="number" min="1" max="31" value={f.dueDay} onChange={e=>set('dueDay',e.target.value)}/></Field></div><div className="two"><Field label="Початкова сума"><input inputMode="decimal" value={f.initialAmount} onChange={e=>set('initialAmount',e.target.value)} placeholder="420000"/></Field><Field label="Поточний залишок"><input required inputMode="decimal" value={f.balance} onChange={e=>set('balance',e.target.value)} placeholder="286400"/></Field></div><div className="two"><Field label="Річна ставка, %"><input inputMode="decimal" value={f.rate} onChange={e=>set('rate',e.target.value)} placeholder="18.9"/></Field><Field label="Термін, місяців"><input required type="number" min="1" value={f.termMonths} onChange={e=>set('termMonths',e.target.value)}/></Field></div><Field label="Тип нарахування"><select value={f.type} onChange={e=>set('type',e.target.value)}><option value="annuity">Ануїтетний</option><option value="diff">Диференційований</option></select></Field><div className="policy-box"><div className="policy-head"><div><b>Дострокове погашення</b><small>Як рахувати відсотки у прогнозі та при достроковій виплаті.</small></div></div><div className="policy-toggle"><button type="button" className={f.interestPolicy==='actual'?'active':''} onClick={()=>set('interestPolicy','actual')}><span>Фактичні місяці</span><small>Платимо відсотки за період користування.</small></button><button type="button" className={f.interestPolicy==='full_term'?'active':''} onClick={()=>set('interestPolicy','full_term')}><span>Весь договірний строк</span><small>У прогнозі економія відсотків = 0.</small></button></div></div><div className="suggest"><span>Рекомендований платіж</span><b>{money(suggested)}</b><button type="button" onClick={()=>set('payment',suggested.toFixed(2))}>Використати</button></div><Field label="Мінімальний / ваш платіж"><input required inputMode="decimal" value={f.payment} onChange={e=>set('payment',e.target.value)} placeholder="11500"/></Field><div className="modal-actions"><button type="button" className="btn secondary" onClick={onClose}>Скасувати</button><button className="btn primary">Зберегти</button></div></form></section></div>}

function LimitModal({limit,onClose,onSave}){const blank={name:'',limit:'',used:'',rate:0,minPayment:'',gracePayment:'',dueDay:1};const[f,setF]=useState(limit||blank);const set=(k,v)=>setF(x=>({...x,[k]:v}));const available=Math.max(0,n(f.limit)-n(f.used));return <div className="overlay"><section className="modal"><header className="modal-head"><div><p className="eyebrow">{limit?'EDIT':'NEW CREDIT LIMIT'}</p><h2>{limit?'Редагувати ліміт':'Додати кредитний ліміт'}</h2></div><button className="round" onClick={onClose}><X/></button></header><form className="form" onSubmit={e=>{e.preventDefault();if(!f.name||n(f.limit)<=0||n(f.used)<0||n(f.used)>n(f.limit)||n(f.minPayment)<0||n(f.gracePayment)<0)return alert('Перевірте ліміт, використану суму та платежі.');onSave({...f,id:f.id||uid(),payments:f.payments||[]})}}><Field label="Назва банку"><input required value={f.name} onChange={e=>set('name',e.target.value)} placeholder="ПриватБанк"/></Field><div className="two"><Field label="Кредитний ліміт"><input required inputMode="decimal" value={f.limit} onChange={e=>set('limit',e.target.value)} placeholder="50000"/></Field><Field label="Використано"><input required inputMode="decimal" value={f.used} onChange={e=>set('used',e.target.value)} placeholder="23000"/></Field></div><div className="two"><Field label="Процентна ставка, % річних"><input inputMode="decimal" value={f.rate} onChange={e=>set('rate',e.target.value)} placeholder="45"/></Field><Field label="Мінімальний платіж"><input required inputMode="decimal" value={f.minPayment} onChange={e=>set('minPayment',e.target.value)} placeholder="1000"/></Field></div><div className="two"><Field label="Платіж до пільгового"><input required inputMode="decimal" value={f.gracePayment} onChange={e=>set('gracePayment',e.target.value)} placeholder="23000"/></Field><Field label="День платежу"><input type="number" min="1" max="31" value={f.dueDay} onChange={e=>set('dueDay',e.target.value)}/></Field></div><div className="payment-info"><span>Доступний ліміт <b>{money(available)}</b></span><span>Використано <b>{Math.round(n(f.used)/Math.max(1,n(f.limit))*100)}%</b></span></div><div className="hint">«Платіж до пільгового» — сума, яку ви хочете закривати, щоб не залишати борг на кінець пільгового періоду. Точні правила залежать від банку.</div><div className="modal-actions"><button type="button" className="btn secondary" onClick={onClose}>Скасувати</button><button className="btn primary">Зберегти</button></div></form></section></div>}

function PaymentModal({item,onClose,onSave,isLimit=false}){const defaultAmount=isLimit?n(item.minPayment):n(item.payment);const[f,setF]=useState({kind:'regular',amount:defaultAmount,date:new Date().toISOString().slice(0,10)});const set=(k,v)=>setF(x=>({...x,[k]:v}));const balance=isLimit?n(item.used):n(item.balance);const preview=!isLimit&&f.kind==='early'?earlyPaymentPreview(item,n(f.amount)):null;return <div className="overlay"><section className="modal payment-modal"><header className="modal-head"><div><p className="eyebrow">ПЛАТІЖ</p><h2>{item.name}</h2><p className="muted">{isLimit?'Використано':'Залишок'}: {money(balance)}</p></div><button className="round" onClick={onClose}><X/></button></header><div className="payment-types"><button type="button" className={f.kind==='regular'?'active':''} onClick={()=>set('kind','regular')}>Регулярний</button><button type="button" className={f.kind==='early'?'active':''} onClick={()=>set('kind','early')}>Достроковий</button></div><form className="form" onSubmit={e=>{e.preventDefault();onSave(f.kind,n(f.amount),f.date)}}><Field label="Сума платежу"><input autoFocus inputMode="decimal" min="0" value={f.amount} onChange={e=>set('amount',e.target.value)}/></Field><Field label="Дата"><input type="date" value={f.date} onChange={e=>set('date',e.target.value)}/></Field><div className="payment-info">{isLimit&&<span>Після платежу використано <b>{money(Math.max(0,balance-n(f.amount)))}</b></span>}{!isLimit&&<span>Після платежу залишок <b>{money(Math.max(0,balance-n(f.amount)))}</b></span>}{isLimit&&<span>Доступний ліміт стане <b>{money(n(item.limit)-Math.max(0,balance-n(f.amount)))}</b></span>}{preview&&<><span>Орієнтовна економія майбутніх відсотків <b>{money(preview.saving)}</b></span><span>Правило <b>{item.interestPolicy==='full_term'?'весь договірний строк':'фактичний період'}</b></span></>}</div>{preview&&<div className="hint">{item.interestPolicy==='full_term'?'За вибраним режимом модель не зменшує відсотки від дострокового платежу, а лише скорочує строк.':'У режимі фактичних відсотків після зменшення тіла боргу майбутні відсотки в прогнозі перераховуються від нового залишку.'}</div>}<div className="modal-actions"><button type="button" className="btn secondary" onClick={onClose}>Скасувати</button><button className="btn primary"><Check/> Зберегти платіж</button></div></form></section></div>}

function CreditCardView({c,onEdit,onDelete,onPayment,onOpen}){const ms=months(c),prog=Math.min(100,Math.max(0,(1-n(c.balance)/Math.max(1,n(c.initialAmount)))*100));return <article className="credit-card" onClick={onOpen}><div className="card-menu"><button onClick={e=>{e.stopPropagation();onEdit()}}><Pencil/></button><button onClick={e=>{e.stopPropagation();onDelete()}}><Trash2/></button></div><div className="credit-icon"><CreditCard/></div><p className="muted tiny">{c.rate}% річних · {c.type==='annuity'?'Ануїтетний':'Диференційований'} · {c.interestPolicy==='full_term'?'всі договірні відсотки':'фактичний період'}</p><h3>{c.name}</h3><strong className="card-balance">{money(c.balance)}</strong><div className="meta"><span>Платіж<b>{money(c.payment)}</b></span><span>Прогноз<b>{ms?`${ms} міс.`:'—'}</b></span></div><div className="progress"><i style={{width:`${prog}%`}}/></div><button className="btn secondary wide" onClick={e=>{e.stopPropagation();onPayment()}}>Внести платіж</button></article>}

function LimitCard({c,onEdit,onDelete,onPayment,onPlan}){const used=n(c.used),limit=n(c.limit),pct=Math.min(100,Math.max(0,used/Math.max(1,limit)*100));return <article className="credit-card limit-card"><div className="card-menu"><button onClick={onEdit}><Pencil/></button><button onClick={onDelete}><Trash2/></button></div><div className="credit-icon"><WalletCards/></div><p className="muted tiny">{c.rate}% річних · кредитний ліміт</p><h3>{c.name}</h3><strong className="card-balance">{money(used)}</strong><div className="meta"><span>Ліміт<b>{money(limit)}</b></span><span>Доступно<b>{money(Math.max(0,limit-used))}</b></span></div><div className="progress"><i style={{width:`${pct}%`}}/></div><div className="limit-meta"><span>Мін. {money(c.minPayment)}</span><span>До пільгового {money(c.gracePayment)}</span></div>{n(c.planPayment)>0&&<div className="saved-plan"><Target/> План: <b>{money(c.planPayment)}</b> / міс.</div>}<div className="limit-actions"><button className="btn secondary" onClick={onPayment}>Внести</button><button className="btn primary" onClick={onPlan}><Target/> План</button></div></article>}

function Stat({label,value,sub,icon}){return <div className="stat"><div className="stat-icon">{icon}</div><span>{label}</span><strong>{value}</strong><small>{sub}</small></div>}
function PanelHead({title,action}){return <div className="panel-head"><h3>{title}</h3>{action}</div>}
function Empty({onAdd,title='Кредитів ще немає',text='Додайте перший запис, щоб отримати прогноз.'}){return <div className="empty"><CreditCard/><h3>{title}</h3><p>{text}</p>{onAdd&&<button className="btn primary" onClick={onAdd}><Plus/> Додати</button>}</div>}
function Nav({icon,text,active,click}){return <button className={`nav-item ${active?'active':''}`} onClick={click}>{icon}<span>{text}</span></button>}

function Dashboard({user,credits,limits,onAddCredit,onAddLimit,onOpenCredit,onOpenLimit,onPaymentCredit,onPaymentLimit}){const debt=credits.reduce((s,c)=>s+n(c.balance),0),used=limits.reduce((s,c)=>s+n(c.used),0),monthly=credits.reduce((s,c)=>s+n(c.payment),0)+limits.reduce((s,c)=>s+n(c.minPayment),0),next=[...credits.map(c=>({...c,_type:'credit'})),...limits.map(c=>({...c,_type:'limit'}))].sort((a,b)=>dateFor(a.dueDay)-dateFor(b.dueDay))[0];return <div className="view"><div className="page-title"><div><p className="eyebrow">ОСОБИСТИЙ КАБІНЕТ</p><h2>Доброго дня, {user.name.split(' ')[0]} 👋</h2><p className="muted">Кредити та кредитні ліміти під контролем.</p></div><div className="title-actions"><button className="btn secondary desktop-add" onClick={onAddLimit}><WalletCards/> Ліміт</button><button className="btn primary desktop-add" onClick={onAddCredit}><Plus/> Кредит</button></div></div><div className="stats"><Stat label="Кредитний борг" value={money(debt)} sub={`${credits.length} кредитів`} icon={<CreditCard/>}/><Stat label="Використано лімітів" value={money(used)} sub={`${limits.length} карт`} icon={<WalletCards/>}/><Stat label="Платежі / місяць" value={money(monthly)} sub="мінімальні / обов'язкові" icon={<ArrowDownRight/>}/><Stat label="Найближчий платіж" value={next?dateFmt(dateFor(next.dueDay)):'—'} sub={next?next._type==='limit'?money(next.minPayment):money(next.payment):'—'} icon={<CalendarDays/>}/></div><div className="dashboard-grid"><section className="panel"><PanelHead title="Останні кредити"/><div className="credit-list">{credits.length?credits.slice(0,5).map(c=><div className="credit-row" key={c.id} onClick={()=>onOpenCredit(c)}><div className="credit-icon"><CreditCard/></div><div><b>{c.name}</b><small>{c.rate}% річних</small></div><div><small>Залишок</small><b>{money(c.balance)}</b></div><div><small>Платіж</small><b>{money(c.payment)}</b></div><button className="tiny-btn" onClick={e=>{e.stopPropagation();onPaymentCredit(c)}}>Внести</button></div>):<Empty onAdd={onAddCredit}/>}</div></section><section className="panel"><PanelHead title="Кредитні ліміти"/><div className="credit-list">{limits.length?limits.slice(0,5).map(c=><div className="credit-row" key={c.id} onClick={()=>onOpenLimit(c)}><div className="credit-icon"><WalletCards/></div><div><b>{c.name}</b><small>{c.rate}% річних</small></div><div><small>Використано</small><b>{money(c.used)}</b></div><div><small>До пільгового</small><b>{money(c.gracePayment)}</b></div><button className="tiny-btn" onClick={e=>{e.stopPropagation();onPaymentLimit(c)}}>Внести</button></div>):<Empty onAdd={onAddLimit} title="Лімітів ще немає" text="Додайте кредитну картку, щоб побудувати план погашення."/>}</div></section></div></div>}

function Forecast({credits,extra,setExtra}){const base=Math.max(0,...credits.map(c=>months(c))),sim=Math.max(0,...credits.map(c=>months(c,extra))),shownSaving=credits.reduce((sum,c)=>c.interestPolicy==='full_term'?sum:sum+Math.max(0,forecastInterest(c,0)-forecastInterest(c,extra)),0),hasFull=credits.some(c=>c.interestPolicy==='full_term');return <div className="view"><div className="page-title"><div><p className="eyebrow">PREDICTIVE ENGINE</p><h2>Прогноз погашення</h2><p className="muted">Моделюйте дострокове погашення з урахуванням правил нарахування відсотків.</p></div></div><section className="panel simulator"><div><h3>Додатковий платіж щомісяця</h3><p className="muted">Поточні дані не змінюються.</p></div><div className="slider"><strong>{money(extra)}</strong><input type="range" min="0" max="20000" step="100" value={extra} onChange={e=>setExtra(n(e.target.value))}/></div></section><div className="stats"><Stat icon={<CalendarDays/>} label="Було" value={`${base} міс.`} sub="поточний платіж"/><Stat icon={<TrendingDown/>} label="Стане" value={`${sim} міс.`} sub="з додатковим"/><Stat icon={<ArrowDownRight/>} label="Економія відсотків" value={money(shownSaving)} sub={hasFull?'з урахуванням правил кредитів':'орієнтовно'}/><Stat icon={<CreditCard/>} label="Економія строку" value={`${Math.max(0,base-sim)} міс.`} sub="швидше"/></div>{hasFull&&<div className="hint"><b>У частини кредитів увімкнено режим «весь договірний строк».</b> Для них модель не зменшує майбутні відсотки від дострокового погашення. Реальні умови залежать від договору банку.</div>}<Schedule credits={credits} extra={extra}/></div>}
function Schedule({credits,extra}){const rows=credits.flatMap(c=>schedule(c,extra).slice(0,60).map(r=>({...r,name:c.name})));const csv=()=>{const body=[['Кредит','Місяць','Платіж','Тіло','Відсотки','Залишок'],...rows.map(r=>[r.name,r.month,r.payment.toFixed(2),r.principal.toFixed(2),r.interest.toFixed(2),r.balance.toFixed(2)])].map(r=>r.join(';')).join('\n');const a=document.createElement('a');a.href=URL.createObjectURL(new Blob(['\uFEFF'+body],{type:'text/csv'}));a.download='grafik-platezhiv.csv';a.click()};return <section className="panel table-panel"><PanelHead title="Графік платежів" action={<div className="actions"><button className="btn secondary" onClick={()=>window.print()}><FileText/> PDF</button><button className="btn secondary" onClick={csv}><Download/> CSV</button></div>}/><div className="table-scroll"><table><thead><tr><th>Кредит</th><th>№</th><th>Платіж</th><th>Тіло</th><th>Відсотки</th><th>Залишок</th></tr></thead><tbody>{rows.map((r,i)=><tr key={i}><td>{r.name}</td><td>{r.month}</td><td>{money(r.payment)}</td><td>{money(r.principal)}</td><td>{money(r.interest)}</td><td>{money(r.balance)}</td></tr>)}</tbody></table></div></section>}

function LimitPlan({limits,onClose,onSave}){const minTotal=limits.reduce((s,c)=>s+Math.min(n(c.used),n(c.minPayment)),0);const graceTotal=limits.reduce((s,c)=>s+Math.min(n(c.used),n(c.gracePayment)),0);const[budget,setBudget]=useState(minTotal);const ordered=useMemo(()=>[...limits].sort((a,b)=>n(b.rate)-n(a.rate)||n(b.used)-n(a.used)),[limits]);const buildPlan=()=>{let remaining=n(budget);const rows=ordered.map(c=>({c,min:Math.min(n(c.used),Math.max(0,n(c.minPayment))),grace:Math.min(n(c.used),Math.max(0,n(c.gracePayment))),pay:0,extra:0}));rows.forEach(r=>{r.pay=Math.min(r.min,remaining);remaining=Math.max(0,remaining-r.pay)});if(n(budget)>=graceTotal){rows.forEach(r=>{const add=Math.min(Math.max(0,r.grace-r.pay),remaining);r.extra+=add;r.pay+=add;remaining-=add})}else{for(const r of rows){if(remaining<=0)break;const need=Math.max(0,n(r.c.used)-r.pay);const add=Math.min(need,remaining);r.extra+=add;r.pay+=add;remaining-=add}}return rows};const rows=buildPlan();const totalAllocated=rows.reduce((s,r)=>s+r.pay,0);const canMinimum=n(budget)>=minTotal;const canGrace=n(budget)>=graceTotal;return <div className="overlay"><section className="modal plan-modal"><header className="modal-head"><div><p className="eyebrow">REPAYMENT PLAN</p><h2>План погашення лімітів</h2><p className="muted">Простий алгоритм: спочатку мінімальні платежі, далі — пільгові цілі або картка з найбільшою ставкою.</p></div><button className="round" onClick={onClose}><X/></button></header><div className="plan-budget"><Field label="Скільки можете виділяти на кредитні ліміти щомісяця"><input inputMode="decimal" value={budget} onChange={e=>setBudget(n(e.target.value))}/></Field><div className="plan-summary"><span>Мінімумів: <b>{money(minTotal)}</b></span><span>До пільгового: <b>{money(graceTotal)}</b></span><span>У плані: <b>{money(totalAllocated)}</b></span></div></div><div className="plan-note">{!canMinimum?<><Target/> Увага: бюджету навіть не вистачає на всі мінімальні платежі. Потрібно щонайменше {money(minTotal)} на місяць, інакше частина мінімальних платежів залишиться непокритою.</>:canGrace?<><Check/> Цього бюджету достатньо для всіх заданих платежів до пільгового. План розподіляє гроші так, щоб закрити ці цілі.</>:<><Target/> Бюджету не вистачає на всі пільгові цілі. Після мінімальних платежів увесь залишок іде в картку з найвищою ставкою — так борг гаситься швидше та дешевше за відсотками.</>}</div><div className="plan-list">{rows.map((r,i)=><div className="plan-row" key={r.c.id}><div className="plan-rank">{i+1}</div><div><b>{r.c.name}</b><small>{r.c.rate}% річних · борг {money(r.c.used)} · мін. {money(r.min)}</small></div><div className="plan-amount"><span>Заплановано</span><b>{money(r.pay)}</b>{r.extra>0&&<small>+ {money(r.extra)} понад мінімум</small>}</div></div>)}</div><div className="plan-rule"><b>Порядок погашення:</b> №1 має найвищу ставку. Після повного погашення першої картки її заплановану суму переносимо на наступну. Якщо банк вимагає конкретну суму для збереження пільги, орієнтуйтесь на поле «Платіж до пільгового» з вашого договору/застосунку банку.</div><div className="modal-actions"><button className="btn secondary" onClick={onClose}>Закрити</button><button className="btn primary" onClick={()=>{onSave(rows.map(r=>({limitId:r.c.id,amount:r.pay})));onClose()}}><Check/> Зберегти план</button></div></section></div>}

function Payments({credits,limits,onPaymentCredit,onPaymentLimit}){const history=[...credits.flatMap(c=>(c.payments||[]).map(p=>({...p,name:c.name,group:'Кредит'}))),...limits.flatMap(c=>(c.payments||[]).map(p=>({...p,name:c.name,group:'Ліміт'})))].sort((a,b)=>new Date(b.date)-new Date(a.date));return <div className="view"><div className="page-title"><div><p className="eyebrow">PAYMENTS</p><h2>Платежі</h2><p className="muted">Регулярні та дострокові платежі зменшують реальну заборгованість.</p></div></div><section className="panel payment-list"><PanelHead title="Кредити"/>{credits.length?credits.map(c=><div className="payment-item" key={c.id}><span className="dot"/><div><b>{c.name}</b><small>Залишок: {money(c.balance)} · {dateFmt(dateFor(c.dueDay))}</small></div><strong>{money(c.payment)}</strong><button className="btn secondary" onClick={()=>onPaymentCredit(c)}>Внести</button></div>):<p className="muted empty-history">Кредитів немає.</p>}</section><section className="panel payment-list"><PanelHead title="Кредитні ліміти"/>{limits.length?limits.map(c=><div className="payment-item" key={c.id}><span className="dot"/><div><b>{c.name}</b><small>Використано: {money(c.used)} · доступно: {money(n(c.limit)-n(c.used))}</small></div><strong>{money(c.minPayment)}</strong><button className="btn secondary" onClick={()=>onPaymentLimit(c)}>Внести</button></div>):<p className="muted empty-history">Кредитних лімітів немає.</p>}</section><section className="panel"><PanelHead title="Історія платежів"/><div className="payment-history">{history.map(p=><div className="history-row" key={p.id}><div><b>{p.name}</b><small>{p.group} · {dateFmt(new Date(p.date))} · {p.kind==='early'?'Достроковий':'Регулярний'}</small></div><strong>- {money(p.amount)}</strong></div>)}{!history.length&&<p className="muted empty-history">Платежів ще немає.</p>}</div></section></div>}

function LimitDetails({c,onBack,onEdit,onPayment,onPlan}){const used=n(c.used),limit=n(c.limit),pct=Math.min(100,used/Math.max(1,limit)*100);return <div className="view"><button className="back" onClick={onBack}>← Назад</button><div className="page-title"><div><p className="eyebrow">КРЕДИТНИЙ ЛІМІТ</p><h2>{c.name}</h2><p className="muted">Використано {money(used)} з {money(limit)} · {c.rate}% річних</p></div><div className="title-actions"><button className="btn secondary" onClick={()=>onEdit(c)}><Pencil/> Редагувати</button><button className="btn secondary" onClick={()=>onPlan(c)}><Target/> План</button><button className="btn primary" onClick={()=>onPayment(c)}><Check/> Внести</button></div></div><div className="stats"><Stat icon={<WalletCards/>} label="Використано" value={money(used)} sub={`${Math.round(pct)}% ліміту`}/><Stat icon={<ArrowUpRight/>} label="Доступно" value={money(limit-used)} sub="вільний ліміт"/><Stat icon={<ArrowDownRight/>} label="Мінімальний" value={money(c.minPayment)} sub="обов'язково"/><Stat icon={<Target/>} label="До пільгового" value={money(c.gracePayment)} sub="ваша ціль"/></div><section className="panel"><PanelHead title="Стратегія погашення"/><div className="strategy-grid"><div><b>1. Мінімальний платіж</b><p className="muted">Не пропускайте мінімальний платіж на жодній картці.</p></div><div><b>2. Пільговий платіж</b><p className="muted">Якщо можете — закривайте суму «до пільгового», щоб уникати перенесення боргу.</p></div><div><b>3. Дострокове погашення</b><p className="muted">Увесь додатковий бюджет спрямовуйте сюди, якщо ця картка має найвищу ставку.</p></div></div>{n(c.planPayment)>0&&<div className="saved-plan detail-plan"><Target/> Збережений план для цієї картки: <b>{money(c.planPayment)} / міс.</b></div>}</section></div>}

function App(){
  const[localState,setLocalState]=useState(load),[state,setState]=useState(load),[ready,setReady]=useState(!cloudEnabled),[syncError,setSyncError]=useState(''),[localCandidate,setLocalCandidate]=useState(null),[view,setView]=useState('dashboard'),[modal,setModal]=useState(null),[selected,setSelected]=useState(null),[extra,setExtra]=useState(0),[menu,setMenu]=useState(false),[paymentModal,setPaymentModal]=useState(null),[planModal,setPlanModal]=useState(null);
  const hydrate=async authUser=>{const u=await fetchCloudUser(authUser);const s={users:[u],session:u.id,theme:u.theme||'light'};setState(s);setReady(true);const backup=localBackup();const old=backup.users.find(x=>x.email?.toLowerCase()===u.email?.toLowerCase());if(old&&(old.credits?.length||old.limits?.length)&&!u.credits.length&&!u.limits.length)setLocalCandidate(old)};
  useEffect(()=>{
    if(!supabase)return;
    let mounted=true;
    supabase.auth.getSession().then(async({data,error})=>{if(error){setSyncError(error.message);setReady(true);return}if(data.session){try{if(mounted)await hydrate(data.session.user)}catch(e){if(mounted)setSyncError(e.message||'Не вдалося завантажити дані.');} }else if(mounted){setState({users:[],session:null,theme:'light'});setReady(true)}});
    const{data:{subscription}}=supabase.auth.onAuthStateChange((event,session)=>{
      if(!mounted)return;
      if(event==='SIGNED_OUT'){setState({users:[],session:null,theme:'light'});setReady(true);return}
      if(session&&event!=='INITIAL_SESSION') setTimeout(()=>hydrate(session.user).catch(e=>setSyncError(e.message||'Не вдалося синхронізувати дані.')),0);
    });
    return()=>{mounted=false;subscription.unsubscribe()}
  },[]);
  useEffect(()=>{document.documentElement.classList.toggle('dark',state.theme==='dark');if(!cloudEnabled)save(state)},[state]);
  const user=state.users.find(u=>u.id===state.session);
  if(!ready)return <main className="auth"><section className="auth-card"><div className="logo"><CreditCard/></div><p className="eyebrow">SYNC</p><h1>Завантажуємо ваші дані…</h1><p className="muted lead">Підключаємо особистий кабінет та синхронізацію.</p></section></main>;
  if(!user)return <Auth state={localState} setState={s=>{setLocalState(s);setState(s)}} onAuthenticated={async authUser=>{await hydrate(authUser)}}/>;
  const credits=user.credits||[],limits=user.limits||[];
  const update=async fn=>{
    const oldUser={...user,credits:[...(user.credits||[])],limits:[...(user.limits||[])]};
    const newUser=fn({...user});
    const s={...state,users:state.users.map(u=>u.id===user.id?newUser:u)};
    setState(s);
    if(!cloudEnabled){save(s);return}
    try{setSyncError('');await syncCloudUser(user.id,oldUser,newUser,s.theme);setLocalState(s)}catch(e){setSyncError(e.message||'Не вдалося зберегти зміни в хмарі.')} 
  };
  const migrateLocal=async()=>{
    if(!supabase||!localCandidate)return;
    try{await importLocalDataToCloud({id:user.id,email:user.email,user_metadata:{name:user.name}},localCandidate);await hydrate({id:user.id,email:user.email,user_metadata:{name:user.name}});setLocalCandidate(null);setSyncError('Локальні дані успішно імпортовано.')}catch(e){setSyncError(e.message||'Не вдалося імпортувати локальні дані.')}
  };
  const makePayment=async(item,kind,amount,date,isLimit)=>{
    const requested=n(amount),balance=isLimit?n(item.used):n(item.balance);if(requested<=0)return alert('Сума платежу має бути більшою за 0.');if(balance<=0)return alert('Ця заборгованість уже погашена.');if(!date)return alert('Оберіть дату платежу.');
    const a=Math.min(requested,balance);const rec={id:uid(),date:new Date(`${date}T12:00:00`).toISOString(),amount:a,principal:a,interest:0,kind};
    await update(u=>isLimit?({...u,limits:u.limits.map(x=>x.id===item.id?{...x,used:Math.max(0,balance-a),payments:[...(x.payments||[]),rec]}:x)}):({...u,credits:u.credits.map(x=>x.id===item.id?{...x,balance:Math.max(0,balance-a),paid:kind==='regular',payments:[...(x.payments||[]),rec]}:x)}));setPaymentModal(null);setSelected(null)
  };
  const saveCredit=c=>{const x=normalizeCredit({...c,balance:n(c.balance),initialAmount:n(c.initialAmount)||n(c.balance),rate:n(c.rate),payment:n(c.payment),dueDay:n(c.dueDay),termMonths:n(c.termMonths)});update(u=>({...u,credits:u.credits.some(z=>z.id===x.id)?u.credits.map(z=>z.id===x.id?x:z):[x,...u.credits]}));setModal(null)};
  const saveLimit=c=>{const x={...c,limit:n(c.limit),used:n(c.used),rate:n(c.rate),minPayment:n(c.minPayment),gracePayment:n(c.gracePayment),dueDay:n(c.dueDay)};update(u=>({...u,limits:u.limits.some(z=>z.id===x.id)?u.limits.map(z=>z.id===x.id?x:z):[x,...u.limits]}));setModal(null)};
  const removeCredit=id=>confirm('Видалити кредит?')&&update(u=>({...u,credits:u.credits.filter(c=>c.id!==id)}));const removeLimit=id=>confirm('Видалити кредитний ліміт?')&&update(u=>({...u,limits:u.limits.filter(c=>c.id!==id)}));
  const importBackup=async file=>{
    if(!file)return;
    try{
      setSyncError('');
      if((credits.length||limits.length) && !confirm('У цьому акаунті вже є дані. Імпорт додасть старі дані, не видаляючи наявні. Продовжити?'))return;
      const result=await importBackupFileToCloud({id:user.id,email:user.email,user_metadata:{name:user.name}},file);
      await hydrate({id:user.id,email:user.email,user_metadata:{name:user.name}});
      setSyncError(`Імпорт завершено: ${result.credits} розстрочок, ${result.limits} кредитних лімітів.`);
      setTimeout(()=>setSyncError(''),5000);
    }catch(e){setSyncError(e.message||'Не вдалося імпортувати резервну копію.');}
  };
  const logout=async()=>{if(supabase)await supabase.auth.signOut();else{const s={...state,session:null};save(s);setState(s)}};
  const toggleTheme=async()=>{const next=state.theme==='dark'?'light':'dark';const s={...state,theme:next};setState(s);if(!cloudEnabled){save(s);return}try{await upsertCloudProfile(user,next);setSyncError('')}catch(e){setSyncError(e.message||'Не вдалося зберегти тему.')}};
  const resetPassword=async()=>{if(!supabase)return;const email=user.email;const{error}=await supabase.auth.resetPasswordForEmail(email,{redirectTo:window.location.origin});if(error)return alert(error.message);alert('Лист для зміни пароля надіслано на ваш email.')};
  return (
    <div className="app">
      <aside className={`sidebar ${menu ? 'open' : ''}`}>
        <div className="side-brand"><div className="logo small"><CreditCard /></div>Кредитний менеджер</div>
        <nav>
          <Nav icon={<Home />} text="Огляд" active={view === 'dashboard'} click={() => { setView('dashboard'); setMenu(false); }} />
          <Nav icon={<CreditCard />} text="Мої кредити" active={view === 'credits'} click={() => { setView('credits'); setMenu(false); }} />
          <Nav icon={<WalletCards />} text="Кредитні ліміти" active={view === 'limits'} click={() => { setView('limits'); setMenu(false); }} />
          <Nav icon={<CalendarDays />} text="Платежі" active={view === 'payments'} click={() => { setView('payments'); setMenu(false); }} />
        </nav>
        <div className="side-bottom">
          <Nav icon={<Settings />} text="Налаштування" active={view === 'settings'} click={() => { setView('settings'); setMenu(false); }} />
          <Nav icon={<LogOut />} text="Вийти" click={logout} />
        </div>
      </aside>
      {menu && <div className="backdrop" onClick={() => setMenu(false)} />}

      <div className="main">
        <header className="header">
          <button className="mobile-menu" onClick={() => setMenu(true)}><Menu /></button>
          <div className="search"><Search /><input placeholder="Пошук..." /></div>
          <div className="header-actions">
            <button className="round" onClick={toggleTheme}>{state.theme === 'dark' ? <Sun /> : <Moon />}</button>
            <div className="avatar">{user.name?.[0]?.toUpperCase() || 'К'}</div>
          </div>
        </header>

        <main className="page">
          {syncError && <div className="sync-alert">{syncError}</div>}
          {localCandidate && (
            <div className="sync-alert">
              <b>Знайдено локальні дані з цього браузера.</b>{' '}
              <button onClick={migrateLocal}>Імпортувати в акаунт</button>
            </div>
          )}

          {view === 'dashboard' && (
            <Dashboard
              user={user}
              credits={credits}
              limits={limits}
              onAddCredit={() => setModal({ type: 'credit' })}
              onAddLimit={() => setModal({ type: 'limit' })}
              onOpenCredit={c => { setSelected(c); setView('details'); }}
              onOpenLimit={c => { setSelected(c); setView('limit-details'); }}
              onPaymentCredit={c => setPaymentModal({ item: c, isLimit: false })}
              onPaymentLimit={c => setPaymentModal({ item: c, isLimit: true })}
            />
          )}

          {view === 'credits' && (
            <div className="view">
              <div className="page-title">
                <div><p className="eyebrow">КРЕДИТИ</p><h2>Мої кредити</h2></div>
                <button className="btn primary desktop-add" onClick={() => setModal({ type: 'credit' })}><Plus /> Додати</button>
              </div>
              <div className="credit-grid">
                {credits.map(c => (
                  <CreditCardView
                    key={c.id}
                    c={c}
                    onEdit={() => setModal({ type: 'credit', credit: c })}
                    onDelete={() => removeCredit(c.id)}
                    onPayment={() => setPaymentModal({ item: c, isLimit: false })}
                    onOpen={() => { setSelected(c); setView('details'); }}
                  />
                ))}
                {!credits.length && <Empty onAdd={() => setModal({ type: 'credit' })} />}
              </div>
            </div>
          )}

          {view === 'limits' && (
            <div className="view">
              <div className="page-title">
                <div>
                  <p className="eyebrow">КРЕДИТНІ ЛІМІТИ</p>
                  <h2>Мої кредитні ліміти</h2>
                  <p className="muted">Окрема категорія для кредитних карток та боргу в межах ліміту.</p>
                </div>
                <div className="title-actions">
                  <button className="btn secondary desktop-add" onClick={() => setPlanModal(limits)} disabled={!limits.length}><Target /> План погашення</button>
                  <button className="btn primary desktop-add" onClick={() => setModal({ type: 'limit' })}><Plus /> Додати</button>
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
                  />
                ))}
                {!limits.length && <Empty onAdd={() => setModal({ type: 'limit' })} title="Кредитних лімітів ще немає" text="Додайте банк, ліміт, використану суму та ваші платіжні цілі." />}
              </div>
            </div>
          )}

          {view === 'payments' && (
            <Payments
              credits={credits}
              limits={limits}
              onPaymentCredit={c => setPaymentModal({ item: c, isLimit: false })}
              onPaymentLimit={c => setPaymentModal({ item: c, isLimit: true })}
            />
          )}

          {view === 'settings' && (
            <SettingsView
              state={state}
              setState={setState}
              user={user}
              cloudEnabled={cloudEnabled}
              onResetPassword={resetPassword}
              onMigrate={localCandidate ? migrateLocal : null}
              onToggleTheme={toggleTheme}
              onImportBackup={importBackup}
            />
          )}

          {view === 'details' && selected && (
            <Details
              c={credits.find(x => x.id === selected.id) || selected}
              extra={extra}
              setExtra={setExtra}
              onBack={() => setView('credits')}
              onEdit={c => setModal({ type: 'credit', credit: c })}
              onPaid={c => setPaymentModal({ item: c, isLimit: false })}
            />
          )}

          {view === 'limit-details' && selected && (
            <LimitDetails
              c={limits.find(x => x.id === selected.id) || selected}
              onBack={() => setView('limits')}
              onEdit={c => setModal({ type: 'limit', limit: c })}
              onPayment={c => setPaymentModal({ item: c, isLimit: true })}
              onPlan={c => setPlanModal([c])}
            />
          )}
        </main>
      </div>

      <div className="mobile-fabs">
        <button className="fab" onClick={() => setModal({ type: 'limit' })}><WalletCards /> Ліміт</button>
        <button className="fab" onClick={() => setModal({ type: 'credit' })}><Plus /> Кредит</button>
      </div>

      {modal?.type === 'credit' && <CreditModal credit={modal.credit} onClose={() => setModal(null)} onSave={saveCredit} />}
      {modal?.type === 'limit' && <LimitModal limit={modal.limit} onClose={() => setModal(null)} onSave={saveLimit} />}
      {paymentModal && (
        <PaymentModal
          item={paymentModal.item}
          isLimit={paymentModal.isLimit}
          onClose={() => setPaymentModal(null)}
          onSave={(kind, amount, date) => makePayment(paymentModal.item, kind, amount, date, paymentModal.isLimit)}
        />
      )}
      {planModal && (
        <LimitPlan
          limits={planModal}
          onClose={() => setPlanModal(null)}
          onSave={plan => update(u => ({
            ...u,
            limits: u.limits.map(l => {
              const p = plan.find(x => x.limitId === l.id);
              return p ? { ...l, planPayment: p.amount } : l;
            })
          }))}
        />
      )}
    </div>
  )
}

function Details({c,extra,setExtra,onBack,onEdit,onPaid}){const rows=schedule(c,extra),interest=rows.reduce((s,r)=>s+r.interest,0);return <div className="view"><button className="back" onClick={onBack}>← Назад</button><div className="page-title"><div><p className="eyebrow">КРЕДИТ</p><h2>{c.name}</h2><p className="muted">Залишок {money(c.balance)} · {c.rate}% річних</p></div><div className="title-actions"><button className="btn secondary" onClick={()=>onEdit(c)}><Pencil/> Редагувати</button><button className="btn primary" onClick={()=>onPaid(c)}><Check/> Внести платіж</button></div></div><div className="stats"><Stat icon={<CreditCard/>} label="Залишок" value={money(c.balance)} sub="поточний"/><Stat icon={<CalendarDays/>} label="Платіж" value={`Кожного ${c.dueDay}`} sub="числа"/><Stat icon={<TrendingDown/>} label="Строк" value={`${rows.length} міс.`} sub="поточний"/><Stat icon={<ArrowDownRight/>} label="Відсотки" value={money(interest)} sub="прогноз"/></div><div className="policy-summary"><ShieldCheck/><span>Дострокове погашення: <b>{c.interestPolicy==='full_term'?'відсотки за весь договірний строк':'відсотки за фактичні місяці користування'}</b></span><button className="btn secondary" onClick={()=>onEdit(c)}><Settings/> Налаштувати</button></div><section className="panel simulator"><div><h3>Додатковий платіж</h3><p className="muted">{money(extra)} / місяць</p></div><input type="range" min="0" max="20000" step="100" value={extra} onChange={e=>setExtra(n(e.target.value))}/></section><Schedule credits={[c]} extra={extra}/></div>}
function SettingsView({state,setState,user,cloudEnabled,onResetPassword,onMigrate,onToggleTheme,onImportBackup}){return <div className="view"><div className="page-title"><div><p className="eyebrow">ACCOUNT</p><h2>Налаштування</h2></div></div><section className="panel settings"><div className="setting"><div><b>Профіль</b><small>{user.email}</small></div></div><div className="setting"><div><b>Синхронізація</b><small>{cloudEnabled?'Акаунт зберігається в хмарі. Ви можете увійти з телефону, ПК та іншого пристрою.':'Локальний режим. Для синхронізації додайте Supabase.'}</small></div><ShieldCheck/></div>{cloudEnabled&&<div className="setting"><div><b>Пароль</b><small>Надіслати лист для зміни пароля</small></div><button className="btn secondary" onClick={onResetPassword}>Змінити</button></div>}{onMigrate&&<div className="setting"><div><b>Локальна резервна копія</b><small>Перенести старі кредити й ліміти з цього браузера у хмарний акаунт.</small></div><button className="btn secondary" onClick={onMigrate}>Імпортувати</button></div>}{cloudEnabled&&<div className="setting"><div><b>Імпорт зі старої версії</b><small>Виберіть файл <code>credit-manager-backup.json</code>. Будуть додані розстрочки, кредитні ліміти та історія платежів поточного email.</small></div><label className="btn secondary file-import"><Upload/> Вибрати файл<input type="file" accept="application/json,.json" onChange={e=>{const file=e.target.files?.[0];onImportBackup(file);e.target.value=''}}/></label></div>}<div className="setting"><div><b>Тема</b><small>Світла або темна</small></div><button className="btn secondary" onClick={onToggleTheme}>{state.theme==='dark'?<Sun/>:<Moon/>}</button></div><div className="setting"><div><b>Дані</b><small>{cloudEnabled?'Кредити та ліміти зберігаються у вашому Supabase-проєкті та захищені RLS.':'Кредити та ліміти зберігаються локально у браузері.'}</small></div><ShieldCheck/></div></section></div>}

createRoot(document.getElementById('root')).render(<App/>);
