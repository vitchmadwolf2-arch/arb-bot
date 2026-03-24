from flask import Flask, jsonify
import threading
import time
import ccxt
import pandas as pd

app = Flask(__name__)

# ⚠️ Mode test (PAS de clé pour commencer)
exchange = ccxt.binance()
symbol = "BTC/USDT"

price = 0
signal = "NONE"

# 📊 STRATÉGIE SIMPLE (base propre)
def get_data():
    ohlcv = exchange.fetch_ohlcv(symbol, timeframe='5m', limit=50)
    df = pd.DataFrame(ohlcv, columns=['time','open','high','low','close','volume'])
    return df

def bot():
    global price, signal

    while True:
        try:
            df = get_data()

            price = df['close'].iloc[-1]
            avg = df['close'].mean()

            # 🧠 SIGNAL SIMPLE
            if price > avg:
                signal = "BUY"
            else:
                signal = "SELL"

            print(f"Price: {price} | Signal: {signal}")

            time.sleep(10)

        except Exception as e:
            print("Erreur:", e)
            time.sleep(5)

# 🌐 API LIVE
@app.route("/")
def home():
    return "BOT LIVE OK 🚀"

@app.route("/data")
def data():
    return jsonify({
        "price": price,
        "signal": signal
    })

# 🚀 LANCEMENT
if __name__ == "__main__":
    threading.Thread(target=bot).start()
    app.run(host="0.0.0.0", port=10000)
