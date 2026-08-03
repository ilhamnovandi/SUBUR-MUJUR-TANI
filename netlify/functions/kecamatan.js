const fs = require("fs");

const API_KEY = "zj7KY4pl909d2fa9a32db82bosZJg5gg";

const kabupaten = require("./data/kabupaten.json");

let hasilKecamatan = [];


async function ambilKecamatan() {

    console.log("Mulai mengambil data kecamatan...");

    for (const kab of kabupaten) {

        try {

            console.log(
                "Proses:",
                kab.name
            );


            const response = await fetch(
                "https://rajaongkir.komerce.id/api/v1/destination/sub-district?search=" + kab.id,
                {
                    headers:{
                        key: API_KEY
                    }
                }
            );


            const json = await response.json();


            if(json.data){

                json.data.forEach(item => {

                    hasilKecamatan.push({

                        id: item.id,

                        regency_id: kab.id,

                        name: item.name

                    });

                });

            }


        } catch(error){

            console.log(
                "Gagal:",
                kab.name,
                error.message
            );

        }

    }


    fs.writeFileSync(
        "./data/kecamatan.json",
        JSON.stringify(
            hasilKecamatan,
            null,
            2
        )
    );


    console.log(
        "SELESAI. Total kecamatan:",
        hasilKecamatan.length
    );

}


ambilKecamatan();
