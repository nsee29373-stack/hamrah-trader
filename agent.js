
/* Hamrah Trader - Paper Trading Engine
   Real trading is intentionally disabled.
*/
(function () {
  "use strict";

  const STORAGE_KEY = "hamrah_trader_agent_v1";

  const state = {
    mode: "PAPER_ONLY",
    realTradingEnabled: false,
    balance: 10000,
    equity: 10000,
    trades: [],
    openTrade: null,
    lastAnalysis: null,
    running: false
  };

  function num(v, fallback) {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  }

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (_) {}
  }

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        state.balance = num(parsed.balance, 10000);
        state.equity = num(parsed.equity, state.balance);
        state.trades = Array.isArray(parsed.trades) ? parsed.trades : [];
        state.openTrade = parsed.openTrade || null;
        state.lastAnalysis = parsed.lastAnalysis || null;
      }
    } catch (_) {}
  }

  function ema(values, period) {
    if (!values.length) return null;
    const k = 2 / (period + 1);
    let result = values[0];

    for (let i = 1; i < values.length; i++) {
      result = values[i] * k + result * (1 - k);
    }
    return result;
  }

  function rsi(values, period) {
    if (values.length < period + 1) return 50;

    let gains = 0;
    let losses = 0;

    for (let i = values.length - period; i < values.length; i++) {
      const change = values[i] - values[i - 1];
      if (change > 0) gains += change;
      else losses -= change;
    }

    if (losses === 0) return 100;

    const rs = (gains / period) / (losses / period);
    return 100 - (100 / (1 + rs));
  }

  function analyze(input) {
    const values = Array.isArray(input)
      ? input.map(Number).filter(Number.isFinite)
      : (input && Array.isArray(input.closes)
          ? input.closes.map(Number).filter(Number.isFinite)
          : []);

    const fast = ema(values.slice(-60), 9);
    const slow = ema(values.slice(-100), 21);
    const strength = rsi(values, 14);

    let signal = "HOLD";

    if (fast !== null && slow !== null) {
      if (fast > slow && strength < 75) signal = "BUY";
      else if (fast < slow && strength > 25) signal = "SELL";
    }

    const confidence = fast === null || slow === null
      ? 0
      : Math.min(
          95,
          Math.round(50 + Math.abs((fast - slow) / (slow || 1)) * 10000)
        );

    const result = {
      signal: signal,
      confidence: confidence,
      message: signal === "BUY"
        ? "تمایل صعودی؛ فقط در حالت آزمایشی"
        : signal === "SELL"
          ? "تمایل نزولی؛ فقط در حالت آزمایشی"
          : "فعلاً سیگنال قطعی وجود ندارد",
      emaFast: fast,
      emaSlow: slow,
      rsi: strength
    };

    state.lastAnalysis = result;
    save();
    return result;
  }

  function markToMarket(price) {
    if (!state.openTrade) return 0;

    const t = state.openTrade;
    const direction = t.side === "BUY" ? 1 : -1;

    return (price - t.entryPrice) * t.qty * direction;
  }

  function openTrade(side, price, symbol, options) {
    if (state.openTrade) {
      throw new Error("ابتدا معامله باز فعلی را ببندید.");
    }

    side = String(side || "").toUpperCase();

    if (side !== "BUY" && side !== "SELL") {
      throw new Error("جهت معامله نامعتبر است.");
    }

    price = num(price, NaN);

    if (!(price > 0)) {
      throw new Error("قیمت ورود معتبر نیست.");
    }

    options = options || {};

    const qty = num(options.qty, 1);
    if (!(qty > 0)) {
      throw new Error("حجم باید بیشتر از صفر باشد.");
    }

    const slPct = Math.max(0, num(options.sl, 0));
    const tpPct = Math.max(0, num(options.tp, 0));
    const direction = side === "BUY" ? 1 : -1;

    state.openTrade = {
      id: Date.now(),
      side: side,
      symbol: String(symbol || ""),
      entryPrice: price,
      qty: qty,
      stopLoss: slPct
        ? price * (1 - direction * slPct / 100)
        : null,
      takeProfit: tpPct
        ? price * (1 + direction * tpPct / 100)
        : null,
      openedAt: new Date().toISOString()
    };

    save();
    return state.openTrade;
  }

  function closeTrade(price, reason) {
    if (!state.openTrade) return null;

    price = num(price, NaN);

    if (!(price > 0)) {
      throw new Error("قیمت خروج معتبر نیست.");
    }

    const t = state.openTrade;
    const pnl = markToMarket(price);

    const closed = Object.assign({}, t, {
      exitPrice: price,
      pnl: pnl,
      closeReason: reason || "MANUAL",
      closedAt: new Date().toISOString()
    });

    state.balance += pnl;
    state.equity = state.balance;
    state.trades.unshift(closed);
    state.trades = state.trades.slice(0, 200);
    state.openTrade = null;

    save();
    return closed;
  }

  function checkPrice(price, symbol) {
    if (!state.openTrade) return null;

    const t = state.openTrade;

    if (symbol && t.symbol && String(symbol) !== t.symbol) {
      return null;
    }

    price = num(price, NaN);
    if (!(price > 0)) return null;

    const hitSL = t.stopLoss !== null &&
      (t.side === "BUY"
        ? price <= t.stopLoss
        : price >= t.stopLoss);

    const hitTP = t.takeProfit !== null &&
      (t.side === "BUY"
        ? price >= t.takeProfit
        : price <= t.takeProfit);

    if (hitSL) return closeTrade(price, "STOP_LOSS");
    if (hitTP) return closeTrade(price, "TAKE_PROFIT");

    state.equity = state.balance + markToMarket(price);
    save();

    return null;
  }

  function getStatus() {
    return {
      mode: state.mode,
      realTradingEnabled: false,
      balance: state.balance,
      equity: state.equity,
      openTrade: state.openTrade,
      trades: state.trades.slice(),
      lastAnalysis: state.lastAnalysis,
      running: state.running
    };
  }

  function reset() {
    state.balance = 10000;
    state.equity = 10000;
    state.trades = [];
    state.openTrade = null;
    state.lastAnalysis = null;
    state.running = false;

    save();
    return getStatus();
  }

  load();

  window.HamrahTraderAgent = {
    mode: "PAPER_ONLY",
    realTradingEnabled: false,
    analyze: analyze,
    openTrade: openTrade,
    closeTrade: closeTrade,
    checkPrice: checkPrice,
    getStatus: getStatus,

    start: function () {
      state.running = true;
      save();
      return getStatus();
    },

    stop: function () {
      state.running = false;
      save();
      return getStatus();
    },

    reset: reset
  };
})();
