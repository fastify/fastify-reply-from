'use strict'

const t = require('node:test')
const Fastify = require('fastify')
const From = require('..')
const http = require('node:http')
const { once } = require('events')

t.test('http1 aborted request handling (issue #428)', async (t) => {
  const instance = Fastify()

  t.after(() => instance.close())

  const target = http.createServer()

  target.on('request', (req, response) => {
    // Simulate a slow response to ensure we can abort during processing
    setTimeout(() => {
      if (!response.destroyed) {
        response.writeHead(200, { 'Content-Type': 'text/plain' })
        response.end('ok')
      }
    }, 100)
  })

  instance.get('/', (request, reply) => {
    reply.from()
  })

  t.after(() => target.close())

  target.listen()
  await once(target, 'listening')

  instance.register(From, {
    base: `http://localhost:${target.address().port}`
  })

  const url = await instance.listen({ port: 0 })

  // Test multiple aborted requests to ensure the fix works
  const promises = []
  for (let i = 0; i < 10; i++) {
    const promise = new Promise((resolve, reject) => {
      const req = http.request(url + '/', (res) => {
        res.on('data', () => {})
        res.on('end', resolve)
        res.on('error', resolve)
      })

      req.on('error', (err) => {
        // With the fix, we should NOT get "close is not a function" errors
        if (err.message && err.message.includes('close is not a function')) {
          reject(new Error('Issue #428 still exists: ' + err.message))
        }
        // Expected errors from aborting requests are ok
        resolve()
      })

      req.end()

      // Abort every other request to test the aborted condition
      if (i % 2 === 0) {
        setTimeout(() => {
          req.destroy()
        }, 50)
      }
    })
    promises.push(promise)
  }

  // Wait for all requests - if the fix works, none should throw "close is not a function"
  await Promise.all(promises)

  instance.close()
  target.close()
})
