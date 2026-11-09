# Install Mark Everything

## Requirements

- macOS on Apple Silicon (arm64). No Intel or Windows binary is supplied by this release.
- Google Chrome or Microsoft Edge for the browser manager. Arc can load the Chrome build, but cannot accept externally opened `chrome-extension://` manager links from Raycast.
- Python 3 for the installer. Check `python3 --version`; Apple's Command Line Tools provide `/usr/bin/python3`, or use an existing trusted Python installation. The installed helper itself includes Python.
- This is an unpacked extension and an ad-hoc-signed helper, not an Apple Developer ID signed/notarized app. macOS may require explicit user approval for downloaded executables. If macOS blocks it, inspect the release/source and use the system's documented approval flow or build from source. Do not disable Gatekeeper globally.

## Install the release

1. Download `mark-everything-0.2.1-macos-arm64.zip` and its `.sha256` file from [GitHub Releases](https://github.com/Schnee013/mark-everything/releases/latest).
2. In the download directory, run `shasum -a 256 -c mark-everything-0.2.1-macos-arm64.zip.sha256`. Extract the ZIP into a stable directory you will keep (the browser loads files from this directory).
3. In the extracted directory, run:

   ```sh
   python3 scripts/install.py
   ```

   This copies the helper into `~/Library/Application Support/me-raindrop/runtime/`, writes `helper-install.json` in the parent directory, and registers Native Messaging for Chrome, Edge and Arc. It does not create, move, import or overwrite a bookmark library.
4. Open `chrome://extensions` or `edge://extensions`, enable Developer mode, choose **Load unpacked**, and select `extension/chrome` or `extension/edge` inside the extracted directory. The expected extension ID is `egbcchcdoehomdjokeohheklekcdomkj`.
5. Open ME from the browser toolbar, then its manager. Enter the full path of your desired library. Create a new library only in an empty directory, or bind an existing ME library. Your library is stored at **the path you choose**, separate from the helper installation.
6. Configure optional WebDAV sync in ME settings. Supply your own endpoint, account and application password. Nothing is uploaded until you configure and use sync.

Both browser builds are included in the main ZIP. The separate `mark-everything-0.2.1-chrome.zip` and `mark-everything-0.2.1-edge.zip` assets contain only their respective browser builds; they still require the helper above.

## Raycast

Install the companion from its [repository](https://github.com/Schnee013/mark-everything-raycast) or its Raycast Store listing once the store submission is approved. Open **Search Bookmarks** or **Save Bookmark**. The default helper discovery path is `~/Library/Application Support/me-raindrop/helper-install.json`; the companion detects missing/incompatible installations and provides the installation link.

ME settings choose the browser for **Open in ME Manager**. The target browser profile must have ME loaded. Arc's external extension-page restriction produces a prompt to use Chrome or Edge, not a success message.

## Upgrade and remove

For an upgrade, extract the new package, rerun its installer and point the browser's unpacked extension to the new `extension/chrome` or `extension/edge` folder. Keep the old extension directory until the browser is using the new one. Your bound library is preserved.

`python3 scripts/install.py --uninstall` removes the discovery record and Native Messaging registrations for this installation. Remove the extension in the browser. Uninstall does not delete the library, helper files or credential-store entries; remove those separately only if you intend to erase them.

## Isolated configuration

For testing or a dedicated environment:

```sh
python3 scripts/install.py --config /absolute/temporary/config --profile /absolute/temporary/browser-profile
```

A nondefault configuration stays isolated unless you explicitly pass `--register-global`. Point Raycast's **Helper Discovery Record** at that configuration's `helper-install.json` only while testing, then restore it. Tests must use temporary libraries and their own browser profiles.
