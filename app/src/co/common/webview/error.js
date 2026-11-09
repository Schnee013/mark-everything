import s from './error.module.styl'
import t from '~t'
import React from 'react'
import { getDomain } from '~modules/format/url'

import Icon from '~co/common/icon'

export default function WebViewError({ className='', src }) {
    return (
        <div className={s.wrap+' '+className}>
            <a 
                href={src} 
                target='_blank' 
                className={s.screenshot}>
            </a>

            <div className={s.message}>
                <Icon name='hide' enlarge='2' />
                <h3>{t.s('previewError')}</h3>
                <div>
                    <b>{getDomain(src)}</b> not reachable or blocks site preview.
                </div>
            </div>
        </div>
    )
}