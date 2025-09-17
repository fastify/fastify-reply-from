'use strict'

const fs = require('node:fs')
const path = require('node:path')
const t = require('node:test')
const Fastify = require('fastify')
const { request } = require('undici')
const From = require('..')
const http = require('node:http')
const FormData = require('form-data')

t.test('multipart/form-data proxying with custom content type parser', async (t) => {
  t.plan(7)

  const filetPath = path.join(__dirname, 'fixtures', 'file.txt')

  // Target server that expects multipart/form-data
  const target = http.createServer((req, res) => {
    t.assert.ok('request proxied')
    t.assert.strictEqual(req.method, 'POST')
    t.assert.match(req.headers['content-type'], /^multipart\/form-data/)

    let data = ''
    req.setEncoding('utf8')
    req.on('data', (chunk) => {
      data += chunk
    })
    req.on('end', () => {
      // Verify the multipart data contains our form fields
      t.assert.match(data, /Content-Disposition: form-data; name="key"/)
      t.assert.match(data, /value/)
      t.assert.match(data, /Content-Disposition: form-data; name="file"/)

      res.setHeader('content-type', 'application/json')
      res.statusCode = 200
      res.end(JSON.stringify({ received: 'multipart data' }))
    })
  })

  // Fastify instance with custom multipart parser (not @fastify/multipart)
  const fastify = Fastify()

  // Register custom content type parser for multipart/form-data
  // This allows the raw body to be passed through without parsing
  fastify.addContentTypeParser('multipart/form-data', function (req, body, done) {
    done(null, body)
  })

  fastify.register(From)

  fastify.post('/', (request, reply) => {
    reply.from(`http://localhost:${target.address().port}`)
  })

  t.after(() => fastify.close())
  t.after(() => target.close())

  await new Promise(resolve => fastify.listen({ port: 0 }, resolve))
  await new Promise(resolve => target.listen({ port: 0 }, resolve))

  // Create multipart form data
  const form = new FormData()
  form.append('key', 'value')
  form.append('file', fs.createReadStream(filetPath, { encoding: 'utf-8' }))

  // Send request with multipart data
  const result = await request(`http://localhost:${fastify.server.address().port}`, {
    method: 'POST',
    headers: form.getHeaders(),
    body: form
  })

  t.assert.deepStrictEqual(await result.body.json(), { received: 'multipart data' })
})
