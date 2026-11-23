
/* Hamrah Trader - Advanced Paper Trading Engine
 * Real-money trading is intentionally disabled.
 * USDJPY quote PnL is converted from JPY to USD.
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
        state.trades = Array.isArray(parsed.trades)
          ? parsed.trades
          : [];
        state.openTrade = parsed.openTrade || null;
        state.lastAnalysis = parsed.lastAnalysis || null;
        state.running = !!parsed.running;
      }
    } catch (_) {}
  }

  // USDJPY is quoted in JPY.
  // Other symbols in this application are normalized to USD.
  function quoteCurrency(symbol) {
    return String(symbol || "").toUpperCase() === "USDJPY"
      ? "JPY"
      : "USD";
  }

  // Convert quote-currency PnL to USD.
  // For USDJPY: JPY / (JPY per USD) = USD.
  function quoteToUsdFactor(symbol, price, suppliedFactor) {
    const supplied = Number(suppliedFactor);

    if (Number.isFinite(supplied) && supplied > 0) {
      return supplied;
    }

    if (
      quoteCurrency(symbol) === "JPY" &&
      Number(price) > 0
    ) {
      return 1 / Number(price);
    }

    return 1;
  }

  function ema(values, period) {
    if (!values.length) return null;

    const k = 2 / (period + 1);
    let result = values[0];

    for (let i = 1; i < values.length; i++) {
      result =
        values[i] * k +
        result * (1 - k);
    }

    return result;
  }

  function rsi(values, period) {
    if (values.length < period + 1) return 50;

    let gains = 0;
    let losses = 0;

    for (
      let i = values.length - period;
      i < values.length;
      i++
    ) {
      const change = values[i] - values[i - 1];

      if (change > 0) {
        gains += change;
      } else {
        losses -= change;
      }
    }

    if (losses === 0) return 100;

    const rs =
      (gains / period) /
      (losses / period);

    return 100 - (100 / (1 + rs));
  }

  function analyze(input) {
    const values = Array.isArray(input)
      ? input.map(Number).filter(Number.isFinite)
      : (
          input && Array.isArray(input.closes)
            ? input.closes.map(Number).filter(Number.isFinite)
            : []
        );

    const fast = ema(values.slice(-60), 9);
    const slow = ema(values.slice(-100), 21);
    const strength = rsi(values, 14);

    let signal = "HOLD";

    if (fast !== null && slow !== null) {
      if (fast > slow && strength < 75) {
        signal = "BUY";
      } else if (fast < slow && strength > 25) {
        signal = "SELL";
      }
    }

    const confidence =
      fast === null || slow === null
        ? 0
        : Math.min(
            95,
            Math.round(
              50 +
              Math.abs(
                (fast - slow) / (slow || 1)
              ) * 10000
            )
          );

    const result = {
      signal,
      confidence,
      message:
        signal === "BUY"
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

  // Raw PnL in the symbol's quote currency.
  function markToMarketQuote(price) {
    if (!state.openTrade) return 0;

    const t = state.openTrade;
    const direction = t.side === "BUY" ? 1 : -1;

    return (
      (price - t.entryPrice) *
      t.qty *
      direction
    );
  }

  // PnL converted to USD for account balance/equity.
  function markToMarketUsd(price, factor) {
    if (!state.openTrade) return 0;

    const t = state.openTrade;
    const rawPnl = markToMarketQuote(price);

    return rawPnl *
      quoteToUsdFactor(t.symbol, price, factor);
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
      side,
      symbol: String(symbol || ""),
      entryPrice: price,
      qty,

      stopLoss: slPct
        ? price * (1 - direction * slPct / 100)
        : null,

      takeProfit: tpPct
        ? price * (1 + direction * tpPct / 100)
        : null,

      quoteCurrency: quoteCurrency(symbol),
      openedAt: new Date().toISOString()
    };

    save();

    return state.openTrade;
  }

  function closeTrade(price, reason, suppliedFactor) {
    if (!state.openTrade) return null;

    price = num(price, NaN);

    if (!(price > 0)) {
      throw new Error("قیمت خروج معتبر نیست.");
    }

    const t = state.openTrade;

    // Keep raw quote PnL for compatibility with the current UI.
    const pnlQuote = markToMarketQuote(price);

    // Convert the account result to USD.
    const conversion = quoteToUsdFactor(
      t.symbol,
      price,
      suppliedFactor
    );

    const pnlUsd = pnlQuote * conversion;

    const closed = Object.assign({}, t, {
      exitPrice: price,

      // pnl remains in quote currency for existing history display.
      pnl: pnlQuote,
      pnlQuote: pnlQuote,

      quoteCurrency:
        t.quoteCurrency || quoteCurrency(t.symbol),

      quoteToUsdFactor: conversion,
      pnlUsd: pnlUsd,

      closeReason: reason || "MANUAL",
      closedAt: new Date().toISOString()
    });

    // Account balance is always USD.
    state.balance += pnlUsd;
    state.equity = state.balance;

    state.trades.unshift(closed);
    state.trades = state.trades.slice(0, 200);

    state.openTrade = null;

    save();

    return closed;
  }

  function checkPrice(price, symbol, suppliedFactor) {
    if (!state.openTrade) return null;

    const t = state.openTrade;

    if (
      symbol &&
      t.symbol &&
      String(symbol) !== t.symbol
    ) {
      return null;
    }

    price = num(price, NaN);

    if (!(price > 0)) return null;

    const hitSL =
      t.stopLoss !== null &&
      (
        t.side === "BUY"
          ? price <= t.stopLoss
          : price >= t.stopLoss
      );

    const hitTP =
      t.takeProfit !== null &&
      (
        t.side === "BUY"
          ? price >= t.takeProfit
          : price <= t.takeProfit
      );

    if (hitSL) {
      return closeTrade(
        price,
        "STOP_LOSS",
        suppliedFactor
      );
    }

    if (hitTP) {
      return closeTrade(
        price,
        "TAKE_PROFIT",
        suppliedFactor
      );
    }

    // Open-position equity is also converted to USD.
    state.equity =
      state.balance +
      markToMarketUsd(price, suppliedFactor);

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
      position: state.openTrade,

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

  // Keep real trading permanently disabled.
  state.mode = "PAPER_ONLY";
  state.realTradingEnabled = false;

  window.HamrahTraderAgent = {
    mode: "PAPER_ONLY",
    realTradingEnabled: false,

    analyze,
    openTrade,
    closeTrade,
    checkPrice,
    getStatus,

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

    reset
  };

  save();

})();
