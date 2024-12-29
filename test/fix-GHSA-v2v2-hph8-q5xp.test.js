'use strict'

const { describe, after, it } = require('node:test')
const fastify = require('fastify')
const fastifyFrom = require('..')

describe('GHSA-v2v2-hph8-q5xp', function () {
  it('should not parse the body if it is an object', async function (t) {
    t.plan(1)

    const upstream = fastify()

    upstream.post('/test', async (request, reply) => {
      if (typeof request.body === 'object') {
        return 'not ok'
      }
      return 'ok'
    })

    await upstream.listen({ port: 0 })

    const app = fastify()
    app.register(fastifyFrom)

    app.post('/test', (request, reply) => {
      if (request.body.method === 'invalid_method') {
        return reply.code(400).send({ message: 'payload contains invalid method' })
      }
      reply.from(`http://${upstream.server.address().address}:${upstream.server.address().port}/test`)
    })

    await app.listen({ port: 0 })

    after(() => {
      upstream.close()
      app.close()
    })

    const response = await fetch(
      `http://${app.server.address().address}:${app.server.address().port}/test`,
      {
        headers: { 'content-type': 'application/json ; charset=utf-8' },
        // eslint-disable-next-line no-useless-escape
        body: '"{\\\"method\\\":\\\"invalid_method\\\"}"',
        method: 'POST'
      })

    t.assert.strictEqual(await response.text(), 'ok')
  })
})
