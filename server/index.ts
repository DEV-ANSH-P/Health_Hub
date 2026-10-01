import "./env.js";
import crypto from "crypto";
import express from "express";
import { mkdir, readFile, rename, writeFile } from "fs/promises";
import mongoose from "mongoose";
import { createServer } from "http";
import path from "path";
import { fileURLToPath } from "url";
import QRCode from "qrcode";
import { BookingModel, OrderModel, PaymentModel, UserModel, connectMongo } from "./db.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const localUsersPath = process.env.HEALTH_HUB_USERS_FILE
  ? path.resolve(process.env.HEALTH_HUB_USERS_FILE)
  : path.resolve(__dirname, "..", ".data", "users.json");
const localOrdersPath = process.env.HEALTH_HUB_ORDERS_FILE
  ? path.resolve(process.env.HEALTH_HUB_ORDERS_FILE)
  : path.resolve(__dirname, "..", ".data", "orders.json");

const productCatalog = [
  { name: "Ginger root", tags: ["digestion", "nausea", "stomach", "gut"] },
  { name: "Chamomile", tags: ["sleep", "stress", "calm", "evening"] },
  { name: "Lemon balm", tags: ["stress", "anxiety", "calm", "sleep"] },
  { name: "Blueberry", tags: ["focus", "brain", "energy", "memory"] },
  { name: "Pomegranate", tags: ["immunity", "wellness", "energy", "daily"] },
  { name: "Turmeric root", tags: ["wellness", "immunity", "inflammation", "daily"] },
  { name: "Mint blend", tags: ["digestion", "fresh", "gut", "refresh"] },
  { name: "Mango", tags: ["energy", "focus", "sunny", "vitamin"] },
  { name: "Aloe vera", tags: ["recovery", "soothing", "wellness", "skin"] },
  { name: "Dragon fruit", tags: ["hydration", "immunity", "fresh", "daily"] },
];

const userStore = new Map<string, { id: string; name: string; email: string; passwordHash: string; walletBalance: number; createdAt: string }>();
let localUsersWrite = Promise.resolve();
type OrderRecord = {
  id: string;
  email: string;
  customer: string;
  address: string;
  items: string[];
  total: number;
  status: string;
  paymentMethod: "razorpay" | "cash_on_delivery" | "upi_qr_manual";
  paymentStatus: "paid" | "pending" | "reported";
  paymentReference?: string;
  paymentReviewTokenHash?: string;
  createdAt: string;
};
const orderStore = new Map<string, OrderRecord>();
let localOrdersWrite = Promise.resolve();
const appointmentStore = new Map<string, { id: string; email: string; expert: string; mode: string; date: string; reason: string; createdAt: string }>();
type WalletCallMode = "chat" | "video";
type WalletCallSession = { id: string; userId: string; mode: WalletCallMode; rate: number; roomId: string; peerId: string; startedAt: number; lastHeartbeatAt: number; billedMinutes: number; active: boolean };
const walletCallSessions = new Map<string, WalletCallSession>();
const settlingWalletCallIds = new Set<string>();
const walletRates: Record<WalletCallMode, number> = { chat: 5, video: 10 };
const walletTopUpAmounts = new Set([100, 250, 500]);
const checkoutCatalog = [
  { id: 1, name: "Ginger root", price: 180 }, { id: 2, name: "Blueberry", price: 320 },
  { id: 3, name: "Chamomile", price: 240 }, { id: 4, name: "Pomegranate", price: 280 },
  { id: 5, name: "Mango", price: 160 }, { id: 6, name: "Turmeric root", price: 220 },
  { id: 7, name: "Lemon balm", price: 190 }, { id: 8, name: "Dragon fruit", price: 260 },
  { id: 9, name: "Aloe vera", price: 250 }, { id: 10, name: "Mint blend", price: 140 },
  { id: 11, name: "Ashwagandha powder", price: 420 }, { id: 12, name: "Tulsi leaf tea", price: 275 },
  { id: 13, name: "Neem leaf blend", price: 350 }, { id: 14, name: "Brahmi focus blend", price: 450 },
  { id: 15, name: "Overnight oats jar", price: 210 }, { id: 16, name: "Plant protein blend", price: 680 },
  { id: 17, name: "Electrolyte hydration mix", price: 360 }, { id: 18, name: "Cork yoga mat", price: 1250 },
  { id: 19, name: "Resistance band set", price: 550 },
];

function pruneWalletCallSessions() {
  const now = Date.now();
  walletCallSessions.forEach((session, sessionId) => {
    if (!session.active || now - session.startedAt > 4 * 60 * 60 * 1000) walletCallSessions.delete(sessionId);
  });
}
const CALL_ROOM_MAX_AGE = 60 * 60 * 1000;
const CALL_PEER_IDLE_TIMEOUT = 45_000;
const CALL_SIGNAL_MAX_AGE = 10 * 60 * 1000;
const CALL_SIGNAL_MAX_BYTES = 64 * 1024;
const CALL_SIGNAL_LIMIT = 256;
type CallSignal = {
  id: number;
  from: string;
  to: string;
  type: "offer" | "answer" | "ice";
  payload: RTCSessionDescriptionInit | RTCIceCandidateInit;
  createdAt: number;
};
type CallRoom = { createdAt: number; peers: Map<string, number>; signals: CallSignal[]; nextSignalId: number };
const callRooms = new Map<string, CallRoom>();
function pruneCallRoom(room: CallRoom) {
  const now = Date.now();
  room.peers.forEach((lastSeen, peerId) => {
    if (now - lastSeen > CALL_PEER_IDLE_TIMEOUT) room.peers.delete(peerId);
  });
  room.signals = room.signals.filter((signal) => now - signal.createdAt <= CALL_SIGNAL_MAX_AGE);
}

function pruneCallRooms() {
  const now = Date.now();
  callRooms.forEach((room, roomId) => {
    pruneCallRoom(room);
    if (now - room.createdAt > CALL_ROOM_MAX_AGE || room.peers.size === 0) callRooms.delete(roomId);
  });
}

async function expireInactiveWalletCalls() {
  const now = Date.now();
  const pendingSettlements: Promise<void>[] = [];
  walletCallSessions.forEach((session, sessionId) => {
    if (!session.active || now - session.startedAt > 4 * 60 * 60 * 1000) {
      walletCallSessions.delete(sessionId);
      return;
    }
    if (now - session.lastHeartbeatAt <= 90_000) return;
    if (settlingWalletCallIds.has(sessionId)) return;
    settlingWalletCallIds.add(sessionId);
    const targetMinutes = Math.max(1, Math.ceil((session.lastHeartbeatAt - session.startedAt) / 60_000));
    const unbilledMinutes = Math.max(0, targetMinutes - session.billedMinutes);
    pendingSettlements.push((async () => {
      try {
        if (unbilledMinutes) {
          const user = await UserModel.findById(session.userId).select("walletBalance").lean();
          const balance = Number(user?.walletBalance ?? 0);
          const billedMinutes = Math.min(unbilledMinutes, Math.floor(balance / session.rate));
          if (billedMinutes) {
            await UserModel.findOneAndUpdate(
              { _id: session.userId, walletBalance: { $gte: session.rate * billedMinutes } },
              { $inc: { walletBalance: -(session.rate * billedMinutes) } },
            );
          }
        }
        session.active = false;
        walletCallSessions.delete(sessionId);
        const room = callRooms.get(session.roomId);
        room?.peers.delete(session.peerId);
        if (room && room.peers.size === 0) callRooms.delete(session.roomId);
      } finally {
        settlingWalletCallIds.delete(sessionId);
      }
    })());
  });
  await Promise.all(pendingSettlements);
}
const analyticsEventCounts = new Map<string, number>();
const allowedAnalyticsEvents = new Set([
  "product_search",
  "product_view",
  "consultation_started",
  "care_finder_opened",
  "guidance_opened",
  "checkout_started",
]);
const sessionStore = new Map<string, { userId: string; email: string; expiresAt: number }>();
let mongoAvailable = false;
let mongoTransactionsAvailable = false;
type ProductSubmission = { id: string; name: string; category: string; submitter: string; status: "pending" | "approved" | "rejected" };
const productSubmissionStore = new Map<string, ProductSubmission>(
  productCatalog.slice(0, 5).map((item, index) => [`${index + 1}`, { id: `${index + 1}`, name: item.name, category: item.tags.includes("sleep") ? "Herb" : "Wellness", submitter: index % 2 ? "Greenleaf Collective" : "Community partner", status: index < 3 ? "approved" : "pending" }]),
);

function hashPassword(password: string) {
  return new Promise<string>((resolve, reject) => {
    const salt = crypto.randomBytes(16).toString("hex");
    crypto.scrypt(password, salt, 64, (error, derivedKey) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(`scrypt:${salt}:${derivedKey.toString("hex")}`);
    });
  });
}

function verifyPassword(password: string, storedHash: string) {
  if (!storedHash.startsWith("scrypt:")) {
    return Promise.resolve(crypto.createHash("sha256").update(password).digest("hex") === storedHash);
  }

  const [, salt, expectedHex] = storedHash.split(":");
  if (!salt || !expectedHex) return Promise.resolve(false);

  return new Promise<boolean>((resolve, reject) => {
    crypto.scrypt(password, salt, 64, (error, derivedKey) => {
      if (error) {
        reject(error);
        return;
      }
      const expected = Buffer.from(expectedHex, "hex");
      resolve(expected.length === derivedKey.length && crypto.timingSafeEqual(expected, derivedKey));
    });
  });
}

function setSessionCookie(res: express.Response, user: { id: string; email: string }) {
  const token = crypto.randomBytes(32).toString("hex");
  sessionStore.set(token, { userId: user.id, email: user.email, expiresAt: Date.now() + 1000 * 60 * 60 * 24 * 7 });
  res.setHeader("Set-Cookie", `herbal_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800`);
}

function getAuthSession(req: express.Request) {
  const cookie = req.headers.cookie?.split(";").find((value) => value.trim().startsWith("herbal_session="));
  const token = cookie?.trim().slice("herbal_session=".length);
  const session = token ? sessionStore.get(token) : undefined;
  if (!session || session.expiresAt <= Date.now()) {
    if (token) sessionStore.delete(token);
    return null;
  }
  return session;
}

function hasAdminAccess(req: express.Request) {
  const session = getAuthSession(req);
  const administrators = new Set(
    (process.env.ADMIN_EMAILS || "").split(",").map((email) => email.trim().toLowerCase()).filter(Boolean),
  );
  return Boolean(session && administrators.has(session.email));
}

function getPaymentReadiness(purpose: "wallet" | "order") {
  const keyId = process.env.RAZORPAY_KEY_ID || "";
  const hasCredentials = Boolean(keyId && process.env.RAZORPAY_KEY_SECRET);
  const testMode = keyId.startsWith("rzp_test_");
  const enabledForLive = purpose === "wallet"
    ? process.env.ENABLE_LIVE_PAYMENTS === "true"
    : process.env.ENABLE_LIVE_PRODUCT_ORDERS === "true";
  const issues: string[] = [];
  if (!hasCredentials) issues.push("set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in the server environment");
  if (!mongoAvailable) issues.push("connect MongoDB by setting MONGODB_URI");
  else if (!mongoTransactionsAvailable) issues.push("run MongoDB as a replica set");
  if (hasCredentials && !testMode && !enabledForLive) {
    issues.push(`explicitly enable live ${purpose === "wallet" ? "wallet" : "product order"} payments`);
  }
  return { ready: issues.length === 0, message: issues.length ? `Payment setup incomplete: ${issues.join("; ")}.` : "" };
}

