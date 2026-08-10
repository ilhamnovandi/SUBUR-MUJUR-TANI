const crypto = require("crypto");

function response(statusCode, body = {}) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type, X-Requested-With, *",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
    },
    body: JSON.stringify(body)
  };
}

function headerValue(headers, name) {
  const target = String(name || "").toLowerCase();
  for (const [k, v] of Object.entries(headers || {})) {
    if (String(k).toLowerCase() === target) return String(v || "");
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
  return Boolean(
    payload.event ||
    payload.type ||
    payload.name ||
    payload.data ||
    payload.id ||
    payload.order_id ||
    payload.waybill_id ||
    payload.tracking_id ||
    payload.status ||
    payload.order_status ||
    payload.price !== undefined
  );
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
  const secret = String(process.env.BITESHIP_WEBHOOK_SIGNATURE_SECRET || "").trim();
  if (!url || !secret) return false;

  try {
    // Netlify Background Functions acknowledge with 202 immediately and
    // continue processing independently, keeping the Biteship request fast.
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-smt-webhook-internal": secret
      },
      body: rawBody
    });
    return res.status === 202 || (res.status >= 200 && res.status < 300);
  } catch (err) {
    console.error("biteship-webhook background invoke:", err);
    return false;
  }
}

exports.handler = async event => {
  // Biteship requires a public HTTPS POST JSON endpoint. GET is also accepted
  // here to make endpoint checks easy to verify from a browser/curl.
  if (event.httpMethod === "OPTIONS") return response(204, {});
  if (event.httpMethod === "GET") return response(200, { success: true, webhook: "ready" });
  if (event.httpMethod !== "POST") {
    return response(405, { success: false, message: "Method harus POST." });
  }

  const rawBody = String(event.body || "").trim();

  // Installation/endpoint validation can be a POST with an empty body.
  if (!rawBody) {
    return response(200, { success: true, webhook: "ready", validation: true });
  }

  let payload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return response(400, { success: false, message: "Body webhook bukan JSON yang valid." });
  }

  const signatureKey = String(process.env.BITESHIP_WEBHOOK_SIGNATURE_KEY || "").trim();
  const signatureSecret = String(process.env.BITESHIP_WEBHOOK_SIGNATURE_SECRET || "").trim();
  const receivedSecret = signatureKey ? headerValue(event.headers, signatureKey) : "";

  // A non-event JSON payload is treated as the initial Biteship validation.
  // It gets 200 without requiring the optional signature header.
  if (!isLikelyRealWebhook(payload) && !receivedSecret) {
    return response(200, { success: true, webhook: "ready", validation: true });
  }

  // Real webhook deliveries are verified when signature security is configured.
  if (!signatureKey || !signatureSecret) {
    return response(500, {
      success: false,
      message: "Konfigurasi keamanan webhook belum lengkap di Netlify."
    });
  }

  if (!safeEqual(receivedSecret, signatureSecret)) {
    return response(401, { success: false, message: "Signature webhook tidak valid." });
  }

  // IMPORTANT: do not read Firebase or perform heavy processing here.
  // The Background Function handles Firebase after Biteship has been acknowledged.
  const accepted = await invokeBackground(event, rawBody);
  if (!accepted) {
    // The request was authenticated but could not be queued. Returning an
    // error is safer than falsely acknowledging a webhook that will be lost.
    return response(502, { success: false, message: "Webhook berhasil diverifikasi tetapi gagal diteruskan ke background processor." });
  }

  return response(200, {
    success: true,
    received: true,
    queued: true
  });
};
