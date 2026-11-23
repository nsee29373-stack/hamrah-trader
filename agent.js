
/* Hamrah Trader - Fixed Paper Trading Engine
   Paper trading only. Real trading is disabled.
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

      const p = JSON.parse(raw);
      if (!p || typeof p !== "object") return;

      state.balance = Math.max(0, num(p.balance, 10000));
      state.equity = num(p.equity, state.balance);
      state.trades = Array.isArray(p.trades) ? p.trades.slice(0, 200) : [];
      state.openTrade = p.openTrade || null;
      state.lastAnalysis = p.lastAnalysis || null;
      state.running = false;
    } catch (_) {}
  }

  function ema(values, period) {
    if (values.length < period) return null;

    const k = 2 / (period + 1);
    let result = values[0];

    for (let i = 1; i < values.length; i++) {
      result = values[i] * k + result * (1 - k);
    }

    return result;
  }

  function rsi(values, period) {
    if (values.length < period + 1) return null;

    let gains = 0;
    let losses = 0;

    for (let i = values.length - period; i < values.length; i++) {
      const change = values[i] - values[i - 1];

      if (change > 0) gains += change;
      else losses -= change;
    }

    if (losses === 0) return gains === 0 ? 50 : 100;

    const rs = gains / losses;
    return 100 - (100 / (1 + rs));
  }

  function analyze(input) {
    const values = Array.isArray(input)
      ? input.map(Number).filter(v => Number.isFinite(v) && v > 0)
      : (input && Array.isArray(input.closes)
          ? input.closes.map(Number).filter(v => Number.isFinite(v) && v > 0)
          : []);

    const fast = ema(values.slice(-60), 9);
    const slow = ema(values.slice(-100), 21);
    const strength = rsi(values, 14);

    let signal = "HOLD";
    let confidence = 0;
    let message = "برای تحلیل مطمئن، داده بیشتری لازم است.";

    if (fast !== null && slow !== null && strength !== null) {
      if (fast > slow && strength >= 50 && strength < 75) {
        signal = "BUY";
        message = "تمایل صعودی؛ فقط در حالت آزمایشی.";
      } else if (fast < slow && strength > 25 && strength <= 50) {
        signal = "SELL";
        message = "تمایل نزولی؛ فقط در حالت آزمایشی.";
      } else {
        message = "فعلاً شرایط سیگنال مناسب نیست.";
      }

      const difference = Math.abs((fast - slow) / slow);
      confidence = Math.min(95, Math.round(50 + difference * 10000));
    }

    const result = {
      signal,
      confidence,
      message,
      emaFast: fast,
      emaSlow: slow,
      rsi: strength
    };

    state.lastAnalysis = result;
    save();

    return result;
  }

  function markToMarket(price) {
    const t = state.openTrade;
    if (!t) return 0;

    const direction = t.side === "BUY" ? 1 : -1;
    return (price - t.entryPrice) * t.qty * direction;
  }

  function openTrade(side, price, symbol, options) {
    if (state.openTrade) {
      throw new Error("ابتدا معامله باز فعلی را ببندید.");
    }

    side = String(side || "").toUpperCase();
    price = num(price, NaN);
    options = options || {};

    if (side !== "BUY" && side !== "SELL") {
      throw new Error("جهت معامله نامعتبر است.");
    }

    if (!(Number.isFinite(price) && price > 0)) {
      throw new Error("قیمت ورود معتبر نیست.");
    }

    const qty = num(options.qty, NaN);
    const sl = num(options.sl, NaN);
    const tp = num(options.tp, NaN);

    if (!(qty > 0 && Number.isFinite(qty))) {
      throw new Error("حجم معامله معتبر نیست.");
    }

    if (!(sl >= 0.1 && sl <= 20)) {
      throw new Error("حد ضرر باید بین ۰٫۱ تا ۲۰ درصد باشد.");
    }

    if (!(tp >= 0.1 && tp <= 50)) {
      throw new Error("حد سود باید بین ۰٫۱ تا ۵۰ درصد باشد.");
    }

    const direction = side === "BUY" ? 1 : -1;

    state.openTrade = {
      id: Date.now(),
      side,
      symbol: String(symbol || ""),
      entryPrice: price,
      entry: price,
      qty,
      stopLoss: price * (1 - direction * sl / 100),
      takeProfit: price * (1 + direction * tp / 100),
      openedAt: new Date().toISOString()
    };

    state.equity = state.balance;
    save();

    return state.openTrade;
  }

  function closeTrade(price, reason) {
    if (!state.openTrade) return null;

    price = num(price, NaN);

    if (!(Number.isFinite(price) && price > 0)) {
      throw new Error("قیمت خروج معتبر نیست.");
    }

    const t = state.openTrade;
    const pnl = markToMarket(price);

    const closed = Object.assign({}, t, {
      entry: t.entryPrice,
      exit: price,
      exitPrice: price,
      pnl,
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
    const t = state.openTrade;
    if (!t) return null;

    if (symbol && t.symbol !== String(symbol)) return null;

    price = num(price, NaN);
    if (!(Number.isFinite(price) && price > 0)) return null;

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
    const position = state.openTrade
      ? Object.assign({}, state.openTrade, {
          entry: state.openTrade.entryPrice
        })
      : null;

    return {
      mode: "PAPER_ONLY",
      realTradingEnabled: false,
      balance: state.balance,
      equity: state.equity,
      position,
      openTrade: position,
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

    analyze,
    openTrade,
    closeTrade,
    checkPrice,
    getStatus,
    reset,

    start: function () {
      state.running = true;
      save();
      return getStatus();
    },

    stop: function () {
      state.running = false;
      save();
      return getStatus();
    }
  };
})();
