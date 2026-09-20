"""Independent address/API/export audit against stored rows in every pilot city.

Run: .venv/bin/python backend/verify_address_search.py
Writes an inspectable receipt to reports/address_search_2026_09_20/audit.json.
"""
import json
import re
import sys
from io import StringIO
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from backend.app import create_app
from backend.pilot import PilotConfig
from backend.services.address_search import address_mask
from backend.services.calculations import apply_common_filters
from backend.services.deal_history import deal_history


def edge_cases(client):
    values = pd.Series(['בויאר אברהם 12, תל אביב-יפו', 'בויאר אברהם 120, תל אביב-יפו',
                        'בויאר אברהם 312', 'ז׳בוטינסקי 12', 'ז\'בוטינסקי 12', 'זבוטינסקי 12', None])
    for query in ['בויאר 12', 'אברהם בויאר 12', 'רחוב בויאר, 12 תל אביב יפו', '  בויאר   12  ']:
        assert list(values[address_mask(values, query)].index) == [0], query
    assert list(values[address_mask(values, 'ז״בוטינסקי 12')].index) == [3, 4, 5]
    assert not address_mask(values, '---').any()
    assert not address_mask(values, 'רחוב').any()
    response = client.post('/api/address-lookup', json={'city':'tel_aviv_yafo', 'address':'---'})
    assert response.status_code == 400
    for args in [{}, {'city':'no-such-city','record':'missing'}, {'city':'tel_aviv_yafo','record':'missing'}]:
        assert client.get('/api/deals/detail',query_string=args).status_code == 400

    from backend.services.filter_metadata import build_filter_options_from_frame
    tiny = pd.DataFrame({'price_millions':[1.23456,2.34567], 'area':[55.12345,99.98765]})
    ranges = build_filter_options_from_frame(tiny,[])['ranges']
    for column in ['price_millions','area']:
        assert ranges[column]['min'] <= tiny[column].min()
        assert ranges[column]['max'] >= tiny[column].max()

    # Full cadastral key required, even when the entire building shares a parcel.
    class Store:
        def load_city(self, city):
            return pd.DataFrame([dict(city='test',GUSH=key,date=date,price_millions=1,area=50,rooms=2,
                **{'_record_id':record,'sale_portion':share}) for key,date,record,share in [
                    ('1-2-0','2020-01-01','a',1),('1-2-0','2022-01-01','b',1),
                    ('1-2-3','2020-01-01','c',.5),('1-2-3','2020-01-01','d',.5),
                    ('1-2-3','2024-01-01','e',1),('1-2-4','2024-01-01','f',1)]])
    assert deal_history(Store(),None,'test','a')['records'] == 1
    history = deal_history(Store(),None,'test','c')
    assert history['records'] == 3 and history['distinct_dates'] == 2
    assert any(row['record_id']=='d' and row['same_date'] for row in history['related'])


