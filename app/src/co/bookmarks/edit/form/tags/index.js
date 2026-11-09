import React, { useCallback } from 'react'
import t from '~t'

import { Label } from '~co/common/form'
import TagsField from '~co/tags/field'

export default function BookmarkEditFormTags({ autoFocus, item, onCommit, onChange, onSave }) {
    const onTagsFieldChange = useCallback((tags)=>onChange({ tags }), [onChange])

    return (
        <>
            <Label>{t.s('tags')}</Label>
            <div>
                <TagsField
                    value={item.tags}
                    spaceId={item.collectionId}

                    autoFocus={autoFocus=='tags'}
                    onChange={onTagsFieldChange}
                    onBlur={onCommit} />
            </div>
        </>
    )
}
