# SUBUR MUJUR TANI — CHECKLIST DEPLOY COD

## 1. GitHub
Upload the contents of this folder to the repository. Keep `netlify.toml` and `netlify/functions/`.

## 2. Netlify Environment Variables
Set these in Netlify > Site configuration > Environment variables:

- `BITESHIP_API_KEY`
- `BITESHIP_ORIGIN_POSTAL_CODE`
- `BITESHIP_ORIGIN_CONTACT_NAME`
- `BITESHIP_ORIGIN_CONTACT_PHONE`
- `BITESHIP_ORIGIN_ADDRESS`
- `BITESHIP_ORIGIN_ORGANIZATION`
- `BITESHIP_COD_TYPE` = `7_days` (or `5_days` / `3_days`)
- `FIREBASE_SERVICE_ACCOUNT_JSON`
- `FIREBASE_DATABASE_URL`
- `BITESHIP_WEBHOOK_SIGNATURE_KEY` (optional; leave blank until webhook is created)
- `BITESHIP_WEBHOOK_SIGNATURE_SECRET` (optional; leave blank until webhook is created)
- `BITESHIP_ADMIN_EMAILS` (recommended)

Never put the Biteship API key or Firebase service-account JSON into HTML/JS/GitHub.

## 3. Deploy
Deploy/redeploy the Netlify site after saving the environment variables.

Functions used by COD:
- `/.netlify/functions/create-biteship-order`
- `/.netlify/functions/biteship-webhook`

## 4. Biteship Webhook

Use the exact public function URL after Netlify deployment:

`https://DOMAIN-KAMU/.netlify/functions/biteship-webhook`

Important: do not use the Background Function URL for Biteship. The public endpoint is the one above.

The endpoint accepts Biteship's initial validation request with HTTP 200 and a plain `ok` response. After the webhook is created, configure the signature key/secret in Netlify and in Biteship so real events are authenticated.
After deployment, create a Biteship webhook pointing to:

`https://DOMAIN-KAMU/.netlify/functions/biteship-webhook`

Enable:
- `order.status`
- `order.waybill_id`
- `order.price`

If using signature security, the header key/secret must exactly match the two Netlify variables.

## 5. COD test flow
1. Customer adds product to cart.
2. Customer selects shipping service marked `COD ✓`.
3. Customer selects `COD — Bayar di Tempat`.
4. Order is saved as `Menunggu Konfirmasi COD`.
5. Admin logs in and clicks `Konfirmasi COD & Buat Pengiriman`.
6. Server verifies the admin token and creates the Biteship COD order.
7. The order becomes `Dikemas`; Biteship supplies tracking/waybill data.
8. Webhook updates shipping status automatically.
9. After the customer pays the courier, admin clicks `COD Dibayar`; payment becomes `Lunas (COD)`.

## 6. Staging/testing
Keep Biteship in Staging/Testing while testing. Biteship documents that staging requests behave like live requests except the courier will not pick them up.

Before production, replace the staging/test API key with the production key and use a production webhook configuration.

## 7. Important limitation
COD availability depends on the Biteship account and selected courier/service. A service must report COD support, and the Biteship account must be enabled for that courier's COD feature.

## 8. Webhook validation fix
The public webhook function now accepts GET, HEAD, OPTIONS, and POST validation requests.
An empty POST body and an empty/neutral JSON validation payload return HTTP 200 (`ok`).
Only real webhook events require the configured signature and are forwarded to the background processor.