def run():
    app = create_app(PilotConfig)
    client = app.test_client()
    store = app.extensions['nadlan2_data_store']
    legacy = app.extensions['legacy_address_store']
    edge_cases(client)
    receipt = {'dataset':store.load_manifest().get('dataset_id'), 'cities':[], 'checks':0}

    def post(url,payload):
        response = client.post(url,json=payload)
        assert response.status_code == 200,(url,payload,response.data[:500])
        receipt['checks'] += 1
        return response.get_json()['data']

    for city in store.load_app_metadata()['cities']:
        city_id = city['id']
        frame = store.load_city(city_id)
        eligible = frame[frame.FULLADRESS.notna() & frame.street.notna() & frame.sale_portion.eq(1)]
        # One recent address, one with punctuation where available, and seeded random addresses.
        recent = eligible.sort_values('date',ascending=False).iloc[0]
        punctuation = eligible[eligible.street.str.contains(r"['׳״\"-]",regex=True)]
        picks = [recent] + ([punctuation.iloc[0]] if len(punctuation) else [])
        picks += [row for _,row in eligible.sample(n=min(4,len(eligible)),random_state=17).iterrows()]
        picks = list({str(row.FULLADRESS):row for row in picks}.values())[:5]
        city_result = {'city':city_id,'rows':len(frame),'missing_address':int(frame.FULLADRESS.isna().sum()),'addresses':[]}
        for pick in picks:
            address = str(pick.FULLADRESS)
            # Exact stored-address source rows are the independent recall oracle.
            expected = set(frame.loc[frame.FULLADRESS.eq(address) & frame.sale_portion.eq(1),'source_id'])
            payload = {'city':city_id,'filters':{'address':address},'limit':5000,'remove_price_outliers':False}
            data = post('/api/analysis/deals',payload)
            ids = {row['source_id'] for row in data['table_rows']}
            assert expected <= ids,(city_id,address,'missing records',expected-ids)
            assert len(ids) == len(data['points']) == len(data['table_rows'])
            assert {r['id'] for r in data['table_rows']} == {r['id'] for r in data['points']}
            # Reverse name/house/city token order; remove typography without changing meaning.
            tokens = re.findall(r'[^\W_]+',re.sub(r"['׳״\"]",'',address))
            variant = '  , '.join(reversed(tokens))
            variants = post('/api/analysis/deals',{**payload,'filters':{'address':variant}})
            assert {r['source_id'] for r in variants['table_rows']} == ids,(city_id,address,variant)
            streets = store.search_streets(' '.join(reversed(str(pick.street).split())),city_id,limit=100)
            assert pick.street in {r['street'] for r in streets},(city_id,pick.street)
            assert pick.street in store.streets_for_city(city_id)
            city_result['addresses'].append({'address':address,'exact_source_rows':len(expected),'returned_rows':len(ids),'latest':data['summary']['date_max']})

        # CSV must use all address matches, even if the plot's row limit is one.
        small = {**payload,'limit':1}
        limited = post('/api/analysis/deals',small)
        exported = client.post('/api/download/analysis',json=small)
        assert exported.status_code == 200
        csv = pd.read_csv(StringIO(exported.data.decode('utf-8-sig')))
        assert set(csv.source_id) == ids
        assert len(limited['table_rows']) == min(1,len(ids))
        receipt['checks'] += 1

        # Real-record history must include all new and old records with that exact full key.
        key_pick = eligible[eligible.GUSH.str.match(r'^\d+-\d+-[1-9]\d*$',na=False)].iloc[0]
        history = client.get('/api/deals/detail',query_string={'city':city_id,'record':key_pick.source_id})
        assert history.status_code == 200,history.data[:500]
        history = history.get_json()['data']
        history_rows = [history['deal']] + history['related']
        expected_new = set(frame.loc[frame.GUSH.eq(key_pick.GUSH),'source_id'])
        assert expected_new <= {r['record_id'] for r in history_rows}
        assert history['distinct_dates'] == len({r['date'] for r in history_rows if r['date']})
        assert all(r['price_ils'] is not None for r in history_rows if r['price_millions'] is not None)
        receipt['checks'] += 1

        # Legacy source-only addresses remain discoverable in the two-source finder.
        old = legacy.load_city(city_id)
        old_candidates = old[old.FULLADRESS.notna() & old.GUSH.notna()]
        for _,old_pick in old_candidates.sample(n=min(40,len(old_candidates)),random_state=11).iterrows():
            ref = old[old.FULLADRESS.eq(old_pick.FULLADRESS)]
            if len(ref) <= 25:
                break
        discovery = post('/api/address-lookup',{'city':city_id,'address':str(old_pick.FULLADRESS),'year_from':1900,'year_to':2100})
        covered = {r for row in discovery['rows'] for r in row['legacy_reference_ids']}
        refs = {f'{city["name"]}:{i}' for i in ref.index if pd.notna(ref.loc[i,'date'])}
        assert refs <= covered,(city_id,'legacy rows lost',refs-covered)
        city_result['legacy_address'] = str(old_pick.FULLADRESS)
        city_result['legacy_rows_preserved'] = len(refs)
        receipt['cities'].append(city_result)
        print(city_id, 'PASS', len(picks), 'addresses', flush=True)

    # Boyar-specific evidence plus independent filter variations.
    payload = {'city':'tel_aviv_yafo','filters':{'address':'בויאר 12','floor_range':[5,5],
               'include_unknown':{'floor':False}},'remove_price_outliers':False}
    all_rows = post('/api/analysis/deals',payload)['table_rows']
    assert sorted(r['date'] for r in all_rows) == ['2004-12-12','2020-06-25','2023-08-06']
    assert not post('/api/analysis/deals',{**payload,'filters':{**payload['filters'],'location_basis':'verified'}})['table_rows']
    recent = post('/api/analysis/deals',{**payload,'filters':{**payload['filters'],'deal_year_range':[2020,2026]}})['table_rows']
    assert len(recent) == 2
    history = client.get('/api/deals/detail',query_string={'city':'tel_aviv_yafo','record':recent[0]['record_id']}).get_json()['data']
    assert history['distinct_dates'] == 3 and history['records'] == 4
    assert sum(row['parallel_source'] for row in history['related']) == 1
    receipt['boyar'] = {'dates':sorted(r['date'] for r in all_rows),'history_records':history['records'],'history_dates':history['distinct_dates']}
    receipt['status'] = 'PASS'
    receipt['address_count'] = sum(len(c['addresses']) for c in receipt['cities'])
    output = ROOT/'reports/address_search_2026_09_20/audit.json'
    output.parent.mkdir(parents=True,exist_ok=True)
    output.write_text(json.dumps(receipt,ensure_ascii=False,indent=2)+'\n')
    print('PASS:', receipt['address_count'],'addresses in',len(receipt['cities']),'cities;',receipt['checks'],'route checks')


if __name__ == '__main__':
    run()
