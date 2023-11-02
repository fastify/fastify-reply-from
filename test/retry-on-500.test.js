'use strict'

const { test } = require('tap')
const Fastify = require('fastify')
const From = require('..')
const http = require('node:http')
const got = require('got')

function createTargetServer (withRetryAfterHeader, stopAfter = 2) {
  let requestCount = 0
  return http.createServer((req, res) => {
    if (requestCount++ < stopAfter) {
      res.statusCode = 500
      res.setHeader('Content-Type', 'text/plain')

      if (withRetryAfterHeader) {
        res.setHeader('Retry-After', 100) // 100 ms
      }

      return res.end('This Service is Unavailable')
    }

    res.statusCode = 200
    res.setHeader('Content-Type', 'text/plain')
    return res.end(`Hello World After ${requestCount}`)
  })
}

test("custom retries on the server", async function (t) {
  const customRetryLogic = ({...opts}) => {
    if (opts.res && opts.res.statusCode === 500 && opts.req.method === 'GET'){
      return 100
    }
    return null
  }

  const target = createTargetServer()
  await target.listen({ port: 0 })
  t.teardown(target.close.bind(target))

  const instance = Fastify()
  instance.register(From, {
    base: `http://localhost:${target.address().port}`
  })

  instance.get('/', (request, reply) => {
    console.log('getting reply from broken serve')
    reply.from(`http://localhost:${target.address().port}`, {
      customRetryHandler: { retries: 10, retryHandlerImpl: customRetryLogic }
    })
  })

  t.teardown(instance.close.bind(instance))
  await instance.listen({ port: 0 })

  // ----- End Registering The Fastify Server ---

  // making a request to the server we setup through fastify
  const res = await got.get(`http://localhost:${instance.server.address().port}`, { retry: 0 })
  console.log('request to server', { statusCode: res.statusCode, body: res.body.toString() })
})
