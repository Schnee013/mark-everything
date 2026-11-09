"""Versioned local library. No browser, UI, or network dependencies."""

import contextlib, copy, hashlib, json, os, time, uuid, platform
from pathlib import Path
from urllib.parse import urlsplit
import search_index

PROTOCOL = 1
META = {"title", "description", "cover", "type"}


class Error(Exception):
    def __init__(self, code, message):
        self.code, self.message = code, message
        super().__init__(message)


def uid():
    return str(uuid.uuid4())


def encoded(x):
    return json.dumps(
        x, ensure_ascii=False, sort_keys=True, separators=(",", ":")
    ).encode()


def digest(x):
    return hashlib.sha256(encoded(x)).hexdigest()


def read(p, default=None):
    try:
        return json.loads(Path(p).read_text("utf-8"))
    except FileNotFoundError:
        return copy.deepcopy(default)
    except (json.JSONDecodeError, UnicodeDecodeError):
        raise Error("CORRUPT", "JSON 文件损坏；请保留原文件并按恢复说明处理")


def atomic(p, data):
    p = Path(p)
    tmp = p.with_name(p.name + "." + uid() + ".tmp")
    try:
        with open(tmp, "xb") as f:
            f.write(encoded(data))
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp, p)
        if os.name != "nt":
            fd = os.open(p.parent, os.O_RDONLY)
            try:
                os.fsync(fd)
            finally:
                os.close(fd)
    finally:
        if tmp.exists():
            tmp.unlink()


@contextlib.contextmanager
def lock(p, timeout=10):
    f = open(p, "a+b")
    start = time.monotonic()
    if os.name == "nt":
        import msvcrt

        f.seek(0)
        f.write(b"0")
        f.flush()
    else:
        import fcntl
    while True:
        try:
            if os.name == "nt":
                f.seek(0)
                msvcrt.locking(f.fileno(), msvcrt.LK_NBLCK, 1)
            else:
                fcntl.flock(f, fcntl.LOCK_EX | fcntl.LOCK_NB)
            break
        except (OSError, BlockingIOError):
            if time.monotonic() - start > timeout:
                f.close()
                raise Error("BUSY", "库正被另一操作使用，请重试")
            time.sleep(0.025)
    try:
        yield
    finally:
        if os.name == "nt":
            f.seek(0)
            msvcrt.locking(f.fileno(), msvcrt.LK_UNLCK, 1)
        else:
            fcntl.flock(f, fcntl.LOCK_UN)
        f.close()