function getDirectUpiReadiness() {
  const vpa = process.env.UPI_VPA?.trim() || "";
  const adminEmails = (process.env.ADMIN_EMAILS || "").split(",").map((email) => email.trim().toLowerCase());
  const issues: string[] = [];
  if (!/^[A-Za-z0-9._-]{2,256}@[A-Za-z0-9.-]{2,64}$/.test(vpa)) {
    issues.push("set a valid UPI_VPA in the server environment to receive payments");
  }
  if (!adminEmails.some((email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
    issues.push("set ADMIN_EMAILS so a merchant administrator can verify reported transfers");
  }
  return {
    ready: issues.length === 0,
    message: issues.length ? `Direct UPI setup incomplete: ${issues.join("; ")}.` : "",
  };
}

function requireMongoPayments(res: express.Response, purpose: "wallet" | "order") {
  const readiness = getPaymentReadiness(purpose);
  if (!readiness.ready) {
    res.status(503).json({ message: readiness.message });
    return false;
  }
  return true;
}

async function razorpayRequest(endpoint: string, method: "GET" | "POST", body?: Record<string, unknown>) {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) throw new Error("Razorpay is not configured.");
  const response = await fetch(`https://api.razorpay.com/v1${endpoint}`, {
    method,
    headers: {
      Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await response.json() as Record<string, unknown>;
  if (!response.ok) {
    const description = (data.error as { description?: string } | undefined)?.description;
    throw new Error(description || `Razorpay returned ${response.status}.`);
  }
  return data;
}

function signatureMatches(orderId: string, paymentId: string, signature: string) {
  const secret = process.env.RAZORPAY_KEY_SECRET;
  if (!secret || !/^[a-f0-9]{64}$/i.test(signature)) return false;
  const expected = crypto.createHmac("sha256", secret).update(`${orderId}|${paymentId}`).digest();
  const received = Buffer.from(signature, "hex");
  return received.length === expected.length && crypto.timingSafeEqual(expected, received);
}

async function loadLocalUsers() {
  try {
    const data: unknown = JSON.parse(await readFile(localUsersPath, "utf8"));
    if (!Array.isArray(data)) throw new Error("Local account data has an invalid format.");
    for (const value of data) {
      if (
        !value
        || typeof value !== "object"
        || typeof value.id !== "string"
        || typeof value.name !== "string"
        || typeof value.email !== "string"
        || typeof value.passwordHash !== "string"
        || typeof value.walletBalance !== "number"
        || typeof value.createdAt !== "string"
      ) throw new Error("Local account data contains an invalid account record.");
      userStore.set(value.id, value);
    }
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return;
    throw error;
  }
}

async function loadLocalOrders() {
  try {
    const data: unknown = JSON.parse(await readFile(localOrdersPath, "utf8"));
    if (!Array.isArray(data)) throw new Error("Local order data has an invalid format.");
    for (const value of data) {
      if (
        !value
        || typeof value !== "object"
        || typeof value.id !== "string"
        || typeof value.email !== "string"
        || typeof value.customer !== "string"
        || typeof value.address !== "string"
        || !Array.isArray(value.items)
        || !value.items.every((item: unknown) => typeof item === "string")
        || typeof value.total !== "number"
        || typeof value.status !== "string"
        || typeof value.paymentMethod !== "string"
        || !["razorpay", "cash_on_delivery", "upi_qr_manual"].includes(value.paymentMethod)
        || typeof value.paymentStatus !== "string"
        || !["paid", "pending", "reported"].includes(value.paymentStatus)
        || (value.paymentReference !== undefined && typeof value.paymentReference !== "string")
        || (value.paymentReviewTokenHash !== undefined && typeof value.paymentReviewTokenHash !== "string")
        || typeof value.createdAt !== "string"
      ) throw new Error("Local order data contains an invalid order record.");
      orderStore.set(value.id, value as OrderRecord);
    }
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return;
    throw error;
  }
}

function persistLocalUsers() {
  const pendingWrite = localUsersWrite.then(async () => {
    await mkdir(path.dirname(localUsersPath), { recursive: true });
    const temporaryPath = `${localUsersPath}.${process.pid}.tmp`;
    await writeFile(temporaryPath, JSON.stringify(Array.from(userStore.values())), { encoding: "utf8", mode: 0o600 });
    await rename(temporaryPath, localUsersPath);
  });
  localUsersWrite = pendingWrite.catch(() => undefined);
  return pendingWrite;
}

function persistLocalOrders() {
  const pendingWrite = localOrdersWrite.then(async () => {
    await mkdir(path.dirname(localOrdersPath), { recursive: true });
    const temporaryPath = `${localOrdersPath}.${process.pid}.tmp`;
    await writeFile(temporaryPath, JSON.stringify(Array.from(orderStore.values())), { encoding: "utf8", mode: 0o600 });
    await rename(temporaryPath, localOrdersPath);
  });
  localOrdersWrite = pendingWrite.catch(() => undefined);
  return pendingWrite;
}

async function settleCapturedPayment(razorpayOrderId: string, paymentId: string) {
  const dbSession = await mongoose.startSession();
  let receipt: { purpose: string; orderId?: string; balance?: number } | undefined;
  try {
    await dbSession.withTransaction(async () => {
      const current = await PaymentModel.findOne({ razorpayOrderId }).session(dbSession);
      if (!current) throw new Error("Payment record disappeared before settlement.");
      if (current.status === "paid") {
        const user = current.purpose === "wallet" && current.userId
          ? await UserModel.findById(current.userId).session(dbSession).select("walletBalance").lean()
          : null;
        receipt = { purpose: current.purpose, orderId: current.orderRecordId || undefined, balance: user ? Number(user.walletBalance ?? 0) : undefined };
        return;
      }
      if (current.status !== "created") throw new Error("This payment order cannot be settled.");
      if (current.purpose === "wallet") {
        if (!current.userId) throw new Error("Wallet payment has no account owner.");
        const user = await UserModel.findByIdAndUpdate(current.userId, { $inc: { walletBalance: current.walletAmount } }, { new: true, session: dbSession }).select("walletBalance").lean();
        if (!user) throw new Error("Wallet owner account was not found.");
        receipt = { purpose: "wallet", balance: Number(user.walletBalance ?? 0) };
      } else {
        const [order] = await OrderModel.create([{
          email: current.email,
          customer: current.customer,
          address: current.address,
          items: current.items,
          total: current.amountPaise / 100,
          status: "paid",
          paymentMethod: "razorpay",
          paymentStatus: "paid",
        }], { session: dbSession });
        current.orderRecordId = String(order._id);
        receipt = { purpose: "order", orderId: current.orderRecordId };
      }
      current.status = "paid";
      current.razorpayPaymentId = paymentId;
      current.paidAt = new Date();
      await current.save({ session: dbSession });
    });
  } finally {
    await dbSession.endSession();
  }
  if (!receipt) throw new Error("Payment could not be settled.");
  return receipt;
}

function sanitizeUser(user: { id: string; name: string; email: string }) {
  return { id: user.id, name: user.name, email: user.email, walletBalance: Number((user as { walletBalance?: number }).walletBalance ?? 0) };
}

async function findUserByEmail(email: string) {
  if (mongoAvailable) {
    const record = await UserModel.findOne({ email }).lean();
    if (record) {
      return { id: String(record._id), name: record.name, email: record.email, passwordHash: record.passwordHash, walletBalance: Number(record.walletBalance ?? 0), createdAt: String(record.createdAt) };
    }
  }

  return Array.from(userStore.values()).find((user) => user.email === email) ?? null;
}

async function createUserRecord(name: string, email: string, passwordHash: string) {
  if (mongoAvailable) {
    const record = await UserModel.create({ name, email, passwordHash });
    return { id: String(record._id), name: record.name, email: record.email, passwordHash: record.passwordHash, walletBalance: Number(record.walletBalance ?? 0), createdAt: String(record.createdAt) };
  }

  const id = crypto.randomUUID();
  const user = { id, name, email, passwordHash, walletBalance: 0, createdAt: new Date().toISOString() };
  userStore.set(id, user);
  try {
    await persistLocalUsers();
  } catch (error) {
    userStore.delete(id);
    throw error;
  }
  return user;
}

async function createBookingRecord(email: string, expert: string, mode: string, date: string, reason: string) {
  if (mongoAvailable) {
    const record = await BookingModel.create({ email, expert, mode, date, reason });
    return { id: String(record._id), email: record.email, expert: record.expert, mode: record.mode, date: record.date, reason: record.reason, createdAt: String(record.createdAt) };
  }

  const id = `booking_${Date.now()}`;
  const booking = { id, email, expert, mode, date, reason, createdAt: new Date().toISOString() };
  appointmentStore.set(id, booking);
  return booking;
}

function createHealthResult(question: string) {
  const q = (question || "").toLowerCase();
  const recommendedProducts = productCatalog
    .filter((product) => product.tags.some((tag) => q.includes(tag)))
    .slice(0, 3);

  const match = (keywords: string[]) => keywords.some((keyword) => q.includes(keyword));

  if (match(["sleep", "insomnia", "tired", "fatigue", "restless"])) {
    return {
      category: "sleep",
      answer: "A consistent sleep rhythm, lower evening light exposure, and a calming herbal routine can support deeper rest. Focus on a wind-down ritual 30 to 60 minutes before bed, avoid heavy late meals, and keep your room dark and cool.",
      medicinalSuggestions: ["Chamomile tea 30 minutes before bed", "Warm lemon balm infusion", "Reduce screen time and heavy meals in the evening"],
      fitnessAdvice: ["Try a brief 10-minute walk in daylight to reinforce your body clock", "Include gentle stretching after dinner to relax your nervous system"],
      actionPlan: ["Set a fixed wake time", "Limit caffeine after midday", "Use a simple calming ritual for 2 weeks to track consistency"],
      recommendedProducts: recommendedProducts.length ? recommendedProducts.map((item) => ({ name: item.name })) : [{ name: "Chamomile" }, { name: "Lemon balm" }],
      safetyNote: "Sleep disruption that persists for several weeks or with breathlessness should be reviewed by a clinician.",
    };
  }

  if (match(["digest", "bloating", "gut", "stomach", "indigestion", "constipation"])) {
    return {
      category: "digestion",
      answer: "Gentle digestion usually improves with regular meals, hydration, and lower-fat meals in the evening. Ginger, mint, and cinnamon are often used in soothing routines that help support comfort after meals.",
      medicinalSuggestions: ["Ginger tea after meals", "Steady hydration and slower eating", "Choose lighter meals and easy-to-digest foods"],
      fitnessAdvice: ["Do a 10-minute walk after meals to support bowel regularity", "Avoid intense exercise immediately after heavy meals"],
      actionPlan: ["Keep a simple food and symptom log for 7 days", "Avoid large late-night meals", "Add warm liquids and digestive herbs in your daily routine"],
      recommendedProducts: recommendedProducts.length ? recommendedProducts.map((item) => ({ name: item.name })) : [{ name: "Ginger root" }, { name: "Mint blend" }],
      safetyNote: "Persistent abdominal pain, vomiting, blood in stool, or weight loss deserves immediate medical care.",
    };
  }

  if (match(["stress", "anxiety", "overwhelm", "burnout", "nervous"])) {
    return {
      category: "stress",
      answer: "Stress responds well to rhythm and recovery: consistent sleep, time outside, regular meals, and short breath-based resets. Lemon balm, ashwagandha, and calm routines can support a more steady mood and focus.",
      medicinalSuggestions: ["Lemon balm tea", "5-minute breathing break", "Short outdoor walk or sunlight session"],
      fitnessAdvice: ["Add 10 minutes of light movement or walking to reduce mental tension", "Practice a 4-6 breathing cycle to settle your nervous system"],
      actionPlan: ["Schedule one short reset break per day", "Protect a screen-free period before sleep", "Use a simple stress-cue list to spot patterns"],
      recommendedProducts: recommendedProducts.length ? recommendedProducts.map((item) => ({ name: item.name })) : [{ name: "Lemon balm" }, { name: "Ashwagandha" }],
      safetyNote: "Severe panic, hopelessness, or emotional crisis requires professional care without delay.",
    };
  }

  if (match(["focus", "brain", "memory", "concentration", "mental clarity"])) {
    return {
      category: "focus",
      answer: "Clearer thinking often comes from regular meals, hydration, enough sleep, and mindful breaks. Blueberries, pomegranate, and spinach-based nutrition can support cognitive resilience alongside stronger daily routines.",
      medicinalSuggestions: ["Blueberry or pomegranate snack", "Hydration reminder after a long work block", "Short movement breaks to reset attention"],
      fitnessAdvice: ["Use a 5-minute mobility break every 90 minutes", "Take a brisk walk to refresh attention instead of pushing through fatigue"],
      actionPlan: ["Keep hydration consistent throughout the day", "Pair deep work with short breaks and protein-rich snacks", "Track focus patterns when sleep or meals are inconsistent"],
      recommendedProducts: recommendedProducts.length ? recommendedProducts.map((item) => ({ name: item.name })) : [{ name: "Blueberry" }, { name: "Spinach blend" }],
      safetyNote: "Sudden, major changes in memory or concentration should be checked by a clinician.",
    };
  }

  if (match(["fitness", "workout", "exercise", "muscle", "recovery", "strength", "weight loss", "fat loss", "gym"])) {
    return {
      category: "fitness",
      answer: "A practical fitness plan balances mobility, strength, and recovery. Aim for steady movement most days, support recovery with hydration, and keep your nutrition adequate so your training does not pile on stress.",
      medicinalSuggestions: ["Hydration before and after workouts", "Protein-rich meals after strength sessions", "Turmeric or ginger support for recovery and mobility"],
      fitnessAdvice: ["Do 2 to 3 strength sessions per week with 1 recovery day between them", "Add 20 to 30 minutes of brisk walking on most days", "Prioritize sleep and protein to improve performance"],
      actionPlan: ["Start with a 3-day weekly rhythm and build gradually", "Track recovery, energy, and soreness each week", "Use rest days as part of performance, not as failure"],
      recommendedProducts: recommendedProducts.length ? recommendedProducts.map((item) => ({ name: item.name })) : [{ name: "Turmeric root" }, { name: "Mango" }],
      safetyNote: "If you have chest pain, dizziness, or exercise intolerance, seek medical evaluation before pushing harder.",
    };
  }

  if (match(["immune", "cold", "wellness", "immunity", "infection", "defense"])) {
    return {
      category: "immunity",
      answer: "Immune support is usually about consistency: good sleep, balanced nutrition, hydration, stress regulation, and steady movement. Daily routines built around whole foods and herbs can be easier to maintain than short bursts of effort.",
      medicinalSuggestions: ["A turmeric and ginger tonic", "Pomegranate-rich meals for antioxidant support", "Simple daily hydration and rest routines"],
      fitnessAdvice: ["Keep movement light to moderate to reduce stress on recovery", "Add outdoor daylight exposure to improve mood and rhythm"],
      actionPlan: ["Build a repeatable morning routine", "Focus on fiber and fruit intake", "Avoid overtraining when you feel run down"],
      recommendedProducts: recommendedProducts.length ? recommendedProducts.map((item) => ({ name: item.name })) : [{ name: "Pomegranate" }, { name: "Turmeric root" }],
      safetyNote: "Recurring illness, fever, or worsening symptoms should be checked by a doctor.",
    };
  }

  if (match(["hydration", "water", "dehydration", "energy", "low energy"])) {
    return {
      category: "hydration",
      answer: "Low energy and brain fog are often improved by steady hydration, balanced meals, and a realistic pace for the day. Fruit, herbal tea, and consistent intake across the day are easier to sustain than one large burst.",
      medicinalSuggestions: ["Water with lemon or mint", "A fruit-rich snack like blueberry or mango", "Small hydration checks every few hours"],
      fitnessAdvice: ["Light movement can improve circulation and energy before heavy work starts", "A 5 to 10 minute walk can reset concentration better than another quick caffeine hit"],
      actionPlan: ["Carry water in a visible bottle", "Pair meals with fluids and fruit", "Reduce long gaps between eating and drinking"],
      recommendedProducts: recommendedProducts.length ? recommendedProducts.map((item) => ({ name: item.name })) : [{ name: "Dragon fruit" }, { name: "Mint blend" }],
      safetyNote: "Severe dehydration, fainting, or confusion needs urgent medical review.",
    };
  }

  return {
    category: "general",
    answer: "A steady wellness routine usually combines good sleep, regular eating, hydration, movement, and quality stress management. The best progress usually comes from small habits repeated consistently rather than dramatic resets.",
    medicinalSuggestions: ["Hydrate consistently", "Keep the routine simple and anchored to meals", "Monitor symptoms over a few days and look for patterns"],
    fitnessAdvice: ["Take a brisk walk for 10 to 20 minutes most days", "Add light mobility or stretching at least once daily"],
    actionPlan: ["Choose one habit to improve this week", "Track energy, sleep, and meals for 7 days", "Seek qualified care if symptoms worsen or persist"],
    recommendedProducts: recommendedProducts.length ? recommendedProducts.map((item) => ({ name: item.name })) : [{ name: "Pomegranate" }, { name: "Turmeric root" }],
    safetyNote: "This is educational support and not a diagnosis or treatment plan.",
  };
}

function normalizeOpenAIResponse(rawContent: string, fallbackCategory: string) {
  if (!rawContent) {
    return null;
  }

  try {
    const maybeJson = rawContent.trim();
    const parsed = JSON.parse(maybeJson.replace(/^```json\s*|```\s*$/g, ""));

    if (!parsed || typeof parsed !== "object") {
      return null;
    }

    const answer = typeof parsed.answer === "string" ? parsed.answer.trim() : "";
    if (!answer) {
      return null;
    }

    const parseStringArray = (value: unknown) =>
      Array.isArray(value)
        ? value.filter((item): item is string => typeof item === "string").slice(0, 4)
        : [];

    const parseProducts = (value: unknown) => {
      if (!Array.isArray(value)) {
        return [];
      }

      return value
        .map((item) => {
          if (typeof item === "string") return { name: item };
          if (item && typeof item === "object" && typeof (item as { name?: string }).name === "string") {
            return { name: (item as { name: string }).name };
          }
          return null;
        })
        .filter((item): item is { name: string } => Boolean(item))
        .slice(0, 3);
    };

    return {
      category: typeof parsed.category === "string" ? parsed.category : fallbackCategory,
      answer,
      medicinalSuggestions: parseStringArray(parsed.medicinalSuggestions),
      fitnessAdvice: parseStringArray(parsed.fitnessAdvice),
      actionPlan: parseStringArray(parsed.actionPlan),
      recommendedProducts: parseProducts(parsed.recommendedProducts),
      safetyNote: typeof parsed.safetyNote === "string" ? parsed.safetyNote : "This is educational guidance and not a diagnosis.",
    };
  } catch {
    return null;
  }
}

async function callOpenAIHealthCoach(question: string, mode: "assistant" | "fitness") {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return null;
  }

  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
  const baseUrl = (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              mode === "assistant"
                ? "You are a trusted wellness and herbal health coach. Provide practical, non-diagnostic advice with a warm tone. Return valid JSON only with keys: category, answer, medicinalSuggestions, fitnessAdvice, actionPlan, recommendedProducts, safetyNote. Use short arrays of practical strings."
                : "You are a fitness and recovery coach specialized in wellness routines. Provide practical, non-diagnostic fitness recommendations. Return valid JSON only with keys: category, answer, medicinalSuggestions, fitnessAdvice, actionPlan, recommendedProducts, safetyNote. Use short arrays of practical strings.",
          },
          {
            role: "user",
            content: question || (mode === "assistant" ? "I want general wellness guidance." : "I want support for fitness and recovery."),
          },
        ],
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI API responded with ${response.status}`);
    }

    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content;
    if (typeof content !== "string") {
      return null;
    }

    const normalized = normalizeOpenAIResponse(content, mode === "assistant" ? "general" : "fitness");
    if (normalized) {
      return normalized;
    }
  } catch (error) {
    console.warn("OpenAI health coach unavailable, falling back to local guidance.", error);
  }

  return null;
}

async function callGeminiHealthCoach(question: string, mode: "assistant" | "fitness") {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return null;
  }

  const model = process.env.GEMINI_MODEL || "gemini-2.0-flash";
  const baseUrl = (process.env.GEMINI_BASE_URL || "https://generativelanguage.googleapis.com/v1beta").replace(/\/$/, "");
  const systemInstruction =
    mode === "assistant"
      ? "You are a trusted wellness and herbal health coach. Provide practical, non-diagnostic advice with a warm tone."
      : "You are a fitness and recovery coach specialized in wellness routines. Provide practical, non-diagnostic fitness recommendations.";

  try {
    const response = await fetch(`${baseUrl}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemInstruction }] },
        contents: [{
          role: "user",
          parts: [{
            text: `${question || (mode === "assistant" ? "I want general wellness guidance." : "I want support for fitness and recovery.")}\n\nReturn valid JSON only with keys: category, answer, medicinalSuggestions, fitnessAdvice, actionPlan, recommendedProducts, safetyNote. Use short arrays of practical strings.`,
          }],
        }],
        generationConfig: { responseMimeType: "application/json", temperature: 0.4 },
      }),
    });

    if (!response.ok) {
      throw new Error(`Gemini API responded with ${response.status}`);
    }

    const data = await response.json();
    const content = data?.candidates?.[0]?.content?.parts
      ?.map((part: { text?: string }) => part.text || "")
      .join("");
    if (typeof content !== "string") {
      return null;
    }

    return normalizeOpenAIResponse(content, mode === "assistant" ? "general" : "fitness");
  } catch (error) {
    console.warn("Gemini health coach unavailable, trying the next AI fallback.", error);
    return null;
  }
}

