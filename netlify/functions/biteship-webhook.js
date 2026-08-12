const crypto = require("crypto");
const { processWebhookPayload } = require("./biteship-webhook-processor");

function response(statusCode, body = "") {
  const isText = typeof body === "string";

  return {
    statusCode,
    headers: {
      "Content-Type": isText
        ? "text/plain; charset=utf-8"
        : "application/json; charset=utf-8",

      "Access-Control-Allow-Origin": "*",

      "Access-Control-Allow-Headers":
        "Content-Type, X-Requested-With, X-Biteship-Signature, *",

      "Access-Control-Allow-Methods":
        "GET, POST, OPTIONS"
    },

    body: isText
      ? body
      : JSON.stringify(body)
  };
}


function headerValue(headers, name) {
  const target = String(name || "").toLowerCase();

  for (const [key, value] of Object.entries(headers || {})) {
    if (String(key).toLowerCase() === target) {
      return String(value || "");
    }
  }

  return "";
}


function safeEqual(a, b) {
  const left = Buffer.from(String(a || ""));
  const right = Buffer.from(String(b || ""));

  return (
    left.length > 0 &&
    left.length === right.length &&
    crypto.timingSafeEqual(left, right)
  );
}


function isLikelyRealWebhook(payload) {
  if (
    !payload ||
    typeof payload !== "object" ||
    Array.isArray(payload)
  ) {
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
    (String(host).includes("localhost")
      ? "http"
      : "https");

  if (!host) {
    return "";
  }

  return `${proto}://${host}/.netlify/functions/biteship-webhook-background`;
}


async function invokeBackground(event, rawBody, secret) {
  const url = getBackgroundUrl(event);

  if (!url || !secret) {
    return false;
  }

  try {
    const res = await fetch(url, {
      method: "POST",

      headers: {
        "Content-Type": "application/json",
        "x-smt-webhook-internal": secret
      },

      body: rawBody
    });

    return res.status >= 200 && res.status < 300;

  } catch (err) {

    console.error(
      "biteship-webhook background invoke:",
      err
    );

    return false;
  }
}


exports.handler = async (event) => {

  /*
   * ============================
   * OPTIONS
   * ============================
   */

  if (event.httpMethod === "OPTIONS") {
    return response(204, "");
  }


  /*
   * ============================
   * GET
   * ============================
   *
   * Untuk tes manual dari browser.
   */

  if (event.httpMethod === "GET") {
    return response(200, "ok");
  }


  /*
   * ============================
   * METHOD
   * ============================
   */

  if (event.httpMethod !== "POST") {
    return response(
      405,
      "Method Not Allowed"
    );
  }


  /*
   * ============================
   * BITEHIP VALIDATION
   * ============================
   *
   * Biteship dapat mengirim POST
   * dengan Content-Type:
   *
   * application/json
   *
   * tetapi body kosong.
   *
   * Jangan JSON.parse body kosong.
   * Langsung balas:
   *
   * HTTP 200
   * ok
   */

  const rawBody = String(
    event.body || ""
  ).trim();


  if (!rawBody) {

    console.log(
      "Biteship validation: empty body"
    );

    return response(
      200,
      "ok"
    );
  }


  /*
   * Biteship juga bisa mengirim
   * JSON kosong:
   *
   * {}
   */

  if (rawBody === "{}") {

    console.log(
      "Biteship validation: empty JSON object"
    );

    return response(
      200,
      "ok"
    );
  }


  /*
   * ============================
   * PARSE JSON
   * ============================
   */

  let payload;

  try {

    payload = JSON.parse(
      rawBody
    );

  } catch (err) {

    console.error(
      "Invalid webhook JSON:",
      err
    );

    return response(
      400,
      {
        success: false,
        message:
          "Body webhook bukan JSON yang valid."
      }
    );
  }


  /*
   * ============================
   * NON-EVENT VALIDATION
   * ============================
   *
   * Kalau Biteship mengirim JSON
   * tetapi bukan event order.status,
   * tetap jawab OK.
   */

  if (!isLikelyRealWebhook(payload)) {

    console.log(
      "Biteship validation payload accepted"
    );

    return response(
      200,
      "ok"
    );
  }


  /*
   * ============================
   * SIGNATURE
   * ============================
   *
   * Optional.
   *
   * Karena di dashboard Biteship
   * kamu mengosongkan Signature Key
   * dan Signature Secret, bagian ini
   * tidak akan mengganggu.
   */

  const signatureKey = String(
    process.env.BITESHIP_WEBHOOK_SIGNATURE_KEY || ""
  ).trim();


  const signatureSecret = String(
    process.env.BITESHIP_WEBHOOK_SIGNATURE_SECRET || ""
  ).trim();


  if (
    signatureKey ||
    signatureSecret
  ) {

    if (
      !signatureKey ||
      !signatureSecret
    ) {

      return response(
        500,
        {
          success: false,
          message:
            "Konfigurasi keamanan webhook belum lengkap di Netlify."
        }
      );
    }


    const receivedSecret =
      headerValue(
        event.headers,
        signatureKey
      );


    if (
      !safeEqual(
        receivedSecret,
        signatureSecret
      )
    ) {

      return response(
        401,
        {
          success: false,
          message:
            "Signature webhook tidak valid."
        }
      );
    }
  }


  /*
   * ============================
   * BACKGROUND PROCESSOR
   * ============================
   */

  if (signatureSecret) {

    const accepted =
      await invokeBackground(
        event,
        rawBody,
        signatureSecret
      );


    if (!accepted) {

      return response(
        502,
        {
          success: false,
          message:
            "Webhook berhasil diverifikasi tetapi gagal diteruskan ke background processor."
        }
      );
    }


    return response(
      200,
      {
        success: true,
        received: true,
        queued: true
      }
    );
  }


  /*
   * ============================
   * PROCESS WEBHOOK
   * ============================
   *
   * Untuk order.status asli,
   * teruskan ke processor yang
   * sudah ada di proyek.
   */

  try {

    const result =
      await processWebhookPayload(
        rawBody
      );


    return response(
      200,
      result
    );

  } catch (err) {

    console.error(
      "biteship-webhook:",
      err
    );


    return response(
      500,
      {
        success: false,
        message:
          err.message ||
          "Webhook gagal diproses."
      }
    );
  }
};
