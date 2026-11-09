// Keys for the existing acknowledge template, using only versions supplied by ME.
async function conflictNoticeKeys(libraryId, entities, getEntity) {
    if (!libraryId || !Array.isArray(entities)) throw new Error('缺少通知库标识或冲突列表')
    const records = [], gaps = [], targets = new Map()
    for (const entity of entities) {
        if (!entity.id || !entity.kind || !entity.conflicts || !Array.isArray(entity.structural))
            throw new Error('冲突实体缺少标识、类型或版本数据')
        const keys = []
        for (const [field, candidates] of Object.entries(entity.conflicts))
            for (const candidate of candidates) {
                if (typeof candidate.version !== 'string' || !candidate.version)
                    throw new Error('冲突候选缺少真实版本标识')
                keys.push(JSON.stringify(['me-conflict-notice', libraryId, entity.id, field, candidate.version]))
            }
        for (const issue of entity.structural) {
            const { field, reason, target } = issue
            let kind
            if (reason === 'deleted-parent' && field === 'position' && ['bookmark', 'collection'].includes(entity.kind)) kind = 'collection'
            else if (reason === 'deleted-parent' && field === 'redirect' && entity.kind === 'tag') kind = 'tag'
            else if (reason === 'deleted-tag' && field?.startsWith('tag:') && target === field.slice(4)) kind = 'tag'
            else { gaps.push({ entity: entity.id, field, reason, gap: 'no-reliable-causal-version' }); continue }
            if (!target) throw new Error('删除目标问题缺少目标标识')
            if (!targets.has(target)) targets.set(target, await getEntity(target))
            const deleted = targets.get(target)
            if (deleted.id !== target || deleted.kind !== kind)
                throw new Error('删除目标类型或身份与冲突关系不符')
            const relationHeads = entity.heads[field], lifeHeads = deleted.heads.life
            if (!relationHeads?.length || !lifeHeads?.length) throw new Error('删除目标问题缺少关系或生命周期版本')
            if (deleted.values.life === 'active') { gaps.push({ entity: entity.id, field, reason, gap: 'target-already-restored' }); continue }
            keys.push(JSON.stringify(['me-conflict-notice', libraryId, entity.id, 'structural', field, reason, target, relationHeads, lifeHeads]))
        }
        if (keys.length) records.push({ id: entity.id, keys })
    }
    return { records, gaps }
}
module.exports = { conflictNoticeKeys }
