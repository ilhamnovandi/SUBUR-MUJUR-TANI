const https = require("https");
const { getFirebaseAdmin } = require("./firebaseAdmin");

function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Allow-Methods": "POST, OPTIONS"
    },
    body: JSON.stringify(body)
  };
}

function callBiteship(apiKey, payload) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    const req = https.request({
      hostname: "api.biteship.com",
      path: "/v1/orders",
      method: "POST",
      headers: {
        Authorization: apiKey,
        "Content-Type": "application/json",
        Accept: "application/json",
        "Content-Length": Buffer.byteLength(body)
      },
      timeout: 30000
    }, res => {
      let raw = "";
      res.setEncoding("utf8");
      res.on("data", chunk => raw += chunk);
      res.on("end", () => {
        let data = {};
        try { data = raw ? JSON.parse(raw) : {}; }
        catch { data = { raw }; }
        resolve({ status: res.statusCode || 0, data });
      });
    });
    req.on("timeout", () => req.destroy(new Error("Koneksi ke Biteship timeout (30 detik).")));
    req.on("error", reject);
    req.end(body);
  });
}

function messageOf(data) {
  if (!data) return "Biteship mengembalikan respons kosong.";
  if (typeof data === "string") return data;
  if (data.message) return String(data.message);
  if (data.error) return typeof data.error === "string" ? data.error : JSON.stringify(data.error);
  if (Array.isArray(data.errors) && data.errors.length) {
    return data.errors.map(e => typeof e === "string" ? e : (e.message || JSON.stringify(e))).join("; ");
  }
  return "Biteship menolak pembuatan order COD.";
}

function safe(value, fallback = "") {
  const v = String(value == null ? "" : value).trim();
  return v || fallback;
}

function normalizePhone(phone) {
  let p = String(phone || "").replace(/[^0-9+]/g, "");
  if (p.startsWith("+62")) p = "0" + p.slice(3);
  if (p.startsWith("62")) p = "0" + p.slice(2);
  return p;
}

async function verifyAdminToken(admin, token) {
  if (!token) throw new Error("Token admin tidak ditemukan. Silakan login ulang.");
  const decoded = await admin.auth().verifyIdToken(token);
  const allow = String(process.env.BITESHIP_ADMIN_EMAILS || "")
    .split(",")
    .map(x => x.trim().toLowerCase())
    .filter(Boolean);
  if (allow.length && !allow.includes(String(decoded.email || "").toLowerCase())) {
    throw new Error("Akun ini tidak memiliki izin membuat pengiriman.");
  }
  return decoded;
}

