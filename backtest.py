import ccxt
import pandas as pd
import numpy as np

# ⚙️ CONFIG
symbol = 'BTC/USDT'
timeframe = '5m'
limit = 1000

exchange = ccxt.binance()

# 📊 DATA
def get_data():
    ohlcv = exchange.fetch_ohlcv(symbol, timeframe=timeframe, limit=limit)
    df = pd.DataFrame(ohlcv, columns=['time','open','high','low','close','volume'])
    return df

# 📈 EMA
def ema(series, period):
    return series.ewm(span=period).mean()

# 🧠 SIGNALS
def detect_sweep(df):
    if df['low'].iloc[-1] < df['low'].iloc[-2]:
        return "buy"
    if df['high'].iloc[-1] > df['high'].iloc[-2]:
        return "sell"
    return None

def break_of_structure(df):
    if df['close'].iloc[-1] > df['high'].iloc[-3]:
        return "buy"
    if df['close'].iloc[-1] < df['low'].iloc[-3]:
        return "sell"
    return None

# 🔁 BACKTEST
def backtest():
    df = get_data()

    df['ema200'] = ema(df['close'], 200)

    balance = 1000
    position = None
    entry_price = 0

    wins = 0
    losses = 0

    for i in range(200, len(df)):

        current = df.iloc[i]

        sweep = detect_sweep(df.iloc[:i])
        bos = break_of_structure(df.iloc[:i])

        price = current['close']
        ema200 = current['ema200']

        # 📈 ENTRY BUY
        if position is None:
            if sweep == "buy" and bos == "buy" and price > ema200:
                position = "buy"
                entry_price = price

            elif sweep == "sell" and bos == "sell" and price < ema200:
                position = "sell"
                entry_price = price

        # 📉 EXIT
        elif position == "buy":
            if price >= entry_price * 1.02:
                balance *= 1.02
                wins += 1
                position = None

            elif price <= entry_price * 0.99:
                balance *= 0.99
                losses += 1
                position = None

        elif position == "sell":
            if price <= entry_price * 0.98:
                balance *= 1.02
                wins += 1
                position = None

            elif price >= entry_price * 1.01:
                balance *= 0.99
                losses += 1
                position = None

    print("\n📊 RESULTATS BACKTEST")
    print(f"Balance finale: {balance}")
    print(f"Wins: {wins}")
    print(f"Losses: {losses}")

if __name__ == "__main__":
    backtest()
