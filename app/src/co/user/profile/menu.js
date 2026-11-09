import React from 'react'
import t from '~t'
import { useLocation } from 'react-router-dom'

import Popover, { Menu, MenuItem } from '~co/overlay/popover'
import Icon from '~co/common/icon'

function UserProfileMenu({
    pin,
    onClose
}) {
    const location = useLocation()

    return (
        <Popover pin={pin} onClose={onClose}>
            <Menu>
                <MenuItem to={`/settings?back=${encodeURIComponent(location.pathname + location.search)}`}>
                    <Icon name='settings' />
                    {t.s('settings')}
                </MenuItem>

            </Menu>
        </Popover>
    )
}

export default UserProfileMenu
