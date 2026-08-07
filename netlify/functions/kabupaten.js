const data = require("../../data/kabupaten.json");

exports.handler = async (event) => {
    const province = event.queryStringParameters.province;

    const hasil = data.filter(item => item.province_id === province);

    const options = hasil.map(item => `
<option value="${item.id}">${item.name}</option>
`).join("");

    return {
        statusCode: 200,
        body: JSON.stringify({
            success: true,
            options
        })
    };
};