def materialize(ops):
    versions = {}
    entities = {}
    pending = list(ops.values())
    applied = []
    while pending:
        rest = []
        progress = False
        for op in pending:
            internal = {f"{op['id']}:{i}" for i in range(len(op["changes"]))}
            if any(
                p not in versions and p not in internal
                for c in op["changes"]
                for p in c["parents"]
            ):
                rest.append(op)
                continue
            for i, c in enumerate(op["changes"]):
                key = f"{op['id']}:{i}"
                parents = c["parents"]
                if any(p in internal for p in parents):
                    raise Error("INVALID", "事务内部版本引用不受支持")
                for p in parents:
                    if (
                        versions[p]["entity"] != c["entity"]
                        or versions[p]["field"] != c["field"]
                    ):
                        raise Error("INVALID", "版本引用字段不匹配")
                versions[key] = {
                    **c,
                    "version": key,
                    "actor": op["actor"],
                    "actorName": op.get("actorName", op["actor"][:8]),
                    "time": op["time"],
                }
                e = entities.setdefault(
                    c["entity"], {"id": c["entity"], "kind": c["kind"], "registers": {}}
                )
                if e["kind"] != c["kind"]:
                    raise Error("INVALID", "实体类型发生变化")
                e["registers"].setdefault(c["field"], {})[key] = versions[key]
            applied.append(op["id"])
            progress = True
        if rest and not progress:
            break
        pending = rest

    def ancestors(v):
        seen = set()
        todo = list(versions[v]["parents"])
        while todo:
            x = todo.pop()
            if x not in seen:
                seen.add(x)
                todo.extend(versions[x]["parents"])
        return seen

    purged = {
        v["entity"]
        for v in versions.values()
        if v["field"] == "life" and v["value"] == "purged"
    }
    for e in entities.values():
        e.update(values={}, heads={}, conflicts={}, policies={})
        for field, reg in e.pop("registers").items():
            removed = {p for v in reg.values() for p in v["parents"]}
            heads = sorted(set(reg) - removed)
            candidates = [reg[h] for h in heads]
            e["heads"][field] = heads
            distinct = {digest(v["value"]) for v in candidates}
            if len(distinct) > 1:
                e["conflicts"][field] = candidates
                common = set.intersection(*(ancestors(h) for h in heads))
                latest = [
                    v for v in common if not any(v in ancestors(w) for w in common)
                ]
                preview = reg[sorted(latest)[0]]["value"] if latest else None
            else:
                preview = candidates[0]["value"]
            if field in META:
                e["values"][field] = (
                    preview.get("text") if isinstance(preview, dict) else None
                )
                e["policies"][field] = (
                    preview.get("policy", "manual")
                    if isinstance(preview, dict)
                    else "manual"
                )
            else:
                e["values"][field] = preview
        e["purged"] = e["id"] in purged
        e["structural"] = []
    for e in entities.values():
        field = "position" if e["kind"] in ("bookmark", "collection") else "redirect"
        seen = {e["id"]}
        current = e
        while current:
            v = current["values"].get(field)
            target = v.get("parent") if isinstance(v, dict) else v
            if not target:
                break
            if target in seen:
                e["structural"].append({"field": field, "reason": "cycle"})
                break
            seen.add(target)
            current = entities.get(target)
            expected = "collection" if field == "position" else "tag"
            if not current or current["kind"] != expected:
                e["structural"].append({"field":field,"reason":"missing-reference","target":target})
                break
            if current and current["values"].get("life") != "active":
                e["structural"].append(
                    {"field": field, "reason": "deleted-parent", "target": target}
                )
                break
    for e in entities.values():
        for field, val in e["values"].items():
            if field.startswith("tag:") and val:
                target = entities.get(field[4:])
                if not target or target["kind"] != "tag":
                    e["structural"].append({"field":field,"reason":"missing-reference","target":field[4:]})
                    continue
                if target["values"].get("life") != "active":
                    e["structural"].append(
                        {
                            "field": field,
                            "reason": "deleted-tag",
                            "target": target["id"],
                        }
                    )
    return {
        "entities": entities,
        "pending": [o["id"] for o in pending],
        "applied": sorted(applied),
        "revision": digest(sorted(applied)),
    }


def written_heads(op):
    result={}
    for i,change in enumerate(op['changes']):
        result.setdefault(change['entity'],{})[change['field']]=[f"{op['id']}:{i}"]
    return result


