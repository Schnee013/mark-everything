"""Isolated conflict fixture via the existing core's clone/ingest test pattern; no network."""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'helper'))
from core import Library, uid

library = Library(sys.argv[1])
entity = library.snapshot()['entities'][sys.argv[2]]
branches = []
fields = sys.argv[3].split(',') if len(sys.argv) > 3 else ['title']
for index, title in enumerate(['候选一', '候选二', '候选三']):
    branch = Library(Path(sys.argv[1]).parent / ('candidate-' + entity['id'] + '-' + str(index)))
    branch.create('隔离候选设备', library.info()['libraryId'])
    branch.ingest(list(library.snapshot()['ops'].values()))
    branch.execute({'id': uid(), 'edits': [{'entity': entity['id'], 'kind': entity['kind'], 'values': {field: ('https://example.com/conflict-candidate-' + str(index) if field == 'url' else title) for field in fields}, 'base': entity['heads']}]})
    branches.append(branch)
for branch in branches:
    library.ingest(list(branch.snapshot()['ops'].values()))
