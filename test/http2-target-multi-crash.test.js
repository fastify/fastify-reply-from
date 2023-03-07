'use strict'

const { test } = require('tap')
const Fastify = require('fastify')
const From = require('..')
const got = require('got')

test('http -> http2 crash multiple times', async (t) => {
  const instance = Fastify()

  t.teardown(instance.close.bind(instance))

  instance.get('/', (request, reply) => {
    reply.from()
  })

  instance.register(From, {
    base: 'http://localhost:3128',
    http2: true,
    sessionTimeout: 200
  })

  await instance.listen({ port: 0 })

  try {
    let target = setupTarget()
    await target.listen({ port: 3128 })
    await got(`http://localhost:${instance.server.address().port}`)
    await target.close()
    target = setupTarget()
    await target.listen({ port: 3128 })
    await got(`http://localhost:${instance.server.address().port}`)
    await target.close()
    await got(`http://localhost:${instance.server.address().port}`)
  } catch (err) {
    t.equal(err.response.statusCode, 503)
    t.match(err.response.headers['content-type'], /application\/json/)
    t.same(JSON.parse(err.response.body), {
      statusCode: 503,
      code: 'FST_REPLY_FROM_SERVICE_UNAVAILABLE',
      error: 'Service Unavailable',
      message: 'Service Unavailable'
    })
    return
  }
  t.fail()

  function setupTarget () {
    const target = Fastify({
      http2: true
    })

    target.get('/', (request, reply) => {
      t.pass('request proxied')
      reply.code(200).send({
        hello: 'world'
      })
    })
    return target
  }
})
