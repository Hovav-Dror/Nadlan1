"""Literal, order-independent Hebrew address matching (never fuzzy linkage)."""
import re
import unicodedata

import pandas as pd


def normalize_address(value):
    text = unicodedata.normalize('NFKC', str(value or '')).lower()
    text = re.sub(r'[\u0591-\u05bd\u05bf-\u05c7]', '', text)
    text = re.sub(r"['\"׳״‘’“”]", '', text)
    return ' '.join(re.findall(r'[^\W_]+', text))


def address_tokens(query):
    return [token for token in normalize_address(query).split() if token not in {'רחוב', 'רח', 'מספר'}]


def address_mask(values, query):
    tokens = address_tokens(query)
    if not tokens:
        return pd.Series(False, index=values.index)
    normalized = values.fillna('').astype(str).map(normalize_address)
    matched = pd.Series(True, index=values.index)
    for token in tokens:
        pattern = r'(?<!\d)' + re.escape(token) + r'(?!\d)' if token.isdigit() else re.escape(token)
        matched &= normalized.str.contains(pattern, regex=True)
    return matched
