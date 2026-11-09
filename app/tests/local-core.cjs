const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const path = require('node:path')
const os = require('node:os')
const { spawn } = require('node:child_process')
const { Model, clone } = require('../src/me/model.cjs')
const { Drafts } = require('../src/me/drafts.cjs')

async function fixture() {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'me-b1-core-'))
    const config = path.join(root, 'config'), helper = path.resolve(__dirname, '../../helper/host.py')
    async function native(method, params = {}, libraryId) {
        return new Promise((resolve, reject) => {
            const child = spawn(process.env.ME_TEST_PYTHON || path.resolve(__dirname, '../../.venv/bin/python'), [helper, '--stdio', '--config', config])
            let out = '', err = ''
            child.stdout.on('data', v => out += v)
            child.stderr.on('data', v => err += v)
            child.on('error', reject)
            child.on('close', code => {
                if (code) return reject(new Error(err))
                try {
                    const response = JSON.parse(out)
                    if (!response.ok) reject(Object.assign(new Error(response.error.message), response.error))
                    else resolve(response.result)
                } catch (error) { reject(error) }
            })
            child.stdin.end(JSON.stringify({ v: 1, id: crypto.randomUUID(), method, params, libraryId }) + '\n')
        })
    }
    // File-backed storage deliberately survives a fresh JS engine instance.
    const storage = {
        async entries() { try { return JSON.parse(await fs.readFile(path.join(root, 'drafts.json'), 'utf8')) } catch (e) { if (e.code === 'ENOENT') return {}; throw e } },
        async get(key) { return (await this.entries())[key] },
        async set(key, value) { const all = await this.entries(); all[key] = value; await fs.writeFile(path.join(root, 'drafts.json'), JSON.stringify(all)) }
    }
    const library = await native('create', { path: path.join(root, 'library'), name: 'B1 验证库' })
    const model = new Model(native, storage), drafts = new Drafts(model, storage)
    return { root, native, storage, libraryId: library.libraryId, model, drafts, async close() { await fs.rm(root, { recursive: true, force: true }) } }
}
function edit(d, patch) {
    d = clone(d)
    d.seq++
    for (const [key, val] of Object.entries(patch)) { d.item[key] = val; d.fieldSeq[key] = d.seq; d.dirty[key] = d.seq }
    return d
}
async function seed(f, key = 'draft:test') {
    let d = await f.drafts.open(key, { item: { link: 'https://example.com/b1', title: '标题阿尔法', excerpt: '描述贝塔', note: '备注伽马', tags: ['标签德尔塔'] } }, f.libraryId)
    d = await f.drafts.merge(key, d, true)
    assert.equal(d.error, null)
    return d
}

test('真实 ME 文件核心：保存、五字段查询、冷启动视图编号、集合、认证端点拒绝', async () => {
    const f = await fixture()
    try {
        const d = await seed(f)
        for (const q of ['阿尔法', '贝塔', '伽马', '德尔塔', 'example.com']) {
            const r = await f.model.api('get', 'raindrops/0?search=' + encodeURIComponent(q), {}, f.libraryId)
            assert.equal(r.count, 1, q)
            assert.equal(r.items[0]._me.id, d.item._me.id)
        }
        const fresh = new Model(f.native, f.storage)
        assert.equal((await fresh.api('get', `raindrop/${d.item._id}`, {}, f.libraryId)).item._id, d.item._id)
        const collection = await fresh.api('post', 'collection', { title: '本地集合' }, f.libraryId)
        assert.ok(collection.item._id > 0)
        assert.equal(collection.item.title, '本地集合')
        const coreCollections = await f.native('query', { kind: 'collection' }, f.libraryId)
        assert.equal(coreCollections.items[0].values.name, '本地集合')
        assert.equal(coreCollections.items[0].values.title, undefined)
        let moved = edit(d, { collectionId: collection.item._id })
        moved = await f.drafts.merge(d.key, moved, true)
        assert.equal((await fresh.api('get', `raindrops/${collection.item._id}`, {}, f.libraryId)).count, 1)
        for (const url of ['auth/email', 'auth/jwt', 'user/logout', 'oauth/google', 'user/tfa'])
            await assert.rejects(fresh.api('post', url, {}, f.libraryId), { code: 'B1_UNSUPPORTED' })
        assert.equal((await fresh.api('get', 'user', {}, f.libraryId)).user._id, undefined)
        await assert.rejects(fresh.call('query', {}, 'other-library'), { code: 'LIBRARY_MISMATCH' })
    } finally { await f.close() }
})

test('保存中持续输入及乱序消息：保存尾部输入，不恢复旧文字', async () => {
    const f = await fixture()
    try {
        let release, started
        const startedPromise = new Promise(r => started = r), blocked = new Promise(r => release = r)
        const real = f.model.native
        f.model.native = async (...args) => { if (args[0] === 'execute') { started(); await blocked }; return real(...args) }
        let d = await f.drafts.open('draft:rapid', { item: { link: 'https://example.com/rapid', title: 'first' } }, f.libraryId)
        const saving = f.drafts.merge(d.key, d, true)
        await startedPromise
        const later = edit(d, { title: 'final complete title', note: 'tail survives close' })
        await f.drafts.merge(d.key, later, false)
        await f.drafts.merge(d.key, edit(d, { title: 'stale title' }), false)
        release()
        d = await saving
        const stored = await f.native('get', { id: d.item._me.id }, f.libraryId)
        assert.equal(stored.values.title, 'final complete title')
        assert.equal(stored.values.note, 'tail survives close')
        assert.deepEqual(d.dirty, {})
    } finally { await f.close() }
})

