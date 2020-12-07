# fastify-reply-from

![CI](https://github.com/fastify/fastify-reply-from/workflows/CI/badge.svg)
[![NPM version](https://img.shields.io/npm/v/fastify-reply-from.svg?style=flat)](https://www.npmjs.com/package/fastify-reply-fromm)

fastify plugin to forward the current http request to another server.
HTTP2 to HTTP is supported too.

## Install

```
npm i fastify-reply-from
```

## Compatibility with fastify-multipart
`fastify-reply-from` and [`fastify-multipart`](https://github.com/fastify/fastify-multipart) should not be registered as sibling plugins nor shold be registered in plugins which have a parent-child relationship.<br> The two plugins are incompatible, in the sense that the behavior of `fastify-reply-from` might not be the expected one when the above-mentioned conditions are not respected.<br> This is due to the fact that `fastify-multipart` consumes the multipart content by parsing it, hence this content is not forwarded to the target service by `fastify-reply-from`.<br>
However, the two plugins may be used within the same fastify instance, at the condition that they belong to disjoint branches of the fastify plugins hierarchy tree. 

## Usage

The following example set up two fastify servers and forward the request
from one to the other.

```js
'use strict'

const Fastify = require('fastify')

const target = Fastify({
  logger: true
})

target.get('/', (request, reply) => {
  reply.send('hello world')
})

const proxy = Fastify({
  logger: true
})

proxy.register(require('fastify-reply-from'), {
  base: 'http://localhost:3001/'
})

proxy.get('/', (request, reply) => {
  reply.from('/')
})

target.listen(3001, (err) => {
  if (err) {
    throw err
  }

  proxy.listen(3000, (err) => {
    if (err) {
      throw err
    }
  })
})
```

## API

### Plugin options

#### `base`

Set the base URL for all the forwarded requests. Will be required if `http2` is set to `true`
Note that _every path will be discarded_.

Custom URL protocols `unix+http:` and `unix+https:` can be used to forward requests to a unix
socket server by using `querystring.escape(socketPath)` as the hostname.  This is not supported
for http2 nor unidici.  To illustrate:

```js
const socketPath = require('querystring').escape('/run/http-daemon.socket')
proxxy.register(require('fastify-reply-from'), {
  base: 'unix+http://${socketPath}/'
});
```

#### `http`
By default, Node's [`http.request`](https://nodejs.org/api/http.html#http_http_request_options_callback)
will be used if you don't enable [`http2`](#http2) or [`undici`](#undici). To customize the `request`,
you can pass in [`agentOptions`](https://nodejs.org/api/http.html#http_new_agent_options) and
[`requestOptions`](https://nodejs.org/api/http.html#http_http_request_options_callback). To illustrate:

```js
proxy.register(require('fastify-reply-from'), {
  base: 'http://localhost:3001/',
  http: {
    agentOptions: { // pass in any options from https://nodejs.org/api/http.html#http_new_agent_options
      keepAliveMsecs: 10 * 60 * 1000
    },
    requestOptions: { // pass in any options from https://nodejs.org/api/http.html#http_http_request_options_callback
      timeout: 5000 // timeout in msecs, defaults to 10000 (10 seconds)
    }
  }
})
```

You can also pass a custom http agents. If you pass the agents, then the http.agentOptions will be ignored. To illustrate:
```js
proxy.register(require('fastify-reply-from'), {
  base: 'http://localhost:3001/',
  http: {
    agents: { 
      'http:': new http.Agent({ keepAliveMsecs: 10 * 60 * 1000 }), // pass in any options from https://nodejs.org/api/http.html#http_new_agent_options
      'https:': new https.Agent({ keepAliveMsecs: 10 * 60 * 1000 })
               
    },
    requestOptions: { // pass in any options from https://nodejs.org/api/http.html#http_http_request_options_callback
      timeout: 5000 // timeout in msecs, defaults to 10000 (10 seconds)
    }
  }
})
```
#### `http2`
You can either set `http2` to `true` or set the settings object to connect to a HTTP/2 server.
The `http2` settings object has the shape of:

```js
proxy.register(require('fastify-reply-from'), {
  base: 'http://localhost:3001/',
  http2: {
    sessionTimeout: 10000, // HTTP/2 session timeout in msecs, defaults to 60000 (1 minute)
    requestTimeout: 5000, // HTTP/2 request timeout in msecs, defaults to 10000 (10 seconds)
    sessionOptions: { // HTTP/2 session connect options, pass in any options from https://nodejs.org/api/http2.html#http2_http2_connect_authority_options_listener
      rejectUnauthorized: true
    },
    requestTimeout: { // HTTP/2 request options, pass in any options from https://nodejs.org/api/http2.html#http2_clienthttp2session_request_headers_options
      endStream: true
    }
  }
})
```

#### `undici`
Set to `true` to use [undici](https://github.com/mcollina/undici)
instead of `require('http')`. Enabling this flag should guarantee
20-50% more throughput.

This flag could controls the settings of the undici client, like so:

```js
proxy.register(require('fastify-reply-from'), {
  base: 'http://localhost:3001/',
  undici: {
    connections: 100,
    pipelining: 10
  }
})
```

#### `cacheURLs`

The number of parsed URLs that will be cached. Default: `100`.

#### `keepAliveMsecs`

**(Deprecated)** Defaults to 1 minute (`60000`), passed down to [`http.Agent`][http-agent] and
[`https.Agent`][https-agent] instances. Prefer to use [`http.agentOptions`](#http) instead.

#### `maxSockets`

**(Deprecated)** Defaults to `2048` sockets, passed down to [`http.Agent`][http-agent] and
[`https.Agent`][https-agent] instances. Prefer to use [`http.agentOptions`](#http) instead.

#### `maxFreeSockets`

**(Deprecated)** Defaults to `2048` free sockets, passed down to [`http.Agent`][http-agent] and
[`https.Agent`][https-agent] instances. Prefer to use [`http.agentOptions`](#http) instead.

#### `rejectUnauthorized`

**(Deprecated)** Defaults to `false`, passed down to [`https.Agent`][https-agent] instances.
This needs to be set to `false` to reply from https servers with
self-signed certificates. Prefer to use [`http.requestOptions`](#http) or
[`http2.sessionOptions`](#http2) instead.

#### `sessionTimeout`

**(Deprecated)** The timeout value after which the HTTP2 client session is destroyed if there
is no activity. Defaults to 1 minute (`60000`). Prefer to use [`http2.sessionTimeout`](#http2) instead.

---

### `reply.from(source, [opts])`

The plugin decorates the
[`Reply`](https://github.com/fastify/fastify/blob/master/docs/Reply.md)
instance with a `from` method, which will reply to the original request
__from the desired source__. The options allows to override any part of
the request or response being sent or received to/from the source.

#### `onResponse(request, reply, res)`

Called when an http response is received from the source.
The default behavior is `reply.send(res)`, which will be disabled if the
option is specified.

When replying with a body of a different length it is necessary to remove
the `content-length` header.

```js
{
  onResponse: (request, reply, res) => {
    reply.removeHeader('content-length');
    reply.send('New body of different length');
  }
}
```

#### `onError(reply, error)`

Called when an http response is received with error from the source.
The default behavior is `reply.send(error)`, which will be disabled if the
option is specified.
It must reply the error.

#### `rewriteHeaders(headers)`

Called to rewrite the headers of the response, before them being copied
over to the outer response.
It must return the new headers object.

#### `rewriteRequestHeaders(originalReq, headers)`

Called to rewrite the headers of the request, before them being sent to the other server.
It must return the new headers object.

#### `queryString`

Replaces the original querystring of the request with what is specified.
This will get passed to
[`querystring.stringify`](https://nodejs.org/api/querystring.html#querystring_querystring_stringify_obj_sep_eq_options).

#### `body`

Replaces the original request body with what is specified. Unless
[`contentType`][contentType] is specified, the content will be passed
through `JSON.stringify()`.
Setting this option will not verify if the http method allows for a body.

#### `contentType`

Override the `'Content-Type'` header of the forwarded request, if we are
already overriding the [`body`][body].

### HTTP & HTTP2 timeouts

This library has:
- `timeout` for `http` set by default. The default value is 10 seconds (`10000`).
- `requestTimeout` & `sessionTimeout` for `http2` set by default.
  - The default value for `requestTimeout` is 10 seconds (`10000`).
  - The default value for `sessionTimeout` is 60 seconds (`60000`).

When a timeout happens, [`504 Gateway Timeout`](https://developer.mozilla.org/en-US/docs/Web/HTTP/Status/504)
will be returned to the client.

## TODO

* [ ] support overriding the body with a stream
* [ ] forward the request id to the other peer might require some
      refacotring because we have to make the `req.id` unique
      (see [hyperid](http://npm.im/hyperid)).
* [ ] Support origin HTTP2 push
* [x] benchmarks

## License

MIT

[http-agent]: https://nodejs.org/api/http.html#http_new_agent_options
[https-agent]: https://nodejs.org/api/https.html#https_class_https_agent
