import ccxt

exchange = ccxt.binance()
print(exchange.fetch_ticker("BTC/USDT"))
