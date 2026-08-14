/**
 * SUBUR MUJUR TANI - Biteship Webhook
 *
 * Public endpoint:
 *   /.netlify/functions/biteship-webhook
 *   /api/biteship-webhook
 *
 * Biteship installation validation:
 *   POST + application/json + empty body => HTTP 200 "ok"
 *
 * Real order.status payloads are forwarded to the existing processor.
 */

function textResponse(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
    },
    body: String(body ?? "")
  };
}

function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
    },
    body: JSON.stringify(body)
  };
}

function getHeader(headers, name) {
  const wanted = String(name || "").toLowerCase();
  for (const [key, value] of Object.entries(headers || {})) {
    if (String(key).toLowerCase() === wanted) {
      return String(value ?? "");
    }
  }
  return "";
}

function getRawBody(event) {
  let body = event && event.body != null ? String(event.body) : "";

  // Netlify can expose a base64 encoded body when isBase64Encoded is true.
  if (event && event.isBase64Encoded && body) {
    try {
      body = Buffer.from(body, "base64").toString("utf8");
    } catch (err) {
      console.error("Gagal decode base64 webhook body:", err);
    }
  }

  return body.trim();
}

function looksLikeWebhookPayload(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return false;
  }

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
    payload.order_status
  );
}

exports.handler = async function (event) {
  const method = String(event?.httpMethod || "").toUpperCase();

  // --------------------------------------------------
  // OPTIONS
  // --------------------------------------------------
  if (method === "OPTIONS") {
    return textResponse(200, "ok");
  }

  // --------------------------------------------------
  // GET
  // Browser/manual health check
  // --------------------------------------------------
  if (method === "GET") {
    return textResponse(200, "ok");
  }

  // --------------------------------------------------
  // Only POST is accepted for webhook delivery.
  // --------------------------------------------------
  if (method !== "POST") {
    return textResponse(405, "Method Not Allowed");
  }

  const rawBody = getRawBody(event);
  const contentType = getHeader(event.headers, "content-type");

  console.log("Biteship webhook received:", {
    method,
    contentType,
    bodyLength: rawBody.length
  });

  // --------------------------------------------------
  // CRITICAL:
  // Biteship installation validation can send an empty
  // application/json POST. It MUST receive HTTP 200 "ok".
  // --------------------------------------------------
  if (!rawBody) {
    console.log("Biteship validation: empty body -> OK");
    return textResponse(200, "ok");
  }

  // Biteship may also validate with an empty JSON object.
  if (rawBody === "{}") {
    console.log("Biteship validation: {} -> OK");
    return textResponse(200, "ok");
  }

  // --------------------------------------------------
  // Parse JSON.
  // --------------------------------------------------
  let payload;

  try {
    payload = JSON.parse(rawBody);
  } catch (err) {
    console.error("Webhook body bukan JSON valid:", err);

    // Do not make installation fail because of a validation
    // request that does not contain a normal event payload.
    return textResponse(200, "ok");
  }

  // --------------------------------------------------
  // Non-event validation payload -> OK.
  // --------------------------------------------------
  if (!looksLikeWebhookPayload(payload)) {
    console.log("Biteship validation payload -> OK");
    return textResponse(200, "ok");
  }

  // --------------------------------------------------
  // Optional signature verification.
  //
  // Leave the Biteship dashboard signature fields empty
  // if you are not using signature verification.
  // --------------------------------------------------
  const signatureKey = String(
    process.env.BITESHIP_WEBHOOK_SIGNATURE_KEY || ""
  ).trim();

  const signatureSecret = String(
    process.env.BITESHIP_WEBHOOK_SIGNATURE_SECRET || ""
  ).trim();

  if (signatureKey || signatureSecret) {
    if (!signatureKey || !signatureSecret) {
      return jsonResponse(500, {
        success: false,
        message: "Konfigurasi signature webhook di Netlify belum lengkap."
      });
    }

    const received = getHeader(event.headers, signatureKey);

    if (!received || received !== signatureSecret) {
      return jsonResponse(401, {
        success: false,
        message: "Signature webhook tidak valid."
      });
    }
  }

  // --------------------------------------------------
  // REAL WEBHOOK
  //
  // Load processor lazily so a processor/Firebase
  // problem cannot prevent the endpoint from being
  // deployed and responding to validation requests.
  // --------------------------------------------------
  try {
    const { processWebhookPayload } = require("./biteship-webhook-processor");

    const result = await processWebhookPayload(rawBody);

    return jsonResponse(200, {
      success: true,
      received: true,
      result
    });
  } catch (err) {
    console.error("Biteship webhook processor error:", err);

    // A real event failed internally. Return 500 so Biteship can retry
    // instead of recording a false successful delivery.
    return jsonResponse(500, {
      success: true,
      received: true,
      processed: false,
      message: "Webhook diterima, tetapi pemrosesan internal gagal.",
      error: err.message || "Unknown processing error"
    });
  }
};
