const crypto = require("crypto");
const { getFirebaseAdmin } = require("./firebaseAdmin");

const headers = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

function keyForToken(token) {
  return crypto.createHash("sha256").update(String(token)).digest("hex");
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers, body: "" };
  if (event.httpMethod !== "POST") return { statusCode: 405, headers, body: JSON.stringify({success:false,message:"Method harus POST."}) };

  try {
    const authHeader = String(event.headers?.authorization || event.headers?.Authorization || "");
    const idToken = authHeader.replace(/^Bearer\s+/i, "").trim();
    const { token } = JSON.parse(event.body || "{}");
    if (!idToken) return { statusCode: 401, headers, body: JSON.stringify({success:false,message:"Token login admin tidak ditemukan."}) };
    if (!token) return { statusCode: 400, headers, body: JSON.stringify({success:false,message:"FCM token wajib diisi."}) };

    const admin = getFirebaseAdmin();
    const decoded = await admin.auth().verifyIdToken(idToken);
    const allowed = String(process.env.ADMIN_EMAILS || "").split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
    if (allowed.length && !allowed.includes(String(decoded.email || "").toLowerCase())) {
      return { statusCode: 403, headers, body: JSON.stringify({success:false,message:"Akun ini tidak diizinkan menerima notifikasi admin."}) };
    }

    const db = admin.database();
    const tokenKey = keyForToken(token);
    await db.ref("adminNotificationTokens/" + tokenKey).set({
      token,
      uid: decoded.uid || "",
      email: decoded.email || "",
      updatedAt: new Date().toISOString(),
      userAgent: String(event.headers?.["user-agent"] || "").slice(0, 300)
    });

    return { statusCode: 200, headers, body: JSON.stringify({success:true,message:"Perangkat berhasil didaftarkan untuk notifikasi.",tokenKey}) };
  } catch (err) {
    console.error("register-admin-token:", err);
    return { statusCode: 500, headers, body: JSON.stringify({success:false,message:err.message || "Gagal mendaftarkan perangkat."}) };
  }
};
