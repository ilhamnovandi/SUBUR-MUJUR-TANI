exports.handler = async (event) => {

    try {

        const kecamatan = event.queryStringParameters.kecamatan;

        if (!kecamatan) {

            return {
                statusCode: 400,
                body: JSON.stringify({
                    success:false,
                    message:"Parameter kecamatan wajib diisi"
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


        const hasil = await response.json();


        return {

            statusCode:200,

            headers:{
                "Content-Type":"application/json"
            },

            body:JSON.stringify(hasil)

        };


    } catch(error){

        return {

            statusCode:500,

            body:JSON.stringify({
                error:error.message
            })

        };

    }

};