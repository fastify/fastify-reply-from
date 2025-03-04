'use strict'

const t = require('tap')
const Fastify = require('fastify')
const From = require('..')
const nock = require('nock')

const instance = Fastify()

nock('http://httpbin.org')
  .get('/ip')
  .reply(200, function () {
    t.equal(this.req.headers.host, 'httpbin.org')
    return { origin: '127.0.0.1' }
  })

t.plan(5)
t.teardown(instance.close.bind(instance))

instance.get('/', (_request, reply) => {
  reply.from('http://httpbin.org/ip')
})

instance.register(From, {
  undici: false
})

instance.listen({ port: 0 }, async (err) => {
  t.error(err)

  const result = await fetch(`http://localhost:${instance.server.address().port}`)

  t.equal(result.status, 200)
  t.equal(result.headers.get('content-type'), 'application/json')
  t.equal(typeof (await result.json()).origin, 'string')
})
