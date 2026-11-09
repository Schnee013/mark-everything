import html, json
from html.parser import HTMLParser
from core import *


class BookmarkHTML(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.root = []
        self.stack = [self.root]
        self.pending = None
        self.current = None

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag in ("h3", "a"):
            self.current = (
                {"title": "", "children": []}
                if tag == "h3"
                else {"title": "", "url": a.get("href", "")}
            )
            if a.get("data-qid"):
                self.current["guid"] = a["data-qid"]
            self.stack[-1].append(self.current)
        if tag == "dl" and self.pending is not None:
            self.stack.append(self.pending["children"])
            self.pending = None

    def handle_data(self, data):
        if self.current is not None:
            self.current["title"] += data

    def handle_endtag(self, tag):
        if tag == "h3":
            self.pending = self.current
            self.current = None
        if tag == "a":
            self.current = None
        if tag == "dl" and len(self.stack) > 1:
            self.stack.pop()


def parse(content):
    if content.lstrip().startswith("{"):
        try:
            data = json.loads(content)
            if data.get("version") != 1 or not isinstance(data.get("roots"), dict):
                raise ValueError()
            return [
                v
                for v in data["roots"].values()
                if isinstance(v, dict) and isinstance(v.get("children"), list)
            ]
        except (ValueError, TypeError):
            raise Error("IMPORT_FORMAT", "不支持的 Chrome JSON，请改用书签 HTML")
    if "<dl" not in content.lower():
        raise Error("IMPORT_FORMAT", "请选择书签 HTML 或 Chrome v1 JSON")
    parser = BookmarkHTML()
    parser.feed(content)
    return parser.root


def preview(lib, nodes, source):
    state = lib.snapshot()
    es = state["entities"]
    edits = []
    counts = {"new": 0, "update": 0, "review": 0, "unsupported": 0}
    rows = []

    def walk(nodes, parent=None, path=""):
        for i, node in enumerate(nodes):
            pos = path + "/" + str(i)
            sid = str(node.get("guid") or node.get("id") or (digest(nodes) + pos))
            ref = "source:" + digest([source, sid])
            matches = [e for e in es.values() if ref in e["values"]]
            matches.sort(key=lambda e: bool(e["purged"] or e["values"].get("life") != "active"))
            old = matches[0] if matches else None
            eid = old["id"] if old else uid()
            kind = "bookmark" if "url" in node else "collection"
            values = {
                "position": {"parent": parent, "order": i},
                "title" if kind == "bookmark" else "name": node.get(
                    "title", node.get("name", "")
                ),
            }
            if kind == "bookmark":
                if not node["url"].startswith(("https://", "http://")):
                    counts["unsupported"] += 1
                    continue
                values["url"] = node["url"]
            candidates = [
                e
                for e in es.values()
                if not old
                and kind == "bookmark"
                and e["kind"] == "bookmark"
                and e["values"].get("url") == values.get("url")
                and e["values"].get("life") == "active"
                and not e["purged"]
            ]
            source_values = copy.deepcopy(values)
            base = old["heads"] if old else {}
            deleted = bool(
                old and (old["purged"] or old["values"].get("life") != "active")
            )
            review = deleted or bool(candidates)
            conflicting = []
            if old and not deleted:
                prior = old["values"][ref]
                for k in list(values):
                    if values[k] == prior.get(k):
                        values.pop(k)
                    elif (
                        old["values"].get(k) != prior.get(k)
                        and old["values"].get(k) != values[k]
                    ):
                        conflicting.append(k)
                        review = True
            values[ref] = source_values
            counts["review" if review else "update" if old else "new"] += 1
            rows.append(
                {
                    "id": eid,
                    "title": node.get("title", node.get("name", "")),
                    "path": pos,
                    "review": review,
                    "conflicting": conflicting,
                    "candidates": [
                        {
                            "id": e["id"],
                            "title": e["values"].get("title"),
                            "heads": e["heads"],
                        }
                        for e in candidates
                    ],
                    "deleted": deleted,
                    "parent": parent,
                }
            )
            edits.append({"entity": eid, "kind": kind, "values": values, "base": base})
            if kind == "collection":
                walk(node.get("children", []), eid, pos)

    walk(nodes)
    return {"counts": counts, "rows": rows, "command": {"id": uid(), "edits": edits}}


def export_html(lib, skip=False):
    es = lib.snapshot()["entities"]
    blocked = set()
    for e in es.values():
        if e["structural"] or any(
            k in e["conflicts"] for k in ("url", "title", "position", "life", "name")
        ):
            blocked.add(e["id"])
    changed = True
    while changed:
        changed = False
        for e in es.values():
            if (e["values"].get("position") or {}).get("parent") in blocked and e[
                "id"
            ] not in blocked:
                blocked.add(e["id"])
                changed = True
    if blocked and not skip:
        raise Error("EXPORT_CONFLICT", "网址、标题或层级存在冲突，请处理或明确跳过")

    def render(parent=None, seen=None):
        seen = seen or set()
        out = []
        children = [
            e
            for e in es.values()
            if e["kind"] in ("bookmark", "collection")
            and (e["values"].get("position") or {}).get("parent") == parent
            and e["values"].get("life") == "active"
            and not e["purged"]
            and e["id"] not in blocked
        ]
        children.sort(
            key=lambda e: ((e["values"].get("position") or {}).get("order", 0), e["id"])
        )
        for e in children:
            if e["id"] in seen:
                continue
            v = e["values"]
            attrs = ' DATA-QID="' + html.escape(e["id"], quote=True) + '"'
            if e["kind"] == "collection":
                out.append(
                    "<DT><H3"
                    + attrs
                    + ">"
                    + html.escape(v.get("name") or "")
                    + "</H3>\n<DL><p>\n"
                    + render(e["id"], seen | {e["id"]})
                    + "\n</DL><p>"
                )
            else:
                out.append(
                    '<DT><A HREF="'
                    + html.escape(v.get("url") or "", quote=True)
                    + '"'
                    + attrs
                    + ">"
                    + html.escape(v.get("title") or v.get("url") or "")
                    + "</A>"
                )
        return "\n".join(out)

    return (
        '<!DOCTYPE NETSCAPE-Bookmark-file-1>\n<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">\n<TITLE>ME书签</TITLE>\n<H1>书签</H1>\n<DL><p>\n'
        + render()
        + "\n</DL><p>\n"
    )