async function getAssistantResult(question: string) {
  const geminiResult = await callGeminiHealthCoach(question, "assistant");
  if (geminiResult) {
    return geminiResult;
  }

  const openAiResult = await callOpenAIHealthCoach(question, "assistant");
  if (openAiResult) {
    return openAiResult;
  }

  const serviceUrl = process.env.AI_SERVICE_URL?.replace(/\/$/, "");

  if (!serviceUrl) {
    return createHealthResult(question);
  }

  try {
    const response = await fetch(`${serviceUrl}/api/health/assistant`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question }),
    });

    if (!response.ok) {
      throw new Error(`Python AI service responded with ${response.status}`);
    }

    const data = await response.json();
    if (data && typeof data.answer === "string") {
      return data;
    }
  } catch (error) {
    console.warn("Falling back to local AI assistant logic:", error);
  }

  return createHealthResult(question);
}

async function getFitnessResult(question: string) {
  const geminiResult = await callGeminiHealthCoach(question || "fitness and recovery coaching", "fitness");
  if (geminiResult) {
    return geminiResult;
  }

  const openAiResult = await callOpenAIHealthCoach(question || "fitness and recovery coaching", "fitness");
  if (openAiResult) {
    return openAiResult;
  }

  const serviceUrl = process.env.AI_SERVICE_URL?.replace(/\/$/, "");

  if (!serviceUrl) {
    return createHealthResult(question || "fitness and recovery coaching");
  }

  try {
    const response = await fetch(`${serviceUrl}/api/health/fitness`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: question || "fitness and recovery coaching" }),
    });

    if (!response.ok) {
      throw new Error(`Python fitness service responded with ${response.status}`);
    }

    const data = await response.json();
    if (data && typeof data.answer === "string") {
      return data;
    }
  } catch (error) {
    console.warn("Falling back to local fitness guidance:", error);
  }

  return createHealthResult(question || "fitness and recovery coaching");
}

