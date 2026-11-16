'use strict'

const { test } = require('node:test')
const { buildURL } = require('../lib/utils')

test('should produce valid URL', (t) => {
  t.plan(1)
  const url = buildURL('/hi', 'http://localhost')
  t.assert.strictEqual(url.href, 'http://localhost/hi')
})

test('should produce valid URL', (t) => {
  t.plan(1)
  const url = buildURL('http://localhost/hi', 'http://localhost')
  t.assert.strictEqual(url.href, 'http://localhost/hi')
})

test('should return same source when base is not specified', (t) => {
  t.plan(1)
  const url = buildURL('http://localhost/hi')
  t.assert.strictEqual(url.href, 'http://localhost/hi')
})

test('should handle lack of trailing slash in base', (t) => {
  t.plan(3)
  let url = buildURL('hi', 'http://localhost/hi')
  t.assert.strictEqual(url.href, 'http://localhost/hi')

  url = buildURL('hi/', 'http://localhost/hi')
  t.assert.strictEqual(url.href, 'http://localhost/hi/')

  url = buildURL('hi/more', 'http://localhost/hi')
  t.assert.strictEqual(url.href, 'http://localhost/hi/more')
})

test('should handle default port in base', (t) => {
  t.plan(2)
  let url = buildURL('/hi', 'http://localhost:80/hi')
  t.assert.strictEqual(url.href, 'http://localhost/hi')

  url = buildURL('/hi', 'https://localhost:443/hi')
  t.assert.strictEqual(url.href, 'https://localhost/hi')
})

test('should append instead of override base', (t) => {
  t.plan(2)
  let url = buildURL('//10.0.0.10/hi', 'http://localhost')
  t.assert.strictEqual(url.href, 'http://localhost//10.0.0.10/hi')

  url = buildURL('//httpbin.org/hi', 'http://localhost')
  t.assert.strictEqual(url.href, 'http://localhost//httpbin.org/hi')
})

const errorInputs = [
  { source: 'http://10.0.0.10/hi', base: 'http://localhost' },
  { source: 'https://10.0.0.10/hi', base: 'http://localhost' },
  { source: 'blah://10.0.0.10/hi', base: 'http://localhost' },
  { source: 'urn:foo:bar', base: 'http://localhost' },
  { source: 'http://localhost/private', base: 'http://localhost/exposed/' },
  { source: 'http://localhost/exposed-extra', base: 'http://localhost/exposed' },
  { source: '/private', base: 'http://localhost/exposed/' },
  { source: '/exposed-extra', base: 'http://localhost/exposed' },
  { source: '../private', base: 'http://localhost/exposed/' },
  { source: 'exposed-extra', base: 'http://localhost/exposed' }
]

test('should throw when trying to override base', async (t) => {
  t.plan(errorInputs.length)

  const promises = errorInputs.map(({ source, base }) => {
    return t.test(source, (t) => {
      t.plan(1)
      t.assert.throws(() => buildURL(source, base))
    })
  })

  await Promise.all(promises)
})

test('should allow safe path characters and encoded values outside the path', (t) => {
  t.plan(14)
  // Next.js catch-all routes like [...slug] appear percent-encoded in static chunk URLs.
  // These contain '...' as a substring but are not path traversal.
  // See: https://github.com/fastify/fastify-reply-from/issues/460
  t.assert.doesNotThrow(() => buildURL('/_next/static/chunks/pages/%5B...slug%5D.js', 'http://localhost'))
  t.assert.doesNotThrow(() => buildURL('/_next/static/chunks/pages/%5B%5B...slug%5D%5D.js', 'http://localhost'))
  t.assert.doesNotThrow(() => buildURL('/foo/.../bar', 'http://localhost'))
  t.assert.doesNotThrow(() => buildURL('/foo/..bar', 'http://localhost'))
  t.assert.doesNotThrow(() => buildURL('/foo?path=C%3A%5Ctemp', 'http://localhost'))
  t.assert.doesNotThrow(() => buildURL('/foo#path=C:\\temp', 'http://localhost'))
  t.assert.doesNotThrow(() => buildURL('/foo ?query', 'http://localhost'))
  t.assert.doesNotThrow(() => buildURL('/foo #fragment', 'http://localhost'))
  t.assert.doesNotThrow(() => buildURL('/foo?value=%09', 'http://localhost'))
  t.assert.doesNotThrow(() => buildURL('/foo#value=%0a', 'http://localhost'))
  t.assert.doesNotThrow(() => buildURL('/foo?next=/../admin', 'http://localhost'))
  t.assert.doesNotThrow(() => buildURL('/foo#next=/../admin', 'http://localhost'))
  // Legitimate matrix parameters (RFC 3986 §3.3) must still be allowed and
  // forwarded unchanged. See GHSA-6mph-mjg3-f943.
  t.assert.doesNotThrow(() => buildURL('/foo;param=1/bar', 'http://localhost'))
  t.assert.doesNotThrow(() => buildURL('/foo;jsessionid=abc/bar', 'http://localhost'))
})

