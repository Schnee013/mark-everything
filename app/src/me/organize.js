// Local controllers compose upstream dialogs/forms/lists. The rendering implementations remain upstream.
import React from 'react'
import ReactDiffViewer, { DiffMethod } from 'react-diff-viewer-continued'
import browser from 'webextension-polyfill'
import { Alert, Confirm, Prompt, Error as ShowError } from '~co/overlay/dialog'
import Button from '~co/common/button'
import { Layout, Label, SubLabel, Text, Group } from '~co/common/form'
import { Item, ItemTitle } from '~co/common/list'
import api from './client'
import { store } from '~data'

const hideDialog = id => Alert('', { id, hidden: true })
const hideConflictDialogs = () => { hideDialog('me-conflicts'); hideDialog('me-conflict-detail'); hideDialog('me-redirect') }
const refresh = () => window.dispatchEvent(new Event('me-organized'))
const entities = async kind => (await api._get('me/entities?kind=' + kind)).items
const commit = async (action, items, values) => {
    const result = await api._post('me/organize', { action, items, values })
    refresh()
    return result
}
export async function renameTag(name, newName, source) {
    if (!source) throw new Error('标签身份不唯一，请重新查看或先处理冲突')
    const tags = await entities('tag')
    if (tags.some(t => t.id !== source.id && t.values.name === newName.trim() && !t.values.redirect))
        throw new Error('目标标签已存在，请使用“合并到…”明确合并')
    const result = await commit('rename-tag', [source], { name: newName })
    const { item } = await api._get('me/entity/' + source.id)
    return { ...result, localEntity: item }
}
export async function mergeTag(name, source) {
    try {
        if (!source) throw new Error('标签身份不唯一，请重新查看或先处理冲突')
        const tags = await entities('tag')
        Alert('合并标签到…', { id: 'me-tag-merge', ok: '关闭', description: <Layout>
            {tags.filter(t => t.id !== source.id && !t.values.redirect).map(target => <Button key={target.id} onClick={async () => {
                try {
                    if (await Confirm(`将“${name}”合并到“${target.values.name}”？`, { description: '现有标注通过稳定标签引用继续保留。', ok: '合并' })) {
                        await commit('merge-tag', [source, target])
                        Alert('标签已合并', { id: 'me-tag-merge' })
                    }
                } catch (e) { ShowError(e) }
            }}>{target.values.name}</Button>)}
        </Layout> })
    } catch (e) { ShowError(e) }
}
export async function removeTag(name, source) {
    if (!source) throw new Error('标签身份不唯一，请重新查看或先处理冲突')
    // The old ME manager removes memberships in the same transaction as hiding the tag.
    const bookmarks = (await entities('bookmark')).filter(b => b.values['tag:' + source.id])
    return commit('delete-tag', [source, ...bookmarks])
}
export async function removeCollection(id) {
    try {
        const collections = await entities('collection')
        const { item } = await api._get('collection/' + id)
        const ids = new Set([item._me.id])
        let changed = true
        while (changed) {
            changed = false
            for (const c of collections) if (ids.has(c.values.position?.parent) && !ids.has(c.id)) { ids.add(c.id); changed = true }
        }
        const frozen = [...collections.filter(c => ids.has(c.id)), ...(await entities('bookmark')).filter(b => ids.has(b.values.position?.parent))]
        if (await Confirm(`将影响 ${frozen.length} 个条目，继续？`, {
            description: '所选集合、子集合及其中书签进入回收站。原位置与版本记录保留。', ok: '移入回收站', variant: 'warning'
        })) await commit('trash-collection', frozen)
    } catch (e) { ShowError(e) }
}

export async function emptyTrash() {
    try {
        const { items } = await api._get('me/selection?space=-99')
        return purgeBookmarks(items)
    } catch (error) { ShowError(error) }
}

export async function purgeBookmarks(sources) {
    try {
        if (!sources.length) return false
        const items = sources.map(({ _me }) => ({ ..._me, kind: 'bookmark' }))
        if (!await Confirm(`永久删除这 ${items.length} 条书签？`, {
            description: '删除后无法从回收站恢复。同步删除记录和操作历史会保留。', ok: '永久删除', variant: 'warning'
        })) return false
        await commit('purge', items)
        store.dispatch({ type: 'SELECT_MODE_DISABLE' })
        return true
    } catch (error) { ShowError(error); return false }
}

export async function changeCollectionColor(source) {
    try {
        let color = source.color || '#1984d6'
        const accepted = await Confirm('集合颜色', { ok: '保存', description:
            <input type='color' aria-label='集合颜色' defaultValue={color} onChange={e => { color = e.target.value }} /> })
        if (accepted) {
            await api._put('collection/' + source._id, { color, _me: source._me })
            refresh()
        }
    } catch (error) { ShowError(error) }
}

