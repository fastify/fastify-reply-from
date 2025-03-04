'use strict'

const t = require('tap')
const Fastify = require('fastify')
const From = require('..')

const header = 'attachment; filename="år.pdf"'

t.plan(5)

const instance = Fastify()
t.teardown(instance.close.bind(instance))
const proxy1 = Fastify()
t.teardown(proxy1.close.bind(proxy1))
const proxy2 = Fastify()
t.teardown(proxy2.close.bind(proxy2))

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

instance.listen({ port: 0 }, err => {
  t.error(err)

  proxy1.listen({ port: 0 }, err => {
    t.error(err)

    proxy2.listen({ port: 0 }, async err => {
      t.error(err)

      const result = await fetch(`http://localhost:${proxy2.server.address().port}`)

      t.equal(result.status, 200)
      t.equal(await result.text(), 'OK')
    })
  })
})
