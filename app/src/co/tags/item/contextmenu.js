import React from 'react'
import t from '~t'
import Popover, { Menu, MenuItem } from '~co/overlay/popover'

export default function CollectionsItemContextmenu({
    onContextMenuClose, onRenameClick, onRemoveClick, item
}) {
    return (
        <Popover onClose={onContextMenuClose}>
            <Menu>
                {onRenameClick ? (
                    <MenuItem onClick={onRenameClick}>
                        {t.s('renameTag')}
                    </MenuItem>
                ) : null}

                {process.env.ME_LOCAL && <MenuItem onClick={() => require('../../../me/organize').mergeTag(item._id, item._meEntity)}>合并到…</MenuItem>}
                {onRemoveClick ? (<MenuItem onClick={onRemoveClick}>
                    {t.s('removeTag')}
                </MenuItem>) : null}
            </Menu>
        </Popover>
    )
}