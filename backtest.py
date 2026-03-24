import ccxt
import pandas as pd
import numpy as np

exchange = ccxt.binance()

# 📊 Charger les données historiques
def get_data():
    ohlcv = exchange.fetch_ohlcv('BTC/USDT', timeframe='5m', limit=1000)
    df = pd.DataFrame(ohlcv, columns=['time','open','high','low','close','volume'])
    return df

# 📈 EMA
def ema(series, period=200):
    return series.ewm(span=period).mean()

# 📊 Volume Profile simplifié
def volume_profile(df, bins=30):
    price = df['close']
    volume = df['volume']

    hist, edges = np.histogram(price, bins=bins, weights=volume)

    poc_index = np.argmax(hist)
    poc = (edges[poc_index] + edges[poc_index+1]) / 2

    vah = np.percentile(price, 70)
    val = np.percentile(price, 30)

    return poc, vah, val

# 💰 Backtest
def run_backtest():
    df = get_data()

    df['ema200'] = ema(df['close'])

    balance = 1000  # capital initial
    position = 0
    entry_price = 0

    for i in range(200, len(df)):

        subset = df.iloc[:i]
        price = df['close'].iloc[i]

        poc, vah, val = volume_profile(subset)
        ema200 = subset['ema200'].iloc[-1]

        # 🟢 BUY
        if price <= val and price > ema200 and position == 0:
            position = balance / price
            entry_price = price
            balance = 0
            print(f"BUY at {price}")

        # 🔴 SELL
        elif position > 0:

            take_profit = entry_price * 1.04
            stop_loss = entry_price * 0.98

            if price >= take_profit or price <= stop_loss or price >= vah:
                balance = position * price
                position = 0

                print(f"SELL at {price} | Balance: {balance}")

    print(f"Final balance: {balance}")

run_backtest()
