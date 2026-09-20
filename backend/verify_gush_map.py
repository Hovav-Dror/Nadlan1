"""Regression checks for per-block polygon fallback and explicit selections."""
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from backend.services.data_store import DataStore
from backend.services.gush_map import build_gush_map_response


def feature(gush, city, fid):
    return {"type": "Feature", "properties": {"GUSH_NUM": gush, "LOCALITY_N": city, "FID": fid},
            "geometry": {"type": "Polygon", "coordinates": [[[0, 0], [1, 0], [1, 1], [0, 0]]]}}


class Store:
    def gushes_for_city(self, city):
        return [{"id": gush, "city": "Alpha", "label": str(gush)} for gush in [1, 2, 3]]

    def load_gush_polygons(self):
        return {"features": [feature(1, "Alpha", "local"), feature(1, "Beta", "other"),
                             feature(2, None, "unlabelled"), feature(3, "Beta", "mismatch"),
                             feature(4, "Beta", "explicit"), feature(5, "Beta", "unrequested")]}


def run():
    result = build_gush_map_response(Store(), {"city": "alpha", "gushes": [4, 6]})
    features = result["geojson"]["features"]
    assert {f["id"] for f in features} == {"local", "unlabelled", "mismatch", "explicit"}
    assert [f["properties"]["gush"] for f in features if f["properties"]["selected"]] == [4]
    assert result["missing_gushes"] == ["6"]
    assert result["selected_missing_gushes"] == ["6"]
    without_city = build_gush_map_response(Store(), {"gushes": [1, 4]})
    assert {f["id"] for f in without_city["geojson"]["features"]} == {"local", "other", "explicit"}

    store = DataStore(Path(__file__).resolve().parents[1] / "data")
    available = {str(f["properties"]["GUSH_NUM"]) for f in store.load_gush_polygons()["features"]}
    for city, selected in [("tel_aviv_yafo", 6163), ("ramat_gan", 6156), ("jerusalem", 30289), ("haifa", 10444)]:
        result = build_gush_map_response(store, {"city": city, "gushes": [selected]})
        assert not (set(result["missing_gushes"]) & available), city
        assert str(selected) not in result["selected_missing_gushes"], city
        assert any(f["properties"]["gush"] == selected and f["properties"]["selected"]
                   for f in result["geojson"]["features"]), city
    print("PASS: per-block fallback, explicit selections and cached polygons in four cities")


if __name__ == "__main__":
    run()
