'use strict'

const t = require('node:test')
const Fastify = require('fastify')
const { request } = require('undici')
const From = require('..')

const header = 'attachment; filename="år.pdf"'

t.test('undici chaining', async (t) => {
  t.plan(2)

  const instance = Fastify()
  t.after(() => instance.close())
  const proxy1 = Fastify()
  t.after(() => proxy1.close())
  const proxy2 = Fastify()
  t.after(() => proxy2.close())

  instance.get('/', (_request, reply) => {
    reply.header('content-disposition', header).send('OK')
  })

  proxy1.register(From, {
    undici: {
      keepAliveMaxTimeout: 10
    }
  })
  proxy1.get('/', (_request, reply) => {
    return reply.from(`http://localhost:${instance.server.address().port}`)
  })

  proxy2.register(From, {
    undici: {
      keepAliveMaxTimeout: 10
    }
  })
  proxy2.get('/', (_request, reply) => {
    return reply.from(`http://localhost:${proxy1.server.address().port}`)
  })

  await new Promise((resolve) => instance.listen({ port: 0 }, resolve))
  await new Promise((resolve) => proxy1.listen({ port: 0 }, resolve))
  await new Promise((resolve) => proxy2.listen({ port: 0 }, resolve))

  const result = await request(`http://localhost:${proxy2.server.address().port}`)

  t.assert.strictEqual(result.statusCode, 200)
  t.assert.strictEqual(await result.body.text(), 'OK')
})
