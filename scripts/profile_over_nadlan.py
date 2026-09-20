#!/usr/bin/env python3
"""Reproducible offline assessment of OVER snapshots; does not alter app data."""
import json
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse
import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / 'data/raw/over_fd06f5ae'
OUT = ROOT / 'reports/over_2026_09_19'
CUTOFF = pd.Timestamp('2026-09-19')
BUSINESS = ['settlement_code','settlement','gush','chelka','sub_chelka','deal_date','deal_amount','declared_amount','deal_nature','portion','year_built','asset_area','room_num']
NUMERIC = ['deal_amount','declared_amount','portion','year_built','asset_area','room_num']
RESIDENTIAL = ['דירה בבית קומות','ד. מגורים','בית בודד',"קוטג' חד משפחתי", "קוטג' דו משפחתי",'דירת גן','דירת גג']


def local_path(resource):
    p = Path(urlparse(resource['download_url']).path)
    return RAW / 'files' / p.parent.name / p.name


def normalized_id(s):
    return pd.to_numeric(s, errors='coerce').astype('Int64').astype('string').fillna('')


def profile(label, paths):
    counts, missing, numeric, cities, years, city_year, types, portions = (Counter() for _ in range(8))
    hashes, raw_hashes = [], []
    extrema = {}
    columns = set()
    for path in paths:
        for df in pd.read_csv(path, dtype=str, keep_default_na=False, chunksize=200000):
            columns.update(df.columns)
            n = len(df); counts['rows'] += n
            for col in df.columns: missing[col] += int(df[col].str.strip().eq('').sum())
            hashes.append(pd.util.hash_pandas_object(df[BUSINESS], index=False).to_numpy())
            raw_hashes.append(pd.util.hash_pandas_object(df, index=False).to_numpy())
            date = pd.to_datetime(df.deal_date, format='%d/%m/%Y', errors='coerce')
            values = {c: pd.to_numeric(df[c], errors='coerce') for c in NUMERIC}
            counts['invalid_date'] += int(date.isna().sum())
            counts['future_deal_date'] += int((date > CUTOFF).sum())
            counts['before_1998'] += int((date < pd.Timestamp('1998-01-01')).sum())
            for c,v in values.items():
                numeric[c+'_missing_or_unparseable'] += int(v.isna().sum())
                numeric[c+'_zero'] += int(v.eq(0).sum())
                numeric[c+'_negative'] += int(v.lt(0).sum())
            portion = values['portion']
            counts['partial_portion_0_to_1'] += int((portion.gt(0)&portion.lt(1)).sum())
            counts['whole_portion_1'] += int(portion.eq(1).sum())
            counts['portion_above_1'] += int(portion.gt(1).sum())
            counts['amounts_differ'] += int(values['deal_amount'].ne(values['declared_amount']).sum())
            counts['subparcel_zero_or_missing'] += int(pd.to_numeric(df.sub_chelka,errors='coerce').fillna(0).eq(0).sum())
            counts['year_built_after_deal'] += int(values['year_built'].gt(date.dt.year).sum())
            counts['year_built_after_cutoff_year'] += int(values['year_built'].gt(CUTOFF.year).sum())
            counts['area_above_1000'] += int(values['asset_area'].gt(1000).sum())
            counts['rooms_above_20'] += int(values['room_num'].gt(20).sum())
            residential = df.deal_nature.isin(RESIDENTIAL)
            usable = residential & portion.eq(1) & date.notna() & date.le(CUTOFF) & values['deal_amount'].gt(0) & values['asset_area'].gt(0)
            counts['residential_types_rows'] += int(residential.sum())
            counts['residential_rooms_positive'] += int((residential & values['room_num'].gt(0)).sum())
            counts['whole_residential_positive_area_price_valid_date'] += int(usable.sum())
            counts['whole_residential_usable_with_rooms'] += int((usable & values['room_num'].gt(0)).sum())
            cities.update(df.groupby(['settlement_code','settlement']).size().to_dict())
            years.update(date.dt.year.dropna().astype(int).value_counts().to_dict())
            cy=df[['settlement_code','settlement']].assign(year=date.dt.year.astype('Int64'))
            city_year.update(cy.groupby(['settlement_code','settlement','year']).size().to_dict())
            types.update(df.deal_nature.value_counts().to_dict());portions.update(df.portion.value_counts().to_dict())
            for c, v in [('deal_date',date),('scraped_at',pd.to_datetime(df.scraped_at,format='mixed',utc=True,errors='coerce'))]:
                if v.notna().any():
                    low,high=str(v.min()),str(v.max())
                    old=extrema.get(c,{});extrema[c]={'min':min(low,old.get('min',low)),'max':max(high,old.get('max',high))}
    h=np.concatenate(hashes); rh=np.concatenate(raw_hashes)
    unique, freq=np.unique(h, return_counts=True)
    counts['unique_business_hashes']=len(unique)
    counts['business_duplicate_excess']=int((freq-1).sum())
    counts['business_duplicate_affected_rows']=int(freq[freq>1].sum())
    counts['exact_duplicate_excess']=len(rh)-len(np.unique(rh))
    counts['settlement_code_count']=len({x[0] for x in cities if x[0].strip()})
    counts['rows_without_settlement_code']=sum(v for k,v in cities.items() if not k[0].strip())
    pd.DataFrame([{'settlement_code':k[0],'settlement':k[1],'rows':v} for k,v in cities.items()]).sort_values('rows',ascending=False).to_csv(OUT/f'{label}_cities.csv',index=False)
    pd.DataFrame([{'year':k,'rows':v} for k,v in years.items()]).sort_values('year').to_csv(OUT/f'{label}_years.csv',index=False)
    pd.DataFrame([{'settlement_code':k[0],'settlement':k[1],'year':k[2],'rows':v} for k,v in city_year.items()]).sort_values(['settlement_code','year']).to_csv(OUT/f'{label}_city_year.csv',index=False)
    pd.DataFrame(types.most_common(),columns=['deal_nature','rows']).to_csv(OUT/f'{label}_types.csv',index=False)
    pd.DataFrame(portions.most_common(),columns=['portion','rows']).to_csv(OUT/f'{label}_portions.csv',index=False)
    pd.DataFrame([{'field':c,'missing':missing[c],'missing_pct':100*missing[c]/counts['rows']} for c in sorted(columns)]).to_csv(OUT/f'{label}_missing.csv',index=False)
    result={'label':label,'counts':dict(counts),'numeric':dict(numeric),'date_ranges':extrema,'columns':sorted(columns),'residential_types_used':RESIDENTIAL}
    (OUT/f'{label}_profile.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
    print(label,json.dumps(result,ensure_ascii=False),flush=True)
    return unique


def compare_legacy(latest):
    manifest=json.loads((ROOT/'data/manifest.json').read_text())
    results=[]
    resources={r['name'].split(' — ',1)[-1]:r for r in latest['resources']}
    for city, info in manifest['cities'].items():
        r=resources.get(city)
        if not r: continue
        new=pd.read_csv(local_path(r),dtype=str,keep_default_na=False)
        old=pd.read_parquet(ROOT/'data/cities'/info['file'])
        nd=pd.to_datetime(new.deal_date,format='%d/%m/%Y',errors='coerce'); od=pd.to_datetime(old.date)
        parts=[normalized_id(new[c]) for c in ['gush','chelka','sub_chelka']]
        parcel=parts[0]+'-'+parts[1]+'-'+parts[2]
        old_parts=old.GUSH.astype('string').str.split('-',expand=True)
        parts=[normalized_id(old_parts[c]) for c in [0,1,2]]
        old_parcel=parts[0]+'-'+parts[1]+'-'+parts[2]
        nk=parcel+'|'+nd.dt.strftime('%Y-%m-%d').fillna('')
        ok=old_parcel+'|'+od.dt.strftime('%Y-%m-%d').fillna('')
        nonzero=pd.to_numeric(new.sub_chelka,errors='coerce').gt(0)
        old_by_key=pd.DataFrame({'key':ok,'price':pd.to_numeric(old.price_millions)*1e6})
        new_by_key=pd.DataFrame({'key':nk,'deal':pd.to_numeric(new.deal_amount,errors='coerce'),'declared':pd.to_numeric(new.declared_amount,errors='coerce')})
        old_unique=old_by_key[~old_by_key.key.duplicated(keep=False)]
        new_unique=new_by_key[~new_by_key.key.duplicated(keep=False)]
        matches=old_unique.merge(new_unique,on='key',validate='one_to_one')
        repeats=new.loc[nonzero,['gush','chelka','sub_chelka','room_num','asset_area']].copy()
        repeats['date']=nd[nonzero]
        groups=repeats.groupby(['gush','chelka','sub_chelka','room_num','asset_area']).date.nunique()
        results.append({'city':city,'legacy_rows':len(old),'new_rows':len(new),'new_2024_rows':int(nd.dt.year.eq(2024).sum()),'new_2025_rows':int(nd.dt.year.eq(2025).sum()),'new_2026_rows':int(nd.dt.year.eq(2026).sum()),'new_valid_max_date':str(nd[nd.le(CUTOFF)].max().date()),'legacy_valid_max_date':str(od[od.le(CUTOFF)].max().date()),'old_rows_with_parcel_date_match':int(ok.isin(set(nk)).sum()),'one_to_one_parcel_date_candidates':len(matches),'candidate_deal_amount_equal_within_1_ils':int((matches.price-matches.deal).abs().le(1).sum()),'candidate_declared_amount_equal_within_1_ils':int((matches.price-matches.declared).abs().le(1).sum()),'new_rows_existing_nonzero_subparcel_new_date':int((nonzero & parcel.isin(set(old_parcel)) & ~nk.isin(set(ok))).sum()),'nonzero_subparcel_area_rooms_multi_date_groups':int(groups.gt(1).sum())})
    pd.DataFrame(results).to_csv(OUT/'legacy_comparison.csv',index=False)
    print('legacy comparison complete',flush=True)


def main():
    OUT.mkdir(parents=True,exist_ok=True)
    versions=json.loads((RAW/'metadata/versions.json').read_text())
    latest=max(versions,key=lambda v:v['version_number'])
    h=profile('latest', [local_path(r) for r in latest['resources']])
    compare_legacy(latest)
    append=RAW/'append_all.csv'
    if append.exists():
        ah=profile('append',[append])
        comparison={'shared_business_hashes':len(np.intersect1d(h,ah,assume_unique=True)), 'latest_only_business_hashes':len(np.setdiff1d(h,ah,assume_unique=True)), 'append_only_business_hashes':len(np.setdiff1d(ah,h,assume_unique=True))}
        (OUT/'append_vs_latest.json').write_text(json.dumps(comparison,indent=2)+'\n');print(comparison,flush=True)
    (OUT/'assessment_run.json').write_text(json.dumps({'assessed_at':datetime.now(timezone.utc).isoformat(),'cutoff_date':str(CUTOFF.date()),'latest_version':latest['version_number'],'business_signature_columns':BUSINESS,'duplicate_method':'64-bit pandas row hashes; collisions theoretically possible; duplicate counts are candidate identity, not proof of duplicate transactions'},indent=2)+'\n')


if __name__=='__main__': main()
