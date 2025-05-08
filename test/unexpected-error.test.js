'use strict'

const { test } = require('node:test')
const Fastify = require('fastify')
const { request } = require('undici')
const proxyquire = require('proxyquire')

// Stub request to throw error 'foo'
const From = proxyquire('..', {
  './lib/request': function () {
    return {
      request: (_opts, callback) => { callback(new Error('foo')) },
      close: () => {}
    }
  }
})

test('unexpected error renders 500', async (t) => {
  const instance = Fastify()

  t.after(() => instance.close())

  instance.get('/', (_request, reply) => {
    reply.code(205)
    reply.from()
  })
  instance.register(From, {
    base: 'http://localhost'
  })

  await instance.listen({ port: 0 })

  const result = await request(`http://localhost:${instance.server.address().port}`)
  t.assert.strictEqual(result.statusCode, 500)
  t.assert.match(result.headers['content-type'], /application\/json/)
  t.assert.deepStrictEqual(await result.body.json(), {
    statusCode: 500,
    code: 'FST_REPLY_FROM_INTERNAL_SERVER_ERROR',
    error: 'Internal Server Error',
    message: 'foo'
  })
})
