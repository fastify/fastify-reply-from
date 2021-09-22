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

test('should handle lack of trailing slash in base', (t) => {
  t.plan(3)
  let url = buildURL('hi', 'http://localhost/hi')
  t.equal(url.href, 'http://localhost/hi')

  url = buildURL('hi/', 'http://localhost/hi')
  t.equal(url.href, 'http://localhost/hi/')

  url = buildURL('hi/more', 'http://localhost/hi')
  t.equal(url.href, 'http://localhost/hi/more')
})

test('should handle default port in base', (t) => {
  t.plan(2)
  let url = buildURL('/hi', 'http://localhost:80/hi')
  t.equal(url.href, 'http://localhost/hi')

  url = buildURL('/hi', 'https://localhost:443/hi')
  t.equal(url.href, 'https://localhost/hi')
})

const errorInputs = [
  { source: '//10.0.0.10/hi', base: 'http://localhost' },
  { source: 'http://10.0.0.10/hi', base: 'http://localhost' },
  { source: 'https://10.0.0.10/hi', base: 'http://localhost' },
  { source: 'blah://10.0.0.10/hi', base: 'http://localhost' },
  { source: '//httpbin.org/hi', base: 'http://localhost' },
  { source: 'urn:foo:bar', base: 'http://localhost' },
  { source: 'http://localhost/private', base: 'http://localhost/exposed/' },
  { source: 'http://localhost/exposed-extra', base: 'http://localhost/exposed' },
  { source: '/private', base: 'http://localhost/exposed/' },
  { source: '/exposed-extra', base: 'http://localhost/exposed' },
  { source: '../private', base: 'http://localhost/exposed/' },
  { source: 'exposed-extra', base: 'http://localhost/exposed' }
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
