import { useEffect, useRef } from 'react'
import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter } from '@codemirror/view'
import { EditorState } from '@codemirror/state'
import { defaultKeymap, indentWithTab, history, historyKeymap } from '@codemirror/commands'
import { sql, SQLite, PostgreSQL, MySQL } from '@codemirror/lang-sql'
import { oneDark } from '@codemirror/theme-one-dark'
import { autocompletion, closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete'
import { bracketMatching, foldGutter, indentOnInput, syntaxHighlighting, defaultHighlightStyle } from '@codemirror/language'
import { highlightSelectionMatches, searchKeymap } from '@codemirror/search'
import { lintKeymap } from '@codemirror/lint'

export default function SqlEditor({
  value = '',
  onChange,
  onExecute,
  height = '320px',
  dialect = 'MySQL',
  tables = [],
  readOnly = false,
}) {
  const containerRef = useRef(null)
  const viewRef = useRef(null)
  const onExecuteRef = useRef(onExecute)
  const onChangeRef = useRef(onChange)

  useEffect(() => {
    onExecuteRef.current = onExecute
  }, [onExecute])

  useEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])

  useEffect(() => {
    if (!containerRef.current) return

    const dialectMap = { MySQL, PostgreSQL, SQLite }
    const sqlDialect = dialectMap[dialect] || MySQL

    const schema = {}
    if (tables.length) {
      tables.forEach((t) => {
        const tableName = typeof t === 'string' ? t : t.name
        const columns = typeof t === 'object' && Array.isArray(t.columns) ? t.columns : []
        schema[tableName] = columns
      })
    }

    const executeKeymap = keymap.of([
      {
        key: 'Mod-Enter',
        run: () => {
          if (onExecuteRef.current) onExecuteRef.current()
          return true
        },
      },
    ])

    const updateListener = EditorView.updateListener.of((update) => {
      if (update.docChanged && onChangeRef.current) {
        onChangeRef.current(update.state.doc.toString())
      }
    })

    const state = EditorState.create({
      doc: value,
      extensions: [
        lineNumbers(),
        highlightActiveLine(),
        highlightActiveLineGutter(),
        foldGutter(),
        indentOnInput(),
        bracketMatching(),
        closeBrackets(),
        highlightActiveLine(),
        highlightSelectionMatches(),
        history(),
        syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
        oneDark,
        sql({
          dialect: sqlDialect,
          schema,
          upperCaseKeywords: true,
        }),
        autocompletion({
          override: [],
          activateOnTyping: true,
        }),
        keymap.of([
          ...closeBracketsKeymap,
          ...defaultKeymap,
          ...searchKeymap,
          ...historyKeymap,
          ...lintKeymap,
          indentWithTab,
        ]),
        executeKeymap,
        updateListener,
        EditorView.theme({
          '&': {
            fontSize: '13px',
            fontFamily: 'Consolas, Monaco, "Courier New", monospace',
          },
          '.cm-content': {
            padding: '8px 0',
          },
          '.cm-scroller': {
            overflow: 'auto',
          },
          '&.cm-focused': {
            outline: 'none',
          },
        }),
        EditorState.readOnly.of(readOnly),
        EditorView.lineWrapping,
      ],
    })

    const view = new EditorView({
      state,
      parent: containerRef.current,
    })

    viewRef.current = view

    return () => {
      view.destroy()
      viewRef.current = null
    }
    // Only run once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Sync external value changes into the editor
  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    const currentDoc = view.state.doc.toString()
    if (currentDoc !== value) {
      view.dispatch({
        changes: { from: 0, to: currentDoc.length, insert: value },
      })
    }
  }, [value])

  return (
    <div
      ref={containerRef}
      style={{
        height,
        border: '1px solid var(--color-border-2, #e5e6eb)',
        borderRadius: 6,
        overflow: 'hidden',
      }}
    />
  )
}
