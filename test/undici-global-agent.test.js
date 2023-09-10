'use strict'

const { test } = require('tap')
const Fastify = require('fastify')
const http = require('node:http')
const get = require('simple-get').concat
const undici = require('undici')
const From = require('..')

test('undici global agent is used, but not destroyed', async (t) => {
  const mockAgent = new undici.Agent()
  mockAgent.destroy = () => {
    t.fail()
  }
  undici.setGlobalDispatcher(mockAgent)
  const instance = Fastify()

  t.teardown(instance.close.bind(instance))

  const target = http.createServer((req, res) => {
    res.statusCode = 200
    res.end()
  })

  instance.get('/', (request, reply) => {
    reply.from()
  })

  t.teardown(target.close.bind(target))

  const executionFlow = () => new Promise((resolve) => {
    target.listen({ port: 0 }, (err) => {
      t.error(err)

      instance.register(From, {
        base: `http://localhost:${target.address().port}`,
        globalAgent: true
      })

      instance.listen({ port: 0 }, (err) => {
        t.error(err)

        get(
          `http://localhost:${instance.server.address().port}`,
          (err, res) => {
            t.error(err)
            t.equal(res.statusCode, 200)

            get(
              `http://localhost:${instance.server.address().port}`,
              (err, res) => {
                t.error(err)
                t.equal(res.statusCode, 200)
                resolve()
              }
            )
          }
        )
      })
    })
  })

  await executionFlow()

  target.close()
})
