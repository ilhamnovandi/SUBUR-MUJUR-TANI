/**
 * Biteship -> Netlify webhook
 * Function name: netlify
 *
 * Important: Biteship validates the URL with an empty application/json POST.
 * This function MUST return HTTP 200 and "ok" for that request.
 */
export default async (request) => {
  const cors = {
    "Content-Type": "text/plain; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS"
  };

  if (request.method === "OPTIONS") {
    return new Response("", {status: 204, headers: cors});
  }

  if (request.method !== "POST") {
    return new Response("ok", {status: 200, headers: cors});
  }

  let body = null;
  try {
    const text = await request.text();
    if (text && text.trim()) {
      try { body = JSON.parse(text); } catch (_) { body = {raw:text}; }
    }
  } catch (_) {}

  // Always acknowledge installation/validation immediately.
  console.log("Biteship webhook received:", body);
  return new Response("ok", {status: 200, headers: cors});
};