exports.handler = async event => {
  if (event.httpMethod === "OPTIONS") return json(204, {});
  if (event.httpMethod !== "POST") return json(405, { success: false, message: "Method harus POST." });

  try {
    const input = JSON.parse(event.body || "{}");
    const orderId = safe(input.orderId);
    const token = String(input.idToken || "").trim();
    if (!orderId) return json(400, { success: false, message: "orderId wajib diisi." });

    const apiKey = safe(process.env.BITESHIP_API_KEY);
    if (!apiKey) return json(500, { success: false, message: "BITESHIP_API_KEY belum diisi di Netlify." });

    const admin = getFirebaseAdmin();
    await verifyAdminToken(admin, token);
    const db = admin.database();
    const orderRef = db.ref("pesanan/" + orderId);
    const snap = await orderRef.once("value");
    const order = snap.val();

    if (!order) return json(404, { success: false, message: "Pesanan tidak ditemukan." });
    if (String(order.metodePembayaran || "").toUpperCase() !== "COD") {
      return json(400, { success: false, message: "Pesanan ini bukan pesanan COD." });
    }
    if (order.biteshipOrderId || order.resi) {
      return json(409, {
        success: false,
        message: "Pesanan ini sudah memiliki pengiriman Biteship/nomor resi.",
        biteshipOrderId: order.biteshipOrderId || null,
        resi: order.resi || null
      });
    }

    const originPostalCode = safe(process.env.BITESHIP_ORIGIN_POSTAL_CODE);
    const originName = safe(process.env.BITESHIP_ORIGIN_CONTACT_NAME, "Subur Mujur Tani");
    const originPhone = normalizePhone(process.env.BITESHIP_ORIGIN_CONTACT_PHONE);
    const originEmail = safe(process.env.BITESHIP_ORIGIN_CONTACT_EMAIL);
    const originAddress = safe(process.env.BITESHIP_ORIGIN_ADDRESS);
    const organization = safe(process.env.BITESHIP_ORIGIN_ORGANIZATION, "Subur Mujur Tani");

    if (!/^\d{5}$/.test(originPostalCode)) {
      return json(500, { success: false, message: "BITESHIP_ORIGIN_POSTAL_CODE harus 5 digit." });
    }
    if (!originPhone || !originAddress) {
      return json(500, { success: false, message: "BITESHIP_ORIGIN_CONTACT_PHONE dan BITESHIP_ORIGIN_ADDRESS wajib diisi di Netlify." });
    }

    const courierCompany = safe(order.kurirKode || order.kurir).toLowerCase();
    const courierType = safe(order.layananKode);
    if (!courierCompany || !courierType) {
      return json(400, { success: false, message: "Kurir atau kode layanan belum tersimpan. Pilih layanan ongkir lagi sebelum membuat pesanan COD." });
    }

    const destinationPhone = normalizePhone(order.whatsapp);
    const destinationAddress = [
      safe(order.alamat),
      order.rt ? "RT " + safe(order.rt) : "",
      order.rw ? "RW " + safe(order.rw) : ""
    ].filter(Boolean).join(", ");

    if (!safe(order.nama) || !destinationPhone || !destinationAddress || !/^\d{5}$/.test(safe(order.kodePos))) {
      return json(400, { success: false, message: "Data tujuan belum lengkap. Nama, WhatsApp, alamat, dan kode pos wajib valid." });
    }

    const items = Array.isArray(order.produk) ? order.produk.map((item, i) => ({
      name: safe(item.variantNama ? `${item.nama} - ${item.variantNama}` : item.nama, `Produk ${i + 1}`),
      description: "Bibit tanaman",
      category: "outdoor_gear",
      value: Math.max(1, Math.round(Number(item.harga || item.subtotal || 1))),
      quantity: Math.max(1, Math.round(Number(item.jumlah || 1))),
      weight: Math.max(1, Math.round(Number(item.berat || 1000)))
    })) : [];

    if (!items.length) return json(400, { success: false, message: "Produk pesanan kosong." });

    const codAmount = Math.max(1, Math.round(Number(order.total || 0)));
    const payload = {
      shipper_contact_name: originName,
      shipper_contact_phone: originPhone,
      shipper_contact_email: originEmail || undefined,
      shipper_organization: organization,
      origin_contact_name: originName,
      origin_contact_phone: originPhone,
      origin_contact_email: originEmail || undefined,
      origin_address: originAddress,
      origin_postal_code: Number(originPostalCode),
      destination_contact_name: safe(order.nama),
      destination_contact_phone: destinationPhone,
      destination_address: destinationAddress,
      destination_postal_code: Number(order.kodePos),
      destination_cash_on_delivery: codAmount,
      destination_cash_on_delivery_type: safe(process.env.BITESHIP_COD_TYPE, "7_days"),
      courier_company: courierCompany,
      courier_type: courierType,
      delivery_type: "now",
      order_note: `Pesanan ${safe(order.invoice, orderId)} - COD Subur Mujur Tani`,
      metadata: {
        local_order_id: orderId,
        invoice: safe(order.invoice),
        payment_method: "COD"
      },
      items
    };

    // JSON.stringify menghapus properti undefined, tetapi kita tetap bersihkan agar payload rapi.
    Object.keys(payload).forEach(k => payload[k] === undefined && delete payload[k]);

    const result = await callBiteship(apiKey, payload);
    if (result.status < 200 || result.status >= 300 || result.data?.success === false) {
      return json(result.status || 502, {
        success: false,
        message: messageOf(result.data),
        biteship_status: result.status,
        biteship_code: result.data?.code || null,
        biteship_error: result.data?.error || null
      });
    }

    const data = result.data || {};
    const courier = data.courier || {};
    const waybill = safe(courier.waybill_id);
    const trackingId = safe(courier.tracking_id);
    const status = safe(data.status, "confirmed");
    const now = new Date().toLocaleString("id-ID");

    await orderRef.update({
      status: "Buat Pengiriman",
      statusKategori: "Buat Pengiriman",
      statusPengiriman: status,
      statusPembayaran: "COD - Menunggu Penagihan",
      biteshipOrderId: safe(data.id),
      biteshipTrackingId: trackingId,
      resi: waybill,
      biteshipCourier: safe(courier.company, courierCompany),
      biteshipCourierType: safe(courier.type, courierType),
      biteshipTrackingUrl: safe(courier.link),
      biteshipCOD: codAmount,
      biteshipCODType: safe(payload.destination_cash_on_delivery_type),
      biteshipCreatedAt: now,
      statusTerakhirDiperbarui: now
    });

    if (order.invoice) {
      const trackRef = db.ref("pelacakan/" + order.invoice);
      const trackSnap = await trackRef.once("value");
      const track = trackSnap.val() || {};
      const history = Array.isArray(track.riwayatStatus) ? track.riwayatStatus : [];
      history.push({ status: "Buat Pengiriman", waktu: now });
      await trackRef.update({
        invoice: order.invoice,
        nama: order.nama || "",
        total: Number(order.total || 0),
        status: "Buat Pengiriman",
        statusKategori: "Buat Pengiriman",
        resi: waybill || track.resi || "",
        kurir: safe(courier.company, courierCompany),
        biteshipOrderId: safe(data.id),
        biteshipTrackingUrl: safe(courier.link),
        whatsappLast4: String(order.whatsapp || "").replace(/\D/g, "").slice(-4),
        updatedAt: now,
        riwayatStatus: history.slice(-20)
      });
    }

    return json(200, {
      success: true,
      message: "Order COD Biteship berhasil dibuat.",
      orderId,
      biteshipOrderId: safe(data.id),
      waybill_id: waybill,
      tracking_id: trackingId,
      courier_company: safe(courier.company, courierCompany),
      courier_type: safe(courier.type, courierType),
      status
    });
  } catch (err) {
    console.error("create-biteship-order:", err);
    return json(500, { success: false, message: err.message || "Gagal membuat order Biteship." });
  }
};