test('写入成功但回执丢失：重启重放同一命令，不重复创建', async () => {
    const f = await fixture()
    try {
        const real = f.model.native
        let lost = false
        f.model.native = async (...args) => {
            const result = await real(...args)
            if (args[0] === 'execute' && !lost) { lost = true; throw Object.assign(new Error('injected response loss'), { code: 'HELPER_UNAVAILABLE' }) }
            return result
        }
        const d = await f.drafts.open('draft:lost', { item: { link: 'https://example.com/lost', title: 'recovery' } }, f.libraryId)
        await assert.rejects(f.drafts.merge(d.key, d, true), { code: 'HELPER_UNAVAILABLE' })
        const pending = (await f.storage.get(d.key)).pending.command
        const fresh = new Drafts(new Model(real, f.storage), f.storage)
        await fresh.recover()
        const saved = await f.storage.get(d.key)
        assert.equal(saved.pending, null)
        assert.equal(saved.error, null)
        assert.equal((await real('query', {}, f.libraryId)).total, 1)
        assert.equal((await real('commandStatus', { id: pending.id }, f.libraryId)).state, 'committed-readable')
    } finally { await f.close() }
})

test('两个独立编辑基线：不同字段合并，同字段保留冲突候选', async () => {
    const f = await fixture()
    try {
        const original = await seed(f)
        const a = await f.drafts.open('draft:a', { id: original.item._id }, f.libraryId)
        const b = await f.drafts.open('draft:b', { id: original.item._id }, f.libraryId)
        await f.drafts.merge(a.key, edit(a, { title: 'browser A' }), true)
        await f.drafts.merge(b.key, edit(b, { note: 'browser B' }), true)
        let entity = await f.native('get', { id: original.item._me.id }, f.libraryId)
        assert.equal(entity.values.title, 'browser A')
        assert.equal(entity.values.note, 'browser B')
        assert.deepEqual(entity.conflicts, {})
        const c = await f.drafts.open('draft:c', { id: original.item._id }, f.libraryId)
        const d = await f.drafts.open('draft:d', { id: original.item._id }, f.libraryId)
        await f.drafts.merge(c.key, edit(c, { title: 'candidate C' }), true)
        const result = await f.drafts.merge(d.key, edit(d, { title: 'candidate D' }), true)
        entity = await f.native('get', { id: original.item._me.id }, f.libraryId)
        assert.equal(result.error.code, 'CONFLICT')
        assert.equal(entity.conflicts.title.length, 2)
        assert.equal((await f.drafts.merge(d.key, result, true)).error.code, 'CONFLICT')
    } finally { await f.close() }
})

test('命令准备失败与无效网址：错误持久可重试，修正后正常保存', async () => {
    const f = await fixture()
    try {
        let d = await f.drafts.open('draft:validation', { item: { link: 'invalid-url', title: 'invalid' } }, f.libraryId)
        await assert.rejects(f.drafts.merge(d.key, d, true), { code: 'INVALID' })
        d = await f.storage.get(d.key)
        assert.equal(d.error.code, 'INVALID')
        assert.equal(d.pending, null)
        assert.equal((await f.native('query', {}, f.libraryId)).total, 0)
        d = await f.drafts.merge(d.key, edit(d, { link: 'https://example.com/corrected' }), true)
        assert.equal(d.error, null)
        const command = f.model.command.bind(f.model)
        f.model.command = async () => { throw Object.assign(new Error('同名标签需要整理'), { code: 'AMBIGUOUS_TAG' }) }
        d = edit(d, { tags: ['duplicate'] })
        await assert.rejects(f.drafts.merge(d.key, d, true), { code: 'AMBIGUOUS_TAG' })
        const blocked = await f.storage.get(d.key)
        assert.equal(blocked.error.code, 'AMBIGUOUS_TAG')
        assert.equal(blocked.pending, null)
        assert.ok(Object.keys(blocked.dirty).length)
        f.model.command = command
        const fixed = await f.drafts.merge(d.key, edit(blocked, { tags: ['unique'] }), true)
        assert.equal(fixed.error, null)
        assert.deepEqual((await f.native('query', {}, f.libraryId)).items[0].tags, ['unique'])
    } finally { await f.close() }
})

test('新建集合回执丢失：冷启动及相同输入重试仍只有一个集合', async () => {
    const f = await fixture()
    try {
        const real = f.model.native
        let lost = false
        f.model.native = async (...args) => {
            const result = await real(...args)
            if (args[0] === 'execute' && !lost) { lost = true; throw Object.assign(new Error('lost response'), { code: 'HELPER_UNAVAILABLE' }) }
            return result
        }
        await assert.rejects(f.model.api('post', 'collection', { title: 'recover collection' }, f.libraryId))
        const fresh = new Model(real, f.storage)
        await fresh.recover(f.libraryId)
        const result = await fresh.api('post', 'collection', { title: 'recover collection' }, f.libraryId)
        assert.equal(result.item.title, 'recover collection')
        assert.equal((await real('query', { kind: 'collection' }, f.libraryId)).total, 1)
        await f.storage.set(result._meReceipt, null)
    } finally { await f.close() }
})

