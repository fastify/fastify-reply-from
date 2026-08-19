'use strict'

const t = require('node:test')
const Fastify = require('fastify')
const From = require('..')

t.test('returns 504 on undici connect timeout', async t => {
  const instance = Fastify()

  instance.register(From, {
    base: 'http://10.255.255.1:12345',
    undici: {
      connectTimeout: 50
    }
  })

  instance.get('/', (_request, reply) => {
    reply.from()
  })

  t.after(() => instance.close())

  await instance.listen({ port: 0 })

  const response = await fetch(
    `http://localhost:${instance.server.address().port}/`
  )

  t.assert.strictEqual(response.status, 504)
})
