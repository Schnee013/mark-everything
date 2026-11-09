import React, { useEffect, useRef, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { acknowledge } from '~data/actions/config'
import Alert from '~co/common/alert'
import Button from '~co/common/button'
import { Group } from '~co/common/form'
import api from './client'
import { conflictNoticeKeys } from './conflict-notice-keys.cjs'

export default function ConflictNotice() {
    const dispatch = useDispatch()
    const status = useSelector(state => state.user.localStatus)
    const acknowledged = useSelector(state => state.config.acknowledge)
    const ack = useRef(acknowledged)
    ack.current = acknowledged
    const [notice, setNotice] = useState(null)
    const [error, setError] = useState('')
    const libraryId = status?.library.libraryId, revision = status?.conflictRevision
    useEffect(() => {
        let alive = true
        if (!libraryId || !revision) return
        if (!status.conflicts) { setNotice(null); return }
        ;(async () => {
            const { items } = await api._get('me/conflicts')
            const { records } = await conflictNoticeKeys(libraryId, items, async id => (await api._get('me/entity/' + id)).item)
            if (!alive) return
            const fresh = records.map(record => ({ ...record, keys: record.keys.filter(key => !ack.current.includes(key)) })).filter(record => record.keys.length)
            if (fresh.length) {
                const keys = fresh.flatMap(record => record.keys)
                setNotice({ count: fresh.length, keys })
                // The official confirmation action and its existing persistence path are unchanged.
                for (const key of keys) dispatch(acknowledge(key))
            }
            setError('')
        })().catch(e => { if (alive) setError(e.message) })
        return () => { alive = false }
    }, [libraryId, revision])
    if (error) return <Alert variant='warning' role='status'>冲突提示读取失败：{error}</Alert>
    if (!notice) return null
    return <Alert key={notice.keys[0]} variant='warning' role='status' aria-live='polite' aria-label='新冲突通知'>
        <Group>
            发现 {notice.count} 项冲突，已保留所有版本
            <Button as='button' onClick={() => { setNotice(null); require('./organize').showConflicts() }}>查看</Button>
            <Button as='button' onClick={() => setNotice(null)}>关闭提示</Button>
        </Group>
    </Alert>
}
