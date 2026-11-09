import browser from 'webextension-polyfill'
import { Model, fail } from './model.cjs'
import { Drafts } from './drafts.cjs'

const HOST = 'org.me_raindrop_b1.bookmarks'
const storage = {
    async get(key) { return (await browser.storage.local.get(key))[key] },
    async set(key, value) { await browser.storage.local.set({ [key]: value }) },
    async entries() { return browser.storage.local.get(null) }
}
const allowed = new Set(['capabilities', 'status', 'query', 'get', 'execute', 'commandStatus', 'bind', 'create', 'configureSync', 'sync', 'join', 'importPreview', 'export', 'managerOpened', 'configureManager', 'rebuildSearchIndex'])

async function native(method, params = {}, libraryId) {
    if (!allowed.has(method)) fail('B1_UNSUPPORTED', '该助手功能尚未开放')
    let response
    const id = crypto.randomUUID()
    try {
        response = await browser.runtime.sendNativeMessage(HOST, { v: 1, id, method, params, libraryId })
    } catch (error) {
        fail('HELPER_UNAVAILABLE', '未连接 B1 文件助手；草稿会保留。' + error.message)
    }
    if (response.v !== 1 || response.id !== id) fail('PROTOCOL', '文件助手响应不匹配')
    if (!response.ok && response.error?.code === 'PURGED') fail('PURGED', '此条目已永久删除，删除记录与候选保留，不能恢复旧编号')
    if (!response.ok) fail(response.error?.code || 'HELPER_ERROR', response.error?.message || '文件助手出错')
    if (method === 'execute' && response.result.state === 'committed-readable')
        await browser.alarms.create('sync', { delayInMinutes: 0.5 }).catch(() => {})
    return response.result
}

// The existing helper owns the cross-browser lock, retryAt, auth pause and batches.
async function updateBadge(libraryId) {
    const status = await native('status', {}, libraryId)
    await browser.action.setBadgeText({ text: status.conflicts ? String(status.conflicts) : '' })
    await browser.action.setBadgeBackgroundColor({ color: '#ad6538' })
    return status
}
async function synchronize(libraryId, params = {}) {
    const result = await native('sync', params, libraryId)
    await updateBadge(libraryId)
    return result
}
async function wakeSync() {
    const cap = await native('capabilities')
    if (cap.library) return synchronize(cap.library.libraryId)
}
function cloudInput(params) {
    if (!params?.url?.trim() || !params.user?.trim() || !params.password)
        fail('INVALID', '请填写 WebDAV HTTPS 地址、账号和应用密码')
    let url
    try { url = new URL(params.url) } catch (_) { fail('INVALID', '请输入有效的 WebDAV HTTPS 地址') }
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash)
        fail('INVALID', 'WebDAV 必须使用 HTTPS，地址不能包含凭据、查询参数或片段')
}

const model = new Model(native, storage)
const drafts = new Drafts(model, storage)
let claimsLock = Promise.resolve()

function claimEditor(owner, tabId) {
    const task = claimsLock.then(async () => {
        const key = 'me-editor-owners'
        const claims = (await browser.storage.session.get(key))[key] || {}
        const occupied = claims[owner]
        if (occupied !== undefined && occupied !== tabId) {
            let exists = false
            try { await browser.tabs.get(occupied); exists = true } catch (_) {}
            if (exists) owner = crypto.randomUUID()
        }
        claims[owner] = tabId
        await browser.storage.session.set({ [key]: claims })
        return owner
    })
    claimsLock = task.catch(() => {})
    return task
}

async function handle(message) {
    const { op, libraryId } = message
    if (op === 'session') {
        const cap = await native('capabilities')
        if (cap.protocol !== 1 || cap.schema !== 1 || !cap.features?.includes('d1-metadata')) fail('VERSION', '请使用与本次 D1 构建配套的文件助手')
        return cap
    }
    if (op === 'bind' || op === 'create') {
        // Binding is setup only. Library switching with outstanding work is not a B1 feature.
        const cap = await native('capabilities')
        if (cap.library) fail('ALREADY_BOUND', '已经绑定书签库；安装切换留待后续决策')
        return native(op, message.params)
    }
    if (op === 'sync.join') {
        const cap = await native('capabilities')
        if (cap.library) fail('ALREADY_BOUND', '已经绑定书签库；请在独立的新设备配置接入云端库')
        cloudInput(message.params)
        if (!message.params.path?.trim() || !message.params.libraryId?.trim()) fail('INVALID', '请填写空目录路径与云端库编号')
        return native('join', message.params)
    }
    if (!libraryId) fail('NO_LIBRARY', '缺少本地书签库标识')
    if (op === 'manager.opened') return native('managerOpened', { requestId: message.requestId }, libraryId)
    // The handoff target belongs to this installation, not to the library.
    if (op === 'configureManager') return native('configureManager', message.params)
    if (op === 'rebuildSearchIndex') return native('rebuildSearchIndex', {}, libraryId)
    if (op === 'sync.wake') return synchronize(libraryId)
    if (op === 'sync.configure') {
        cloudInput(message.params)
        return native('configureSync', message.params, libraryId)
    }
    if (op === 'sync.run') return synchronize(libraryId, { force: true, publish: message.publish === true })
    if (op === 'editor.claim') return claimEditor(message.owner, message.tabId)
    if (op === 'status') {
        await drafts.recover()
        await model.recover(libraryId)
        return updateBadge(libraryId)
    }
    if (op === 'api.ack') {
        if (!message.key?.startsWith(`command:${libraryId}:`)) fail('LIBRARY_MISMATCH', '命令库标识不匹配')
        await storage.set(message.key, null)
        return true
    }
    if (op === 'api') return model.api(message.method, message.url, message.data || {}, libraryId)
    if (op === 'draft.open') return drafts.open(message.key, message.options, libraryId)
    if (op === 'draft.change' || op === 'draft.save') return drafts.merge(message.key, message.draft, op === 'draft.save')
    if (op === 'draft.read') {
        const d = await storage.get(message.key)
        if (d?.libraryId !== libraryId) fail('LIBRARY_MISMATCH', '草稿库标识不匹配')
        if (d?.error?.code === 'CONFLICT' && !d.pending && !Object.keys(d.dirty).length) return drafts.open(message.key, {}, libraryId)
        return d
    }
    fail('B1_UNSUPPORTED', '功能尚未开放')
}

export default function start() {
    browser.runtime.onMessage.addListener((message, sender) => {
        if (message?.channel !== 'me-b1') return undefined
        if (sender.id !== browser.runtime.id || !sender.url?.startsWith(browser.runtime.getURL(''))) return undefined
        return handle(message).then(result => ({ ok: true, result }), error => ({ ok: false, error: { code: error.code || 'ERROR', message: error.message } }))
    })
    browser.alarms.create('periodic-sync', { periodInMinutes: 5 })
    browser.alarms.onAlarm.addListener(alarm => {
        if (['sync', 'periodic-sync'].includes(alarm.name)) wakeSync().catch(() => {})
    })
    browser.runtime.onStartup.addListener(() => { drafts.recover().catch(() => {}); wakeSync().catch(() => {}) })
    drafts.recover().catch(() => {})
    wakeSync().catch(() => {})
}
