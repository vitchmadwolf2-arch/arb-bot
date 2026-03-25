def ai_filter(closes):

    if len(closes) < 50:
        return False

    volatility = max(closes) - min(closes)

    # filtre simple
    if volatility < 50:
        return False

    return True
