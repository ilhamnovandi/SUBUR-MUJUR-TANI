const data = require("./desa.json");

exports.handler = async (event) => {

    try {

        const kecamatan = event.queryStringParameters?.kecamatan;

        if (!kecamatan) {
            return {
                statusCode: 400,
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    success: false,
                    error: "Parameter kecamatan wajib diisi."
                })
            };
        }

        const hasil = data.filter(item => item.district_id === kecamatan);

        const options =
            '<option value="">Pilih Desa / Kelurahan</option>' +
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