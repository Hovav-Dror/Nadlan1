"""Offline enrichment, snapshot and API checks: python backend/verify_over_pilot.py."""
import json
import sys
from io import StringIO
from pathlib import Path
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
sys.path[:0] = [str(ROOT), str(ROOT / 'scripts')]
from import_over_pilot import transform, coverage
from backend.app import create_app
from backend.pilot import PilotConfig as RunningPilotConfig


class PilotConfig(RunningPilotConfig):
    # This suite validates the original strict enrichment snapshot. Normal-route
    # reference links are verified separately by verify_linked_pilot.py.
    DATA_DIR = ROOT / 'data_over'
from backend.services.calculations import apply_transaction_filters, apply_common_filters
from backend.services.downloads import _normalize_value
from backend.services.analysis_deals import _table_rows


def verify_matching():
    raw = pd.DataFrame([dict(settlement_code='1', gush='10', chelka='20', sub_chelka='1',
        deal_date='01/01/2020', deal_amount='2000000', declared_amount='2000000', portion='1',
        year_built='2000', asset_area='80', room_num='4', deal_nature='דירה בבית קומות', scraped_at='2026-09-01')])
    old = pd.DataFrame([dict(GUSH='10-20-1', date='2020-01-01', price_millions=2., area=80.,
        rooms=4., build_year=2000., street='בדיקה', FULLADRESS='בדיקה 1', floor=3., build_floors=8.)])
    def run(new=raw, legacy=old):
        return transform(new.copy(), legacy.copy(), city='בדיקה', source_file='test.csv',
            source_version=5, cutoff=pd.Timestamp('2026-09-19'))
    good = run()
    assert good.legacy_match.tolist() == ['strict_transaction']
    assert good.floor.tolist() == [3.]
    assert good.roof.isna().all() and good.New_Project.isna().all()
    assert run(legacy=old.assign(price_millions=1.999, area=80.5)).legacy_match.eq('strict_transaction').all()
    for column, value in [('portion', '.5'), ('room_num', '3'), ('asset_area', '81'),
                          ('year_built', '2001'), ('deal_amount', '1990000'), ('sub_chelka', '0')]:
        result = run(raw.assign(**{column:value}))
        assert result.legacy_match.eq('unmatched').all(), column
        assert result.floor.isna().all() and result.FULLADRESS.isna().all(), column
    assert run(legacy=pd.concat([old,old],ignore_index=True)).legacy_match.eq('unmatched').all()
    competing = pd.concat([raw,raw.assign(deal_nature='חנות')],ignore_index=True)
    assert len(run(competing)) == 1
    assert run(competing).legacy_match.eq('unmatched').all()
    other_date = pd.concat([raw,raw.assign(deal_date='01/01/2021')],ignore_index=True)
    assert run(other_date).legacy_match.tolist() == ['strict_transaction','unmatched']
    assert run(legacy=old.assign(floor=999)).floor.isna().all()
    assert run(raw.assign(deal_date='01/01/2027')).empty
    mixed = pd.concat([good.assign(sale_portion=1.),good.assign(sale_portion=.5),good.assign(sale_portion=None)],ignore_index=True)
    assert len(apply_transaction_filters(mixed,{})) == 1
    assert len(apply_transaction_filters(mixed,{'sale_portion':'all'})) == 3
    assert len(apply_transaction_filters(mixed,{'sale_portion':'unknown'})) == 1
    missing = mixed.assign(floor=[3.,None,999.], FULLADRESS=['כתובת',None,None])
    assert len(apply_common_filters(missing,{'floor_range':[0,4]})) == 3
    assert len(apply_common_filters(missing,{'floor_range':[0,4],'include_unknown':{'floor':False}})) == 1
    assert len(apply_transaction_filters(missing,{'sale_portion':'all','data_completeness':'with_address_and_floor'})) == 1
    assert _normalize_value('sale_portion', .0001) == .0001
    table_frame=good.assign(sale_portion=.0001, FULLADRESS=None, _date_sort=pd.Timestamp('2020-01-01'), _deal_id='test')
    table_row=_table_rows(table_frame)[0]
    assert table_row['sale_portion']==.0001 and table_row['address'] is None


