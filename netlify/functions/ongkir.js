const https = require("https");

function requestBiteship(apiKey, payload) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);

    const req = https.request(
      {
        hostname: "api.biteship.com",
        path: "/v1/rates/couriers",
        method: "POST",
        headers: {
          "authorization": apiKey,
          "content-type": "application/json",
          "content-length": Buffer.byteLength(body),
          "accept": "application/json"
        },
        timeout: 25000
      },
      (res) => {
        let data = "";
        res.setEncoding("utf8");
        res.on("data", chunk => data += chunk);
        res.on("end", () => {
          let parsed;
          try {
            parsed = data ? JSON.parse(data) : {};
          } catch {
            parsed = { success: false, message: data || "Respons Biteship bukan JSON." };
          }
          resolve({ status: res.statusCode || 500, data: parsed });
        });
      }
    );

    req.on("timeout", () => req.destroy(new Error("Request ke Biteship timeout.")));
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

exports.handler = async (event) => {
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS"
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ success: false, message: "Method harus POST." })
    };
  }

  try {
    const body = JSON.parse(event.body || "{}");
    const apiKey = String(process.env.BITESHIP_API_KEY || "").trim();
    const originPostalCode = String(process.env.BITESHIP_ORIGIN_POSTAL_CODE || "").trim();

    if (!apiKey) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          success: false,
          message: "BITESHIP_API_KEY belum tersedia pada Netlify Function."
        })
      };
    }

    if (!/^\d{5}$/.test(originPostalCode)) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          success: false,
          message: "BITESHIP_ORIGIN_POSTAL_CODE harus berupa kode pos 5 digit."
        })
      };
    }

    const destinationPostalCode = String(
      body.destinationPostalCode || body.destination || ""
    ).trim();

    if (!/^\d{5}$/.test(destinationPostalCode)) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          success: false,
          message: "Kode Pos tujuan harus 5 angka."
        })
      };
    }

    const courier = String(body.courier || "").trim().toLowerCase();
    if (!courier) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ success: false, message: "Ekspedisi wajib dipilih." })
      };
    }

    const inputItems = Array.isArray(body.items) ? body.items : [];
    const fallbackWeightKg = Number(body.weight || 0);
    const fallbackWeightGram = Math.max(1, Math.round(fallbackWeightKg * 1000));

    const items = inputItems.length
      ? inputItems.map((item, i) => ({
          name: String(item.name || `Produk ${i + 1}`),
          description: String(item.description || "Bibit tanaman"),
          category: "outdoor_gear",
          value: Math.max(0, Math.round(Number(item.value || 0))),
          weight: Math.max(1, Math.round(Number(item.weight || 0))),
          quantity: Math.max(1, Math.round(Number(item.quantity || 1)))
        }))
      : [{
          name: "Paket Bibit Tanaman",
          description: "Paket pesanan",
          category: "outdoor_gear",
          value: 0,
          weight: fallbackWeightGram,
          quantity: 1
        }];

    const payload = {
      origin_postal_code: Number(originPostalCode),
      destination_postal_code: Number(destinationPostalCode),
      couriers: courier,
      items
    };

    const result = await requestBiteship(apiKey, payload);

    if (result.status < 200 || result.status >= 300 || result.data.success === false) {
      return {
        statusCode: result.status || 502,
        headers,
        body: JSON.stringify({
          success: false,
          message: result.data.message || "Biteship gagal menghitung ongkir.",
          code: result.data.code || null,
          biteship: result.data
        })
      };
    }

    const pricing = Array.isArray(result.data.pricing)
      ? result.data.pricing.map(service => ({
          courier_code: service.courier_code || service.company || courier,
          courier_name: service.courier_name || service.company || courier.toUpperCase(),
          courier_service_code: service.courier_service_code || service.type || "",
          courier_service_name: service.courier_service_name || "Layanan",
          price: Number(service.price ?? service.shipping_fee ?? 0),
          duration: service.duration ||
            (service.shipment_duration_range
              ? `${service.shipment_duration_range} ${service.shipment_duration_unit || ""}`.trim()
              : "-"),
          description: service.description || "",
          shipping_type: service.shipping_type || "parcel",
          service_type: service.service_type || ""
        }))
      : [];

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        pricing,
        origin: result.data.origin,
        destination: result.data.destination
      })
    };
  } catch (err) {
    return {
      statusCode: 502,
      headers,
      body: JSON.stringify({
        success: false,
        message: err && err.message
          ? `Gagal menghubungi Biteship: ${err.message}`
          : "Gagal menghubungi Biteship."
      })
    };
  }
};
