'use strict'

const t = require('tap')
const http = require('http')
const Fastify = require('fastify')
const From = require('..')
const got = require('got')
const FakeTimers = require('@sinonjs/fake-timers')

const clock = FakeTimers.createClock()

t.autoend(false)

const target = http.createServer((req, res) => {
  t.pass('request proxied')
  req.on('data', () => undefined)
  req.on('end', () => {
    res.flushHeaders()
    clock.setTimeout(() => {
      res.end()
      t.end()
    }, 1000)
  })
})

async function main () {
  await target.listen(0)

  const instance = Fastify()
  t.teardown(instance.close.bind(instance))
  t.teardown(target.close.bind(target))

  instance.register(From, {
    base: `http://localhost:${target.address().port}`,
    undici: {
      bodyTimeout: 100
    }
  })

  instance.get('/', (request, reply) => {
    reply.from()
  })

  await instance.listen(0)

  try {
    await got.get(`http://localhost:${instance.server.address().port}/`, { retry: 0 })
  } catch (err) {
    t.equal(err.response.statusCode, 500)
    t.same(JSON.parse(err.response.body), {
      statusCode: 500,
      code: 'UND_ERR_BODY_TIMEOUT',
      error: 'Internal Server Error',
      message: 'Body Timeout Error'
    })
    clock.tick(1000)
    return
  }

  t.fail()
}

main()
