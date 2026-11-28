(() => {
  'use strict';

  const CURRENT_KEY = 'ht_phone_public_ip';
  const PREVIOUS_KEY = 'ht_phone_previous_ip';
  const CHECK_INTERVAL = 5 * 60 * 1000;

  function createPanel() {
    const view = document.querySelector('#view-account');
    if (!view || document.querySelector('#htIpQuickCard')) return;

    const card = document.createElement('section');
    card.id = 'htIpQuickCard';
    card.style.cssText = `
      margin:14px 0;padding:16px;border-radius:16px;
      background:linear-gradient(135deg,#102b36,#17243c);
      border:1px solid #20c9a0;color:#fff;
      direction:rtl;text-align:right;font-family:inherit;
    `;

    card.innerHTML = `
      <div style="font-size:17px;font-weight:bold;margin-bottom:12px">
        بررسی IP عمومی گوشی
      </div>
      <div style="font-size:13px;color:#b9d5df">IP فعلی</div>
      <div id="htIpCurrent" dir="ltr"
        style="font-size:20px;font-weight:bold;margin:7px 0">در حال بررسی...</div>
      <div id="htIpStatus" style="font-size:13px;margin:8px 0">
        در حال دریافت IP عمومی
      </div>
      <div style="font-size:12px;color:#b9d5df;margin-top:12px">
        IP قبلی:
        <span id="htIpPrevious" dir="ltr">—</span>
      </div>
      <div style="display:flex;gap:8px;margin-top:14px">
        <button id="htIpRefresh" style="flex:1;padding:11px;border:0;border-radius:9px;background:#16b995;color:#06251f;font-weight:bold">
          بررسی مجدد
        </button>
        <button id="htIpCopy" style="flex:1;padding:11px;border:0;border-radius:9px;background:#263f53;color:white;font-weight:bold">
          کپی IP
        </button>
      </div>
      <div style="font-size:11px;color:#c5d5dc;margin-top:12px;line-height:1.8">
        در صورت تغییر IP، فهرست مجاز Bitpin را باید دستی به‌روزرسانی کنی.
        این بخش ثبت IP در Bitpin را انجام یا تأیید نمی‌کند.
      </div>
    `;

    view.insertBefore(card, view.firstChild);

    document.getElementById('htIpRefresh').addEventListener('click', checkIP);
    document.getElementById('htIpCopy').addEventListener('click', copyIP);
  }

  function showStatus(message, color) {
    const el = document.getElementById('htIpStatus');
    if (el) {
      el.textContent = message;
      el.style.color = color || '#ffffff';
    }
  }

  function displaySaved() {
    const current = localStorage.getItem(CURRENT_KEY) || '—';
    const previous = localStorage.getItem(PREVIOUS_KEY) || '—';

    const currentEl = document.getElementById('htIpCurrent');
    const previousEl = document.getElementById('htIpPrevious');

    if (currentEl) currentEl.textContent = current;
    if (previousEl) previousEl.textContent = previous;
  }

  async function checkIP() {
    createPanel();
    showStatus('در حال بررسی IP عمومی...', '#b9d5df');

    try {
      let ip = '';

      try {
        const response = await fetch('https://api.ipify.org?format=json', {
          cache: 'no-store'
        });
        if (!response.ok) throw new Error('ipify failed');
        const data = await response.json();
        ip = data.ip || '';
      } catch (_) {
        const response = await fetch('https://ipwho.is/', {
          cache: 'no-store'
        });
        if (!response.ok) throw new Error('IP service failed');
        const data = await response.json();
        ip = data.ip || '';
      }

      if (!ip) throw new Error('IP unavailable');

      const oldIP = localStorage.getItem(CURRENT_KEY);

      if (oldIP && oldIP !== ip) {
        localStorage.setItem(PREVIOUS_KEY, oldIP);
        showStatus('هشدار: IP عمومی گوشی تغییر کرده است.', '#ffcc66');

        if (navigator.vibrate) {
          navigator.vibrate([180, 80, 180]);
        }
      } else {
        showStatus('IP عمومی با موفقیت بررسی شد.', '#53e6b5');
      }

      localStorage.setItem(CURRENT_KEY, ip);
      displaySaved();

    } catch (error) {
      showStatus('دریافت IP ناموفق بود. اتصال اینترنت را بررسی کن.', '#ff8b8b');
    }
  }

  async function copyIP() {
    const ip = localStorage.getItem(CURRENT_KEY);

    if (!ip) {
      showStatus('ابتدا IP را بررسی کن.', '#ffcc66');
      return;
    }

    try {
      await navigator.clipboard.writeText(ip);
      showStatus('IP کپی شد.', '#53e6b5');
    } catch (_) {
      showStatus('کپی خودکار ممکن نیست؛ IP را دستی انتخاب کن.', '#ffcc66');
    }
  }

  function start() {
    createPanel();
    displaySaved();
    checkIP();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }

  setInterval(() => {
    if (!document.hidden) checkIP();
  }, CHECK_INTERVAL);

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) checkIP();
  });
})();
