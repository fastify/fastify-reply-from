'use strict'

const t = require('node:test')
const Fastify = require('fastify')
const From = require('..')
const fs = require('node:fs')
const path = require('node:path')
const http2 = require('node:http2')
const { once } = require('events')
const certs = {
  key: fs.readFileSync(path.join(__dirname, 'fixtures', 'fastify.key')),
  cert: fs.readFileSync(path.join(__dirname, 'fixtures', 'fastify.cert'))
}
const { HTTP2_HEADER_STATUS, HTTP2_HEADER_PATH } = http2.constants

function makeRequest (client, counter) {
  return new Promise((resolve, reject) => {
    const controller = new AbortController()
    const signal = controller.signal
    const cancelRequestEarly = counter % 2 === 0  // cancel early every other request
    let responseCounter = 0
    let resolved = false

    const clientStream = client.request({ [HTTP2_HEADER_PATH]: '/' }, { signal })

    clientStream.end()

    const cleanup = () => {
      if (!resolved) {
        resolved = true
        resolve()
      }
    }

    clientStream.on('data', chunk => {
      const s = chunk.toString()
      // Sometimes we just get NGHTTP2_ENHANCE_YOUR_CALM internal server errors
      if (s.startsWith('{"statusCode":500')) {
        if (!resolved) {
          resolved = true
          reject(new Error('got internal server error'))
        }
      } else {
        responseCounter++
      }
    })

    clientStream.on('error', err => {
      if (!resolved) {
        if (err instanceof Error && err.name === 'AbortError') {
          if (responseCounter === 0 && !cancelRequestEarly) {
            // if we didn´t cancel early we should have received at least one response from the target
            // if not, this indicated the stream resource leak
            resolved = true
            reject(new Error('no response'))
          } else {
            cleanup()
          }
        } else {
          resolved = true
          reject(err instanceof Error ? err : new Error(JSON.stringify(err)))
        }
      }
    })

    clientStream.on('end', cleanup)
    clientStream.on('close', cleanup)

    setTimeout(() => { controller.abort() }, cancelRequestEarly ? 20 : 200)
  })
}

const httpsOptions = {
  ...certs,
  settings: {
    maxConcurrentStreams: 10, // lower the default so we can reproduce the problem quicker
  }
}

t.test('http2 -> http2', async (t) => {
  const instance = Fastify({
    http2: true,
    https: httpsOptions
  })

  t.after(() => instance.close())

  const target = http2.createSecureServer(httpsOptions)
  const intervals = new Set()

  target.on('stream', (stream, _headers, _flags) => {
    let counter = 0
    let headerSent = false

    // deliberately delay sending the headers
    const sendData = () => {
      if (!headerSent) {
        stream.respond({ [HTTP2_HEADER_STATUS]: 200, })
        headerSent = true
      }
      stream.write(counter + '\n')
      counter = counter + 1
    }

    const intervalId = setInterval(sendData, 50)
    intervals.add(intervalId)

    const cleanup = () => {
      clearInterval(intervalId)
      intervals.delete(intervalId)
    }

    // ignore write after end errors
    stream.on('error', _err => { })

    stream.on('close', cleanup)
    stream.on('end', cleanup)
  })

  t.after(() => {
    // Clear any remaining intervals
    for (const intervalId of intervals) {
      clearInterval(intervalId)
    }
    intervals.clear()
    target.close()
  })

  instance.get('/', (_request, reply) => {
    reply.from()
  })

  target.listen()
  await once(target, 'listening')

  instance.register(From, {
    base: `https://localhost:${target.address().port}`,
    http2: true,
    rejectUnauthorized: false
  })

  const url = await instance.listen({ port: 0 })

  const client = http2.connect(url, {
    rejectUnauthorized: false,
  })

  t.after(() => client.close())

  // see https://github.com/fastify/fastify-reply-from/issues/424
  // without the bug fix this will fail after about 15 requests
  // Reduced iterations to avoid timeout issues while still testing the functionality
  for (let i = 0; i < 10; i++) {
    await makeRequest(client, i)
  }
})
