"""Trace why legacy Tel Aviv transactions are not address-searchable in the OVER pilot.

Run from any directory with the project Python environment. No source data is changed.
Counts describe candidate matching, not proof that an unmatched transaction is absent.
"""
import json,sys
from pathlib import Path
import pandas as pd
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'scripts'))
from import_over_pilot import cadastral, number, KEY
from profile_over_nadlan import RAW, local_path
city='תל אביב -יפו'
manifest=json.loads((ROOT/'data/manifest.json').read_text());filename=manifest['cities'][city]['file']
old=pd.read_parquet(ROOT/'data/cities'/filename).reset_index(drop=True)
pilot=pd.read_parquet(ROOT/'data_over/cities'/filename)
v=max(json.loads((RAW/'metadata/versions.json').read_text()),key=lambda v:v['version_number'])
r=next(r for r in v['resources'] if r['name'].split(' — ',1)[-1]==city)
raw=pd.read_csv(local_path(r),dtype=str,keep_default_na=False)
old['GUSH'],old_valid=cadastral(old,legacy=True);old['date']=pd.to_datetime(old.date)
raw['GUSH'],raw_valid=cadastral(raw);raw['date']=pd.to_datetime(raw.deal_date,format='%d/%m/%Y')
old['key']=old.GUSH+'|'+old.date.dt.strftime('%Y-%m-%d')
raw['key']=raw.GUSH+'|'+raw.date.dt.strftime('%Y-%m-%d')
key_counts=raw.key.value_counts()
old['raw_candidates']=old.key.map(key_counts).fillna(0).astype(int)
old['old_candidates']=old.key.map(old.key.value_counts())
old['legacy_record_id']=old.index.map(lambda i:f'{city}:{i}')
old['enriched']=old.legacy_record_id.isin(pilot.legacy_record_id.dropna())
raw_one=raw[~raw.key.duplicated(False)].set_index('key')
joined=old.join(raw_one[['portion','deal_amount','asset_area','room_num','year_built','deal_nature']],on='key')
joined['reason']='strict_attributes_disagree_or_missing'
joined.loc[number(joined.portion).ne(1),'reason']='share_not_full'
joined.loc[joined.old_candidates.gt(1),'reason']='legacy_key_ambiguous'
joined.loc[joined.raw_candidates.gt(1),'reason']='new_key_ambiguous'
joined.loc[joined.raw_candidates.eq(0),'reason']='no_key_date_in_new_source'
joined.loc[~old_valid,'reason']='invalid_legacy_cadastral_key'
joined.loc[joined.enriched,'reason']='enriched'
summary={'city':city,'old_rows':len(old),'old_with_address':int(old.FULLADRESS.notna().sum()),'raw_rows':len(raw),'pilot_rows':len(pilot),'pilot_with_address':int(pilot.FULLADRESS.notna().sum()),'old_streets':int(old.street.nunique()),'pilot_streets':int(pilot.street.nunique()),'reason_counts':joined.reason.value_counts().to_dict()}
matched=joined[joined.reason.eq('strict_attributes_disagree_or_missing')]
summary['attribute_failures_overlapping']={
 'price':int((matched.price_millions*1e6-number(matched.deal_amount)).abs().gt(1000.001).sum()),
 'area':int((number(matched.area).le(0)|number(matched.asset_area).le(0)|number(matched.area).isna()|number(matched.asset_area).isna()|(number(matched.area)-number(matched.asset_area)).abs().gt(.5)).sum()),
 'rooms':int((number(matched.rooms).le(0)|number(matched.room_num).le(0)|number(matched.rooms).isna()|number(matched.room_num).isna()|(number(matched.rooms)-number(matched.room_num)).abs().ge(.001)).sum()),
 'year':int((number(matched.build_year).gt(0)&number(matched.year_built).gt(0)&number(matched.build_year).ne(number(matched.year_built))).sum())}
OUT=ROOT/'reports/over_2026_09_19'
joined.to_parquet(OUT/'tel_aviv_address_coverage_audit.parquet',index=False)
(OUT/'tel_aviv_address_coverage_audit.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2)+'\n')
print(json.dumps(summary,ensure_ascii=False,indent=2))
