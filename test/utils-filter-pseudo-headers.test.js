'use strict'

const test = require('node:test')
const filterPseudoHeaders = require('../lib/utils').filterPseudoHeaders

test('filterPseudoHeaders', t => {
  t.plan(1)
  const headers = {
    accept: '*/*',
    'Content-Type': 'text/html; charset=UTF-8',
    ':method': 'GET'
  }

  t.assert.deepStrictEqual(filterPseudoHeaders(headers), {
    accept: '*/*',
    'content-type': 'text/html; charset=UTF-8'
  })
})
