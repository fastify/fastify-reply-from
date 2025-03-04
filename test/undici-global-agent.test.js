'use strict'

const { test } = require('tap')
const Fastify = require('fastify')
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

  const executionFlow = () => new Promise((resolve) => {
    target.listen({ port: 0 }, (err) => {
      t.error(err)

      instance.register(From, {
        base: `http://localhost:${target.address().port}`,
        globalAgent: true
      })

      instance.listen({ port: 0 }, async (err) => {
        t.error(err)

        const result = await fetch(`http://localhost:${instance.server.address().port}`)
        t.equal(result.status, 200)

        const result1 = await fetch(`http://localhost:${instance.server.address().port}`)
        t.equal(result1.status, 200)

        resolve()
      })
    })
  })

  await executionFlow()

  target.close()
})
