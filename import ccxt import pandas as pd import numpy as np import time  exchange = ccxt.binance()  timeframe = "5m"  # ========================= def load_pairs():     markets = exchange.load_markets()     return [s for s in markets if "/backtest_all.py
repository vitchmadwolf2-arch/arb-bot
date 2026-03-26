import ccxt
import pandas as pd
import numpy as np
import time

exchange = ccxt.binance()

timeframe = "5m"

# =========================
def load_pairs():
    markets = exchange.load_markets()
    return [s for s in markets if "/USDT" in s and markets[s]['active']]

# =========================
def get_data(symbol):
    try:
        ohlcv = exchange.fetch_ohlcv(symbol, timeframe=timeframe, limit=500)
        df = pd.DataFrame(ohlcv, columns=['time','open','high','low','close','volume'])
        return df
    except:
        return None

# =========================
def calculate_vwap(df):
    tp = (df['high'] + df['low'] + df['close']) / 3
    return (tp * df['volume']).cumsum() / df['volume'].cumsum()

# =========================
def volume_profile(closes, volumes):
    hist, edges = np.histogram(closes, bins=20, weights=volumes)
    idx = np.argmax(hist)
    return (edges[idx] + edges[idx+1]) / 2

# =========================
def backtest_symbol(symbol):
    df = get_data(symbol)
    if df is None or len(df) < 200:
        return None

    df['ema50'] = df['close'].rolling(50).mean()
    df['ema200'] = df['close'].rolling(100).mean()
    df['vwap'] = calculate_vwap(df)

    balance = 1000
    position = None
    entry = 0

    for i in range(200, len(df)):

        price = df['close'].iloc[i]
        ema50 = df['ema50'].iloc[i]
        ema200 = df['ema200'].iloc[i]
        vwap = df['vwap'].iloc[i]

        closes = df['close'].iloc[i-50:i]
        volumes = df['volume'].iloc[i-50:i]
        poc = volume_profile(closes, volumes)

        # ENTRY
        if position is None:
            if ema50 > ema200 and price > vwap and price > poc:
                position = "BUY"
                entry = price
            elif ema50 < ema200 and price < vwap and price < poc:
                position = "SELL"
                entry = price

        # EXIT
        elif position == "BUY":
            if price <= entry * 0.98:
                balance *= 0.98
                position = None
            elif price >= entry * 1.03:
                balance *= 1.03
                position = None

        elif position == "SELL":
            if price >= entry * 1.02:
                balance *= 0.98
                position = None
            elif price <= entry * 0.97:
                balance *= 1.03
                position = None

    return round(balance, 2)

# =========================
def run():
    pairs = load_pairs()
    results = []

    print("Total pairs:", len(pairs))

    for symbol in pairs:
        result = backtest_symbol(symbol)

        if result:
            print(symbol, "→", result)
            results.append((symbol, result))

        time.sleep(0.2)

    # TOP 10
    results.sort(key=lambda x: x[1], reverse=True)

    print("\n🔥 TOP 10 PAIRS:")
    for r in results[:10]:
        print(r)

# =========================
run()
