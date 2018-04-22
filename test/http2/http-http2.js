'use strict'

const t = require('tap')
const Fastify = require('fastify')
const From = require('../..')
const got = require('got')

const instance = Fastify()

t.tearDown(instance.close.bind(instance))

const target = Fastify({
  http2: true
})

target.get('/', (request, reply) => {
  t.pass('request proxied')
  reply.code(404).header('x-my-header', 'hello!').send({
    hello: 'world'
  })
})

instance.get('/', (request, reply) => {
  reply.from()
})

t.tearDown(target.close.bind(target))

async function run () {
  await target.listen(0)

  instance.register(From, {
    base: `http://localhost:${target.server.address().port}`,
    http2: true
  })

  await instance.listen(0)

  t.test('http -> http2', async (t) => {
    try {
      await got(`http://localhost:${instance.server.address().port}`, {
        rejectUnauthorized: false
      })
    } catch (err) {
      t.equal(err.response.statusCode, 404)
      t.equal(err.response.headers['x-my-header'], 'hello!')
      t.equal(err.response.headers['content-type'], 'application/json')
      t.deepEqual(JSON.parse(err.response.body), { hello: 'world' })
      return
    }
    t.fail()
  })
}

run()
