# Herbal Health Hub Frontend Integration Notes

## Requirements synthesis

The supplied P075 brief establishes the core journey: a user enters a health concern, explores fruit and herb information, adds products to a cart, places an order, and searches for hospitals by concern. The Online Health Portal Proposal adds a curated catalog, order history, admin-managed content, purchase-pattern recommendations, and a persistent health-content disclaimer. The MERN + AI/ML blueprint adds a decoupled React / Node / FastAPI topology, medical-profile fields, allergy-aware filtering, TF-IDF content matching, and SVD or ALS collaborative recommendations.

## Current delivery and integration boundary

This project contains a React frontend and an Express API. Expert profiles and preferred-time appointment requests remain previews; requests are not sent to clinicians or confirmed. The expert page provides peer-to-peer voice/video and text chat, billed from a signed-in account's rupee wallet at ₹5/minute for voice/chat and ₹10/minute for video. Wallet top-ups use Razorpay Checkout and credit the wallet only after the server verifies the Razorpay signature and captured payment. Wallet top-ups require sign-in. Basket checkout supports guests and lets the customer choose card or UPI; the one-time UPI QR option creates a fixed-amount single-use Razorpay QR and records an order only after the server confirms a captured payment against that QR. Razorpay may also present UPI QR scanning inside Checkout when enabled for the merchant account and supported by the checkout device. Product descriptions, pricing, stock, and fulfillment are still sample/unconnected, so use Razorpay test keys until real inventory and delivery are ready. Payment settlement requires Razorpay credentials and MongoDB configured as a replica set. Single-use UPI QR codes are an on-demand Razorpay feature that must be enabled for the merchant account. Test keys are accepted by default; live wallet funding requires `ENABLE_LIVE_PAYMENTS=true`, while live basket purchases separately require `ENABLE_LIVE_PRODUCT_ORDERS=true`. Video requires camera/microphone permission, HTTPS or localhost, and compatible network paths; no TURN relay is configured. Sample care pins are identified separately. Third-party map-provider results should still be verified directly.

When MongoDB is not configured, demo accounts persist locally in the ignored `.data/users.json` file with salted password hashes so a server restart does not erase them. This local fallback is intended for development; use MongoDB for deployed multi-user accounts. Authentication cookies are server sessions and users must sign in again after a server restart.

The server loads `.env.local` first and `.env` as fallback. Restart the server after updating payment or database settings. Razorpay online payments require merchant credentials and MongoDB transaction support; the sample local MongoDB URI only works while a local replica-set server is running. Single-use Razorpay UPI QR generation also requires Razorpay to enable UPI QR Codes for the merchant account.

An alternative direct UPI QR does not use a gateway: configure the receiving `UPI_VPA`, optional `UPI_PAYEE_NAME`, and an authorized `ADMIN_EMAILS` entry on the server. The app builds a standard UPI payment URI and QR locally. This does not provide a payment webhook, automatic settlement, refunds, or proof that funds arrived. Orders stay unpaid when created; a buyer can report a transfer, after which an administrator must independently verify the bank statement and explicitly mark receipt before the order enters fulfilment. Never mark a transfer received solely because a buyer reports it. Direct UPI QR orders and cash-on-delivery requests persist in `.data/orders.json` when MongoDB is unavailable; set `HEALTH_HUB_ORDERS_FILE` to choose another server-side path.

| Domain | Frontend model | Future service boundary |
| --- | --- | --- |
| Health discovery | `healthConcern`, `symptoms[]`, `recommendations[]` | Catalog and recommendation API |
| Safety | `allergies[]`, `contraindications[]`, `safetyNote` | Deterministic server-side safety gate before recommendation results |
| Expert consultation | `Expert`, `availability`, `consultationMode`, `conversationId`, rupee wallet | Verified clinician directory and schedules; production realtime signaling/telehealth service |
| Nearby care | `CarePlace`, `kind`, `specialty`, `distance`, `position` | Google Places/Geocoding plus hospital directory API |
| Commerce | `CartItem`, `price`, `quantity`, `orderStatus`, Razorpay order/payment signature | Verified catalog, inventory, refunds, fulfillment, tax, and payment operations |
| Recommendations | `reason`, `score`, `relatedProducts[]` | TF-IDF/cosine service plus SVD/ALS aggregate behavior service |

Optional first-party analytics are consent-gated. The browser sends only a fixed event name from an allowlist; it never sends search text, health questions, location, or account details. Counts are in server memory and reset when the server restarts. There is no third-party analytics provider configured.

Before accepting live wallet payments, complete Razorpay merchant verification and configure live credentials with `ENABLE_LIVE_PAYMENTS=true`. Keep `ENABLE_LIVE_PRODUCT_ORDERS=false` until sample catalog data is replaced with real pricing and inventory and fulfillment, refunds, and customer support are connected. MongoDB must run as a replica set for atomic payment settlement and wallet/order updates. Set `ADMIN_EMAILS` to a comma-separated account-email allowlist before granting access to order addresses/status management. Also connect real clinician credentials and schedules, a verified provider directory, and a TURN relay for restrictive video networks. Configure data retention, consent, and privacy disclosures for any additional service that receives user information.

## Content and safety language

The interface uses “support,” “traditional relevance,” and “wellness” language instead of claiming that a product cures a disease. Every consultation and discovery surface includes a clear reminder that the product is informational and does not replace a licensed clinician. The next implementation phase can safely add API adapters once the team chooses the authentication, database, payment, telehealth, and hospital-directory providers.