def verify_snapshot_and_api():
    app = create_app(PilotConfig)
    client = app.test_client()
    store = app.extensions['nadlan2_data_store']
    manifest = store.load_manifest()
    assert len(manifest['cities']) == 20
    totals = {}
    for city, info in manifest['cities'].items():
        frame = pd.read_parquet(PilotConfig.DATA_DIR/'cities'/info['file'])
        actual = coverage(frame)
        assert actual == info['coverage'], city
        assert len(frame) == info['rows']
        assert frame.source_id.is_unique
        assert frame.roof.isna().all() and frame.New_Project.isna().all()
        enriched = frame.legacy_match.eq('strict_transaction')
        assert frame.loc[enriched,'sale_portion'].eq(1).all()
        assert frame.loc[~enriched,['floor','FULLADRESS','street']].isna().all().all()
        for key in ['rows','whole_sales','partial_sales','unknown_share','enriched_transactions','missing_address','missing_floor']:
            totals[key] = totals.get(key,0)+actual[key]
    assert totals['rows'] == manifest['total_city_rows']
    assert totals['rows'] == totals['whole_sales']+totals['partial_sales']+totals['unknown_share']
    meta = client.get('/api/meta').get_json()['data']
    assert meta['source']['pilot'] and meta['default_filters']['sale_portion']=='full'
    assert all(c.get('coverage') for c in meta['cities'])
    assert 'parquet' not in str(meta) and 'source_root' not in str(meta)
    city = next(c for c in store.list_cities() if c['name']=='רעננה')
    frame = store.load_city(city['id'])
    base = {'city':city['id'],'cities':[city['id']], 'remove_price_outliers':False,'limit':10,'price_type':'Price'}
    def post(endpoint, payload):
        response = client.post(endpoint,json=payload)
        assert response.status_code == 200,(endpoint,response.data[:1000])
        return response.get_json()['data']
    for choice, count in [('full',city['coverage']['whole_sales']),('partial',city['coverage']['partial_sales']),
                          ('unknown',city['coverage']['unknown_share']),('all',len(frame))]:
        payload = {**base,'filters':{'sale_portion':choice}}
        analysis = post('/api/analysis/deals',payload)
        assert analysis['counts']['pre_outlier_rows']==count,(choice,analysis['counts'])
        assert post('/api/city-comparison/summary',payload)['counts']['filtered_deals']==count
        assert post('/api/gush-performance/summary',payload)['counts']['filtered_deals']==count
    default = post('/api/analysis/deals',base)
    assert default['counts']['pre_outlier_rows']==city['coverage']['whole_sales']
    assert all(row['sale_portion']==1 for row in default['table_rows'])
    assert post('/api/analysis/deals',{**base,'filters':{'data_completeness':'with_address_and_floor'}})['counts']['pre_outlier_rows']==int((frame.sale_portion.eq(1)&frame.FULLADRESS.notna()&frame.floor.notna()).sum())
    assert client.post('/api/analysis/deals',json={**base,'filters':{'sale_portion':'invalid'}}).status_code==400
    # Gush lookup must include areas with no enriched street at all.
    lookup = store.load_metadata()
    no_street = set(lookup['gush_descriptions'].Gush)-set(lookup['unique_gush_streets'].Gush)
    assert no_street and store.cities_for_gushes([next(iter(no_street))])
    gush = int(frame.Gush.dropna().mode().iloc[0])
    selected = frame[frame.Gush.eq(gush)]
    for choice in ['full','partial']:
        payload={**base,'gushes':[gush],'filters':{'sale_portion':choice}}
        expected=int((selected.sale_portion.eq(1) if choice=='full' else selected.sale_portion.gt(0)&selected.sale_portion.lt(1)).sum())
        compare_payload={key:value for key,value in payload.items() if key not in {'city','cities'}}
        compare_frame=store.load_cities([c['id'] for c in store.cities_for_gushes([gush])])
        compare_expected=len(apply_transaction_filters(compare_frame,{'gushes':[gush],'sale_portion':choice}))
        assert post('/api/compare/summary',compare_payload)['counts']['filtered_deals']==compare_expected
        compare_rows=post('/api/compare/raw',compare_payload)['rows']
        assert all({'sale_portion','quality_flags','legacy_match'} <= set(row) for row in compare_rows)
        response=client.post('/api/download/analysis',json=payload)
        assert response.status_code==200
        csv=pd.read_csv(StringIO(response.data.decode('utf-8-sig')))
        assert len(csv)==expected
        assert {'Gush Code','sale_portion','source_id','source_version','quality_flags','legacy_match'}<=set(csv.columns)
        assert csv.sale_portion.eq(1).all() if choice=='full' else csv.sale_portion.between(0,1,inclusive='neither').all()
    legacy=create_app().extensions['nadlan2_data_store']
    assert legacy.response_cache.cache_dir!=store.response_cache.cache_dir
    print(json.dumps({'result':'PASS','cities':20,'totals':totals},ensure_ascii=False,indent=2))


if __name__=='__main__':
    verify_matching()
    verify_snapshot_and_api()
