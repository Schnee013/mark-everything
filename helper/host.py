#!/usr/bin/env python3
"""Native Messaging and line-delimited CLI transports share dispatch()."""
import json, os, struct, sys, traceback
from pathlib import Path
from core import *
import exchange, sync, navigation

APP = "org.me_mark_everything.bookmarks"


def config_dir():
    if "--config" in sys.argv:
        return Path(sys.argv[sys.argv.index("--config")+1]).expanduser().resolve()
    if os.environ.get("ME_MARK_EVERYTHING_CONFIG") or os.environ.get("QIQIAN_CONFIG"):
        return Path(os.environ.get("ME_MARK_EVERYTHING_CONFIG") or os.environ["QIQIAN_CONFIG"])

    if getattr(sys, "frozen", False):
        installed = read(Path(sys.executable).parent / "installation.json", {})
        if installed.get("config"):
            return Path(installed["config"])
    return Path(
        os.environ.get(
            "ME_MARK_EVERYTHING_CONFIG",
            str(
                Path(
                    os.environ.get(
                        "LOCALAPPDATA", Path.home() / "Library" / "Application Support"
                    )
                )
                / "me-mark-everything"
            ),
        )
    )


def config():
    return read(config_dir() / "binding.json", {})


def save_config(c):
    if "manager" not in c and config().get("manager"):
        c["manager"] = config()["manager"]
    config_dir().mkdir(parents=True, exist_ok=True)
    atomic(config_dir() / "binding.json", c)


def library():
    c = config()
    if not c.get("path"):
        raise Error("NOT_BOUND", "请在设置中创建或接入书签库")
    lib = Library(c["path"])
    lib.info()
    return lib


def credential(c, password=None):
    try:
        import keyring

        key = c["url"] + "|" + c["user"]
        if password is not None:
            keyring.set_password(APP, key, password)
        secret = keyring.get_password(APP, key) or keyring.get_password("org.qiqian.bookmarks", key)
        if not secret:
            raise Error("CREDENTIAL", "请在设置中填写 WebDAV 应用密码")
        return secret
    except Error:
        raise
    except Exception:
        raise Error(
            "CREDENTIAL", "系统凭据存储不可用；请安装 keyring 或使用完整助手安装包"
        )


def dav(c):
    return sync.DAV(c["url"], c["user"], credential(c))


def dispatch(r):
    if r.get("v") != 1:
        raise Error("VERSION", "协议版本不兼容，请升级扩展和助手")
    method = r.get("method")
    p = r.get("params", {})
    if method == "capabilities":
        return {
            "protocol": 1,
            "schema": 1,
            "features": ["d1-metadata", "pinyin-search"],
            "version": "0.2.1",
            "binding": config().get("path"),
            "manager": config().get("manager"),
            "library": library().info() if config().get("path") else None,
            "commands": [
                "query",
                "rebuildSearchIndex",
                "get",
                "execute",
                "commandStatus",
                "status",
                "openManager",
                "managerStatus",
                "managerOpened",
                "configureManager",
                "export",
                "importPreview",
                "sync",
                "bind",
                "create",
                "join",
            ],
        }
    if method == "chooseDirectory":
        import subprocess

        if sys.platform == "darwin":
            out = subprocess.run(
                [
                    "osascript",
                    "-e",
                    'POSIX path of (choose folder with prompt "选择ME书签库目录")',
                ],
                capture_output=True,
                text=True,
            )
        elif os.name == "nt":
            out = subprocess.run(
                [
                    "powershell",
                    "-NoProfile",
                    "-Command",
                    'Add-Type -AssemblyName System.Windows.Forms; $d=New-Object System.Windows.Forms.FolderBrowserDialog; if($d.ShowDialog() -eq "OK"){$d.SelectedPath}',
                ],
                capture_output=True,
                text=True,
            )
        else:
            raise Error("UNSUPPORTED", "请输入目录完整路径")
        return {"path": out.stdout.strip()}
    if method in ("bind", "create"):
        lib = Library(p["path"])
        if method == "create":
            lib.create(p.get("name", "我的书签"))
        else:
            lib.info()
            lib.snapshot()
        save_config({"path": str(lib.path)})
        return lib.info()
    if method == "configureSync":
        if r.get("libraryId") and r["libraryId"] != library().info()["libraryId"]:
            raise Error("LIBRARY_MISMATCH", "库已切换，请重新打开页面或绑定原库")
        c = config()
        remote = {"url": p["url"].rstrip("/") + "/", "user": p["user"]}
        credential(remote, p["password"])
        c["remote"] = remote
        save_config(c)
        return {"configured": True}
    if method == "join":
        remote = {"url": p["url"].rstrip("/") + "/", "user": p["user"]}
        credential(remote, p["password"])
        lib = sync.join(p["path"], dav(remote), p["libraryId"])
        save_config({"path": str(lib.path), "remote": remote})
        return lib.info()
    lib = library()
    if r.get("libraryId") and r["libraryId"] != lib.info()["libraryId"]:
        raise Error("LIBRARY_MISMATCH", "库已切换，请重新打开页面或绑定原库")
    if method == "rebuildSearchIndex":
        return lib.rebuild_search_index()
    if method == "query":
        return lib.query(p)
    if method == "get":
        e = lib.snapshot()["entities"].get(p["id"])
        if not e:
            raise Error("NOT_FOUND", "条目不存在")
        return e
    if method == "execute":
        return lib.execute(p)
    if method == "commandStatus":
        return lib.command_status(p["id"])
    if method == "status":
        s = lib.snapshot()
        st = read(lib.path / "sync-state.json", {})
        try:
            with lock(lib.path / ".sync-lock", timeout=0):
                syncing = False
        except Error as e:
            if e.code != "BUSY":
                raise
            syncing = True
        actor = read(lib.path / "device.json")["actor"]
        pending = [
            op["id"]
            for op in s["ops"].values()
            if op["actor"] == actor and op["id"] not in st.get("sent", [])
        ]
        return {
            "library": lib.info(),
            "path": str(lib.path),
            "revision": s["revision"],
            "local": "saved",
            "syncing": syncing,
            "pending": len(pending),
            "conflictRevision": digest(
                sorted(
                    (e["id"], e["conflicts"], e["structural"])
                    for e in s["entities"].values()
                    if e["conflicts"] or e["structural"]
                )
            ),
            "conflicts": sum(
                bool(e["conflicts"] or e["structural"]) for e in s["entities"].values()
            ),
            "sync": st,
            "configured": bool(config().get("remote")),
            "remote": config().get("remote"),
        }
    if method == "sync":
        c = config().get("remote")
        if not c:
            return {"localOnly": True}
        return sync.run(lib, dav(c), p.get("publish", False), p.get("force", False))
    if method == "export":
        return {"html": exchange.export_html(lib, p.get("skip", False))}
    if method == "importPreview":
        return exchange.preview(
            lib, p["nodes"] if "nodes" in p else exchange.parse(p["content"]), p["source"]
        )
    if method == "configureManager":
        return navigation.configure(config_dir(),config(),p)
    if method == "openManager":
        return navigation.open_manager(config_dir(),config(),lib.info()["libraryId"],p)
    if method == "managerStatus":
        return navigation.status(config_dir(),p["requestId"])
    if method == "managerOpened":
        return navigation.acknowledge(config_dir(),p["requestId"],lib.info()["libraryId"])
    raise Error("METHOD", "不支持的接口方法")