test('集合整理：官方请求映射改名、嵌套、循环拒绝及子树整笔删除', async () => {
    const f = await fixture()
    try {
        const a = (await f.model.api('post', 'collection', { title: '父集合' }, f.libraryId)).item
        let b = (await f.model.api('post', 'collection', { title: '子集合' }, f.libraryId)).item
        b = (await f.model.api('put', 'collection/' + b._id, { title: '重命名', parentId: a._id, _me: b._me, _source: b }, f.libraryId)).item
        assert.equal(b.title, '重命名'); assert.equal(b.parentId, a._id)
        await assert.rejects(f.model.api('put', 'collection/' + a._id, { parentId: b._id, _me: a._me, _source: a }, f.libraryId), { code: 'CYCLE' })
        const d = await seed(f)
        await f.drafts.merge(d.key, edit(d, { collectionId: b._id }), true)
        const collections = (await f.native('query', { kind: 'collection' }, f.libraryId)).items
        const bookmarks = (await f.native('query', {}, f.libraryId)).items
        await f.model.api('post', 'me/organize', { action: 'trash-collection', items: [...collections, ...bookmarks] }, f.libraryId)
        assert.equal((await f.native('query', { kind: 'collection' }, f.libraryId)).total, 0)
        assert.equal((await f.native('query', { trash: true }, f.libraryId)).total, 1)
    } finally { await f.close() }
})

test('原位置恢复：保留顺序，原集合删除后回未分类', async () => {
    const f = await fixture()
    try {
        const c = (await f.model.api('post', 'collection', { title: '位置' }, f.libraryId)).item
        let d = await seed(f)
        d = await f.drafts.merge(d.key, edit(d, { collectionId: c._id, order: 7 }), true)
        d = await f.drafts.merge(d.key, edit(d, { removed: true }), true)
        d = await f.drafts.merge(d.key, edit(d, { removed: false, collectionId: -1 }), true)
        let e = await f.native('get', { id: d.item._me.id }, f.libraryId)
        assert.deepEqual(e.values.position, { parent: c._me.id, order: 7 })
        const collection = await f.native('get', { id: c._me.id }, f.libraryId)
        await f.model.api('post', 'me/organize', { action: 'trash-collection', items: [collection] }, f.libraryId)
        d = await f.drafts.merge(d.key, edit(d, { removed: true }), true)
        d = await f.drafts.merge(d.key, edit(d, { removed: false, collectionId: -1 }), true)
        e = await f.native('get', { id: d.item._me.id }, f.libraryId)
        assert.deepEqual(e.values.position, { parent: null, order: 7 })
    } finally { await f.close() }
})

test('批量固定条目：一次事务新增同一标签、移动收藏；新结果不进入本次批次', async () => {
    const f = await fixture()
    try {
        const one = await seed(f)
        let two = await f.drafts.open('draft:second', { item: { link: 'https://example.com/second', title: '第二条' } }, f.libraryId)
        two = await f.drafts.merge(two.key, two, true)
        const frozen = (await f.model.api('get', 'raindrops/0', {}, f.libraryId)).items
        let late = await f.drafts.open('draft:late', { item: { link: 'https://example.com/late', title: '稍后加入' } }, f.libraryId)
        late = await f.drafts.merge(late.key, late, true)
        const c = (await f.model.api('post', 'collection', { title: '批量目标' }, f.libraryId)).item
        const result = await f.model.api('put', 'raindrops/0', { ids: frozen.map(e => e._id), _items: frozen, tags: ['批量中文'], collectionId: c._id, important: true }, f.libraryId)
        assert.equal(result.items.length, 2)
        for (const e of result.items) { assert.ok(e.tags.includes('批量中文')); assert.equal(e.collectionId, c._id); assert.equal(e.important, true) }
        assert.equal((await f.native('query', { kind: 'tag', q: '批量中文' }, f.libraryId)).total, 1)
        assert.equal((await f.native('get', { id: late.item._me.id }, f.libraryId)).values.favorite, false)
        const partial = await f.model.api('put', 'raindrops/0', { ids: result.items.map(e => e._id), _items: result.items, _removeTags: ['批量中文'] }, f.libraryId)
        assert.ok(partial.items.every(e => !e.tags.includes('批量中文')))
        assert.ok(partial.items.some(e => e.tags.includes('标签德尔塔')))
        const cleared = await f.model.api('put', 'raindrops/0', { ids: result.items.map(e => e._id), _items: partial.items, tags: [] }, f.libraryId)
        assert.ok(cleared.items.every(e => !e.tags.length))
        const deleted = await f.model.api('del', 'raindrops/0', { ids: cleared.items.map(e => e._id), _items: cleared.items }, f.libraryId)
        assert.ok(deleted.items.every(e => e.collectionId === -99))
        const restored = await f.model.api('put', 'raindrops/-99', { ids: deleted.items.map(e => e._id), _items: deleted.items, removed: false, collectionId: -1 }, f.libraryId)
        assert.ok(restored.items.every(e => e.collectionId === c._id))
        assert.deepEqual(restored.items.map(e => e._me.values.position), cleared.items.map(e => e._me.values.position))
    } finally { await f.close() }
})

