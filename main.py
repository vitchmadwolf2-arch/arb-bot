from flask import Flask
import threading
import time
import ccxt
import os
import pandas as pd
import numpy as np

app = Flask(__name__)

API_KEY = os.environ.get("aNDnQaPjdbyaB2TNsgWZiGH6yGMwXZfmNaZjLVoBmN1Gm87FGY4BwHLsFgstE4GY")
SECRET_KEY = os.environ.get("NjlozkWyvwXGsdkRiTrGSxOTtSw4CrJgjzjYme2PAGhPEYju6aFbUr6AaZ8xLwsT")

exchange = ccxt.binance({
    'apiKey': API_KEY,
    'secret': SECRET_KEY,
    'enableRateLimit': True,
})

# 📊 DATA
def get_data():
    ohlcv = exchange.fetch_ohlcv('BTC/USDT', timeframe='5m', limit=200)
    df = pd.DataFrame(ohlcv, columns=['time','open','high','low','close','volume'])
    return df

# 📈 EMA
def ema(series, period):
    return series.ewm(span=period).mean()

# 📊 VOLUME PROFILE
def volume_profile(df, bins=30):
    price = df['close']
    volume = df['volume']

    hist, edges = np.histogram(price, bins=bins, weights=volume)

    poc_index = np.argmax(hist)
    poc = (edges[poc_index] + edges[poc_index+1]) / 2

    vah = np.percentile(price, 70)
    val = np.percentile(price, 30)

    return poc, vah, val

# 🐋 SWEEP
def detect_sweep(df):
    if df['high'].iloc[-1] > df['high'].iloc[-2]:
        return "sweep_high"
    if df['low'].iloc[-1] < df['low'].iloc[-2]:
        return "sweep_low"
    return None

# 📊 BOS
def break_of_structure(df):
    if df['close'].iloc[-1] > df['high'].iloc[-3]:
        return "bullish"
    if df['close'].iloc[-1] < df['low'].iloc[-3]:
        return "bearish"
    return None

# 📉 LIQUIDATION (approximation)
def detect_liquidation(df):
    volume = df['volume']
    if volume.iloc[-1] > volume.rolling(20).mean().iloc[-1] * 2:
        return True
    return False

# 📦 ORDER BOOK
def get_orderbook():
    ob = exchange.fetch_order_book('BTC/USDT', limit=20)
    bids = ob['bids']
    asks = ob['asks']
    return bids, asks

def analyze_orderbook(bids, asks):
    max_bid = max(bids, key=lambda x: x[1])
    max_ask = max(asks, key=lambda x: x[1])
    return max_bid[0], max_ask[0]

# 🧠 BOT
def run_bot():
    while True:
        try:
            df = get_data()

            df['ema200'] = ema(df['close'], 200)

            price = df['close'].iloc[-1]
            ema200 = df['ema200'].iloc[-1]

            poc, vah, val = volume_profile(df)

            sweep = detect_sweep(df)
            bos = break_of_structure(df)
            liquidation = detect_liquidation(df)

            bids, asks = get_orderbook()
            bid_liq, ask_liq = analyze_orderbook(bids, asks)

            print("\n--- ANALYSE ---")
            print(f"Price: {price}")
            print(f"EMA200: {ema200}")
            print(f"VAL: {val} | VAH: {vah}")
            print(f"OrderBook BUY: {bid_liq} | SELL: {ask_liq}")

            # 🟢 BUY
            if (
                sweep == "sweep_low"
                and bos == "bullish"
                and price > ema200
                and price <= val
                and liquidation
            ):
                print("🔥 SMART BUY SIGNAL")

                # exchange.create_market_buy_order('BTC/USDT', 0.001)

            # 🔴 SELL
            elif (
                sweep == "sweep_high"
                and bos == "bearish"
                and price < ema200
                and price >= vah
                and liquidation
            ):
                print("🔥 SMART SELL SIGNAL")

                # exchange.create_market_sell_order('BTC/USDT', 0.001)

            time.sleep(30)

        except Exception as e:
            print("Erreur:", e)
            time.sleep(10)

@app.route("/")
def home():
    return "Smart Money Bot Actif 💼🐋"

if __name__ == "__main__":
    threading.Thread(target=run_bot).start()
    app.run(host="0.0.0.0", port=10000)
    from flask import Flask
import os

app = Flask(__name__)

@app.route("/")
def home():
    return "Smart Money Bot Actif 🚀"

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 10000))
    app.run(host="0.0.0.0", port=port)    
