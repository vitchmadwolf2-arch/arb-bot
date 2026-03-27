import ccxt
import time
import numpy as np
import requests

# =========================
# CONFIG
# =========================
API_KEY = "aNDnQaPjdbyaB2TNsgWZiGH6yGMwXZfmNaZjLVoBmN1Gm87FGY4BwHLsFgstE4GY"
SECRET_KEY = "NjlozkWyvwXGsdkRiTrGSxOTtSw4CrJgjzjYme2PAGhPEYju6aFbUr6AaZ8xLwsT"

TELEGRAM_TOKEN = "8405502410:AAF9M2irJ-TTODND5N4pPpF_sCyxWdFBpw4"
CHAT_ID = "5633760597"

exchange = ccxt.binance({
    'apiKey': API_KEY,
    'secret': SECRET_KEY,
    'enableRateLimit': True,
    'options': {
        'defaultType': 'future',
        'adjustForTimeDifference': True
    }
})

MAX_TRADES = 3
RISK_PER_TRADE = 0.01

open_positions = {}
cooldown = {}
START_TIME = time.time()  # 🔥 pour ignorer anciennes positions

# =========================
# TELEGRAM
# =========================
def send_telegram(msg):
    try:
        url = f"https://api.telegram.org/bot{TELEGRAM_TOKEN}/sendMessage"
        requests.post(url, data={"chat_id": CHAT_ID, "text": msg})
    except:
        pass

# =========================
def load_pairs():
    markets = exchange.load_markets()
    return [s for s in markets if "/USDT" in s and markets[s]['active']]

# =========================
def calculate_vwap(ohlcv):
    pv, vol = 0, 0
    for c in ohlcv:
        tp = (c[2] + c[3] + c[4]) / 3
        pv += tp * c[5]
        vol += c[5]
    return pv / vol if vol else 0

def volume_profile(closes, volumes):
    hist, edges = np.histogram(closes, bins=20, weights=volumes)
    idx = np.argmax(hist)
    return (edges[idx] + edges[idx+1]) / 2

def filter_pair(symbol):
    try:
        t = exchange.fetch_ticker(symbol)
        vol = t['quoteVolume']
        volat = (t['high'] - t['low']) / t['low'] if t['low'] else 0
        return vol > 1_000_000 and volat > 0.02
    except:
        return False

# =========================
def get_signal(symbol):
    # ===== 5m
    ohlcv_5m = exchange.fetch_ohlcv(symbol, '5m', limit=100)
    closes_5m = [x[4] for x in ohlcv_5m]
    volumes_5m = [x[5] for x in ohlcv_5m]
    if len(closes_5m) < 50:
        return None, closes_5m[-1]
    ema50_5m = sum(closes_5m[-50:]) / 50
    ema200_5m = sum(closes_5m[-100:]) / 100
    price = closes_5m[-1]
    vwap = calculate_vwap(ohlcv_5m)
    poc = volume_profile(closes_5m, volumes_5m)

    # ===== 1h
    ohlcv_1h = exchange.fetch_ohlcv(symbol, '1h', limit=100)
    closes_1h = [x[4] for x in ohlcv_1h]
    if len(closes_1h) < 50:
        return None, price
    ema50_1h = sum(closes_1h[-50:]) / 50
    ema200_1h = sum(closes_1h[-100:]) / 100
    trend_up = ema50_1h > ema200_1h
    trend_down = ema50_1h < ema200_1h

    # ===== SIGNAL
    if trend_up and ema50_5m > ema200_5m and price > vwap and price > poc:
        return "BUY", price
    elif trend_down and ema50_5m < ema200_5m and price < vwap and price < poc:
        return "SELL", price
    return None, price

# =========================
def can_trade(symbol):
    now = time.time()
    if symbol in open_positions:
        return False
    if symbol in cooldown and now - cooldown[symbol] < 300:
        return False
    return True

def get_position_size(price):
    balance = exchange.fetch_balance()
    usdt