test('标签稳定身份：改名不重建实体，合并解析旧标注', async () => {
    const f = await fixture()
    try {
        const d = await seed(f)
        let [tag] = (await f.native('query', { kind: 'tag' }, f.libraryId)).items
        const id = tag.id
        await f.model.api('post', 'me/organize', { action: 'rename-tag', items: [tag], values: { name: '改名标签' } }, f.libraryId)
        assert.deepEqual((await f.native('query', {}, f.libraryId)).items[0].tags, ['改名标签'])
        let second = await f.drafts.open('draft:tag-target', { item: { link: 'https://example.com/target', tags: ['目标标签'] } }, f.libraryId)
        await f.drafts.merge(second.key, second, true)
        const tags = (await f.native('query', { kind: 'tag' }, f.libraryId)).items
        tag = tags.find(t => t.id === id)
        const target = tags.find(t => t.values.name === '目标标签')
        await f.model.api('post', 'me/organize', { action: 'merge-tag', items: [tag, target] }, f.libraryId)
        const item = (await f.model.api('get', 'raindrop/' + d.item._id, {}, f.libraryId)).item
        assert.deepEqual(item.tags, ['目标标签'])
        assert.equal((await f.native('get', { id: tag.id }, f.libraryId)).values.redirect, target.id)
        const native = f.model.native
        let changed = false
        f.model.native = async (method, params, libraryId) => {
            const result = await native(method, params, libraryId)
            if (method === 'query' && params.kind === 'bookmark' && !changed) {
                changed = true
                const current = await native('get', { id: target.id }, libraryId)
                await native('execute', { id: crypto.randomUUID(), edits: [{ entity: target.id, values: { name: '查询期间改名' }, base: current.heads }] }, libraryId)
            }
            return result
        }
        await assert.rejects(f.model.api('get', 'filters/0', {}, f.libraryId), { code: 'REVISION_CHANGED' })
        f.model.native = native
        const filters = await f.model.api('get', 'filters/0', {}, f.libraryId)
        assert.equal(filters.tags[0]._meEntity.id, target.id)
    } finally { await f.close() }
})

test('冲突：三个候选、无冲突字段可编辑、拒绝陈旧处理并逐字段解决', async () => {
    const f = await fixture()
    try {
        const d = await seed(f)
        require('node:child_process').execFileSync('/usr/bin/python3', [path.join(__dirname, 'seed-conflicts.py'), path.join(f.root, 'library'), d.item._me.id])
        let e = (await f.model.api('get', 'me/conflicts', {}, f.libraryId)).items[0]
        assert.equal(e.conflicts.title.length, 3)
        let shown = (await f.model.api('get', 'raindrop/' + d.item._id, {}, f.libraryId)).item
        await f.model.api('put', 'raindrop/' + d.item._id, { note: '仍可编辑备注', _me: shown._me, _source: shown }, f.libraryId)
        await f.native('execute', { id: crypto.randomUUID(), libraryId: f.libraryId, edits: [{ entity: e.id, values: { title: '后来候选' }, base: (await f.native('get', { id: e.id }, f.libraryId)).heads, resolve: true }] }, f.libraryId)
        await assert.rejects(f.model.api('post', 'me/organize', { action: 'resolve', items: [e], values: { title: '用户合并输入' } }, f.libraryId), { code: 'STALE_RESOLUTION' })
        e = await f.native('get', { id: e.id }, f.libraryId)
        await f.model.api('post', 'me/organize', { action: 'resolve', items: [e], values: { title: '用户合并输入' } }, f.libraryId)
        const final = await f.native('get', { id: e.id }, f.libraryId)
        assert.equal(final.values.title, '用户合并输入'); assert.equal(final.values.note, '仍可编辑备注')
        assert.deepEqual(final.conflicts, {})
    } finally { await f.close() }
})

test('批量失败不部分写入，已有同网址记录须明确选择', async () => {
    const f = await fixture()
    try {
        const first = await seed(f)
        await f.native('execute', { id: crypto.randomUUID(), edits: [{ entity: crypto.randomUUID(), kind: 'bookmark', values: { title: '已有同网址条目', url: first.item.link, favorite: false } }] }, f.libraryId)
        const items = (await f.model.api('get', 'raindrops/0', {}, f.libraryId)).items
        const broken = clone(items); delete broken[1]._me.heads.favorite
        await assert.rejects(f.model.api('put', 'raindrops/0', { ids: broken.map(e => e._id), _items: broken, important: true }, f.libraryId), { code: 'BASE_REQUIRED' })
        assert.ok((await f.native('query', {}, f.libraryId)).items.every(e => e.values.favorite === false))
        await assert.rejects(f.drafts.open('draft:ambiguous', { item: first.item }, f.libraryId), { code: 'MULTIPLE_MATCHES' })
        assert.equal((await f.native('query', {}, f.libraryId)).total, 2)
    } finally { await f.close() }
})

