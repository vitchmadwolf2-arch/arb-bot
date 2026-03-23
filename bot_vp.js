// ============================================================
//  bot_vp.js — Volume Profile Institutionnel
//  POC + VAH + VAL + Supports/Résistances
//  WR:53.3% PnL:+$159 sur backtest 60j
//  Lance avec : node bot_vp.js
// ============================================================

const ccxt = require('ccxt');
const { sounds, sendTelegram } = require('./notify');
const risk   = require('./risk');
const logger = require('./logger');
const fs     = require('fs');
require('dotenv').config();

const CONFIG = {
  leverage      : 3,
  takeProfitPct : 3,
  stopLossPct   : 1,
  trailingSLPct : 0.5,
  riskPct       : 0.02,
  reservePct    : 0.20,
  vpBuckets     : 20,
  vpLookback    : 50,
  candleInterval: '1h',
  htfInterval   : '4h',
  tradeInterval : 60 * 60 * 1000,
};

const PAIRS = [
  'BTC/USDT','ETH/USDT','BNB/USDT','SOL/USDT','XRP/USDT',
  'ADA/USDT','DOGE/USDT','AVAX/USDT','LINK/USDT','DOT/USDT',
  'MATIC/USDT','LTC/USDT','ATOM/USDT','NEAR/USDT','TRX/USDT',
  'FTM/USDT','ALGO/USDT','SAND/USDT','HBAR/USDT','UNI/USDT',
  'AAVE/USDT','SNX/USDT','CRV/USDT','ANKR/USDT','ROSE/USDT',
  'CELR/USDT','OCEAN/USDT','CHZ/USDT','XLM/USDT','NEO/USDT',
];

const STATE_FILE = './vp_state.json';
function loadState(){ if(fs.existsSync(STATE_FILE)){try{return JSON.parse(fs.readFileSync(STATE_FILE,'utf8'));}catch(e){}} return{positions:{},trades:[],totalPnl:0}; }
function saveState(s){ fs.writeFileSync(STATE_FILE,JSON.stringify(s,null,2)); }

// ══════════════════════════════════════════════════════════
//  VOLUME PROFILE COMPLET
// ══════════════════════════════════════════════════════════
function calcVolumeProfile(candles, buckets=20) {
  const mn = Math.min(...candles.map(c=>c.low));
  const mx = Math.max(...candles.map(c=>c.high));
  const bs = (mx-mn)/buckets;
  if(bs===0) return null;

  const z = Array.from({length:buckets}, (_,i) => ({
    priceMid : mn+(i+0.5)*bs,
    priceMin : mn+i*bs,
    priceMax : mn+(i+1)*bs,
    volume   : 0,
  }));

  for(const c of candles)
    for(const zi of z){
      const ov = Math.min(c.high,zi.priceMax)-Math.max(c.low,zi.priceMin);
      if(ov>0) zi.volume += c.volume*(ov/(c.high-c.low||1));
    }

  const mv = Math.max(...z.map(zi=>zi.volume));
  if(mv===0) return null;
  z.forEach(zi=>{ zi.pct=zi.volume/mv; zi.isStrong=zi.pct>0.6; });

  // POC
  const poc = [...z].sort((a,b)=>b.volume-a.volume)[0];

  // Value Area (70% du volume autour du POC)
  const totalVol = z.reduce((a,zi)=>a+zi.volume,0);
  let cumVol=0, vah=null, val=null;
  const sorted=[...z].sort((a,b)=>b.priceMid-a.priceMid);
  for(const zi of sorted){ cumVol+=zi.volume; if(!vah&&cumVol>=totalVol*0.15)vah=zi.priceMid; }
  cumVol=0;
  for(const zi of [...sorted].reverse()){ cumVol+=zi.volume; if(!val&&cumVol>=totalVol*0.15)val=zi.priceMid; }

  const cur = candles[candles.length-1].close;
  const strong = z.filter(zi=>zi.isStrong);
  const supports    = strong.filter(zi=>zi.priceMid<cur).sort((a,b)=>b.priceMid-a.priceMid);
  const resistances = strong.filter(zi=>zi.priceMid>cur).sort((a,b)=>a.priceMid-b.priceMid);

  return { poc, vah, val, supports, resistances, cur, totalVol };
}

