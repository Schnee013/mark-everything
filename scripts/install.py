#!/usr/bin/env python3
"""ME local installer: register this build's helper without copying or recreating a library.

Reused from the ME 0.3.0 installer (me-mark-everything/scripts/install.py); the host name,
extension identity and default config directory belong to this build. The installer never
creates, moves or rewrites a bookmark library, and never touches the existing ME install.
"""
import argparse, base64, hashlib, json, os, shutil, sys, tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent if HERE.name == 'scripts' else HERE
NAME = 'org.me_raindrop_b1.bookmarks'
BASE = Path(os.environ.get('LOCALAPPDATA', Path.home() / 'Library/Application Support'))
CONFIG_NAME = 'me-raindrop'
BROWSERS = ['Google/Chrome', 'Microsoft Edge', 'Arc/User Data']
WINDOWS_BROWSERS = ['Google\\Chrome', 'Microsoft\\Edge', 'The Browser Company\\Arc']

def first(*paths):
    for path in paths:
        if path.exists():
            return path
    return None

EXTENSION = first(ROOT / 'extension/chrome', ROOT / 'app/dist/chrome/prod')
HOST_SOURCE = first(ROOT / 'host/me-raindrop-host', ROOT / 'dist/me-raindrop-host')

def extension_id():
    manifest = json.loads((EXTENSION / 'manifest.json').read_text(encoding='utf-8'))
    key = manifest.get('key')
    if not key:
        sys.exit('Extension manifest has no fixed key; the extension id would change per install path')
    digest = hashlib.sha256(base64.b64decode(key)).hexdigest()[:32]
    return manifest, ''.join(chr(ord('a') + int(c, 16)) for c in digest)

def write(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_suffix('.tmp')
    temp.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding='utf-8')
    os.replace(temp, path)

def copy_runtime_file(source, target):
    # Replacing the inode avoids macOS rejecting an updated executable whose
    # previous signed pages are still cached after an in-place overwrite.
    target = Path(target)
    fd, temporary = tempfile.mkstemp(prefix='.me-install-', dir=target.parent)
    os.close(fd)
    try:
        shutil.copy2(source, temporary)
        os.replace(temporary, target)
    finally:
        Path(temporary).unlink(missing_ok=True)
    return str(target)


def main():
    parser = argparse.ArgumentParser(description='ME - Mark Everything local installer')
    parser.add_argument('--config', type=Path, default=BASE / CONFIG_NAME)
    parser.add_argument('--profile', type=Path, help='Register only inside this Chromium user-data-dir')
    parser.add_argument('--no-register', action='store_true')
    parser.add_argument('--register-global', action='store_true', help='Register globally even for a custom --config; otherwise a custom config stays isolated')
    parser.add_argument('--extension-id')
    parser.add_argument('--uninstall', action='store_true')
    parser.add_argument('--manager-browser', choices=['chrome', 'edge', 'arc'])
    parser.add_argument('--manager-profile', type=Path)
    args = parser.parse_args()

    config = args.config.resolve()
    config.mkdir(parents=True, exist_ok=True)
    manifest, detected = extension_id()
    eid = args.extension_id or detected
    exe = 'me-raindrop-host' + ('.exe' if os.name == 'nt' else '')
    runtime = config / 'runtime'
    host = runtime / exe

    if args.manager_browser:
        binding = json.loads((config / 'binding.json').read_text(encoding='utf-8')) if (config / 'binding.json').exists() else {}
        binding['manager'] = {
            'browser': args.manager_browser,
            'profile': str(args.manager_profile.resolve()) if args.manager_profile else None,
            'extensionId': eid,
        }
        write(config / 'binding.json', binding)

    if not args.uninstall:
        if not HOST_SOURCE or not (HOST_SOURCE / exe).exists():
            sys.exit('Build the helper first: scripts/build-helper.py')
        shutil.copytree(HOST_SOURCE, runtime, dirs_exist_ok=True, copy_function=copy_runtime_file)
        write(runtime / 'installation.json', {'config': str(config)})
        write(config / 'helper-install.json', {
            'name': 'ME',
            'fullName': 'ME - Mark Everything',
            'version': manifest.get('version_name') or manifest.get('version'),
            'protocol': 1,
            'executable': str(host),
            'args': ['--stdio', '--config', str(config)],
            'extensionId': eid,
        })
    else:
        (config / 'helper-install.json').unlink(missing_ok=True)

    registered = []
    global_config = config == (BASE / CONFIG_NAME).resolve()
    if not args.no_register and (args.profile or args.register_global or global_config):
        if args.profile:
            paths = [args.profile / 'NativeMessagingHosts' / f'{NAME}.json']
        elif sys.platform == 'darwin':
            paths = [BASE / browser / 'NativeMessagingHosts' / f'{NAME}.json' for browser in BROWSERS]
        elif os.name == 'nt':
            paths = [config / f'{NAME}.json']
        else:
            sys.exit('The ME installer supports macOS and Windows')
        for path in paths:
            if args.uninstall:
                path.unlink(missing_ok=True)
            else:
                write(path, {
                    'name': NAME,
                    'description': 'ME - Mark Everything',
                    'path': str(host),
                    'type': 'stdio',
                    'allowed_origins': ['chrome-extension://' + eid + '/'],
                })
            registered.append(str(path))
        if os.name == 'nt':
            import winreg
            for browser in WINDOWS_BROWSERS:
                key = 'Software\\' + browser + '\\NativeMessagingHosts\\' + NAME
                if args.uninstall:
                    try:
                        winreg.DeleteKey(winreg.HKEY_CURRENT_USER, key)
                    except FileNotFoundError:
                        pass
                else:
                    with winreg.CreateKey(winreg.HKEY_CURRENT_USER, key) as handle:
                        winreg.SetValueEx(handle, '', 0, winreg.REG_SZ, str(paths[0]))

    print(json.dumps({
        'name': 'ME',
        'extensionId': eid,
        'helper': str(host),
        'discovery': str(config / 'helper-install.json'),
        'registered': registered,
        'libraryPreserved': True,
        'uninstalled': args.uninstall,
    }, ensure_ascii=False, indent=2))

if __name__ == '__main__':
    main()
