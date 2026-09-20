"""Build a pilot snapshot with explicit cadastral location references for normal analysis.

Source transaction amounts/attributes are never replaced. Original strictly matched
location fields remain in verified_* columns; inferred locations are labelled.
"""
import argparse
import hashlib
import json
import shutil
from pathlib import Path
from datetime import datetime, timezone
import pandas as pd
from import_over_pilot import cadastral, coverage
ROOT=Path(__file__).resolve().parents[1]


def link_locations(frame, legacy, city):
    result=frame.copy()
    for col in ['street','FULLADRESS','floor']:
        result['verified_'+col]=result[col]
    result['location_basis']=result.legacy_match.where(result.legacy_match.eq('strict_transaction'),'unmatched')
    result['location_reference_id']=result.legacy_record_id
    old=legacy.copy().reset_index(drop=True)
    old['_key'], valid=cadastral(old,legacy=True)
    old['_ref']=old.index.map(lambda i:f'{city}:{i}')
    for col in ['street','FULLADRESS']:
        old[col]=old[col].astype('string').str.strip().replace('',pd.NA)
    old['floor']=pd.to_numeric(old.floor,errors='coerce').where(lambda x:x.between(-10,200))
    candidates=old[valid].groupby('_key')
    unique=candidates.agg(addresses=('FULLADRESS','nunique'),streets=('street','nunique'),floors=('floor','nunique'))
    safe=unique.index[(unique.addresses==1)&(unique.streets==1)&(unique.floors<=1)]
    donor=old[old._key.isin(safe)].groupby('_key').agg(
        street=('street','first'),FULLADRESS=('FULLADRESS','first'),floor=('floor','first'),
        reference=('_ref',lambda x:';'.join(x)))
    keys,_=cadastral(result,legacy=True)
    added=pd.Series(False,index=result.index)
    for col in ['street','FULLADRESS','floor']:
        values=keys.map(donor[col])
        mask=result[col].isna() & values.notna()
        result.loc[mask,col]=values[mask]
        added |= mask
    result.loc[added,'location_basis']='property_reference'
    result.loc[added,'location_reference_id']=keys[added].map(donor.reference)
    # Recalculate missingness of displayed fields, while reference status stays explicit.
    flags=pd.Series('',index=result.index)
    for flag,col in [('missing_address','FULLADRESS'),('missing_floor','floor'),('missing_area','area'),('missing_rooms','rooms')]:
        mask=result[col].isna()
        flags.loc[mask]=flags.loc[mask]+flag+';'
    flags.loc[added]=flags.loc[added]+'location_reference;'
    result['quality_flags']=flags.str.rstrip(';')
    return result


def main():
    parser=argparse.ArgumentParser();parser.add_argument('--output-root',type=Path,default=ROOT/'data_over_linked')
    args=parser.parse_args();target=args.output_root.resolve()
    if target.exists():raise SystemExit('Use a new output directory; existing snapshots are not overwritten.')
    source=ROOT/'data_over';legacy_manifest=json.loads((ROOT/'data/manifest.json').read_text())
    manifest=json.loads((source/'manifest.json').read_text())
    target.mkdir(parents=True);(target/'cities').mkdir();shutil.copytree(source/'metadata',target/'metadata')
    manifest['dataset_id']='over-pilot-v5-location-references-v1'
    manifest['generated_at']=datetime.now(timezone.utc).isoformat()
    manifest['source']['location_references']=True
    manifest['source']['label']='גרסאות לעם — פיילוט 20 ערים, כולל ייחוס כתובות לפי מזהה'
    manifest['location_policy']={'join':'city + positive gush/chelka/sub_chelka','require':'one distinct nonempty address and street; no conflicting known floors in legacy',
        'basis':'property_reference is not a verified transaction match','preserved':'verified_street, verified_FULLADRESS, verified_floor; all source transaction amounts and attributes',
        'default':'include labelled property references in normal analysis','base_manifest_sha256':hashlib.sha256((source/'manifest.json').read_bytes()).hexdigest()}
    descriptions=[];lookups=[];report=[]
    for city,record in manifest['cities'].items():
        data=pd.read_parquet(source/'cities'/record['file'])
        old=pd.read_parquet(ROOT/'data/cities'/legacy_manifest['cities'][city]['file'])
        linked=link_locations(data,old,city)
        linked.to_parquet(target/'cities'/record['file'],index=False)
        cov=coverage(linked);cov['reference_linked_transactions']=int(linked.location_basis.eq('property_reference').sum())
        record['coverage']=cov
        report.append({'city':city,**cov})
        lookups.append(linked.dropna(subset=['Gush','street'])[['city','street','Gush']].drop_duplicates())
        groups=linked.dropna(subset=['Gush']).groupby('Gush').size().rename('n').reset_index()
        representative=linked.dropna(subset=['Gush','street']).groupby('Gush').street.first()
        groups['street']=groups.Gush.map(representative);groups['city']=city
        groups['Gush_desc']=groups.Gush.astype(int).astype(str)+' — '+city
        descriptions.append(groups)
        print(city,cov['reference_linked_transactions'],flush=True)
    for name,frames in [('gush_descriptions',descriptions),('unique_gush_streets',lookups)]:
        metadata=pd.concat(frames,ignore_index=True);metadata.to_parquet(target/'metadata'/f'{name}.parquet',index=False)
        manifest['metadata'][name]['rows']=len(metadata)
    (target/'import_report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
    (target/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
    print('Complete',target,flush=True)


if __name__=='__main__':main()
