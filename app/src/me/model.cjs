const { acceptedImport } = require('./accepted-import.cjs')
/* The ME UUID and field heads remain authoritative. Numeric IDs are view keys only. */
const clone = value => JSON.parse(JSON.stringify(value))
const fail = (code, message) => { throw Object.assign(new Error(message), { code }) }
const unsupported = () => fail('B1_UNSUPPORTED', '此功能未接入 B1，等待后续决策')
const bundledIcons = new Set(require('./collection-icons.json').map(name => 'assets/collection-icons/' + name))
const bundledIcon = value => bundledIcons.has(value)
const conflicted = e => Object.keys(e.conflicts || {}).length || (e.structural || []).length

async function hash(value) {
    const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
    return Array.from(new Uint8Array(bytes)).map(x => x.toString(16).padStart(2, '0')).join('')
}
async function viewId(id) {
    return parseInt((await hash(id)).slice(0, 13), 16) + 1
}

class Model {
    constructor(native, storage) {
        this.native = native
        this.storage = storage
        this.identities = new Map()
        this.commands = new Map()
    }
    async session() {
        const cap = await this.native('capabilities')
        if (cap.protocol !== 1 || cap.schema !== 1 || !cap.features?.includes('d1-metadata')) fail('VERSION', '请使用与本次 D1 构建配套的文件助手')
        if (!cap.library) fail('NO_LIBRARY', '请先绑定本地书签库')
        return cap.library
    }
    async call(method, params, libraryId) {
        if (!libraryId) fail('NO_LIBRARY', '缺少本地书签库标识')
        return this.native(method, params, libraryId)
    }
    async durable(key, prepare) {
        if (this.commands.has(key)) return this.commands.get(key)
        const task = (async () => {
            let entry = await this.storage.get(key)
            if (!entry) {
                entry = { command: await prepare(), receipt: null }
                await this.storage.set(key, entry)
            }
            if (!entry.receipt) {
                try { entry.receipt = await this.call('execute', entry.command, entry.command.libraryId) }
                catch (error) {
                    if (['INVALID', 'BASE_REQUIRED', 'CONFLICT', 'PURGED', 'CYCLE', 'STALE_RESOLUTION'].includes(error.code)) await this.storage.set(key, null)
                    throw error
                }
                if (entry.receipt.state !== 'committed-readable') fail('SAVE_INCOMPLETE', '尚未确认写入，原命令已保留')
                await this.storage.set(key, entry)
            }
            return entry
        })().finally(() => this.commands.delete(key))
        this.commands.set(key, task)
        return task
    }
    async recover(libraryId) {
        for (const [key, entry] of Object.entries(await this.storage.entries()))
            if (key.startsWith(`command:${libraryId}:`) && entry && !entry.receipt)
                try { await this.durable(key) } catch (_) { /* Preserve the exact command for an explicit retry. */ }
    }
    async id(uuid) {
        const id = await viewId(uuid)
        if (this.identities.has(id) && this.identities.get(id) !== uuid)
            fail('VIEW_ID_COLLISION', '显示编号冲突；原始数据未改动')
        this.identities.set(id, uuid)
        return id
    }
    async all(filters, libraryId) {
        let items = [], revision, total
        do {
            const page = await this.call('query', { ...filters, offset: items.length, limit: 200 }, libraryId)
            if (revision !== undefined && revision !== page.revision)
                fail('REVISION_CHANGED', '书签库正在变化，请重新查询')
            revision = page.revision
            total = page.total
            items.push(...page.items)
        } while (items.length < total)
        for (const item of items) await this.id(item.id)
        return { items, revision }
    }
    async resolve(id, kind, libraryId) {
        if (Number(id) <= 0) return null
        // Rebuild the derived index on a worker restart. Never infer identity from a URL.
        if (!this.identities.has(Number(id))) {
            await this.all({ kind }, libraryId)
            await this.all({ kind, trash: true }, libraryId)
        }
        const uuid = this.identities.get(Number(id))
        if (!uuid) fail('NOT_FOUND', '条目不存在')
        const e = await this.call('get', { id: uuid }, libraryId)
        if (e.kind !== kind) fail('INVALID', '条目类型不匹配')
        return e
    }
    async bookmark(e, libraryId) {
        if (e.purged) fail('PURGED', '已永久删除，不能恢复旧编号')
        const v = e.values
        const tags = [...new Set(e.tags || [])]
        if (!e.tags) for (const key of Object.keys(v).filter(k => k.startsWith('tag:') && v[k])) {
            let id = key.slice(4), seen = new Set()
            while (id && !seen.has(id)) {
                seen.add(id)
                const tag = await this.call('get', { id }, libraryId)
                if (tag.values.redirect) id = tag.values.redirect
                else { if (tag.values.life === 'active') tags.push(tag.values.name); break }
            }
        }
        let domain = ''
        try { domain = new URL(v.url).hostname } catch (_) {}
        return {
            _id: await this.id(e.id), title: v.title || '', link: v.url || '',
            excerpt: v.description || '', note: v.note || '', cover: v.cover || '',
            type: v.type ?? 'link', important: !!v.favorite, tags,
            collectionId: v.life !== 'active' ? -99 : v.position?.parent ? await this.id(v.position.parent) : -1,
            domain, created: v.created || null, lastUpdate: v.updated || null,
            ...(e.candidateMatch ? { highlight: { candidateMatch: e.candidateEntity || e.id } } : {}),
            media: [], highlights: [], reminder: {},
            _me: { id: e.id, libraryId, heads: e.heads, values: v, conflicts: !!conflicted(e), conflictFields: Object.keys(e.conflicts || {}) }
        }
    }
    async collection(e, libraryId) {
        const v = e.values
        return {
            _id: await this.id(e.id), title: v.name || '', description: v.description || '',
            parentId: v.position?.parent ? await this.id(v.position.parent) : null,
            sort: v.position?.order || 0, author: true, access: { level: 4, draggable: true },
            count: 0, view: v.view || 'list', expanded: v.expanded !== false,
            cover: bundledIcon(v.icon) ? [v.icon] : [], color: v.color || '',
            _me: { id: e.id, libraryId, heads: e.heads, values: v, conflicts: !!conflicted(e), conflictFields: Object.keys(e.conflicts || {}) }
        }
    }
    async command(item, fields, libraryId, kind = 'bookmark') {
        const meta = item._me
        if (meta?.libraryId && meta.libraryId !== libraryId) fail('LIBRARY_MISMATCH', '库已切换，输入保留在原库草稿中')
        const entity = meta?.id || crypto.randomUUID()
        const base = clone(meta?.heads || {})
        const values = {}, edits = []
        const mapping = kind === 'bookmark'
            ? { title: 'title', link: 'url', excerpt: 'description', note: 'note', important: 'favorite', type: 'type', cover: 'cover', removed: 'life' }
            : { title: 'name', description: 'description', view: 'view', expanded: 'expanded', color: 'color' }
        for (const field of fields) {
            if (kind === 'collection' && field === 'cover') {
                const icon = item.cover?.[0]
                if (!Array.isArray(item.cover) || (icon !== '' && !bundledIcon(icon))) fail('INVALID', '请选择内置图标')
                values.icon = icon
            } else if (mapping[field]) values[mapping[field]] = field === 'removed' ? (item[field] ? 'trashed' : 'active') : item[field]
            else if (field === 'collectionId' || field === 'parentId' || field === 'sort' || field === 'order') {
                const parentId = kind === 'bookmark' ? item.collectionId : item.parentId
                if (Number(parentId) === -99) values.life = 'trashed'
                else {
                    const parent = await this.resolve(parentId === 'root' ? -1 : parentId || -1, 'collection', libraryId)
                    values.position = { parent: parent?.id || null, order: item.order ?? item.sort ?? meta?.values?.position?.order ?? Date.now() }
                }
            } else if (field === 'tags') {
                const names = [...new Set(item.tags.map(t => t.trim()).filter(Boolean))]
                const tags = (await this.all({ kind: 'tag' }, libraryId)).items
                const ids = []
                for (const name of names) {
                    const matches = tags.filter(t => t.values.name === name && !t.values.redirect)
                    if (matches.length > 1) fail('AMBIGUOUS_TAG', '存在同名标签，请先在原 ME 中整理')
                    if (matches.length) ids.push(matches[0].id)
                    else {
                        const id = crypto.randomUUID()
                        ids.push(id)
                        edits.push({ entity: id, kind: 'tag', values: { name, life: 'active' }, base: {} })
                    }
                }
                for (const key of Object.keys(meta?.values || {}).filter(k => k.startsWith('tag:')))
                    values[key] = ids.includes(key.slice(4))
                for (const id of ids) values['tag:' + id] = true
            } else unsupported()
        }
        // Old ME restore keeps the stored position and falls back only when its collection is gone.
        if (kind === 'bookmark' && item.removed === false && meta?.values?.life !== 'active') {
            const collections = (await this.all({ kind: 'collection' }, libraryId)).items
            values.position = { ...meta.values.position,
                parent: collections.some(c => c.id === meta.values.position?.parent) ? meta.values.position.parent : null }
        }
        if ((meta?.conflictFields || []).some(field => field in values))
            fail('CONFLICT', '请通过冲突入口查看候选后处理此字段')
        if (!meta?.id) {
            values.life = 'active'
            values.created = new Date().toISOString()
            if (kind === 'bookmark') {
                if (!values.url) fail('INVALID', '请输入完整网址')
                values.position ||= { parent: null, order: Date.now() }
            }
        }
        edits.push({ entity, kind, values, base })
        return { id: crypto.randomUUID(), libraryId, edits }
    }
    async query(space, search, libraryId, descendants = false) {
        const filters = { kind: 'bookmark', tags: [] }
        if (Number(space) === -99) filters.trash = true
        else if (Number(space) === -1) filters.collection = null
        else if (Number(space) > 0) filters.collection = (await this.resolve(space, 'collection', libraryId)).id
        if (Number(space) > 0 && descendants) filters.descendants = true
        let q = search.trim(), note = false, notag = false
        q = q.replace(/(?:^|\s)#(?:"([^"]+)"|([^\s]+))/g, (_, a, b) => { filters.tags.push(a || b); return ' ' })
        q = q.replace(/❤️|❤/g, () => { filters.favorite = true; return '' })
        q = q.replace(/\btype:(\w+)/g, (_, type) => { filters.type = type; return '' })
        q = q.replace(/\bnote:true/g, () => { note = true; return '' })
        q = q.replace(/\bnotag:true/g, () => { notag = true; return '' })
        if (/\b[a-z]+:/.test(q.replace(/https?:\/\/\S+/g, ''))) unsupported()
        filters.q = q.trim().replace(/^"(.*)"$/, '$1')
        // The existing view groups a missing or cleared type under links. Preserve its stored value.
        const linkType = filters.type === 'link'
        if (linkType) delete filters.type
        const result = await this.all(filters, libraryId)
        if (linkType) result.items = result.items.filter(e => (e.values.type || 'link') === 'link')
        result.items = result.items.filter(e => (!note || e.values.note) && (!notag || !e.tags.length))
        return result
    }
    async organize(data, libraryId, receiptKey) {
        const { action, items, values } = data
        if (!Array.isArray(items) || !items.length || items.some(e => !e.id || !e.heads || !e.values))
            fail('BASE_REQUIRED', '整理须携带实际查看过的条目与版本')
        const key = receiptKey || `command:${libraryId}:organize:${await hash(JSON.stringify(data))}`
        await this.durable(key, async () => {
            // These command shapes are the old ME manager's edit/commit, entityMenu and conflictDetail rules.
            const edit = (e, values, extra = {}) => ({ entity: e.id, kind: e.kind, values, base: e.heads, ...extra })
            let edits
            if (action === 'resolve') edits = items.map(e => edit(e, { ...(e.purged ? { life: 'purged' } : {}), ...values }, { resolve: true }))
            else if (action === 'reorder') {
                const rootCollections = values?.parent === null && items.every(e => e.kind === 'collection')
                if ((!values?.parent && !rootCollections) || values.sort !== 'sort' || values.search !== '' ||
                    new Set(items.map(e => e.id)).size !== items.length ||
                    items.some(e => !['bookmark', 'collection'].includes(e.kind) || e.values.life !== 'active' ||
                        ((e.values.position?.parent || null) !== values.parent && !(e.kind === 'collection' && e.id === values.moving))))
                    fail('INVALID', '手动排序须使用同一集合的完整条目，根层仅允许集合排序')
                edits = items.map((e, order) => edit(e, { position: { parent: values.parent, order } }))
            }
            else if (action === 'purge') {
                if (items.some(e => e.kind !== 'bookmark' || e.values.life !== 'trashed' || !e.heads.life?.length || e.conflictFields?.includes('life')))
                    fail('INVALID', '请先查看回收站中的书签并处理删除状态冲突')
                // The core compares these viewed life heads under the write lock.
                edits = items.map(e => edit(e, { life: 'purged' }, { resolve: true }))
            }
            else if (action === 'rename-tag') {
                if (!values.name?.trim()) fail('INVALID', '请输入标签名称')
                edits = items.map(e => edit(e, { name: values.name.trim() }))
            }
            else if (action === 'merge-tag') edits = [edit(items[0], { redirect: items[1].id })]
            else if (action === 'trash-collection' || action === 'delete-tag') {
                edits = items.map(e => edit(e, e.kind === 'bookmark' && action === 'delete-tag'
                    ? { ['tag:' + items[0].id]: false } : { life: 'trashed' }))
            }
            else unsupported()
            return { id: crypto.randomUUID(), libraryId, edits }
        })
        return { result: true, _meReceipt: key }
    }
    async api(method, url, data, libraryId) {
        const [path, raw = ''] = url.split('?'), params = new URLSearchParams(raw)
        const parts = path.split('/')
        if (method === 'post' && path === 'me/import/preview') {
            if (typeof data.content !== 'string' || !data.content.trim() || typeof data.source !== 'string' || !data.source.trim())
                fail('IMPORT_FORMAT', '请选择书签 HTML，并保留文件来源名称')
            if (data.content.trimStart().startsWith('{')) fail('IMPORT_FORMAT', '当前仅接通书签 HTML；Chrome 内部 JSON 导入后置')
            let preview
            try { preview = await this.call('importPreview', { content: data.content, source: data.source }, libraryId) }
            catch (error) {
                if (error.code === 'IMPORT_FORMAT') fail('IMPORT_FORMAT', '请选择浏览器导出的书签 HTML')
                throw error
            }
            await this.storage.set(`import:${libraryId}:${preview.command.id}`, preview)
            return { preview }
        }
        if (method === 'post' && path === 'me/import/commit') {
            const preview = await this.storage.get(`import:${libraryId}:${data.id}`)
            if (!preview) fail('IMPORT_PREVIEW', '导入预览已失效，请重新选择文件')
            const decisions = data.decisions || {}
            for (const row of preview.rows) {
                if (row.deleted && decisions[row.id] === 'source') fail('PURGED', '导入不能复活已删除条目')
                if (row.candidates?.length && !row.candidates.some(c => c.id === decisions[row.id]))
                    fail('IMPORT_MATCH_REQUIRED', '相同网址须明确选择已有条目；取消可返回文件选择')
            }
            const edits = acceptedImport(preview, decisions)
            if (!edits.length) return { result: true }
            const key = `command:${libraryId}:import:${preview.command.id}`
            await this.durable(key, async () => ({ id: preview.command.id, libraryId, edits }))
            return { result: true, _meReceipt: key }
        }
        if (method === 'get' && path === 'me/export/html')
            return this.call('export', { skip: params.get('skip') === 'true' }, libraryId)
        if (method === 'get' && path === 'user') {
            const session = await this.session()
            if (session.libraryId !== libraryId) fail('LIBRARY_MISMATCH', '库已切换，请重新打开页面')
            const roots = (await this.all({ kind: 'collection' }, libraryId)).items.filter(e => !e.values.position?.parent)
            const positions = new Map(await Promise.all(roots.map(async e => [await this.id(e.id), e.values.position?.order || 0])))
            const groups = (await this.storage.get('groups:' + libraryId) || []).map(group => ({ ...group,
                collections: group.collections.filter(id => positions.has(id)).sort((a, b) => positions.get(a) - positions.get(b)) }))
            return { user: { name: session.name, config: await this.storage.get('preferences') || {}, groups } }
        }
        if (method === 'put' && path === 'user') {
            if (Object.keys(data).some(k => !['config', 'groups'].includes(k))) unsupported()
            if (data.groups) {
                await this.storage.set('groups:' + libraryId, data.groups)
                return { user: { groups: data.groups } }
            }
            const config = { ...(await this.storage.get('preferences') || {}), ...data.config }
            await this.storage.set('preferences', config)
            return { user: { config } }
        }
        if (method === 'get' && path === 'collections/all') {
            const collections = (await this.all({ kind: 'collection' }, libraryId)).items.sort((a, b) => (a.values.position?.order || 0) - (b.values.position?.order || 0))
            const bookmarks = (await this.all({ kind: 'bookmark' }, libraryId)).items
            return { items: await Promise.all(collections.map(async e => ({
                ...await this.collection(e, libraryId), count: bookmarks.filter(b => b.values.position?.parent === e.id).length
            }))) }
        }
        if (method === 'get' && path === 'user/stats') {
            const all = (await this.all({ kind: 'bookmark' }, libraryId)).items
            const trash = (await this.all({ kind: 'bookmark', trash: true }, libraryId)).items
            return { result: true, items: [{ _id: 0, count: all.length }, { _id: -1, count: all.filter(e => !e.values.position?.parent).length }, { _id: -99, count: trash.length }] }
        }
        if (method === 'get' && parts[0] === 'collection' && parts[2] === 'lastAction') {
            const status = await this.call('status', {}, libraryId)
            return { lastAction: status.revision, version: status.revision }
        }
        if (method === 'get' && ['raindrops', 'filters', 'tags'].includes(parts[0])) {
            const descendants = params.get('descendants') === 'true'
            const result = await this.query(parts[1] || 0, params.get('search') || '', libraryId, descendants)
            if (parts[0] !== 'raindrops') {
                const tags = new Map(), types = new Map()
                for (const e of result.items) {
                    for (const name of new Set(e.tags)) tags.set(name, (tags.get(name) || 0) + 1)
                    types.set(e.values.type || 'link', (types.get(e.values.type || 'link') || 0) + 1)
                }
                const tagSnapshot = await this.all({ kind: 'tag' }, libraryId)
                if (tagSnapshot.revision !== result.revision) fail('REVISION_CHANGED', '书签库正在变化，请重新查询')
                const tagEntities = tagSnapshot.items
                return { tags: [...tags].map(([_id, count]) => ({ _id, count, _meEntity: tagEntities.filter(t => t.values.name === _id && !t.values.redirect).length === 1 ? tagEntities.find(t => t.values.name === _id && !t.values.redirect) : null })), types: [...types].map(([_id, count]) => ({ _id, count })),
                    important: { count: result.items.filter(e => e.values.favorite).length }, note: { count: result.items.filter(e => e.values.note).length },
                    notag: { count: result.items.filter(e => !e.tags.length).length } }
            }
            const sort = params.get('sort') || '-created', desc = sort.startsWith('-'), field = sort.replace(/^-/, '')
            const fields = { created: 'created', lastUpdate: 'updated', title: 'title', domain: 'url' }
            if (field === 'sort') result.items.sort((a, b) => (a.values.position?.order || 0) - (b.values.position?.order || 0))
            else if (fields[field]) result.items.sort((a, b) => String(a.values[fields[field]] || '').localeCompare(String(b.values[fields[field]] || '')) * (desc ? -1 : 1))
            else unsupported()
            if (Number(parts[1]) > 0 && !descendants && !(params.get('search') || '').trim()) {
                const parent = (await this.resolve(parts[1], 'collection', libraryId)).id
                const children = await this.all({ kind: 'collection', collection: parent }, libraryId)
                if (children.revision !== result.revision) fail('REVISION_CHANGED', '书签库正在变化，请重新查询')
                const combined = [...result.items, ...children.items]
                const value = e => field === 'title' ? (e.values.title || e.values.name || '') : e.values[fields[field]] || ''
                combined.sort(field === 'sort'
                    ? (a, b) => (a.values.position?.order || 0) - (b.values.position?.order || 0)
                    : (a, b) => String(value(a)).localeCompare(String(value(b))) * (desc ? -1 : 1))
                const entries = await Promise.all(combined.map(async e => ({ kind: e.kind,
                    item: e.kind === 'bookmark' ? await this.bookmark(e, libraryId) : await this.collection(e, libraryId) })))
                // A reorder freezes all siblings, including rows outside the visible viewport.
                return { items: entries.filter(e => e.kind === 'bookmark').map(e => e.item), count: result.items.length,
                    _meChildren: { parent, sort, search: '', entries } }
            }
            const limit = Math.min(200, Number(params.get('perpage')) || 40), offset = (Number(params.get('page')) || 0) * limit
            return { items: await Promise.all(result.items.slice(offset, offset + limit).map(e => this.bookmark(e, libraryId))), count: result.items.length }
        }
        if (parts[0] === 'raindrop' && parts.length === 2 && method === 'get')
            return { item: await this.bookmark(await this.resolve(parts[1], 'bookmark', libraryId), libraryId) }
        if (parts[0] === 'collection' && parts.length === 2 && method === 'get') {
            const entity = await this.resolve(parts[1], 'collection', libraryId)
            const count = (await this.all({ kind: 'bookmark', collection: entity.id }, libraryId)).items.length
            return { result: true, item: { ...await this.collection(entity, libraryId), count } }
        }
        if (parts[0] === 'collection' && method === 'post' && parts.length === 1) {
            const input = { title: data.title, parentId: data.parent?.$id || data.parentId || null, order: data.order ?? data.sort ?? null }
            const key = `command:${libraryId}:collection:${await hash(JSON.stringify(input))}`
            const { command } = await this.durable(key, () => this.command(input, ['title', 'parentId', 'order'], libraryId, 'collection'))
            return { item: await this.collection(await this.call('get', { id: command.edits.at(-1).entity }, libraryId), libraryId), _meReceipt: key }
        }
        if (parts[0] === 'collection' && parts.length === 2 && method === 'put') {
            if (!data._me) fail('BASE_REQUIRED', '请重新打开集合后编辑')
            const patch = { ...data }; delete patch._me; delete patch._source; delete patch._siblings; delete patch._anchor
            const key = `command:${libraryId}:collection-edit:${await hash(JSON.stringify(data))}`
            if ('order' in patch && data._siblings) {
                if (await this.storage.get(key)) {
                    await this.durable(key)
                    return { item: await this.collection(await this.call('get', { id: data._me.id }, libraryId), libraryId), _meReceipt: key }
                }
                if (Object.keys(patch).some(field => !['parentId', 'order', 'sort'].includes(field))) unsupported()
                const command = await this.command({ ...data._source, ...patch, _me: data._me }, Object.keys(patch), libraryId, 'collection')
                const moving = command.edits.at(-1), parent = moving.values.position.parent
                const children = parent
                    ? (await this.api('get', `raindrops/${await this.id(parent)}?sort=sort`, {}, libraryId))._meChildren.entries
                        .map(({ kind, item: { _me } }) => ({ kind, id: _me.id, values: _me.values, heads: _me.heads }))
                    : (await this.all({ kind: 'collection' }, libraryId)).items.filter(e => !e.values.position?.parent)
                        .sort((a, b) => (a.values.position?.order || 0) - (b.values.position?.order || 0))
                const viewed = new Map(data._siblings.map(item => [item._me.id, item._me]))
                // Sidebar collection versions stay frozen; bookmarks come from the existing complete mixed query.
                const siblings = children.filter(e => e.id !== moving.entity).map(e => viewed.has(e.id)
                    ? { ...e, values: viewed.get(e.id).values, heads: viewed.get(e.id).heads } : e)
                let index = Math.max(0, patch.order)
                if (data._anchor) {
                    index = siblings.findIndex(e => e.id === this.identities.get(Number(data._anchor.id)))
                    if (index < 0) fail('INVALID', '排序参照集合已变化，请重新查看集合')
                    if (data._anchor.after) index++
                }
                siblings.splice(index, 0, { kind: 'collection', id: moving.entity, values: data._me.values, heads: data._me.heads })
                const result = await this.organize({ action: 'reorder', items: siblings,
                    values: { parent, moving: moving.entity, sort: 'sort', search: '' } }, libraryId, key)
                return { item: await this.collection(await this.call('get', { id: moving.entity }, libraryId), libraryId), _meReceipt: result._meReceipt }
            }
            await this.durable(key, async () => {
                return this.command({ ...data._source, ...patch, _me: data._me }, Object.keys(patch), libraryId, 'collection')
            })
            return { item: await this.collection(await this.call('get', { id: data._me.id }, libraryId), libraryId), _meReceipt: key }
        }
        if (parts[0] === 'raindrops' && ['put', 'del'].includes(method)) {
            if (!Array.isArray(data._items) || !data._items.length) fail('BASE_REQUIRED', '请先选择已加载的书签')
            if (!Array.isArray(data.ids) || data.ids.length !== data._items.length || data._items.some(item => !data.ids.includes(item._id)))
                fail('BASE_REQUIRED', '批量操作必须携带固定条目与编辑基线')
            const key = `command:${libraryId}:batch:${await hash(JSON.stringify([method, data]))}`
            await this.durable(key, async () => {
                const edits = [], newTags = new Map()
                for (const source of data._items) {
                    const patch = method === 'del' ? { removed: true } : Object.fromEntries(Object.entries(data).filter(([k]) => !['ids', '_items', '_removeTags'].includes(k)))
                    if (data._removeTags) patch.tags = source.tags.filter(name => !data._removeTags.includes(name))
                    if (!data._removeTags && patch.tags?.length) patch.tags = [...new Set([...source.tags, ...patch.tags])]
                    const cmd = await this.command({ ...source, ...patch }, Object.keys(patch), libraryId)
                    for (const edit of cmd.edits) {
                        if (edit.kind === 'tag' && !Object.keys(edit.base).length) {
                            const existing = newTags.get(edit.values.name)
                            if (existing) {
                                for (const e of cmd.edits) if ('tag:' + edit.entity in e.values) {
                                    e.values['tag:' + existing] = e.values['tag:' + edit.entity]; delete e.values['tag:' + edit.entity]
                                }
                                continue
                            }
                            newTags.set(edit.values.name, edit.entity)
                        }
                        edits.push(edit)
                    }
                }
                return { id: crypto.randomUUID(), libraryId, edits }
            })
            return { result: true, items: await Promise.all(data._items.map(async item => this.bookmark(await this.call('get', { id: item._me.id }, libraryId), libraryId))), _meReceipt: key }
        }
        if (path === 'me/metadata' && method === 'post') {
            const { source, values } = data
            if (!source?.id || source.libraryId !== libraryId || !source.heads?.url || !source.values?.url)
                fail('BASE_REQUIRED', '请重新打开书签后刷新网页信息')
            if (!values || !Object.keys(values).length || Object.keys(values).some(k => !['title', 'description', 'cover', 'type'].includes(k)))
                fail('INVALID', '请选择要采用的网页字段')
            const key = `command:${libraryId}:metadata:${await hash(JSON.stringify(data))}`
            await this.durable(key, () => ({ id: crypto.randomUUID(), libraryId, edits: [{
                entity: source.id, kind: 'bookmark', values, base: source.heads, url: source.values.url, acceptedMetadata: true
            }] }))
            return { result: true, _meReceipt: key }
        }
        if (path === 'me/organize' && method === 'post') return this.organize(data, libraryId)
        if (path === 'me/selection' && method === 'get') {
            const { items } = await this.query(params.get('space') || 0, params.get('search') || '', libraryId, params.get('descendants') === 'true')
            return { items: await Promise.all(items.map(e => this.bookmark(e, libraryId))) }
        }
        if (path === 'me/matches' && method === 'get') {
            const link = params.get('link')
            if (!link) fail('INVALID', '缺少网址')
            const matches = (await this.all({ q: link }, libraryId)).items.filter(e => e.values.url === link)
            return { items: await Promise.all(matches.map(e => this.bookmark(e, libraryId))) }
        }
        if (path === 'me/entities' && method === 'get') return this.all({ kind: params.get('kind') || 'bookmark' }, libraryId)
        if (path === 'me/conflicts' && method === 'get') {
            const items = []
            for (const kind of ['bookmark', 'collection', 'tag']) items.push(...(await this.all({ kind, conflicts: true }, libraryId)).items)
            return { items }
        }
        if (parts[0] === 'me' && parts[1] === 'entity' && method === 'get')
            return { item: await this.call('get', { id: parts[2] }, libraryId) }
        // Writes from list controls must carry the version the UI actually displayed.
        if (parts[0] === 'raindrop' && parts.length === 2 && ['put', 'del'].includes(method)) {
            if (!data._me) fail('BASE_REQUIRED', '请重新打开条目后编辑')
            const patch = method === 'del' ? { removed: true } : { ...data }
            delete patch._me
            const item = { ...data._source, ...patch, _me: data._me }
            delete patch._source
            const key = `command:${libraryId}:bookmark:${await hash(JSON.stringify([method, url, data]))}`
            await this.durable(key, () => this.command(item, Object.keys(patch), libraryId))
            return { item: await this.bookmark(await this.call('get', { id: data._me.id }, libraryId), libraryId), _meReceipt: key }
        }
        unsupported()
    }
}

module.exports = { Model, viewId, clone, fail, unsupported, conflicted }
