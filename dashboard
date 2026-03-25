from flask import Flask
import ccxt

app = Flask(__name__)

exchange = ccxt.binance()

@app.route("/")
def home():
    price = exchange.fetch_ticker("BTC/USDT")['last']

    return f"""
    <h1>📊 DASHBOARD LIVE</h1>
    <h2>BTC Price: {price}</h2>
    """

app.run(host="0.0.0.0", port=5000)
