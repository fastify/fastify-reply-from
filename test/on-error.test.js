'use strict'

const t = require('node:test')
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
    }, 1000)
  })

  await target.listen({ port: 0 })

  const instance = Fastify()
  t.after(() => instance.close())

  instance.register(From, { http: { requestOptions: { timeout: 100 } } })

  instance.get('/', (_request, reply) => {
    reply.from(`http://localhost:${target.server.address().port}/`,
      {
        onError: (reply, { error: { stack, ...errorContent } }) => {
          t.assert.deepStrictEqual(errorContent, {
            statusCode: 504,
            name: 'FastifyError',
            code: 'FST_REPLY_FROM_GATEWAY_TIMEOUT',
            message: 'Gateway Timeout'
          })
          reply.code(errorContent.statusCode).send(errorContent)
        }
      })
  })

  await instance.listen({ port: 0 })

  const result = await request(`http://localhost:${instance.server.address().port}/`, {
    dispatcher: new Agent({
      pipelining: 0
    })
  })

  t.assert.strictEqual(result.statusCode, 504)
  t.assert.match(result.headers['content-type'], /application\/json/)
  t.assert.deepStrictEqual(await result.body.json(), {
    statusCode: 504,
    code: 'FST_REPLY_FROM_GATEWAY_TIMEOUT',
    name: 'FastifyError',
    message: 'Gateway Timeout'
  })
  clock.tick(1000)
})
