
cat > /home/claude/arb-bot/notify_linux.js << 'EOF'
// notify.js — Compatible Linux/Render (sans powershell)
const https = require('https');
require('dotenv').config();

function sendTelegram(msg) {
  try {
    const token  = process.env.TELEGRAM_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;
    if(!token || !chatId) return;
    const text = encodeURIComponent(msg);
    const url  = `https://api.telegram.org/bot${token}/sendMessage?chat_id=${chatId}&text=${text}&parse_mode=HTML`;
    https.get(url, ()=>{}).on('error', ()=>{});
  } catch(e) {}
}

const sounds = {
  buy  : (pair, price, tp, sl) => sendTelegram(`🟢 BUY ${pair}\n💵 $${price}\n🎯 TP: $${tp}\n🛑 SL: $${sl}`),
  sell : (pair, price, tp, sl) => sendTelegram(`🔴 SELL ${pair}\n💵 $${price}`),
  tp   : (pair, price, pnl)    => sendTelegram(`🎯 TAKE PROFIT ${pair}\n💵 $${price}\n💰 +$${pnl}`),
  sl   : (pair, price, pnl)    => sendTelegram(`🛑 STOP LOSS ${pair}\n💵 $${price}\n💸 -$${pnl}`),
};

module.exports = { sendTelegram, sounds };
EOF
cp /home/claude/arb-bot/notify_linux.js /mnt/user-data/outputs/arb-bot/notify.js
echo "OK
