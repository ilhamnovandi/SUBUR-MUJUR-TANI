exports.handler = async (event) => {
  try {

    const search = event.queryStringParameters.search;

    if (!search) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: "Parameter search wajib diisi."
        })
      };
    }

    const response = await fetch(
      "https://rajaongkir.komerce.id/api/v1/destination/domestic-destination?search=" +
      encodeURIComponent(search),
      {
        headers: {
          key: process.env.RAJAONGKIR_KEY
        }
      }
    );

    const data = await response.json();

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(data)
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