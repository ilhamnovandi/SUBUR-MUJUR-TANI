/**
 * Public Biteship webhook endpoint.
 *
 * Biteship validates a new webhook with an empty application/json POST.
 * Empty/health-check requests MUST return HTTP 200 + "ok".
 * Real events are processed directly so COD status updates work even when
 * webhook signature headers are left empty during testing.
 */
const crypto = require("crypto");
const { getFirebaseAdmin } = require("./firebaseAdmin");

const HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, X-Requested-With, *",
  "Access-Control-Allow-Methods": "GET, HEAD, POST, OPTIONS",
  "Cache-Control": "no-store"
};

function json(statusCode, body) {
  return { statusCode, headers: HEADERS, body: JSON.stringify(body) };
}
function ok() {
  return { statusCode: 200, headers: { ...HEADERS, "Content-Type": "text/plain; charset=utf-8" }, body: "ok" };
}
function headerValue(headers, name) {
  const target = String(name || "").toLowerCase();
  for (const [k, v] of Object.entries(headers || {})) if (String(k).toLowerCase() === target) return String(v ?? "");
  return "";
}
function safeEqual(a, b) {
  const x = Buffer.from(String(a || ""));
  const y = Buffer.from(String(b || ""));
  return x.length > 0 && x.length === y.length && crypto.timingSafeEqual(x, y);
}
function first(obj, keys, depth = 0) {
  if (!obj || typeof obj !== "object" || depth > 6) return "";
  for (const k of keys) if (obj[k] !== undefined && obj[k] !== null && String(obj[k]).trim() !== "") return obj[k];
  for (const v of Object.values(obj)) if (v && typeof v === "object") {
    const found = first(v, keys, depth + 1);
    if (found !== "") return found;
  }
  return "";
}
function normalizeStatus(raw) {
  const s = String(raw || "").toLowerCase().trim();
  const map = { confirmed:"Dikemas", allocated:"Dikemas", picking_up:"Dikirim", picked:"Dikirim", dropping_off:"Dikirim", delivered:"Beri Penilaian", cancelled:"Dibatalkan", rejected:"Dibatalkan", returned:"Dikembalikan", on_hold:"Ditahan" };
  return map[s] || (s ? String(raw).replace(/_/g, " ") : "Dikirim");
}
function isDelivered(raw) { return ["delivered","success","completed","complete"].includes(String(raw || "").toLowerCase()); }

