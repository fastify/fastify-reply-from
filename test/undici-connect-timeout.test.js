'use strict'

const t = require('tap')
const http = require('node:http')
const net = require('node:net')
const Fastify = require('fastify')
const From = require('..')
const got = require('got')

t.autoend(false)

// never connect
net.connect = function (options) {
  return new net.Socket(options)
}

const target = http.createServer((req, res) => {
  t.fail('target never called')
})

async function main () {
  t.plan(2)
  await target.listen({ port: 0 })

  const instance = Fastify()
  t.teardown(instance.close.bind(instance))
  t.teardown(target.close.bind(target))

  instance.register(From, {
    base: `http://localhost:${target.address().port}`,
    undici: {
      connectTimeout: 50
    }
  })

  instance.get('/', (request, reply) => {
    reply.from()
  })

  await instance.listen({ port: 0 })

  try {
    await got.get(`http://localhost:${instance.server.address().port}/`, { retry: 0 })
  } catch (err) {
    t.equal(err.response.statusCode, 500)
    t.same(JSON.parse(err.response.body), {
      statusCode: 500,
      code: 'UND_ERR_CONNECT_TIMEOUT',
      error: 'Internal Server Error',
      message: 'Connect Timeout Error'
    })
    return
  }

  t.fail()
}

main()
