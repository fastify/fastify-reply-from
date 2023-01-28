'use strict'

const t = require('tap')
const Fastify = require('fastify')
const http = require('http')
const get = require('simple-get').concat
const undici = require('undici')
const From = require('..')
undici.setGlobalDispatcher(new undici.Agent())
t.plan(8)

const instance = Fastify()
t.teardown(instance.close.bind(instance))

const target = http.createServer((req, res) => {
  res.statusCode = 200
  res.end('hello world')
})

instance.get('/', (request, reply) => {
  reply.from()
})

t.teardown(target.close.bind(target))

target.listen({ port: 0 }, (err) => {
  t.error(err)

  instance.register(From, {
    base: `http://localhost:${target.address().port}`,
    globalAgent: true,
    undici: {}
  })

  instance.listen({ port: 0 }, (err) => {
    t.error(err)

    get(
      `http://localhost:${instance.server.address().port}`,
      (err, res, data) => {
        t.error(err)
        t.equal(res.statusCode, 200)
        t.equal(data.toString(), 'hello world')

        get(
          `http://localhost:${instance.server.address().port}`,
          (err, res, data) => {
            t.error(err)
            t.equal(res.statusCode, 200)
            t.equal(data.toString(), 'hello world')
          }
        )
      }
    )
  })
})
