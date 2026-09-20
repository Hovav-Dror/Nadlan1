#!/usr/bin/env python3
"""Check whether append-only content differs merely by numeric formatting."""
import json
from collections import Counter
import numpy as np
import pandas as pd
from profile_over_nadlan import RAW, OUT, BUSINESS, NUMERIC, local_path

ID = ['settlement_code','gush','chelka','sub_chelka']
KEY = ID+['deal_date']


def canonical(df):
    result = df[BUSINESS].copy()
    for c in ID+NUMERIC:
        result[c] = pd.to_numeric(result[c],errors='coerce').astype('float64')
    result['deal_date']=pd.to_datetime(result.deal_date,format='%d/%m/%Y',errors='coerce').dt.strftime('%Y-%m-%d')
    result['settlement']=result.settlement.str.strip()
    result['deal_nature']=result.deal_nature.str.strip()
    return result


def main():
    version=max(json.loads((RAW/'metadata/versions.json').read_text()), key=lambda v:v['version_number'])
    full,keys,no_code=[],[],[]
    for resource in version['resources']:
        for df in pd.read_csv(local_path(resource),dtype=str,keep_default_na=False,chunksize=200000):
            d=canonical(df)
            full.append(pd.util.hash_pandas_object(d,index=False).to_numpy())
            keys.append(pd.util.hash_pandas_object(d[KEY],index=False).to_numpy())
            no_code.append(pd.util.hash_pandas_object(d.drop(columns='settlement_code'),index=False).to_numpy())
    h=np.unique(np.concatenate(full)); k=np.unique(np.concatenate(keys))
    nc=np.unique(np.concatenate(no_code))
    total=Counter();cities=Counter();years=Counter();samples=[];all_append=[];append_no_code=[]
    for df in pd.read_csv(RAW/'append_all.csv',dtype=str,keep_default_na=False,chunksize=200000):
        d=canonical(df);dh=pd.util.hash_pandas_object(d,index=False).to_numpy();all_append.append(dh)
        extra=~np.isin(dh,h)
        nh=pd.util.hash_pandas_object(d.drop(columns='settlement_code'),index=False).to_numpy()
        append_no_code.append(nh)
        code_agnostic_match=np.isin(nh,nc)
        total['extra_matching_latest_when_ignoring_settlement_code']+=int((extra&code_agnostic_match).sum())
        total['extra_unmatched_even_ignoring_settlement_code']+=int((extra&~code_agnostic_match).sum())
        total['extra_missing_settlement_code']+=int((extra&df.settlement_code.eq('')).sum())
        weak=pd.util.hash_pandas_object(d[KEY],index=False).to_numpy()
        existing_key=np.isin(weak,k)
        total['normalized_append_only_rows']+=int(extra.sum())
        total['extra_with_existing_parcel_date_key']+=int((extra&existing_key).sum())
        total['extra_with_new_parcel_date_key']+=int((extra&~existing_key).sum())
        e=df.loc[extra]
        cities.update(e.groupby(['settlement_code','settlement']).size().to_dict())
        years.update(pd.to_datetime(e.deal_date,format='%d/%m/%Y').dt.year.value_counts().to_dict())
        if len(samples)<20:
            samples.extend(e.head(20-len(samples)).to_dict('records'))
    ah=np.concatenate(all_append)
    total['normalized_append_unique_signatures']=len(np.unique(ah))
    total['normalized_append_duplicate_excess']=len(ah)-len(np.unique(ah))
    an=np.concatenate(append_no_code)
    total['append_unique_signatures_ignoring_settlement_code']=len(np.unique(an))
    total['append_duplicate_excess_ignoring_settlement_code']=len(an)-len(np.unique(an))
    (OUT/'append_extras_check.json').write_text(json.dumps({'counts':dict(total),'method':'Numeric columns coerced to float64, dates to ISO; trimmed settlement and type. Compared 64-bit content hashes. Parcel/date key is not a unique transaction identifier.','years':dict(sorted(years.items()))},ensure_ascii=False,indent=2)+'\n')
    pd.DataFrame([{'settlement_code':key[0],'settlement':key[1],'extra_rows':value} for key,value in cities.items()]).sort_values('extra_rows',ascending=False).to_csv(OUT/'append_extra_cities.csv',index=False)
    pd.DataFrame(samples).to_csv(OUT/'append_extra_sample.csv',index=False)
    print(dict(total),flush=True)


if __name__=='__main__':main()
