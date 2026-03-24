import numpy as np

def volume_profile(df, bins=20):
    price = df['close']
    volume = df['volume']

    hist, edges = np.histogram(price, bins=bins, weights=volume)

    poc_index = np.argmax(hist)
    poc = (edges[poc_index] + edges[poc_index+1]) / 2

    vah = np.percentile(price, 70)
    val = np.percentile(price, 30)

    return poc, vah, val
