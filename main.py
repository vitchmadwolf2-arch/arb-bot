from flask import Flask
import threading
import time
import ccxt
import os
import pandas as pd
import numpy as np

app = Flask(__name__)

# 🔐 VARIABLES D’ENV (Render)
API_KEY = os.environ.get("aNDnQaPjdbyaB2TNsgWZiGH6yGMwXZfmNaZjLVoBmN1Gm87FGY4BwHLsFgstE4GY")
SECRET_KEY = os.environ.get("NjlozkWyvwXGsdkRiTrGSxOTtSw4CrJgjzjYme2PAGhPEYju6aFbUr6AaZ8xLwsT")

# 🚀 EXCHANGE FUTURES
exchange = ccxt.binance({
    'apiKey': API_KEY,
    'secret': SECRET_KEY,
    'enableRateLimit': True,
    'options': {'defaultType': 'future'},
})

symbol = 'BTC/USDT:USDT'

# ⚙️ PARAMÈTRES
RISK_PER_TRADE = 0.01
MIN_BALANCE = 10

# 📊 DATA
def get_data():
    ohlcv = exchange.fetch_ohlcv(symbol, '5m', limit=200)
    df = pd.DataFrame(ohlcv, columns=['time','open','high','low','close','volume'])
    return df

# 📈 EMA
def ema(series, period):
    return series.ewm(span=period).mean()

# 🧠 STRUCTURE
def break_of_structure(df):
    if df['close'].iloc[-1] > df['high'].iloc[-3]:
        return "bullish"
    if df['close'].iloc[-1] < df['low'].iloc[-3]:
        return "bearish"
    return None

# 🐋 LIQUIDITY SWEEP
def detect_sweep(df):
    if df['low'].iloc[-1] < df['low'].iloc[-2]:
        return "sweep_low"
    if df['high'].iloc[-1] > df['high'].iloc[-2]:
        return "sweep_high"
    return None

# 📊 VOLATILITY FILTER
def volatility_ok(df):
    atr = (df['high'] - df['low']).rolling(14).mean().iloc[-1]
    return atr > 0

# 💰 POSITION SIZE
def get_trade_size(balance, price):
    risk_amount = balance * RISK_PER_TRADE
    return risk_amount / price

# 🛑 STOP LOSS / TAKE PROFIT
def set_sl_tp(side, price):
    if side == "buy":
        sl = price * 0.99
        tp = price * 1.02
    else:
        sl = price * 1.01
        tp = price * 0.98

    return sl, tp

# 🤖 BOT
def run_bot():
    while True:
        try:
            balance = exchange.fetch_balance()['USDT']['free']

            if balance < MIN_BALANCE:
                print("⚠️ Balance trop faible")
                time.sleep(60)
                continue

            df = get_data()

            df['ema200'] = ema(df['close'], 200)

            price = df['close'].iloc[-1]
            ema200 = df['ema200'].iloc[-1]

            sweep = detect_sweep(df)
            bos = break_of_structure(df)

            if not volatility_ok(df):
                print("Marché pas exploitable")
                time.sleep(30)
                continue

            trade_size = get_trade_size(balance, price)

            print(f"\nPrice: {price} | EMA200: {ema200}")

            # 🟢 BUY
            if sweep == "sweep_low" and bos == "bullish" and price > ema200:
                print("🔥 BUY")

                exchange.create_market_buy_order(symbol, trade_size)

                sl, tp = set_sl_tp("buy", price)

                print(f"SL: {sl} | TP: {tp}")

            # 🔴 SELL
            elif sweep == "sweep_high" and bos == "bearish" and price < ema200:
                print("🔥 SELL")

                exchange.create_market_sell_order(symbol, trade_size)

                sl, tp = set_sl_tp("sell", price)

                print(f"SL: {sl} | TP: {tp}")

            time.sleep(30)

        except Exception as e:
            print("Erreur:", str(e))
            time.sleep(10)

# 🌐 FLASK
@app.route("/")
def home():
    return "Bot Futures actif 🚀"

# 🚀 START
if __name__ == "__main__":
    threading.Thread(target=run_bot).start()
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 10000)))
