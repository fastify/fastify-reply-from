'use strict'

const { test } = require('node:test')
const http = require('node:http')
const Fastify = require('fastify')
const From = require('..')
const { buildURL } = require('../lib/utils')

const malformed = [
  '%zz',
  'foo%',
  'foo%2',
  'http:%zz',
  '/foo/%C3',
  '/foo/%E0%A4%A',
  '/foo/%ED%A0%80',
  '/foo?bar=%zz',
  '/foo#%zz'
]

test('buildURL rejects malformed percent-encoding as a client error', (t) => {
  for (const source of malformed) {
    t.assert.throws(
      () => buildURL(source, 'http://localhost/v1/public/'),
      (err) => {
        t.assert.strictEqual(err.message, 'source/request contain invalid characters', source)
        t.assert.strictEqual(err.statusCode, 400, source)
        t.assert.ok(err.cause instanceof URIError, source)
        return true
      },
      source
    )
  }
})

test('buildURL still accepts well-formed percent-encoding', (t) => {
  t.plan(3)
  t.assert.strictEqual(
    buildURL('100%25.txt', 'http://localhost/v1/public/').href,
    'http://localhost/v1/public/100%25.txt'
  )
  t.assert.strictEqual(
    buildURL('caf%C3%A9.txt', 'http://localhost/v1/public/').href,
    'http://localhost/v1/public/caf%C3%A9.txt'
  )
  t.assert.strictEqual(
    buildURL('/foo?bar=%25', 'http://localhost').href,
    'http://localhost/foo?bar=%25'
  )
})

test('reply.from() responds 400 to malformed percent-encoding in the source', async (t) => {
  let upstreamRequests = 0
  const upstream = http.createServer((_req, res) => {
    upstreamRequests++
    res.end('ok')
  })
  await new Promise(resolve => upstream.listen(0, '127.0.0.1', resolve))
  t.after(() => new Promise(resolve => upstream.close(resolve)))

  const app = Fastify()
  t.after(() => app.close())
  app.register(From, {
    base: `http://127.0.0.1:${upstream.address().port}/v1/public/`
  })
  app.get('/files/*', (request, reply) => reply.from(request.params['*']))

  // find-my-way decodes the wildcard parameter once, so `%25zz` reaches
  // reply.from() as `%zz`.
  for (const url of ['/files/%25zz', '/files/http:%25zz', '/files/%25C3']) {
    const response = await app.inject(url)
    t.assert.strictEqual(response.statusCode, 400, url)
    t.assert.deepStrictEqual(response.json(), {
      statusCode: 400,
      error: 'Bad Request',
      message: 'source/request contain invalid characters'
    }, url)
  }
  t.assert.strictEqual(upstreamRequests, 0)

  const response = await app.inject('/files/ok.txt')
  t.assert.strictEqual(response.statusCode, 200)
  t.assert.strictEqual(response.body, 'ok')
  t.assert.strictEqual(upstreamRequests, 1)
})
