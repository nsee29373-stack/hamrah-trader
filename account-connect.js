/* Hamrah Trader: Supabase login + Bitpin read-only balance.
   Add this file to repository root as account-connect.js.
   Add <script src="./account-connect.js"></script> before </body> in index.html.
   This file never submits orders, withdrawals or asset transfers. */
(function () {
  'use strict';
  const URL = 'https://gjxloiuocldtnyyxdmou.supabase.co';
  const KEY = 'sb_publishable_achqODtSzXKjZzG6fWXlCg_MIDWP_K0';
  const FN = URL + '/functions/v1/';
  const $ = id => document.getElementById(id);
  const view = $('view-account');
  if (!view) { console.error('Hamrah Trader: #view-account not found'); return; }

  if (!$('htLiveAccountPanel')) {
    const panel = document.createElement('section');
    panel.className = 'card'; panel.id = 'htLiveAccountPanel';
    panel.innerHTML = `
      <div class="sectiontitle">🔐 اتصال امن حساب بیت‌پین</div>
      <div class="mon-summary"><span>وضعیت ورود</span><strong id="htAuthState" class="wait">وارد نشده‌اید</strong><span id="htExchangeState">اتصال صرافی برقرار نشده</span></div>
      <div id="htAuthForm">
        <label class="label" for="htEmail">ایمیل حساب همراه تریدر</label><input id="htEmail" type="email" autocomplete="username" placeholder="ایمیل">
        <label class="label" for="htPassword" style="display:block;margin-top:8px">رمز عبور</label><input id="htPassword" type="password" autocomplete="current-password" placeholder="حداقل ۸ کاراکتر">
        <div class="actions"><button class="primary" id="htSignIn">ورود</button><button class="ghost" id="htSignUp">ثبت‌نام</button><button class="ghost" id="htSignOut" disabled>خروج</button></div>
      </div>
      <div id="htExchangeForm" class="hidden">
        <p class="muted">کلید API را فقط با مجوز مشاهده موجودی بسازید. مجوز معامله، برداشت و انتقال را فعال نکنید. کلیدها در مرورگر ذخیره نمی‌شوند و پس از ارسال پاک می‌شوند.</p>
        <label class="label" for="htApiKey">API Key بیت‌پین</label><input id="htApiKey" type="password" autocomplete="off" placeholder="API Key">
        <label class="label" for="htSecretKey" style="display:block;margin-top:8px">Secret Key بیت‌پین</label><input id="htSecretKey" type="password" autocomplete="off" placeholder="Secret Key">
        <div class="actions"><button class="primary" id="htConnect">اتصال امن</button><button class="ghost" id="htRefresh">به‌روزرسانی موجودی</button></div>
      </div>
      <p class="status" id="htStatus" aria-live="polite">برای شروع وارد حساب شوید یا ثبت‌نام کنید.</p>
      <div id="htBalances"></div>
      <div class="notice">این اتصال فقط برای مشاهده موجودی است. سفارش واقعی، برداشت و انتقال دارایی غیرفعال‌اند. خرید واقعی تا پیاده‌سازی و آزمایش کنترل سفارش و تأیید نهایی فعال نمی‌شود.</div>`;
    view.appendChild(panel);
  }
  const say = message => { if ($('htStatus')) $('htStatus').textContent = message; };
  const show = (id, on) => { if ($(id)) $(id).classList.toggle('hidden', !on); };
  if (!window.supabase || !window.supabase.createClient) { say('کتابخانه Supabase بارگذاری نشده است؛ اتصال اینترنت یا CDN را بررسی کنید.'); return; }
  const db = window.supabase.createClient(URL, KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
  let session = null;
  const value = v => { if (v == null || v === '') return '—'; const n = Number(v); return Number.isFinite(n) ? n.toLocaleString('en-US', { maximumFractionDigits: 10 }) : String(v); };

  async function syncSession() {
    const { data, error } = await db.auth.getSession(); if (error) throw error;
    session = data.session; const logged = !!session;
    $('htAuthState').textContent = logged ? (session.user.email || 'وارد شده‌اید') : 'وارد نشده‌اید';
    show('htExchangeForm', logged); $('htSignIn').disabled = logged; $('htSignUp').disabled = logged; $('htSignOut').disabled = !logged;
    if (!logged) { $('htExchangeState').textContent = 'اتصال صرافی برقرار نشده'; $('htBalances').replaceChildren(); }
  }
  async function call(name, body) {
    if (!session) throw new Error('ابتدا وارد حساب همراه تریدر شوید.');
    const response = await fetch(FN + name, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: KEY, Authorization: 'Bearer ' + session.access_token }, body: JSON.stringify(body || {}) });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.ok) throw new Error(result.error || ('خطای سرور ' + response.status));
    return result;
  }
  async function signIn() {
    const email = $('htEmail').value.trim(), password = $('htPassword').value;
    if (!email || !password) throw new Error('ایمیل و رمز عبور را وارد کنید.');
    say('در حال ورود…'); const { data, error } = await db.auth.signInWithPassword({ email, password });
    if (error) throw error; session = data.session; await syncSession(); say('ورود موفق بود. اکنون اتصال مشاهده‌ای بیت‌پین را انجام دهید.');
  }
  async function signUp() {
    const email = $('htEmail').value.trim(), password = $('htPassword').value;
    if (!email || password.length < 8) throw new Error('ایمیل معتبر و رمز عبور حداقل ۸ کاراکتری وارد کنید.');
    say('در حال ثبت‌نام…'); const { data, error } = await db.auth.signUp({ email, password });
    if (error) throw error;
    if (data.session) { session = data.session; await syncSession(); say('حساب ساخته شد و وارد شدید.'); }
    else say('ثبت‌نام انجام شد؛ ایمیل را برای تأیید بررسی کنید و سپس وارد شوید.');
  }
  function render(rows) {
    const root = $('htBalances'); root.replaceChildren();
    if (!Array.isArray(rows) || !rows.length) { root.textContent = 'موجودی قابل‌نمایشی دریافت نشد.'; return; }
    const table = document.createElement('table'); table.style.width = '100%';
    const labels = ['دارایی', 'موجودی کل', 'قابل استفاده', 'قفل‌شده'];
    const head = document.createElement('tr'); labels.forEach(x => { const th = document.createElement('th'); th.textContent = x; head.appendChild(th); }); table.appendChild(head);
    rows.forEach(item => { const tr = document.createElement('tr'); [item.currency, item.balance, item.available, item.locked].forEach(x => { const td = document.createElement('td'); td.textContent = value(x); tr.appendChild(td); }); table.appendChild(tr); }); root.appendChild(table);
  }
  async function refresh() {
    $('htRefresh').disabled = true; say('در حال دریافت موجودی از بیت‌پین…');
    try { const result = await call('bitpin-account-balance'); render(result.balances); $('htExchangeState').textContent = 'متصل · فقط مشاهده'; say('موجودی دریافت شد · ' + (result.fetched_at ? new Date(result.fetched_at).toLocaleString('fa-IR') : '')); }
    finally { $('htRefresh').disabled = false; }
  }
  async function connect() {
    const api_key = $('htApiKey').value.trim(), secret_key = $('htSecretKey').value.trim();
    if (!api_key || !secret_key) throw new Error('هر دو کلید API و Secret را وارد کنید.');
    if (!window.confirm('تأیید می‌کنید کلیدها فقط برای مشاهده موجودی ارسال شوند؟ مجوز برداشت و معامله را فعال نکنید.')) return;
    $('htConnect').disabled = true; say('در حال اعتبارسنجی اتصال…');
    try { await call('bitpin-connect', { api_key, secret_key }); $('htApiKey').value = ''; $('htSecretKey').value = ''; $('htExchangeState').textContent = 'متصل · فقط مشاهده'; say('اتصال ثبت شد؛ در حال دریافت موجودی…'); await refresh(); }
    finally { $('htConnect').disabled = false; }
  }
  function bind(id, fn) { $(id).addEventListener('click', () => Promise.resolve().then(fn).catch(e => say('ناموفق: ' + (e.message || 'خطای ارتباط')))); }
  bind('htSignIn', signIn); bind('htSignUp', signUp); bind('htConnect', connect); bind('htRefresh', refresh);
  bind('htSignOut', async () => { const { error } = await db.auth.signOut(); if (error) throw error; session = null; await syncSession(); say('از حساب خارج شدید.'); });
  db.auth.onAuthStateChange((_event, next) => { session = next; setTimeout(() => syncSession().catch(e => say('خطای نشست: ' + e.message)), 0); });
  syncSession().then(() => { if (!session) say('برای شروع وارد حساب شوید یا ثبت‌نام کنید.'); }).catch(e => say('خطا در دریافت وضعیت ورود: ' + e.message));
})();