async function createStripePaymentIntent(amount: number, items: string[]) {
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) {
    return null;
  }

  try {
    const response = await fetch("https://api.stripe.com/v1/payment_intents", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${stripeKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        amount: String(Math.max(Math.round(amount * 100), 0)),
        currency: process.env.STRIPE_CURRENCY || "inr",
        description: items.join(", ") || "Herbal Health purchase",
      }),
    });

    if (!response.ok) {
      throw new Error(`Stripe API responded with ${response.status}`);
    }

    const data = await response.json();
    return {
      paymentId: data.id,
      status: String(data.status || "requires_payment_method"),
      amount: Number.isFinite(amount) ? Math.max(amount, 0) : 0,
      items,
      qrCode: `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(`stripe:${data.id}`)}`,
    };
  } catch (error) {
    console.warn("Stripe payment service unavailable; falling back to QR demo flow.", error);
    return null;
  }
}

async function startServer() {
  const app = express();
  const server = createServer(app);
  let mongoConnection: Awaited<ReturnType<typeof connectMongo>> = null;

app.use(express.json({ limit: "1mb" }));

app.get("/api/config", (_req, res) => {
  res.json({
    mode: process.env.NODE_ENV === "production" ? "production" : "development",
    providers: {
      ai: Boolean(process.env.AI_SERVICE_URL || process.env.OPENAI_API_KEY || process.env.GEMINI_API_KEY),
      gemini: Boolean(process.env.GEMINI_API_KEY),
      openai: Boolean(process.env.OPENAI_API_KEY),
      razorpay: getPaymentReadiness("wallet").ready || getPaymentReadiness("order").ready,
      walletPayments: getPaymentReadiness("wallet").ready,
      productPayments: getPaymentReadiness("order").ready,
      walletPaymentMessage: getPaymentReadiness("wallet").message,
      productPaymentMessage: getPaymentReadiness("order").message,
      directUpiQr: getDirectUpiReadiness().ready,
      directUpiQrMessage: getDirectUpiReadiness().message,
      liveProductOrders: process.env.ENABLE_LIVE_PRODUCT_ORDERS === "true",
      maps: Boolean(process.env.GOOGLE_MAPS_API_KEY || process.env.VITE_GOOGLE_MAPS_API_KEY),
      mongo: mongoAvailable,
    },
  });
});

app.get("/api/nearby-places", async (req, res) => {
  const lat = Number(req.query.lat);
  const lng = Number(req.query.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    res.status(400).json({ error: "Valid latitude and longitude are required." });
    return;
  }

  const query = `
    [out:json][timeout:30];
    (
      nwr(around:12000,${lat},${lng})["amenity"="hospital"]["name"];
      nwr(around:12000,${lat},${lng})["healthcare"~"hospital|clinic|doctor"]["name"];
      nwr(around:12000,${lat},${lng})["amenity"="pharmacy"]["name"];
      nwr(around:12000,${lat},${lng})["shop"~"chemist|greengrocer|farm|marketplace|supermarket|convenience|general"]["name"];
      nwr(around:12000,${lat},${lng})["shop"]["name"];
    );
    out center tags;
  `;
  const endpoints = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
  ];
  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "text/plain", Accept: "application/json" },
        body: query,
        signal: AbortSignal.timeout(25000),
      });
      if (response.ok) {
        const data = await response.json();
        res.status(200).json({ ...data, source: "OpenStreetMap Overpass" });
        return;
      }
    } catch {
      // Try the next public Overpass mirror.
    }
  }

  try {
    const viewbox = `${lng - 0.12},${lat + 0.12},${lng + 0.12},${lat - 0.12}`;
    const searchUrl = new URL("https://nominatim.openstreetmap.org/search");
    searchUrl.search = new URLSearchParams({
      format: "jsonv2",
      limit: "50",
      dedupe: "1",
      bounded: "1",
      viewbox,
      q: "shop Moradabad Uttar Pradesh India",
    }).toString();
    const response = await fetch(searchUrl, {
      headers: { Accept: "application/json", "User-Agent": "HerbalHealthHub/1.0 locality search" },
      signal: AbortSignal.timeout(12000),
    });
    if (response.ok) {
      const results = (await response.json()) as Array<{
        place_id: number;
        lat: string;
        lon: string;
        name?: string;
        display_name?: string;
        type?: string;
      }>;
      res.status(200).json({
        elements: results.flatMap((place) => {
          const placeLat = Number(place.lat);
          const placeLng = Number(place.lon);
          if (!Number.isFinite(placeLat) || !Number.isFinite(placeLng)) return [];
          return [{
            id: place.place_id,
            lat: placeLat,
            lon: placeLng,
            tags: {
              name: place.name || place.display_name?.split(",")[0] || "Local shop",
              shop: place.type || "shop",
            },
          }];
        }),
        source: "OpenStreetMap Nominatim",
      });
      return;
    }
  } catch {
    // Return the deterministic project pins when public map services are unavailable.
  }

  res.status(200).json({ elements: [], degraded: true });
});

app.get("/api/catalog", (_req, res) => {
    res.json({
      products: productCatalog.map((item, index) => ({
        id: index + 1,
        name: item.name,
        category: item.tags.includes("sleep") || item.tags.includes("stress") || item.tags.includes("calm") ? "Herb" : item.tags.includes("focus") || item.tags.includes("energy") ? "Fruit" : "Wellness",
        benefit: item.tags[0],
        note: `Supportive wellness product focused on ${item.tags.slice(0, 2).join(" and ")}.`,
      })),
    });
});

app.get("/api/admin/products", (_req, res) => {
    res.json({ products: Array.from(productSubmissionStore.values()) });
});

