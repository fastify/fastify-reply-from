'use strict'

const { describe, after, it } = require('node:test')
const fastify = require('fastify')
const { request } = require('undici')
const fastifyProxyFrom = require('..')
const { isIPv6 } = require('node:net')

describe('GHSA-v2v2-hph8-q5xp', function () {
  it('should not parse the body if it is an object', async function (t) {
    t.plan(1)

    const upstream = fastify()

    upstream.post('/test', async (request) => {
      if (typeof request.body === 'object') {
        return 'not ok'
      }
      return 'ok'
    })

    await upstream.listen({ port: 0 })

    let upstreamAdress = upstream.server.address().address

    if (isIPv6(upstreamAdress)) {
      upstreamAdress = `[${upstreamAdress}]`
    }

    const app = fastify()
    app.register(fastifyProxyFrom)

    app.post('/test', (request, reply) => {
      if (request.body.method === 'invalid_method') {
        return reply.code(400).send({ message: 'payload contains invalid method' })
      }
      reply.from(`http://${upstreamAdress}:${upstream.server.address().port}/test`)
    })

    await app.listen({ port: 0 })

    after(() => {
      upstream.close()
      app.close()
    })

    let appAddress = app.server.address().address

    if (isIPv6(appAddress)) {
      appAddress = `[${appAddress}]`
    }

    const response = await request(
      `http://${appAddress}:${app.server.address().port}/test`,
      {
        headers: { 'content-type': 'application/json ; charset=utf-8' },
        // eslint-disable-next-line no-useless-escape
        body: '"{\\\"method\\\":\\\"invalid_method\\\"}"',
        method: 'POST'
      })

    t.assert.strictEqual(await response.body.text(), 'ok')
  })
})
