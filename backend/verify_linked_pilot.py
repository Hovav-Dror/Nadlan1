"""Verify normal analysis/filter-options/export routes, including the Boyar regression."""
import sys
from pathlib import Path
from io import StringIO
import json
import pandas as pd
ROOT=Path(__file__).resolve().parents[1];sys.path[:0]=[str(ROOT),str(ROOT/'scripts')]
from link_over_pilot_locations import link_locations
from backend.app import create_app
from backend.pilot import PilotConfig


def synthetic():
    legacy=pd.DataFrame([dict(GUSH='1-2-3',street='רחוב',FULLADRESS='רחוב 12',floor=5)])
    frame=pd.DataFrame([dict(GUSH='1-2-3',street=None,FULLADRESS=None,floor=None,legacy_match='unmatched',legacy_record_id=None,area=98,rooms=4,quality_flags='missing_address;missing_floor')])
    result=link_locations(frame,legacy,'עיר')
    assert result.floor.iloc[0]==5 and result.location_basis.iloc[0]=='property_reference'
    assert result.verified_floor.isna().all() and result.legacy_match.iloc[0]=='unmatched'
    assert result.area.iloc[0]==98 and result.rooms.iloc[0]==4
    conflicting=pd.concat([legacy,legacy.assign(FULLADRESS='רחוב 20')],ignore_index=True)
    assert link_locations(frame,conflicting,'עיר').FULLADRESS.isna().all()
    conflicting=pd.concat([legacy,legacy.assign(floor=6)],ignore_index=True)
    assert link_locations(frame,conflicting,'עיר').floor.isna().all()
    invalid=frame.assign(GUSH='1-2-0')
    assert link_locations(invalid,legacy.assign(GUSH='1-2-0'),'עיר').FULLADRESS.isna().all()
    verified=frame.assign(street='מקורי',FULLADRESS='מקורי 7',floor=2,legacy_match='strict_transaction')
    assert link_locations(verified,legacy,'עיר').floor.iloc[0]==2


def snapshot_and_routes():
    manifest=json.loads((PilotConfig.DATA_DIR/'manifest.json').read_text())
    totals={'rows':0,'reference_linked':0}
    for city,info in manifest['cities'].items():
        base=pd.read_parquet(ROOT/'data_over/cities'/info['file'])
        linked=pd.read_parquet(PilotConfig.DATA_DIR/'cities'/info['file'])
        untouched=[c for c in base.columns if c not in {'street','FULLADRESS','floor','quality_flags'}]
        pd.testing.assert_frame_equal(base[untouched],linked[untouched])
        for col in ['street','FULLADRESS','floor']:
            pd.testing.assert_series_equal(base[col],linked['verified_'+col],check_names=False)
        assert len(linked)==info['rows']
        assert linked.FULLADRESS.isna().sum()==info['coverage']['missing_address']
        assert linked.floor.isna().sum()==info['coverage']['missing_floor']
        totals['rows']+=len(linked);totals['reference_linked']+=int(linked.location_basis.eq('property_reference').sum())
    client=create_app(PilotConfig).test_client()
    base={'city':'tel_aviv_yafo','streets':['בויאר אברהם'],'price_type':'Price','limit':5000,
          'filters':{'floor_range':[5,5],'rooms':[4,5],'include_unknown':{'floor':False}},'remove_price_outliers':True}
    def post(url,payload):
        r=client.post(url,json=payload);assert r.status_code==200,(url,r.data[:800]);return r.get_json()['data']
    result=post('/api/analysis/deals',base)
    rows=[r for r in result['table_rows'] if '12,' in (r['address'] or '')]
    assert sorted(r['date'] for r in rows)==['2004-12-12','2020-06-25','2023-08-06']
    assert all(r['location_basis']=='property_reference' for r in rows)
    assert any('ייחוס לפי מזהה' in (point['tooltip'] or '') for point in result['points'])
    strict=post('/api/analysis/deals',{**base,'filters':{**base['filters'],'location_basis':'verified'}})
    assert not any('12,' in (r['address'] or '') for r in strict['table_rows'])
    options=post('/api/filter-options',{'city':'tel_aviv_yafo','streets':['בויאר אברהם']})
    assert options['ranges']['deal_year']['max']>=2025,options['ranges']
    csv_response=client.post('/api/download/analysis',json=base)
    assert csv_response.status_code==200
    csv=pd.read_csv(StringIO(csv_response.data.decode('utf-8-sig')))
    found=csv[csv['Gush Code'].eq('6631-193-38')]
    assert sorted(found.Date.tolist())==['2004-12-12','2020-06-25','2023-08-06']
    assert found.location_basis.eq('property_reference').all() and found.verified_floor.isna().all()
    all_street=post('/api/analysis/deals',{**base,'filters':{},'remove_price_outliers':False})
    assert all_street['summary']['year_max']==2025
    print(json.dumps({'result':'PASS','totals':totals,'boyar_full_sales':all_street['counts']['filtered_rows'],
        'boyar_full_sales_after_2016':sum(r['deal_year']>2016 for r in all_street['table_rows']),
        'boyar_latest_date':all_street['summary']['date_max'],'target_dates':sorted(r['date'] for r in rows)},ensure_ascii=False,indent=2))

if __name__=='__main__':synthetic();snapshot_and_routes()