def response(req):
    try:
        return {"v": 1, "id": req.get("id"), "ok": True, "result": dispatch(req)}
    except Error as e:
        return {
            "v": 1,
            "id": req.get("id"),
            "ok": False,
            "error": {"code": e.code, "message": e.message},
        }
    except PermissionError:
        return {
            "v": 1,
            "ok": False,
            "error": {"code": "PERMISSION", "message": "无法写入目录，请检查目录权限"},
        }
    except FileNotFoundError:
        return {
            "v": 1,
            "ok": False,
            "error": {"code": "PATH", "message": "目录已移动或删除，请重新绑定"},
        }
    except Exception as e:
        return {
            "v": 1,
            "ok": False,
            "error": {
                "code": (
                    "INVALID"
                    if isinstance(e, (KeyError, ValueError, TypeError))
                    else "IO"
                ),
                "message": "输入或文件操作失败；请检查输入并保留原命令编号重试",
            },
        }


def exact(n):
    data = b""
    while len(data) < n:
        chunk = sys.stdin.buffer.read(n - len(data))
        if not chunk:
            break
        data += chunk
    return data


def main():
    cli = "--stdio" in sys.argv
    if os.name == "nt":
        import msvcrt

        msvcrt.setmode(sys.stdin.fileno(), os.O_BINARY)
        msvcrt.setmode(sys.stdout.fileno(), os.O_BINARY)
    while True:
        if cli:
            raw = sys.stdin.buffer.readline()
            if not raw:
                break
        else:
            header = exact(4)
            if len(header) != 4:
                break
            size = struct.unpack("=I", header)[0]
            if size > 16 * 1024 * 1024:
                break
            raw = exact(size)
            if len(raw) != size:
                break
        try:
            result = response(json.loads(raw))
        except (ValueError, TypeError):
            result = {
                "v": 1,
                "ok": False,
                "error": {"code": "INVALID", "message": "需要有效 JSON 请求"},
            }
        out = encoded(result)
        if len(out) > 1000000:
            out = encoded(
                {
                    "v": 1,
                    "ok": False,
                    "error": {
                        "code": "TOO_LARGE",
                        "message": "响应过大，请减小分页或导出范围",
                    },
                }
            )
        sys.stdout.buffer.write(
            out + b"\n" if cli else struct.pack("=I", len(out)) + out
        )
        sys.stdout.buffer.flush()


if __name__ == "__main__":
    main()
