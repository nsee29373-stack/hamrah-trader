/* HAMRAH TRADER - PAPER TRADING AGENT
   EMA 9/21 + RSI 14 | Simulation only | No broker orders.
*/
(function(){
"use strict";
const CONFIG={fastEMA:9,slowEMA:21,rsiPeriod:14,startingBalance:10000};
let state={running:false,balance:CONFIG.startingBalance,position:null,trades:[],signal:"WAIT"};
function ema(values,period){if(values.length<period)return null;const k=2/(period+1);let v=values.slice(0,period).reduce((a,b)=>a+b,0)/period;for(let i=period;i<values.length;i++)v=values[i]*k+v*(1-k);return v;}
function rsi(values,period){if(values.length<=period)return null;let gain=0,loss=0;for(let i=values.length-period;i<values.length;i++){const d=values[i]-values[i-1];if(d>0)gain+=d;else loss-=d;}if(loss===0)return gain===0?50:100;if(gain===0)return 0;const rs=gain/loss;return 100-100/(1+rs);}
function analyze(prices){const v=(Array.isArray(prices)?prices:[]).map(Number).filter(x=>Number.isFinite(x)&&x>0);if(v.length<CONFIG.slowEMA+2){state.signal="WAIT";return {signal:"WAIT",message:"برای محاسبه EMA 9/21 حداقل ۲۳ قیمت لازم است. داده کندل‌های اخیر در حال تکمیل است.",confidence:null,emaFast:null,emaSlow:null,rsi:null,samples:v.length,required:23};}
const fast=ema(v,9),slow=ema(v,21),r=rsi(v,14),pf=ema(v.slice(0,-1),9),ps=ema(v.slice(0,-1),21);let signal="WAIT",message="هنوز شرایط ورود کامل نیست.",confidence=35;
const trend=Math.abs((fast-slow)/slow)*100;
if(pf<=ps&&fast>slow&&r>=50&&r<70){signal="BUY";message="تقاطع صعودی EMA با تأیید RSI شناسایی شد.";confidence=Math.min(95,60+trend*8+(r-50)*0.6);}
else if(pf>=ps&&fast<slow&&r<=50&&r>30){signal="SELL";message="تقاطع نزولی EMA با تأیید RSI شناسایی شد.";confidence=Math.min(95,60+trend*8+(50-r)*0.6);}
else if(r>=70){message="RSI در محدوده اشباع خرید است؛ از ورود عجولانه پرهیز کنید.";confidence=55;}
else if(r<=30){message="RSI در محدوده اشباع فروش است؛ احتمال نوسان برگشتی وجود دارد.";confidence=55;}
state.signal=signal;return {signal,message,confidence:Math.round(confidence),price:v[v.length-1],emaFast:fast,emaSlow:slow,rsi:r,samples:v.length,required:23,mode:"PAPER_ONLY"};}
function openTrade(side,price,symbol,options){options=options||{};price=Number(price);const qty=Number(options.qty),sl=Number(options.sl),tp=Number(options.tp);if(!state.running)throw Error("موتور معاملات آزمایشی فعال نیست.");if(state.position)throw Error("ابتدا موقعیت باز فعلی را ببندید.");if(side!=="BUY"&&side!=="SELL")throw Error("جهت معامله نامعتبر است.");if(!Number.isFinite(price)||price<=0)throw Error("قیمت ورود معتبر نیست.");if(!Number.isFinite(qty)||qty<=0)throw Error("حجم معامله معتبر نیست.");if(!Number.isFinite(sl)||sl<0.1||sl>20||!Number.isFinite(tp)||tp<0.1||tp>50)throw Error("درصد حد ضرر یا حد سود نامعتبر است.");
const buy=side==="BUY";state.position={id:Date.now(),symbol:String(symbol||""),side,entry:price,qty,stopLoss:price*(buy?1-sl/100:1+sl/100),takeProfit:price*(buy?1+tp/100:1-tp/100),slPercent:sl,tpPercent:tp,openedAt:new Date().toISOString(),status:"OPEN",mode:"PAPER_ONLY"};return JSON.parse(JSON.stringify(state.position));}
function closeTrade(price,reason){if(!state.position)throw Error("موقعیت بازی وجود ندارد.");price=Number(price);if(!Number.isFinite(price)||price<=0)throw Error("قیمت خروج معتبر نیست.");const p=state.position,direction=p.side==="BUY"?1:-1;const pnl=(price-p.entry)*p.qty*direction;const pct=((price-p.entry)/p.entry)*100*direction;const trade={...p,exit:price,pnl:Number(pnl.toFixed(8)),pnlPercent:Number(pct.toFixed(4)),reason:reason||"MANUAL",status:"CLOSED",closedAt:new Date().toISOString(),mode:"PAPER_ONLY"};state.balance+=trade.pnl;state.trades.unshift(trade);state.position=null;return JSON.parse(JSON.stringify(trade));}
function checkPrice(price,symbol){const p=state.position;if(!p||String(symbol||p.symbol)!==p.symbol)return null;price=Number(price);if(!Number.isFinite(price)||price<=0)return null;const stop=p.side==="BUY"?price<=p.stopLoss:price>=p.stopLoss;const target=p.side==="BUY"?price>=p.takeProfit:price<=p.takeProfit;if(stop)return closeTrade(price,"STOP_LOSS");if(target)return closeTrade(price,"TAKE_PROFIT");return null;}
function getStatus(){return JSON.parse(JSON.stringify({...state,config:CONFIG,mode:"PAPER_ONLY",realTradingEnabled:false}));}
window.HamrahTraderAgent={start(){state.running=true;return getStatus();},stop(){state.running=false;return getStatus();},analyze,openTrade,closeTrade,checkPrice,getStatus,reset(){state={running:false,balance:CONFIG.startingBalance,position:null,trades:[],signal:"WAIT"};return getStatus();}};
console.log("Hamrah Trader PAPER agent ready.");
})();