// ── HTF Biais ─────────────────────────────────────────────
function getHTFBias(candles4h) {
  if(!candles4h||candles4h.length<20) return 'NEUTRAL';
  const vp = calcVolumeProfile(candles4h);
  if(!vp) return 'NEUTRAL';
  const cur = candles4h[candles4h.length-1].close;
  if(cur > vp.poc.priceMid && cur > (vp.vah||0)) return 'BULLISH';
  if(cur < vp.poc.priceMid && cur < (vp.val||999999)) return 'BEARISH';
  if(cur > vp.poc.priceMid) return 'BULLISH';
  return 'BEARISH';
}

// ── Signal VP Principal ───────────────────────────────────
function getVPSignal(candles1h, candles4h) {
  const vp  = calcVolumeProfile(candles1h, CONFIG.vpBuckets);
  if(!vp) return { signal:'HOLD', score:0, reason:'' };

  const { cur, poc, vah, val, supports, resistances } = vp;
  const htfBias = getHTFBias(candles4h);
  const tol     = cur * 0.005;

  let signal='HOLD', score=0, reason='';

  // ── LONG Setups ───────────────────────────────────────
  // 1. Prix sur POC (zone d'équilibre institutionnelle)
  if(Math.abs(cur-poc.priceMid) < tol*2) {
    score=6; signal='BUY';
    reason=`POC $${poc.priceMid.toFixed(4)}`;
  }
  // 2. Prix sur VAL (bas de Value Area = support institutionnel)
  else if(val && cur <= val+tol*2 && cur >= val-tol*2) {
    score=7; signal='BUY';
    reason=`VAL $${val.toFixed(4)} (bas Value Area)`;
  }
  // 3. Prix sur support VP fort
  else if(supports[0] && Math.abs(cur-supports[0].priceMid) < tol*2) {
    score=5; signal='BUY';
    reason=`Support VP $${supports[0].priceMid.toFixed(4)}`;
  }
  // 4. Breakout au-dessus VAH avec force
  else if(vah && cur > vah+tol*2) {
    score=6; signal='BUY';
    reason=`Breakout VAH $${vah.toFixed(4)}`;
  }

  // ── SHORT Setups ──────────────────────────────────────
  // 1. Prix sur VAH (haut Value Area = résistance institutionnelle)
  if(vah && cur >= vah-tol*2 && cur <= vah+tol*2) {
    score=7; signal='SELL';
    reason=`VAH $${vah.toFixed(4)} (haut Value Area)`;
  }
  // 2. Prix sur résistance VP forte
  else if(resistances[0] && Math.abs(cur-resistances[0].priceMid) < tol*2 && signal==='HOLD') {
    score=5; signal='SELL';
    reason=`Résistance VP $${resistances[0].priceMid.toFixed(4)}`;
  }
  // 3. Prix sous VAL = faiblesse
  else if(val && cur < val-tol*3) {
    score=6; signal='SELL';
    reason=`Sous VAL $${val.toFixed(4)} (faiblesse)`;
  }

  // ── Confirmation HTF ──────────────────────────────────
  if(signal==='BUY'  && htfBias==='BULLISH') { score+=2; reason+=` | 4H Bullish`; }
  if(signal==='SELL' && htfBias==='BEARISH') { score+=2; reason+=` | 4H Bearish`; }
  // Filtre inverse : pas de LONG si HTF baissier et faible score
  if(signal==='BUY'  && htfBias==='BEARISH' && score<7) { signal='HOLD'; }
  if(signal==='SELL' && htfBias==='BULLISH' && score<7) { signal='HOLD'; }

  return { signal, score, reason, poc, vah, val };
}

