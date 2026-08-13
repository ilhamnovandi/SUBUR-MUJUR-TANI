/* SUBUR MUJUR TANI - Firebase Cloud Messaging service worker */
importScripts("https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyCAnApRscAHXJF-NWt3P_BivrvWzGt996U",
  authDomain: "subur-mujur-tani-6ff54.firebaseapp.com",
  databaseURL: "https://subur-mujur-tani-6ff54-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "subur-mujur-tani-6ff54",
  storageBucket: "subur-mujur-tani-6ff54.firebasestorage.app",
  messagingSenderId: "338009458768",
  appId: "1:338009458768:web:c562a610cee4940b856955"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage(function(payload) {
  const n = payload.notification || {};
  const d = payload.data || {};
  const title = n.title || "🔔 Pesanan Baru - Subur Mujur Tani";
  const body = n.body || (
    (d.invoice || "Pesanan baru") +
    (d.nama ? " • " + d.nama : "") +
    (d.total ? " • Rp " + d.total : "")
  );

  return self.registration.showNotification(title, {
    body,
    icon: "favicon.ico",
    badge: "favicon.ico",
    tag: d.orderId ? "smt-pesanan-" + d.orderId : "smt-pesanan-baru",
    renotify: true,
    requireInteraction: true,
    data: { url: "admin.html", orderId: d.orderId || "" }
  });
});

self.addEventListener("notificationclick", function(event) {
  event.notification.close();
  const target = new URL(event.notification?.data?.url || "admin.html", self.location.origin).href;
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then(function(clientList) {
      for (const client of clientList) {
        if ("focus" in client) {
          client.navigate(target);
          return client.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(target);
    })
  );
});
