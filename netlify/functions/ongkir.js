exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "POST, OPTIONS"
      },
      body: JSON.stringify({
        success: false,
        message: "Method tidak diizinkan"
      })
    };
  }

  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "POST, OPTIONS"
      },
      body: ""
    };
  }

  try {

    const { origin, destination, weight, courier } =
      JSON.parse(event.body);

    const url =
      `https://api.binderbyte.com/v1/cost` +
      `?api_key=sk_husliy3rcpuepdldrvbinxsmlxjv3tbuurerm9he7nw9ajnvldhmuwngwwfu9spa` +
      `&origin=${origin}` +
      `&destination=${destination}` +
      `&weight=${weight}` +
      `&courier=${courier}`;

    const response = await fetch(url);

    const data = await response.json();

    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Content-Type": "application/json"
      },
      body: JSON.stringify(data)
    };

  } catch (err) {

    return {
      statusCode: 500,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        success: false,
        message: err.message
      })
    };

  }

};