
/* Hamrah Trader - Advanced Paper Trading Engine
   Real trading permanently disabled in this version.
*/
(function () {
  "use strict";

  const KEY = "hamrah_trader_agent_v1";

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

  const num = (v, fallback) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  };

  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch (_) {}
  }

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return;

      const p = JSON.parse(raw);
      if (!p || typeof p !== "object") return;

      state.balance = Math.max(0, num(p.balance, 10000));
      state.trades = Array.isArray(p.trades)
        ? p.trades.filter(t =>
            t && typeof t === "object" &&
            Number.isFinite(Number(t.pnl))
          ).slice(0, 200)
        : [];

      state.openTrade = p.openTrade &&
        typeof p.openTrade === "object"
        ? Object.assign({}, p.openTrade, {
            entryPrice: num(
              p.openTrade.entryPrice,
              num(p.openTrade.entry, NaN)
            )
          })
        : null;

      if (state.openTrade &&
          !(state.openTrade.entryPrice > 0)) {
        state.openTrade = null;
      }

      state.equity = state.balance;
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

    for (let i = 1; i <= period; i++) {
      const change = values[i] - values[i - 1];
      if (change > 0) gains += change;
      else losses -= change;
    }

    let avgGain = gains / period;
    let avgLoss = losses / period;

    for (let i = period + 1; i < values.length; i++) {
      const change = values[i] - values[i - 1];

      avgGain =
        (avgGain * (period - 1) + Math.max(change, 0)) / period;

      avgLoss =
        (avgLoss * (period - 1) + Math.max(-change, 0)) / period;
    }

    if (avgLoss === 0) {
      return avgGain === 0 ? 50 : 100;
    }

    const rs = avgGain / avgLoss;
    return 100 - (100 / (1 + rs));
  }

  function analyze(input) {
    const raw = Array.isArray(input)
      ? input
      : input && Array.isArray(input.closes)
        ? input.closes
        : [];

    const values = raw
      .map(Number)
      .filter(v => Number.isFinite(v) && v > 0);

    const enoughData = values.length >= 30;

    const fast = enoughData ? ema(values, 9) : null;
    const slow = enoughData ? ema(values, 21) : null;
    const strength = enoughData ? rsi(values, 14) : null;

    let signal = "HOLD";
    let score = 0;
    let message = "برای تحلیل، حداقل ۳۰ داده معتبر لازم است.";

    if (enoughData && fast !== null &&
        slow !== null && strength !== null) {

      const last = values[values.length - 1];
      const previous = values[values.length - 6];

      const slopePct = previous > 0
        ? ((last - previous) / previous) * 100
        : 0;

      const spreadPct = slow > 0
        ? Math.abs((fast - slow) / slow) * 100
        : 0;

      const trendPoints = Math.min(35, spreadPct * 12);
      const slopePoints = Math.min(25, Math.abs(slopePct) * 5);
      const rsiPoints = Math.max(0, 25 - Math.abs(strength - 50));
      const dataPoints = Math.min(
        15,
        Math.floor(values.length / 20) * 3
      );

      score = Math.max(0, Math.min(
        100,
        Math.round(
          trendPoints + slopePoints + rsiPoints + dataPoints
        )
      ));

      if (fast > slow &&
          slopePct > 0 &&
          strength >= 52 &&
          strength < 70) {

        signal = "BUY";
        message =
          "روند و مومنتوم متمایل به صعود هستند؛ سیگنال صرفاً آزمایشی است.";

      } else if (fast < slow &&
                 slopePct < 0 &&
                 strength <= 48 &&
                 strength > 30) {

        signal = "SELL";
        message =
          "روند و مومنتوم متمایل به نزول هستند؛ سیگنال صرفاً آزمایشی است.";

      } else {
        message =
          "شاخص‌ها هم‌جهت نیستند یا بازار در محدوده خنثی قرار دارد؛ فعلاً صبر.";
      }
    }

    const result = {
      signal,
      confidence: score,
      score,
      message,
      emaFast: fast,
      emaSlow: slow,
      rsi: strength,
      sampleCount: values.length
    };

    state.lastAnalysis = result;
    save();

    return result;
  }

  function markToMarket(price) {
    const t = state.openTrade;
    if (!t) return 0;

    const direction = t.side === "BUY" ? 1 : -1;

    return (price - t.entryPrice) *
      t.qty * direction;
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

    if (!(price > 0)) {
      throw new Error("قیمت ورود معتبر نیست.");
    }

    const qty = num(options.qty, NaN);
    const sl = num(options.sl, NaN);
    const tp = num(options.tp, NaN);

    if (!(qty > 0)) {
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

    if (!(price > 0)) {
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

    if (symbol && t.symbol !== String(symbol)) {
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

    state.equity =
      state.balance + markToMarket(price);

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

