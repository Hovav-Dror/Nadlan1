#!/usr/bin/env python3
"""Archive every distinct file referenced by a saved OVER version inventory.

Run from the repository root. Uses only public GET downloads; preserves source
bytes and records SHA-256, CSV row counts, and all version memberships.
"""
import csv
import hashlib
import json
import subprocess
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data/raw/over_fd06f5ae"


def main():
    versions = json.loads((OUT / "metadata/versions.json").read_text())
    inventory = {}
    for version in versions:
        for resource in version["resources"]:
            url = resource["download_url"]
            item = inventory.setdefault(url, dict(url=url, name=resource["name"], versions=[]))
            item["versions"].append(version["version_number"])

    def download(item):
        parsed = urlparse(item["url"])
        if parsed.scheme != "https" or parsed.hostname != "pub-63c02556dabd4956af9500eb8fe7198c.r2.dev":
            raise ValueError("Unexpected public download host")
        parts = Path(parsed.path).parts
        target = OUT / "files" / parts[-2] / parts[-1]
        target.parent.mkdir(parents=True, exist_ok=True)
        if not target.exists():
            temporary = target.with_suffix(target.suffix + ".part")
            subprocess.run(["curl", "-LsS", "--fail", "--retry", "4", "--retry-delay", "2",
                            "--connect-timeout", "30", "--max-time", "900", item["url"],
                            "-o", str(temporary)], check=True)
            temporary.replace(target)
        digest = hashlib.sha256()
        with target.open("rb") as handle:
            for chunk in iter(lambda: handle.read(1024 * 1024), b""):
                digest.update(chunk)
        with target.open(encoding="utf-8-sig", newline="") as handle:
            rows = csv.reader(handle)
            columns = next(rows)
            count = sum(1 for _ in rows)
        return dict(item, path=str(target.relative_to(ROOT)), bytes=target.stat().st_size,
                    sha256=digest.hexdigest(), rows=count, columns=columns)

    results, failures = [], []
    with ThreadPoolExecutor(max_workers=3) as pool:
        pending = {pool.submit(download, item): item for item in inventory.values()}
        for future in as_completed(pending):
            try:
                result = future.result()
                results.append(result)
                print(f"{len(results)}/{len(inventory)} {result['name']}: {result['rows']:,} rows", flush=True)
            except Exception as error:
                failures.append(dict(pending[future], error=str(error)))
    manifest = dict(captured_at=datetime.now(timezone.utc).isoformat(),
                    source_page="https://www.over.org.il/versions/fd06f5ae-8a4f-4120-b275-8a514ad23499",
                    inventory_versions=len(versions), expected_files=len(inventory),
                    files=sorted(results, key=lambda item: item["path"]), failures=failures)
    (OUT / "download_manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2)+"\n")
    print(json.dumps({"downloaded":len(results), "failed":len(failures),
                      "bytes":sum(item["bytes"] for item in results)}), flush=True)
    if failures:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
