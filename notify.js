// ============================================================
//  notify.js — Notifications Telegram + Windows
// ============================================================

const https    = require('https');
const { execSync } = require('child_process');
require('dotenv').config();

const TOKEN   = process.env.TELEGRAM_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

// ── Envoie un message Telegram ───────────────────────────
function sendTelegram(message) {
  if (!TOKEN || !CHAT_ID) return;

  const body = JSON.stringify({
    chat_id: CHAT_ID,
    text: message,
    parse_mode: 'HTML',
  });

  const options = {
    hostname: 'api.telegram.org',
    path    : `/bot${TOKEN}/sendMessage`,
    method  : 'POST',
    headers : {
      'Content-Type'  : 'application/json',
      'Content-Length': Buffer.byteLength(body),
    },
  };

  const req = https.request(options, (res) => {
    if (res.statusCode !== 200) {
      console.error(`Telegram erreur: ${res.statusCode}`);
    }
  });

  req.on('error', (e) => console.error(`Telegram: ${e.message}`));
  req.write(body);
  req.end();
}

// ── Son Windows ──────────────────────────────────────────
// notifications Windows désactivées sur Linux

// ── Notifications ────────────────────────────────────────
const sounds = {
  buy: (pair, price, tp, sl) => {
    playSound('buy');
    sendTelegram(
      `🟢 <b>ACHAT</b>\n` +
      `💱 Paire : ${pair}\n` +
      `💵 Prix  : $${price}\n` +
      `🎯 TP    : $${tp} (+3%)\n` +
      `🛑 SL    : $${sl} (-2%)`
    );
  },

  sell: (pair, price, pnl, pnlPct) => {
    playSound('sell');
    sendTelegram(
      `🔴 <b>VENTE</b>\n` +
      `💱 Paire : ${pair}\n` +
      `💵 Prix  : $${price}\n` +
      `📊 PnL   : ${pnl >= 0 ? '+' : ''}$${pnl} (${pnlPct >= 0 ? '+' : ''}${pnlPct}%)`
    );
  },

  tp: (pair, price, pnl) => {
    playSound('profit');
    sendTelegram(
      `🎯 <b>TAKE PROFIT !</b>\n` +
      `💱 Paire  : ${pair}\n` +
      `💵 Prix   : $${price}\n` +
      `💰 Profit : +$${pnl}`
    );
  },

  sl: (pair, price, pnl) => {
    playSound('sell');
    sendTelegram(
      `🛑 <b>STOP LOSS</b>\n` +
      `💱 Paire : ${pair}\n` +
      `💵 Prix  : $${price}\n` +
      `📉 Perte : $${pnl}`
    );
  },

  status: (pair, price, pnlPct, totalPnl) => {
    sendTelegram(
      `📊 <b>Status ARB//BOT</b>\n` +
      `💱 ${pair} @ $${price}\n` +
      `📈 Position : ${pnlPct >= 0 ? '+' : ''}${pnlPct}%\n` +
      `💰 PnL total : ${totalPnl >= 0 ? '+' : ''}$${totalPnl}`
    );
  },

  started: () => {
    sendTelegram(
      `🤖 <b>ARB//BOT démarré</b>\n` +
      `✅ Connecté à Binance\n` +
      `📊 Stratégie : MA + RSI + Volume Profile\n` +
      `⏱ Scan toutes les 15 minutes`
    );
  },
};

module.exports = { sounds, sendTelegram };
