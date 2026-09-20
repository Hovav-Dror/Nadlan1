#!/usr/bin/env python3
"""Build a reproducible 20-city OVER pilot without modifying legacy data.

Full residential sales are the server/UI default. Other residential shares are
retained for explicit exploration. Legacy enrichment is transaction-specific.
"""
import argparse
import hashlib
import json
import shutil
from datetime import datetime, timezone
from pathlib import Path
import pandas as pd
from profile_over_nadlan import RAW, RESIDENTIAL, local_path

ROOT = Path(__file__).resolve().parents[1]
RUNTIME = json.loads((ROOT/'data/manifest.json').read_text())['required_city_columns']
KEY = ['GUSH', 'date']


def number(series):
    return pd.to_numeric(series, errors='coerce')


def cadastral(frame, legacy=False):
    parts = frame.GUSH.astype('string').str.split('-', expand=True) if legacy else frame[['gush','chelka','sub_chelka']].copy()
    parts.columns = [0,1,2]
    numeric = parts.apply(number)
    valid = numeric.gt(0).all(axis=1) & numeric.mod(1).eq(0).all(axis=1)
    strings = [numeric[c].astype('Int64').astype('string') for c in [0,1,2]]
    return strings[0]+'-'+strings[1]+'-'+strings[2], valid


def transform(raw, legacy, *, city, source_file, source_version, cutoff):
    data=pd.DataFrame(index=raw.index)
    data['city']=city
    data['GUSH'], valid_key=cadastral(raw)
    data['Gush']=number(raw.gush)
    data['date']=pd.to_datetime(raw.deal_date,format='%d/%m/%Y',errors='coerce')
    data['deal year']=data.date.dt.year.astype(float)
    data['deal_amount']=number(raw.deal_amount)
    data['declared_amount']=number(raw.declared_amount)
    data['sale_portion']=number(raw.portion)
    data['price_millions']=data.deal_amount/1e6
    for target,source in [('area','asset_area'),('rooms','room_num'),('build_year','year_built')]:
        values=number(raw[source]); data[target]=values.where(values.gt(0))
    data['building age']=data['deal year']-data.build_year
    data['apt type']=raw.deal_nature
    data['settlement_code']=raw.settlement_code
    data['scraped_at']=raw.scraped_at
    data['source_version']=source_version
    data['source_file']=source_file
    data['source_row']=raw.index+2  # CSV line, including its header
    data['source_id']=source_file+':'+data.source_row.astype(str)
    data['source']='over_tax_authority'
    data['legacy_match']='unmatched'
    data['legacy_record_id']=None
    for col in ['street','FULLADRESS','floor','build_floors','roof','New_Project']:
        data[col]=None

    # Determine uniqueness BEFORE the residential filter so a competing row of
    # another type/share cannot accidentally become a unique matching candidate.
    old=legacy.copy().reset_index(drop=True)
    old['legacy_record_id']=old.index.map(lambda i:f'{city}:{i}')
    old['GUSH'], old_valid=cadastral(old,legacy=True)
    old['date']=pd.to_datetime(old.date,errors='coerce')
    new_unique=~data.duplicated(KEY,keep=False)
    old_unique=~old.duplicated(KEY,keep=False)
    donor=old.loc[old_valid & old_unique, KEY+['price_millions','area','rooms','build_year','street','FULLADRESS','floor','build_floors','legacy_record_id']]
    candidate=data.loc[valid_key & new_unique & data.sale_portion.eq(1), KEY+['price_millions','area','rooms','build_year']].reset_index(names='_row')
    matched=candidate.merge(donor,on=KEY,suffixes=('_new','_old'),validate='one_to_one')
    # Legacy prices are rounded; accept at most ILS 1,000, never scale shares.
    good=(matched.price_millions_new-matched.price_millions_old).abs().le(.001000001)
    good &= matched.area_new.gt(0)&matched.area_old.gt(0)&(matched.area_new-matched.area_old).abs().le(.5)
    good &= matched.rooms_new.gt(0)&matched.rooms_old.gt(0)&(matched.rooms_new-matched.rooms_old).abs().lt(.001)
    years_known=matched.build_year_new.gt(0)&matched.build_year_old.gt(0)
    good &= ~years_known | matched.build_year_new.eq(matched.build_year_old)
    accepted=matched.loc[good].set_index('_row')
    for col in ['street','FULLADRESS','legacy_record_id']:
        values=accepted[col].astype('string').str.strip().replace('',pd.NA)
        data.loc[accepted.index,col]=values
    for col in ['floor','build_floors']:
        values=number(accepted[col]); values=values.mask(values.eq(999))
        data.loc[accepted.index,col]=values
    data.loc[accepted.index,'legacy_match']='strict_transaction'
    for col in ['floor','build_floors']:
        data[col]=number(data[col])
    data['roof']=pd.Series(pd.NA,index=data.index,dtype='boolean')
    # Neither construction year nor absent project flags establish new/used.
    data['New_Project']=pd.Series(pd.NA,index=data.index,dtype='string')
    data['story']=''
    valid=data['apt type'].isin(RESIDENTIAL)&data.date.notna()&data.date.le(cutoff)&data.deal_amount.gt(0)
    data=data.loc[valid].copy()
    data['quality_flags']=data.apply(lambda row:';'.join(
        name for name,col in [('missing_address','FULLADRESS'),('missing_floor','floor'),('missing_area','area'),('missing_rooms','rooms')]
        if pd.isna(row[col]) or row[col]==''),axis=1)
    data['date']=data.date.dt.date
    data=data[RUNTIME+[c for c in data.columns if c not in RUNTIME]]
    return data


