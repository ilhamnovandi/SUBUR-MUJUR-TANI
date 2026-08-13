const { getFirebaseAdmin } = require("./firebaseAdmin");

const headers = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers, body: "" };
  if (event.httpMethod !== "POST") return { statusCode: 405, headers, body: JSON.stringify({success:false,message:"Method harus POST."}) };

  try {
    const { orderId } = JSON.parse(event.body || "{}");
    const id = String(orderId || "").trim();
    if (!id) return { statusCode: 400, headers, body: JSON.stringify({success:false,message:"orderId wajib diisi."}) };

    const admin = getFirebaseAdmin();
    const db = admin.database();
    const orderRef = db.ref("pesanan/" + id);
    const snap = await orderRef.once("value");
    if (!snap.exists()) return { statusCode: 404, headers, body: JSON.stringify({success:false,message:"Pesanan tidak ditemukan."}) };

    const order = snap.val() || {};
    if (order.notificationSentAt) {
      return { statusCode: 200, headers, body: JSON.stringify({success:true,alreadySent:true,message:"Notifikasi untuk pesanan ini sudah pernah dikirim."}) };
    }

    const tokenSnap = await db.ref("adminNotificationTokens").once("value");
    const tokenData = tokenSnap.val() || {};
    const entries = Object.entries(tokenData);
    const tokens = entries.map(([,v]) => String(v?.token || "").trim()).filter(Boolean);

    if (!tokens.length) {
      return { statusCode: 200, headers, body: JSON.stringify({success:true,sent:0,message:"Belum ada HP admin yang mengaktifkan notifikasi."}) };
    }

    const invoice = String(order.invoice || id);
    const nama = String(order.nama || "Pelanggan");
    const total = Number(order.total || 0).toLocaleString("id-ID");
    const metode = String(order.metodePembayaran || "-");

    const message = {
      notification: {
        title: "🔔 Pesanan Baru - Subur Mujur Tani",
        body: invoice + " • " + nama + " • Rp " + total
      },
      data: {
        orderId: id,
        invoice,
        nama,
        total,
        metodePembayaran: metode
      },
      webpush: {
        notification: {
          title: "🔔 Pesanan Baru - Subur Mujur Tani",
          body: invoice + " • " + nama + "\\nTotal Rp " + total + " • " + metode,
          icon: "/favicon.ico",
          badge: "/favicon.ico",
          tag: "smt-pesanan-" + id,
          renotify: true,
          requireInteraction: true
        },
        fcmOptions: {
          link: "/admin.html"
        }
      },
      tokens
    };

    const response = await admin.messaging().sendEachForMulticast(message);

    const invalid = [];
    response.responses.forEach((r, i) => {
      if (!r.success) {
        const code = String(r.error?.code || "");
        if (
          code.includes("registration-token-not-registered") ||
          code.includes("invalid-registration-token")
        ) invalid.push(entries[i]?.[0]);
      }
    });

    if (invalid.length) {
      const cleanup = {};
      invalid.forEach(key => { if (key) cleanup["adminNotificationTokens/" + key] = null; });
      await db.ref().update(cleanup);
    }

    await orderRef.update({
      notificationSentAt: new Date().toISOString(),
      notificationSentCount: response.successCount,
      notificationFailedCount: response.failureCount
    });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        sent: response.successCount,
        failed: response.failureCount,
        cleaned: invalid.length
      })
    };
  } catch (err) {
    console.error("notify-new-order:", err);
    return { statusCode: 500, headers, body: JSON.stringify({success:false,message:err.message || "Gagal mengirim notifikasi pesanan."}) };
  }
};
