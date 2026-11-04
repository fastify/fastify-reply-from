'use strict'

const t = require('node:test')
const Fastify = require('fastify')
const From = require('..')
const fs = require('node:fs')
const path = require('node:path')
const http2 = require('node:http2')
const { once } = require('node:events')
const { setTimeout: sleep } = require('node:timers/promises')

const certs = {
  key: fs.readFileSync(path.join(__dirname, 'fixtures', 'localhost.key')),
  cert: fs.readFileSync(path.join(__dirname, 'fixtures', 'localhost.cert'))
}
const { HTTP2_HEADER_STATUS, HTTP2_HEADER_PATH, NGHTTP2_CANCEL } = http2.constants

t.test('cancels the upstream http2 stream when the client aborts mid-response', async (t) => {
  const target = http2.createSecureServer(certs)
  const upstreamClosed = new Promise((resolve) => {
    target.on('stream', (stream) => {
      stream.on('error', () => {})
      stream.on('close', () => resolve(stream.rstCode))
      stream.respond({ [HTTP2_HEADER_STATUS]: 200 })
      // keep the response open: only the proxy can end it
      stream.write('first chunk')
    })
  })
  target.listen(0)
  await once(target, 'listening')

  const instance = Fastify({ http2: true, https: certs })
  instance.register(From, {
    base: `https://localhost:${target.address().port}`,
    http2: { sessionOptions: { ca: certs.cert } }
  })
  instance.get('/', (_request, reply) => {
    reply.from()
  })
  const url = await instance.listen({ port: 0 })

  const client = http2.connect(url, { rejectUnauthorized: false })
  t.after(async () => {
    client.destroy()
    await instance.close()
    target.close()
  })

  const req = client.request({ [HTTP2_HEADER_PATH]: '/' })
  req.on('error', () => {})
  await once(req, 'data')
  req.close(NGHTTP2_CANCEL)

  const rstCode = await Promise.race([upstreamClosed, sleep(5000, 'upstream stream still open')])
  t.assert.strictEqual(rstCode, NGHTTP2_CANCEL)
})
