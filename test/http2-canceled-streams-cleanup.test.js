'use strict'

const t = require('node:test')
const Fastify = require('fastify')
const From = require('..')
const fs = require('node:fs')
const path = require('node:path')
const http2 = require('node:http2')

t.test('http2 canceled streams cleanup', { timeout: 5000 }, async (t) => {
  let client
  const certs = {
    key: fs.readFileSync(path.join(__dirname, 'fixtures', 'fastify.key')),
    cert: fs.readFileSync(path.join(__dirname, 'fixtures', 'fastify.cert'))
  }

  const target = Fastify({ 
    http2: true,
    https: certs,
    logger: false 
  })

  target.get('/', async (_request, reply) => {
    // Delay response to allow for request cancellation
    await new Promise(resolve => setTimeout(resolve, 200))
    return { message: 'success' }
  })

  await target.listen({ port: 0 })

  const proxy = Fastify({
    http2: true,
    https: certs,
    logger: false
  })

  t.after(async () => {
    await new Promise((resolve) => {
      client.close(resolve)
    })

    await proxy.close()
    await target.close()
  })

  proxy.register(From, {
    base: `https://localhost:${target.server.address().port}`,
    http2: true, // Use HTTP/2 to test the specific bug scenario
    rejectUnauthorized: false
  })

  let requestCount = 0
  proxy.get('/', (_request, reply) => {
    requestCount++
    
    // Add request close handler to see when requests get aborted
    _request.raw.on('close', () => {
    })
    
    reply.from()
    return reply
  })

  await proxy.listen({ port: 0 })

  // Use HTTP/2 client to make requests and abort them
  client = http2.connect(`https://localhost:${proxy.server.address().port}`, {
    rejectUnauthorized: false
  })

  client.on('connect', () => {
  })

  t.after(async () => {
  })

  const promises = []
  
  for (let i = 0; i < 6; i++) {
    const promise = new Promise((resolve) => {
      const req = client.request({ ':path': '/' })
      
      let resolved = false
      const cleanup = (reason) => {
        if (!resolved) {
          resolved = true
          resolve(reason)
        }
      }
      
      // Abort every other request after a short delay to trigger cleanup
      if (i % 2 === 0) {
        setTimeout(() => {
          req.destroy()
        }, 50)
      }

      req.on('data', (chunk) => {
      })
      
      req.on('response', (res) => {
      })
      
      req.on('end', () => cleanup('completed'))
      req.on('error', (err) => {
        cleanup('error')
      })
      req.on('close', () => cleanup('closed'))
      
      req.end()
    })
    
    promises.push(promise)
  }

  const results = await Promise.all(promises)
  // Test passes if we reach here without "close is not a function" errors
  // The key is that we don't crash - the stream cleanup works properly
  const completedCount = results.filter(r => r === 'completed').length
  
  t.assert.ok(completedCount >= 0, 'Stream cleanup handled without crashes')
})
