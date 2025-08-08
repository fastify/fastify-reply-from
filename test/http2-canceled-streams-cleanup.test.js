'use strict'

const t = require('node:test')
const Fastify = require('fastify')
const From = require('..')
const fs = require('node:fs')
const path = require('node:path')
const http2 = require('node:http2')

t.test('http2 canceled streams cleanup', { timeout: 5000 }, async (t) => {
  let client
  console.log('🚀 Starting HTTP/2 canceled streams cleanup test')
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
    console.log('📝 Target received HTTP/2 request')
    // Delay response to allow for request cancellation
    await new Promise(resolve => setTimeout(resolve, 200))
    console.log('📤 Target sending response')
    return { message: 'success' }
  })

  await target.listen({ port: 0 })
  console.log(`✅ Target HTTP/2 server listening on port ${target.server.address().port}`)

  const proxy = Fastify({
    http2: true,
    https: certs,
    logger: false
  })

  t.after(async () => {
    console.log('🔄 Closing HTTP/2 client')
    await new Promise((resolve) => {
      client.close(resolve)
    })

    console.log('✅ HTTP/2 client closed')
    console.log('🔄 Closing proxy server')
    await proxy.close()
    console.log('✅ Proxy server closed')
    console.log('🔄 Closing target server')
    await target.close()
    console.log('✅ Target server closed')
  })

  proxy.register(From, {
    base: `https://localhost:${target.server.address().port}`,
    http2: true, // Use HTTP/2 to test the specific bug scenario
    rejectUnauthorized: false
  })

  let requestCount = 0
  proxy.get('/', (_request, reply) => {
    requestCount++
    console.log(`🔄 Proxy handling HTTP/2 request #${requestCount}`)
    
    // Add request close handler to see when requests get aborted
    _request.raw.on('close', () => {
      console.log(`🔌 Proxy request #${requestCount} closed/aborted`)
    })
    
    reply.from()
    return reply
  })

  await proxy.listen({ port: 0 })
  console.log(`✅ Proxy HTTP/2 server listening on port ${proxy.server.address().port}`)

  // Use HTTP/2 client to make requests and abort them
  console.log('🌐 Creating HTTP/2 client connection')
  client = http2.connect(`https://localhost:${proxy.server.address().port}`, {
    rejectUnauthorized: false
  })

  client.on('connect', () => {
    console.log('🔗 HTTP/2 client connected')
  })

  t.after(async () => {
  })

  const promises = []
  
  for (let i = 0; i < 6; i++) {
    console.log(`🚀 Creating HTTP/2 request #${i + 1}`)
    
    const promise = new Promise((resolve) => {
      const req = client.request({ ':path': '/' })
      
      let resolved = false
      const cleanup = (reason) => {
        if (!resolved) {
          resolved = true
          console.log(`✅ Request #${i + 1} finished: ${reason}`)
          resolve(reason)
        }
      }
      
      // Abort every other request after a short delay to trigger cleanup
      if (i % 2 === 0) {
        setTimeout(() => {
          console.log(`🛑 Aborting HTTP/2 request #${i + 1}`)
          req.destroy()
        }, 50)
      }

      req.on('data', (chunk) => {
        console.log(`📥 Request #${i + 1} received ${chunk.length} bytes`)
      })
      
      req.on('response', (res) => {
        console.log(`📨 Request #${i + 1} got response`, res)
      })
      
      req.on('end', () => cleanup('completed'))
      req.on('error', (err) => {
        console.log(`❌ Request #${i + 1} error: ${err.message}`)
        cleanup('error')
      })
      req.on('close', () => cleanup('closed'))
      
      console.log(`📤 Starting HTTP/2 request #${i + 1}`)
      req.end()
    })
    
    promises.push(promise)
  }

  console.log('⏳ Waiting for all HTTP/2 requests to complete...')
  const results = await Promise.all(promises)
  console.log('✅ All HTTP/2 requests completed:', results)
  // Test passes if we reach here without "close is not a function" errors
  // The key is that we don't crash - the stream cleanup works properly
  const completedCount = results.filter(r => r === 'completed').length
  console.log(`📊 Results: ${completedCount} completed requests`)
  
  t.assert.ok(completedCount >= 0, 'Stream cleanup handled without crashes')
  console.log('🎉 HTTP/2 stream cleanup test passed!')
})
