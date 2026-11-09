"""WebDAV immutable numbered batches; network work never holds the write lock."""

import base64, json, random, time, urllib.request, urllib.error, urllib.parse, xml.etree.ElementTree as ET
from core import *


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


class DAV:
    def __init__(self, url, user, password):
        if not url.startswith("https://"):
            raise Error("INVALID", "WebDAV 必须使用 HTTPS")
        parsed = urllib.parse.urlsplit(url)
        if parsed.username or parsed.password or parsed.query or parsed.fragment:
            raise Error("INVALID", "WebDAV 地址不能包含凭据、查询参数或片段")
        self.opener = urllib.request.build_opener(NoRedirect())
        self.url = url.rstrip("/") + "/"
        self.auth = (
            "Basic " + base64.b64encode((user + ":" + password).encode()).decode()
        )
        self.requests = 0

    def req(self, method, path, data=None, optional=False):
        self.requests += 1
        req = urllib.request.Request(
            self.url + path,
            data=encoded(data) if data is not None else None,
            method=method,
            headers={
                "Authorization": self.auth,
                "Content-Type": "application/json",
                "Depth": "1",
            },
        )
        try:
            with self.opener.open(req, timeout=20) as r:
                body = r.read(32 * 1024 * 1024)
                return body
        except urllib.error.HTTPError as e:
            if optional and e.code == 404:
                return None
            if method == "MKCOL" and e.code == 405:
                return b""
            raise Error(
                (
                    "AUTH"
                    if e.code in (401, 403)
                    else "RATE_LIMIT" if e.code == 429 else "REMOTE"
                ),
                f"WebDAV 返回 {e.code}",
            )
        except (urllib.error.URLError, TimeoutError, OSError):
            raise Error("NETWORK", "网络暂时无法连接，修改仍保存在本地")

    def get(self, p, optional=False):
        b = self.req("GET", p, optional=optional)
        try:
            return json.loads(b) if b is not None else None
        except (ValueError, UnicodeDecodeError):
            raise Error("REMOTE", "远端文件不是完整有效的 JSON，已保留本地数据")

    def put(self, p, x):
        self.req("PUT", p, x)
        if self.get(p) != x:
            raise Error("REMOTE", "上传内容确认失败，将保留待同步数据")

    def mkdir(self, p):
        self.req("MKCOL", p)

    def actors(self, p):
        raw = self.req("PROPFIND", p)
        root = ET.fromstring(raw)
        names = []
        for r in root.findall("{DAV:}response"):
            h = r.findtext("{DAV:}href", "")
            name = urllib.parse.unquote(h.rstrip("/").split("/")[-1])
            if name.endswith(".json"):
                actor = name[:-5]
                try:
                    uuid.UUID(actor)
                except ValueError:
                    raise Error("REMOTE", "远端设备文件名格式不受支持")
                names.append(actor)
        if len(names) >= 749:
            raise Error("REMOTE_LIMIT", "远端设备目录可能被截断，暂停同步以保护数据")
        return names