app.patch("/api/admin/products/:id/status", (req, res) => {
      const status = req.body?.status;
      if (!["pending", "approved", "rejected"].includes(status)) {
        res.status(400).json({ message: "A valid product status is required." });
        return;
      }
      const product = productSubmissionStore.get(req.params.id);
      if (!product) {
        res.status(404).json({ message: "Product submission not found." });
        return;
      }
      product.status = status as ProductSubmission["status"];
      res.json({ product });
  });

  app.post("/api/admin/products", (req, res) => {
      const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
      const category = typeof req.body?.category === "string" ? req.body.category.trim() : "Wellness";
      const submitter = typeof req.body?.submitter === "string" ? req.body.submitter.trim() : "Community partner";
      if (!name) {
        res.status(400).json({ message: "Product name is required." });
        return;
      }
      const id = `submission_${Date.now()}`;
      const product: ProductSubmission = { id, name, category, submitter, status: "pending" };
      productSubmissionStore.set(id, product);
      res.status(201).json({ product });
  });

  app.post("/api/auth/signup", async (req, res) => {
    const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
    const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
    const password = typeof req.body?.password === "string" ? req.body.password : "";

    if (!name || name.length > 120 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || password.length < 8 || password.length > 128) {
      res.status(400).json({ message: "Enter a valid name and email, and use a password between 8 and 128 characters." });
      return;
    }

    const existingUser = await findUserByEmail(email);
    if (existingUser) {
      res.status(409).json({ message: "An account with this email already exists." });
      return;
    }

    const user = await createUserRecord(name, email, await hashPassword(password));
    setSessionCookie(res, user);
    res.status(201).json({ user: sanitizeUser(user), message: "Account created successfully." });
  });

  app.post("/api/auth/login", async (req, res) => {
    const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
    const password = typeof req.body?.password === "string" ? req.body.password : "";

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || !password || password.length > 128) {
      res.status(400).json({ message: "Enter a valid email and password." });
      return;
    }

    const user = await findUserByEmail(email);
    if (!user || !(await verifyPassword(password, user.passwordHash))) {
      res.status(401).json({ message: "Invalid email or password." });
      return;
    }

    setSessionCookie(res, user);
    res.json({ user: sanitizeUser(user), message: "Login successful." });
  });

  app.post("/api/auth/logout", (req, res) => {
    const cookie = req.headers.cookie?.split(";").find((value) => value.trim().startsWith("herbal_session="));
    const token = cookie?.trim().slice("herbal_session=".length);
    if (token) sessionStore.delete(token);
    res.setHeader("Set-Cookie", "herbal_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0");
    res.json({ message: "Logged out successfully." });
  });

  app.get("/api/auth/me", async (req, res) => {
    const cookie = req.headers.cookie?.split(";").find((value) => value.trim().startsWith("herbal_session="));
    const token = cookie?.trim().slice("herbal_session=".length);
    const session = token ? sessionStore.get(token) : undefined;
    if (!session || session.expiresAt <= Date.now()) {
      if (token) sessionStore.delete(token);
      res.status(401).json({ message: "Not authenticated." });
      return;
    }
    const user = await findUserByEmail(session.email);
    if (!user) {
      if (token) sessionStore.delete(token);
      res.status(401).json({ message: "Not authenticated." });
      return;
    }
    res.json({ user: sanitizeUser(user) });
  });

  app.get("/api/health/assistant", async (req, res) => {
    const question = typeof req.query.question === "string" ? req.query.question : "";
    const result = await getAssistantResult(question);
    res.json({ ...result, recommendedProducts: (result.recommendedProducts ?? []).slice(0, 3) });
  });

  app.post("/api/health/assistant", async (req, res) => {
    const question = typeof req.body?.question === "string" ? req.body.question : "";
    const result = await getAssistantResult(question);
    res.json({ ...result, recommendedProducts: (result.recommendedProducts ?? []).slice(0, 3) });
  });

  app.post("/api/health/fitness", async (req, res) => {
    const question = typeof req.body?.question === "string" ? req.body.question : "fitness and recovery coaching";
    const result = await getFitnessResult(question);
    res.json({ ...result, recommendedProducts: (result.recommendedProducts ?? []).slice(0, 3) });
  });

  app.post("/api/analytics/events", (req, res) => {
    const event = typeof req.body?.event === "string" ? req.body.event : "";
    if (!allowedAnalyticsEvents.has(event)) {
      res.status(400).json({ message: "Unsupported analytics event." });
      return;
    }

    analyticsEventCounts.set(event, (analyticsEventCounts.get(event) ?? 0) + 1);
    res.sendStatus(204);
  });

  app.get("/api/analytics/summary", (_req, res) => {
    res.json(Object.fromEntries(analyticsEventCounts));
  });

  app.post("/api/orders/cash-on-delivery", async (req, res) => {
    const customer = typeof req.body?.customer === "string" ? req.body.customer.trim() : "";
    const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
    const address = typeof req.body?.address === "string" ? req.body.address.trim() : "";
    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    if (!customer || customer.length > 120 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !address || address.length > 500) {
      res.status(400).json({ message: "Enter a valid name, email, and delivery address." });
      return;
    }
    if (!items.length || items.length > checkoutCatalog.length) {
      res.status(400).json({ message: "Your basket is empty or contains too many different products." });
      return;
    }
    let total = 0;
    const orderItems: string[] = [];
    for (const item of items) {
      const id = Number(item?.id);
      const quantity = Number(item?.quantity);
      const product = checkoutCatalog.find((entry) => entry.id === id);
      if (!product || !Number.isInteger(quantity) || quantity < 1 || quantity > 20) {
        res.status(400).json({ message: "A basket item is invalid. Refresh your cart and try again." });
        return;
      }
      total += product.price * quantity;
      orderItems.push(...Array.from({ length: quantity }, () => product.name));
    }
    if (total < 1 || total > 500_000) {
      res.status(400).json({ message: "The order total is outside the allowed payment range." });
      return;
    }

    let localOrderId: string | null = null;
    try {
      const order: OrderRecord = {
        id: crypto.randomUUID(),
        email,
        customer,
        address,
        items: orderItems,
        total,
        status: "confirmed",
        paymentMethod: "cash_on_delivery",
        paymentStatus: "pending",
        createdAt: new Date().toISOString(),
      };
      if (mongoAvailable) {
        const saved = await OrderModel.create({
          email: order.email,
          customer: order.customer,
          address: order.address,
          items: order.items,
          total: order.total,
          status: order.status,
          paymentMethod: order.paymentMethod,
          paymentStatus: order.paymentStatus,
          createdAt: order.createdAt,
        });
        order.id = String(saved._id);
      } else {
        orderStore.set(order.id, order);
        localOrderId = order.id;
        await persistLocalOrders();
      }
      res.status(201).json({
        orderId: order.id,
        paymentStatus: order.paymentStatus,
        message: `Order #${order.id} placed. Payment of ₹${total} is due on delivery.`,
      });
    } catch (error) {
      if (localOrderId) orderStore.delete(localOrderId);
      console.error("Could not save cash-on-delivery order.", error);
      res.status(500).json({ message: "Your order could not be saved. Please try again." });
    }
  });

  app.post("/api/payments/upi/qr", async (req, res) => {
    const readiness = getDirectUpiReadiness();
    if (!readiness.ready) {
      res.status(503).json({ message: readiness.message });
      return;
    }
    const customer = typeof req.body?.customer === "string" ? req.body.customer.trim() : "";
    const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
    const address = typeof req.body?.address === "string" ? req.body.address.trim() : "";
    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    if (!customer || customer.length > 120 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !address || address.length > 500) {
      res.status(400).json({ message: "Enter a valid name, email, and delivery address." });
      return;
    }
    if (!items.length || items.length > checkoutCatalog.length) {
      res.status(400).json({ message: "Your basket is empty or contains too many different products." });
      return;
    }
    let total = 0;
    const orderItems: string[] = [];
    for (const item of items) {
      const product = checkoutCatalog.find((entry) => entry.id === Number(item?.id));
      const quantity = Number(item?.quantity);
      if (!product || !Number.isInteger(quantity) || quantity < 1 || quantity > 20) {
        res.status(400).json({ message: "A basket item is invalid. Refresh your cart and try again." });
        return;
      }
      total += product.price * quantity;
      orderItems.push(...Array.from({ length: quantity }, () => product.name));
    }
    if (total < 1 || total > 500_000) {
      res.status(400).json({ message: "The order total is outside the allowed payment range." });
      return;
    }

    const vpa = process.env.UPI_VPA!.trim();
    const payeeName = (process.env.UPI_PAYEE_NAME || "Health Hub").trim().slice(0, 50);
    const orderId = mongoAvailable ? new mongoose.Types.ObjectId().toString() : crypto.randomUUID();
    const paymentReference = `HH${crypto.randomUUID().replaceAll("-", "").slice(0, 32)}`;
    const reportToken = crypto.randomBytes(32).toString("base64url");
    const upiUri = `upi://pay?${new URLSearchParams({
      pa: vpa,
      pn: payeeName,
      tr: paymentReference,
      tn: `Health Hub order ${orderId.slice(-8)}`,
      am: total.toFixed(2),
      cu: "INR",
    })}`;
    let localOrderId: string | null = null;
    try {
      const qrImage = await QRCode.toDataURL(upiUri, { errorCorrectionLevel: "M", margin: 2, width: 300 });
      const order: OrderRecord = {
        id: orderId,
        email,
        customer,
        address,
        items: orderItems,
        total,
        status: "awaiting_payment",
        paymentMethod: "upi_qr_manual",
        paymentStatus: "pending",
        paymentReference,
        paymentReviewTokenHash: crypto.createHash("sha256").update(reportToken).digest("hex"),
        createdAt: new Date().toISOString(),
      };
      if (mongoAvailable) {
        const saved = await OrderModel.create({ ...order, _id: orderId });
        order.id = String(saved._id);
      } else {
        orderStore.set(order.id, order);
        localOrderId = order.id;
        await persistLocalOrders();
      }
      res.status(201).json({
        orderId: order.id,
        imageDataUrl: qrImage,
        upiUri,
        reportToken,
        amount: total,
        paymentReference,
        payeeName,
        payeeVpa: vpa,
      });
    } catch (error) {
      if (localOrderId) orderStore.delete(localOrderId);
      console.error("Could not create direct UPI QR order.", error);
      res.status(500).json({ message: "Could not create the UPI QR order. Please try again." });
    }
  });

  app.post("/api/payments/upi/qr/:orderId/report", async (req, res) => {
    const token = req.header("X-Payment-Token") || "";
    if (!/^[A-Za-z0-9_-]{40,60}$/.test(token)) {
      res.status(401).json({ message: "This payment session is invalid. Generate a new UPI QR." });
      return;
    }
    try {
      let order: OrderRecord | null;
      if (mongoAvailable) {
        if (!mongoose.isValidObjectId(req.params.orderId)) {
          res.status(404).json({ message: "UPI QR order not found." });
          return;
        }
        const saved = await OrderModel.findById(req.params.orderId);
        if (!saved || saved.paymentMethod !== "upi_qr_manual") {
          res.status(404).json({ message: "UPI QR order not found." });
          return;
        }
        const expectedHash = Buffer.from(String(saved.paymentReviewTokenHash || ""), "hex");
        const receivedHash = crypto.createHash("sha256").update(token).digest();
        if (expectedHash.length !== receivedHash.length || !crypto.timingSafeEqual(expectedHash, receivedHash)) {
          res.status(404).json({ message: "UPI QR order not found." });
          return;
        }
        if (saved.paymentStatus === "paid") {
          res.json({ paymentStatus: "paid", message: "This payment has already been verified." });
          return;
        }
        if (saved.paymentStatus === "pending") {
          saved.paymentStatus = "reported";
          await saved.save();
        }
        order = {
          id: String(saved._id),
          email: saved.email,
          customer: saved.customer || "",
          address: saved.address || "",
          items: saved.items,
          total: Number(saved.total),
          status: saved.status,
          paymentMethod: "upi_qr_manual",
          paymentStatus: saved.paymentStatus as OrderRecord["paymentStatus"],
          paymentReviewTokenHash: saved.paymentReviewTokenHash || "",
          createdAt: String(saved.createdAt),
        };
      } else {
        order = orderStore.get(req.params.orderId) || null;
        if (!order || order.paymentMethod !== "upi_qr_manual") {
          res.status(404).json({ message: "UPI QR order not found." });
          return;
        }
        const expectedHash = Buffer.from(order.paymentReviewTokenHash || "", "hex");
        const receivedHash = crypto.createHash("sha256").update(token).digest();
        if (expectedHash.length !== receivedHash.length || !crypto.timingSafeEqual(expectedHash, receivedHash)) {
          res.status(404).json({ message: "UPI QR order not found." });
          return;
        }
        if (order.paymentStatus !== "paid" && order.paymentStatus === "pending") {
          order.paymentStatus = "reported";
          await persistLocalOrders();
        }
      }
      res.json({
        paymentStatus: order.paymentStatus,
        message: order.paymentStatus === "paid"
          ? "This payment has already been verified."
          : "Payment reported. The order remains unpaid until an administrator verifies the transfer.",
      });
    } catch (error) {
      console.error("Could not record UPI payment report.", error);
      res.status(500).json({ message: "Could not record your payment report. Please try again." });
    }
  });

  app.post("/api/payments/upi/qr/:orderId/cancel", async (req, res) => {
    const token = req.header("X-Payment-Token") || "";
    if (!/^[A-Za-z0-9_-]{40,60}$/.test(token)) {
      res.status(401).json({ message: "This payment session is invalid." });
      return;
    }
    try {
      if (mongoAvailable) {
        if (!mongoose.isValidObjectId(req.params.orderId)) {
          res.status(404).json({ message: "UPI QR order not found." });
          return;
        }
        const order = await OrderModel.findById(req.params.orderId);
        if (!order || order.paymentMethod !== "upi_qr_manual") {
          res.status(404).json({ message: "UPI QR order not found." });
          return;
        }
        const expectedHash = Buffer.from(String(order.paymentReviewTokenHash || ""), "hex");
        const receivedHash = crypto.createHash("sha256").update(token).digest();
        if (expectedHash.length !== receivedHash.length || !crypto.timingSafeEqual(expectedHash, receivedHash)) {
          res.status(404).json({ message: "UPI QR order not found." });
          return;
        }
        if (order.paymentStatus !== "pending" || order.status !== "awaiting_payment") {
          res.status(409).json({ message: "This QR order can no longer be cancelled. Contact the merchant if you need help." });
          return;
        }
        order.status = "cancelled";
        order.paymentReviewTokenHash = "";
        await order.save();
      } else {
        const order = orderStore.get(req.params.orderId);
        if (!order || order.paymentMethod !== "upi_qr_manual") {
          res.status(404).json({ message: "UPI QR order not found." });
          return;
        }
        const expectedHash = Buffer.from(order.paymentReviewTokenHash || "", "hex");
        const receivedHash = crypto.createHash("sha256").update(token).digest();
        if (expectedHash.length !== receivedHash.length || !crypto.timingSafeEqual(expectedHash, receivedHash)) {
          res.status(404).json({ message: "UPI QR order not found." });
          return;
        }
        if (order.paymentStatus !== "pending" || order.status !== "awaiting_payment") {
          res.status(409).json({ message: "This QR order can no longer be cancelled. Contact the merchant if you need help." });
          return;
        }
        order.status = "cancelled";
        order.paymentReviewTokenHash = "";
        await persistLocalOrders();
      }
      res.json({ status: "cancelled", message: "UPI QR order closed in Health Hub. The UPI QR cannot be revoked; contact the merchant if you already transferred funds." });
    } catch (error) {
      console.error("Could not cancel direct UPI QR order.", error);
      res.status(500).json({ message: "Could not cancel this UPI QR order. Please try again." });
    }
  });

  app.get("/api/orders", async (req, res) => {
    const auth = getAuthSession(req);
    const email = typeof req.query.email === "string" ? req.query.email.trim().toLowerCase() : "";
    if (!auth || !email || email !== auth.email) {
      res.status(401).json({ message: "Sign in to view your orders." });
      return;
    }
    if (mongoAvailable) {
      const orders = (await OrderModel.find({ email }).sort({ createdAt: -1 }).lean()).map((order) => ({
        id: String(order._id),
        email: order.email,
        customer: order.customer || "",
        address: order.address || "",
        items: order.items,
        total: Number(order.total),
        status: order.status,
        paymentMethod: order.paymentMethod || "razorpay",
        paymentStatus: order.paymentStatus || (order.status === "paid" ? "paid" : "pending"),
        paymentReference: order.paymentReference || "",
        createdAt: String(order.createdAt),
      }));
      res.json({ orders });
      return;
    }
    const orders = Array.from(orderStore.values())
      .filter((order) => order.email === email)
      .map(({ paymentReviewTokenHash: _tokenHash, ...order }) => order);
    res.json({ orders });
  });

  app.get("/api/admin/orders", async (_req, res) => {
    if (!hasAdminAccess(_req)) {
      res.status(403).json({ message: "Administrator access is required." });
      return;
    }
    if (mongoAvailable) {
      const orders = (await OrderModel.find().sort({ createdAt: -1 }).lean()).map((order) => ({
        id: String(order._id), email: order.email, customer: order.customer || "", address: order.address || "",
        items: order.items, total: Number(order.total), status: order.status,
        paymentMethod: order.paymentMethod || "razorpay",
        paymentStatus: order.paymentStatus || (order.status === "paid" ? "paid" : "pending"),
        paymentReference: order.paymentReference || "",
        createdAt: String(order.createdAt),
      }));
      res.json({ orders });
      return;
    }
    res.json({
      orders: Array.from(orderStore.values())
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .map(({ paymentReviewTokenHash: _tokenHash, ...order }) => order),
    });
  });

  app.patch("/api/admin/orders/:id/payment-status", async (req, res) => {
    if (!hasAdminAccess(req)) {
      res.status(403).json({ message: "Administrator access is required." });
      return;
    }
    if (req.body?.paymentStatus !== "paid") {
      res.status(400).json({ message: "Only verified payments can be marked received." });
      return;
    }
    if (mongoAvailable) {
      const order = await OrderModel.findById(req.params.id);
      if (!order) {
        res.status(404).json({ message: "Order not found." });
        return;
      }
      if (
        !["cash_on_delivery", "upi_qr_manual"].includes(String(order.paymentMethod))
        || order.paymentStatus === "paid"
        || (order.paymentMethod === "upi_qr_manual" && order.paymentStatus !== "reported")
      ) {
        res.status(409).json({ message: "This order is not ready for manual payment verification." });
        return;
      }
      order.paymentStatus = "paid";
      if (order.paymentMethod === "upi_qr_manual") {
        order.status = "confirmed";
        order.paymentReviewTokenHash = "";
      }
      await order.save();
      res.json({ order: { ...order.toObject(), id: String(order._id) } });
      return;
    }
    const order = orderStore.get(req.params.id);
    if (!order) {
      res.status(404).json({ message: "Order not found." });
      return;
    }
    if (
      !["cash_on_delivery", "upi_qr_manual"].includes(order.paymentMethod)
      || order.paymentStatus === "paid"
      || (order.paymentMethod === "upi_qr_manual" && order.paymentStatus !== "reported")
    ) {
      res.status(409).json({ message: "This order is not ready for manual payment verification." });
      return;
    }
    order.paymentStatus = "paid";
    if (order.paymentMethod === "upi_qr_manual") {
      order.status = "confirmed";
      order.paymentReviewTokenHash = "";
    }
    await persistLocalOrders();
    res.json({ order });
  });

  app.patch("/api/admin/orders/:id/status", async (req, res) => {
    if (!hasAdminAccess(req)) {
      res.status(403).json({ message: "Administrator access is required." });
      return;
    }
    const allowedStatuses = ["awaiting_payment", "paid", "confirmed", "packed", "shipped", "delivered", "cancelled"];
    const status = typeof req.body?.status === "string" ? req.body.status : "";
    if (!allowedStatuses.includes(status)) {
      res.status(400).json({ message: "Unsupported order status." });
      return;
    }
    if (mongoAvailable) {
      const current = await OrderModel.findById(req.params.id).select("paymentMethod paymentStatus").lean();
      if (!current) {
        res.status(404).json({ message: "Order not found." });
        return;
      }
      if (
        current.paymentMethod === "upi_qr_manual"
        && current.paymentStatus !== "paid"
        && !["awaiting_payment", "cancelled"].includes(status)
      ) {
        res.status(409).json({ message: "Verify the UPI transfer before moving this order to fulfilment." });
        return;
      }
      const order = await OrderModel.findByIdAndUpdate(req.params.id, { status }, { new: true }).lean();
      if (!order) {
        res.status(404).json({ message: "Order not found." });
        return;
      }
      res.json({ order: { ...order, id: String(order._id) } });
      return;
    }
    const order = orderStore.get(req.params.id);
    if (!order) {
      res.status(404).json({ message: "Order not found." });
      return;
    }
    if (
      order.paymentMethod === "upi_qr_manual"
      && order.paymentStatus !== "paid"
      && !["awaiting_payment", "cancelled"].includes(status)
    ) {
      res.status(409).json({ message: "Verify the UPI transfer before moving this order to fulfilment." });
      return;
    }
    order.status = status;
    orderStore.set(order.id, order);
    await persistLocalOrders();
    res.json({ order });
  });

  app.post("/api/appointments", async (req, res) => {
    const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
    const expert = typeof req.body?.expert === "string" ? req.body.expert.trim() : "";
    const mode = typeof req.body?.mode === "string" ? req.body.mode : "";
    const date = typeof req.body?.date === "string" ? req.body.date : "";
    const reason = "General wellness appointment request";

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !expert || expert.length > 100) {
      res.status(400).json({ message: "A valid email and expert selection are required." });
      return;
    }
    if (!["chat", "video"].includes(mode)) {
      res.status(400).json({ message: "Choose chat or video for the appointment request." });
      return;
    }
    const requestedDate = new Date(date);
    if (!date || !Number.isFinite(requestedDate.getTime()) || requestedDate.getTime() <= Date.now() || requestedDate.getTime() > Date.now() + 90 * 24 * 60 * 60 * 1000) {
      res.status(400).json({ message: "Choose a future date within the next 90 days." });
      return;
    }

    const booking = await createBookingRecord(email, expert, mode, date, reason);
    res.status(202).json({
      booking: { id: booking.id, expert: booking.expert, mode: booking.mode, date: booking.date, createdAt: booking.createdAt },
      message: "Request received in preview mode. This is not a confirmed appointment; no provider has been notified.",
    });
  });

  app.get("/api/appointments", async (req, res) => {
    const email = typeof req.query.email === "string" ? req.query.email.trim().toLowerCase() : "";
    const cookie = req.headers.cookie?.split(";").find((value) => value.trim().startsWith("herbal_session="));
    const token = cookie?.trim().slice("herbal_session=".length);
    const session = token ? sessionStore.get(token) : undefined;
    if (!session || session.expiresAt <= Date.now() || !email || email !== session.email) {
      res.status(401).json({ message: "Sign in to view your appointment requests." });
      return;
    }
    if (mongoAvailable) {
      const bookings = (await BookingModel.find(email ? { email } : {}).sort({ createdAt: -1 }).lean()).map((booking) => ({
        id: String(booking._id),
        email: booking.email,
        expert: booking.expert,
        mode: booking.mode,
        date: booking.date,
        reason: booking.reason,
        createdAt: String(booking.createdAt),
      }));
      res.json({ bookings });
      return;
    }
    const bookings = email
      ? Array.from(appointmentStore.values()).filter((booking) => booking.email === email)
      : Array.from(appointmentStore.values());
    res.json({ bookings });
  });

  app.get("/api/wallet", async (req, res) => {
    const session = getAuthSession(req);
    if (!session) {
      res.status(401).json({ message: "Sign in to use your rupee wallet." });
      return;
    }
    if (!mongoAvailable) {
      res.status(503).json({ message: "Wallet balance requires a connected MongoDB database." });
      return;
    }
    const user = await UserModel.findById(session.userId).select("walletBalance").lean();
    if (!user) {
      res.status(401).json({ message: "Sign in to use your rupee wallet." });
      return;
    }
    res.json({ balance: Number(user.walletBalance ?? 0), rates: walletRates, topUpAmounts: Array.from(walletTopUpAmounts) });
  });

  app.post("/api/wallet/call-sessions", async (req, res) => {
    pruneWalletCallSessions();
    const auth = getAuthSession(req);
    const mode: unknown = req.body?.mode;
    if (!auth) {
      res.status(401).json({ message: "Sign in to start a paid call." });
      return;
    }
    if (!mongoAvailable) {
      res.status(503).json({ message: "Wallet calls require a connected MongoDB database." });
      return;
    }
    if (mode !== "chat" && mode !== "video") {
      res.status(400).json({ message: "Choose voice/chat or video for the call." });
      return;
    }
    const roomId = typeof req.body?.roomId === "string" ? req.body.roomId : "";
    const peerId = typeof req.body?.peerId === "string" ? req.body.peerId : "";
    const room = callRooms.get(roomId);
    if (!room || !room.peers.has(peerId)) {
      res.status(404).json({ message: "Call room participant not found." });
      return;
    }
    const callMode: WalletCallMode = mode;
    const rate = walletRates[callMode];
    if (Array.from(walletCallSessions.values()).some((active) => active.active && active.userId === auth.userId)) {
      res.status(409).json({ message: "You already have an active billed call." });
      return;
    }
    const user = await UserModel.findOneAndUpdate(
      { _id: auth.userId, walletBalance: { $gte: rate } },
      { $inc: { walletBalance: -rate } },
      { new: true },
    ).select("walletBalance").lean();
    if (!user) {
      res.status(402).json({ message: `Add at least ₹${rate} to your wallet to start this session.`, rate });
      return;
    }
    const startedAt = Date.now();
    const session: WalletCallSession = {
      id: crypto.randomUUID(),
      userId: auth.userId,
      mode: callMode,
      rate,
      roomId,
      peerId,
      startedAt,
      lastHeartbeatAt: startedAt,
      billedMinutes: 1,
      active: true,
    };
    walletCallSessions.set(session.id, session);
    res.status(201).json({ sessionId: session.id, balance: Number(user.walletBalance ?? 0), rate, billedMinutes: 1 });
  });

  app.post("/api/wallet/call-sessions/:sessionId/heartbeat", async (req, res) => {
    pruneWalletCallSessions();
    const auth = getAuthSession(req);
    const session = walletCallSessions.get(req.params.sessionId);
    if (!auth || !session || session.userId !== auth.userId || !session.active) {
      res.status(404).json({ message: "Wallet call session is no longer active." });
      return;
    }
    const targetMinutes = Math.max(1, Math.ceil((Date.now() - session.startedAt) / 60_000));
    const elapsedMinutes = targetMinutes - session.billedMinutes;
    if (elapsedMinutes <= 0) {
      const user = await UserModel.findById(auth.userId).select("walletBalance").lean();
      res.json({ active: true, balance: Number(user?.walletBalance ?? 0), billedMinutes: 0 });
      return;
    }
    const affordable = await UserModel.findOneAndUpdate(
      { _id: auth.userId, walletBalance: { $gte: session.rate * elapsedMinutes } },
      { $inc: { walletBalance: -(session.rate * elapsedMinutes) } },
      { new: true },
    ).select("walletBalance").lean();
    let updatedBalance: number;
    let billedMinutes: number;
    if (affordable) {
      billedMinutes = elapsedMinutes;
      updatedBalance = Number(affordable.walletBalance ?? 0);
    } else {
      const user = await UserModel.findById(auth.userId).select("walletBalance").lean();
      const available = Number(user?.walletBalance ?? 0);
      billedMinutes = Math.min(elapsedMinutes, Math.floor(available / session.rate));
      const charged = billedMinutes
        ? await UserModel.findOneAndUpdate(
          { _id: auth.userId, walletBalance: { $gte: session.rate * billedMinutes } },
          { $inc: { walletBalance: -(session.rate * billedMinutes) } },
          { new: true },
        ).select("walletBalance").lean()
        : user;
      updatedBalance = Number(charged?.walletBalance ?? 0);
    }
    session.billedMinutes += billedMinutes;
    session.lastHeartbeatAt = Date.now();
    if (billedMinutes < elapsedMinutes) session.active = false;
    res.json({
      active: session.active,
      balance: updatedBalance,
      billedMinutes,
      message: session.active ? undefined : "Your rupee wallet is empty. Add funds before starting another session.",
    });
  });

  app.delete("/api/wallet/call-sessions/:sessionId", async (req, res) => {
    const auth = getAuthSession(req);
    const session = walletCallSessions.get(req.params.sessionId);
    if (session && auth?.userId === session.userId) {
      const targetMinutes = Math.max(1, Math.ceil((Date.now() - session.startedAt) / 60_000));
      const unbilledMinutes = Math.max(0, targetMinutes - session.billedMinutes);
      if (unbilledMinutes) {
        const balance = Number((await UserModel.findById(session.userId).select("walletBalance").lean())?.walletBalance ?? 0);
        const billedMinutes = Math.min(unbilledMinutes, Math.floor(balance / session.rate));
        if (billedMinutes) {
          await UserModel.findOneAndUpdate(
            { _id: session.userId, walletBalance: { $gte: session.rate * billedMinutes } },
            { $inc: { walletBalance: -(session.rate * billedMinutes) } },
          );
        }
      }
      session.active = false;
      walletCallSessions.delete(session.id);
    }
    res.sendStatus(204);
  });

  app.post("/api/calls/rooms", (req, res) => {
    pruneCallRooms();
    if (callRooms.size >= 500) {
      res.status(503).json({ message: "Call rooms are temporarily at capacity. Please try again shortly." });
      return;
    }
    const roomId = crypto.randomUUID();
    const peerId = crypto.randomUUID();
    callRooms.set(roomId, { createdAt: Date.now(), peers: new Map([[peerId, Date.now()]]), signals: [], nextSignalId: 1 });
    res.status(201).json({ roomId, peerId });
  });

  app.post("/api/calls/rooms/:roomId/join", (req, res) => {
    pruneCallRooms();
    const room = callRooms.get(req.params.roomId);
    if (!room) {
      callRooms.delete(req.params.roomId);
      res.status(404).json({ message: "This call room has expired or does not exist." });
      return;
    }
    pruneCallRoom(room);
    if (room.peers.size >= 2) {
      res.status(409).json({ message: "This call room already has two participants." });
      return;
    }
    const peerId = crypto.randomUUID();
    room.peers.set(peerId, Date.now());
    res.status(201).json({ roomId: req.params.roomId, peerId });
  });

  app.get("/api/calls/rooms/:roomId/signals", (req, res) => {
    pruneCallRooms();
    const room = callRooms.get(req.params.roomId);
    const peerId = typeof req.query.peerId === "string" ? req.query.peerId : "";
    const after = Number(req.query.after ?? 0);
    if (!room || !room.peers.has(peerId)) {
      res.status(404).json({ message: "Call room or participant not found." });
      return;
    }
    pruneCallRoom(room);
    if (!room.peers.has(peerId)) {
      res.status(404).json({ message: "Call room or participant not found." });
      return;
    }
    room.peers.set(peerId, Date.now());
    const signals = room.signals.filter((signal) => signal.to === peerId && signal.id > after);
    const peers = Array.from(room.peers.keys()).filter((id) => id !== peerId);
    res.json({ signals, peers });
  });

  app.post("/api/calls/rooms/:roomId/signals", (req, res) => {
    pruneCallRooms();
    const room = callRooms.get(req.params.roomId);
    const from = typeof req.body?.from === "string" ? req.body.from : "";
    const to = typeof req.body?.to === "string" ? req.body.to : "";
    const type = req.body?.type;
    const payload = req.body?.payload;
    if (!room || !room.peers.has(from) || !room.peers.has(to) || from === to) {
      res.status(404).json({ message: "Call room participant not found." });
      return;
    }
    if (!["offer", "answer", "ice"].includes(type) || !payload || typeof payload !== "object") {
      res.status(400).json({ message: "Invalid call signal." });
      return;
    }
    const payloadBytes = Buffer.byteLength(JSON.stringify(payload), "utf8");
    const validPayload = (type === "offer" || type === "answer")
      ? typeof (payload as RTCSessionDescriptionInit).sdp === "string"
      : typeof (payload as RTCIceCandidateInit).candidate === "string";
    if (!validPayload || payloadBytes > CALL_SIGNAL_MAX_BYTES) {
      res.status(400).json({ message: "Call signal payload is invalid or too large." });
      return;
    }
    pruneCallRoom(room);
    if (room.signals.length >= CALL_SIGNAL_LIMIT) {
      res.status(429).json({ message: "Too many pending call signals. Please restart the room." });
      return;
    }
    room.signals.push({ id: room.nextSignalId++, from, to, type, payload, createdAt: Date.now() });
    room.peers.set(from, Date.now());
    res.sendStatus(204);
  });

  app.delete("/api/calls/rooms/:roomId/participants/:peerId", (req, res) => {
    const room = callRooms.get(req.params.roomId);
    if (!room || !room.peers.has(req.params.peerId)) {
      res.sendStatus(204);
      return;
    }
    room.peers.delete(req.params.peerId);
    room.signals = room.signals.filter((signal) => signal.from !== req.params.peerId && signal.to !== req.params.peerId);
    if (room.peers.size === 0) callRooms.delete(req.params.roomId);
    res.sendStatus(204);
  });

  app.post("/api/payments/razorpay/orders", async (req, res) => {
    const purpose: unknown = req.body?.purpose;
    const auth = getAuthSession(req);
    let amountRupees = 0;
    let email = "";
    let customer = "";
    let address = "";
    let orderItems: string[] = [];
    let walletAmount = 0;

    if (purpose === "wallet") {
      if (!auth) {
        res.status(401).json({ message: "Sign in before adding money to your wallet." });
        return;
      }
      const amount = Number(req.body?.amount);
      if (!walletTopUpAmounts.has(amount)) {
        res.status(400).json({ message: "Select a wallet top-up of ₹100, ₹250, or ₹500." });
        return;
      }
      const user = await UserModel.findById(auth.userId).select("email name").lean();
      if (!user) {
        res.status(401).json({ message: "Sign in before adding money to your wallet." });
        return;
      }
      amountRupees = amount;
      email = user.email;
      customer = user.name;
      walletAmount = amount;
    } else if (purpose === "order") {
      const name = typeof req.body?.customer === "string" ? req.body.customer.trim() : "";
      email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
      address = typeof req.body?.address === "string" ? req.body.address.trim() : "";
      const items = Array.isArray(req.body?.items) ? req.body.items : [];
      if (!name || name.length > 120 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !address || address.length > 500) {
        res.status(400).json({ message: "Enter a valid name, email, and delivery address." });
        return;
      }
      if (!items.length || items.length > checkoutCatalog.length) {
        res.status(400).json({ message: "Your basket is empty or contains too many different products." });
        return;
      }
      let total = 0;
      for (const item of items) {
        const id = Number(item?.id);
        const quantity = Number(item?.quantity);
        const product = checkoutCatalog.find((entry) => entry.id === id);
        if (!product || !Number.isInteger(quantity) || quantity < 1 || quantity > 20) {
          res.status(400).json({ message: "A basket item is invalid. Refresh your cart and try again." });
          return;
        }
        total += product.price * quantity;
        orderItems.push(...Array.from({ length: quantity }, () => product.name));
      }
      if (total < 1 || total > 500_000) {
        res.status(400).json({ message: "The order total is outside the allowed payment range." });
        return;
      }
      const authUser = auth
        ? mongoAvailable
          ? await UserModel.findById(auth.userId).select("_id").lean()
          : userStore.get(auth.userId)
        : null;
      if (auth && !authUser) {
        res.status(401).json({ message: "Your session expired. Please sign in again." });
        return;
      }
      customer = name;
      amountRupees = total;
    } else {
      res.status(400).json({ message: "Choose wallet top-up or basket checkout." });
      return;
    }
    if (purpose !== "wallet" && purpose !== "order") {
      res.status(400).json({ message: "Choose wallet top-up or basket checkout." });
      return;
    }
    if (!requireMongoPayments(res, purpose)) return;

    try {
      const razorpayOrder = await razorpayRequest("/orders", "POST", {
        amount: Math.round(amountRupees * 100),
        currency: "INR",
        receipt: `hh_${crypto.randomUUID().replaceAll("-", "").slice(0, 30)}`,
        notes: { purpose, email },
      });
      const razorpayOrderId = String(razorpayOrder.id || "");
      if (!razorpayOrderId) throw new Error("Razorpay did not return an order ID.");
      await PaymentModel.create({
        userId: purpose === "wallet" ? auth?.userId : auth?.userId ?? null,
        purpose,
        status: "created",
        razorpayOrderId,
        amountPaise: Math.round(amountRupees * 100),
        currency: "INR",
        email,
        customer,
        address,
        items: orderItems,
        walletAmount,
      });
      res.status(201).json({
        keyId: process.env.RAZORPAY_KEY_ID,
        razorpayOrderId,
        amount: Math.round(amountRupees * 100),
        currency: "INR",
        name: "Health Hub",
        description: purpose === "wallet" ? "Wallet top-up" : "Health Hub basket order",
        prefill: { name: customer, email },
      });
    } catch (error) {
      console.error("Could not create Razorpay order.", error);
      res.status(502).json({ message: error instanceof Error ? error.message : "Payment setup failed. Please retry." });
    }
  });

  app.post("/api/payments/razorpay/qr-codes", async (req, res) => {
    const auth = getAuthSession(req);
    const customer = typeof req.body?.customer === "string" ? req.body.customer.trim() : "";
    const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
    const address = typeof req.body?.address === "string" ? req.body.address.trim() : "";
    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    if (!customer || customer.length > 120 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !address || address.length > 500) {
      res.status(400).json({ message: "Enter a valid name, email, and delivery address." });
      return;
    }
    if (!items.length || items.length > checkoutCatalog.length) {
      res.status(400).json({ message: "Your basket is empty or contains too many different products." });
      return;
    }

    let total = 0;
    const orderItems: string[] = [];
    for (const item of items) {
      const id = Number(item?.id);
      const quantity = Number(item?.quantity);
      const product = checkoutCatalog.find((entry) => entry.id === id);
      if (!product || !Number.isInteger(quantity) || quantity < 1 || quantity > 20) {
        res.status(400).json({ message: "A basket item is invalid. Refresh your cart and try again." });
        return;
      }
      total += product.price * quantity;
      orderItems.push(...Array.from({ length: quantity }, () => product.name));
    }
    if (total < 1 || total > 500_000) {
      res.status(400).json({ message: "The order total is outside the allowed payment range." });
      return;
    }
    const authUser = auth
      ? mongoAvailable
        ? await UserModel.findById(auth.userId).select("_id").lean()
        : userStore.get(auth.userId)
      : null;
    if (auth && !authUser) {
      res.status(401).json({ message: "Your session expired. Please continue as a guest or sign in again." });
      return;
    }
    if (!requireMongoPayments(res, "order")) return;

    let createdQrCodeId = "";
    try {
      const accessToken = crypto.randomBytes(32).toString("base64url");
      const qrExpiresAt = new Date(Date.now() + 20 * 60_000);
      const qrCode = await razorpayRequest("/payments/qr_codes", "POST", {
        type: "upi_qr",
        name: "Health Hub checkout",
        usage: "single_use",
        fixed_amount: true,
        payment_amount: Math.round(total * 100),
        description: "Health Hub one-time basket payment",
        close_by: Math.floor(qrExpiresAt.getTime() / 1000),
        notes: { purpose: "order", email },
      });
      createdQrCodeId = String(qrCode.id || "");
      const rawImageUrl = typeof qrCode.image_url === "string" ? qrCode.image_url : "";
      const parsedImageUrl = rawImageUrl ? new URL(rawImageUrl) : null;
      if (
        !createdQrCodeId
        || !parsedImageUrl
        || parsedImageUrl.hostname !== "rzp.io"
        || !["http:", "https:"].includes(parsedImageUrl.protocol)
        || parsedImageUrl.username
        || parsedImageUrl.password
      ) {
        throw new Error("Razorpay did not return a usable UPI QR code.");
      }
      parsedImageUrl.protocol = "https:";
      const imageUrl = parsedImageUrl.toString();
      const paymentReference = `qr_${crypto.randomUUID()}`;
      await PaymentModel.create({
        userId: auth?.userId ?? null,
        purpose: "order",
        status: "created",
        razorpayOrderId: paymentReference,
        qrCodeId: createdQrCodeId,
        qrAccessTokenHash: crypto.createHash("sha256").update(accessToken).digest("hex"),
        qrImageUrl: imageUrl,
        qrExpiresAt,
        amountPaise: Math.round(total * 100),
        currency: "INR",
        email,
        customer,
        address,
        items: orderItems,
      });
      res.status(201).json({
        qrCodeId: createdQrCodeId,
        imageUrl,
        accessToken,
        expiresAt: qrExpiresAt.toISOString(),
        amount: Math.round(total * 100),
        currency: "INR",
      });
    } catch (error) {
      if (createdQrCodeId) {
        try {
          await razorpayRequest(`/payments/qr_codes/${encodeURIComponent(createdQrCodeId)}/close`, "POST");
        } catch (closeError) {
          console.error("Could not close an unrecorded Razorpay QR code.", closeError);
        }
      }
      console.error("Could not create Razorpay one-time QR payment.", error);
      res.status(502).json({ message: error instanceof Error ? error.message : "Could not create a UPI QR code." });
    }
  });

  app.get("/api/payments/razorpay/qr-codes/:qrCodeId/status", async (req, res) => {
    const accessToken = req.header("X-Payment-Token") || "";
    if (!/^qr_[A-Za-z0-9]+$/.test(req.params.qrCodeId) || accessToken.length < 32) {
      res.status(404).json({ message: "Payment QR session was not found." });
      return;
    }
    const pending = await PaymentModel.findOne({ qrCodeId: req.params.qrCodeId, purpose: "order" });
    const providedHash = crypto.createHash("sha256").update(accessToken).digest();
    const expectedHash = pending?.qrAccessTokenHash ? Buffer.from(pending.qrAccessTokenHash, "hex") : Buffer.alloc(0);
    if (!pending || expectedHash.length !== providedHash.length || !crypto.timingSafeEqual(expectedHash, providedHash)) {
      res.status(404).json({ message: "Payment QR session was not found." });
      return;
    }
    if (!requireMongoPayments(res, "order")) return;
    if (pending.status === "paid") {
      res.json({ status: "paid", orderId: pending.orderRecordId });
      return;
    }
    if (pending.status !== "created") {
      res.json({ status: "failed", message: "This one-time QR payment is no longer active." });
      return;
    }

    try {
      const qrCode = await razorpayRequest(`/payments/qr_codes/${encodeURIComponent(pending.qrCodeId)}`, "GET");
      const expiresAt = pending.qrExpiresAt?.getTime() ?? 0;
      const payments = await razorpayRequest(`/payments/qr_codes/${encodeURIComponent(pending.qrCodeId)}/payments?count=10`, "GET");
      const paymentItems = Array.isArray(payments.items) ? payments.items as Record<string, unknown>[] : [];
      for (const candidate of paymentItems) {
        if (candidate.status !== "captured" || Number(candidate.amount) !== pending.amountPaise || String(candidate.currency) !== pending.currency) continue;
        const paymentId = typeof candidate.id === "string" ? candidate.id : "";
        if (!paymentId) continue;
        const gatewayPayment = await razorpayRequest(`/payments/${encodeURIComponent(paymentId)}`, "GET");
        if (
          gatewayPayment.status !== "captured"
          || gatewayPayment.method !== "upi"
          || Number(gatewayPayment.amount) !== pending.amountPaise
          || String(gatewayPayment.currency) !== pending.currency
          || (gatewayPayment.qr_code_id && String(gatewayPayment.qr_code_id) !== pending.qrCodeId)
        ) continue;
        const receipt = await settleCapturedPayment(pending.razorpayOrderId, paymentId);
        res.json({ status: "paid", orderId: receipt.orderId });
        return;
      }
      if (String(qrCode.status) === "closed" || (expiresAt > 0 && Date.now() >= expiresAt)) {
        res.json({ status: "expired" });
        return;
      }
      res.json({ status: "pending" });
    } catch (error) {
      console.error("Could not verify Razorpay QR payment status.", error);
      res.status(502).json({ message: error instanceof Error ? error.message : "Could not verify QR payment status." });
    }
  });

  app.post("/api/payments/razorpay/verify", async (req, res) => {
    const orderId = typeof req.body?.razorpay_order_id === "string" ? req.body.razorpay_order_id : "";
    const paymentId = typeof req.body?.razorpay_payment_id === "string" ? req.body.razorpay_payment_id : "";
    const signature = typeof req.body?.razorpay_signature === "string" ? req.body.razorpay_signature : "";
    if (!orderId || !paymentId || !signature || !signatureMatches(orderId, paymentId, signature)) {
      res.status(400).json({ message: "Razorpay payment signature is invalid." });
      return;
    }

    const pending = await PaymentModel.findOne({ razorpayOrderId: orderId }).lean();
    if (!pending) {
      res.status(404).json({ message: "Payment order was not found." });
      return;
    }
    if (!requireMongoPayments(res, pending.purpose)) return;
    const auth = getAuthSession(req);
    if (pending.userId && auth && String(pending.userId) !== auth.userId) {
      res.status(403).json({ message: "This payment belongs to another account." });
      return;
    }
    if (pending.status === "paid") {
      res.json({ purpose: pending.purpose, balance: pending.purpose === "wallet" && auth ? Number((await UserModel.findById(auth.userId).select("walletBalance").lean())?.walletBalance ?? 0) : undefined, message: "Payment was already processed." });
      return;
    }

    try {
      let gatewayPayment = await razorpayRequest(`/payments/${encodeURIComponent(paymentId)}`, "GET");
      if (String(gatewayPayment.order_id) !== orderId || Number(gatewayPayment.amount) !== pending.amountPaise || String(gatewayPayment.currency) !== pending.currency) {
        res.status(400).json({ message: "Payment amount or order does not match." });
        return;
      }
      if (gatewayPayment.status === "authorized") {
        gatewayPayment = await razorpayRequest(`/payments/${encodeURIComponent(paymentId)}/capture`, "POST", {
          amount: pending.amountPaise,
          currency: pending.currency,
        });
      }
      if (gatewayPayment.status !== "captured") {
        res.status(402).json({ message: "Payment has not been captured. Complete payment in Razorpay and retry." });
        return;
      }

      const dbSession = await mongoose.startSession();
      let receipt: { purpose: string; orderId?: string; balance?: number } | undefined;
      try {
        await dbSession.withTransaction(async () => {
          const current = await PaymentModel.findOne({ razorpayOrderId: orderId }).session(dbSession);
          if (!current) throw new Error("Payment record disappeared before settlement.");
          if (current.status === "paid") {
            const user = current.purpose === "wallet" && current.userId
              ? await UserModel.findById(current.userId).session(dbSession).select("walletBalance").lean()
              : null;
            receipt = { purpose: current.purpose, orderId: current.orderRecordId || undefined, balance: user ? Number(user.walletBalance ?? 0) : undefined };
            return;
          }
          if (current.status !== "created") throw new Error("This payment order cannot be settled.");
          if (current.purpose === "wallet") {
            if (!current.userId) throw new Error("Wallet payment has no account owner.");
            const user = await UserModel.findByIdAndUpdate(current.userId, { $inc: { walletBalance: current.walletAmount } }, { new: true, session: dbSession }).select("walletBalance").lean();
            if (!user) throw new Error("Wallet owner account was not found.");
            receipt = { purpose: "wallet", balance: Number(user.walletBalance ?? 0) };
          } else {
            const [order] = await OrderModel.create([{
              email: current.email,
              customer: current.customer,
              address: current.address,
              items: current.items,
              total: current.amountPaise / 100,
              status: "paid",
            }], { session: dbSession });
            current.orderRecordId = String(order._id);
            receipt = { purpose: "order", orderId: current.orderRecordId };
          }
          current.status = "paid";
          current.razorpayPaymentId = paymentId;
          current.paidAt = new Date();
          await current.save({ session: dbSession });
        });
      } finally {
        await dbSession.endSession();
      }
      res.json({ ...receipt, message: receipt?.purpose === "wallet" ? "Wallet payment verified and balance updated." : "Payment verified and order placed." });
    } catch (error) {
      console.error("Could not verify or settle Razorpay payment.", error);
      res.status(502).json({ message: error instanceof Error ? error.message : "Payment verification failed." });
    }
  });

  const staticPath =
    process.env.NODE_ENV === "production"
      ? path.resolve(__dirname, "public")
      : path.resolve(__dirname, "..", "dist", "public");

  app.use(express.static(staticPath));

  app.get("*", (_req, res) => {
    res.sendFile(path.join(staticPath, "index.html"));
  });

  const port = Number(process.env.PORT || 3001);

  mongoConnection = await connectMongo();
  mongoAvailable = Boolean(mongoConnection);
  if (!mongoAvailable) {
    await loadLocalUsers();
    await loadLocalOrders();
  }
  if (mongoConnection?.connection.db) {
    try {
      const hello = await mongoConnection.connection.db.admin().command({ hello: 1 });
      mongoTransactionsAvailable = typeof hello.setName === "string";
      if (!mongoTransactionsAvailable) console.warn("Razorpay payments are disabled because MongoDB is not configured as a replica set.");
    } catch (error) {
      console.warn("Could not verify MongoDB transaction support; online payments remain disabled.", error);
    }
  }

  const walletCallSweepTimer = setInterval(() => {
    void expireInactiveWalletCalls().catch((error: unknown) => console.error("Could not expire inactive wallet calls.", error));
  }, 15_000);
  server.on("close", () => clearInterval(walletCallSweepTimer));

  server.listen(port, "127.0.0.1", () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

startServer().catch(console.error);
