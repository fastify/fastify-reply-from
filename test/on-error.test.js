'use strict'

const t = require('tap')
const Fastify = require('fastify')
const { request, Agent } = require('undici')
const From = require('..')
const FakeTimers = require('@sinonjs/fake-timers')

const clock = FakeTimers.createClock()

t.test('on-error', async (t) => {
  const target = Fastify()
  t.after(() => target.close())

  target.get('/', (_request, reply) => {
    t.assert.ok('request arrives')

    clock.setTimeout(() => {
      reply.status(200).send('hello world')
      t.end()
    }, 1000)
  })

  await target.listen({ port: 0 })

  const instance = Fastify()
  t.after(() => instance.close())

  instance.register(From, { http: { requestOptions: { timeout: 100 } } })

  instance.get('/', (_request, reply) => {
    reply.from(`http://localhost:${target.server.address().port}/`,
      {
        onError: (reply, { error }) => {
          t.same(error, {
            statusCode: 504,
            name: 'FastifyError',
            code: 'FST_REPLY_FROM_GATEWAY_TIMEOUT',
            message: 'Gateway Timeout'
          })
          reply.code(error.statusCode).send(error)
        }
      })
  })

  await instance.listen({ port: 0 })

  const result = await request(`http://localhost:${instance.server.address().port}/`, {
    dispatcher: new Agent({
      pipelining: 0
    })
  })

  t.assert.deepEqual(result.statusCode, 504)
  t.match(result.headers['content-type'], /application\/json/)
  t.same(await result.body.json(), {
    statusCode: 504,
    code: 'FST_REPLY_FROM_GATEWAY_TIMEOUT',
    error: 'Gateway Timeout',
    message: 'Gateway Timeout'
  })
  clock.tick(1000)
})
