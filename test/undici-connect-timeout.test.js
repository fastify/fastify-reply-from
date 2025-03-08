'use strict'

const t = require('tap')
const http = require('node:http')
const net = require('node:net')
const Fastify = require('fastify')
const { request, Agent } = require('undici')
const From = require('..')

t.test('undici connect timeout', async (t) => {
// never connect
  net.connect = function (options) {
    return new net.Socket(options)
  }

  const target = http.createServer(() => {
    t.fail('target never called')
  })

  t.plan(2)
  await new Promise(resolve => target.listen({ port: 0 }, resolve))

  const instance = Fastify()
  t.teardown(instance.close.bind(instance))
  t.teardown(target.close.bind(target))

  instance.register(From, {
    base: `http://localhost:${target.address().port}`,
    undici: {
      connectTimeout: 50
    }
  })

  instance.get('/', (_request, reply) => {
    reply.from()
  })

  await instance.listen({ port: 0 })

  const result = await request(`http://localhost:${instance.server.address().port}`, {
    dispatcher: new Agent({
      pipielining: 0
    })
  })

  t.equal(result.statusCode, 500)
  t.same(await result.body.json(), {
    statusCode: 500,
    code: 'UND_ERR_CONNECT_TIMEOUT',
    error: 'Internal Server Error',
    message: 'Connect Timeout Error'
  })
})
