'use strict'

const t = require('tap')
const Fastify = require('fastify')
const From = require('..')
const got = require('got')
const httpStatus = require('http-status')
const FakeTimers = require('@sinonjs/fake-timers')

const clock = FakeTimers.createClock()

t.autoend(false)

const target = Fastify()
t.tearDown(target.close.bind(target))

target.get('/', (request, reply) => {
  t.pass('request arrives')

  clock.setTimeout(() => {
    reply.status(httpStatus.OK).send('hello world')
    t.end()
  }, 200)
})

async function main () {
  await target.listen(0)

  const instance = Fastify()
  t.tearDown(instance.close.bind(instance))

  instance.register(From, { http: { requestOptions: { timeout: 100 } } })

  instance.get('/', (request, reply) => {
    reply.from(`http://localhost:${target.server.address().port}/`,
      {
        onError: (reply, code, error) => {
          t.equal(code, httpStatus.GATEWAY_TIMEOUT)
          reply.code(code).send(error)
        }
      })
  })

  await instance.listen(0)

  try {
    await got.get(`http://localhost:${instance.server.address().port}/`, { retry: 0 })
  } catch (err) {
    t.equal(err.response.statusCode, httpStatus.GATEWAY_TIMEOUT)
    t.match(err.response.headers['content-type'], /application\/json/)
    t.deepEqual(JSON.parse(err.response.body), {
      statusCode: httpStatus.GATEWAY_TIMEOUT,
      error: 'Gateway Timeout',
      message: 'Gateway Timeout'
    })
    clock.tick(200)
    return
  }

  t.fail()
}

main()
