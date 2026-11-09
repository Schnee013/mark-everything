import s from './actions.module.styl'
import t from '~t'
import React from 'react'

import { Link } from 'react-router-dom'
import Button from '~co/common/button'
import Icon from '~co/common/icon'

export default function BookmarkItemActions(props) {
    const { _id, link, access, important } = props
    const { className='' } = props
    const { onCopyLinkClick, onImportantClick, onRemoveClick } = props

    const openConflict = process.env.ME_LOCAL && props._me?.conflictFields?.includes('url') ? e => { e.preventDefault(); require('../../../me/organize').showConflict(props._me.id) } : undefined
    return (
        <div className={s.actions+' '+className}>
            {/* current_tab */}
            <Button
                data-button='current_tab'
                href={link}
                onClick={openConflict}
                rel='noopener'
                variant='outline'
                title={t.s('open')}>
                <Icon name='click' />
            </Button>

            {/* new_tab */}
            <Button
                data-button='new_tab'
                href={link}
                onClick={openConflict}
                target='_blank'
                rel='noopener'
                variant='outline'
                title={t.s('openInNewTab')}>
                <Icon name='open' />
            </Button>

            {/* copy */}
            <Button
                data-button='copy'
                onClick={onCopyLinkClick}
                variant='outline'
                title={t.s('copyLinkToClipboard')}>
                <Icon name='duplicates' />
            </Button>

            {access && access.level >= 3 ? (<>
                {/* important */}
                <Button
                    data-button='important'
                    onClick={onImportantClick}
                    variant='outline'
                    title={important ? t.s('removeFromFavorites') : t.s('addToFavorites')}>
                    <Icon name={'like'+(important?'_active':'')} />
                </Button>

                {/* tags */}
                <Button
                    data-button='tags'
                    as={Link}
                    to={`item/${_id}/edit?autoFocus=tags`}
                    variant='outline'>
                    <Icon name='tag' />
                </Button>

                {/* edit */}
                <Button
                    data-button='edit'
                    as={Link}
                    to={`item/${_id}/edit`}
                    variant='outline'>
                    {t.s('editMin')}
                </Button>

                {/* remove */}
                <Button
                    data-button='remove'
                    variant='outline'
                    title={props._me?.values.life === 'trashed' ? '永久删除' : t.s('remove')}
                    onClick={onRemoveClick}>
                    <Icon name='trash' />
                </Button>
            </>) : null}
        </div>
    )
}
