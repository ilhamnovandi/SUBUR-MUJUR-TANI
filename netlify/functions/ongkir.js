exports.handler = async (event) => {

  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json"
  };

  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      headers,
      body: ""
    };
  }

  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({
        success: false,
        message: "Method harus POST."
      })
    };
  }

  try {

    const body = JSON.parse(event.body || "{}");

    const destinationPostalCode = String(
      body.destination_postal_code || ""
    ).trim();

    const courier = String(body.courier || "").trim().toLowerCase();

    const items = Array.isArray(body.items) ? body.items : [];

    const originPostalCode = String(
      process.env.BITESHIP_ORIGIN_POSTAL_CODE || ""
    ).trim();

    const apiKey = process.env.BITESHIP_API_KEY;

    if (!apiKey) {
      throw new Error(
        "BITESHIP_API_KEY belum dibuat di Netlify Environment Variables."
      );
    }

    if (!originPostalCode) {
      throw new Error(
        "BITESHIP_ORIGIN_POSTAL_CODE belum dibuat di Netlify Environment Variables."
      );
    }

    if (!/^\d{5}$/.test(destinationPostalCode)) {
      throw new Error("Kode pos tujuan harus 5 angka.");
    }

    if (!/^\d{5}$/.test(originPostalCode)) {
      throw new Error("BITESHIP_ORIGIN_POSTAL_CODE harus 5 angka.");
    }

    if (!courier) {
      throw new Error("Ekspedisi belum dipilih.");
    }

    if (!items.length) {
      throw new Error("Keranjang tidak memiliki produk.");
    }

    const cleanItems = items.map((item, index) => ({
      name: String(item.name || `Produk ${index + 1}`),
      description: String(item.description || item.name || "Produk"),
      category: String(item.category || "others"),
      value: Math.max(0, Number(item.value || 0)),
      quantity: Math.max(1, Number(item.quantity || 1)),
      weight: Math.max(1, Number(item.weight || 1000))
    }));

    const payload = {
      origin_postal_code: Number(originPostalCode),
      destination_postal_code: Number(destinationPostalCode),
      couriers: courier,
      items: cleanItems
    };

    console.log("REQUEST BITESHIP:", JSON.stringify(payload));

    const response = await fetch(
      "https://api.biteship.com/v1/rates/couriers",
      {
        method: "POST",
        headers: {
          "authorization": apiKey,
          "content-type": "application/json"
        },
        body: JSON.stringify(payload)
      }
    );

    const data = await response.json();

    console.log("RESPON BITESHIP:", JSON.stringify(data));

    if (!response.ok || data.success === false) {
      return {
        statusCode: response.status || 500,
        headers,
        body: JSON.stringify({
          success: false,
          message:
            data.message ||
            "Biteship gagal menghitung tarif.",
          code: data.code || null,
          detail: data
        })
      };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        message: data.message || "Ongkir berhasil dihitung.",
        pricing: Array.isArray(data.pricing) ? data.pricing : [],
        origin: data.origin || null,
        destination: data.destination || null
      })
    };

  } catch (error) {

    console.error("ERROR ONGKIR BITESHIP:", error);

    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        message: error.message || "Terjadi kesalahan saat menghitung ongkir."
      })
    };
  }
};