const names = { title: '标题', note: '备注', description: '摘要', url: '网址', name: '名称', life: '删除或恢复', position: '所属集合与顺序', redirect: '标签合并关系', favorite: '收藏', cover: '封面', type: '内容类型', icon: '集合图标', color: '集合颜色' }
const valueOf = c => c.value?.text ?? c.value
const textOf = value => typeof value === 'string' ? value : JSON.stringify(value, null, 2)
const scalar = field => ['title', 'note', 'description', 'url', 'name', 'type', 'cover', 'color', 'icon', 'life', 'favorite'].includes(field) || field.startsWith('tag:')
const safeURL = value => { try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) ? url.href : null } catch (_) { return null } }
function comparison(entity, field) {
    return <Comparison entity={entity} field={field} />
}
function Comparison({ entity, field }) {
    const [splitView, setSplitView] = React.useState(true)
    const [showDiffOnly, setShowDiffOnly] = React.useState(true)
    return <Layout>
        {field === 'note' ? <Group>
            <Button as='button' type='button' aria-pressed={splitView} onClick={() => setSplitView(!splitView)}>{splitView ? '切换单栏差异' : '切换双栏差异'}</Button>
            <Button as='button' type='button' aria-pressed={!showDiffOnly} onClick={() => setShowDiffOnly(!showDiffOnly)}>{showDiffOnly ? '显示全文' : '仅显示差异'}</Button>
        </Group> : <><Label>修改前</Label><Text autoSize readOnly value={textOf(entity.values[field]) ?? ''} /></>}
        {(entity.conflicts[field] || []).map((c, i) => <Group key={c.id}>
            <SubLabel>{c.actorName || '设备 ' + c.actor.slice(0, 8)} · {new Date(c.time * 1000).toLocaleString()} · 基于 {c.parents.length} 个先前版本</SubLabel>
            {field === 'note' ? <ReactDiffViewer oldValue={entity.values.note ?? ''} newValue={valueOf(c) ?? ''}
                styles={{ diffContainer: { minWidth: 0 } }}
                compareMethod={DiffMethod.LINES} disableWordDiff disableWorker splitView={splitView} showDiffOnly={showDiffOnly}
                leftTitle={entity.values.note == null ? '修改前：无共同文本' : '修改前'} rightTitle={`候选 ${i + 1}`} />
                : <Text autoSize multiline readOnly value={textOf(valueOf(c))} />}
        </Group>)}
    </Layout>
}
async function resolveField(entity, field, initial) {
    hideConflictDialogs()
    let input = textOf(initial), current = entity
    while (true) {
        const result = await Prompt(`处理冲突：${names[field] || field}`, input, {
            description: comparison(current, field), stretch: field === 'note', multiline: ['note', 'description'].includes(field), ok: '应用处理', cancel: '稍后处理'
        })
        if (result === '') { showConflict(entity.id); return }
        input = result
        try {
            const value = field === 'favorite' || field.startsWith('tag:') ? JSON.parse(input) : input
            await commit('resolve', [current], { [field]: value })
            showConflict(current.id)
            return
        } catch (e) {
            if (e.code === 'STALE_RESOLUTION') {
                try { current = (await api._get('me/entity/' + current.id)).item }
                catch (readError) { await ShowError(readError) }
            }
            await Alert('尚未应用，输入已保留', { description: e.message + '。下一步重新查看候选和刚才的输入。' })
        }
    }
}
async function applyRelation(entity, field, value) {
    hideConflictDialogs()
    try {
        if (!await Confirm('应用此关系处理？', { description: comparison(entity, field), ok: '应用处理' })) { showConflict(entity.id); return }
        await commit('resolve', [entity], { [field]: value })
        showConflict(entity.id)
    } catch (e) { await ShowError(e); if (e.code === 'STALE_RESOLUTION') showConflict(entity.id) }
}
async function choosePosition(entity) {
    hideConflictDialogs()
    const selected = await new Promise(resolve => window.dispatchEvent(new CustomEvent('me-choose-collection', { detail: { resolve } })))
    if (!selected) { showConflict(entity.id); return }
    try {
        const parent = selected._id > 0 ? (await api._get('collection/' + selected._id)).item._me.id : null
        await applyRelation(entity, 'position', { parent, order: Date.now() })
    } catch (e) { ShowError(e) }
}
async function chooseRedirect(entity) {
    hideConflictDialogs()
    try {
        const tags = await entities('tag')
        Alert('选择标签关系', { id: 'me-redirect', ok: '关闭', description: <Layout>
            <Button onClick={() => applyRelation(entity, 'redirect', null)}>取消合并关系</Button>
            {tags.filter(t => t.id !== entity.id && !t.values.redirect).map(t => <Button key={t.id} onClick={() => applyRelation(entity, 'redirect', t.id)}>{t.values.name}</Button>)}
        </Layout> })
    } catch (e) { ShowError(e) }
}
export async function showConflict(id) {
    hideDialog('me-conflicts')
    hideDialog('me-redirect')
    try {
        const entity = (await api._get('me/entity/' + id)).item
        Alert(entity.values.title || entity.values.name || '冲突详情', {
            id: 'me-conflict-detail', stretch: !!entity.conflicts.note, ok: '稍后处理', description: <Layout>
                {Object.entries(entity.conflicts).map(([field, candidates]) => <Group key={field}>
                    <Label>{names[field] || field}</Label>
                    {comparison(entity, field)}
                    {scalar(field) ? <>
                        {candidates.map((c, i) => <Button key={c.id} onClick={() => resolveField(entity, field, valueOf(c))}>采用候选 {i + 1} 或编辑合并</Button>)}
                        {field === 'url' && candidates.map((c, i) => safeURL(valueOf(c)) && <Button key={'open:' + c.id} onClick={() => browser.tabs.create({ url: safeURL(valueOf(c)) }).catch(ShowError)}>打开候选网址 {i + 1}</Button>)}
                        {['title', 'note', 'description', 'name'].includes(field) && <Button onClick={async () => {
                            try { if (await Confirm('明确清空此字段？', { description: comparison(entity, field), ok: '清空并应用' })) { await commit('resolve', [entity], { [field]: '' }); showConflicts() } }
                            catch (e) { ShowError(e) }
                        }}>清空此字段</Button>}
                    </> : candidates.map((c, i) => <Button key={c.id} onClick={() => applyRelation(entity, field, valueOf(c))}>采用关系候选 {i + 1}</Button>)}
                    {field === 'position' && <Button onClick={() => choosePosition(entity)}>选择新位置</Button>}
                    {field === 'redirect' && <Button onClick={() => chooseRedirect(entity)}>选择标签关系</Button>}
                </Group>)}
                {entity.structural.map((issue, i) => <Group key={i}>
                    <SubLabel>{issue.reason === 'cycle' ? '关系形成循环，请选择有效目标。' : issue.reason === 'missing-reference' ? '引用尚未到达或无效，可稍后处理或选择有效目标。' : '关联集合或标签已删除，请选择有效位置或移除标注。'}</SubLabel>
                    {issue.field === 'position' && <Button onClick={() => choosePosition(entity)}>选择新位置</Button>}
                    {issue.field === 'redirect' && <Button onClick={() => chooseRedirect(entity)}>选择标签关系</Button>}
                    {issue.field.startsWith('tag:') && <Button onClick={() => applyRelation(entity, issue.field, false)}>移除失效标注</Button>}
                </Group>)}
                {!Object.keys(entity.conflicts).length && !entity.structural.length && <Label>此条目已没有待处理冲突</Label>}
            </Layout>
        })
    } catch (e) { ShowError(e) }
}
export async function showConflicts() {
    hideDialog('me-conflict-detail')
    hideDialog('me-redirect')
    try {
        const { items } = await api._get('me/conflicts')
        Alert(`冲突（${items.length}）`, { id: 'me-conflicts', ok: '关闭', description: <Layout>
            {items.map(e => <Button as={Item} key={e.id} aria-label={'查看与处理 ' + (e.values.title || e.values.name || e.id)} onClick={() => showConflict(e.id)}>
                <ItemTitle>{e.values.title || e.values.name || e.id}</ItemTitle>
            </Button>)}
            {!items.length && <Label>没有待处理冲突</Label>}
        </Layout> })
    } catch (e) { ShowError(e) }
}

async function selectedBatch(items, patch) {
    const { items: saved } = await api._put('raindrops/0', { ...patch, ids: items.map(item => item._id), _items: items })
    store.dispatch({ type: 'BOOKMARK_UPDATE_SUCCESS', item: saved })
    store.dispatch({ type: 'SELECT_MODE_DISABLE' })
    refresh()
}
export async function restoreSelected(items) {
    try { await selectedBatch(items, { removed: false, collectionId: -1 }) }
    catch (e) { ShowError(e) }
}
export function removeSelectedTag(items) {
    const tags = [...new Set(items.flatMap(item => item.tags))]
    Alert('移除选中条目的指定标签', { id: 'me-remove-tag', ok: '关闭', description: <Layout>
        {tags.map(name => <Button key={name} onClick={async () => {
            try {
                await selectedBatch(items, { _removeTags: [name] })
                Alert('已移除此标注', { id: 'me-remove-tag' })
            } catch (e) { ShowError(e) }
        }}>{name}</Button>)}
        {!tags.length && <Label>选中条目没有标签</Label>}
    </Layout> })
}
