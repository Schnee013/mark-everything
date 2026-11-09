"""Rebuildable, device-local pinyin search data; never part of operation records."""
import re
from pypinyin import Style, lazy_pinyin

FILE = "search-index.json"
FORMAT = "pypinyin-0.55.0-v1"
HAN = re.compile(r"[\u3400-\u9fff\uf900-\ufaff\U00020000-\U000323af]")


def compact(text):
    return re.sub(r"[\s'’]+", "", text.casefold().replace("ü", "v"))


def transliterate(text):
    if not isinstance(text, str) or not HAN.search(text):
        return None
    return {
        "full": compact("".join(lazy_pinyin(text, style=Style.NORMAL))),
        "initials": compact("".join(lazy_pinyin(text, style=Style.FIRST_LETTER))),
    }


def active_tag(entities, tid):
    seen = set()
    while tid in entities and tid not in seen:
        seen.add(tid)
        tag = entities[tid]
        if tag["kind"] != "tag" or tag["purged"]:
            return None
        target = tag["values"].get("redirect")
        if not target:
            return tag if tag["values"].get("life") == "active" else None
        tid = target
    return None


def source(entity, entities):
    values = entity["values"]
    fields = ("title", "url", "description", "note") if entity["kind"] == "bookmark" else ("name", "description")
    current = {key: values[key] for key in fields if isinstance(values.get(key), str)}
    candidates = {}

    def add_candidates(item, names):
        for field in names:
            for candidate in item["conflicts"].get(field, []):
                value = candidate["value"]
                if isinstance(value, dict):
                    value = value.get("text")
                if isinstance(value, str):
                    candidates.setdefault(item["id"], []).append(value)

    add_candidates(entity, fields)
    if entity["kind"] == "bookmark":
        tags = []
        for key, value in values.items():
            if not key.startswith("tag:") or not value:
                continue
            tag = active_tag(entities, key[4:])
            if tag:
                if isinstance(tag["values"].get("name"), str):
                    tags.append(tag["values"]["name"])
                add_candidates(tag, ("name",))
        current["tags"] = " ".join(sorted(set(tags)))
        for key, versions in entity["conflicts"].items():
            if key.startswith("tag:") and any(c["value"] is True for c in versions):
                tag = active_tag(entities, key[4:])
                if tag and isinstance(tag["values"].get("name"), str):
                    candidates.setdefault(entity["id"], []).append(tag["values"]["name"])
        names, seen = [], {entity["id"]}
        parent = (values.get("position") or {}).get("parent")
        while parent in entities and parent not in seen:
            seen.add(parent)
            collection = entities[parent]
            if collection["kind"] != "collection" or collection["purged"] or collection["values"].get("life") != "active":
                break
            name = collection["values"].get("name")
            if isinstance(name, str):
                names.append(name)
            parent = (collection["values"].get("position") or {}).get("parent")
        current["collection"] = " ".join(reversed(names))
    return {"fields": current, "candidates": candidates}


def update(library, state, changed=(), rebuild=False):
    # The caller holds the library lock. Before-commit writes are safe because
    # every cache entry is checked against the authoritative snapshot on query.
    from core import Error, atomic, digest, read
    identity = library.info()["libraryId"]
    path = library.path / FILE
    try:
        old = {} if rebuild else read(path, {})
        if old and (old.get("format") != FORMAT or old.get("libraryId") != identity or not isinstance(old.get("entries"), dict)):
            raise Error("SEARCH_INDEX", "拼音索引需要重建，请到设置 → 应用点击重建拼音索引")
        entries = old.get("entries", {})
        entities = state["entities"]
        selected = set(entities) if rebuild else set(entries) | set(changed)
        updated = {}
        for eid in sorted(selected):
            entity = entities.get(eid)
            if not entity or entity["purged"]:
                continue
            data = source(entity, entities)
            signature = digest(data)
            cached = entries.get(eid)
            if cached and cached.get("source") == signature:
                updated[eid] = cached
                continue
            updated[eid] = {
                "source": signature,
                "fields": {key: result for key, value in data["fields"].items() if (result := transliterate(value))},
                "candidates": {target: [result for value in values if (result := transliterate(value))]
                               for target, values in data["candidates"].items()},
            }
        result = {"format": FORMAT, "libraryId": identity, "entries": updated}
        if result != old:
            atomic(path, result)
        return updated
    except Error as error:
        if error.code != "CORRUPT":
            raise
        raise Error("SEARCH_INDEX", "拼音索引损坏，请到设置 → 应用点击重建拼音索引") from error
    except (OSError, ValueError, TypeError, AttributeError) as error:
        raise Error("SEARCH_INDEX", "无法更新本地拼音索引，请检查库目录权限或在设置中重建索引") from error


def matches(entry, query):
    q = compact(query)
    return bool(q and entry and any(q in value for field in entry["fields"].values() for value in field.values()))


def candidate_match(entry, query):
    q = compact(query)
    if q and entry:
        return next((eid for eid, fields in entry["candidates"].items()
                     if any(q in value for field in fields for value in field.values())), None)
    return None
