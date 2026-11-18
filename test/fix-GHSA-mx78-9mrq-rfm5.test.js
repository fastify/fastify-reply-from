'use strict'

// The Content-Length sent upstream must match the body that is actually
// written. A Content-Length inherited from the client for a body that is not
// forwarded leaves the upstream waiting for bytes that never come, and it reads
// the next request on that keep-alive connection as the rest of the body.

const t = require('node:test')
const net = require('node:net')
const http = require('node:http')
const Fastify = require('fastify')
const From = require('..')

const transports = [
  { name: 'core http', opts: { http: {} } },
  { name: 'undici', opts: {} }
]

const cases = [
  { name: 'GET with a body', method: 'GET', type: 'text/plain', body: 'a'.repeat(300), expected: '' },
  { name: 'HEAD with a body', method: 'HEAD', type: 'text/plain', body: 'a'.repeat(300), expected: '' },
  { name: 'TRACE with a body', method: 'TRACE', type: 'text/plain', body: 'a'.repeat(300), expected: '' },
  { name: 'JSON null', method: 'POST', type: 'application/json', body: 'null' + ' '.repeat(300), expected: 'null' },
  { name: 'JSON 0', method: 'POST', type: 'application/json', body: '0', expected: '0' },
  { name: 'JSON false', method: 'POST', type: 'application/json', body: 'false', expected: 'false' },
  { name: 'JSON empty string', method: 'POST', type: 'application/json', body: '""', expected: '""' }
]

function send (port, { method = 'GET', path = '/', type, body }) {
  const headers = {}
  if (body !== undefined) {
    headers['content-type'] = type
    headers['content-length'] = Buffer.byteLength(body)
  }
  return new Promise((resolve, reject) => {
    const req = http.request({ host: 'localhost', port, method, path, headers, agent: false }, res => {
      let data = ''
      res.setEncoding('utf8')
      res.on('data', chunk => { data += chunk })
      res.on('end', () => resolve({ statusCode: res.statusCode, body: data }))
    })
    req.on('error', reject)
    req.end(body)
  })
}

// Records the Content-Length the proxy announces and the body bytes it writes.
// It waits a short while only for announced bytes that do not arrive, so that
// a missing body is reported instead of hanging the test.
function createRecordingTarget () {
  const seen = []
  const server = net.createServer(socket => {
    let data = Buffer.alloc(0)
    let head = null
    let contentLength = null
    let responded = false
    const timer = setTimeout(respond, 500)

    socket.on('error', () => {})
    socket.on('data', chunk => {
      data = Buffer.concat([data, chunk])
      if (head === null) {
        const end = data.indexOf('\r\n\r\n')
        if (end === -1) return
        head = data.subarray(0, end).toString('latin1')
        data = data.subarray(end + 4)
        const match = /\r\ncontent-length: *(\d+)/i.exec(head)
        contentLength = match ? Number(match[1]) : null
      }
      if (data.length >= (contentLength ?? 0)) respond()
    })

    function respond () {
      if (responded || head === null) return
      responded = true
      clearTimeout(timer)
      const method = head.slice(0, head.indexOf(' '))
      seen.push({ method, contentLength, body: data.toString('latin1') })
      socket.end('HTTP/1.1 200 OK\r\ncontent-length: 2\r\nconnection: close\r\n\r\n' + (method === 'HEAD' ? '' : 'ok'))
    }
  })
  return { server, seen }
}

for (const transport of transports) {
  t.test(`GHSA-mx78-9mrq-rfm5: content-length matches the forwarded body (${transport.name})`, async (t) => {
    const { server: target, seen } = createRecordingTarget()
    await new Promise(resolve => target.listen(0, resolve))
    t.after(() => target.close())

    const instance = Fastify()
    t.after(() => instance.close())
    instance.register(From, { base: `http://localhost:${target.address().port}`, ...transport.opts })
    instance.route({
      method: ['GET', 'HEAD', 'TRACE', 'POST'],
      url: '/',
      handler: (_request, reply) => { reply.from() }
    })
    await instance.listen({ port: 0 })
    const port = instance.server.address().port

    for (const c of cases) {
      await t.test(c.name, async (t) => {
        seen.length = 0
        const { statusCode } = await send(port, c)
        t.assert.strictEqual(statusCode, 200)
        t.assert.strictEqual(seen.length, 1)
        const [observed] = seen
        t.assert.strictEqual(observed.method, c.method)
        t.assert.strictEqual(observed.body, c.expected)
        if (observed.contentLength !== null) {
          t.assert.strictEqual(observed.contentLength, Buffer.byteLength(observed.body))
        }
      })
    }
  })
}

t.test('GHSA-mx78-9mrq-rfm5: a body that is not forwarded does not desync the upstream connection', async (t) => {
  const target = http.createServer((req, res) => {
    // Answer before reading the body, like auth checks or route rejections do.
    res.end(`${req.method} ${req.url}`)
  })
  await new Promise(resolve => target.listen(0, resolve))
  t.after(() => target.close())

  const instance = Fastify()
  t.after(() => instance.close())
  instance.register(From, {
    base: `http://localhost:${target.address().port}`,
    http: { requestOptions: { timeout: 2000 } }
  })
  instance.get('/*', (_request, reply) => { reply.from() })
  instance.post('/*', (_request, reply) => { reply.from() })
  await instance.listen({ port: 0 })
  const port = instance.server.address().port

  const poisons = [
    { method: 'GET', path: '/first', type: 'text/plain', body: 'a'.repeat(1000) },
    { method: 'POST', path: '/first', type: 'application/json', body: 'null' + ' '.repeat(1000) }
  ]

  for (const poison of poisons) {
    const first = await send(port, poison)
    t.assert.strictEqual(first.statusCode, 200)
    t.assert.strictEqual(first.body, `${poison.method} /first`)

    // Sent on the same keep-alive upstream connection as the first request.
    const second = await send(port, { path: '/second' })
    t.assert.strictEqual(second.statusCode, 200)
    t.assert.strictEqual(second.body, 'GET /second')
  }
})
