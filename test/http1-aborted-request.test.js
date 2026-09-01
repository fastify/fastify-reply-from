'use strict'

const t = require('node:test')
const Fastify = require('fastify')
const http = require('node:http')
const proxyquire = require('proxyquire')

// See https://github.com/fastify/fastify-reply-from/issues/419
// When a client aborts an HTTP/1 request before the upstream target responds,
// reply-from must destroy the late upstream stream instead of forwarding it.
t.test('does not forward the upstream response when the HTTP/1 request was aborted', async (t) => {
  t.plan(2)

  const upstreamStream = {
    destroy: t.mock.fn()
  }
  const From = proxyquire('..', {
    './lib/request': function () {
      return {
        request: (_opts, callback) => {
          setImmediate(() => {
            callback(null, {
              headers: {},
              statusCode: 200,
              stream: upstreamStream
            })
          })
        },
        close: () => {}
      }
    }
  })

  const instance = Fastify()
  t.after(() => instance.close())

  let onResponseCalled = false
  instance.register(From, { base: 'http://upstream.invalid' })
  instance.get('/', (_request, reply) => {
    reply.from('/', {
      rewriteRequestHeaders (request, headers) {
        request.raw.destroy()
        return headers
      },
      onResponse () {
        onResponseCalled = true
      }
    })
  })

  await instance.listen({ port: 0 })

  await new Promise((resolve) => {
    const req = http.get({
      host: 'localhost',
      port: instance.server.address().port,
      path: '/'
    })
    req.on('error', resolve)
    req.on('close', resolve)
  })

  t.assert.strictEqual(upstreamStream.destroy.mock.callCount(), 1)
  t.assert.strictEqual(onResponseCalled, false, 'onResponse must not run for an aborted request')
})
