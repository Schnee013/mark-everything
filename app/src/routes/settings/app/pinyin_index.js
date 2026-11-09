import React, { useRef, useState } from 'react'
import { Label, SubLabel } from '~co/common/form'
import Button from '~co/common/button'
import { send } from '../../../me/client'

export default function PinyinIndex() {
    const running = useRef(false)
    const [busy, setBusy] = useState(false)
    const [message, setMessage] = useState('')
    async function rebuild() {
        if (running.current) return
        running.current = true
        setBusy(true)
        setMessage('')
        try {
            const result = await send('rebuildSearchIndex')
            setMessage(`已重建 ${result.bookmarks} 条书签的拼音索引`)
        } catch (error) {
            setMessage(`重建失败：${error.message}`)
        } finally {
            running.current = false
            setBusy(false)
        }
    }
    return <>
        <Label>拼音搜索</Label>
        <div>
            <Button as='button' type='button' variant='outline' disabled={busy} onClick={rebuild}>
                {busy ? '正在重建…' : '重建拼音索引'}
            </Button>
            <SubLabel>支持全拼和首字母。新增、导入和编辑时自动更新；旧书签可在这里重建。</SubLabel>
            {message && <SubLabel role='status'>{message}</SubLabel>}
        </div>
    </>
}
