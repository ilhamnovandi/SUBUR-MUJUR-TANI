const { getFirebaseAdmin } = require("./firebaseAdmin");

function findFirst(obj, keys, depth = 0) {
  if (!obj || typeof obj !== "object" || depth > 6) return "";
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

function normalizeStatus(raw, currentStatus) {
  return currentStatus || "Dikemas";
}

function isDelivered(raw) {
  return ["delivered", "success", "completed", "complete"].includes(String(raw || "").toLowerCase());
}

async function processWebhookPayload(rawBody) {
  const body = String(rawBody || "").trim();
  if (!body) return { success: true, skipped: true };

  const payload = JSON.parse(body);
  const eventName = String(payload.event || payload.type || payload.name || "order.status");
  const data = payload.data || payload;


    // IMPORTANT:
    // `order_id` is the Biteship order ID, NOT our Firebase/local order ID.
    // The local order ID is intentionally stored in metadata when the order
    // is created. Always prefer that value so a Biteship webhook can update
    // pesanan/{localOrderId} reliably.
    const metadataLocalOrderId = String(
      (payload.metadata && payload.metadata.local_order_id) ||
      (data.metadata && data.metadata.local_order_id) ||
      ""
    ).trim();

    let localOrderId = String(
      metadataLocalOrderId ||
      findFirst(payload, ["local_order_id"]) ||
      findFirst(data, ["local_order_id"]) ||
      findFirst(payload, ["reference_id"]) ||
      findFirst(data, ["reference_id"]) ||
      ""
    ).trim();

    // Biteship's order_id is the actual Biteship order identifier. `id` can
    // be an event/object ID depending on the webhook payload, so order_id
    // gets priority for matching against pesanan/{...}.biteshipOrderId.
    const biteshipOrderId = String(
      findFirst(payload, ["order_id"]) ||
      findFirst(data, ["order_id"]) ||
      findFirst(payload, ["id"]) ||
      findFirst(data, ["id"]) ||
      ""
    ).trim();
    const waybill = String(findFirst(payload, ["waybill_id", "courier_waybill_id"]) || findFirst(data, ["waybill_id", "courier_waybill_id"]) || "").trim();
    const trackingId = String(findFirst(payload, ["tracking_id", "courier_tracking_id"]) || findFirst(data, ["tracking_id", "courier_tracking_id"]) || "").trim();
    const courierCompany = String(findFirst(payload, ["company", "courier_company"]) || findFirst(data, ["company", "courier_company"]) || "").trim();
    const courierType = String(findFirst(payload, ["courier_type", "type"]) || findFirst(data, ["courier_type", "type"]) || "").trim();
    const rawStatus = String(findFirst(payload, ["status", "order_status"]) || findFirst(data, ["status", "order_status"]) || "").trim();
    const price = Number(findFirst(payload, ["price", "order_price"]) || findFirst(data, ["price", "order_price"]) || 0);
    const trackingUrl = String(findFirst(payload, ["link", "courier_link"]) || findFirst(data, ["link", "courier_link"]) || "").trim();

    const admin = getFirebaseAdmin();
    const db = admin.database();
    let orderRef = localOrderId ? db.ref("pesanan/" + localOrderId) : null;
    let orderSnap = orderRef ? await orderRef.once("value") : null;
    let order = orderSnap && orderSnap.val();

    if (!order && (biteshipOrderId || trackingId || waybill)) {
      const snap = await db.ref("pesanan").once("value");
      const all = snap.val() || {};
      for (const [id, value] of Object.entries(all)) {
        if (
          String(value?.biteshipOrderId || "") === biteshipOrderId ||
          String(value?.biteshipTrackingId || "") === trackingId ||
          String(value?.resi || "") === waybill
        ) {
          localOrderId = id;
          orderRef = db.ref("pesanan/" + id);
          order = value;
          break;
        }
      }
    }

    // A webhook is considered successfully received even if no local order matches.
    if (!orderRef || !order) {
      await db.ref("biteshipWebhookEvents").push({
        receivedAt: new Date().toISOString(),
        event: eventName,
        payload
      });
      return { success: true, matched: false };
    }

    const now = new Date().toLocaleString("id-ID");
    const nextStatus = normalizeStatus(rawStatus, order.status);
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

    return { success: true, matched: true, orderId: localOrderId };
}

module.exports = { processWebhookPayload };
