from __future__ import annotations

import hashlib
import json
import time
from collections import OrderedDict
from pathlib import Path
from threading import RLock
from typing import Any, Callable, Hashable, Optional, Tuple


class TTLCache:
    def __init__(self, ttl_seconds: int = 300, max_items: int = 128):
        self.ttl_seconds = ttl_seconds
        self.max_items = max_items
        self._items: OrderedDict[Hashable, Tuple[float, Any]] = OrderedDict()
        self._lock = RLock()

    def get_or_set(self, key: Hashable, factory: Callable[[], Any]) -> Any:
        now = time.monotonic()
        with self._lock:
            expires_at, value = self._items.get(key, (0, None))
            if expires_at > now:
                self._items.move_to_end(key)
                return value
            self._items.pop(key, None)

        value = factory()
        with self._lock:
            self._items[key] = (now + self.ttl_seconds, value)
            self._items.move_to_end(key)
            self._evict_locked(now)
        return value

    def clear(self) -> None:
        with self._lock:
            self._items.clear()

    def stats(self) -> dict[str, int]:
        now = time.monotonic()
        with self._lock:
            active = sum(1 for expires_at, _ in self._items.values() if expires_at > now)
            return {"active_items": active, "max_items": self.max_items, "ttl_seconds": self.ttl_seconds}

    def _evict_locked(self, now: float) -> None:
        expired_keys = [key for key, (expires_at, _) in self._items.items() if expires_at <= now]
        for key in expired_keys:
            self._items.pop(key, None)

        while len(self._items) > self.max_items:
            self._items.popitem(last=False)


class JsonFileCache:
    def __init__(self, cache_dir: Path, ttl_seconds: int = 1800, namespace: str = "responses"):
        self.cache_dir = Path(cache_dir) / namespace
        self.ttl_seconds = ttl_seconds
        self._lock = RLock()

    def get_or_set(self, key_payload: Any, factory: Callable[[], Any]) -> Any:
        path = self._path_for(key_payload)
        now = time.time()

        with self._lock:
            cached = self._read_if_fresh(path, now)
            if cached is not None:
                return cached

        value = factory()
        with self._lock:
            self.cache_dir.mkdir(parents=True, exist_ok=True)
            tmp_path = path.with_suffix(".tmp")
            payload = {"expires_at": now + self.ttl_seconds, "value": value}
            tmp_path.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
            tmp_path.replace(path)
        return value

    def clear(self) -> None:
        if not self.cache_dir.exists():
            return
        for path in self.cache_dir.glob("*.json"):
            path.unlink(missing_ok=True)

    def _path_for(self, key_payload: Any) -> Path:
        return self.cache_dir / f"{stable_cache_key(key_payload)}.json"

    def _read_if_fresh(self, path: Path, now: float) -> Optional[Any]:
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
        except (FileNotFoundError, json.JSONDecodeError, OSError):
            return None

        if not isinstance(payload, dict) or payload.get("expires_at", 0) <= now:
            path.unlink(missing_ok=True)
            return None
        return payload.get("value")


def stable_cache_key(payload: Any) -> str:
    encoded = json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()
