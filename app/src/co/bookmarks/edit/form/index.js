import s from './index.module.styl'
import React, { useCallback } from 'react'

import { Layout, Separator, Group, Label, Text } from '~co/common/form'
import Cover from './cover'
import Note from './note'
import Collection from './collection'
import Tags from './tags'
import Action from './action'
import Title from './title'
import Link from './link'
import Important from './important'
import Date from './date'

export default function BookmarkEditForm(props) {

    const onSubmitForm = useCallback(e=>{
        e.preventDefault()
        e.stopPropagation()

        props.onSave().then(()=>{
            if (props.autoWindowClose)
                window.close()
        }).catch(() => {})
    }, [props.onSave, props.autoWindowClose])

    return (
        <form
            className={s.form}
            data-status={props.status}
            onSubmit={onSubmitForm}>
            <Layout type='grid'>
                <Cover {...props} />
                <Title  {...props} />
                <Note {...props} />

                <Collection {...props} />
                <Tags {...props} />
                <Link {...props} />
                {process.env.ME_LOCAL && <>
                    <Label id='me-type-label'>内容类型</Label>
                    <Text id='me-type' aria-labelledby='me-type-label' value={props.item.type} disabled={props.item._me?.conflictFields?.includes('type')}
                        onChange={e => props.onChange({ type: e.target.value })} onBlur={props.onCommit} />
                </>}

                <div />
                <Group>
                    <Important {...props} />
                </Group>

                <Date {...props} />

                <Separator variant='transparent' />

                <Action {...props} />
            </Layout>
        </form>
    )
}
