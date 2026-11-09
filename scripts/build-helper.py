#!/usr/bin/env python3
"""Freeze the local helper into dist/me-raindrop-host (same PyInstaller recipe as ME 0.3.0)."""
import os, subprocess, sys
from pathlib import Path

root = Path(__file__).resolve().parents[1]
os.environ['PYINSTALLER_CONFIG_DIR'] = str(root / 'build/cache')
subprocess.run(
    [
        sys.executable, '-m', 'PyInstaller',
        '--onedir', '--noconfirm',
        '--name', 'me-raindrop-host',
        '--paths', str(root / 'helper'),
        '--collect-submodules', 'keyring.backends',
        '--collect-all', 'pypinyin',
        '--distpath', str(root / 'dist'),
        '--workpath', str(root / 'build'),
        '--specpath', str(root / 'build'),
        str(root / 'helper/host.py'),
    ],
    check=True,
)
from importlib.metadata import distributions
import re, sysconfig
notices = root / 'dist/me-raindrop-host/licenses'
notices.mkdir(exist_ok=True)
for package in distributions():
    if package.metadata['Name'].lower() == 'pip':
        continue
    texts = []
    for item in package.files or []:
        if re.match(r'^(licen[cs]e|copying|notice|copyright)([.\-]|$)', item.name, re.I):
            source = package.locate_file(item)
            if source.is_file():
                texts.append(str(item) + "\n" + source.read_text(errors='replace'))
    if texts:
        (notices / (package.metadata['Name'] + '.txt')).write_text("\n\n".join(texts))
python_license = Path(sysconfig.get_path('stdlib')) / 'LICENSE.txt'
if not python_license.is_file():
    raise RuntimeError('Python LICENSE.txt is required for the frozen distribution')
(notices / 'Python.txt').write_bytes(python_license.read_bytes())
print(root / 'dist/me-raindrop-host')
