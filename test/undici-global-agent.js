'use strict'

const { test } = require('tap')
const Fastify = require('fastify')
const got = require('got')
const undici = require('undici')
const From = require('..')

test('undici global agent is used, but not destroyed', async (t) => {
  const mockAgent = new undici.Agent()
  mockAgent.destroy = () => {
    t.fail()
  }
  undici.setGlobalDispatcher(mockAgent)
  const instance = Fastify()

  t.teardown(instance.close.bind(instance))

  const target = Fastify()

  target.get('/', (request, reply) => {
    t.pass('request proxied')
    reply.code(200).send()
  })

  instance.get('/', (request, reply) => {
    reply.from()
  })

  t.teardown(target.close.bind(target))

  await target.listen({ port: 0 })

  instance.register(From, {
    base: `http://localhost:${target.server.address().port}`,
    globalAgent: true
  })

  await instance.listen({ port: 0 })

  const result = await got(`http://localhost:${instance.server.address().port}`)
  t.equal(result.statusCode, 200)

  await target.close()
})
