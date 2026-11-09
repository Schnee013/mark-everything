import React from 'react'
import { PropTypes } from 'prop-types'

import { ButtonsGroup } from '~co/common/button'
import Link from './link'

function BookmarksAdd(props) {
    return (
        <ButtonsGroup>
            <Link {...props} />

        </ButtonsGroup>
    )
}

BookmarksAdd.propTypes = {
    spaceId:    PropTypes.any,
    onEdit:     PropTypes.func
}

export default BookmarksAdd
