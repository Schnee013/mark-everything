import React from 'react'
import { useSelector } from 'react-redux'
import { Link } from 'react-router-dom'
import Alert from '~co/common/alert'
import Button from '~co/common/button'
import { syncLabel } from './sync-status.cjs'

export default function SyncStatus() {
    const status = useSelector(state => state.user.localStatus)
    return <Alert role='status' variant={status?.sync.error ? 'warning' : 'default'}>
        {syncLabel(status)}
        <Button as={Link} to='/settings/sync'>坚果云同步</Button>
    </Alert>
}