test('复核回归：冲突解决后同一草稿继续编辑，集合排序复用冻结兄弟整笔重排', async () => {
    const f = await fixture()
    try {
        const original = await seed(f)
        const a = await f.drafts.open('draft:review-a', { id: original.item._id }, f.libraryId)
        const b = await f.drafts.open('draft:review-b', { id: original.item._id }, f.libraryId)
        await f.drafts.merge(a.key, edit(a, { title: 'A' }), true)
        const conflicted = await f.drafts.merge(b.key, edit(b, { title: 'B' }), true)
        assert.equal(conflicted.error.code, 'CONFLICT')
        const e = await f.native('get', { id: original.item._me.id }, f.libraryId)
        await f.model.api('post', 'me/organize', { action: 'resolve', items: [e], values: { title: '决定' } }, f.libraryId)
        const reopened = await f.drafts.open(b.key, { id: original.item._id }, f.libraryId)
        assert.equal(reopened.error, null)
        await f.drafts.merge(b.key, edit(reopened, { title: '继续编辑' }), true)
        assert.equal((await f.native('get', { id: e.id }, f.libraryId)).values.title, '继续编辑')
        const parent = (await f.model.api('post', 'collection', { title: '排序父' }, f.libraryId)).item
        const siblings = []
        for (const title of ['甲', '乙', '丙']) siblings.push((await f.model.api('post', 'collection', { title, parentId: parent._id }, f.libraryId)).item)
        const moving = siblings[2]
        await f.model.api('put', 'collection/' + moving._id, { parentId: parent._id, order: 0, _me: moving._me, _source: moving, _siblings: siblings }, f.libraryId)
        const result = (await f.native('query', { kind: 'collection', collection: parent._me.id }, f.libraryId)).items.sort((a,b)=>a.values.position.order-b.values.position.order)
        assert.deepEqual(result.map(e=>e.values.name), ['丙', '甲', '乙'])
        assert.deepEqual(result.map(e=>e.values.position.order), [0, 1, 2])
        const other = (await f.model.api('post', 'collection', { title: '另一根集合' }, f.libraryId)).item
        await f.model.api('put', 'collection/' + other._id, { parentId: 'root', order: 0, _me: other._me, _source: other, _siblings: [parent, other] }, f.libraryId)
        await f.model.api('put', 'user', { groups: [{ _id: 'g1', title: 'My Collections', collections: [parent._id, other._id] }] }, f.libraryId)
        const user = await f.model.api('get', 'user', {}, f.libraryId)
        assert.deepEqual(user.user.groups[0].collections, [other._id, parent._id])

    } finally { await f.close() }
})

test('分页边界：全选与同网址候选复用完整查询，不局限首 200 条', async () => {
    const f = await fixture()
    try {
        const url = 'https://example.com/paged'
        const edits = Array.from({ length: 205 }, (_, i) => ({ entity: crypto.randomUUID(), kind: 'bookmark', values: {
            title: '分页 ' + url, url: i < 2 ? url : 'https://example.com/noise-' + i, position: { parent: null, order: i }
        } }))
        await f.native('execute', { id: crypto.randomUUID(), edits }, f.libraryId)
        const selected = await f.model.api('get', 'me/selection?space=0', {}, f.libraryId)
        const matches = await f.model.api('get', 'me/matches?link=' + encodeURIComponent(url), {}, f.libraryId)
        assert.equal(selected.items.length, 205)
        assert.equal(new Set(selected.items.map(e => e._me.id)).size, 205)
        assert.equal(matches.items.length, 2)
    } finally { await f.close() }
})


test('混合顺序：完整直接子项、整笔位置提交、冻结版本与冲突拒绝', async () => {
    const f = await fixture()
    try {
        const parent = crypto.randomUUID(), child = crypto.randomUUID(), one = crypto.randomUUID(), two = crypto.randomUUID(), nested = crypto.randomUUID()
        await f.native('execute', { id: crypto.randomUUID(), edits: [
            { entity: parent, kind: 'collection', values: { name: '父集合' } },
            { entity: one, kind: 'bookmark', values: { title: '书签一', url: 'https://example.com/1', position: { parent, order: 0 } } },
            { entity: child, kind: 'collection', values: { name: '子集合', position: { parent, order: 1 } } },
            { entity: two, kind: 'bookmark', values: { title: '书签二', url: 'https://example.com/2', position: { parent, order: 2 } } },
            { entity: nested, kind: 'bookmark', values: { title: '深层条目', url: 'https://example.com/nested', position: { parent: child, order: 0 } } }
        ] }, f.libraryId)
        const view = await f.model.id(parent)
        const query = () => f.model.api('get', `raindrops/${view}?sort=sort&perpage=1`, {}, f.libraryId)
        let result = await query()
        assert.equal(result.items.length, 2)
        assert.deepEqual(result._meChildren.entries.map(e => e.kind), ['bookmark', 'collection', 'bookmark'])
        const raw = snapshot => snapshot.entries.map(({kind, item:{_me}}) => ({kind,id:_me.id,heads:_me.heads,values:_me.values}))
        const frozen = raw(result._meChildren), values = { parent, sort:'sort',search:'' }
        let executions = []
        const native = f.model.native
        f.model.native = async (method, ...args) => { if (method === 'execute') executions.push(clone(args[0])); return native(method, ...args) }
        await f.model.organize({ action:'reorder', items:[frozen[2],frozen[1],frozen[0]], values }, f.libraryId)
        assert.equal(executions.length, 1)
        assert.deepEqual(executions[0].edits.map(e=>e.kind), ['bookmark','collection','bookmark'])
        assert.deepEqual((await query())._meChildren.entries.map(e=>e.item._me.id), [two,child,one])
        assert.equal((await f.native('get',{id:nested},f.libraryId)).values.position.parent, child)
        const freshModel = new Model(f.native, f.storage)
        assert.deepEqual((await freshModel.api('get', `raindrops/${view}?sort=sort`,{},f.libraryId))._meChildren.entries.map(e=>e.item._me.id),[two,child,one])
        for (const url of ['raindrops/0?sort=sort', `raindrops/${view}?sort=sort&search=书签`, `raindrops/${view}?search=type:link`, 'raindrops/-99?sort=sort'])
            assert.equal((await f.model.api('get',url,{},f.libraryId))._meChildren, undefined)
        for (const invalid of [{...values,parent:null},{...values,sort:'title'},{...values,search:'x'}])
            await assert.rejects(f.model.organize({action:'reorder',items:frozen,values:invalid},f.libraryId), {code:'INVALID'})
        result = await query()
        const current = raw(result._meChildren)
        const original = await f.native('get',{id:two},f.libraryId)
        await f.native('execute',{id:crypto.randomUUID(),edits:[{entity:two,values:{position:{parent,order:8}},base:original.heads}]},f.libraryId)
        await f.model.organize({action:'reorder',items:current.reverse(),values},f.libraryId)
        assert.equal((await f.native('get',{id:two},f.libraryId)).conflicts.position.length,2,'concurrent position is preserved, never refreshed away')
        const before = await f.native('get',{id:one},f.libraryId)
        const conflict = raw((await query())._meChildren)
        await assert.rejects(f.model.organize({action:'reorder',items:conflict.reverse(),values},f.libraryId), {code:'CONFLICT'})
        assert.deepEqual((await f.native('get',{id:one},f.libraryId)).heads, before.heads,'failed transaction leaves all siblings unchanged')
    } finally { await f.close() }
})

