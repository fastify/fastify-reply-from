'use strict'

const fs = require('fs')
const path = require('path')
const t = require('tap')
const Fastify = require('fastify')
const From = require('..')
const Multipart = require('fastify-multipart')
const http = require('http')
const get = require('simple-get').concat
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

t.plan(12)

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

instance.post('/', (request, reply) => {
  reply.from(`http://localhost:${target.address().port}`)
})

t.teardown(target.close.bind(target))

instance.listen(0, (err) => {
  t.error(err)

  logStream.on('data', (log) => {
    if (
      log.level === 40 &&
      log.msg.match(/fastify-reply-from might not behave as expected when used with fastify-multipart/)
    ) {
      t.pass('incompatibility warn message logged')
    }
  })

  target.listen(0, (err) => {
    t.error(err)

    const form = new FormData()
    form.append('key', 'value')
    form.append('file', fs.createReadStream(filetPath, { encoding: 'utf-8' }))

    get({
      url: `http://localhost:${instance.server.address().port}`,
      method: 'POST',
      headers: {
        ...form.getHeaders()
      },
      body: form
    }, (err, res, data) => {
      t.error(err)
      t.same(JSON.parse(data), { something: 'else' })
    })
  })
})
