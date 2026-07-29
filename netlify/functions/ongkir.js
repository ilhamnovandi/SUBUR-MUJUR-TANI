exports.handler = async (event) => {

  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      },
      body: JSON.stringify({
        success: false,
        message: "Method tidak diizinkan"
      })
    };
  }

  try {

    const body = JSON.parse(event.body);

    const {
      origin,
      destination,
      weight,
      courier
    } = body;

    if (!origin || !destination || !weight || !courier) {
      return {
        statusCode: 400,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        },
        body: JSON.stringify({
          success: false,
          message: "Data pengiriman belum lengkap"
        })
      };
    }


    const response = await fetch(
      "https://rajaongkir.komerce.id/api/v1/calculate/domestic-cost",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "key": process.env.RAJAONGKIR_KEY
        },
        body: JSON.stringify({
          origin: origin,
          destination: destination,
          weight: Number(weight),
          courier: courier
        })
      }
    );


    const result = await response.json();


    return {
      statusCode: response.status,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      },
      body: JSON.stringify(result)
    };


  } catch (error) {

    return {
      statusCode: 500,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      },
      body: JSON.stringify({
        success: false,
        message: error.message
      })
    };

  }

};