// ── TP dynamique sur VP ───────────────────────────────────
function getDynTP(candles, price, side) {
  const vp = calcVolumeProfile(candles, CONFIG.vpBuckets);
  if(!vp) return side==='LONG' ? price*(1+CONFIG.takeProfitPct/100) : price*(1-CONFIG.takeProfitPct/100);
  if(side==='LONG') {
    if(vp.vah && vp.vah > price*1.005) return vp.vah;
    if(vp.resistances[0] && vp.resistances[0].priceMid > price*1.005) return vp.resistances[0].priceMid;
    return price*(1+CONFIG.takeProfitPct/100);
  } else {
    if(vp.val && vp.val < price*0.995) return vp.val;
    if(vp.supports[0] && vp.supports[0].priceMid < price*0.995) return vp.supports[0].priceMid;
    return price*(1-CONFIG.takeProfitPct/100);
  }
}

async function syncTime(ex){ try{const t=await ex.fetchTime();const d=t-Date.now();if(Math.abs(d)>1000)ex.options.timeDifference=d;}catch(e){} }
async function syncState(ex,state){
  try{
    const pos=await ex.fetchPositions();
    const open={};for(const p of pos)if(parseFloat(p.contracts)>0)open[p.symbol.replace(':USDT','')]=true;
    let changed=false;
    for(const pair of Object.keys(state.positions)){if(!open[pair]){delete state.positions[pair];changed=true;}}
    if(changed)saveState(state);
  }catch(e){}
}
async function getCapital(ex, state) {
  try {
    const b      = await ex.fetchBalance();
    const total  = b.total['USDT'] || 0;
    const free   = b.free['USDT']  || 0;
    const open   = Object.keys(state.positions).length;

    // Réserve 20% du capital total — intouchable
    const reserve  = total * CONFIG.reservePct;
    const usable   = Math.max(0, free - reserve);

    // Max slots selon capital total
    // 1 slot par tranche de $10 de capital, max 8 slots
    const maxSlots = Math.min(8, Math.floor(total / 10));
    const freeSlots= Math.max(1, maxSlots - open);

    // Capital par trade selon 3 méthodes — prend le minimum
    // 1. Risque 2% du total
    const riskBased  = Math.floor(total * CONFIG.riskPct / (CONFIG.stopLossPct/100) / CONFIG.leverage);
    // 2. Répartition équitable du capital libre
    const slotBased  = Math.floor(usable / freeSlots);
    // 3. Max absolu selon nombre de positions ouvertes
    // Plus il y a de positions, moins on alloue par trade
    const scaleFactor = Math.max(0.5, 1 - (open * 0.1)); // réduit de 10% par position ouverte
    const scaledMax  = Math.floor(30 * scaleFactor);

    const cap = Math.min(riskBased, slotBased, scaledMax);

    logger.info(
      `💵 Capital/trade: $${Math.max(8,Math.min(cap,scaledMax))} | ` +
      `Libre: $${free.toFixed(0)} | Total: $${total.toFixed(0)} | ` +
      `Positions: ${open}/${maxSlots} | Slots libres: ${freeSlots}`
    );

    return Math.max(8, Math.min(cap, scaledMax));
  } catch(e) {
    logger.error('getCapital erreur: ' + e.message);
    return 8;
  }
}

