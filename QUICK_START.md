# Herbal Health Hub - Quick Start Guide

## Project Status: Preview build

The Herbal Health Hub preview is ready to run locally. Live commerce and care services still need provider integrations.

## 🚀 Quick Start

### Option 1: Development Mode (Recommended for Development)
```bash
npm install --legacy-peer-deps
npm run dev
```
Then open the Vite URL shown in the terminal (usually **http://localhost:3000**).

The development server includes:
- Hot module replacement (HMR) for instant updates
- Source maps for easy debugging
- Full TypeScript checking

### Option 2: Production Mode (For Deployment)
```bash
npm install --legacy-peer-deps
npm run build
npm start
```
Then open: **http://localhost:3001**

The production build:
- Optimizes and minifies all assets
- Generates ~370KB of JavaScript
- Serves optimized static files from Node.js

## Preview capabilities and limitations

| Capability | Status |
|-------|--------|
| Homepage clarity, gradient style and trust disclosures | ✅ Updated |
| Demo expert profiles and map pins | ✅ Clearly labeled |
| Consent-gated anonymous analytics | ✅ First-party, in-memory counts |
| Appointment request form | ✅ Preview only; no provider notification or confirmation |
| Peer-to-peer video and text chat | ✅ Browser-to-browser; HTTPS/localhost and network permitting |
| Rechargeable rupee wallet | ✅ Verified Razorpay card or UPI/QR checkout; account + server setup required |
| Basket checkout | ✅ Razorpay card/UPI when configured, direct UPI QR with manual bank verification, or guest cash-on-delivery order; catalog and fulfilment remain previews |

## ✨ Features Working

- ✅ Product search and general wellness discovery
- ✅ Product filtering (All/Fruit/Herb)
- ✅ Product cards with details and prices
- ✅ Appointment request preview, peer-to-peer voice/video chat, and rupee wallet billing
- ✅ Care map preview (sample pins are not verified)
- ✅ Basket review; Razorpay requires merchant/database setup; direct UPI QR needs a merchant UPI ID and manual payment verification; cash-on-delivery orders can be recorded locally or in MongoDB
- ✅ Educational content
- ✅ Responsive design
- ✅ Theme support
- ✅ Type-safe TypeScript codebase

## 🔍 Verification Checklist

Run these commands to verify everything is working:

```bash
# Check TypeScript
npm run check

# Format code
npm run format

# Run in development
npm run dev

# Build for production
npm run build

# Run production server
npm start
```

## 📁 Project Structure

```
herbal-health-hub/
├── client/          → React frontend (Vite + React 19)
├── server/          → Express.js backend for serving static files
├── shared/          → Shared types and utilities
├── dist/            → Production build output
├── vite.config.ts   → Vite configuration (fixed)
├── tsconfig.json    → TypeScript configuration (fixed)
└── package.json     → Dependencies and scripts
```

## 🌐 Browser Support

The application works in all modern browsers:
- Chrome/Edge 90+
- Firefox 88+
- Safari 14+
- Mobile browsers (responsive design)

## 🛠️ Available Scripts

| Script | Purpose |
|--------|---------|
| `npm run dev` | Start development server |
| `npm run build` | Build for production |
| `npm start` | Run production server |
| `npm run check` | TypeScript type checking |
| `npm run format` | Format code with Prettier |
| `npm run preview` | Preview production build |

## 📝 Notes

- The application is a **React frontend** with **Node.js backend**
- MongoDB, Razorpay, Google Maps, and AI providers are optional; live payment stays disabled until prerequisites are configured
- Without MongoDB, local demo accounts are stored in the ignored `.data/users.json` file as salted password hashes; MongoDB is recommended for durable multi-user deployments
- Video rooms use WebRTC with a public STUN server; some networks require a TURN relay, which is not configured
- Appointment requests are saved but are not sent to a clinician or confirmed
- Voice/chat sessions cost ₹5/minute and video sessions ₹10/minute; account wallet balances persist in MongoDB
- Product prices and stock are sample data; paid orders are recorded after Razorpay verifies payment, but fulfillment is not connected
- For live Google Maps, set `VITE_GOOGLE_MAPS_API_KEY` and `VITE_ENABLE_LIVE_MAPS=true` in `.env.local`
- For Razorpay, set server-only `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET`; never expose the secret in a `VITE_*` variable
- Direct UPI QR works without a payment gateway: set the receiving merchant `UPI_VPA`, optional `UPI_PAYEE_NAME`, and an authorized `ADMIN_EMAILS` entry in `.env.local`. The QR opens a standard UPI payment intent and is generated locally; transfers are not automatically verified. Buyers can report that they paid, but an administrator must verify the transfer in the receiving bank account before marking the order paid or releasing fulfilment
- Cash-on-delivery is an order request with payment due at delivery, not an online payment. When MongoDB is unavailable, these orders are stored in `.data/orders.json` and can be relocated with `HEALTH_HUB_ORDERS_FILE`
- The server loads `.env.local` first and `.env` as fallback. Restart the server after changing payment or database settings
- Checkout and wallet top-ups offer card or UPI; Razorpay displays UPI QR scanning when enabled for the merchant account and supported by the checkout device
- Basket checkout does not require an account. Single-use QR generation uses Razorpay's UPI QR API and requires that feature to be enabled for the merchant account; QR payment status is confirmed server-side before an order is recorded
- Use Razorpay test keys first. Live wallet payments require `ENABLE_LIVE_PAYMENTS=true`; live product orders separately require `ENABLE_LIVE_PRODUCT_ORDERS=true`
- Payment settlement requires MongoDB configured as a replica set; set `MONGODB_URI` and optionally `MONGODB_DB`
- For local development, install/start MongoDB as a replica set or use a MongoDB Atlas replica-set URI. The sample `mongodb://localhost:27017/...` URI requires a MongoDB service listening locally
- Set `ADMIN_EMAILS` to a comma-separated allowlist to enable the order-management API
- Keep live product orders disabled until the sample catalog is replaced and fulfillment is ready
- All dependencies have been installed and verified
- The project uses strict TypeScript mode for type safety

## 🎯 Next Steps

1. **Install dependencies**: `npm install --legacy-peer-deps`
2. **Start development**: `npm run dev`
3. **Open browser**: Navigate to `http://localhost:3000`
4. **Start exploring**: Click "Explore" to see the product catalog

## ✅ Success Indicators

When running `npm run dev`, you should see:
```
✓ Vite running on http://localhost:3000
```

When opening the browser, you should see:
- Herbal Health Hub homepage
- "A gentler guide" subtitle
- Search bar with "Explore" button
- Educational content sections below
- Responsive design adapting to your screen size

## 📞 Support

If you encounter any issues:
1. Clear node_modules: `rm -r node_modules && npm install --legacy-peer-deps`
2. Clear dist folder: `rm -r dist`
3. Try dev server again: `npm run dev`

---

**Built with ❤️ for calmer health discovery**
