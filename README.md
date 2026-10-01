# Health Hub

Health Hub is a wellness discovery and consultation preview built with React, TypeScript, Vite, and an Express API. It includes a sample product catalog and cart, appointment requests, peer-to-peer voice/video rooms, wallet features, and checkout integrations.

## Requirements

- Node.js and npm
- Optional: MongoDB replica set for persistent accounts, orders, and Razorpay payment settlement
- Optional: Razorpay credentials for card/UPI gateway checkout
- Optional: receiving merchant UPI ID and administrator email for direct UPI QR with manual transfer verification

## Run locally

```bash
npm install --legacy-peer-deps
npm run dev
```

The development server prints the local Vite URL. To run the production build:

```bash
npm run check
npm run build
npm start
```

Production mode listens on port `3001` by default.

## Environment configuration

Copy `.env.example` to `.env.local` and set only the provider settings you intend to use. Never commit `.env.local` or expose server secrets in `VITE_*` variables.

Razorpay card/UPI settlement requires server-only test credentials and MongoDB configured as a replica set. Direct UPI QR can be generated locally with `UPI_VPA`, `UPI_PAYEE_NAME`, and `ADMIN_EMAILS`; it does not automatically confirm bank transfers. A buyer report is not proof of payment: an authorized administrator must independently confirm receipt before the order can enter fulfilment.

Cash-on-delivery requests can be recorded without a payment provider. When MongoDB is unavailable, demo accounts and orders use local files under the ignored `.data` directory.

## Preview limitations

Product descriptions/prices are sample data and fulfilment is not connected. Expert profiles are illustrative, appointment requests are not sent to clinicians, and video connectivity depends on browser permissions and network support. This preview is informational and is not medical advice or an emergency service.

See [QUICK_START.md](./QUICK_START.md) and [frontend-integration.md](./frontend-integration.md) for setup and integration details.
