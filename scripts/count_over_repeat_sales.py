#!/usr/bin/env python3
"""Count distinct sale dates per cadastral unit in the saved latest snapshot.

Same-day rows collapse to one event. A cadastral key is a candidate property
identity, not verified identity of a physical apartment across cadastral changes.
"""
import json
from datetime import datetime, timezone
from pathlib import Path
import pandas as pd
from profile_over_nadlan import RAW, OUT, RESIDENTIAL, local_path, CUTOFF

KEY = ['gush', 'chelka', 'sub_chelka']
APT = ['דירה בבית קומות', 'ד. מגורים', 'דירת גן', 'דירת גג']


def summarize(label, frame, export=False):
    # Count dates, not individual source rows or shares sold on a single date.
    events = frame[KEY + ['date']].drop_duplicates()
    groups = events.groupby(KEY, sort=False).agg(
        distinct_sale_dates=('date', 'size'), first_date=('date', 'min'), last_date=('date', 'max'))
    events['year'] = events.date.dt.year
    years = events.groupby(KEY, sort=False).year.nunique()
    result = {
        'scope':label,'source_rows':len(frame),'distinct_property_dates':len(events),
        'same_property_same_day_extra_rows_collapsed':len(frame)-len(events),
        'properties':len(groups),
        'properties_2plus_dates':int(groups.distinct_sale_dates.ge(2).sum()),
        'properties_3plus_dates':int(groups.distinct_sale_dates.ge(3).sum()),
        'properties_exactly_2_dates':int(groups.distinct_sale_dates.eq(2).sum()),
        'properties_2plus_calendar_years':int(years.ge(2).sum()),
        'properties_3plus_calendar_years':int(years.ge(3).sum()),
        'max_distinct_dates':int(groups.distinct_sale_dates.max()),
        'sale_date_count_distribution':{str(int(k)):int(v) for k,v in groups.distinct_sale_dates.value_counts().sort_index().items()},
    }
    if export:
        groups[groups.distinct_sale_dates.ge(2)].reset_index().sort_values(
            ['distinct_sale_dates',*KEY],ascending=[False,True,True,True]
        ).to_csv(OUT/f'repeat_sales_{label}_properties.csv',index=False)
    return result


def main():
    versions=json.loads((RAW/'metadata/versions.json').read_text())
    latest=max(versions,key=lambda x:x['version_number'])
    chunks=[];raw_count=0;excluded=0
    cols=KEY+['settlement_code','settlement','deal_date','deal_nature','portion','asset_area','room_num','deal_amount']
    for resource in latest['resources']:
        df=pd.read_csv(local_path(resource),dtype=str,keep_default_na=False,usecols=cols)
        raw_count+=len(df)
        for c in KEY+['settlement_code','portion','asset_area','room_num','deal_amount']:
            df[c]=pd.to_numeric(df[c],errors='coerce')
        valid=df[KEY].gt(0).all(axis=1)&df[KEY].mod(1).eq(0).all(axis=1)
        excluded+=int((~valid).sum());df=df.loc[valid].copy()
        df[KEY]=df[KEY].astype('int64')
        df['date']=pd.to_datetime(df.deal_date,format='%d/%m/%Y',errors='coerce')
        df=df.loc[df.date.notna()&df.date.le(CUTOFF)]
        df['residential']=df.deal_nature.isin(RESIDENTIAL)
        df['apartment']=df.deal_nature.isin(APT)
        chunks.append(df.drop(columns=['deal_date','deal_nature','settlement']))
    data=pd.concat(chunks,ignore_index=True)
    del chunks
    residential=data[data.residential & data.deal_amount.gt(0)]
    full=residential[residential.portion.eq(1)]
    apartments=data[data.apartment & data.deal_amount.gt(0)]
    whole_apartments=apartments[apartments.portion.eq(1)]
    results=[summarize('all_asset_types',data),summarize('residential_any_portion',residential),
             summarize('residential_whole_sales',full,export=True),
             summarize('apartments_any_portion',apartments),summarize('apartments_whole_sales',whole_apartments)]
    # Stronger sensitivity check: same positive area and rooms on multiple full
    # sale dates. Count each cadastral key ONCE, even if it has multiple profiles.
    cities=data.groupby(KEY,sort=False).settlement_code.nunique()
    ambiguous=cities[cities.gt(1)].index
    clean=whole_apartments[whole_apartments.asset_area.gt(0)&whole_apartments.room_num.gt(0)].copy()
    clean=clean[~pd.MultiIndex.from_frame(clean[KEY]).isin(ambiguous)]
    stable=clean.groupby(KEY+['asset_area','room_num'],sort=False).date.nunique()
    best=stable.groupby(level=KEY,sort=False).max()
    strict={'scope':'apartments_whole_same_area_rooms_no_city_conflict',
            'source_rows':len(clean),'properties':len(best),
            'properties_2plus_dates':int(best.ge(2).sum()),
            'properties_3plus_dates':int(best.ge(3).sum()),
            'properties_exactly_2_dates':int(best.eq(2).sum())}
    results.append(strict)
    stable[stable.ge(2)].rename('distinct_sale_dates').reset_index().to_csv(OUT/'repeat_sales_stable_apartment_profiles.csv',index=False)
    # Stricter still: do not cherry-pick one stable profile from a key that also
    # has conflicting full-sale area/room profiles. All its full apartment rows
    # must have positive, nonmissing, identical area and rooms.
    attributes=whole_apartments.groupby(KEY,sort=False).agg(
        rows=('date','size'), area_count=('asset_area','count'),
        rooms_count=('room_num','count'), area_min=('asset_area','min'),
        rooms_min=('room_num','min'), areas=('asset_area','nunique'), rooms=('room_num','nunique'))
    eligible=attributes[(attributes.area_count.eq(attributes.rows)) &
        attributes.rooms_count.eq(attributes.rows) & attributes.area_min.gt(0) &
        attributes.rooms_min.gt(0) & attributes.areas.eq(1) & attributes.rooms.eq(1)]
    good=eligible.index.difference(ambiguous)
    consistent=whole_apartments[pd.MultiIndex.from_frame(whole_apartments[KEY]).isin(good)]
    results.append(summarize('apartments_whole_consistent_attributes',consistent,export=True))
    summary={'computed_at':datetime.now(timezone.utc).isoformat(),'source_version':latest['version_number'],
             'source_rows':raw_count,'excluded_rows_without_positive_integer_cadastral_unit':excluded,
             'rows_with_eligible_cadastral_key_and_date':len(data),
             'property_keys_with_multiple_known_settlement_codes':len(ambiguous),
             'residential_types':RESIDENTIAL,'apartment_types':APT,'property_key':KEY,
             'rule':'One event per property per distinct calendar date; same-day shares collapse. Positive gush, chelka, sub_chelka required. Residential scopes require positive amount. Whole scopes require an individual row with portion == 1; shares are not summed. All resources of version 5 grouped together; settlement_code is not part of property identity.',
             'caveat':'Candidate cadastral identities, not independently verified apartment identities; subparcel zero excluded. Same-area-rooms scope uses the maximum dates in one attribute profile. Consistent-attributes scope requires all full apartment rows for a key to have identical positive nonmissing area and room values. Both exclude known city-code conflicts.',
             'results':results}
    (OUT/'repeat_sales_counts.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps(summary,ensure_ascii=False,indent=2),flush=True)


if __name__=='__main__': main()
