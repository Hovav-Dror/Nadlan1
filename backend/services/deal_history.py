"""Unfiltered, source-addressable records sharing a full cadastral identifier."""
import pandas as pd

from .address_lookup import _key, _prepare
from .analysis_deals import _table_rows, _with_display_calculations
from .calculations import CalculationServiceError


def deal_history(current, legacy, city, record_id):
    if not city or not record_id or len(record_id) > 200:
        raise CalculationServiceError('נדרשים עיר ומזהה רשומה תקינים.')
    new = _prepare(current.load_city(city))
    old = _prepare(legacy.load_city(city)) if legacy is not None else new.iloc[:0]
    # Record identifiers remain stable across filtering, sampling and city concatenation.
    primary = old if record_id.startswith('legacy:') and legacy is not None else new
    found = primary.loc[primary['_record_id'].eq(record_id)]
    if len(found) != 1:
        raise CalculationServiceError('רשומת העסקה לא נמצאה במקור הנוכחי.')
    selected = found.iloc[0]
    key = _key(selected.GUSH)
    if key:
        candidates = pd.concat([new[new._key.eq(key)], old[old._key.eq(key)]], ignore_index=True)
        candidates = candidates.drop_duplicates('_record_id')
    else:
        candidates = found.copy()
    # Keep separate source records visible; same-date partial sales are not repeat sales.
    prepared = _with_display_calculations(candidates, 'Price')
    rows = _table_rows(prepared)
    for row in rows:
        is_legacy = row['record_id'].startswith('legacy:')
        row['source_label'] = 'מידע לעם — התמנון' if is_legacy else 'גרסאות לעם'
        if is_legacy:
            row['location_basis'] = 'legacy_record'
    deal = next(row for row in rows if row['record_id'] == record_id)
    others = [row for row in rows if row['record_id'] != record_id]
    dates = {row['date'] for row in rows if row['date']}
    # Exact dated price matches are labelled as parallel evidence, not another sale.
    for row in others:
        row['same_date'] = row['date'] == deal['date']
        row['parallel_source'] = any(
            peer['date'] == row['date'] and peer['source_label'] != row['source_label'] and
            peer['price_ils'] is not None and row['price_ils'] is not None and
            abs(peer['price_ils'] - row['price_ils']) <= 1000
            for peer in rows)
    warnings = ['היסטוריית המקורות אינה מוגבלת במסננים או בדגימת הגרף. רשומות באותו תאריך עשויות להיות חלקי מכירה או דיווח מקביל; אינן נספרות כמכירה חוזרת.']
    if key:
        warnings.append('הקישור לפי גוש/חלקה/תת־חלקה; זהות הדירה לאורך השנים אינה מאומתת. כתובת וקומה בייחוס מסומנות בנפרד.')
    else:
        warnings.append('אין מזהה גוש/חלקה/תת־חלקה מלא ותקין, ולכן אין קישור לעסקאות אחרות.')
    return {'deal': deal, 'related': others, 'gush_code': key, 'distinct_dates': len(dates),
            'records': len(rows), 'warnings': warnings}
