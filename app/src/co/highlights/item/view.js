import s from './view.module.styl'
import React from 'react'
import Text from '../text'
import { ShortDate } from '~modules/format/date'

// Highlight content is preserved for reading; local highlight editing is not supported.
export default function HighlightsItemView({ text, color, created, note }) {
    return (
        <section className={s.item}>
            <Text className={s.text} color={color}>{text}</Text>
            <div className={s.footer}>
                {note && <div className={s.noteWrap}>{note}</div>}
                <div className={s.created}><ShortDate date={created} /></div>
            </div>
        </section>
    )
}