test('混合顺序：跨分页完整兄弟、跨查询版本变化明确报错', async () => {
    const f = await fixture()
    try {
        const parent=crypto.randomUUID(), child=crypto.randomUUID()
        const edits=[{entity:parent,kind:'collection',values:{name:'分页父集合'}},{entity:child,kind:'collection',values:{name:'中间子集合',position:{parent,order:100.5}}}]
        for(let i=0;i<205;i++) edits.push({entity:crypto.randomUUID(),kind:'bookmark',values:{title:'条目'+i,url:'https://example.com/'+i,position:{parent,order:i}}})
        await f.native('execute',{id:crypto.randomUUID(),edits},f.libraryId)
        const view=await f.model.id(parent), url=`raindrops/${view}?sort=sort&perpage=40`
        const result=await f.model.api('get',url,{},f.libraryId)
        assert.equal(result.items.length,205); assert.equal(result._meChildren.entries.length,206)
        assert.equal(result._meChildren.entries[101].item._me.id,child)
        const actual=f.model.native
        let changed=false
        f.model.native=async(method,params,libraryId)=>{
            const response=await actual(method,params,libraryId)
            if(method==='query'&&params.kind==='collection'&&params.collection===parent&&!changed){changed=true;return {...response,revision:response.revision+'changed'}}
            return response
        }
        await assert.rejects(f.model.api('get',url,{},f.libraryId),{code:'REVISION_CHANGED'})
    } finally {await f.close()}
})

test('侧栏排序：与内容区交替重排、前后锚点、跨集合和根层移动保留完整顺序', async () => {
    const f = await fixture()
    try {
        const ids = Object.fromEntries(['P', 'Q', 'A', 'X', 'B', 'Y', 'C'].map(name => [name, crypto.randomUUID()]))
        const rows = [['P', 'collection', null, 0], ['Q', 'collection', null, 1],
            ['A', 'bookmark', 'P', 0], ['X', 'collection', 'P', 1], ['B', 'bookmark', 'P', 2], ['Y', 'collection', 'P', 3], ['C', 'bookmark', 'Q', 0]]
        await f.native('execute', { id: crypto.randomUUID(), edits: rows.map(([name, kind, parent, order]) => ({
            entity: ids[name], kind, values: { position: { parent: parent ? ids[parent] : null, order },
                ...(kind === 'bookmark' ? { title: name, url: 'https://example.com/' + name } : { name }) }
        })) }, f.libraryId)
        const sidebar = async (name, parent, anchor, after = false) => {
            const siblings = (await f.model.api('get', 'collections/all', {}, f.libraryId)).items
            const source = siblings.find(item => item._me.id === ids[name])
            const body = {
                parentId: parent ? await f.model.id(ids[parent]) : 'root', order: 0,
                _me: source._me, _source: source, _siblings: siblings,
                ...(anchor ? { _anchor: { id: await f.model.id(ids[anchor]), after } } : {})
            }
            const result = await f.model.api('put', 'collection/' + source._id, body, f.libraryId)
            const revision = (await f.native('status', {}, f.libraryId)).revision
            const replay = await f.model.api('put', 'collection/' + source._id, body, f.libraryId)
            assert.equal(replay._meReceipt, result._meReceipt)
            assert.equal((await f.native('status', {}, f.libraryId)).revision, revision, 'same sidebar request reuses its durable command')
            return result
        }
        const snapshot = async name => (await f.model.api('get', `raindrops/${await f.model.id(ids[name])}?sort=sort`, {}, f.libraryId))._meChildren
        const expectOrder = async (parent, names) => {
            const entries = (await snapshot(parent)).entries
            assert.deepEqual(entries.map(e => e.item._me.id), names.map(name => ids[name]))
            assert.deepEqual(entries.map(e => e.item._me.values.position.order), names.map((_, i) => i))
        }
        await sidebar('Y', 'P')
        await expectOrder('P', ['Y', 'A', 'X', 'B'])
        await sidebar('Y', 'P', 'X', true)
        await expectOrder('P', ['A', 'X', 'Y', 'B'])
        await sidebar('Y', 'P', 'X')
        await expectOrder('P', ['A', 'Y', 'X', 'B'])
        const view = await snapshot('P')
        const items = view.entries.map(({ kind, item: { _me } }) => ({ kind, id: _me.id, values: _me.values, heads: _me.heads }))
        await f.model.organize({ action: 'reorder', items: [items[3], ...items.slice(0, 3)], values: { parent: ids.P, sort: 'sort', search: '' } }, f.libraryId)
        await sidebar('X', 'P', 'Y')
        await expectOrder('P', ['B', 'A', 'X', 'Y'])
        await sidebar('Y', 'Q')
        await expectOrder('Q', ['Y', 'C'])
        assert.deepEqual((await snapshot('P')).entries.map(e => e.item._me.id), [ids.B, ids.A, ids.X])
        await sidebar('Y', null)
        const roots = (await f.model.api('get', 'collections/all', {}, f.libraryId)).items.filter(item => !item.parentId).sort((a, b) => a.sort - b.sort)
        assert.deepEqual(roots.map(item => item._me.id), [ids.Y, ids.P, ids.Q])
        assert.deepEqual(roots.map(item => item.sort), [0, 1, 2])
        assert.equal((await f.native('get', { id: ids.C }, f.libraryId)).values.position.parent, ids.Q)
    } finally { await f.close() }
})

