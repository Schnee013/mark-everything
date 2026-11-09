import s from './text.module.styl'
import React, { useRef, useCallback, useLayoutEffect } from 'react'

const nativeFieldSizing = typeof window != 'undefined' && window.CSS?.supports('field-sizing', 'content')

export const Text = React.forwardRef(function Text({
    className='',
    autoSize,
    multiline,
    selectAll,
    variant='default',      //less, inline
    font='default',         //title
    hidden,
    minRows,
    maxRows,
    icon=null,              //before input
    children=null,          //after input
    readOnly,
    onKeyDown,
    onFocus,
    ...etc
}, ref) {
    const firstFocus = useRef(false)

    const field = useRef(null)
    const setRef = useCallback(node => {
        field.current = node
        if (typeof ref == 'function') ref(node)
        else if (ref) ref.current = node
    }, [ref])

    //field-sizing: content polyfill, all usages are controlled so a render is enough
    useLayoutEffect(() => {
        if (nativeFieldSizing || !autoSize || !field.current) return
        field.current.style.height = 'auto'
        field.current.style.height = field.current.scrollHeight + 'px'
    })

    const onKeyDownField = useCallback(e=>{
        //ME: multiline fields save on Cmd/Ctrl+Enter; Enter and Shift+Enter stay newlines.
        if (e.keyCode == 13 &&
            autoSize &&
            (
                !multiline ||
                e.metaKey || e.ctrlKey || (e.shiftKey && !process.env.ME_LOCAL)
            )){
            e.preventDefault()

            const form = e.currentTarget.closest('form')
            if (form) form.requestSubmit()
        }

        onKeyDown && onKeyDown(e)
    }, [autoSize, multiline, onKeyDown])

    const onFocusField = useCallback(e=>{
        if (readOnly)
            e.currentTarget.select()

        if (!firstFocus.current && e.currentTarget.value){
            firstFocus.current = true

            if (selectAll)
                e.currentTarget.select()
            else if (e.currentTarget.setSelectionRange && e.currentTarget.type!='email')
                e.currentTarget.setSelectionRange(e.currentTarget.value.length, -1)
        }

        onFocus && onFocus(e)
    }, [readOnly, selectAll, onFocus])

    const Component = autoSize ? 'textarea' : 'input'

    return (
        <label
            className={s.wrap+' '+className}
            data-variant={variant}
            data-auto-size={autoSize}
            data-multiline={multiline}
            data-font={font}
            data-disabled={etc.disabled}
            data-readonly={readOnly || undefined}
            hidden={hidden}>
            {icon ? <div className={s.icon}>{icon}</div> : null}

            <Component
                {...(autoSize ? { rows: 1 } : { type: 'text' })}
                {...etc}
                ref={setRef}
                readOnly={readOnly}
                className={s.text}
                data-single-row={maxRows == 1 || undefined}
                style={(minRows || maxRows) ? {'--min-rows': minRows, '--max-rows': maxRows} : etc.style}
                onKeyDown={onKeyDownField}
                onFocus={onFocusField} />

            {children}
        </label>
    )
})
