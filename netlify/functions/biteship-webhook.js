const crypto = require("crypto");
const { processWebhookPayload } = require("./biteship-webhook-processor");

function response(statusCode, body = {}) {
  const isText = typeof body === "string";
  return {
    statusCode,
    headers: {
      "Content-Type": isText ? "text/plain; charset=utf-8" : "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type, X-Requested-With, *",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
    },
    body: isText ? body : JSON.stringify(body)
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

async function invokeBackground(event, rawBody, secret) {
  const url = getBackgroundUrl(event);
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
    return res.status === 202 || (res.status >= 200 && res.status < 300);
  } catch (err) {
    console.error("biteship-webhook background invoke:", err);
    return false;
  }
}

exports.handler = async event => {
  if (event.httpMethod === "OPTIONS") return response(204, "");

  // Helpful for a browser/manual endpoint check.
  if (event.httpMethod === "GET") return response(200, "ok");

  if (event.httpMethod !== "POST") {
    return response(405, { success: false, message: "Method harus POST." });
  }

  const rawBody = String(event.body || "").trim();

  // Biteship installation validation may send an empty JSON POST.
  // Biteship explicitly expects an OK response, so return plain text "ok".
  if (!rawBody) {
    return response(200, "ok");
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

  // Biteship's optional signature headers are only checked when configured.
  // This keeps installation and normal delivery working when the Biteship
  // dashboard Headers fields are intentionally left empty.
  if (signatureKey || signatureSecret) {
    if (!signatureKey || !signatureSecret) {
      return response(500, {
        success: false,
        message: "Konfigurasi keamanan webhook belum lengkap di Netlify."
      });
    }
    if (!safeEqual(receivedSecret, signatureSecret)) {
      return response(401, { success: false, message: "Signature webhook tidak valid." });
    }
  }

  // Biteship may send a non-event JSON validation payload during installation.
  if (!isLikelyRealWebhook(payload)) {
    return response(200, "ok");
  }

  // If a webhook signature secret exists, use the Background Function so the
  // public endpoint can acknowledge Biteship quickly. If headers are empty,
  // process directly with the same shared processor; no extra ENV is needed.
  if (signatureSecret) {
    const accepted = await invokeBackground(event, rawBody, signatureSecret);
    if (!accepted) {
      return response(502, {
        success: false,
        message: "Webhook berhasil diverifikasi tetapi gagal diteruskan ke background processor."
      });
    }
    return response(200, { success: true, received: true, queued: true });
  }

  try {
    const result = await processWebhookPayload(rawBody);
    return response(200, result);
  } catch (err) {
    console.error("biteship-webhook:", err);
    return response(500, {
      success: false,
      message: err.message || "Webhook gagal diproses."
    });
  }
};
