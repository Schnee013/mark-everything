import s from './index.module.styl'
import React from 'react'
import { Section, SectionTitle } from '~co/common/list'

export default function SearchMenuHelp() {
    return <Section className={s.help}><SectionTitle className={s.tip}>支持中文、全拼和首字母搜索</SectionTitle></Section>
}
