// ===============================
// FIREBASE CONFIG
// ===============================

const firebaseConfig = {
  apiKey: "AIzaSyCAnApRscAHXJF-NWt3P_BivrvWzGt996U",
  authDomain: "subur-mujur-tani-6ff54.firebaseapp.com",
  databaseURL: "https://subur-mujur-tani-6ff54-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "subur-mujur-tani-6ff54",
  storageBucket: "subur-mujur-tani-6ff54.firebasestorage.app",
  messagingSenderId: "338009458768",
  appId: "1:338009458768:web:c562a610cee4940b856955"
};

// ===============================
// INISIALISASI FIREBASE
// ===============================

firebase.initializeApp(firebaseConfig);

// ===============================
// FIREBASE SERVICES
// ===============================

const auth = firebase.auth();
const db = firebase.firestore();
const storage = firebase.storage();

// ===============================
// LOGIN ADMIN
// ===============================

async function loginAdmin(email, password) {
  try {
    await auth.signInWithEmailAndPassword(email, password);
    alert("Login berhasil");
    window.location.href = "admin.html";
  } catch (err) {
    alert(err.message);
  }
}

// ===============================
// LOGOUT ADMIN
// ===============================

async function logoutAdmin() {
  await auth.signOut();
  window.location.href = "login.html";
}

// ===============================
// SIMPAN PESANAN
// ===============================

async function simpanPesanan(data) {
  try {
    await db.collection("pesanan").add({
      ...data,
      status: "Menunggu Pembayaran",
      waktu: firebase.firestore.FieldValue.serverTimestamp()
    });

    return true;
  } catch (err) {
    console.error(err);
    return false;
  }
}

// ===============================
// AMBIL SEMUA PESANAN
// ===============================

async function ambilPesanan() {

  const snapshot = await db
    .collection("pesanan")
    .orderBy("waktu", "desc")
    .get();

  let hasil = [];

  snapshot.forEach((doc) => {

    hasil.push({
      id: doc.id,
      ...doc.data()
    });

  });

  return hasil;

}

// ===============================
// UBAH STATUS PESANAN
// ===============================

async function ubahStatus(id, statusBaru) {

  await db.collection("pesanan")
  .doc(id)
  .update({
    status: statusBaru
  });

}

// ===============================
// HAPUS PESANAN
// ===============================

async function hapusPesanan(id){

  await db.collection("pesanan")
  .doc(id)
  .delete();

}

// ===============================
// UPLOAD BUKTI TRANSFER
// ===============================

async function uploadBukti(file){

  const namaFile =
  Date.now()+"_"+file.name;

  const ref =
  storage.ref("bukti/"+namaFile);

  await ref.put(file);

  const url =
  await ref.getDownloadURL();

  return url;

}

// ===============================
// CEK LOGIN ADMIN
// ===============================

auth.onAuthStateChanged(function(user){

  if(user){

    console.log("Admin Login");

  }else{

    console.log("Belum Login");

  }

});