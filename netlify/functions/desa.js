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
                    success:false,
                    message:"Kecamatan kosong"
                })
            };

        }


        const response = await fetch(
            "https://rajaongkir.komerce.id/api/v1/destination/sub-district?search=" + kecamatan,
            {
                headers:{
                    key:"zj7KY4pl909d2fa9a32db82bosZJg5gg"
                }
            }
        );


        const data = await response.json();


        return {
            statusCode:200,
            headers:{
                "Content-Type":"application/json",
                "Access-Control-Allow-Origin":"*"
            },
            body:JSON.stringify(data)
        };


    } catch(error) {

        return {
            statusCode:500,
            headers:{
                "Content-Type":"application/json"
            },
            body:JSON.stringify({
                error:error.message
            })
        };

    }

};
