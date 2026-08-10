const crypto = require("crypto");
const { getFirebaseAdmin } = require("./firebaseAdmin");

function response(statusCode, body) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json; charset=utf-8" },
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

function findFirst(obj, keys, depth = 0) {
  if (!obj || typeof obj !== "object" || depth > 5) return "";
  for (const key of keys) {
    if (obj[key] !== undefined && obj[key] !== null && String(obj[key]).trim() !== "") return obj[key];
  }
  for (const value of Object.values(obj)) {
    if (value && typeof value === "object") {
      const found = findFirst(value, keys, depth + 1);
      if (found !== "") return found;
    }
  }
  return "";
}

function normalizeStatus(raw) {
  const s = String(raw || "").toLowerCase().trim();
  const map = {
    confirmed: "Dikemas",
    allocated: "Dikemas",
    picking_up: "Dikirim",
    picked: "Dikirim",
    dropping_off: "Dikirim",
    delivered: "Beri Penilaian",
    cancelled: "Dibatalkan",
    rejected: "Dibatalkan",
    returned: "Dikembalikan",
    on_hold: "Ditahan"
  };
  return map[s] || (s ? String(raw).replace(/_/g, " ") : "Dikirim");
}

function isDelivered(raw) {
  return ["delivered", "success", "completed", "complete"].includes(String(raw || "").toLowerCase());
}

exports.handler = async event => {
  if (event.httpMethod === "OPTIONS") return response(204, {});
  if (event.httpMethod !== "POST") return response(405, { success: false, message: "Method harus POST." });

  try {
    const signatureKey = String(process.env.BITESHIP_WEBHOOK_SIGNATURE_KEY || "").trim();
    const signatureSecret = String(process.env.BITESHIP_WEBHOOK_SIGNATURE_SECRET || "").trim();
    if (!signatureKey || !signatureSecret) {
      return response(500, { success: false, message: "Webhook belum diamankan. Isi BITESHIP_WEBHOOK_SIGNATURE_KEY dan BITESHIP_WEBHOOK_SIGNATURE_SECRET di Netlify." });
    }

    const receivedSecret = headerValue(event.headers, signatureKey);
    if (!receivedSecret || !crypto.timingSafeEqual(Buffer.from(receivedSecret), Buffer.from(signatureSecret))) {
      return response(401, { success: false, message: "Signature webhook tidak valid." });
    }

    const payload = JSON.parse(event.body || "{}");
    const eventName = String(payload.event || payload.type || payload.name || "order.status");
    const data = payload.data || payload;

    let localOrderId = String(
      findFirst(payload, ["local_order_id"]) ||
      findFirst(payload, ["order_id"]) ||
      findFirst(payload, ["reference_id"]) ||
      (payload.metadata && payload.metadata.local_order_id) ||
      (data.metadata && data.metadata.local_order_id) ||
      ""
    ).trim();

    const biteshipOrderId = String(findFirst(payload, ["id"]) || findFirst(data, ["id"]) || "").trim();
    const waybill = String(findFirst(payload, ["waybill_id"]) || "").trim();
    const trackingId = String(findFirst(payload, ["tracking_id"]) || "").trim();
    const courierCompany = String(findFirst(payload, ["company", "courier_company"]) || "").trim();
    const courierType = String(findFirst(payload, ["courier_type", "type"]) || "").trim();
    const rawStatus = String(findFirst(payload, ["status", "order_status"]) || "").trim();
    const price = Number(findFirst(payload, ["price"]) || 0);
    const trackingUrl = String(findFirst(payload, ["link"]) || "").trim();

    const admin = getFirebaseAdmin();
    const db = admin.database();
    let orderRef = localOrderId ? db.ref("pesanan/" + localOrderId) : null;
    let orderSnap = orderRef ? await orderRef.once("value") : null;
    let order = orderSnap && orderSnap.val();

    // Fallback: cari pesanan berdasarkan Biteship order ID / resi bila metadata tidak ikut terkirim.
    if (!order && biteshipOrderId) {
      const snap = await db.ref("pesanan").once("value");
      const all = snap.val() || {};
      for (const [id, value] of Object.entries(all)) {
        if (String(value?.biteshipOrderId || "") === biteshipOrderId || String(value?.biteshipTrackingId || "") === biteshipOrderId) {
          localOrderId = id;
          orderRef = db.ref("pesanan/" + id);
          order = value;
          break;
        }
      }
    }

    if (!orderRef || !order) {
      await db.ref("biteshipWebhookEvents").push({ receivedAt: new Date().toISOString(), event: eventName, payload });
      return response(200, { success: true, matched: false });
    }

    const now = new Date().toLocaleString("id-ID");
    const nextStatus = normalizeStatus(rawStatus);
    const updates = {
      statusPengiriman: rawStatus || order.statusPengiriman || "",
      statusTerakhirDiperbarui: now,
      biteshipLastWebhookAt: now,
      biteshipLastEvent: eventName
    };

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
      await trackRef.update({
        invoice: order.invoice,
        nama: order.nama || "",
        total: Number(order.total || 0),
        status: nextStatus,
        statusKategori: nextStatus,
        resi: waybill || order.resi || track.resi || "",
        kurir: courierCompany || order.biteshipCourier || order.kurirKode || "",
        biteshipOrderId: biteshipOrderId || order.biteshipOrderId || "",
        biteshipTrackingUrl: trackingUrl || order.biteshipTrackingUrl || "",
        updatedAt: now,
        riwayatStatus: history.slice(-20)
      });
    }

    await db.ref("biteshipWebhookEvents").push({
      receivedAt: new Date().toISOString(),
      event: eventName,
      orderId: localOrderId,
      biteshipOrderId,
      waybill,
      status: rawStatus,
      payload
    });

    return response(200, { success: true, matched: true, orderId: localOrderId });
  } catch (err) {
    console.error("biteship-webhook:", err);
    return response(500, { success: false, message: err.message || "Webhook gagal diproses." });
  }
};