def coverage(data):
    return {
        'min_date':str(data.date.min()),'max_date':str(data.date.max()),
        'scraped_from':str(pd.to_datetime(data.scraped_at,format='mixed',utc=True).min()),
        'scraped_to':str(pd.to_datetime(data.scraped_at,format='mixed',utc=True).max()),
        'rows':len(data),'whole_sales':int(data.sale_portion.eq(1).sum()),
        'partial_sales':int((data.sale_portion.gt(0)&data.sale_portion.lt(1)).sum()),
        'unknown_share':int((data.sale_portion.isna()|data.sale_portion.le(0)|data.sale_portion.gt(1)).sum()),
        'enriched_transactions':int(data.legacy_match.eq('strict_transaction').sum()),
        'missing_address':int(data.FULLADRESS.isna().sum()),'missing_floor':int(data.floor.isna().sum()),
        'missing_rooms':int(data.rooms.isna().sum()),'missing_area':int(data.area.isna().sum()),
    }


def main():
    parser=argparse.ArgumentParser();parser.add_argument('--output-root',type=Path,default=ROOT/'data_over')
    args=parser.parse_args(); target=args.output_root.resolve()
    if target==ROOT/'data' or target.exists():
        raise SystemExit('Use a new output directory; legacy data and existing snapshots are never overwritten.')
    target.mkdir(parents=True);(target/'cities').mkdir();(target/'metadata').mkdir()
    original=json.loads((ROOT/'data/manifest.json').read_text())
    versions=json.loads((RAW/'metadata/versions.json').read_text());version=max(versions,key=lambda x:x['version_number'])
    cutoff=pd.Timestamp(version['detected_at']).tz_convert(None).normalize()
    inventory={r['url']:r for r in json.loads((RAW/'download_manifest.json').read_text())['files']}
    resources={r['name'].split(' — ',1)[-1]:r for r in version['resources']}
    manifest={'app':'nadlan2','dataset_id':'over-pilot-v'+str(version['version_number']),
        'generated_at':datetime.now(timezone.utc).isoformat(),'required_city_columns':RUNTIME,
        'source':{'label':'גרסאות לעם — רשות המסים | פיילוט 20 ערים','url':'https://www.over.org.il/versions/fd06f5ae-8a4f-4120-b275-8a514ad23499','version':version['version_number'],'detected_at':version['detected_at'],'pilot':True},
        'default_filters':{'sale_portion':'full'},'cities':{},'metadata':{}}
    descriptions=[];lookups=[];report=[];types=set()
    for city,record in original['cities'].items():
        resource=resources[city];path=local_path(resource)
        sha=hashlib.sha256(path.read_bytes()).hexdigest()
        if sha!=inventory[resource['download_url']]['sha256']: raise ValueError(f'Checksum mismatch: {city}')
        raw=pd.read_csv(path,dtype=str,keep_default_na=False)
        if len(raw)!=inventory[resource['download_url']]['rows']:raise ValueError(f'Row count mismatch: {city}')
        if not raw.settlement.eq(city).all():raise ValueError(f'Mixed settlement file: {city}')
        old=pd.read_parquet(ROOT/'data/cities'/record['file'])
        df=transform(raw,old,city=city,source_file=path.name,source_version=version['version_number'],cutoff=cutoff)
        df.to_parquet(target/'cities'/record['file'],index=False)
        cov=coverage(df);manifest['cities'][city]={'file':record['file'],'rows':len(df),'coverage':cov}
        report.append({'city':city,'raw_rows':len(raw),**cov});types.update(df['apt type'].unique())
        streets=df.dropna(subset=['Gush','street'])[['city','street','Gush']].drop_duplicates()
        lookups.append(streets)
        groups=df.dropna(subset=['Gush']).groupby('Gush').size().rename('n').reset_index()
        representative=df.dropna(subset=['Gush','street']).groupby('Gush').street.agg(lambda x:x.value_counts().index[0])
        groups['street']=groups.Gush.map(representative);groups['city']=city
        groups['Gush_desc']=groups.Gush.astype(int).astype(str)+' — '+city
        descriptions.append(groups)
        print(city,len(df),'matched',cov['enriched_transactions'],flush=True)
    for name,frames in [('gush_descriptions',descriptions),('unique_gush_streets',lookups)]:
        df=pd.concat(frames,ignore_index=True);df.to_parquet(target/'metadata'/f'{name}.parquet',index=False)
        manifest['metadata'][name]={'file':f'metadata/{name}.parquet','rows':len(df)}
    (target/'metadata/apt_types.json').write_text(json.dumps({'apt_types':sorted(types)},ensure_ascii=False,indent=2))
    manifest['metadata']['apt_types']={'file':'metadata/apt_types.json','rows':len(types)}
    for name in ['sp500_shekels','gush_polygons']:
        info=original['metadata'][name];shutil.copy2(ROOT/'data'/info['file'],target/info['file']);manifest['metadata'][name]=info
    manifest['city_count']=len(manifest['cities']);manifest['total_city_rows']=sum(r['rows'] for r in manifest['cities'].values())
    manifest['enrichment_policy']={'key':'city + nonzero gush/chelka/sub_chelka + date, unique in both inputs','price_tolerance_ils':1000,'area_tolerance_m2':.5,'rooms':'exact','build_year':'same when both known','sale_portion':1,'copy_fields':['street','FULLADRESS','floor','build_floors'],'scope':'same transaction only; never propagate to other dates'}
    (target/'import_report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
    # Manifest is written last; incomplete builds cannot be selected by the app.
    (target/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
    print('Complete:',target,manifest['total_city_rows'],flush=True)


if __name__=='__main__':main()
