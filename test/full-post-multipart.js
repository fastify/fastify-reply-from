'use strict'

const fs = require('fs')
const path = require('path')
const t = require('tap')
const Fastify = require('fastify')
const From = require('..')
const http = require('http')
const get = require('simple-get').concat
const FormData = require('form-data')

const instance = Fastify()
instance.register(From)

t.plan(11)
t.tearDown(instance.close.bind(instance))

instance.addContentTypeParser('application/octet-stream', function (req, payload, done) {
  done(null, payload)
})

t.tearDown(instance.close.bind(instance))

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
    t.match(data, 'Content-Disposition: form-data; name="key"')
    t.match(data, 'value')
    t.match(data, 'Content-Disposition: form-data; name="file"')
    t.match(data, fileContent)
    res.setHeader('content-type', 'application/json')
    res.statusCode = 200
    res.end(JSON.stringify({ something: 'else' }))
  })
})

instance.addContentTypeParser('multipart/form-data', function (req, payload, done) {
  done(null, payload)
})

instance.post('/', (request, reply) => {
  reply.from(`http://localhost:${target.address().port}`)
})

t.tearDown(target.close.bind(target))

instance.listen(0, (err) => {
  t.error(err)

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
      t.deepEqual(JSON.parse(data), { something: 'else' })
    })
  })
})
