import mongoose from "mongoose";

const mongoUri = process.env.MONGODB_URI;

export async function connectMongo() {
  if (!mongoUri) {
    return null;
  }

  try {
    await mongoose.connect(mongoUri, {
      dbName: process.env.MONGODB_DB || undefined,
      serverSelectionTimeoutMS: 5_000,
    });
    console.log("MongoDB connected successfully.");
    return mongoose;
  } catch (error) {
    console.warn("MongoDB connection unavailable; using demo store mode.", error);
    return null;
  }
}

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true, index: true },
    passwordHash: { type: String, required: true },
    walletBalance: { type: Number, default: 0, min: 0 },
    createdAt: { type: Date, default: Date.now },
  },
  { collection: "users" },
);

const orderSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, index: true },
    customer: { type: String, default: "" },
    address: { type: String, default: "" },
    items: [{ type: String }],
    total: { type: Number, default: 0 },
    status: { type: String, default: "paid" },
    paymentMethod: { type: String, enum: ["razorpay", "cash_on_delivery", "upi_qr_manual"], default: "razorpay" },
    paymentStatus: { type: String, enum: ["paid", "pending", "reported"], default: "paid" },
    paymentReference: { type: String, default: "" },
    paymentReviewTokenHash: { type: String, default: "" },
    createdAt: { type: Date, default: Date.now },
  },
  { collection: "orders" },
);

const bookingSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, index: true },
    expert: { type: String, required: true },
    mode: { type: String, default: "chat" },
    date: { type: String, default: "" },
    reason: { type: String, default: "General wellness support" },
    createdAt: { type: Date, default: Date.now },
  },
  { collection: "appointments" },
);

const paymentSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null, index: true },
    purpose: { type: String, enum: ["wallet", "order"], required: true },
    status: { type: String, enum: ["created", "paid", "failed"], default: "created", index: true },
    razorpayOrderId: { type: String, required: true, unique: true, index: true },
    qrCodeId: { type: String, default: "", index: true },
    qrAccessTokenHash: { type: String, default: "" },
    qrImageUrl: { type: String, default: "" },
    qrExpiresAt: { type: Date },
    orderRecordId: { type: String, default: "" },
    razorpayPaymentId: { type: String, default: "" },
    amountPaise: { type: Number, required: true, min: 1 },
    currency: { type: String, default: "INR" },
    email: { type: String, required: true },
    customer: { type: String, default: "" },
    address: { type: String, default: "" },
    items: [{ type: String }],
    walletAmount: { type: Number, default: 0 },
    createdAt: { type: Date, default: Date.now },
    paidAt: { type: Date },
  },
  { collection: "payments" },
);

export const UserModel = mongoose.models.User || mongoose.model("User", userSchema);
export const OrderModel = mongoose.models.Order || mongoose.model("Order", orderSchema);
export const BookingModel = mongoose.models.Booking || mongoose.model("Booking", bookingSchema);
export const PaymentModel = mongoose.models.Payment || mongoose.model("Payment", paymentSchema);
