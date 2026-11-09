#!/usr/bin/env python3
"""Assemble the installable macOS package: extension builds, frozen helper, installer, notes."""
import hashlib, json, platform, shutil, sys, zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'dist'
EXTENSION = ROOT / 'app/dist'
HOST = ROOT / 'dist/me-raindrop-host'

def tree_hash(path, base):
    return {str(item.relative_to(base)): hashlib.sha256(item.read_bytes()).hexdigest()
            for item in sorted(path.rglob('*')) if item.is_file()}

def main():
    manifest = json.loads((EXTENSION / 'chrome/prod/manifest.json').read_text(encoding='utf-8'))
    version = manifest.get('version_name') or manifest['version']
    arch = 'arm64' if platform.machine() == 'arm64' else 'x64'
    name = f'mark-everything-{version}-macos-{arch}'
    stage = OUT / 'package' / name
    if not (HOST / 'me-raindrop-host').exists():
        sys.exit('Run scripts/build-helper.py first')
    # This directory is generated solely by this script; start clean to exclude retired files.
    if stage.exists():
        shutil.rmtree(stage)
    stage.mkdir(parents=True)
    for source, target in [(EXTENSION / 'chrome/prod', stage / 'extension/chrome'),
                           (EXTENSION / 'edge/prod', stage / 'extension/edge'),
                           (HOST, stage / 'host/me-raindrop-host'),
                           (ROOT / 'helper', stage / 'helper')]:
        # symlinks=False: a plain zip has no portable way to carry the framework's
        # Versions/Current link, so the bundle ships fully materialised instead of broken.
        shutil.copytree(source, target, dirs_exist_ok=True,
                        ignore=shutil.ignore_patterns('__pycache__'))
    (stage / 'scripts').mkdir(parents=True, exist_ok=True)
    for script in ['install.py', 'build-helper.py']:
        shutil.copy2(ROOT / 'scripts' / script, stage / 'scripts' / script)

    docs = stage / 'docs'
    docs.mkdir(parents=True, exist_ok=True)
    for doc in ['INSTALL.md', 'PINYIN-SEARCH.md']:
        shutil.copy2(ROOT / 'docs' / doc, docs / doc)
    for doc in ['README.md', 'LICENSE', 'THIRD-PARTY-NOTICES.md']:
        shutil.copy2(ROOT / doc, stage / doc)
    (stage / 'app').mkdir(exist_ok=True)
    shutil.copy2(ROOT / 'app/LICENSE.md', stage / 'app/LICENSE.md')
    (stage / 'app/src/me/licenses').mkdir(parents=True, exist_ok=True)
    shutil.copy2(ROOT / 'app/src/me/licenses/bookmarker.txt', stage / 'app/src/me/licenses/bookmarker.txt')
    licenses = stage / 'licenses'
    licenses.mkdir(parents=True, exist_ok=True)
    shutil.copy2(ROOT / 'app/LICENSE.md', licenses / 'raindrop.txt')
    shutil.copy2(ROOT / 'app/src/me/licenses/bookmarker.txt', licenses / 'bookmarker.txt')

    sums = tree_hash(stage, stage)
    (stage / 'DELIVERY-SHA256.json').write_text(json.dumps(sums, ensure_ascii=False, indent=2, sort_keys=True), encoding='utf-8')

    archive = OUT / f'{name}.zip'
    if archive.exists():
        archive.unlink()
    with zipfile.ZipFile(archive, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as zip_file:
        for item in sorted(stage.rglob('*')):
            if item.is_file():
                zip_file.write(item, Path(name) / item.relative_to(stage))
    digest = hashlib.sha256(archive.read_bytes()).hexdigest()
    (OUT / f'{name}.zip.sha256').write_text(f'{digest}  {archive.name}\n', encoding='utf-8')

    for vendor in ['chrome', 'edge']:
        browser_archive = OUT / f'mark-everything-{version}-{vendor}.zip'
        with zipfile.ZipFile(browser_archive, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as z:
            for item in sorted((stage / 'extension' / vendor).rglob('*')):
                if item.is_file():
                    z.write(item, item.relative_to(stage / 'extension' / vendor))
            z.write(ROOT / 'THIRD-PARTY-NOTICES.md', 'THIRD-PARTY-NOTICES.md')
            z.write(ROOT / 'LICENSE', 'LICENSE')
        checksum = hashlib.sha256(browser_archive.read_bytes()).hexdigest()
        browser_archive.with_suffix('.zip.sha256').write_text(f'{checksum}  {browser_archive.name}\n')

    print(json.dumps({
        'package': str(archive),
        'bytes': archive.stat().st_size,
        'sha256': digest,
        'extensionId': ''.join(chr(ord('a') + int(c, 16)) for c in hashlib.sha256(
            __import__('base64').b64decode(manifest['key'])).hexdigest()[:32]),
        'files': len(sums) + 1,
        'version': version,
    }, ensure_ascii=False, indent=2))

if __name__ == '__main__':
    main()
