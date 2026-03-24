from flask import Flask
import threading
import time
import ccxt
import os
import pandas as pd
import numpy as np

app = Flask(__name__)

API_KEY = os.environ.get("API_KEY")
SECRET_KEY = os.environ.get("SECRET_KEY")

exchange = ccxt.binance({
    'apiKey': API_KEY,
    'secret': SECRET_KEY,
    'enableRateLimit': True,
})

# 📊 Data
def get_data():
    ohlcv = exchange.fetch_ohlcv('BTC/USDT', timeframe='5m', limit=200)
    df = pd.DataFrame(ohlcv, columns=['time','open','high','low','close','volume'])
    return df

# 📊 EMA 200
def ema(df, period=200):
    return df['close'].ewm(span=period).mean()

# 📊 Volume Profile
def volume_profile(df, bins=30):
    price = df['close']
    volume = df['volume']

    hist, edges = np.histogram(price, bins=bins, weights=volume)

    poc_index = np.argmax(hist)
    poc = (edges[poc_index] + edges[poc_index+1]) / 2

    vah = np.percentile(price, 70)
    val = np.percentile(price, 30)

    return poc, vah, val

# 🧠 Bot logique
def run_bot():
    while True:
        try:
            df = get_data()

            df['ema200'] = ema(df)

            poc, vah, val = volume_profile(df)

            price = df['close'].iloc[-1]
            ema200 = df['ema200'].iloc[-1]

            print(f"Prix: {price} | EMA200: {ema200}")
            print(f"POC: {poc} | VAH: {vah} | VAL: {val}")

            # 🟢 Achat institutionnel
            if price <= val and price > ema200:
                print("ACHAT INSTITUTIONNEL 🚀")
                # exchange.create_market_buy_order('BTC/USDT', 0.001)

            # 🔴 Vente institutionnelle
            elif price >= vah and price < ema200:
                print("VENTE INSTITUTIONNELLE 💰")
                # exchange.create_market_sell_order('BTC/USDT', 0.001)

            time.sleep(30)

        except Exception as e:
            print("Erreur:", e)
            time.sleep(10)

@app.route("/")
def home():
    return "Bot institutionnel actif 💼"

if __name__ == "__main__":
    threading.Thread(target=run_bot).start()
    app.run(host="0.0.0.0", port=10000)