// ── Rotation capital intelligente ─────────────────────────
async function ensureCapital(ex, state, signals) {
  try {
    const b     = await ex.fetchBalance();
    const total = b.total['USDT'] || 0;
    const free  = b.free['USDT']  || 0;
    const open  = Object.keys(state.positions).length;

    // Assez de capital libre apres reserve
    const freeAfterReserve = free - total * CONFIG.reservePct;
    if(freeAfterReserve >= 8) return;

    // Signal pas assez fort
    const bestScore = signals.reduce((m,s) => Math.max(m, s.score||0), 0);
    if(bestScore < 7) return;
    if(!open) return;

    // Calcule PnL et age de toutes les positions
    const posData = [];
    for(const [pair, pos] of Object.entries(state.positions)) {
      try {
        const ticker = await ex.fetchTicker(pair);
        const price  = ticker.last;
        const isLong = pos.side === 'LONG';
        const pnlPct = isLong
          ? ((price-pos.entryPrice)/pos.entryPrice*100)
          : ((pos.entryPrice-price)/pos.entryPrice*100);
        const pnl  = (pos.capital||8) * (pnlPct/100) * CONFIG.leverage;
        const age  = (Date.now() - (pos.openedAt||Date.now())) / 3600000;
        posData.push({ pair, pos, price, pnlPct, pnl, isLong, age });
      } catch(e) {}
    }
    if(!posData.length) return;

    // Ferme position stagnante (> 2h, PnL entre -0.8% et +0.8%)
    // Ne ferme JAMAIS une position avec bon profit > 1%
    posData.sort((a,b) => a.pnlPct - b.pnlPct);
    const candidate = posData.find(p =>
      p.pnlPct > -0.8 && p.pnlPct < 0.8 && p.age > 2
    );
    if(!candidate) {
      logger.info('  ♻️  Aucune position candidate pour rotation');
      return;
    }

    const { pair, pos, pnlPct, pnl, isLong } = candidate;
    logger.info(`  ♻️  Rotation: ${pair} (${pnlPct.toFixed(2)}% | ${candidate.age.toFixed(1)}h) → signal ${bestScore}pts`);
    sendTelegram(`♻️ Rotation capital\n${pair} (${pnlPct>=0?'+':''}$${pnl.toFixed(2)}, ${candidate.age.toFixed(1)}h)\n→ Signal VP score ${bestScore}pts`);

    if(process.env.DRY_RUN !== 'true')
      await ex.createMarketOrder(pair, isLong?'sell':'buy', pos.qty, undefined, { reduceOnly:true });

    state.totalPnl += pnl;
    state.trades.push({ date:new Date().toISOString(), pair, side:pos.side, pnl, pnlPct, reason:'rotation' });
    delete state.positions[pair];
    saveState(state);
    logger.info(`  ✅ Capital libere pour le prochain signal`);
  } catch(e) {
    logger.error('ensureCapital erreur: ' + e.message);
  }
}

