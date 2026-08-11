/**
 * Biteship webhook endpoint for Netlify.
 *
 * IMPORTANT:
 * Biteship validates a newly-created webhook before it is activated.
 * During that validation it can send an empty application/json POST.
 * This function therefore treats an empty/validation request as SUCCESS and
 * returns HTTP 200 immediately. Real webhook events are authenticated when
 * the signature variables are configured, then queued to the background
 * function so Biteship does not wait for Firebase processing.
 */

const crypto = require("crypto");

const JSON_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, X-Requested-With, *",
  "Access-Control-Allow-Methods": "GET, HEAD, POST, OPTIONS",
  "Cache-Control": "no-store"
};

function response(statusCode, body = {}) {
  return {
    statusCode,
    headers: JSON_HEADERS,
    body: JSON.stringify(body)
  };
}

function okText() {
  return {
    statusCode: 200,
    headers: {
      ...JSON_HEADERS,
      "Content-Type": "text/plain; charset=utf-8"
    },
    body: "ok"
  };
}

function headerValue(headers, name) {
  const target = String(name || "").toLowerCase();
  for (const [key, value] of Object.entries(headers || {})) {
    if (String(key).toLowerCase() === target) return String(value ?? "");
  }
  return "";
}

function safeEqual(a, b) {
  const left = Buffer.from(String(a || ""));
  const right = Buffer.from(String(b || ""));
  return left.length > 0 && left.length === right.length && crypto.timingSafeEqual(left, right);
}

function isLikelyRealWebhook(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return false;

  // Biteship may send a validation payload containing only event/type/name.
  // Treat those as installation checks. A real delivery should contain an
  // order identifier, tracking/waybill data, a status, or price data.
  const hasOrderData =
    payload.id ||
    payload.order_id ||
    payload.reference_id ||
    payload.waybill_id ||
    payload.tracking_id ||
    payload.courier_waybill_id ||
    payload.courier_tracking_id ||
    payload.status ||
    payload.order_status ||
    payload.price !== undefined;

  if (hasOrderData) return true;

  const data = payload.data;
  if (data && typeof data === "object" && !Array.isArray(data)) {
    return Boolean(
      data.id ||
      data.order_id ||
      data.reference_id ||
      data.waybill_id ||
      data.tracking_id ||
      data.courier_waybill_id ||
      data.courier_tracking_id ||
      data.status ||
      data.order_status ||
      data.price !== undefined
    );
  }

  return false;
}

function getSignatureConfig() {
  const key = String(
    process.env.BITESHIP_WEBHOOK_SIGNATURE_KEY ||
    process.env.BITESHIP_WEBHOOK_HEADER_KEY ||
    ""
  ).trim();

  const secret = String(
    process.env.BITESHIP_WEBHOOK_SIGNATURE_SECRET ||
    process.env.BITESHIP_WEBHOOK_HEADER_SECRET ||
    ""
  ).trim();

  return { key, secret };
}

function getBackgroundUrl(event) {
  const headers = event.headers || {};
  const host =
    headerValue(headers, "x-forwarded-host") ||
    headerValue(headers, "host");

  const proto =
    headerValue(headers, "x-forwarded-proto") ||
    (String(host).includes("localhost") ? "http" : "https");

  if (!host) return "";
  return `${proto}://${host}/.netlify/functions/biteship-webhook-background`;
}

async function invokeBackground(event, rawBody) {
  const url = getBackgroundUrl(event);
  const { secret } = getSignatureConfig();

  if (!url || !secret) return false;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-smt-webhook-internal": secret
      },
      body: rawBody
    });

    // Background Functions acknowledge with 202 and continue asynchronously.
    return res.status === 202 || (res.status >= 200 && res.status < 300);
  } catch (error) {
    console.error("biteship-webhook background invoke:", error);
    return false;
  }
}

exports.handler = async event => {
  const method = String(event.httpMethod || "GET").toUpperCase();

  // Biteship/browser/proxy health checks should never fail with 405.
  if (method === "OPTIONS" || method === "HEAD" || method === "GET") {
    return okText();
  }

  if (method !== "POST") {
    return response(405, {
      success: false,
      message: "Method tidak didukung. Gunakan POST."
    });
  }

  // Biteship webhook installation validation may send an empty JSON request.
  // Do NOT require a signature and do NOT reject an empty body here.
  const rawBody = String(event.body ?? "").trim();
  if (!rawBody) return okText();

  let payload;
  try {
    payload = JSON.parse(rawBody);
  } catch (error) {
    // If there is no signature, this is most likely an installation/health
    // check. Returning 200 prevents Biteship from rejecting the webhook.
    const { key } = getSignatureConfig();
    const receivedSecret = key ? headerValue(event.headers, key) : "";
    if (!receivedSecret) return okText();

    return response(400, {
      success: false,
      message: "Body webhook bukan JSON yang valid."
    });
  }

  const { key: signatureKey, secret: signatureSecret } = getSignatureConfig();
  const receivedSecret = signatureKey
    ? headerValue(event.headers, signatureKey)
    : "";

  // Installation/validation requests are allowed to pass without a
  // signature. This is important because Biteship validates the URL before
  // the webhook is activated and that request may contain only event/type.
  if (!isLikelyRealWebhook(payload) && !receivedSecret) {
    return okText();
  }

  // If signature security has not been configured yet, do not reject the
  // Biteship installation check. Real webhook events should be configured
  // with the two signature environment variables before production use.
  if (!signatureKey || !signatureSecret) {
    console.warn("Biteship webhook signature variables are missing.");
    return okText();
  }

  if (!safeEqual(receivedSecret, signatureSecret)) {
    return response(401, {
      success: false,
      message: "Signature webhook tidak valid."
    });
  }

  // Do the Firebase work in the Background Function so Biteship receives a
  // quick acknowledgement and does not time out on slow database operations.
  const queued = await invokeBackground(event, rawBody);

  if (!queued) {
    return response(502, {
      success: false,
      message: "Webhook terverifikasi tetapi gagal masuk ke background processor."
    });
  }

  return response(200, {
    success: true,
    received: true,
    queued: true
  });
};
