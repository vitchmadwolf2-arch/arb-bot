// ============================================================
//  logger.js — Logs console + fichier horodatés
// ============================================================

const fs   = require('fs');
const path = require('path');

const LOG_FILE = path.join(__dirname, 'bot.log');

function timestamp() {
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}

function write(level, msg) {
  const line = `[${timestamp()}] [${level}] ${msg}`;
  console.log(line);
  fs.appendFileSync(LOG_FILE, line + '\n');
}

module.exports = {
  info  : (msg) => write('INFO ', msg),
  warn  : (msg) => write('WARN ', msg),
  error : (msg) => write('ERROR', msg),
  debug : (msg) => { if (process.env.DEBUG === 'true') write('DEBUG', msg); },
};
