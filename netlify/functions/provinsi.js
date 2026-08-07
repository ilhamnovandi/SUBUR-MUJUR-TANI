exports.handler = async () => {
    try {

        const response = await fetch(
            `https://api.binderbyte.com/wilayah/povinsi?api_key=${process.env.BINDERBYTE_API_KEY}`
        );

        const result = await response.json();

        if (!response.ok || !result.result) {
            return {
                statusCode: response.status || 500,
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    success: false,
                    message: result.message || "Gagal mengambil data provinsi"
                })
            };
        }

        const options = result.value.map(provinsi => {
            return `<option value="${provinsi.id}">${provinsi.name}</option>`;
        }).join("");

        return {
            statusCode: 200,
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                success: true,
                options: options
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