exports.handler = async (event) => {
  try {
    const province = event.queryStringParameters.province;

    if (!province) {
      return {
        statusCode: 400,
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          success: false,
          error: "Parameter province wajib diisi."
        })
      };
    }

    // Ambil daftar kota berdasarkan provinsi
    const response = await fetch(
      `https://rajaongkir.komerce.id/api/v1/destination/city/${province}`,
      {
        method: "GET",
        headers: {
          key: process.env.RAJAONGKIR_KEY
        }
      }
    );

    const result = await response.json();

    if (!response.ok) {
      return {
        statusCode: response.status,
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(result)
      };
    }

    let options = '<option value="">Pilih Kabupaten / Kota</option>';

    result.data.forEach((item) => {
      options += `
        <option value="${item.id}">
          ${item.name}
        </option>
      `;
    });

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        success: true,
        options,
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
        error: err.message
      })
    };
  }
};
