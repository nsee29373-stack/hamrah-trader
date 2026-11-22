
/* HAMRAH TRADER AI AGENT
   Strategy: EMA 9/21 + RSI 14
   Trading: PAPER ONLY
   No broker connection and no real orders.
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
    let result = values.slice(0, period)
      .reduce((a, b) => a + b, 0) / period;

    for (let i = period; i < values.length; i++) {
      result = values[i] * multiplier +
        result * (1 - multiplier);
    }

    return result;
  }

  function calculateRSI(values, period) {
    if (values.length <= period) return null;

    let gains = 0;
    let losses = 0;

    for (let i = values.length - period; i < values.length; i++) {
      const change = values[i] - values[i - 1];
      if (change > 0) gains += change;
      else losses -= change;
    }

    if (losses === 0) return gains === 0 ? 50 : 100;
    if (gains === 0) return 0;

    const rs = gains / losses;
    return 100 - (100 / (1 + rs));
  }

  function analyze(prices) {
    const values = prices
      .map(Number)
      .filter(value => Number.isFinite(value) && value > 0);

    if (values.length < CONFIG.slowEMA + 2) {
      state.signal = "WAIT";
      return {
        signal: "WAIT",
        message: "برای تحلیل EMA 9/21 حداقل ۲۳ نمونه قیمت لازم است.",
        samples: values.length,
        required: CONFIG.slowEMA + 2,
        mode: "PAPER_ONLY"
      };
    }

    const fast = ema(values, CONFIG.fastEMA);
    const slow = ema(values, CONFIG.slowEMA);
    const rsi = calculateRSI(values, CONFIG.rsiPeriod);

    const previousFast = ema(values.slice(0, -1), CONFIG.fastEMA);
    const previousSlow = ema(values.slice(0, -1), CONFIG.slowEMA);

    let signal = "WAIT";
    let message = "شرایط ورود کامل نیست.";

    if (
      previousFast <= previousSlow &&
      fast > slow &&
      rsi >= 50 &&
      rsi < 70
    ) {
      signal = "BUY";
      message = "تقاطع صعودی EMA همراه با تأیید RSI مشاهده شد.";
    } else if (
      previousFast >= previousSlow &&
      fast < slow &&
      rsi <= 50 &&
      rsi > 30
    ) {
      signal = "SELL";
      message = "تقاطع نزولی EMA همراه با تأیید RSI مشاهده شد.";
    } else if (rsi >= 70) {
      message = "RSI در محدوده اشباع خرید است؛ از ورود عجولانه خودداری کنید.";
    } else if (rsi <= 30) {
      message = "RSI در محدوده اشباع فروش است؛ احتمال نوسان برگشتی وجود دارد.";
    }

    state.signal = signal;

    return {
      signal,
      message,
      price: values[values.length - 1],
      emaFast: Number(fast.toFixed(6)),
      emaSlow: Number(slow.toFixed(6)),
      rsi: Number(rsi.toFixed(2)),
      samples: values.length,
      mode: "PAPER_ONLY"
    };
  }

  function openTrade(side, price, symbol) {
    price = Number(price);

    if (!state.running) {
      throw new Error("ایجنت فعال نیست.");
    }

    if (state.position) {
      throw new Error("ابتدا معامله باز فعلی را ببندید.");
    }

    if (side !== "BUY" && side !== "SELL") {
      throw new Error("نوع معامله نامعتبر است.");
    }

    if (!Number.isFinite(price) || price <= 0) {
      throw new Error("قیمت ورود نامعتبر است.");
    }

    const isBuy = side === "BUY";
    const riskAmount = state.balance * CONFIG.riskPercent / 100;

    state.position = {
      id: Date.now(),
      symbol: String(symbol || "EURUSD"),
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
      riskAmount,
      openedAt: new Date().toISOString(),
      status: "OPEN",
      mode: "PAPER_ONLY"
    };

    return state.position;
  }

  function closeTrade(price, reason) {
    if (!state.position) {
      throw new Error("معامله بازی وجود ندارد.");
    }

    price = Number(price);

    if (!Number.isFinite(price) || price <= 0) {
      throw new Error("قیمت خروج نامعتبر است.");
    }

    const p = state.position;
    const direction = p.side === "BUY" ? 1 : -1;

    const pnlPercent =
      ((price - p.entry) / p.entry) * 100 * direction;

    /*
      P&L is an illustrative estimate based on percentage risk.
      It is NOT broker-calculated profit and does not include
      contract size, spread, commission, swap or conversion.
    */
    const pnlEstimate =
      p.riskAmount * pnlPercent / CONFIG.stopLossPercent;

    const trade = {
      ...p,
      exit: price,
      pnl: Number(pnlEstimate.toFixed(2)),
      pnlPercent: Number(pnlPercent.toFixed(4)),
      reason: reason || "MANUAL",
      status: "CLOSED",
      closedAt: new Date().toISOString(),
      mode: "PAPER_ONLY"
    };

    state.balance += trade.pnl;
    state.trades.unshift(trade);
    state.position = null;

    return trade;
  }

  function checkPrice(price) {
    if (!state.position) return null;

    price = Number(price);
    if (!Number.isFinite(price) || price <= 0) return null;

    const p = state.position;

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
      mode: "PAPER_ONLY",
      realTradingEnabled: false
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

  console.log("Hamrah Trader PAPER agent loaded successfully.");
})();