test('侧栏排序：保留已展示集合版本，冲突或失效锚点不部分写入', async () => {
    const f = await fixture()
    try {
        const parent = (await f.model.api('post', 'collection', { title: '排序版本' }, f.libraryId)).item
        const x = (await f.model.api('post', 'collection', { title: 'X', parentId: parent._id }, f.libraryId)).item
        const y = (await f.model.api('post', 'collection', { title: 'Y', parentId: parent._id }, f.libraryId)).item
        const d = await seed(f)
        await f.drafts.merge(d.key, edit(d, { collectionId: parent._id, order: 0 }), true)
        const frozen = (await f.model.api('get', 'collections/all', {}, f.libraryId)).items
        await f.native('execute', { id: crypto.randomUUID(), edits: [{ entity: x._me.id, base: x._me.heads, values: { position: { parent: parent._me.id, order: 99 } } }] }, f.libraryId)
        await f.model.api('put', 'collection/' + y._id, { parentId: parent._id, order: 0, _me: y._me, _source: y, _siblings: frozen }, f.libraryId)
        assert.equal((await f.native('get', { id: x._me.id }, f.libraryId)).conflicts.position.length, 2)
        const fresh = (await f.model.api('get', 'collections/all', {}, f.libraryId)).items
        const currentY = fresh.find(item => item._id === y._id)
        const body = { parentId: parent._id, order: 0, _me: currentY._me, _source: currentY, _siblings: fresh }
        const before = (await f.native('status', {}, f.libraryId)).revision
        await assert.rejects(f.model.api('put', 'collection/' + y._id, { ...body, _anchor: { id: x._id, after: true } }, f.libraryId), { code: 'CONFLICT' })
        assert.equal((await f.native('status', {}, f.libraryId)).revision, before)
        await assert.rejects(f.model.api('put', 'collection/' + y._id, { ...body, _anchor: { id: parent._id, after: false } }, f.libraryId), { code: 'INVALID' })
        assert.equal((await f.native('status', {}, f.libraryId)).revision, before)
    } finally { await f.close() }
})

test('D1 网页字段基于实际网址和版本写入，人工清空、迟到与混合来源', async () => {
    const f = await fixture()
    try {
        const { model, drafts, native, libraryId } = f
        let d = await drafts.open('draft:clip', { pageMetadata: true, item: {
            link: 'https://example.test/page', title: '网页标题', excerpt: '网页摘要', type: 'article', cover: 'https://example.test/a.png'
        } }, libraryId)
        d = edit(d, { excerpt: '' })
        d.autoFields = d.autoFields.filter(field => field !== 'excerpt')
        d = await drafts.merge(d.key, d, true)
        const id = d.item._me.id
        const read = () => native('get', { id }, libraryId)
        const update = (values, base, extra = {}) => native('execute', { id: crypto.randomUUID(),
            edits: [{ entity: id, values, base, ...extra }] }, libraryId)
        const first = await read()
        assert.deepEqual(first.policies, { title: 'auto', description: 'manual', cover: 'auto', type: 'auto' })
        await update({ title: '自动更新', description: '不应填回' }, first.heads, { metadata: true, url: first.values.url })
        const after = await read()
        assert.equal(after.values.title, '自动更新')
        assert.equal(after.values.description, '')
        const accept = (source, values) => model.api('post', 'me/metadata', { source, values }, libraryId)
        await assert.rejects(accept(d.item._me, { title: '过时', description: '整笔拒绝' }), { code: 'STALE_RESOLUTION' })
        assert.equal((await read()).values.description, '')
        const fresh = (await model.bookmark(after, libraryId))._me
        await update({ url: 'https://example.test/changed' }, after.heads)
        await update({ url: first.values.url }, (await read()).heads)
        await assert.rejects(accept(fresh, { description: '旧网址回包' }), { code: 'STALE_RESOLUTION' })
        assert.equal((await update({ cover: 'https://example.test/wrong.png' }, after.heads, { metadata: true, url: first.values.url })).state, 'no-change')
        const latest = await read()
        await update({ note: '独立备注' }, latest.heads)
        await accept((await model.bookmark(latest, libraryId))._me, { description: '明确接受' })
        assert.equal((await read()).values.note, '独立备注')
        assert.equal((await read()).policies.description, 'manual')
    } finally { await f.close() }
})

