'use strict'

// A body stream that a preParsing hook replaces (for example request
// decompression) no longer matches the client's content-length. Forwarding
// that inherited content-length upstream while writing a different number of
// bytes desyncs the core http connection, the same framing flaw as
// GHSA-mx78-9mrq-rfm5. The proxy must not announce a content-length it does not
// satisfy for such a stream, so it either frames the body itself (chunked) or
// announces the real byte count.

const t = require('node:test')
const net = require('node:net')
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

function send (port, { path = '/', headers, body }) {
  return new Promise((resolve, reject) => {
    const socket = net.connect(port, '127.0.0.1', () => {
      let head = `POST ${path} HTTP/1.1\r\nhost: localhost\r\nconnection: close\r\n`
      for (const [k, v] of Object.entries(headers)) head += `${k}: ${v}\r\n`
      socket.write(Buffer.concat([Buffer.from(head + '\r\n', 'latin1'), Buffer.from(body, 'latin1')]))
    })
    let data = ''
    socket.setTimeout(3000, () => { socket.destroy(); reject(new Error('timeout')) })
    socket.on('data', chunk => { data += chunk })
    socket.on('close', () => resolve({ status: Number(data.split('\r\n')[0].split(' ')[1]) || 0 }))
    socket.on('error', reject)
  })
}

// A gzip member whose compressed size is far larger than its decompressed
// output (comment padding), so an inherited content-length cannot match.
function gzipPadded (payload, padBytes) {
  const deflated = zlib.deflateRawSync(Buffer.from(payload))
  const header = Buffer.from([0x1f, 0x8b, 8, 0x10, 0, 0, 0, 0, 0, 0xff])
  const comment = Buffer.concat([Buffer.alloc(padBytes, 0x20), Buffer.from([0])])
  const trailer = Buffer.alloc(8)
  trailer.writeUInt32LE(zlib.crc32(Buffer.from(payload)), 0)
  trailer.writeUInt32LE(Buffer.byteLength(payload), 4)
  return Buffer.concat([header, comment, deflated, trailer]).toString('latin1')
}

t.test('content-length is not inherited for a stream a preParsing hook replaced', async (t) => {
  const { server: target, seen } = createRecordingTarget()
  await new Promise(resolve => target.listen(0, resolve))
  t.after(() => target.close())

  const instance = Fastify()
  t.after(() => instance.close())
  instance.register(From, { base: `http://localhost:${target.address().port}`, http: {} })

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
  const port = instance.server.address().port

  const payload = 'DECOMPRESSED-PAYLOAD'
  const body = gzipPadded(payload, 400)
  const { status } = await send(port, {
    headers: { 'content-type': 'application/octet-stream', 'content-encoding': 'gzip', 'content-length': Buffer.byteLength(body, 'latin1') },
    body
  })

  t.assert.strictEqual(status, 200)
  t.assert.strictEqual(seen.length, 1)
  const [observed] = seen
  // The whole decompressed payload must reach the upstream.
  t.assert.strictEqual(observed.body, payload)
  // And the framing must be honest: no content-length larger than the bytes
  // written. Chunked framing (contentLength null) is the expected outcome.
  if (observed.contentLength !== null) {
    t.assert.strictEqual(observed.contentLength, observed.written)
  }
})
