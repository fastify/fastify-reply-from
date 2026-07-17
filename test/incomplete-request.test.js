'use strict'

const { once } = require('node:events')
const http = require('node:http')
const net = require('node:net')
const t = require('node:test')
const Fastify = require('fastify')
const From = require('..')

for (const [name, options] of [
  ['undici', {}],
  ['node:http', { undici: false }]
]) {
  t.test(`closes the downstream connection when ${name} responds before the request is complete`, async (t) => {
    const target = http.createServer((_req, res) => {
      res.end('early')
    })
    const instance = Fastify()

    t.after(async () => {
      instance.server.closeAllConnections()
      target.closeAllConnections()
      await instance.close()
      if (target.listening) await new Promise(resolve => target.close(resolve))
    })

    await new Promise(resolve => target.listen({ port: 0 }, resolve))

    instance.register(From, options)
    instance.addContentTypeParser('application/octet-stream', function (_request, payload, done) {
      done(null, payload)
    })
    instance.post('/', (_request, reply) => {
      reply.from(`http://localhost:${target.address().port}`)
    })
    await instance.listen({ port: 0 })

    const socket = net.connect(instance.server.address().port, '127.0.0.1')
    t.after(() => socket.destroy())
    await once(socket, 'connect')

    const responsePromise = new Promise((resolve, reject) => {
      let response = ''
      const timeout = setTimeout(() => {
        reject(new Error('downstream connection was not closed'))
      }, 5000)

      socket.on('data', chunk => {
        response += chunk.toString('latin1')
      })
      socket.once('error', err => {
        clearTimeout(timeout)
        reject(err)
      })
      socket.once('close', () => {
        clearTimeout(timeout)
        resolve(response)
      })
    })

    socket.write([
      'POST / HTTP/1.1',
      'Host: localhost',
      'Content-Type: application/octet-stream',
      'Content-Length: 1048576',
      'Connection: keep-alive',
      '',
      'a'
    ].join('\r\n'))

    const response = await responsePromise
    t.assert.match(response, /^HTTP\/1\.1 200 OK\r\n/)
    t.assert.match(response, /\r\nconnection: close\r\n/i)
    t.assert.match(response, /\r\n\r\nearly$/)
  })

  t.test(`keeps the downstream connection reusable after ${name} consumes the request`, async (t) => {
    const target = http.createServer((req, res) => {
      req.resume()
      req.on('end', () => res.end('complete'))
    })
    const agent = new http.Agent({ keepAlive: true, maxSockets: 1 })
    const instance = Fastify()

    t.after(async () => {
      agent.destroy()
      instance.server.closeAllConnections()
      target.closeAllConnections()
      await instance.close()
      if (target.listening) await new Promise(resolve => target.close(resolve))
    })

    await new Promise(resolve => target.listen({ port: 0 }, resolve))

    instance.register(From, options)
    instance.addContentTypeParser('application/octet-stream', function (_request, payload, done) {
      done(null, payload)
    })
    instance.post('/', (_request, reply) => {
      reply.from(`http://localhost:${target.address().port}`)
    })
    await instance.listen({ port: 0 })

    const first = await makeRequest(instance.server.address().port, agent, 'first')
    t.assert.notStrictEqual(first.headers.connection, 'close')

    const second = await makeRequest(instance.server.address().port, agent, 'second')
    t.assert.strictEqual(second.reusedSocket, true)
    t.assert.strictEqual(second.body, 'complete')
  })
}

function makeRequest (port, agent, body) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      agent,
      method: 'POST',
      hostname: '127.0.0.1',
      port,
      path: '/',
      headers: {
        'content-length': Buffer.byteLength(body),
        'content-type': 'application/octet-stream'
      }
    }, res => {
      let responseBody = ''
      res.setEncoding('utf8')
      res.on('data', chunk => {
        responseBody += chunk
      })
      res.on('end', () => {
        resolve({
          body: responseBody,
          headers: res.headers,
          reusedSocket: req.reusedSocket
        })
      })
    })
    req.on('error', reject)
    req.end(body)
  })
}
