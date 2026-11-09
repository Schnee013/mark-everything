# Local pinyin search

The helper stores full pinyin and initials in the library's derived `search-index.json`; original fields are not changed. Saves, imports, edits and incoming operations refresh the corresponding entries. A new device receiving the library through normal synchronization indexes the incoming operations automatically.

For an existing library without this index, use **Rebuild Pinyin Index** in ME settings. Rebuilding reads existing bookmarks and rewrites only derived search data. It does not edit notes or add synchronized fields. The index is not uploaded through WebDAV; each device derives it locally.

The implementation is `helper/search_index.py`, using pypinyin 0.55.0 (MIT). Search results retain the original bookmark identity. Pronunciation follows the library's dictionary and can be ambiguous for proper names and polyphonic characters.
