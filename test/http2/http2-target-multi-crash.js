'use strict'

const t = require('tap')
const Fastify = require('fastify')
const From = require('../..')
const got = require('got')

const instance = Fastify()

t.tearDown(instance.close.bind(instance))

instance.get('/', (request, reply) => {
  reply.from()
})

async function run () {
  instance.register(From, {
    base: `http://localhost:3128`,
    http2: true
  })

  await instance.listen(0)

  t.test('http -> http2 crash multiple times', async (t) => {
    try {
      let target = setupTarget()
      await target.listen(3128)
      await got(`http://localhost:${instance.server.address().port}`, {
        rejectUnauthorized: false
      })
      await target.close()
      target = setupTarget()
      await target.listen(3128)
      await got(`http://localhost:${instance.server.address().port}`, {
        rejectUnauthorized: false
      })
      await target.close()
      await got(`http://localhost:${instance.server.address().port}`, {
        rejectUnauthorized: false
      })
    } catch (err) {
      console.error(err)
      t.equal(err.response.statusCode, 503)
      t.match(err.response.headers['content-type'], /application\/json/)
      t.deepEqual(JSON.parse(err.response.body), {
        statusCode: 503,
        error: 'Service Unavailable',
        message: 'Service Unavailable'
      })
      return
    }
    t.fail()
  })
}

run()

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
