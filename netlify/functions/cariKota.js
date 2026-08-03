exports.handler = async () => {

  const response = await fetch(
    "https://rajaongkir.komerce.id/api/v1/destination/domestic-destination?search=Majalengka",
    {
      headers: {
        key: "zj7KY4pl909d2fa9a32db82bosZJg5gg"
      }
    }
  );

  const data = await response.json();

  return {
    statusCode: 200,
    body: JSON.stringify(data)
  };

};