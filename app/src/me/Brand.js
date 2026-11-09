import React from 'react'
import mark from './brand/icon_32.png'
import darkMark from './brand/icon_32_dark.png'
import s from './Brand.module.styl'

export default function Brand({ className = '' }) {
    return <>
        <img className={`${s.mark} ${s.light} ${className}`} src={mark} alt='ME' />
        <img className={`${s.mark} ${s.dark} ${className}`} src={darkMark} alt='ME' />
    </>
}
