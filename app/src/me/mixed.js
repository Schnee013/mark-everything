// Compose the existing list callbacks with the old ME whole-sibling position transaction.
import api from './client'
import { Error as ShowError } from '~co/overlay/dialog'

export async function reorderChildren(snapshot, from, to) {
    try {
        if (!snapshot || snapshot.sort !== 'sort' || snapshot.search !== '' || !Number.isInteger(from) || !Number.isInteger(to) || !snapshot.entries[from] || !snapshot.entries[to])
            throw new Error('排序位置已失效，请重新查看集合')
        const entries = [...snapshot.entries]
        const [moving] = entries.splice(from, 1)
        entries.splice(to, 0, moving)
        const items = entries.map(({ kind, item: { _me } }) => ({ kind, id: _me.id, values: _me.values, heads: _me.heads }))
        await api._post('me/organize', { action: 'reorder', items, values: { parent: snapshot.parent, sort: snapshot.sort, search: snapshot.search } })
    } catch (error) { await ShowError(error) }
    finally { window.dispatchEvent(new Event('me-organized')) }
}
