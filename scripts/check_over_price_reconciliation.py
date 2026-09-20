#!/usr/bin/env python3
"""Compare one-to-one parcel/date candidates, including rounding and sale shares.

Empirical comparisons do not establish official semantics for either amount.
This script writes evidence only; it never changes transaction prices.
"""
import json,sys
from pathlib import Path
import pandas as pd
sys.path.insert(0,str(Path(__file__).resolve().parent))
from profile_over_nadlan import local_path, normalized_id, RAW, OUT, ROOT
v=json.loads((RAW/'metadata/versions.json').read_text())[0]
resources={r['name'].split(' — ',1)[-1]:r for r in v['resources']}
m=json.loads((ROOT/'data/manifest.json').read_text())
result=[]
for city,info in m['cities'].items():
 n=pd.read_csv(local_path(resources[city]),dtype=str,keep_default_na=False)
 o=pd.read_parquet(ROOT/'data/cities'/info['file'])
 a=[normalized_id(n[c]) for c in ['gush','chelka','sub_chelka']]
 nk=a[0]+'-'+a[1]+'-'+a[2]+'|'+pd.to_datetime(n.deal_date,format='%d/%m/%Y').dt.strftime('%Y-%m-%d')
 p=o.GUSH.astype('string').str.split('-',expand=True);a=[normalized_id(p[c]) for c in [0,1,2]]
 ok=a[0]+'-'+a[1]+'-'+a[2]+'|'+pd.to_datetime(o.date).dt.strftime('%Y-%m-%d')
 nn=pd.DataFrame({'key':nk,'deal':pd.to_numeric(n.deal_amount),'declared':pd.to_numeric(n.declared_amount),'portion':pd.to_numeric(n.portion)})
 oo=pd.DataFrame({'key':ok,'legacy':o.price_millions*1e6})
 j=oo[~oo.key.duplicated(False)].merge(nn[~nn.key.duplicated(False)],on='key',validate='one_to_one')
 for label,mask in [('whole',j.portion.eq(1)),('partial',j.portion.gt(0)&j.portion.lt(1)),('zero',j.portion.eq(0))]:
  d=j[mask];r={'city':city,'portion_group':label,'candidate_rows':len(d)}
  for field in ['deal','declared']:
   for tolerance in [1,500,1000]:r[f'{field}_within_{tolerance}']=int((d.legacy-d[field]).abs().le(tolerance).sum())
   r[f'{field}_divided_by_portion_within_1000']=int((d.legacy-d[field]/d.portion.where(d.portion.gt(0))).abs().le(1000).sum())
  result.append(r)
pd.DataFrame(result).to_csv(OUT/'price_reconciliation.csv',index=False)
print(pd.DataFrame(result).groupby('portion_group').sum(numeric_only=True).to_string())
