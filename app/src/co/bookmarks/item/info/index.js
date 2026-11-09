import s from './index.module.styl'
import React from 'react'
import t from '~t'

import { ShortDate } from '~modules/format/date'
import SafeHtml from '~co/common/safeHtml'
import { Link } from 'react-router-dom'
import Button from '~co/common/button'
import Icon from '~co/common/icon'
import Path from './path'

export default function BookmarkItemInfo(props) {
    const { className='', domain, type, link, created, reparse, collectionId, spaceId, important, broken, duplicate, highlight, fileType } = props

    return (
        <div className={s.info+' '+className}>
            {process.env.ME_LOCAL && (highlight.candidateMatch || props._me?.conflicts) && <Button onClick={() => require('../../../../me/organize').showConflict(highlight.candidateMatch || props._me.id)}>{highlight.candidateMatch ? '命中待处理版本' : '待处理'}</Button>}

            {spaceId != collectionId && spaceId != collectionId+'s' ? (
                <section><Path {...props} /></section>
            ) : null}

            {important ? (
                <section data-inline className={s.importantLabel}>
                    <Icon name='important_active' size='micro' />
                </section>
            ) : null}

            {broken ? (
                <section><Icon name='broken' size='micro' /></section>
            ) : null}

            {duplicate ? (
                <>
                    <section data-inline className={s.duplicateLabel}><Icon name='duplicate' size='micro' /></section>
                    <section className={s.duplicateLabel}>
                        <Link 
                            to={'/my/0/'+encodeURIComponent(`_id:${duplicate} duplicate:${duplicate} match:OR`)}
                            title={t.s('searchOriginal')}>
                            {t.s('duplicates')}
                        </Link>
                    </section>
                </>
            ) : null}

            {reparse ? (
                <section data-inline><Icon name='progress' size='micro' /></section>
            ) : null}


            {type != 'link' ? (
                <section data-inline><Icon name={type} size='micro' /></section>
            ) : null}

            {highlight.link ? (
                <SafeHtml tagName='section' html={highlight.link} />
            ) : (
                <section>{fileType ? t.s('file') : domain}</section>
            )}

            {(!process.env.ME_LOCAL || created) && <section><ShortDate date={created}/></section>}
        </div>
    )
}
