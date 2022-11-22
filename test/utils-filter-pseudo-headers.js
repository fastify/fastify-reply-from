'use strict'

const test = require('tap').test
const filterPseudoHeaders = require('../lib/utils').filterPseudoHeaders

test('filterPseudoHeaders', t => {
  t.plan(1)
  const headers = {
    accept: '*/*',
    'Content-Type': 'text/html; charset=UTF-8',
    ':method': 'GET'
  }

  t.strictSame(filterPseudoHeaders(headers), {
    accept: '*/*',
    'content-type': 'text/html; charset=UTF-8'
  })
})