test('should throw on path traversal attempts', (t) => {
  t.assert.throws(
    () => buildURL('/foo/bar/../', 'http://localhost'),
    new Error('source/request contain invalid characters')
  )

  t.assert.throws(
    () => buildURL('/foo/bar/..', 'http://localhost'),
    new Error('source/request contain invalid characters')
  )

  t.assert.throws(
    () => buildURL('/foo/bar/%2e%2e/', 'http://localhost'),
    new Error('source/request contain invalid characters')
  )

  t.assert.throws(
    () => buildURL('/foo/bar/%2E%2E/', 'http://localhost'),
    new Error('source/request contain invalid characters')
  )

  t.assert.throws(
    () => buildURL('/foo/bar/..%2f', 'http://localhost'),
    new Error('source/request contain invalid characters')
  )

  t.assert.throws(
    () => buildURL('/foo/bar/%2e%2e%2f', 'http://localhost'),
    new Error('source/request contain invalid characters')
  )

  for (const source of [
    '/foo\\..\\bar',
    '/foo%5c..%5cbar',
    '/foo/./bar',
    '/foo/%2e/bar',
    '/foo/\t..\t/bar',
    '/foo/%09..%09/bar',
    ' /foo/bar',
    '/foo/bar '
  ]) {
    t.assert.throws(
      () => buildURL(source, 'http://localhost'),
      new Error('source/request contain invalid characters')
    )
  }
})

// Java-based upstreams (Tomcat, Jetty, WildFly, Spring Boot) treat `;` as a
// path-parameter delimiter and strip it during normalization, so `..;` is
// effectively `..`. See GHSA-6mph-mjg3-f943.
test('should throw on semicolon dot-segment path traversal', (t) => {
  for (const source of [
    '/foo/bar/..;/baz',
    '/foo/bar/..;jsessionid=abc/baz',
    '/foo/bar/..;x=1;y=2/baz',
    '/foo/bar/..%3b/baz',
    '/foo/bar/..%3B/baz',
    '/foo/bar/%2e%2e%3b/baz',
    '/foo/bar/.;baz',
    '/foo/bar/%2e%3b/baz'
  ]) {
    t.assert.throws(
      () => buildURL(source, 'http://localhost'),
      new Error('source/request contain invalid characters')
    )
  }
})

// A source with the same special scheme as the base is parsed as a relative
// path with the scheme dropped, so the dot-segments must be checked on the
// path that is actually forwarded. See GHSA-2ccw-8rvh-6cmg.
test('should throw on scheme-prefixed encoded dot-segment traversal', (t) => {
  for (const [source, base] of [
    ['http:%2e%2e%2fsecret.txt', 'http://localhost/v1/public/'],
    ['http:%2E%2E%2Fsecret.txt', 'http://localhost/v1/public/'],
    ['HTTP:%2e%2e%2fsecret.txt', 'http://localhost/v1/public/'],
    ['http:..%2fsecret.txt', 'http://localhost/v1/public/'],
    ['http:.%2e%2fsecret.txt', 'http://localhost/v1/public/'],
    ['http:%2e%2fsecret.txt', 'http://localhost/v1/public/'],
    ['https:%2e%2e%2fsecret.txt', 'https://localhost/v1/public/']
  ]) {
    t.assert.throws(
      () => buildURL(source, base),
      new Error('source/request contain invalid characters'),
      source
    )
  }
})

test('should allow scheme-prefixed sources without dot-segments', (t) => {
  t.plan(2)
  t.assert.strictEqual(
    buildURL('http:ok.txt', 'http://localhost/v1/public/').href,
    'http://localhost/v1/public/ok.txt'
  )
  t.assert.strictEqual(
    buildURL('http:foo%2fbar.txt', 'http://localhost/v1/public/').href,
    'http://localhost/v1/public/foo%2fbar.txt'
  )
})
