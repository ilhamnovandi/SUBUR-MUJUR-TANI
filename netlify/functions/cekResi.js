exports.handler = async (event) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json"
  };
  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers, body: "" };
  if (event.httpMethod !== "POST") return { statusCode: 405, headers, body: JSON.stringify({success:false,message:"Method harus POST."}) };
  try {
    const body = JSON.parse(event.body || "{}");
    const waybill = String(body.waybill_id || "").trim();
    const courier = String(body.courier_code || "").trim().toLowerCase();
    const apiKey = process.env.BITESHIP_API_KEY;
    if (!apiKey) throw new Error("BITESHIP_API_KEY belum dibuat di Netlify Environment Variables.");
    if (!waybill) throw new Error("Nomor resi wajib diisi.");
    if (!courier) throw new Error("Kurir wajib dipilih.");
    const url = "https://api.biteship.com/v1/trackings/" + encodeURIComponent(waybill) + "/couriers/" + encodeURIComponent(courier);
    const response = await fetch(url, { method:"GET", headers:{authorization:apiKey, "content-type":"application/json"} });
    const data = await response.json();
    if (!response.ok || data.success === false) return { statusCode: response.status || 500, headers, body: JSON.stringify({success:false,message:data.message || "Resi tidak ditemukan.",detail:data}) };
    return { statusCode:200, headers, body:JSON.stringify({success:true, waybill_id:data.waybill_id || waybill, status:data.status || "-", courier:data.courier || {}, history:Array.isArray(data.history)?data.history:[], link:data.link || ""}) };
  } catch(error) {
    return { statusCode:500, headers, body:JSON.stringify({success:false,message:error.message || "Gagal mengecek resi."}) };
  }
};
