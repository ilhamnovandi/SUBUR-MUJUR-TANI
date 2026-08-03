exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        success: false,
        message: "Method tidak diizinkan"
      })
    };
  }

  try {
    const { origin, destination, weight, courier } = JSON.parse(event.body);

    if (!origin || !destination || !weight || !courier) {
      return {
        statusCode: 400,
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          success: false,
          message: "Origin, destination, weight, dan courier wajib diisi."
        })
      };
    }

    const body = new URLSearchParams({
      origin: origin.toString(),
      destination: destination.toString(),
      weight: weight.toString(),
      courier: courier.toString()
    });

    const response = await fetch(
      "https://rajaongkir.komerce.id/api/v1/calculate/domestic-cost",
      {
        method: "POST",
        headers: {
          "key": process.env.RAJAONGKIR_KEY,
          "Content-Type": "application/x-www-form-urlencoded"
        },
        body: body.toString()
      }
    );

    const result = await response.json();

    if (!response.ok) {
      return {
        statusCode: response.status,
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          success: false,
          message: result.meta?.message || result.message || "Gagal menghitung ongkir",
          result
        })
      };
    }

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        success: true,
        data: result.data
      })
    };

  } catch (err) {

    return {
      statusCode: 500,
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        success: false,
        message: err.message
      })
    };

  }
};