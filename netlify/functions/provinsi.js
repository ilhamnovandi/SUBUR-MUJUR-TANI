const data = require("../data/provinsi.json");

exports.handler = async function (event) {

    try {

        const options = data.map(item => {
            return `
            <option value="${item.id}">
                ${item.name}
            </option>
            `;
        }).join("");

        return {

            statusCode: 200,

            headers: {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*"
            },

            body: JSON.stringify({

                success: true,

                data: data,

                options: options

            })

        };


    } catch (error) {


        return {

            statusCode: 500,

            headers: {
                "Content-Type": "application/json"
            },

            body: JSON.stringify({

                success: false,

                error: error.message

            })

        };


    }

};