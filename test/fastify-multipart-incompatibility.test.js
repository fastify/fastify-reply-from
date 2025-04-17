'use strict'

const fs = require('node:fs')
const path = require('node:path')
const t = require('node:test')
const Fastify = require('fastify')
const { request } = require('undici')
const From = require('..')
const Multipart = require('@fastify/multipart')
const http = require('node:http')
const FormData = require('form-data')

const split = require('split2')
const logStream = split(JSON.parse)

const instance = Fastify({
  logger: {
    level: 'warn',
    stream: logStream
  }
})

instance.register(Multipart)
instance.register(From)

t.test('fastify-multipart-incompatibility', async (t) => {
  t.plan(9)

  t.after(() => instance.close())

  const filetPath = path.join(__dirname, 'fixtures', 'file.txt')
  const fileContent = fs.readFileSync(filetPath, { encoding: 'utf-8' })

  const target = http.createServer((req, res) => {
    t.assert.ok('request proxied')
    t.assert.strictEqual(req.method, 'POST')
    t.assert.match(req.headers['content-type'], /^multipart\/form-data/)
    let data = ''
    req.setEncoding('utf8')
    req.on('data', (d) => {
      data += d
    })
    req.on('end', () => {
      t.assert.notDeepEqual(data, 'Content-Disposition: form-data; name="key"')
      t.assert.notDeepEqual(data, 'value')
      t.assert.notDeepEqual(data, 'Content-Disposition: form-data; name="file"')
      t.assert.notDeepEqual(data, fileContent)
      res.setHeader('content-type', 'application/json')
      res.statusCode = 200
      res.end(JSON.stringify({ something: 'else' }))
    })
  })

  instance.post('/', (_request, reply) => {
    reply.from(`http://localhost:${target.address().port}`)
  })

  t.after(() => target.close())

  await new Promise(resolve => instance.listen({ port: 0 }, resolve))

  logStream.on('data', (log) => {
    if (
      log.level === 40 &&
      log.msg.match(/@fastify\/reply-from might not behave as expected when used with @fastify\/multipart/)
    ) {
      t.assert.ok('incompatibility warn message logged')
    }
  })

  await new Promise(resolve => target.listen({ port: 0 }, resolve))

  const form = new FormData()
  form.append('key', 'value')
  form.append('file', fs.createReadStream(filetPath, { encoding: 'utf-8' }))

  const result = await request(`http://localhost:${instance.server.address().port}`, {
    method: 'POST',
    headers: form.getHeaders(),
    body: form
  })

  t.assert.deepStrictEqual(await result.body.json(), { something: 'else' })
})
