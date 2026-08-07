exports.handler = async (event) => {
  try {
    const { origin, destination, weight, courier } = JSON.parse(event.body);

    const response = await fetch("https://api.binderbyte.com/v1/cost", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        api_key: "sk_husliy3rcpuepdldrvbinxsmlxjv3tbuurerm9he7nw9ajnvldhmuwngwwfu9spa",
        origin,
        destination,
        weight,
        courier,
      }),
    });

    const result = await response.json();

    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
      },
      body: JSON.stringify(result),
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        success: false,
        message: err.message,
      }),
    };
  }
};