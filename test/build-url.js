'use strict'

const { test } = require('tap')
const { buildURL } = require('../lib/utils')

test('should produce valid URL', (t) => {
  t.plan(1)
  const url = buildURL('/hi', 'http://localhost')
  t.equal(url.href, 'http://localhost/hi')
})

test('should produce valid URL', (t) => {
  t.plan(1)
  const url = buildURL('http://localhost/hi', 'http://localhost')
  t.equal(url.href, 'http://localhost/hi')
})

test('should return same source when base is not specified', (t) => {
  t.plan(1)
  const url = buildURL('http://localhost/hi')
  t.equal(url.href, 'http://localhost/hi')
})

const errorInputs = [
  { source: '//10.0.0.10/hi', base: 'http://localhost' },
  { source: 'http://10.0.0.10/hi', base: 'http://localhost' },
  { source: 'https://10.0.0.10/hi', base: 'http://localhost' },
  { source: 'blah://10.0.0.10/hi', base: 'http://localhost' },
  { source: '//httpbin.org/hi', base: 'http://localhost' },
  { source: 'urn:foo:bar', base: 'http://localhost' }
]

test('should throw when trying to override base', (t) => {
  t.plan(errorInputs.length)

  errorInputs.forEach(({ source, base }) => {
    t.test(source, (t) => {
      t.plan(1)
      t.throws(() => buildURL(source, base))
    })
  })
})
