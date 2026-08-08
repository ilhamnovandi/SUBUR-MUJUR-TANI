const data = require("./kecamatan.json");

exports.handler = async (event) => {

    try {

        const kabupaten = event.queryStringParameters?.kabupaten;

        if (!kabupaten) {
            return {
                statusCode: 400,
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    success: false,
                    error: "Parameter kabupaten wajib diisi."
                })
            };
        }

        const hasil = data.filter(item => item.regency_id === kabupaten);

        const options =
            '<option value="">Pilih Kecamatan</option>' +
            hasil.map(item => `
<option value="${item.id}">
${item.name}
</option>
`).join("");

        return {
            statusCode: 200,
            headers: {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*"
            },
            body: JSON.stringify({
                success: true,
                data: hasil,
                options
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