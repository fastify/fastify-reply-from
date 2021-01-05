'use strict'

const { test } = require('tap')
const { buildURL } = require('../lib/utils')

test('should produce valid URL', (t) => {
  t.plan(1)
  const url = buildURL('/hi', 'http://localhost')
  t.equal(url.href, 'http://localhost/hi')
})

test('should return same source when base not specified', (t) => {
  t.plan(1)
  const url = buildURL('http://localhost/hi')
  t.equal(url.href, 'http://localhost/hi')
})

test('should sanitize invalid source', (t) => {
  t.plan(1)
  const url = buildURL('//10.0.0.10/hi', 'http://localhost')
  t.equal(url.href, 'http://localhost/10.0.0.10/hi')
})

test('should sanitize invalid source', (t) => {
  t.plan(1)
  const url = buildURL('http://10.0.0.10/hi', 'http://localhost')
  t.equal(url.href, 'http://localhost/10.0.0.10/hi')
})

test('should sanitize invalid source', (t) => {
  t.plan(1)
  const url = buildURL('https://10.0.0.10/hi', 'http://localhost')
  t.equal(url.href, 'http://localhost/10.0.0.10/hi')
})

test('should sanitize invalid source', (t) => {
  t.plan(1)
  const url = buildURL('blah://10.0.0.10/hi', 'http://localhost')
  t.equal(url.href, 'http://localhost/10.0.0.10/hi')
})

test('should sanitize invalid source', (t) => {
  t.plan(1)
  const url = buildURL('//httpbin.org/hi', 'http://localhost')
  t.equal(url.href, 'http://localhost/httpbin.org/hi')
})
