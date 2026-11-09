import s from './note.module.styl'
import t from '~t'
import React, { useCallback } from 'react'
import { target, environment } from '~target'

import { Text, Label } from '~co/common/form'
import Icon from '~co/common/icon'
import Button from '~co/common/button'
import { Alert } from '~co/overlay/dialog'

// The toolbar popup resizes itself to its content, so a growing note makes the window jump while typing.
const popup = process.env.ME_LOCAL && target == 'extension' && environment.includes('action')

export default function BookmarkEditFormNote({ autoFocus, item: { note }, onCommit, onChange }) {    
    const onChangeField = useCallback(e=>
        onChange({ [e.target.getAttribute('name')]: e.target.value }),
        []
    )

    const onMarkdownClick = useCallback(e=>{
        e.preventDefault()
        Alert(t.s('note'), {
            description: '支持 Markdown，例如 **粗体**、*斜体* 和 [链接文字](https://example.com)。'
        })
    }, [])

    return (
        <>
            <Label>{t.s('note')}</Label>
            <Text 
                className={s.note}
                type='text'
                autoFocus={autoFocus=='note'}
                name='note'
                value={note}
                autoSize={true}
                multiline={true}
                minRows={3}
                maxRows={popup ? 3 : undefined}
                onChange={onChangeField}
                onBlur={onCommit}>
                <Button 
                    className={s.button} 
                    onClick={onMarkdownClick}
                    tabIndex='-1'
                    size='small'
                    title={t.s('markdownSupported')}>
                    <Icon name='markdown' />
                </Button>
            </Text>
        </>
    )
}