def run(lib, dav, publish=False, force=False):
    ident = lib.info()
    root = ident["libraryId"] + "/"
    status_path = lib.path / "sync-state.json"
    with lock(lib.path / ".sync-lock", timeout=0.1):
        st = read(status_path, {"sent": [], "cursors": {}, "batch": 0})
        now = time.time()
        if not force and (st.get("authPaused") or st.get("retryAt", 0) > now):
            return st
        try:
            if publish:
                # An explicit create uses a random library identity, never interprets 404 as permission to overwrite.
                dav.mkdir(root)
                existing = dav.get(root + "identity.json", True)
                if existing and existing != ident:
                    raise Error("LIBRARY_MISMATCH", "远端库身份不匹配")
                for d in ("actors/", "changes/"):
                    dav.mkdir(root + d)
                seed = dav.get(root + "seed.json", True)
                if seed is None:
                    dav.put(
                        root + "seed.json",
                        {
                            "identity": ident,
                            "ops": list(lib.snapshot()["ops"].values()),
                        },
                    )
                dav.put(root + "identity.json", ident)
            remote = dav.get(root + "identity.json")
            if remote != ident:
                raise Error("LIBRARY_MISMATCH", "远端身份不匹配；未上传本地数据")
            if not st.get("seedLoaded"):
                seed = dav.get(root + "seed.json")
                lib.ingest(seed["ops"])
                st["seedLoaded"] = True
            for actor in dav.actors(root + "actors/"):
                hint = dav.get(root + "actors/" + actor + ".json")
                n = st["cursors"].get(actor, 0) + 1
                while True:
                    bucket = (n - 1) // 100
                    batch = dav.get(root + f"changes/{actor}/{bucket}/{n}.json", True)
                    if batch is None:
                        if n <= hint["batch"]:
                            raise Error(
                                "REMOTE_GAP", "远端缺少已发布批次，暂停上传并等待重试"
                            )
                        break
                    if batch.get("actor") != actor or batch.get("number") != n:
                        raise Error("INVALID", "批次身份不匹配")
                    lib.ingest(batch["ops"])
                    st["cursors"][actor] = n
                    n += 1
            state = lib.snapshot()
            if state["pending"]:
                raise Error("MISSING_DEPENDENCY", "已保存乱序变化，等待缺少的版本")
            actor = read(lib.path / "device.json")["actor"]
            pending = [
                op
                for op in state["ops"].values()
                if op["actor"] == actor and op["id"] not in st["sent"]
            ]
            outbound = st.get("outbound")
            if not outbound and pending:
                outbound = {"actor": actor, "number": st["batch"] + 1, "ops": pending}
                st["outbound"] = outbound
                atomic(status_path, st)
            if outbound:
                n = outbound["number"]
                bucket = (n - 1) // 100
                dav.mkdir(root + "changes/" + actor + "/")
                dav.mkdir(root + f"changes/{actor}/{bucket}/")
                dav.put(root + f"changes/{actor}/{bucket}/{n}.json", outbound)
                dav.put(root + "actors/" + actor + ".json", {"batch": n})
                st["sent"] = sorted(
                    set(st["sent"]) | {o["id"] for o in outbound["ops"]}
                )
                st["batch"] = n
                st.pop("outbound", None)
            st.update(
                error=None,
                failures=0,
                retryAt=0,
                authPaused=False,
                lastSuccess=now,
                requests=dav.requests,
            )
        except Error as e:
            failures = st.get("failures", 0) + 1
            st.update(
                error={"code": e.code, "message": e.message},
                failures=failures,
                retryAt=now
                + min(1800, 15 * 2 ** min(failures, 7))
                + random.random() * 5,
                authPaused=e.code == "AUTH",
                requests=dav.requests,
            )
        atomic(status_path, st)
        return st


def join(path, dav, library_id):
    if not library_id or any(c not in "0123456789abcdef-" for c in library_id):
        raise Error("INVALID", "库编号格式错误")
    root = library_id + "/"
    ident = dav.get(root + "identity.json")
    seed = dav.get(root + "seed.json")
    if ident.get("libraryId") != library_id or seed.get("identity") != ident:
        raise Error("LIBRARY_MISMATCH", "快照与库身份不匹配")
    # Download into a sibling staging directory. Never bind a half-joined library.
    dest = Path(path).expanduser().resolve()
    if dest.exists() and any(dest.iterdir()):
        raise Error("NOT_EMPTY", "接入请选择空目录")
    staging = dest.with_name(dest.name + ".joining-" + uid())
    lib = Library(staging)
    lib.create(ident["name"], library_id)
    lib.ingest(seed["ops"])
    st = run(lib, dav, force=True)
    if st.get("error"):
        raise Error(st["error"]["code"], st["error"]["message"])
    if dest.exists():
        dest.rmdir()
    os.replace(staging, dest)
    return Library(dest)
