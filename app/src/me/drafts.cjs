const { clone, fail, conflicted } = require('./model.cjs')

// Storage mutations are serialized; native writes run outside this lock so typing stays durable.
class Drafts {
    constructor(model, storage) {
        this.model = model
        this.storage = storage
        this.lock = Promise.resolve()
        this.running = new Map()
    }
    mutate(fn) {
        const task = this.lock.then(fn)
        this.lock = task.catch(() => {})
        return task
    }
    async open(key, options, libraryId) {
        return this.mutate(async () => {
            const existing = await this.storage.get(key)
            if (existing) {
                if (existing.libraryId !== libraryId) fail('LIBRARY_MISMATCH', '草稿属于另一个库')
                if (existing.error?.code === 'CONFLICT' && !existing.pending && !Object.keys(existing.dirty).length) {
                    const fresh = await this.model.bookmark(await this.model.call('get', { id: existing.item._me.id }, libraryId), libraryId)
                    existing.item = fresh
                    if (!fresh._me.conflicts) existing.error = null
                    await this.storage.set(key, existing)
                }
                if (existing.pending || existing.error || Object.keys(existing.dirty).length || !existing.item._me) return existing
                const entity = await this.model.call('get', { id: existing.item._me.id }, libraryId)
                if (!entity.purged || Number(options.id) > 0) {
                    existing.item = await this.model.bookmark(entity, libraryId)
                    await this.storage.set(key, existing)
                    return existing
                }
                // A fresh save of this URL must never reuse a purged UUID.
            }
            let item
            if (Number(options.id) > 0) item = await this.model.bookmark(await this.model.resolve(options.id, 'bookmark', libraryId), libraryId)
            else {
                const seed = options.item || {}, link = seed.link || options.id || ''
                const matches = (await this.model.all({ q: link }, libraryId)).items.filter(e => e.values.url === link)
                if (matches.length > 1) fail('MULTIPLE_MATCHES', '此网址已有多条书签，请明确选择要编辑的条目')
                item = matches.length ? await this.model.bookmark(matches[0], libraryId) : {
                    _id: 0, link, title: seed.title || '', excerpt: seed.excerpt || '', note: seed.note || '',
                    tags: seed.tags || [], collectionId: seed.collectionId || -1, important: !!seed.important,
                    type: seed.type ?? 'link', cover: seed.cover || '', media: Array.isArray(seed.media) ? seed.media : [], highlights: [], reminder: {}
                }
            }
            const fields = item._me ? {} : Object.fromEntries(['link', 'title', 'excerpt', 'note', 'tags', 'collectionId', 'important', 'type', 'cover'].map(k => [k, 1]))
            const autoFields = !item._me && options.pageMetadata ? ['title', 'excerpt', 'cover', 'type'] : []
            const draft = { key, libraryId, item, autoFields, fieldSeq: fields, dirty: { ...fields }, seq: 1, savedSeq: 0, requestedSeq: 0, pending: null, error: null }
            await this.storage.set(key, draft)
            return draft
        })
    }
    async merge(key, incoming, save) {
        await this.mutate(async () => {
            const d = await this.storage.get(key)
            if (!d || incoming.libraryId !== d.libraryId) fail('LIBRARY_MISMATCH', '草稿库标识不匹配')
            for (const [field, seq] of Object.entries(incoming.fieldSeq || {})) {
                if (seq > (d.fieldSeq[field] || 0)) {
                    if (d.autoFields && !incoming.autoFields?.includes(field)) d.autoFields = d.autoFields.filter(k => k !== field)
                    if (field === 'link' && incoming.item.link !== d.item.link) d.item.media = []
                    d.item[field] = incoming.item[field]
                    d.fieldSeq[field] = seq
                    d.dirty[field] = seq
                }
            }
            d.seq = Math.max(d.seq, incoming.seq)
            // Existing records auto-save. A submitted new record keeps accepting later keystrokes.
            if (save || d.item._me || d.requestedSeq) d.requestedSeq = d.seq
            if (save && Object.keys(d.dirty).length) d.error = null
            await this.storage.set(key, d)
        })
        const d = await this.storage.get(key)
        if (d.requestedSeq && !d.error) {
            const draining = this.drain(key)
            if (save) await draining
            else draining.catch(() => {})
        }
        return this.storage.get(key)
    }
    drain(key) {
        if (this.running.has(key)) return this.running.get(key)
        const running = this.run(key).finally(() => this.running.delete(key))
        this.running.set(key, running)
        return running
    }
    async run(key) {
        while (true) {
            let pending, receipt
            try {
                pending = await this.mutate(async () => {
                const d = await this.storage.get(key)
                if (d.pending) return d.pending
                if (d.error || !d.requestedSeq || !Object.keys(d.dirty).length) return null
                const command = await this.model.command(d.item, Object.keys(d.dirty), d.libraryId)
                if (!d.item._me && d.autoFields?.length) {
                    const names = { title: 'title', excerpt: 'description', cover: 'cover', type: 'type' }
                    command.edits.at(-1).autoFields = d.autoFields.map(k => names[k])
                }
                d.pending = { command, fields: clone(d.dirty), seq: d.seq }
                await this.storage.set(key, d)
                return d.pending
                })
                if (!pending) return this.storage.get(key)
                receipt = await this.model.call('execute', pending.command, pending.command.libraryId)
                if (receipt.state !== 'committed-readable') fail('SAVE_INCOMPLETE', '尚未确认写入；草稿已保留')
                const eid = pending.command.edits.at(-1).entity
                const entity = await this.model.call('get', { id: eid }, pending.command.libraryId)
                await this.mutate(async () => {
                    const d = await this.storage.get(key)
                    const meta = d.item._me || { id: eid, libraryId: d.libraryId, heads: {}, values: {} }
                    // Only own receipt heads advance the edit base; a concurrent reader never rewrites it.
                    Object.assign(meta.heads, receipt.writtenHeads[eid])
                    Object.assign(meta.values, pending.command.edits.at(-1).values)
                    meta.conflicts = !!conflicted(entity)
                    meta.conflictFields = Object.keys(entity.conflicts || {})
                    d.item._me = meta
                    d.item._id = await this.model.id(eid)
                    if (pending.fields.removed && (d.fieldSeq.collectionId || 0) <= pending.seq) {
                        d.item.collectionId = meta.values.life !== 'active' ? -99 : meta.values.position?.parent ? await this.model.id(meta.values.position.parent) : -1
                    }
                    for (const [field, seq] of Object.entries(pending.fields)) if (d.dirty[field] === seq) delete d.dirty[field]
                    d.savedSeq = Math.max(d.savedSeq, pending.seq)
                    d.pending = null
                    d.error = meta.conflicts ? { code: 'CONFLICT', message: '并发修改产生冲突；所有候选已保留，请从冲突入口处理' } : null
                    await this.storage.set(key, d)
                })
            } catch (error) {
                await this.mutate(async () => {
                    const d = await this.storage.get(key)
                    d.error = { code: error.code || 'HELPER_UNAVAILABLE', message: error.message }
                    // An explicit core rejection committed nothing; corrected input needs a new command.
                    if (!receipt && ['INVALID', 'BASE_REQUIRED', 'CONFLICT', 'PURGED'].includes(error.code)) d.pending = null
                    // Keep the exact command ID and payload for replay after response loss.
                    await this.storage.set(key, d)
                })
                throw error
            }
        }
    }
    async recover() {
        const libraryId = (await this.model.session()).libraryId
        const entries = await this.storage.entries()
        const results = []
        for (const [key, d] of Object.entries(entries)) {
            if (!key.startsWith('draft:') || d.libraryId !== libraryId || (!d.pending && !d.requestedSeq)) continue
            if (d.error && !['HELPER_UNAVAILABLE', 'BUSY', 'SAVE_INCOMPLETE'].includes(d.error.code)) continue
            try { results.push(await this.drain(key)) } catch (_) { /* Error remains visible in the durable draft. */ }
        }
        return results
    }
}

module.exports = { Drafts }