test('D1 永久删除冻结整组状态，陈旧恢复拒绝且保留删除记录', async () => {
    const f = await fixture()
    try {
        const { model, native, libraryId } = f
        const ids = [crypto.randomUUID(), crypto.randomUUID()]
        const execute = edits => native('execute', { id: crypto.randomUUID(), edits }, libraryId)
        const read = id => native('get', { id }, libraryId)
        await execute(ids.map(entity => ({ entity, kind: 'bookmark', values: { title: entity, url: 'https://example.test/trash', life: 'trashed' } })))
        const { items } = await model.api('get', 'me/selection?space=-99', {}, libraryId)
        const frozen = items.map(item => ({ ...item._me, kind: 'bookmark' }))
        const purge = items => model.organize({ action: 'purge', items }, libraryId)
        await execute([{ entity: ids[1], base: (await read(ids[1])).heads, values: { life: 'active' } }])
        await assert.rejects(purge(frozen), { code: 'STALE_RESOLUTION' })
        assert.equal((await read(ids[0])).purged, false)
        const selected = frozen.filter(e => e.id === ids[0])
        await purge(selected)
        assert.equal((await read(ids[0])).purged, true)
        assert.equal((await model.query(-99, '', libraryId)).items.length, 0)
        await assert.rejects(execute([{ entity: ids[0], base: (await read(ids[0])).heads, values: { life: 'active' } }]), { code: 'PURGED' })
    } finally { await f.close() }
})

test('D1 候选查询只查用户内容，保留真正的 manual 和标签名称', async () => {
    const f = await fixture()
    try {
        const { native, libraryId } = f
        const one = crypto.randomUUID(), tag = crypto.randomUUID()
        const commit = edits => native('execute', { id: crypto.randomUUID(), edits }, libraryId)
        const read = id => native('get', { id }, libraryId)
        const query = q => native('query', { q }, libraryId)
        await commit([{entity: tag, kind:'tag', values:{ name:'基线标签' }},
            {entity: one, kind:'bookmark', values:{url:'https://example.test/',title:'基线标题',['tag:'+tag]:true}}])
        const base = (await read(one)).heads
        for (const value of ['候选一','候选二']) await commit([{entity:one,base,values:{title:value}}])
        const heads = (await read(one)).heads
        for (const term of ['manual','policy',heads.title[0],tag]) assert.equal((await query(term)).total,0,term)
        assert.equal((await query('候选一')).items[0].candidateEntity,one)
        const tagBase = (await read(tag)).heads
        for (const value of ['标签手册甲','标签手册乙']) await commit([{entity:tag,base:tagBase,values:{name:value}}])
        assert.equal((await query('标签手册甲')).items[0].candidateEntity,tag)
        await commit([{entity:one,base:(await read(one)).heads,values:{note:'Manual for readers'}}])
        assert.equal((await query('manual')).items[0].candidateMatch,false)
    } finally { await f.close() }
})


test('D1 companion rejects helpers without metadata support', async () => {
    const native = async method => {
        assert.equal(method, 'capabilities')
        return { protocol: 1, schema: 1, features: [] }
    }
    await assert.rejects(new Model(native, {}).session(), { code: 'VERSION' })
})

test('collection icons: catalog validation, versioned change/reset and cold readback', async () => {
    const names = require('../src/me/collection-icons.json')
    assert.deepEqual(names, (await fs.readdir(path.resolve(__dirname, '../src/assets/icons'))).filter(n => n.endsWith('.svg')).sort())
    const f = await fixture()
    try {
        let item = (await f.model.api('post', 'collection', { title: 'Icon acceptance' }, f.libraryId)).item
        const originalId = item._me.id
        const sent = []
        const native = f.model.native
        f.model.native = async (method, params, libraryId) => {
            if (method === 'execute') sent.push(clone(params))
            return native(method, params, libraryId)
        }
        for (const icon of ['assets/collection-icons/book.svg', 'assets/collection-icons/twemoji-dna.svg', 'assets/collection-icons/twemoji-books.svg', '']) {
            const before = clone(item._me.heads)
            item = (await f.model.api('put', `collection/${item._id}`, { cover: [icon], _me: item._me, _source: item }, f.libraryId)).item
            const edit = sent.at(-1).edits[0]
            assert.equal(edit.entity, originalId)
            assert.deepEqual(edit.base, before)
            assert.deepEqual(edit.values, { icon })
            const raw = await f.native('get', { id: originalId }, f.libraryId)
            assert.equal(raw.values.icon, icon)
            assert.equal(raw.values.life, 'active')
            assert.equal(raw.heads.icon.length, 1)
            assert.deepEqual(raw.conflicts, {})
            const fresh = new Model(f.native, f.storage)
            const cold = (await fresh.api('get', `collection/${item._id}`, {}, f.libraryId)).item
            assert.deepEqual(cold.cover, icon ? [icon] : [])
        }
        const writes = sent.length
        for (const icon of ['assets/collection-icons/missing.svg', 'assets/collection-icons/../book.svg', 'https://example.org/icon.png', '📚']) {
            await assert.rejects(f.model.api('put', `collection/${item._id}`, { cover: [icon], _me: item._me, _source: item }, f.libraryId), { code: 'INVALID' })
            const view = await f.model.collection({ id: originalId, values: { icon }, heads: {}, conflicts: {} }, f.libraryId)
            assert.deepEqual(view.cover, [])
        }
        assert.equal(sent.length, writes)
    } finally { await f.close() }
})
