'use strict'

// A body stream that a preParsing hook replaces (for example request
// decompression) no longer matches the client's content-length. Forwarding
// that inherited content-length upstream while writing a different number of
// bytes desyncs the core http connection, the same framing flaw as
// GHSA-mx78-9mrq-rfm5. The proxy must not announce a content-length it does not
// satisfy for such a stream, so it either frames the body itself (chunked) or
// announces the real byte count.
//
// The replaced stream can be shorter than the client's body or, as request
// decompression usually makes it, longer. Longer is the worse case: over core
// http the bytes past the announced length reach the upstream as a new request.

const t = require('node:test')
const net = require('node:net')
const http = require('node:http')
const http2 = require('node:http2')
const zlib = require('node:zlib')
const Fastify = require('fastify')
const From = require('..')

// Records the content-length the proxy announces and the body bytes it writes.
function createRecordingTarget () {
  const seen = []
  const server = net.createServer(socket => {
    let data = Buffer.alloc(0)
    let head = null
    let contentLength = null
    let chunked = false
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
        chunked = /\r\ntransfer-encoding: *chunked/i.test(head)
      }
      const complete = chunked ? data.includes(Buffer.from('0\r\n\r\n')) : data.length >= (contentLength ?? 0)
      if (complete) respond()
    })

    function respond () {
      if (responded || head === null) return
      responded = true
      clearTimeout(timer)
      const body = chunked ? dechunk(data) : data
      seen.push({ contentLength, chunked, written: body.length, body: body.toString('latin1') })
      socket.end('HTTP/1.1 200 OK\r\ncontent-length: 2\r\nconnection: close\r\n\r\nok')
    }
  })
  return { server, seen }
}

// The same record for an HTTP/2 upstream, which frames the body itself.
function createHttp2RecordingTarget () {
  const seen = []
  const server = http2.createServer((req, res) => {
    const chunks = []
    req.on('data', chunk => chunks.push(chunk))
    req.on('end', () => {
      const body = Buffer.concat(chunks)
      const contentLength = req.headers['content-length']
      seen.push({
        contentLength: contentLength === undefined ? null : Number(contentLength),
        chunked: false,
        written: body.length,
        body: body.toString('latin1')
      })
      res.end('ok')
    })
  })
  return { server, seen }
}

function dechunk (buf) {
  let out = Buffer.alloc(0)
  let rest = buf
  while (rest.length) {
    const nl = rest.indexOf('\r\n')
    if (nl === -1) break
    const size = parseInt(rest.subarray(0, nl).toString('latin1'), 16)
    if (!size) break
    out = Buffer.concat([out, rest.subarray(nl + 2, nl + 2 + size)])
    rest = rest.subarray(nl + 2 + size + 2)
  }
  return out
}

// With `split`, the second half of the body is sent a little later, so the
// request stream has not ended yet when the proxy forwards it.
function send (port, { path = '/', headers, body, split = false }) {
  return new Promise((resolve, reject) => {
    const socket = net.connect(port, '127.0.0.1', () => {
      let head = `POST ${path} HTTP/1.1\r\nhost: localhost\r\nconnection: close\r\n`
      for (const [k, v] of Object.entries(headers)) head += `${k}: ${v}\r\n`
      const half = split ? body.length >> 1 : body.length
      socket.write(Buffer.concat([Buffer.from(head + '\r\n', 'latin1'), body.subarray(0, half)]))
      if (split) setTimeout(() => socket.write(body.subarray(half)), 50)
    })
    let data = ''
    socket.setTimeout(3000, () => { socket.destroy(); reject(new Error('timeout')) })
    socket.on('data', chunk => { data += chunk })
    socket.on('close', () => resolve({ status: Number(data.split('\r\n')[0].split(' ')[1]) || 0 }))
    socket.on('error', reject)
  })
}

// A gzip member of exactly `size` bytes that decompresses to `payload`. The
// size is set with comment padding in the gzip header, so it can be made larger
// or smaller than the decompressed output.
function gzipOfSize (payload, size) {
  const data = Buffer.from(payload, 'latin1')
  const deflated = zlib.deflateRawSync(data)
  const header = Buffer.from([0x1f, 0x8b, 8, 0x10, 0, 0, 0, 0, 0, 0xff])
  const trailer = Buffer.alloc(8)
  trailer.writeUInt32LE(zlib.crc32(data), 0)
  trailer.writeUInt32LE(data.length, 4)
  const padding = size - header.length - 1 - deflated.length - trailer.length
  return Buffer.concat([header, Buffer.alloc(padding, 0x20), Buffer.from([0]), deflated, trailer])
}

// A request that the upstream would run if it read past the announced length.
const smuggled = 'GET /smuggled HTTP/1.1\r\nhost: localhost\r\ncontent-length: 0\r\n\r\n'

