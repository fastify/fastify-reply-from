'use strict'

const t = require('tap')
const Fastify = require('fastify')
const From = require('..')
const got = require('got')
const FakeTimers = require('@sinonjs/fake-timers')

const clock = FakeTimers.createClock()

t.autoend(false)

const target = Fastify()
t.teardown(target.close.bind(target))

target.get('/', (request, reply) => {
  t.pass('request arrives')

  clock.setTimeout(() => {
    reply.status(200).send('hello world')
    t.end()
  }, 200)
})

async function main () {
  await target.listen(0)

  const instance = Fastify()
  t.teardown(instance.close.bind(instance))

  instance.register(From, { http: { requestOptions: { timeout: 100 } } })

  instance.get('/', (request, reply) => {
    reply.from(`http://localhost:${target.server.address().port}/`)
  })

  await instance.listen(0)

  try {
    await got.get(`http://localhost:${instance.server.address().port}/`, { retry: 0 })
  } catch (err) {
    t.equal(err.response.statusCode, 504)
    t.match(err.response.headers['content-type'], /application\/json/)
    t.same(JSON.parse(err.response.body), {
      statusCode: 504,
      error: 'Gateway Timeout',
      message: 'Gateway Timeout'
    })
    clock.tick(200)
    return
  }

  t.fail()
}

main()
