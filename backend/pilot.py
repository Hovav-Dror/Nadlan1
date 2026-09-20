"""Run the isolated OVER 20-city pilot: python -m backend.pilot --port 5051."""
import argparse
from .app import create_app
from .config import Config


class PilotConfig(Config):
    DATA_DIR = Config.PROJECT_ROOT / 'data_over_linked'
    LEGACY_DATA_DIR = Config.PROJECT_ROOT / 'data'
    CACHE_DIR = Config.PROJECT_ROOT / '.cache_over'
    APP_NAME = 'ניתוח נדל״ן — פיילוט גרסאות לעם'
    APP_VERSION = '0.3.0-over-pilot'
    CITY_CACHE_MAX_ITEMS = 4


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--port', type=int, default=5051)
    args = parser.parse_args()
    if not (PilotConfig.DATA_DIR / 'manifest.json').exists():
        parser.error('Build data_over with scripts/import_over_pilot.py, then run scripts/link_over_pilot_locations.py.')
    create_app(PilotConfig).run(host='127.0.0.1', port=args.port, threaded=True)
