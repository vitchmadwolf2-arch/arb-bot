import ccxt
import pandas as pd
import numpy as np

# =========================
# CONFIG
# =========================
symbol = "BTC/USDT"
timeframe = "5m"
limit = 1000

exchange = ccxt.binance()

# =========================
# DATA
# =========================
def get_data():
    ohlcv = exchange.fetch_ohlcv(symbol, timeframe=timeframe, limit=limit)
    df = pd.DataFrame(ohlcv, columns=['time','open','high','low','close','volume'])
    return df

# =========================
# INDICATORS
# =========================
def ema(df, period):
    return df['close'].ewm(span=period).mean()

def volume_profile(df, bins=20):
    price = df['close']
    volume = df['volume']

    hist, edges = np.histogram(price, bins=bins, weights=volume)
    poc_idx = np.argmax(hist)
    poc = (edges[poc_idx] + edges[poc_idx+1]) / 2

    return poc

# =========================
# STRATEGY
# =========================
def strategy(df):
    ema50 = ema(df, 50)
    ema200 = ema(df, 200)
    poc = volume_profile(df)

    signals = []

    for i in range(200, len(df)):
        price = df['close'].iloc[i]

        if ema50.iloc[i] > ema200.iloc[i] and price > poc:
            signals.append(("BUY", price))

        elif ema50.iloc[i] < ema200.iloc[i] and price < poc:
            signals.append(("SELL", price))

    return signals

# =========================
# BACKTEST
# =========================
def backtest():
    df = get_data()

    signals = strategy(df)

    balance = 1000
    position = 0
    entry_price = 0

    for side, price in signals:

        # BUY
        if side == "BUY" and position == 0:
            position = balance / price
            entry_price = price
            balance = 0

        # SELL
        elif side == "SELL" and position > 0:
            balance = position * price
            position = 0

    final_balance = balance if balance > 0 else position * df['close'].iloc[-1]

    print("\n===== RESULTAT BACKTEST =====")
    print("Balance initiale: 1000$")
    print("Balance finale:", round(final_balance, 2), "$")
    print("Profit:", round(final_balance - 1000, 2), "$")

# =========================
# RUN
# =========================
if __name__ == "__main__":
    backtest()
