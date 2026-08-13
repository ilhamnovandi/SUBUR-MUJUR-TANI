const { Buffer } = require("node:buffer");

async function requestToEvent(request, context = {}) {
  const url = new URL(request.url);
  const headers = Object.fromEntries(request.headers.entries());
  let body = "";
  if (request.method !== "GET" && request.method !== "HEAD") {
    body = await request.text();
  }
  return {
    httpMethod: request.method,
    headers,
    body,
    isBase64Encoded: false,
    queryStringParameters: Object.fromEntries(url.searchParams.entries()),
    multiValueQueryStringParameters: {},
    path: url.pathname,
    rawPath: url.pathname,
    requestContext: {
      http: { method: request.method, path: url.pathname },
      ...context
    }
  };
}

function legacyToResponse(result) {
  if (result instanceof Response) return result;
  const status = Number(result?.statusCode || 200);
  const headers = new Headers(result?.headers || {});
  let body = result?.body == null ? "" : String(result.body);
  if (result?.isBase64Encoded && body) {
    body = Buffer.from(body, "base64");
  }
  if (status === 204 || status === 205 || status === 304) {
    return new Response(null, { status, headers });
  }
  return new Response(body, { status, headers });
}

module.exports = { requestToEvent, legacyToResponse };
