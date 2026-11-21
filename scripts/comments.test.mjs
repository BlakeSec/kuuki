import assert from 'node:assert/strict'
import { test } from 'node:test'
import { findComments, stripComments } from './comments.mjs'

test('strips script comments without touching strings, regexes, JSX text or directives', () => {
  const source = [
    '// file note',
    "const url = 'https://example.com/*not*/' // trailing",
    'const pattern = /\\/\\/ not/g',
    '/** doc */',
    'export function View() {',
    '  return (',
    '    <a href={url}>',
    '      {/* jsx note */}',
    '      // visible text',
    '    </a>',
    '  )',
    '}',
    '// oxlint-disable-next-line no-unused-vars',
    '// @ts-expect-error -- fixture',
    '// Copyright (c) 2026 Someone; license: LICENSE.',
    'const x = f(/* inline */ 1)',
    '',
  ].join('\n')
  assert.equal(
    stripComments('view.tsx', source),
    [
      "const url = 'https://example.com/*not*/'",
      'const pattern = /\\/\\/ not/g',
      'export function View() {',
      '  return (',
      '    <a href={url}>',
      '      // visible text',
      '    </a>',
      '  )',
      '}',
      '// oxlint-disable-next-line no-unused-vars',
      '// @ts-expect-error -- fixture',
      '// Copyright (c) 2026 Someone; license: LICENSE.',
      'const x = f(1)',
      '',
    ].join('\n'),
  )
})

test('strips CSS comments but not comment markers inside strings', () => {
  const source = 'a { content: "/* keep */"; } /* drop */\n/* line */\nb { color: red; }\n'
  assert.deepEqual(
    findComments('x.css', source).map((comment) => comment.text),
    ['/* drop */', '/* line */'],
  )
  assert.equal(stripComments('x.css', source), 'a { content: "/* keep */"; }\nb { color: red; }\n')
})
