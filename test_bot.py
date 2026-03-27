import ccxt
import time

print("BOT OK")
exchange = ccxt.binance()
ticker = exchange.fetch_ticker("BTC/USDT")
print("Prix BTC:", ticker['last'])
input("Appuie sur Entrée pour fermer...")
