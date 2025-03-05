'use strict'

const { test } = require('tap')
const Fastify = require('fastify')
const From = require('..')
const http = require('node:http')

test('http global agent is used, but not destroyed', async (t) => {
  http.globalAgent.destroy = () => {
    t.fail()
  }
  const instance = Fastify()
  t.teardown(instance.close.bind(instance))
  instance.get('/', (_request, reply) => {
    reply.from()
  })

  const target = http.createServer((req, res) => {
    t.pass('request proxied')
    t.equal(req.method, 'GET')
    t.equal(req.url, '/')
    res.statusCode = 200
    res.end()
  })
  t.teardown(target.close.bind(target))

  const executionFlow = () => new Promise((resolve) => {
    target.listen({ port: 0 }, (err) => {
      t.error(err)

      instance.register(From, {
        base: `http://localhost:${target.address().port}`,
        globalAgent: true,
        http: {
        }
      })

      instance.listen({ port: 0 }, async (err) => {
        t.error(err)

        const result = await fetch(`http://localhost:${instance.server.address().port}`)

        t.equal(result.status, 200)
        resolve()
      })
    })
  })

  await executionFlow()

  target.close()
})