async function processWebhook(payload) {
  const eventName = String(payload.event || payload.type || payload.name || "order.status");
  const data = payload.data && typeof payload.data === "object" ? payload.data : payload;
  let localOrderId = String(
    first(payload,["local_order_id"]) || first(payload,["reference_id"]) || first(payload,["order_id"]) ||
    (payload.metadata && payload.metadata.local_order_id) || (data.metadata && data.metadata.local_order_id) || ""
  ).trim();
  const biteshipOrderId = String(first(payload,["id"]) || first(data,["id"]) || "").trim();
  const waybill = String(first(payload,["waybill_id","courier_waybill_id"]) || first(data,["waybill_id","courier_waybill_id"]) || "").trim();
  const trackingId = String(first(payload,["tracking_id","courier_tracking_id"]) || first(data,["tracking_id","courier_tracking_id"]) || "").trim();
  const courierCompany = String(first(payload,["company","courier_company"]) || first(data,["company","courier_company"]) || "").trim();
  const courierType = String(first(payload,["courier_type","type"]) || first(data,["courier_type","type"]) || "").trim();
  const rawStatus = String(first(payload,["status","order_status"]) || first(data,["status","order_status"]) || "").trim();
  const price = Number(first(payload,["price"]) || first(data,["price"]) || 0);
  const trackingUrl = String(first(payload,["link","courier_link"]) || first(data,["link","courier_link"]) || "").trim();

  const admin = getFirebaseAdmin();
  const db = admin.database();
  let orderRef = localOrderId ? db.ref("pesanan/" + localOrderId) : null;
  let orderSnap = orderRef ? await orderRef.once("value") : null;
  let order = orderSnap && orderSnap.val();

  if (!order && (biteshipOrderId || trackingId || waybill)) {
    const snap = await db.ref("pesanan").once("value");
    const all = snap.val() || {};
    for (const [id, value] of Object.entries(all)) {
      if (String(value?.biteshipOrderId || "") === biteshipOrderId || String(value?.biteshipTrackingId || "") === trackingId || String(value?.resi || "") === waybill) {
        localOrderId = id; orderRef = db.ref("pesanan/" + id); order = value; break;
      }
    }
  }

  const receivedAt = new Date().toISOString();
  if (!orderRef || !order) {
    await db.ref("biteshipWebhookEvents").push({ receivedAt, event:eventName, payload });
    return { matched:false };
  }

  const now = new Date().toLocaleString("id-ID");
  const nextStatus = normalizeStatus(rawStatus);
  const updates = { statusPengiriman: rawStatus || order.statusPengiriman || "", statusTerakhirDiperbarui: now, biteshipLastWebhookAt: now, biteshipLastEvent: eventName };
  if (biteshipOrderId) updates.biteshipOrderId = biteshipOrderId;
  if (waybill) updates.resi = waybill;
  if (trackingId) updates.biteshipTrackingId = trackingId;
  if (courierCompany) updates.biteshipCourier = courierCompany;
  if (courierType) updates.biteshipCourierType = courierType;
  if (trackingUrl) updates.biteshipTrackingUrl = trackingUrl;
  if (price > 0) updates.biteshipShippingPrice = price;
  if (eventName === "order.status" || rawStatus) {
    updates.status = nextStatus;
    updates.statusKategori = nextStatus;
    if (isDelivered(rawStatus) && String(order.metodePembayaran || "").toUpperCase() === "COD") {
      updates.statusPembayaran = "COD - Menunggu Pencairan";
      updates.codDeliveredAt = now;
    }
  }
  await orderRef.update(updates);

  if (order.invoice) {
    const trackRef = db.ref("pelacakan/" + order.invoice);
    const trackSnap = await trackRef.once("value");
    const track = trackSnap.val() || {};
    const history = Array.isArray(track.riwayatStatus) ? track.riwayatStatus : [];
    if (rawStatus) history.push({ status: nextStatus, waktu: now, sumber: "Biteship" });
    await trackRef.update({ invoice:order.invoice, nama:order.nama||"", total:Number(order.total||0), status:nextStatus, statusKategori:nextStatus, resi:waybill||order.resi||track.resi||"", kurir:courierCompany||order.biteshipCourier||order.kurirKode||"", biteshipOrderId:biteshipOrderId||order.biteshipOrderId||"", biteshipTrackingUrl:trackingUrl||order.biteshipTrackingUrl||"", updatedAt:now, riwayatStatus:history.slice(-20) });
  }
  await db.ref("biteshipWebhookEvents").push({ receivedAt, event:eventName, orderId:localOrderId, biteshipOrderId, waybill, status:rawStatus, payload });
  return { matched:true, orderId:localOrderId };
}

exports.handler = async event => {
  const method = String(event.httpMethod || "GET").toUpperCase();
  if (["GET","HEAD","OPTIONS"].includes(method)) return ok();
  if (method !== "POST") return json(405,{success:false,message:"Method harus POST."});

  const rawBody = String(event.body ?? "").trim();
  // Biteship installation validation: empty application/json POST.
  if (!rawBody) return ok();

  let payload;
  try { payload = JSON.parse(rawBody); } catch { return ok(); }

  // A neutral validation payload (event/type only) is accepted without auth.
  const hasOrderData = Boolean(first(payload,["id","order_id","reference_id","waybill_id","tracking_id","status","order_status"]) || payload.price !== undefined || (payload.data && first(payload.data,["id","order_id","reference_id","waybill_id","tracking_id","status","order_status"])) || (payload.data && payload.data.price !== undefined));
  if (!hasOrderData) return ok();

  const key = String(process.env.BITESHIP_WEBHOOK_SIGNATURE_KEY || process.env.BITESHIP_WEBHOOK_HEADER_KEY || "").trim();
  const secret = String(process.env.BITESHIP_WEBHOOK_SIGNATURE_SECRET || process.env.BITESHIP_WEBHOOK_HEADER_SECRET || "").trim();
  if (key && secret) {
    const received = headerValue(event.headers,key);
    if (!safeEqual(received,secret)) return json(401,{success:false,message:"Signature webhook tidak valid."});
  }

  try {
    const result = await processWebhook(payload);
    return json(200,{success:true,received:true,...result});
  } catch (err) {
    console.error("biteship-webhook:",err);
    return json(500,{success:false,message:err.message || "Webhook gagal diproses."});
  }
};
