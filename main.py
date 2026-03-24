from flask import Flask
import threading
import time
import ccxt
import os
import pandas as pd
import numpy as np

app = Flask(__name__)

# 🔐 API depuis Render
API_KEY = os.environ.get("API_KEY")
SECRET_KEY = os.environ.get("SECRET_KEY")

# 🚀 FUTURES ACTIVÉ
exchange = ccxt.binance({
    'apiKey': API_KEY,
    'secret': SECRET_KEY,
    'enableRateLimit': True,
    'options': {
        'defaultType': 'future',
    }
})

symbol = 'BTC/USDT:USDT'

# 📊 DATA
def get_data():
    ohlcv = exchange.fetch_ohlcv(symbol, timeframe='5m', limit=200)
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

# 🧠 SIGNALS
def detect_sweep(df):
    if df['high'].iloc[-1] > df['high'].iloc[-2]:
        return "sweep_high"
    if df['low'].iloc[-1] < df['low'].iloc[-2]:
        return "sweep_low"
    return None

def break_of_structure(df):
    if df['close'].iloc[-1] > df['high'].iloc[-3]:
        return "bullish"
    if df['close'].iloc[-1] < df['low'].iloc[-3]:
        return "bearish"
    return None

def detect_liquidation(df):
    volume = df['volume']
    return volume.iloc[-1] > volume.rolling(20).mean().iloc[-1] * 2

# 🤖 BOT
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

            print("\n--- ANALYSE ---")
            print(f"Price: {price}")
            print(f"EMA200: {ema200}")

            # 🟢 BUY
            if sweep == "sweep_low" and bos == "bullish" and price > ema200 and liquidation:
                print("🔥 BUY FUTURES")

                exchange.create_market_buy_order(symbol, 0.001)

            # 🔴 SELL
            elif sweep == "sweep_high" and bos == "bearish" and price < ema200 and liquidation:
                print("🔥 SELL FUTURES")

                exchange.create_market_sell_order(symbol, 0.001)

            time.sleep(30)

        except Exception as e:
            print("Erreur:", e)
            time.sleep(10)

# 🌐 FLASK
@app.route("/")
def home():
    return "Smart Money Bot Futures Actif 🚀"

# 🚀 LANCEMENT
if __name__ == "__main__":
    threading.Thread(target=run_bot).start()
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 10000)))
