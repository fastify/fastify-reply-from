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
    await got.get(`http://localhost:${instance.server.address().port}`, { retry: 3 })
  } catch (error) {
    errorMessage = error.message
  }

  t.equal(errorMessage, 'Response code 500 (Internal Server Error)')
})

test("a server 500's with a custom handler and should revive", async (t) => {
  const customRetryLogic = ({ req, res, err, attempt, getDefaultDelay }) => {
    const defaultDelay = getDefaultDelay()
    if (defaultDelay) return defaultDelay

    if (res && res.statusCode === 500 && req.method === 'GET') {
      return 0.1
    }
    return null
  }

  const { instance } = await setupServer(t, { retryDelay: customRetryLogic })

  const res = await got.get(`http://localhost:${instance.server.address().port}`, { retry: 5 })

  t.equal(res.headers['content-type'], 'text/plain')
  t.equal(res.statusCode, 205)
  t.equal(res.body.toString(), 'Hello World 5!')
})

test('custom retry does not invoke the default delay causing a 501', async (t) => {
  // the key here is our retryDelay doesn't register the deefault handler and as a result it doesn't work
  const customRetryLogic = ({ req, res, err, attempt, getDefaultDelay }) => {
    if (res && res.statusCode === 500 && req.method === 'GET') {
      return 0
    }
    return null
  }

  const { instance } = await setupServer(t, { retryDelay: customRetryLogic }, 501)

  let errorMessage
  try {
    await got.get(`http://localhost:${instance.server.address().port}`, { retry: 5 })
  } catch (error) {
    errorMessage = error.message
  }

  t.equal(errorMessage, 'Response code 501 (Not Implemented)')
})

test('custom retry delay functions can invoke the default delay', async (t) => {
  const customRetryLogic = ({ req, res, err, attempt, getDefaultDelay }) => {
    // registering the default retry logic for non 500 errors if it occurs
    const defaultDelay = getDefaultDelay()
    if (defaultDelay) return defaultDelay

    if (res && res.statusCode === 500 && req.method === 'GET') {
      return 0.1
    }

    return null
  }

  const { instance } = await setupServer(t, { retryDelay: customRetryLogic }, 500)

  const res = await got.get(`http://localhost:${instance.server.address().port}`, { retry: 5 })

  t.equal(res.headers['content-type'], 'text/plain')
  t.equal(res.statusCode, 205)
  t.equal(res.body.toString(), 'Hello World 5!')
})

test('custom retry delay function inspects the err paramater', async (t) => {
  const customRetryLogic = ({ req, res, err, attempt, getDefaultDelay }) => {
    if (err && (err.code === 'UND_ERR_SOCKET' || err.code === 'ECONNRESET')) {
      return 0.1
    }
    return null
  }

  const { instance } = await setupServer(t, { retryDelay: customRetryLogic }, 500, 4, true)

  const res = await got.get(`http://localhost:${instance.server.address().port}`, { retry: 5 })

  t.equal(res.headers['content-type'], 'text/plain')
  t.equal(res.statusCode, 205)
  t.equal(res.body.toString(), 'Hello World 5!')
})

test('we can exceed our retryCount and introspect attempts independently', async (t) => {
  const attemptCounter = []

  const customRetryLogic = ({ req, res, err, attempt, getDefaultDelay }) => {
    attemptCounter.push(attempt)

    if (err && (err.code === 'UND_ERR_SOCKET' || err.code === 'ECONNRESET')) {
      return 0.1
    }

    return null
  }

  const { instance } = await setupServer(t, { retryDelay: customRetryLogic }, 500, 4, true)

  const res = await got.get(`http://localhost:${instance.server.address().port}`, { retry: 5 })

  t.match(attemptCounter, [0, 1, 2, 3, 4])
  t.equal(res.headers['content-type'], 'text/plain')
  t.equal(res.statusCode, 205)
  t.equal(res.body.toString(), 'Hello World 5!')
})

test('we handle our retries based on the retryCount', async (t) => {
  const attemptCounter = []
  const customRetryLogic = ({ req, res, err, attempt, getDefaultDelay, retriesCount }) => {
    if (retriesCount < attempt) {
      return null
    }

    if (res && res.statusCode === 500 && req.method === 'GET') {
      attemptCounter.push(attempt)
      return 0.1
    }
    return null
  }

  const { instance } = await setupServer(t, { retryDelay: customRetryLogic, retriesCount: 2 }, 500)

  const res = await got.get(`http://localhost:${instance.server.address().port}`, { retry: 5 })

  t.match(attemptCounter, [0, 1])
  t.equal(res.headers['content-type'], 'text/plain')
  t.equal(res.statusCode, 205)
  t.equal(res.body.toString(), 'Hello World 5!')
})
