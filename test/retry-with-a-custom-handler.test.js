'use strict'

const { test } = require('tap')
const Fastify = require('fastify')
const From = require('..')
const http = require('node:http')
const got = require('got')

function serverWithCustomError (stopAfter, statusCodeToFailOn, closeSocket) {
  let requestCount = 0
  return http.createServer((req, res) => {
    if (requestCount++ < stopAfter) {
      if (closeSocket) req.socket.end()
      res.statusCode = statusCodeToFailOn
      res.setHeader('Content-Type', 'text/plain')
      return res.end('This Service is Unavailable')
    } else {
      res.statusCode = 205
      res.setHeader('Content-Type', 'text/plain')
      return res.end(`Hello World ${requestCount}!`)
    }
  })
}

async function setupServer (t, fromOptions = {}, statusCodeToFailOn = 500, stopAfter = 4, closeSocket = false) {
  const target = serverWithCustomError(stopAfter, statusCodeToFailOn, closeSocket)

  await target.listen({ port: 0 })
  t.teardown(target.close.bind(target))

  const instance = Fastify()
  instance.register(From, {
    base: `http://localhost:${target.address().port}`
  })

  instance.get('/', (request, reply) => {
    reply.from(`http://localhost:${target.address().port}`, fromOptions)
  })

  t.teardown(instance.close.bind(instance))
  await instance.listen({ port: 0 })

  return {
    instance
  }
}

test('a 500 status code with no custom handler should fail', async (t) => {
  const { instance } = await setupServer(t)

  let errorMessage
  try {
    await got.get(`http://localhost:${instance.server.address().port}`, { retry: 0 })
  } catch (error) {
    errorMessage = error.message
  }

  t.equal(errorMessage, 'Response code 500 (Internal Server Error)')
})

test("a server 500's with a custom handler and should revive", async (t) => {
  const customRetryLogic = ({ req, res, err, getDefaultDelay }) => {
    const defaultDelay = getDefaultDelay()
    if (defaultDelay) return defaultDelay

    if (res && res.statusCode === 500 && req.method === 'GET') {
      return 300
    }
    return null
  }

  const { instance } = await setupServer(t, { customRetry: { handler: customRetryLogic, retries: 10 } })

  const res = await got.get(`http://localhost:${instance.server.address().port}`, { retry: 0 })

  t.equal(res.headers['content-type'], 'text/plain')
  t.equal(res.statusCode, 205)
  t.equal(res.body.toString(), 'Hello World 5!')
})

test('custom retry does not invoke the default delay causing a 503', async (t) => {
  // the key here is our customRetryHandler doesn't register the deefault handler and as a result it doesn't work
  const customRetryLogic = ({ req, res, err, getDefaultDelay }) => {
    if (res && res.statusCode === 500 && req.method === 'GET') {
      return 300
    }
    return null
  }

  const { instance } = await setupServer(t, { customRetry: { handler: customRetryLogic, retries: 10 } }, 503)

  let errorMessage
  try {
    await got.get(`http://localhost:${instance.server.address().port}`, { retry: 0 })
  } catch (error) {
    errorMessage = error.message
  }

  t.equal(errorMessage, 'Response code 503 (Service Unavailable)')
})

test('custom retry delay functions can invoke the default delay', async (t) => {
  const customRetryLogic = ({ req, res, err, getDefaultDelay }) => {
    // registering the default retry logic for non 500 errors if it occurs
    const defaultDelay = getDefaultDelay()
    if (defaultDelay) return defaultDelay

    if (res && res.statusCode === 500 && req.method === 'GET') {
      return 300
    }

    return null
  }

  const { instance } = await setupServer(t, { customRetry: { handler: customRetryLogic, retries: 10 } }, 503)

  const res = await got.get(`http://localhost:${instance.server.address().port}`, { retry: 0 })

  t.equal(res.headers['content-type'], 'text/plain')
  t.equal(res.statusCode, 205)
  t.equal(res.body.toString(), 'Hello World 5!')
})

test('custom retry delay function inspects the err paramater', async (t) => {
  const customRetryLogic = ({ req, res, err, getDefaultDelay }) => {
    if (err && (err.code === 'UND_ERR_SOCKET' || err.code === 'ECONNRESET')) {
      return 300
    }
    return null
  }

  const { instance } = await setupServer(t, { customRetry: { handler: customRetryLogic, retries: 10 } }, 500, 4, true)

  const res = await got.get(`http://localhost:${instance.server.address().port}`, { retry: 0 })

  t.equal(res.headers['content-type'], 'text/plain')
  t.equal(res.statusCode, 205)
  t.equal(res.body.toString(), 'Hello World 5!')
})
