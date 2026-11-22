
/* HAMRAH TRADER AI AGENT
   Strategy: EMA 9/21 + RSI 14
   Mode: PAPER TRADING ONLY
*/

(function () {
  "use strict";

  const CONFIG = {
    fastEMA: 9,
    slowEMA: 21,
    rsiPeriod: 14,
    startingBalance: 10000,
    riskPercent: 1,
    stopLossPercent: 0.5,
    takeProfitPercent: 1
  };

  let state = {
    running: false,
    balance: CONFIG.startingBalance,
    position: null,
    trades: [],
    signal: "WAIT"
  };

  function ema(values, period) {
    if (values.length < period) return null;

    const multiplier = 2 / (period + 1);

    let result = values
      .slice(0, period)
      .reduce((a, b) => a + b, 0) / period;

    for (let i = period; i < values.length; i++) {
      result = values[i] * multiplier +
        result * (1 - multiplier);
    }

    return result;
  }

  function calculateRSI(values, period = 14) {
    if (values.length <= period) return null;

    let gains = 0;
    let losses = 0;

    for (let i = values.length - period; i < values.length; i++) {
      const change = values[i] - values[i - 1];

      if (change > 0) gains += change;
      else losses -= change;
    }

    if (losses === 0) return 100;

    const rs = gains / losses;
    return 100 - (100 / (1 + rs));
  }

  function analyze(prices) {
    const values = prices.map(Number).filter(Number.isFinite);

    if (values.length < CONFIG.slowEMA + 2) {
      return {
        signal: "WAIT",
        message: "داده کافی برای تحلیل وجود ندارد"
      };
    }

    const fast = ema(values, CONFIG.fastEMA);
    const slow = ema(values, CONFIG.slowEMA);
    const rsi = calculateRSI(values, CONFIG.rsiPeriod);

    const previousFast = ema(
      values.slice(0, -1),
      CONFIG.fastEMA
    );

    const previousSlow = ema(
      values.slice(0, -1),
      CONFIG.slowEMA
    );

    let signal = "WAIT";
    let message = "شرایط ورود کامل نیست";

    if (
      previousFast <= previousSlow &&
      fast > slow &&
      rsi >= 50 &&
      rsi < 70
    ) {
      signal = "BUY";
      message = "سیگنال صعودی";
    }

    if (
      previousFast >= previousSlow &&
      fast < slow &&
      rsi <= 50 &&
      rsi > 30
    ) {
      signal = "SELL";
      message = "سیگنال نزولی";
    }

    state.signal = signal;

    return {
      signal,
      message,
      price: values[values.length - 1],
      emaFast: Number(fast.toFixed(6)),
      emaSlow: Number(slow.toFixed(6)),
      rsi: Number(rsi.toFixed(2)),
      mode: "PAPER_ONLY"
    };
  }

  function openTrade(side, price, symbol = "EURUSD") {
    price = Number(price);

    if (!state.running) {
      throw new Error("ابتدا ایجنت را فعال کنید");
    }

    if (state.position) {
      throw new Error("یک معامله باز وجود دارد");
    }

    if (!["BUY", "SELL"].includes(side)) {
      throw new Error("نوع معامله نامعتبر است");
    }

    if (!Number.isFinite(price) || price <= 0) {
      throw new Error("قیمت نامعتبر است");
    }

    const isBuy = side === "BUY";

    state.position = {
      id: Date.now(),
      symbol,
      side,
      entry: price,
      stopLoss: price * (
        isBuy
          ? 1 - CONFIG.stopLossPercent / 100
          : 1 + CONFIG.stopLossPercent / 100
      ),
      takeProfit: price * (
        isBuy
          ? 1 + CONFIG.takeProfitPercent / 100
          : 1 - CONFIG.takeProfitPercent / 100
      ),
      openedAt: new Date().toISOString(),
      status: "OPEN",
      mode: "PAPER_ONLY"
    };

    return state.position;
  }

  function closeTrade(price, reason = "MANUAL") {
    if (!state.position) {
      throw new Error("معامله بازی وجود ندارد");
    }

    price = Number(price);

    if (!Number.isFinite(price) || price <= 0) {
      throw new Error("قیمت خروج نامعتبر است");
    }

    const p = state.position;
    const direction = p.side === "BUY" ? 1 : -1;
    const pnlPercent =
      ((price - p.entry) / p.entry) * 100 * direction;

    const riskAmount =
      state.balance * CONFIG.riskPercent / 100;

    const pnl = riskAmount * pnlPercent /
      CONFIG.stopLossPercent;

    const trade = {
      ...p,
      exit: price,
      pnl: Number(pnl.toFixed(2)),
      pnlPercent: Number(pnlPercent.toFixed(3)),
      reason,
      status: "CLOSED",
      closedAt: new Date().toISOString()
    };

    state.balance += trade.pnl;
    state.trades.unshift(trade);
    state.position = null;

    return trade;
  }

  function checkPrice(price) {
    if (!state.position) return null;

    const p = state.position;
    price = Number(price);

    if (!Number.isFinite(price) || price <= 0) return null;

    const stopHit = p.side === "BUY"
      ? price <= p.stopLoss
      : price >= p.stopLoss;

    const targetHit = p.side === "BUY"
      ? price >= p.takeProfit
      : price <= p.takeProfit;

    if (stopHit) return closeTrade(price, "STOP_LOSS");
    if (targetHit) return closeTrade(price, "TAKE_PROFIT");

    return null;
  }

  function getStatus() {
    return JSON.parse(JSON.stringify({
      ...state,
      config: CONFIG,
      mode: "PAPER_ONLY"
    }));
  }

  window.HamrahTraderAgent = {
    start() {
      state.running = true;
      return getStatus();
    },

    stop() {
      state.running = false;
      return getStatus();
    },

    analyze,
    openTrade,
    closeTrade,
    checkPrice,
    getStatus,

    reset() {
      state = {
        running: false,
        balance: CONFIG.startingBalance,
        position: null,
        trades: [],
        signal: "WAIT"
      };

      return getStatus();
    }
  };

  console.log("Hamrah Trader AI Agent loaded successfully");

})();

