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
    const { destination, destinationPostalCode, weight, courier, items } = body;

    const apiKey = process.env.BITESHIP_API_KEY;
    const originPostalCode = String(process.env.BITESHIP_ORIGIN_POSTAL_CODE || "").trim();

    if (!apiKey) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          success: false,
          message: "BITESHIP_API_KEY belum diatur di Netlify Environment Variables.",
        }),
      };
    }

    if (!/^[0-9]{5}$/.test(originPostalCode)) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          success: false,
          message: "BITESHIP_ORIGIN_POSTAL_CODE belum diatur atau bukan kode pos 5 digit.",
        }),
      };
    }

    const finalDestinationPostalCode = String(
      destinationPostalCode || destination || ""
    ).trim();

    if (!/^[0-9]{5}$/.test(finalDestinationPostalCode)) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          success: false,
          message: "Kode Pos tujuan harus 5 angka.",
        }),
      };
    }

    const finalCourier = String(courier || "").trim().toLowerCase();
    const totalWeight = Number(weight || 0);

    if (!finalCourier || !Number.isFinite(totalWeight) || totalWeight <= 0) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          success: false,
          message: "Ekspedisi dan berat paket wajib diisi.",
        }),
      };
    }

    const safeItems = Array.isArray(items) && items.length
      ? items.map((item, index) => ({
          name: String(item.name || `Produk ${index + 1}`),
          description: String(item.description || "Bibit tanaman"),
          value: Math.max(0, Number(item.value || 0)),
          weight: Math.max(1, Math.round(Number(item.weight || 0))),
          quantity: Math.max(1, Math.round(Number(item.quantity || 1))),
        }))
      : [{
          name: "Paket Bibit Tanaman",
          description: "Paket pesanan",
          value: 0,
          weight: Math.max(1, Math.round(totalWeight * 1000)),
          quantity: 1,
        }];

    const payload = {
      origin_postal_code: Number(originPostalCode),
      destination_postal_code: Number(finalDestinationPostalCode),
      couriers: finalCourier,
      items: safeItems,
    };

    const response = await fetch("https://api.biteship.com/v1/rates/couriers", {
      method: "POST",
      headers: {
        "authorization": apiKey,
        "content-type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const result = await response.json();

    if (!response.ok || result.success === false) {
      return {
        statusCode: response.status || 400,
        headers,
        body: JSON.stringify({
          success: false,
          message: result.message || "Biteship gagal menghitung ongkir.",
          biteship: result,
        }),
      };
    }

    const pricing = Array.isArray(result.pricing)
      ? result.pricing.map((service) => ({
          courier_code: service.courier_code || service.company || finalCourier,
          courier_name: service.courier_name || service.company || finalCourier.toUpperCase(),
          courier_service_code: service.courier_service_code || service.type || "",
          courier_service_name: service.courier_service_name || "Layanan",
          price: Number(service.price ?? service.shipping_fee ?? 0),
          duration: service.duration || (
            service.shipment_duration_range
              ? `${service.shipment_duration_range} ${service.shipment_duration_unit || ""}`.trim()
              : "-"
          ),
          description: service.description || "",
          shipping_type: service.shipping_type || "parcel",
          service_type: service.service_type || "",
        }))
      : [];

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        pricing,
        origin: result.origin,
        destination: result.destination,
        biteship: result,
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