class Library:
    def __init__(self, path):
        self.path = Path(path).expanduser().resolve()

    def create(self, name="我的书签", library_id=None):
        self.path.mkdir(parents=True, exist_ok=True)
        with lock(self.path / ".lock"):
            if (self.path / "identity.json").exists():
                raise Error("EXISTS", "目录已有书签库，请选择接入")
            if any(p.name not in (".lock",) for p in self.path.iterdir()):
                raise Error("NOT_EMPTY", "创建库请选择空目录")
            (self.path / "ops").mkdir()
            atomic(
                self.path / "identity.json",
                {"schema": 1, "libraryId": library_id or uid(), "name": name},
            )
            atomic(
                self.path / "device.json", {"actor": uid(), "name": platform.system()}
            )
            self._load()
        return self.info()

    def info(self):
        ident = read(self.path / "identity.json")
        if not ident:
            raise Error("NO_LIBRARY", "目录不存在或没有有效书签库，请在设置中绑定")
        if ident.get("schema") != 1:
            raise Error("VERSION", "数据版本不兼容，请升级助手")
        return ident

    def _load(self):
        identity = self.info()
        ops = {}
        for p in sorted((self.path / "ops").glob("*.json")):
            op = read(p)
            if op.get("libraryId") != identity["libraryId"]:
                raise Error("LIBRARY_MISMATCH", "变化记录属于其他库")
            if p.stem != digest(op["id"]):
                raise Error("CORRUPT", "变化记录名称校验失败")
            ops[op["id"]] = op
        state = materialize(ops)
        state["ops"] = ops
        # Cache is replaceable; immutable operation records remain the authority.
        return state

    def snapshot(self):
        self.info()
        with lock(self.path / ".lock"):
            return self._load()

    def _commit(self, ops, state):
        for op in ops:
            p = self.path / "ops" / (digest(op["id"]) + ".json")
            old = read(p)
            if old and old != op:
                raise Error("ID_COLLISION", "同一操作编号对应不同内容，已停止接收")
        combined = {**state["ops"], **{o["id"]: o for o in ops}}
        result = materialize(combined)
        changed = [eid for eid, entity in result["entities"].items()
                   if entity["heads"] != state["entities"].get(eid, {}).get("heads")]
        # Prepare the derived cache before persisting any operation: an index
        # failure cannot turn an already committed save into an apparent failure.
        search_index.update(self, result, changed)
        for op in ops:
            atomic(self.path / "ops" / (digest(op["id"]) + ".json"), op)
        atomic(self.path / "library.json", result)
        return result

    def ingest(self, ops):
        with lock(self.path / ".lock"):
            state = self._load()
            for op in ops:
                if op.get("libraryId") != self.info()["libraryId"]:
                    raise Error("LIBRARY_MISMATCH", "不能合并不同库")
            return self._commit(ops, state)

    def execute(self, command):
        if command.get("libraryId") and command["libraryId"] != self.info()["libraryId"]:
            raise Error("LIBRARY_MISMATCH", "库已切换；请回到原库恢复这条命令")
        if not isinstance(command.get("id"), str) or not command["id"]:
            raise Error("INVALID", "缺少命令编号")
        with lock(self.path / ".lock"):
            state = self._load()
            old = state["ops"].get(command["id"])
            if old:
                if old.get("requestHash") != digest(command):
                    raise Error("ID_COLLISION", "命令编号已用于其他输入")
                atomic(
                    self.path / "library.json",
                    {k: v for k, v in state.items() if k != "ops"},
                )
                return {
                    "state": "committed-readable",
                    "revision": state["revision"],
                    "commandId": command["id"],
                    "writtenHeads": written_heads(old),
                }
            changes = []
            touched = set()
            for edit in command.get("edits", []):
                eid = edit["entity"]
                e = state["entities"].get(eid)
                kind = edit.get("kind", e["kind"] if e else "bookmark")
                values = copy.deepcopy(edit["values"])
                base = edit.get("base", {})
                if kind not in ("bookmark", "collection", "tag"):
                    raise Error("INVALID", "不支持的实体类型")
                if (
                    e
                    and e["purged"]
                    and (not edit.get("resolve") or values.get("life") == "active")
                ):
                    raise Error("PURGED", "已永久删除；请明确另存为新条目")
                if not e:
                    if base:
                        raise Error("INVALID", "新实体不能携带旧版本")
                    values = {"life": "active", **values}
                elif (
                    not e["purged"]
                    and not (edit.get("metadata") or edit.get("acceptedMetadata"))
                    and "life" not in values
                    and e["values"].get("life") == "active"
                    and "life" not in e["conflicts"]
                ):
                    values["life"] = "active"
                if "autoFields" in edit and (not isinstance(edit["autoFields"], list)
                    or any(not isinstance(k, str) or k not in META for k in edit["autoFields"])):
                    raise Error("INVALID", "自动预填字段无效")
                if edit.get("acceptedMetadata"):
                    # Explicit acceptance may replace manual text, but only on the page and versions reviewed.
                    if (not e or e["kind"] != "bookmark" or e["values"].get("life") != "active"
                        or "life" in e["conflicts"] or "url" in e["conflicts"]
                        or edit.get("url") != e["values"].get("url") or base.get("url") != e["heads"].get("url")
                        or any(k not in META or k in e["conflicts"] or base.get(k) != e["heads"].get(k) for k in values)):
                        raise Error("STALE_RESOLUTION", "网址或所选字段已经变化，请重新刷新网页信息")
                if edit.get("metadata"):
                    if (
                        not e
                        or edit.get("url") != e["values"].get("url")
                        or base.get("url") != e["heads"].get("url")
                    ):
                        continue
                    values = {
                        k: v
                        for k, v in values.items()
                        if k in META
                        and e["policies"].get(k) == "auto"
                        and base.get(k) == e["heads"].get(k)
                    }
                for field, value in values.items():
                    if (eid, field) in touched:
                        raise Error("INVALID", "同一事务不能重复修改同一字段")
                    touched.add((eid, field))
                    if e and field in e["heads"] and field not in base:
                        raise Error("BASE_REQUIRED", "编辑须提供实际看到的字段版本")
                    parents = base.get(field, [])
                    if edit.get("resolve") and set(parents) != set(
                        e["heads"].get(field, [])
                    ):
                        raise Error(
                            "STALE_RESOLUTION",
                            "出现新版本；输入已保留，请查看新增候选后再处理",
                        )
                    if e and field in e["conflicts"] and not edit.get("resolve"):
                        raise Error("CONFLICT", "请通过冲突对照处理此字段")
                    if field in META or field in ("note", "name"):
                        if not isinstance(value, str) or len(value) > 100000:
                            raise Error(
                                "INVALID", "文本字段需为字符串且不超过 100000 字符"
                            )
                    if field == "life" and value not in ("active", "trashed", "purged"):
                        raise Error("INVALID", "删除状态不合法")
                    if field == "position" and (
                        not isinstance(value, dict)
                        or not isinstance(value.get("order"), (int, float))
                        or (
                            value.get("parent") is not None
                            and not isinstance(value.get("parent"), str)
                        )
                    ):
                        raise Error("INVALID", "位置字段不合法")
                    if field == "url" and not isinstance(value, str):
                        raise Error("INVALID", "网址格式错误")
                    if field == "url" and not value.startswith(("http://", "https://")):
                        raise Error("INVALID", "仅支持 HTTP/HTTPS 网址")
                    if field == "url":
                        try:
                            if not urlsplit(value).hostname or any(ord(c)<32 for c in value):
                                raise ValueError()
                        except ValueError:
                            raise Error("INVALID", "请输入完整有效的网址")
                    if (field == "favorite" or field.startswith("tag:")) and not isinstance(value,bool):
                        raise Error("INVALID", "收藏与标签成员值须为布尔值")
                    if field == "redirect" and value is not None and not isinstance(value,str):
                        raise Error("INVALID", "标签目标格式错误")
                    if field in META:
                        value = {
                            "text": value,
                            "policy": (
                                "auto"
                                if edit.get("metadata") or edit.get("auto") or field in edit.get("autoFields", [])
                                else "manual"
                            ),
                        }
                    changes.append(
                        {
                            "entity": eid,
                            "kind": kind,
                            "field": field,
                            "value": value,
                            "parents": parents,
                        }
                    )
            if not changes:
                return {"state": "no-change", "revision": state["revision"]}
            device = read(self.path / "device.json")
            op = {
                "id": command["id"],
                "requestHash": digest(command),
                "libraryId": self.info()["libraryId"],
                "actor": device["actor"],
                "actorName": device.get("name", "设备 " + device["actor"][:8]),
                "time": time.time(),
                "changes": changes,
            }
            prospective = materialize({**state["ops"], op["id"]: op})
            if op["id"] in prospective["pending"]:
                raise Error("MISSING_DEPENDENCY", "命令引用的版本尚未到达")
            for c in changes:
                field, value = c["field"], c["value"]
                target = value.get("parent") if field == "position" else value if field == "redirect" else field[4:] if field.startswith("tag:") and value else None
                if target:
                    entity = prospective["entities"].get(target)
                    expected = "collection" if field == "position" else "tag"
                    if not entity or entity["kind"] != expected:
                        raise Error("INVALID", "引用的集合或标签不存在，未保存任何修改")
            for eid in {c["entity"] for c in changes}:
                if any(
                    x["reason"] == "cycle"
                    for x in prospective["entities"][eid]["structural"]
                ):
                    raise Error("CYCLE", "不能形成循环关系")
            result = self._commit([op], state)
            return {
                "state": "committed-readable",
                "revision": result["revision"],
                "commandId": command["id"],
                "writtenHeads": written_heads(op),
            }

    def command_status(self, cid):
        state = self.snapshot()
        return {
            "state": (
                "committed-readable"
                if cid in state["applied"]
                else ("committed-recovering" if cid in state["ops"] else "not-found")
            ),
            "revision": state["revision"],
        }

    def rebuild_search_index(self):
        with lock(self.path / ".lock"):
            state = self._load()
            entries = search_index.update(self, state, rebuild=True)
            return {"bookmarks": sum(state["entities"][eid]["kind"] == "bookmark" for eid in entries),
                    "revision": state["revision"]}

    def query(self, filters=None):
        f = filters or {}
        index = {}
        if f.get("q"):
            with lock(self.path / ".lock"):
                s = self._load()
                index = search_index.update(self, s)
        else:
            s = self.snapshot()
        es = s["entities"]
        items = []

        def active_tag(tid):
            seen = set()
            while tid in es and tid not in seen:
                seen.add(tid)
                t = es[tid]
                target = t["values"].get("redirect")
                if not target:
                    return t if t["values"].get("life") == "active" else None
                tid = target
            return None

        q = f.get("q", "").casefold()

        def matches_candidate(entity, fields):
            for field in fields:
                for candidate in entity["conflicts"].get(field, []):
                    value = candidate["value"]
                    if isinstance(value, dict):
                        value = value.get("text")
                    if isinstance(value, str) and q in value.casefold():
                        return True
            return False

        def in_collection(e):
            target = f["collection"]
            parent = (e["values"].get("position") or {}).get("parent")
            seen = set()
            while parent != target:
                if not f.get("descendants") or parent in seen or parent not in es:
                    return False
                seen.add(parent)
                parent = (es[parent]["values"].get("position") or {}).get("parent")
            return True

        for e in es.values():
            v = e["values"]
            conflict = bool(e["conflicts"] or e["structural"])
            trash = v.get("life") != "active" or e["purged"]
            if e["kind"] != f.get("kind", "bookmark"):
                continue
            if f.get("conflicts"):
                if not conflict:
                    continue
            elif trash != bool(f.get("trash")) or e["purged"]:
                continue
            if "collection" in f and not in_collection(e):
                continue
            if f.get("favorite") and not v.get("favorite"):
                continue
            if f.get("type") and v.get("type") != f["type"]:
                continue
            attached = [tag for k, val in v.items() if k.startswith("tag:") and val
                        if (tag := active_tag(k[4:])) is not None]
            tags = [t["values"]["name"] for t in attached if t["values"].get("name")]
            requested = set(f.get("tags", []) + ([f["tag"]] if f.get("tag") else []))
            if not requested.issubset(set(tags)):
                continue
            fields = ("title", "url", "description", "note") if e["kind"] == "bookmark" else ("name", "description")
            text = " ".join([str(v.get(k) or "") for k in fields] + tags)
            candidate_id = None
            if q and q not in text.casefold() and not search_index.matches(index.get(e["id"]), q):
                if matches_candidate(e, fields):
                    candidate_id = e["id"]
                else:
                    for key, versions in e["conflicts"].items():
                        if key.startswith("tag:") and any(c["value"] is True for c in versions):
                            tag = active_tag(key[4:])
                            if tag and q in (tag["values"].get("name") or "").casefold():
                                candidate_id = e["id"]
                                break
                    if candidate_id is None:
                        candidate_id = next((t["id"] for t in attached if matches_candidate(t, ("name",))), None)
                if candidate_id is None:
                    candidate_id = search_index.candidate_match(index.get(e["id"]), q)
                if candidate_id is None:
                    continue
            items.append({
                **e, "tags": tags, "candidateMatch": candidate_id is not None,
                **({"candidateEntity": candidate_id} if candidate_id else {}),
            })
        sort = f.get("sort", "title")
        items.sort(
            key=lambda e: (
                ((e["values"].get("position") or {}).get("order", 0), e["id"])
                if sort == "manual"
                else (str(e["values"].get(sort) or "").casefold(), e["id"])
            )
        )
        offset = max(0, int(f.get("offset", 0)))
        limit = min(200, max(1, int(f.get("limit", 100))))
        return {
            "items": items[offset : offset + limit],
            "total": len(items),
            "revision": s["revision"],
        }
