exports.handler = async () => {

    try {

        const response = await fetch(
            `https://api.binderbyte.com/v1/listprovinsi?api_key=${process.env.BINDERBYTE_API_KEY}`
        );

        const result = await response.json();

        return {
            statusCode: 200,
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(result)
        };

    } catch (err) {

        return {
            statusCode: 500,
            body: JSON.stringify({
                success: false,
                message: err.message
            })
        };

    }

};