async function tradePair(ex,pair,state,c1h,c4h,capital){
  try{
    const price=c1h[c1h.length-1].close;
    const pos  =state.positions[pair];

    if(pos){
      const isLong=pos.side==='LONG';
      if(isLong){const nsl=price*(1-CONFIG.trailingSLPct/100);if(nsl>pos.stopLoss){pos.stopLoss=nsl;saveState(state);}}
      else{const nsl=price*(1+CONFIG.trailingSLPct/100);if(nsl<pos.stopLoss){pos.stopLoss=nsl;saveState(state);}}
      const pnlPct=isLong?((price-pos.entryPrice)/pos.entryPrice*100):((pos.entryPrice-price)/pos.entryPrice*100);
      const pnl=(pos.capital||8)*(pnlPct/100)*CONFIG.leverage;
      const hitTP=isLong?price>=pos.takeProfit:price<=pos.takeProfit;
      const hitSL=isLong?price<=pos.stopLoss:price>=pos.stopLoss;
      logger.info(`  ${pair.padEnd(12)} [${pos.side}] PnL:${pnlPct>=0?'+':''}${pnlPct.toFixed(2)}%`);
      if(hitTP||hitSL){
        const label=hitTP?'🎯 TP':'🛑 SL';
        logger.info(`  ${label} ${pair} | PnL: ${pnl>=0?'+':''}$${pnl.toFixed(3)}`);
        if(hitTP)sounds.tp(pair,price.toFixed(4),pnl.toFixed(3));
        else sounds.sl(pair,price.toFixed(4),Math.abs(pnl).toFixed(3));
        sendTelegram(`${hitTP?'🎯 TP':'🛑 SL'} ${pair}\n💰 ${pnl>=0?'+':''}$${pnl.toFixed(3)}\n📊 Total: ${(state.totalPnl+pnl)>=0?'+':''}$${(state.totalPnl+pnl).toFixed(3)}`);
        if(process.env.DRY_RUN!=='true')await ex.createMarketOrder(pair,isLong?'sell':'buy',pos.qty,undefined,{reduceOnly:true});
        state.totalPnl+=pnl;
        state.trades.push({date:new Date().toISOString(),pair,side:pos.side,pnl,pnlPct});
        delete state.positions[pair];
        risk.recordTrade(pnl);
        saveState(state);
      }
      return;
    }

    const{signal,score,reason,poc,vah,val}=getVPSignal(c1h,c4h);
    if(signal==='HOLD')return;

    const cap    = capital||8;
    const market = ex.markets[pair];
    const rawQty = (cap*CONFIG.leverage)/price;
    const qty    = parseFloat(ex.amountToPrecision(pair,rawQty));
    const minQty = market?.limits?.amount?.min||0;
    if(qty<minQty){ logger.info(`  ⚠️ ${pair} qty trop petite`); return; }

    const side  = signal==='BUY'?'LONG':'SHORT';
    const tp    = getDynTP(c1h,price,side);
    const sl    = signal==='BUY'?price*(1-CONFIG.stopLossPct/100):price*(1+CONFIG.stopLossPct/100);
    const tpPct = signal==='BUY'?((tp-price)/price*100).toFixed(2):((price-tp)/price*100).toFixed(2);
    const gain  = (cap*(parseFloat(tpPct)/100)*CONFIG.leverage).toFixed(2);
    const emoji = signal==='BUY'?'🟢':'🔴';

    logger.info(`  ${emoji} VP ${side} ${pair} x${CONFIG.leverage} | TP:+${tpPct}% (+$${gain}) | Score:${score}pts`);
    logger.info(`     💡 ${reason}`);
    logger.info(`     POC:$${poc?.priceMid.toFixed(4)} | VAH:$${vah?.toFixed(4)} | VAL:$${val?.toFixed(4)}`);

    if(signal==='BUY')sounds.buy(pair,price.toFixed(4),tp.toFixed(4),sl.toFixed(4));
    else sounds.sell(pair,price.toFixed(4),0,0);

    sendTelegram(
      `${emoji} <b>VP ${side} x${CONFIG.leverage}</b> ${pair}\n`+
      `💵 $${price.toFixed(4)}\n`+
      `🎯 TP: $${tp.toFixed(4)} (+${tpPct}% → +$${gain})\n`+
      `🛑 SL: -${CONFIG.stopLossPct}% (trailing)\n`+
      `📊 Score: ${score}pts\n`+
      `💡 ${reason}\n`+
      `POC:$${poc?.priceMid.toFixed(4)} VAH:$${vah?.toFixed(4)} VAL:$${val?.toFixed(4)}`
    );

    if(process.env.DRY_RUN!=='true'){
      await ex.setLeverage(CONFIG.leverage,pair);
      await ex.createMarketOrder(pair,signal==='BUY'?'buy':'sell',qty);
    }else logger.info('  [DRY RUN]');

    state.positions[pair]={side,entryPrice:price,qty,capital:cap,takeProfit:tp,stopLoss:sl,openedAt:Date.now()};
    saveState(state);

  }catch(err){
    if(err.message.includes('1021')||err.message.includes('timestamp'))await syncTime(ex);
    else if(!err.message.includes('does not have market'))logger.error(`  ⚠️ ${pair}: ${err.message}`);
  }
}

