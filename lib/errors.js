'use strict'

const createError = require('@fastify/error')

module.exports.TimeoutError = createError('FST_REPLY_FROM_TIMEOUT', 'Timeout', 504)
module.exports.HttpRequestTimeoutError = createError('FST_REPLY_FROM_HTTP_REQUEST_TIMEOUT', 'HTTP request timed out', 504, module.exports.TimeoutError)
module.exports.Http2RequestTimeoutError = createError('FST_REPLY_FROM_HTTP2_REQUEST_TIMEOUT', 'HTTP/2 request timed out', 504, module.exports.TimeoutError)
module.exports.Http2SessionTimeoutError = createError('FST_REPLY_FROM_HTTP2_SESSION_TIMEOUT', 'HTTP/2 session timed out', 504, module.exports.TimeoutError)
module.exports.ServiceUnavailableError = createError('FST_REPLY_FROM_SERVICE_UNAVAILABLE', 'Service Unavailable', 503)
module.exports.GatewayTimeoutError = createError('FST_REPLY_FROM_GATEWAY_TIMEOUT', 'Gateway Timeout', 504)
module.exports.ConnectionResetError = createError('ECONNRESET', 'Connection Reset', 500)
module.exports.ConnectTimeoutError = createError('UND_ERR_CONNECT_TIMEOUT', 'Connect Timeout Error', 500)
module.exports.UndiciSocketError = createError('UND_ERR_SOCKET', 'Undici Socket Error', 500)
module.exports.InternalServerError = createError('FST_REPLY_FROM_INTERNAL_SERVER_ERROR', '%s', 500)
