'use strict'

const assert = require('node:assert/strict')
const http = require('node:http')
const { Readable } = require('node:stream')
const { test } = require('node:test')
const Fastify = require('fastify')
const From = require('..')

const payload = 'chunk-one|chunk-two'

const cases = [
  { method: 'DELETE', incomingFraming: 'chunked', outgoingFraming: 'chunked' },
  { method: 'OPTIONS', incomingFraming: 'chunked', outgoingFraming: 'chunked' },
  { method: 'POST', incomingFraming: 'chunked', outgoingFraming: 'chunked' },
  { method: 'DELETE', incomingFraming: 'content-length', outgoingFraming: 'content-length' },
  { method: 'DELETE', incomingFraming: 'chunked', outgoingFraming: 'content-length', rewriteLength: true }
]

for (const { method, incomingFraming, outgoingFraming, rewriteLength } of cases) {
  test(`core-http preserves a streamed ${method} body (${incomingFraming}${rewriteLength ? ', rewritten length' : ''})`, { timeout: 10000 }, async t => {
    const instance = Fastify({ forceCloseConnections: true })
    instance.register(From, { undici: false })
    instance.addContentTypeParser('application/octet-stream', (_request, stream, done) => {
      done(null, stream)
    })

    const target = http.createServer((request, response) => {
      const chunks = []
      request.on('data', chunk => chunks.push(chunk))
      request.on('end', () => {
        response.setHeader('x-upstream-method', request.method)
        response.setHeader('x-upstream-framing', request.headers['transfer-encoding'] || (request.headers['content-length'] !== undefined ? 'content-length' : 'none'))
        response.end(Buffer.concat(chunks))
      })
    })
    target.on('clientError', (_error, socket) => socket.destroy())

    t.after(async () => {
      target.closeAllConnections()
      await Promise.all([
        instance.close(),
        new Promise(resolve => target.close(resolve))
      ])
    })
    await new Promise((resolve, reject) => {
      target.once('error', reject)
      target.listen(0, '127.0.0.1', resolve)
    })

    instance.route({
      method,
      url: '/',
      handler: (request, reply) => {
        assert.equal(typeof request.body?.pipe, 'function', 'fixture body must remain a stream')
        return reply.from(`http://127.0.0.1:${target.address().port}/`, rewriteLength
          ? {
              rewriteRequestHeaders: (_request, headers) => {
                const rewritten = { ...headers, 'Content-Length': String(Buffer.byteLength(payload)) }
                delete rewritten['transfer-encoding']
                return rewritten
              }
            }
          : undefined)
      }
    })
    await instance.listen({ port: 0, host: '127.0.0.1' })

    const headers = { 'content-type': 'application/octet-stream' }
    if (incomingFraming === 'chunked') headers['transfer-encoding'] = 'chunked'
    else headers['content-length'] = String(Buffer.byteLength(payload))

    const result = await new Promise((resolve, reject) => {
      const request = http.request({
        host: '127.0.0.1',
        port: instance.server.address().port,
        path: '/',
        method,
        agent: false,
        headers
      }, response => {
        const chunks = []
        response.on('data', chunk => chunks.push(chunk))
        response.once('end', () => resolve({
          statusCode: response.statusCode,
          headers: response.headers,
          payload: Buffer.concat(chunks).toString('utf8')
        }))
        response.once('error', reject)
      })
      request.once('error', reject)
      request.setTimeout(2000, () => request.destroy(new Error('local fixture deadline')))
      Readable.from(['chunk-one|', 'chunk-two']).pipe(request)
    })

    assert.equal(result.statusCode, 200)
    assert.equal(result.payload, payload, 'the upstream must receive all streamed body bytes')
    assert.equal(result.headers['x-upstream-method'], method)
    assert.equal(result.headers['x-upstream-framing'], outgoingFraming)
  })
}
