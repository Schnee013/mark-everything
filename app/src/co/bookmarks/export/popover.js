import React from 'react'
import Popover, { Menu, MenuItem } from '~co/overlay/popover'
import { downloadHTML } from '../../../me/exchange'

export default function BookmarksExportPopover({ pin, onClose }) {
    return (
        <Popover pin={pin} onClose={onClose}>
            <Menu style={{maxWidth: '250px'}}>
                <MenuItem onClick={() => { onClose(); downloadHTML() }}>
                    HTML（完整本地库）
                </MenuItem>
            </Menu>
        </Popover>
    )
}
