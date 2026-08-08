exports.handler = async (event) => {
  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ success: false, message: "Method harus POST." }),
    };
  }

  try {
    const body = JSON.parse(event.body || "{}");
    const { origin, destination, weight, courier } = body;

    const apiKey = process.env.BINDERBYTE_API_KEY;
    const originEnv = process.env.BINDERBYTE_ORIGIN;

    if (!apiKey) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          success: false,
          message: "BINDERBYTE_API_KEY belum diatur di Netlify Environment Variables.",
        }),
      };
    }

    const finalOrigin = String(origin || originEnv || "").trim();
    const finalDestination = String(destination || "").trim();
    const courierAliases = { idexpress: "ide", id: "ide", jnt: "jnt" };
    const finalCourier = courierAliases[String(courier || "").trim().toLowerCase()] || String(courier || "").trim().toLowerCase();
    const finalWeight = Number(weight);

    if (!finalOrigin || !finalDestination || !finalCourier || !Number.isFinite(finalWeight) || finalWeight <= 0) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          success: false,
          message: "Origin, destination, courier, dan weight wajib diisi dengan benar.",
        }),
      };
    }

    // BinderByte menerima request application/x-www-form-urlencoded.
    const params = new URLSearchParams({
      api_key: apiKey,
      origin: finalOrigin,
      destination: finalDestination,
      weight: String(finalWeight),
      courier: finalCourier,
    });

    const response = await fetch("https://api.binderbyte.com/v1/cost", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });

    const result = await response.json();

    if (!response.ok || String(result.code) !== "200") {
      return {
        statusCode: response.status || 400,
        headers,
        body: JSON.stringify({
          success: false,
          message: result.message || "BinderByte gagal menghitung ongkir.",
          binderbyte: result,
        }),
      };
    }

    // Ubah response BinderByte menjadi format yang dipakai index.html.
    const pricing = [];
    for (const courierResult of result.data?.results || []) {
      for (const service of courierResult.costs || []) {
        pricing.push({
          courier_code: courierResult.code || finalCourier,
          courier_name: courierResult.name || courierResult.code || finalCourier.toUpperCase(),
          courier_service_code: service.service || "",
          courier_service_name: service.service || "Layanan",
          price: Number(service.cost || 0),
          duration: service.etd || "-",
          description: service.description || "",
        });
      }
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        pricing,
        data: result.data,
      }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        message: err.message || "Terjadi kesalahan pada server ongkir.",
      }),
    };
  }
};
