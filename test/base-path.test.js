'use strict'

const t = require('node:test')
const Fastify = require('fastify')
const { request, Agent } = require('undici')
const From = require('..')
const nock = require('nock')

t.test('base path', async (t) => {
  const instance = Fastify()

  nock('http://httpbin.org')
    .get('/ip')
    .reply(200, function () {
      t.assert.strictEqual(this.req.headers.host, 'httpbin.org')
      return { origin: '127.0.0.1' }
    })

  t.plan(4)
  t.after(() => instance.close())

  instance.get('/', (_request, reply) => {
    reply.from('http://httpbin.org/ip')
  })

  instance.register(From, {
    undici: false
  })

  await new Promise(resolve => instance.listen({ port: 0 }, resolve))

  const result = await request(`http://localhost:${instance.server.address().port}`, {
    dispatcher: new Agent({
      pipelining: 0
    })
  })

  t.assert.strictEqual(result.statusCode, 200)
  t.assert.strictEqual(result.headers['content-type'], 'application/json')
  t.assert.strictEqual(typeof (await result.body.json()).origin, 'string')
})
