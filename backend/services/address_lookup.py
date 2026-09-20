"""Address discovery across legacy records and OVER cadastral candidates.

This view does not enrich the analytic dataset or certify repeated apartment sales.
It retains legacy evidence even when the stricter pilot enrichment rejected it.
"""
import re
import pandas as pd
from .calculations import CalculationServiceError
from .address_search import address_mask, address_tokens


def _number(value):
    result = pd.to_numeric(value, errors='coerce')
    return None if pd.isna(result) else float(result)


def _key(value):
    parts = str(value).split('-')
    if len(parts) != 3:
        return None
    try:
        numbers = [float(part) for part in parts]
    except (ValueError, TypeError):
        return None
    if any(n is None or n <= 0 or not n.is_integer() for n in numbers):
        return None
    return '-'.join(str(int(n)) for n in numbers)


def _text(value):
    return '' if value is None or pd.isna(value) else str(value).strip()


def _prepare(frame):
    result = frame.copy().reset_index(drop=True)
    keys = {value: _key(value) for value in result.GUSH.dropna().unique()}
    result['_key'] = result.GUSH.map(keys)
    result['_date'] = pd.to_datetime(result.date, errors='coerce').dt.strftime('%Y-%m-%d').fillna('')
    return result


def lookup_address(legacy, current, payload):
    city = payload.get('city')
    query = str(payload.get('address', '')).strip()
    if not city or len(query) < 2 or len(query) > 160 or not address_tokens(query):
        raise CalculationServiceError('יש לבחור עיר ולהזין כתובת באורך 2–160 תווים.')
    try:
        start, end = int(payload.get('year_from', 1998)), int(payload.get('year_to', 2026))
        floor = None if payload.get('floor') in (None, '') else float(payload['floor'])
        if not 1900 <= start <= end <= 2100 or (floor is not None and not -10 <= floor <= 200):
            raise ValueError()
    except (TypeError, ValueError):
        raise CalculationServiceError('טווח השנים או הקומה אינם תקינים.')
    old = _prepare(legacy.load_city(city))
    new = _prepare(current.load_city(city)) if current is not None else old.iloc[:0]
    city_name = _text(old.city.iloc[0]) if len(old) else str(city)
    selected = address_mask(old.FULLADRESS, query)
    if floor is not None:
        selected &= pd.to_numeric(old.floor, errors='coerce').eq(floor)
    refs = old.loc[selected]
    keys = set(refs._key.dropna())
    if len(keys) > 50:
        raise CalculationServiceError('נמצאו יותר מ־50 מזהים; הוסיפו מספר בית או קומה לחיפוש.')
    new_rows = new[new._key.isin(keys)]
    old_counts = old.groupby(['_key', '_date']).size()
    new_counts = new.groupby(['_key', '_date']).size()
    consumed = set()
    rows = []
    for _, row in new_rows.iterrows():
        reference = refs[refs._key.eq(row._key)]
        same_day = reference[reference._date.eq(row._date)]
        price = _number(row.price_millions)
        match = None
        if (old_counts.get((row._key, row._date), 0) == 1
                and new_counts.get((row._key, row._date), 0) == 1
                and _number(row.sale_portion) == 1 and len(same_day) == 1):
            candidate = same_day.iloc[0]
            old_price = _number(candidate.price_millions)
            if price is not None and old_price is not None and abs(price-old_price) <= .001000001:
                match = candidate
                consumed.add(candidate.name)
        source_refs = reference if match is None else same_day
        addresses = sorted(set(source_refs.FULLADRESS.map(_text)) - {''})
        floors = sorted(set(source_refs.floor.map(_number).dropna()) - {999.})
        conflicts = []
        if match is not None:
            for col, label, tolerance in [('area','שטח',.5),('rooms','חדרים',.001),('build_year','שנת בנייה',0)]:
                a, b = _number(match[col]), _number(row[col])
                if a is None or b is None or abs(a-b) > tolerance:
                    conflicts.append(label)
        global_refs = old[old._key.eq(row._key)]
        if global_refs.FULLADRESS.map(_text).nunique() > 1 or global_refs.floor.nunique() > 1:
            conflicts.append('מזהה המקושר לכתובות או לקומות שונות בנתוני מידע לעם — התמנון')
        rows.append({
            'date':row._date, 'gush_code':row._key, 'price_ils':_number(row.get('deal_amount')),
            'sale_portion':_number(row.sale_portion), 'area':_number(row.area), 'rooms':_number(row.rooms),
            'build_year':_number(row.build_year), 'reference_address':' / '.join(addresses),
            'reference_floor':' / '.join(str(int(f)) if f.is_integer() else str(f) for f in floors),
            'source':'גרסאות לעם + דיווח מקביל ממידע לעם — התמנון' if match is not None else 'גרסאות לעם',
            'link':'מזהה, תאריך ומחיר תואמים' if match is not None else 'מועמד לפי מזהה בלבד; הכתובת והקומה אינן מאומתות לעסקה זו',
            'conflicts':', '.join(conflicts) or ('לא נבדקו מול אותה עסקה' if match is None else 'ללא סתירה בשדות שנבדקו'),
            'legacy_area':_number(match.area) if match is not None else None,
            'legacy_rooms':_number(match.rooms) if match is not None else None,
            'legacy_build_year':_number(match.build_year) if match is not None else None,
            'source_id':_text(row.source_id), 'city':city_name,
            'legacy_reference_ids':[f'{city_name}:{i}' for i in source_refs.index],
        })
    for index, row in refs.iterrows():
        if index in consumed:
            continue
        price = _number(row.price_millions)
        rows.append({'date':row._date,'gush_code':row._key,'price_ils':None if price is None else price*1e6,
            'sale_portion':None,'area':_number(row.area),'rooms':_number(row.rooms),'build_year':_number(row.build_year),
            'reference_address':_text(row.FULLADRESS),'reference_floor':_number(row.floor),
            'city':city_name,'source':'מידע לעם — התמנון','link':'כתובת וקומה מדיווח מידע לעם — התמנון; לא אוחדה עם רשומה חדשה',
            'conflicts':'חלק המכירה אינו ידוע בנתוני מידע לעם — התמנון','source_id':f'legacy:{city_name}:{index}',
            'legacy_reference_ids':[f'{city_name}:{index}'], 'legacy_area':None,'legacy_rooms':None,'legacy_build_year':None})
    rows = [r for r in rows if r['date'] and str(start) <= r['date'][:4] <= str(end)]
    rows.sort(key=lambda r:(r['date'],r['source_id']))
    return {'rows':rows, 'counts':{'records':len(rows),'distinct_dates':len({r['date'] for r in rows}),
            'reference_properties':len(keys)},
        'warnings':(['החיפוש במאגר מידע לעם — התמנון בלבד. נתוני רשות המסים החדשים אינם פעילים בגרסה זו. החיפוש אינו משתמש במסנני הגרף; כתובת חסרה במקור עלולה למנוע איתור.'] if current is None else ['זהו חיפוש משלים שאינו משתמש במסנני הגרף או בדגימה. כתובת וקומה של מועמדים מגיעות מרשומת ייחוס בנתוני מידע לעם — התמנון; קישור לפי מזהה בלבד אינו מאמת שזו אותה דירה. מקור הפיילוט מוגבל לעסקאות המגורים שיובאו ולתאריכי הכיסוי שלו.'])}
