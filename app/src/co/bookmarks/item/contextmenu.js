import React from 'react'
import t from '~t'
import Popover, { Menu, MenuItem, MenuSeparator } from '~co/overlay/popover'
import { target } from '~target'

export default function BookmarksItemContextmenu({
    _id, link, _me, important, access, reparse, type,
    onContextMenuClose, onRemoveClick, onCopyLinkClick,
    onSelectClick, onImportantClick, onReparseClick
}) {

    return (
        <Popover onClose={onContextMenuClose}>
            <Menu>
                <MenuItem href={link} rel='noopener' target='_blank' onClick={process.env.ME_LOCAL && _me?.conflictFields?.includes('url') ? e => { e.preventDefault(); require('../../../me/organize').showConflict(_me.id) } : undefined}>
                    {t.s('openInNewTab')}
                </MenuItem>

                <MenuItem onClick={onCopyLinkClick}>
                    {t.s('copyLinkToClipboard')}
                </MenuItem>

                <MenuSeparator />

                {target != 'extension' && (
                    <MenuItem to={`item/${_id}/web`}>
                        {t.s('preview')}
                    </MenuItem>
                )}

                {access && access.level >= 3 ? (
                    <>
                        <MenuSeparator />

                        <MenuItem onClick={onSelectClick}>
                            {t.s('select')}
                        </MenuItem>

                        <MenuItem onClick={onImportantClick}>
                            {important ? t.s('removeFromFavorites') : t.s('addToFavorites')}
                        </MenuItem>

                        {!reparse && (!process.env.ME_LOCAL || _me?.values.life === 'active') ? (
                            <MenuItem onClick={onReparseClick}>
                                {process.env.ME_LOCAL ? '刷新网页信息' : t.s('refreshPreview')}
                            </MenuItem>
                        ) : null}

                        <MenuSeparator />

                        <MenuItem to={`item/${_id}/edit`}>
                            {t.s('edit')}
                        </MenuItem>

                        <MenuItem onClick={onRemoveClick}>
                            {_me?.values.life === 'trashed' ? '永久删除' : t.s('remove')}
                        </MenuItem>
                    </>
                ) : null}
            </Menu>
        </Popover>
    )
}
