"""Regression checks for legacy address preservation and uncertain property links."""
import sys
from pathlib import Path
import pandas as pd
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
from backend.services.address_lookup import lookup_address
from backend.services.calculations import CalculationServiceError
from backend.app import create_app
from backend.pilot import PilotConfig

class Store:
    def __init__(self, frame): self.frame=frame
    def load_city(self, city): return self.frame


def synthetic():
    old=pd.DataFrame([dict(city='בדיקה',GUSH='1-2-3',date='2023-01-01',FULLADRESS='בויאר אברהם 12',floor=5,
        area=105.8,rooms=5,build_year=1990,price_millions=5.4),
        dict(city='בדיקה',GUSH='1-2-4',date='2015-01-01',FULLADRESS='בויאר אברהם 12',floor=5,
        area=80,rooms=3,build_year=1990,price_millions=2),
        dict(city='בדיקה',GUSH='1-2-5',date='2016-01-01',FULLADRESS='בויאר אברהם 120',floor=5,
        area=80,rooms=3,build_year=1990,price_millions=2)])
    current=pd.DataFrame([dict(city='בדיקה',GUSH='01-02-003',date='2023-01-01',area=98,rooms=4,build_year=1994,
        price_millions=5.4,deal_amount=5400000,sale_portion=1,source_id='a'),
        dict(city='בדיקה',GUSH='1-2-3',date='2020-01-01',area=98,rooms=5,build_year=1987,
        price_millions=3.85,deal_amount=3850000,sale_portion=1,source_id='b')])
    payload={'city':'בדיקה','address':'בויאר 12','floor':5,'year_from':2014,'year_to':2026}
    result=lookup_address(Store(old),Store(current),payload)
    assert len(result['rows'])==3 # includes legacy-only; excludes house 120; one 2023 link
    assert result['rows'][0]['source']=='מידע לעם — התמנון' and result['rows'][0]['sale_portion'] is None
    assert 'מועמד' in result['rows'][1]['link']
    assert result['rows'][2]['legacy_area']==105.8 and result['rows'][2]['area']==98
    assert result['rows'][2]['conflicts']=='שטח, חדרים, שנת בנייה'
    duplicated=pd.concat([current,current.iloc[[0]].assign(source_id='c')],ignore_index=True)
    result=lookup_address(Store(old),Store(duplicated),payload)
    assert len(result['rows'])==5 and sum(r['source']=='מידע לעם — התמנון' for r in result['rows'])==2
    partial=current.copy();partial.loc[0,'sale_portion']=.5
    assert len(lookup_address(Store(old),Store(partial),payload)['rows'])==4
    assert not lookup_address(Store(old),Store(current),{**payload,'floor':4})['rows']
    single = lookup_address(Store(old),None,payload)
    assert len(single['rows']) == 2
    assert all(row['source_id'].startswith('legacy:') for row in single['rows'])
    assert not lookup_address(Store(old),None,{**payload,'floor':4})['rows']
    for change in [{'year_from':2027,'year_to':2014},{'floor':'bad'},{'address':''}]:
        try: lookup_address(Store(old),Store(current),{**payload,**change})
        except CalculationServiceError: pass
        else: raise AssertionError(change)


def actual():
    client=create_app(PilotConfig).test_client()
    payload={'city':'tel_aviv_yafo','address':'בויאר 12','floor':5,'year_from':2014,'year_to':2026}
    response=client.post('/api/address-lookup',json=payload)
    assert response.status_code==200,response.data
    data=response.get_json()['data']
    assert [(r['date'],r['price_ils']) for r in data['rows']]==[('2020-06-25',3850000),('2023-08-06',5400000)]
    assert data['counts']['distinct_dates']==2
    assert all(r['reference_floor']=='5' and r['gush_code']=='6631-193-38' for r in data['rows'])
    assert 'מועמד' in data['rows'][0]['link']
    assert data['rows'][1]['conflicts']=='שטח, חדרים, שנת בנייה'
    earlier=client.post('/api/address-lookup',json={**payload,'year_from':1998}).get_json()['data']
    assert [r['date'] for r in earlier['rows']]==['2004-12-12','2020-06-25','2023-08-06']
    assert client.post('/api/address-lookup',json={**payload,'year_from':'bad'}).status_code==400
    single = create_app().test_client()
    response = single.post('/api/address-lookup',json={**payload,'year_from':1998})
    assert response.status_code == 200,response.data
    found = response.get_json()['data']
    assert found['rows'] and all(r['source_id'].startswith('legacy:') for r in found['rows'])
    assert 'אינם פעילים' in found['warnings'][0]
    for row in found['rows']:
        detail = single.get('/api/deals/detail',query_string={'city':row['city'],'record':row['source_id']})
        assert detail.status_code == 200,detail.data
        assert detail.get_json()['data']['deal']['record_id'] == row['source_id']
    assert single.post('/api/address-lookup',json=[]).status_code == 400
    print('Address lookup regression checks passed: synthetic ambiguity, legacy preservation, real Boyar 12 case.')

if __name__=='__main__':
    synthetic();actual()