const bodies = [
  { name: 'shorter', payload: 'DECOMPRESSED-PAYLOAD', size: 420 },
  // The first `size` bytes fill the announced length exactly, so whatever
  // follows them is read by a desynced upstream as the next request.
  { name: 'longer', payload: 'A'.repeat(300) + smuggled, size: 300 }
]

const transports = [
  { name: 'core http', opts: { http: {} }, createTarget: createRecordingTarget },
  { name: 'undici', opts: {}, createTarget: createRecordingTarget },
  { name: 'http2', opts: { http2: true }, createTarget: createHttp2RecordingTarget }
]

async function createProxy (t, base, opts) {
  const instance = Fastify()
  t.after(() => instance.close())
  instance.register(From, { base, ...opts })

  // Forward the request body as a raw stream, as @fastify/http-proxy does.
  instance.addContentTypeParser('*', (_req, payload, done) => { done(null, payload) })
  // Replace the body stream with a decompressed one, as @fastify/compress does
  // in its request-decompression preParsing hook, leaving content-length as is.
  instance.addHook('preParsing', (request, _reply, payload, done) => {
    if (request.headers['content-encoding'] !== 'gzip') return done(null, payload)
    const gunzip = zlib.createGunzip()
    payload.pipe(gunzip)
    done(null, gunzip)
  })
  instance.post('/*', (_request, reply) => { reply.from() })
  await instance.listen({ port: 0 })
  return instance.server.address().port
}

function sendGzip (port, { payload, size }) {
  const body = gzipOfSize(payload, size)
  return send(port, {
    path: '/upload',
    headers: { 'content-type': 'application/octet-stream', 'content-encoding': 'gzip', 'content-length': body.length },
    body
  })
}

for (const transport of transports) {
  t.test(`content-length is not inherited for a stream a preParsing hook replaced (${transport.name})`, async (t) => {
    const { server: target, seen } = transport.createTarget()
    await new Promise(resolve => target.listen(0, resolve))
    t.after(() => target.close())
    const port = await createProxy(t, `http://localhost:${target.address().port}`, transport.opts)

    // The untouched raw request still matches the client's content-length, so
    // it keeps it instead of being reframed. The body is still arriving when
    // it is forwarded, so the transport cannot work its length out by itself.
    await t.test('untouched raw request body keeps its content-length', async (t) => {
      seen.length = 0
      const payload = 'RAW-REQUEST-PAYLOAD'
      const { status } = await send(port, {
        headers: { 'content-type': 'application/octet-stream', 'content-length': payload.length },
        body: Buffer.from(payload),
        split: true
      })

      t.assert.strictEqual(status, 200)
      t.assert.strictEqual(seen.length, 1)
      const [observed] = seen
      t.assert.strictEqual(observed.body, payload)
      t.assert.strictEqual(observed.contentLength, payload.length)
      t.assert.strictEqual(observed.chunked, false)
    })

    for (const b of bodies) {
      await t.test(`decompressed body ${b.name} than the content-length`, async (t) => {
        seen.length = 0
        const { status } = await sendGzip(port, b)

        t.assert.strictEqual(status, 200)
        t.assert.strictEqual(seen.length, 1)
        const [observed] = seen
        // The whole decompressed payload must reach the upstream.
        t.assert.strictEqual(observed.body, b.payload)
        // And the framing must be honest: no content-length that differs from
        // the bytes written. Chunked framing (contentLength null) is expected.
        if (observed.contentLength !== null) {
          t.assert.strictEqual(observed.contentLength, observed.written)
        }
      })
    }
  })
}

// End to end against a real HTTP/1.1 upstream: a decompressed body that runs
// past the client's content-length must not reach the upstream as a second
// request.
for (const transport of transports.filter(transport => transport.name !== 'http2')) {
  t.test(`a replaced stream longer than the content-length does not smuggle a request (${transport.name})`, async (t) => {
    const urls = []
    const received = []
    const target = http.createServer((req, res) => {
      urls.push(req.url)
      const chunks = []
      req.on('data', chunk => chunks.push(chunk))
      req.on('end', () => {
        received.push({ url: req.url, body: Buffer.concat(chunks).toString('latin1') })
        res.end('ok')
      })
    })
    await new Promise(resolve => target.listen(0, resolve))
    t.after(() => {
      target.closeAllConnections()
      target.close()
    })
    const port = await createProxy(t, `http://localhost:${target.address().port}`, transport.opts)

    const longer = bodies.find(b => b.name === 'longer')
    const { status } = await sendGzip(port, longer)

    t.assert.strictEqual(status, 200)
    t.assert.deepStrictEqual(urls, ['/upload'])
    t.assert.deepStrictEqual(received, [{ url: '/upload', body: longer.payload }])
  })
}
