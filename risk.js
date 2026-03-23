// ============================================================
//  risk.js — Gestionnaire de risques
//  CRITIQUE : ce fichier protège ton capital.
//  Lis chaque paramètre et ajuste selon ta tolérance.
// ============================================================

const logger = require('./logger');

// ══════════════════════════════════════════════════════════
//  ⚙️  PARAMÈTRES — MODIFIE ICI
// ══════════════════════════════════════════════════════════

// Capital max utilisé par trade (en USDT)
// Avec < $500, commence par 20-50$ par trade max
const MAX_CAPITAL_USDT = 50;

// Profit minimum pour déclencher un trade (en %)
// En dessous de 0.5%, les frais + slippage annulent le profit
const MIN_PROFIT_PCT = 0.5;

// Perte maximale journalière (en USDT)
// Si atteinte → le bot s'arrête automatiquement
const MAX_DAILY_LOSS_USDT = 30;

// Profit journalier cible (en USDT)
// Optionnel : arrêt automatique si atteint
const DAILY_PROFIT_TARGET_USDT = 15;

// Nombre max de trades par heure
// Protège contre les boucles infinies en cas de bug
const MAX_TRADES_PER_HOUR = 10;

// Délai minimum entre 2 trades (ms)
// Évite les ordres en rafale
const MIN_TRADE_INTERVAL_MS = 5000;

// Frais estimés par exchange (en %)
// Binance: 0.1%, Kraken: 0.16% — vérifie sur ton compte
const FEES = {
  binance : 0.10,
  kraken  : 0.16,
  coinbase: 0.20,
  bybit   : 0.10,
};

// ══════════════════════════════════════════════════════════
//  État interne (ne pas modifier)
// ══════════════════════════════════════════════════════════

let state = {
  dailyPnl      : 0,       // PnL du jour en USDT
  totalPnl      : 0,       // PnL total
  tradesCount   : 0,       // nombre total de trades
  tradesThisHour: 0,       // trades cette heure
  wins          : 0,
  losses        : 0,
  lastTradeAt   : 0,       // timestamp dernier trade
  lastHourReset : Date.now(),
  blocked       : false,   // true si le bot est bloqué (perte max)
};

// ── Vérifie si un trade est autorisé ───────────────────────
function canTrade(estimatedProfit) {
  const now = Date.now();

  // Reset compteur horaire si besoin
  if (now - state.lastHourReset > 3600_000) {
    state.tradesThisHour = 0;
    state.lastHourReset  = now;
  }

  // Bot bloqué suite à une perte max
  if (state.blocked) {
    logger.warn('🔒 Bot bloqué : perte journalière maximale atteinte');
    return false;
  }

  // Perte journalière max atteinte
  if (state.dailyPnl <= -MAX_DAILY_LOSS_USDT) {
    logger.warn(`🛑 Perte journalière max atteinte ($${MAX_DAILY_LOSS_USDT})`);
    state.blocked = true;
    return false;
  }

  // Objectif journalier atteint
  if (state.dailyPnl >= DAILY_PROFIT_TARGET_USDT) {
    logger.info(`🎯 Objectif journalier atteint : +$${state.dailyPnl.toFixed(2)}`);
    return false;
  }

  // Trop de trades cette heure
  if (state.tradesThisHour >= MAX_TRADES_PER_HOUR) {
    logger.warn(`⏱ Limite horaire atteinte (${MAX_TRADES_PER_HOUR} trades/h)`);
    return false;
  }

  // Intervalle minimum entre trades
  if (now - state.lastTradeAt < MIN_TRADE_INTERVAL_MS) {
    return false;
  }

  return true;
}

// ── Calcule le profit net RÉEL (après frais) ───────────────
// Prend en compte frais d'achat + frais de vente + slippage estimé
function calcNetProfit(buyEx, sellEx, buyPrice, sellPrice, capitalUsdt) {
  const qty      = capitalUsdt / buyPrice;
  const grossRev = qty * sellPrice;

  // Frais en USDT
  const feeBuy  = capitalUsdt  * (FEES[buyEx]  || 0.2) / 100;
  const feeSell = grossRev     * (FEES[sellEx] || 0.2) / 100;

  // Slippage estimé (0.1% — marché illiquide = augmenter)
  const slippage = capitalUsdt * 0.001;

  const netProfit = grossRev - capitalUsdt - feeBuy - feeSell - slippage;
  const netPct    = (netProfit / capitalUsdt) * 100;

  return { netProfit, netPct, qty };
}

// ── Enregistre le résultat d'un trade ──────────────────────
function recordTrade(pnl) {
  state.dailyPnl    += pnl;
  state.totalPnl    += pnl;
  state.tradesCount += 1;
  state.tradesThisHour += 1;
  state.lastTradeAt  = Date.now();

  if (pnl >= 0) state.wins++;
  else          state.losses++;

  const winRate = state.tradesCount > 0
    ? Math.round((state.wins / state.tradesCount) * 100)
    : 0;

  logger.info(`📊 PnL jour: ${state.dailyPnl >= 0 ? '+' : ''}$${state.dailyPnl.toFixed(2)} | Total: ${state.totalPnl >= 0 ? '+' : ''}$${state.totalPnl.toFixed(2)} | Win rate: ${winRate}%`);
}

// ── Résumé final ────────────────────────────────────────────
function printSummary() {
  const winRate = state.tradesCount > 0
    ? Math.round((state.wins / state.tradesCount) * 100)
    : 0;

  console.log('\n══════════════════════════════════');
  console.log('  RÉSUMÉ DE SESSION');
  console.log('══════════════════════════════════');
  console.log(`  Trades        : ${state.tradesCount}`);
  console.log(`  Gagnants      : ${state.wins} (${winRate}%)`);
  console.log(`  Perdants      : ${state.losses}`);
  console.log(`  PnL session   : ${state.dailyPnl >= 0 ? '+' : ''}$${state.dailyPnl.toFixed(2)}`);
  console.log(`  PnL total     : ${state.totalPnl >= 0 ? '+' : ''}$${state.totalPnl.toFixed(2)}`);
  console.log('══════════════════════════════════\n');
}

module.exports = {
  MAX_CAPITAL_USDT,
  MIN_PROFIT_PCT,
  canTrade,
  calcNetProfit,
  recordTrade,
  printSummary,
  getState: () => ({ ...state }),
};
