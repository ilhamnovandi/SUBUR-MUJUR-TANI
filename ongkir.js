exports.handler = async (event) => {

  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      body: JSON.stringify({
        error: "Method tidak diizinkan"
      })
    };
  }

  try {

    const body = JSON.parse(event.body);

    if (
      !body.origin ||
      !body.destination ||
      !body.weight ||
      !body.courier
    ) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: "Data pengiriman belum lengkap"
        })
      };
    }

    const response = await fetch(
      "https://rajaongkir.komerce.id/api/v1/calculate/domestic-cost",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "key": "zj7KY4pl909d2fa9a32db82bosZJg5gg"
        },
        body: JSON.stringify({
          origin: body.origin,
          destination: body.destination,
          weight: Number(body.weight),
          courier: body.courier
        })
      }
    );

    const hasil = await response.json();

    if (!response.ok) {
      return {
        statusCode: response.status,
        body: JSON.stringify(hasil)
      };
    }

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(hasil)
    };

  } catch (err) {

    return {
      statusCode: 500,
      body: JSON.stringify({
        error: err.message
      })
    };

  }

};