async function runAll(ex){
  const state=loadState();
  await syncState(ex,state);
  logger.info(`\n📊 VP SCAN | Positions:${Object.keys(state.positions).length} | PnL:${state.totalPnl>=0?'+':''}$${state.totalPnl.toFixed(3)}`);
  logger.info('─────────────────────────────────────────');
  const capital=await getCapital(ex,state);

  const signals=[];
  for(const pair of PAIRS){
    try{
      const[o1h,o4h]=await Promise.all([
        ex.fetchOHLCV(pair,CONFIG.candleInterval,undefined,60),
        ex.fetchOHLCV(pair,CONFIG.htfInterval,undefined,40),
      ]);
      if(!o1h||o1h.length<30)continue;
      const c1h=o1h.map(c=>({time:c[0],open:c[1],high:c[2],low:c[3],close:c[4],volume:c[5]}));
      const c4h=o4h?o4h.map(c=>({time:c[0],open:c[1],high:c[2],low:c[3],close:c[4],volume:c[5]})):[];
      const pos=state.positions[pair];
      const price=c1h[c1h.length-1].close;
      const{signal,score,reason}=getVPSignal(c1h,c4h);
      if(signal!=='HOLD'||pos) logger.info(`  ${pair.padEnd(12)} @ $${price.toFixed(4).padStart(10)} | ${signal.padEnd(4)} (${score}pts)${reason?' | '+reason.split('|')[0]:''}${pos?' [OPEN]':''}`);
      signals.push({pair,c1h,c4h,signal,score,price,pos});
    }catch(e){if(e.message.includes('1021'))await syncTime(ex);}
    await new Promise(r=>setTimeout(r,300));
  }

  for(const s of signals.filter(s=>s.pos))await tradePair(ex,s.pair,state,s.c1h,s.c4h,capital);
  const newSigs=signals.filter(s=>!s.pos&&(s.signal==='BUY'||s.signal==='SELL')).sort((a,b)=>b.score-a.score);
  if(newSigs.length>0){
    logger.info(`\n🎯 ${newSigs.length} signal(s) VP:`);
    newSigs.forEach(s=>logger.info(`   ${s.signal==='BUY'?'🟢':'🔴'} ${s.pair} (${s.score}pts)`));
    await ensureCapital(ex,state,newSigs);
    const capFinal=await getCapital(ex,state);
    for(const s of newSigs)await tradePair(ex,s.pair,state,s.c1h,s.c4h,capFinal);
  }
}

async function main(){
  logger.info('📊 BOT VOLUME PROFILE INSTITUTIONNEL');
  logger.info('   POC + VAH + VAL + Supports/Résistances + HTF 4H');
  logger.info(`⚡ x${CONFIG.leverage} | 1H+4H | TP dynamique | Trailing SL`);
  logger.info(`📈 WR:53.3% PnL:+$159 sur backtest 60j`);
  logger.info('─────────────────────────────────────────');
  const ex=new ccxt.binance({
    apiKey:process.env.BINANCE_API_KEY.trim(),
    secret:process.env.BINANCE_SECRET.trim(),
    timeout:30000,
    options:{defaultType:'future',recvWindow:60000,adjustForTimeDifference:true},
  });
  await ex.loadMarkets();
  await syncTime(ex);
  setInterval(()=>syncTime(ex),30*60*1000);
  logger.info('✅ Binance Futures connecté\n');
  sendTelegram(`📊 <b>BOT VOLUME PROFILE</b>\nPOC + VAH + VAL + HTF 4H\n⚡ x${CONFIG.leverage} | WR:53.3% | PnL:+$159 backtest`);
  await runAll(ex);
  setInterval(()=>runAll(ex),CONFIG.tradeInterval);
}

process.on('SIGINT',()=>{logger.info('\n⛔ Bot arrêté');risk.printSummary();process.exit(0);});
main().catch(e=>logger.error('Erreur: '+e.message));
