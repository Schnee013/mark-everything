import copy
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import core
import exchange
import host
import search_index


class SearchIndexTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="me-pinyin-test-", dir="/private/tmp")
        self.addCleanup(self.temp.cleanup)
        self.lib = core.Library(Path(self.temp.name) / "library")
        self.lib.create("隔离拼音验证")

    def write(self, values, eid=None, kind="bookmark", base=None):
        eid = eid or core.uid()
        current = self.lib.snapshot()["entities"].get(eid)
        command = {"id": core.uid(), "edits": [{"entity": eid, "kind": kind, "values": values,
                   "base": base if base is not None else current["heads"] if current else {}}]}
        self.lib.execute(command)
        return eid, command

    def ids(self, q, **filters):
        return [x["id"] for x in self.lib.query({"q": q, **filters})["items"]]

    def test_create_full_initials_and_original_text(self):
        eid, _ = self.write({"title": "生物信息", "note": "AI科研工具", "description": "重庆银行", "url": "https://example.test/女儿"})
        for q in ("shengwuxinxi", "SWXX", "sheng wu xin xi", "aikygj", "chongqingyinhang", "cqyh", "nver", "生物", "example.test"):
            self.assertIn(eid, self.ids(q), q)
        self.assertEqual(self.lib.snapshot()["entities"][eid]["values"]["note"], "AI科研工具")
        self.assertEqual(len(self.ids("swxx")), 1)

    def test_edits_tags_redirect_and_collection_refresh(self):
        tag, _ = self.write({"name": "机器学习"}, kind="tag")
        collection, _ = self.write({"name": "科研资料"}, kind="collection")
        eid, _ = self.write({"title": "旧标题", "note": "旧备注", "tag:" + tag: True,
                             "position": {"parent": collection, "order": 1}})
        for q in ("jiubiaoti", "jiubeizhu", "jqxx", "kyzl"):
            self.assertIn(eid, self.ids(q))
        self.write({"title": "新标题", "note": "新备注"}, eid)
        self.write({"name": "深度学习"}, tag, "tag")
        self.write({"name": "学术收藏"}, collection, "collection")
        for q in ("jiubiaoti", "jiubeizhu", "jqxx", "kyzl"):
            self.assertNotIn(eid, self.ids(q))
        for q in ("xinbiaoti", "xbz", "sdxx", "xssc"):
            self.assertIn(eid, self.ids(q))
        target, _ = self.write({"name": "人工智能"}, kind="tag")
        self.write({"redirect": target}, tag, "tag")
        self.assertIn(eid, self.ids("rgzn"))
        self.assertNotIn(eid, self.ids("sdxx"))
        self.write({"tag:" + tag: False}, eid)
        self.assertNotIn(eid, self.ids("rgzn"))

    def test_old_bookmarks_require_manual_rebuild_without_data_writes(self):
        eid, _ = self.write({"title": "旧书签"})
        (self.lib.path / search_index.FILE).unlink()
        self.write({"title": "新书签"})
        self.assertNotIn(eid, self.ids("jiushuqian"))
        before = self.lib.snapshot()
        result = self.lib.rebuild_search_index()
        self.assertEqual(result["bookmarks"], 2)
        self.assertEqual(self.lib.snapshot(), before)
        self.assertIn(eid, self.ids("jsq"))
        first = (self.lib.path / search_index.FILE).read_bytes()
        self.lib.rebuild_search_index()
        self.assertEqual(first, (self.lib.path / search_index.FILE).read_bytes())

    def test_html_import_and_ingest_are_indexed(self):
        plan = exchange.preview(self.lib, exchange.parse('<DL><p><DT><H3>学习资料</H3><DL><p><DT><A HREF="https://example.test/import">中文导入</A></DL></DL>'), "isolated.html")
        self.lib.execute(plan["command"])
        self.assertEqual(len(self.ids("zwdr")), 1)
        other = core.Library(Path(self.temp.name) / "other")
        other.create(library_id=self.lib.info()["libraryId"])
        other.ingest(list(self.lib.snapshot()["ops"].values()))
        self.assertEqual(other.query({"q": "zhongwendaoru"})["total"], 1)
        self.assertNotIn(search_index.FILE, json.dumps(list(self.lib.snapshot()["ops"].values())))
        self.assertNotIn("pinyin", exchange.export_html(self.lib))

    def test_conflict_candidates_and_lifecycle_keep_existing_behavior(self):
        eid, _ = self.write({"title": "基线"})
        base = self.lib.snapshot()["entities"][eid]["heads"]
        self.write({"title": "左侧候选"}, eid, base=base)
        self.write({"title": "右侧候选"}, eid, base=base)
        hit = self.lib.query({"q": "ychx"})["items"][0]
        self.assertTrue(hit["candidateMatch"])
        self.assertEqual(hit["candidateEntity"], eid)
        clean, _ = self.write({"title": "待删书签"})
        self.write({"life": "trashed"}, clean)
        self.assertNotIn(clean, self.ids("dssq"))
        self.assertIn(clean, self.ids("dssq", trash=True))
        self.write({"life": "purged"}, clean)
        self.assertNotIn(clean, self.ids("dssq", trash=True))
        self.assertNotIn(clean, core.read(self.lib.path / search_index.FILE)["entries"])

    def test_index_write_failure_does_not_commit_bookmark(self):
        before = self.lib.snapshot()
        original = core.atomic
        def fail_index(path, data):
            if Path(path).name == search_index.FILE:
                raise PermissionError("isolated injected cache failure")
            return original(path, data)
        with patch.object(core, "atomic", fail_index):
            with self.assertRaises(core.Error) as error:
                self.write({"title": "不可写索引"})
        self.assertEqual(error.exception.code, "SEARCH_INDEX")
        self.assertEqual(before, self.lib.snapshot())

    def test_operation_failure_never_exposes_uncommitted_index(self):
        eid, _ = self.write({"title": "原标题"})
        original = core.atomic
        def fail_operation(path, data):
            if Path(path).parent.name == "ops":
                raise OSError("isolated injected operation failure")
            return original(path, data)
        with patch.object(core, "atomic", fail_operation):
            with self.assertRaises(OSError):
                self.write({"title": "未提交标题"}, eid)
        self.assertNotIn(eid, self.ids("weitijiaobiaoti"))
        self.assertIn(eid, self.ids("yuanbiaoti"))

    def test_replay_and_cache_failure_after_committed_operation(self):
        original = core.atomic
        command = {"id": core.uid(), "edits": [{"entity": core.uid(), "values": {"title": "回执恢复"}}]}
        def fail_materialized(path, data):
            if Path(path).name == "library.json":
                raise OSError("isolated injected materialization failure")
            return original(path, data)
        with patch.object(core, "atomic", fail_materialized):
            with self.assertRaises(OSError):
                self.lib.execute(command)
        self.assertEqual(self.lib.command_status(command["id"])["state"], "committed-readable")
        before = self.lib.snapshot()
        self.lib.execute(command)
        self.assertEqual(self.lib.snapshot(), before)
        self.assertEqual(len(self.ids("hzhf")), 1)
        changed = copy.deepcopy(command)
        changed["edits"][0]["values"]["title"] = "不同内容"
        with self.assertRaises(core.Error) as error:
            self.lib.execute(changed)
        self.assertEqual(error.exception.code, "ID_COLLISION")
        # A replaceable search cache must not block an existing command receipt.
        (self.lib.path / search_index.FILE).write_text("broken")
        self.assertEqual(self.lib.execute(command)["state"], "committed-readable")
        self.assertEqual(self.lib.snapshot(), before)

    def test_corrupt_index_rebuild_and_library_guard(self):
        self.write({"title": "索引恢复"})
        (self.lib.path / search_index.FILE).write_text("broken")
        with self.assertRaises(core.Error) as error:
            self.ids("syhf")
        self.assertEqual(error.exception.code, "SEARCH_INDEX")
        self.lib.rebuild_search_index()
        self.assertEqual(len(self.ids("syhf")), 1)
        with patch.object(host, "library", return_value=self.lib):
            with self.assertRaises(core.Error) as error:
                host.dispatch({"v": 1, "method": "rebuildSearchIndex", "libraryId": "wrong"})
            self.assertEqual(error.exception.code, "LIBRARY_MISMATCH")
            result = host.dispatch({"v": 1, "method": "rebuildSearchIndex", "libraryId": self.lib.info()["libraryId"]})
        self.assertEqual(result["bookmarks"], 1)


if __name__ == "__main__":
    unittest.main(verbosity=2)
