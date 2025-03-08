'use strict'

const t = require('tap')
const Fastify = require('fastify')
const { request, Agent } = require('undici')
const From = require('..')
const FakeTimers = require('@sinonjs/fake-timers')

const clock = FakeTimers.createClock()

t.test('undici request timeout', async (t) => {
  const target = Fastify()
  t.teardown(target.close.bind(target))

  target.get('/', (_request, reply) => {
    t.pass('request arrives')

    clock.setTimeout(() => {
      reply.status(200).send('hello world')
      t.end()
    }, 1000)
  })

  await target.listen({ port: 0 })

  const instance = Fastify()
  t.teardown(instance.close.bind(instance))

  instance.register(From, {
    base: `http://localhost:${target.server.address().port}`,
    undici: {
      headersTimeout: 100
    }
  })

  instance.get('/', (_request, reply) => {
    reply.from()
  })

  await instance.listen({ port: 0 })

  const result = await request(`http://localhost:${instance.server.address().port}`, {
    dispatcher: new Agent({
      pipelining: 0
    })
  })

  t.equal(result.statusCode, 504)
  t.match(result.headers['content-type'], /application\/json/)
  t.same(await result.body.json(), {
    statusCode: 504,
    code: 'FST_REPLY_FROM_GATEWAY_TIMEOUT',
    error: 'Gateway Timeout',
    message: 'Gateway Timeout'
  })
  clock.tick(1000)
})
