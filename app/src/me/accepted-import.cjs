// Directly extracted from old ME extension/ui.js: acceptedImport.
const uuid = () => crypto.randomUUID()
function acceptedImport(preview, decisions, makeId = uuid) {
  const remap = new Map(), blocked = new Set(), edits = [];
  for (const original of preview.command.edits) {
    const row = preview.rows.find(r => r.id === original.entity);
    if (blocked.has(row.parent)) { blocked.add(row.id); continue; }
    const e = structuredClone(original);
    if (row.candidates?.length) {
      const chosen = row.candidates.find(c => c.id === decisions[row.id]);
      if (chosen) { e.entity = chosen.id; e.base = chosen.heads; }
    } else if (row.review && decisions[row.id] !== "source") {
      if (row.deleted) blocked.add(row.id);
      continue;
    }
    if (row.deleted) { e.entity = makeId(); e.base = {}; remap.set(row.id, e.entity); }
    for (const v of [e.values, ...Object.entries(e.values).filter(([k]) => k.startsWith("source:")).map(([,v]) => v)]) {
      if (v.position && remap.has(v.position.parent)) v.position.parent = remap.get(v.position.parent);
    }
    edits.push(e);
  }
  return edits;
}

module.exports = { acceptedImport }
