// Data and dialog callbacks for the official import page and export menu.
import api from './client'
import { Alert, Confirm, Prompt, Error as ShowError } from '~co/overlay/dialog'

export async function previewFile(file) {
    const { preview } = await api._post('me/import/preview', { content: await file.text(), source: 'Chrome:' + file.name })
    const count = { bookmarks: 0, folders: 0, tags: 0, highlights: 0, duplicates: 0 }
    for (const edit of preview.command.edits) count[edit.kind === 'collection' ? 'folders' : 'bookmarks']++
    return { preview, count }
}

export async function commitPreview(preview) {
    if (!preview?.command?.id) throw new Error('导入预览已失效，请重新选择文件')
    const decisions = {}
    for (const row of preview.rows) {
        if (row.candidates?.length) {
            const description = row.candidates.map((c, i) => `${i + 1}. ${c.title || c.id} · ${c.id}`).join('\n')
            const answer = await Prompt(`为“${row.title}”选择已有条目编号`, '', {
                description, ok: '确认匹配', cancel: '取消导入'
            })
            if (!answer) throw new Error('导入已取消，本地库未改变')
            const index = Number(answer) - 1
            if (!Number.isInteger(index) || !row.candidates[index]) throw new Error('条目编号无效，本地库未改变；请重新开始导入')
            decisions[row.id] = row.candidates[index].id
        } else if (row.review && !row.deleted) {
            decisions[row.id] = await Confirm(`“${row.title}”存在人工修改，采用源字段？`, {
                description: '涉及字段：' + row.conflicting.join('、') + '。保留本库会跳过本条；备注、标签等源文件不含的字段保持原值。',
                ok: '采用源字段', cancel: '保留本库'
            }) ? 'source' : 'keep'
        }
    }
    const { counts } = preview
    if (!await Confirm(`导入 ${counts.new + counts.update + counts.review} 个条目？`, {
        description: `新增 ${counts.new} · 匹配更新 ${counts.update} · 需要确认 ${counts.review} · 不支持 ${counts.unsupported}。已删除条目及其受保护子项由原 ME 核心跳过；源文件不修改。`,
        ok: '确认导入', cancel: '取消导入'
    })) throw new Error('导入已取消，本地库未改变')
    await api._post('me/import/commit', { id: preview.command.id, decisions })
    window.dispatchEvent(new Event('me-organized'))
    if (counts.unsupported) await Alert(`已跳过 ${counts.unsupported} 个不支持的网址`)
}

export async function downloadHTML() {
    try {
        let result
        try { result = await api._get('me/export/html') }
        catch (error) {
            if (error.code !== 'EXPORT_CONFLICT' || !await Confirm(error.message + '。跳过受影响项继续导出？', { ok: '跳过并导出', cancel: '取消' })) throw error
            result = await api._get('me/export/html?skip=true')
        }
        const url = URL.createObjectURL(new Blob([result.html], { type: 'text/html;charset=utf-8' }))
        const a = document.createElement('a')
        a.href = url
        a.download = 'me-mark-everything-bookmarks.html'
        a.click()
        setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (error) { ShowError(error) }
}
