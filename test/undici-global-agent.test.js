'use strict'

const { test } = require('tap')
const Fastify = require('fastify')
const { request } = require('undici')
const http = require('node:http')
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

  const target = http.createServer((_req, res) => {
    res.statusCode = 200
    res.end()
  })

  instance.get('/', (_request, reply) => {
    reply.from()
  })

  t.teardown(target.close.bind(target))

  await new Promise(resolve => target.listen({ port: 0 }, resolve))

  instance.register(From, {
    base: `http://localhost:${target.address().port}`,
    globalAgent: true
  })

  await new Promise(resolve => instance.listen({ port: 0 }, resolve))

  const result = await request(`http://localhost:${instance.server.address().port}`)
  t.equal(result.statusCode, 200)

  const result1 = await request(`http://localhost:${instance.server.address().port}`)
  t.equal(result1.statusCode, 200)

  target.close()
})
