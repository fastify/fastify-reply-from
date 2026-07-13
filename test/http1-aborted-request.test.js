'use strict'

const t = require('node:test')
const Fastify = require('fastify')
const From = require('..')
const http = require('node:http')
const { once } = require('node:events')

// See https://github.com/fastify/fastify-reply-from/issues/419
// When a client aborts an HTTP/1 request before the upstream target responds,
// reply-from must not attempt to forward the (late) upstream response: it should
// neither invoke the onResponse callback nor pipe the upstream body to the
// already-closed reply. The equivalent HTTP/2 path was already handled; this
// covers the HTTP/1 path.
t.test('does not forward the upstream response when the HTTP/1 request was aborted', async (t) => {
  t.plan(1)

  // Target that delays its response long enough for the client to abort first.
  const target = http.createServer((_req, res) => {
    setTimeout(() => {
      res.statusCode = 200
      res.end('hello world')
    }, 500)
  })
  t.after(() => target.close())
  target.listen({ port: 0 })
  await once(target, 'listening')

  const instance = Fastify()
  t.after(() => instance.close())

  let onResponseCalled = false
  instance.register(From)
  instance.get('/', (_request, reply) => {
    reply.from(`http://localhost:${target.address().port}`, {
      onResponse (_req, replyInner, res) {
        onResponseCalled = true
        replyInner.send(res.stream)
      }
    })
  })

  instance.listen({ port: 0 })
  await once(instance.server, 'listening')

  await new Promise((resolve) => {
    const req = http.request({
      host: 'localhost',
      port: instance.server.address().port,
      path: '/'
    }, (res) => { res.resume() })
    req.on('error', () => {})
    req.end()
    // Abort well before the target responds.
    setTimeout(() => req.destroy(), 50)
    // Wait past the target's response so any (buggy) forwarding would have happened.
    setTimeout(resolve, 800)
  })

  t.assert.strictEqual(onResponseCalled, false, 'onResponse must not run for an aborted request')
})
