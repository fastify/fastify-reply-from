'use strict'

const fs = require('node:fs')
const path = require('node:path')
const t = require('tap')
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

t.plan(11)

t.teardown(instance.close.bind(instance))

const filetPath = path.join(__dirname, 'fixtures', 'file.txt')
const fileContent = fs.readFileSync(filetPath, { encoding: 'utf-8' })

const target = http.createServer((req, res) => {
  t.pass('request proxied')
  t.equal(req.method, 'POST')
  t.match(req.headers['content-type'], /^multipart\/form-data/)
  let data = ''
  req.setEncoding('utf8')
  req.on('data', (d) => {
    data += d
  })
  req.on('end', () => {
    t.notMatch(data, 'Content-Disposition: form-data; name="key"')
    t.notMatch(data, 'value')
    t.notMatch(data, 'Content-Disposition: form-data; name="file"')
    t.notMatch(data, fileContent)
    res.setHeader('content-type', 'application/json')
    res.statusCode = 200
    res.end(JSON.stringify({ something: 'else' }))
  })
})

instance.post('/', (_request, reply) => {
  reply.from(`http://localhost:${target.address().port}`)
})

t.teardown(target.close.bind(target))

instance.listen({ port: 0 }, (err) => {
  t.error(err)

  logStream.on('data', (log) => {
    if (
      log.level === 40 &&
      log.msg.match(/@fastify\/reply-from might not behave as expected when used with @fastify\/multipart/)
    ) {
      t.pass('incompatibility warn message logged')
    }
  })

  target.listen({ port: 0 }, async (err) => {
    t.error(err)

    const form = new FormData()
    form.append('key', 'value')
    form.append('file', fs.createReadStream(filetPath, { encoding: 'utf-8' }))

    const result = await request(`http://localhost:${instance.server.address().port}`, {
      method: 'POST',
      headers: form.getHeaders(),
      body: form
    })

    t.same(await result.json(), { something: 'else' })
  })
})
