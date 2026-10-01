import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  ArrowRight,
  Bot,
  BrainCircuit,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  HeartPulse,
  Leaf,
  MapPin,
  MessageSquareText,
  Minus,
  Plus,
  Search,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Stethoscope,
  UserRound,
  Video,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { MapView } from "@/components/Map";
import SiteHeader from "@/components/SiteHeader";
import { Link, useLocation } from "wouter";
import { formatINR } from "@/lib/currency";
import { trackAnalyticsEvent } from "@/lib/analytics";
import { useCart } from "@/lib/cart";

export type Product = {
  id: number;
  name: string;
  category: "Fruit" | "Herb" | "Wellness" | "Nutrition" | "Fitness";
  benefit: string;
  note: string;
  image: string;
  color: string;
  price: number;
  unit: string;
  description?: string;
  ingredients?: string[];
  preparation?: string;
};

export type CarePlace = {
  name: string;
  kind: string;
  category: "Hospital" | "Clinic" | "Fruit & Veg" | "Medical Shop" | "Local Shop";
  distance: string;
  specialty: string;
  source?: "sample" | "map-provider";
  position: { lat: number; lng: number };
};

export type Expert = {
  id: number;
  name: string;
  specialty: string;
  availability: string;
  mode: string;
  initials: string;
  tone: string;
};

type ChatMessage = {
  id: number;
  role: "assistant" | "user";
  text: string;
};

type AiHealthResult = {
  answer: string;
  medicinalSuggestions: string[];
  recommendedProducts: Product[];
  safetyNote: string;
  category?: string;
  fitnessAdvice?: string[];
  actionPlan?: string[];
};

export const featuredProducts: Product[] = [
  {
    id: 1,
    name: "Ginger root",
    category: "Herb",
    benefit: "For digestion support",
    note: "A warming pantry staple to explore with meals or tea.",
    image: "https://commons.wikimedia.org/wiki/Special:FilePath/Ginger%20root.jpg?width=900",
    color: "#e8d4b1",
    price: 180,
    unit: "150 g · organic",
    description: "Fresh ginger root with a warm, earthy aroma and a naturally bright bite that fits both cooking and calming herbal routines.",
    ingredients: ["Ginger root", "Organic whole spice"],
    preparation: "Slice into tea, stir into soups, or keep it handy for a gentle post-meal ritual.",
  },
  {
    id: 2,
    name: "Blueberry",
    category: "Fruit",
    benefit: "For everyday focus",
    note: "A bright, versatile fruit that adds colour and energy to breakfasts.",
    image: "https://commons.wikimedia.org/wiki/Special:FilePath/Blueberries.jpg?width=900",
    color: "#d4e5d0",
    price: 320,
    unit: "250 g · seasonal",
    description: "Plump blueberries with a naturally sweet-tart flavor and a vibrant finish that makes a fresh and easy daily favorite.",
    ingredients: ["Fresh blueberry", "No refined sweeteners"],
    preparation: "Top yogurt, blend into smoothies, or enjoy as a clean, energizing snack.",
  },
  {
    id: 3,
    name: "Chamomile",
    category: "Herb",
    benefit: "For winding down",
    note: "A gentle floral infusion for softer evenings and calmer routines.",
    image: "https://commons.wikimedia.org/wiki/Special:FilePath/Chamomile%20flowers.jpg?width=900",
    color: "#efe1bf",
    price: 240,
    unit: "40 g · loose leaf",
    description: "Chamomile brings a light floral scent and a gentle, comforting profile often chosen for evening tea and a calmer wind-down ritual.",
    ingredients: ["Chamomile flowers", "Gentle herbal infusion"],
    preparation: "Brew with warm water for a few minutes and sip slowly during your evening reset.",
  },
  {
    id: 4,
    name: "Pomegranate",
    category: "Fruit",
    benefit: "For daily vitality",
    note: "A jewel-like fruit packed with antioxidant energy and bright flavour.",
    image: "https://commons.wikimedia.org/wiki/Special:FilePath/Pomegranate%20fruit.jpg?width=900",
    color: "#f0c7c0",
    price: 280,
    unit: "1 each · fresh",
    description: "The deep ruby glow of pomegranate gives it a rich, fruit-forward feel and a fresh, vibrant profile for everyday wellness routines.",
    ingredients: ["Pomegranate", "Naturally juicy seeds"],
    preparation: "Enjoy fresh, toss into bowls, or pair with yogurt for a balanced afternoon snack.",
  },
  {
    id: 5,
    name: "Mango",
    category: "Fruit",
    benefit: "For a bright, sunny start",
    note: "Sweet, juicy fruit that brings seasonal colour to smoothies and bowls.",
    image: "https://commons.wikimedia.org/wiki/Special:FilePath/Mangoes.jpg?width=900",
    color: "#f4d58d",
    price: 160,
    unit: "1 each · tree ripened",
    description: "Ripe mango brings a rich tropical sweetness and a comforting texture that makes mornings feel lighter and brighter.",
    ingredients: ["Fresh mango", "Sun-ripened fruit"],
    preparation: "Slice into smoothies, fruit bowls, or enjoy plain for a naturally sweet energy lift.",
  },
  {
    id: 6,
    name: "Turmeric root",
    category: "Wellness",
    benefit: "For a balanced daily ritual",
    note: "A bold root with a warm, earthy profile often used in golden tonics.",
    image: "https://commons.wikimedia.org/wiki/Special:FilePath/Curcuma%20longa.jpg?width=900",
    color: "#d9b470",
    price: 220,
    unit: "120 g · fresh cut",
    description: "Turmeric root adds a warm, gently golden profile prized in wellness rituals and comforting daily tonics.",
    ingredients: ["Turmeric root", "Warm earthy spice"],
    preparation: "Blend into tea, milk, or recipes for a simple ritual that feels grounding and bright.",
  },
  {
    id: 7,
    name: "Lemon balm",
    category: "Herb",
    benefit: "For calmer moments",
    note: "A soft, citrusy herb that supports gentle evening routines and tea blends.",
    image: "https://commons.wikimedia.org/wiki/Special:FilePath/Lemon%20balm.jpg?width=900",
    color: "#dfe8b8",
    price: 190,
    unit: "35 g · dried leaves",
    description: "Lemon balm brings a quiet, fresh citrus lift that makes it a natural choice for calmer evenings and gentle daily rituals.",
    ingredients: ["Lemon balm leaves", "Citrus herbal notes"],
    preparation: "Steep in warm water and enjoy as a smooth afternoon or evening infusion.",
  },
  {
    id: 8,
    name: "Dragon fruit",
    category: "Fruit",
    benefit: "For vibrant hydration",
    note: "A striking tropical fruit with a crisp bite and naturally hydrating feel.",
    image: "https://commons.wikimedia.org/wiki/Special:FilePath/Dragon%20fruit.jpg?width=900",
    color: "#d7c3d9",
    price: 260,
    unit: "1 each · fresh",
    description: "Dragon fruit is known for its vivid color and crisp, cooling texture that feels bright, fresh, and naturally hydrating.",
    ingredients: ["Dragon fruit", "Tropical hydration"],
    preparation: "Slice and serve chilled for a simple snack or add to fruit bowls for color and texture.",
  },
  {
    id: 9,
    name: "Aloe vera",
    category: "Wellness",
    benefit: "For soothing recovery",
    note: "A cooling plant often explored for skin comfort and a restorative routine.",
    image: "https://commons.wikimedia.org/wiki/Special:FilePath/Aloe%20vera.jpg?width=900",
    color: "#b7d9b6",
    price: 250,
    unit: "1 plant · fresh leaf",
    description: "Aloe vera offers a cool, soothing profile and is often appreciated for its restorative and skin-friendly properties.",
    ingredients: ["Aloe vera leaf", "Fresh botanical gel"],
    preparation: "Use as part of a cooling routine or keep nearby for a gentle wellness reset.",
  },
  {
    id: 10,
    name: "Mint blend",
    category: "Herb",
    benefit: "For fresh support",
    note: "Crisp, cooling leaves that pair beautifully with teas, smoothies and meals.",
    image: "https://commons.wikimedia.org/wiki/Special:FilePath/Mint%20leaves.jpg?width=900",
    color: "#cfe4cd",
    price: 140,
    unit: "30 g · garden mix",
    description: "Mint leaves deliver a cool, fresh aroma that is easy to incorporate into teas, meals, and simple daily rituals.",
    ingredients: ["Fresh mint leaves", "Cooling herb mix"],
    preparation: "Infuse into water, blend into smoothies, or add to salads and herbal tea blends.",
  },
  {
    id: 11,
    name: "Ashwagandha powder",
    category: "Wellness",
    benefit: "For an evening adaptogen ritual",
    note: "A carefully milled root powder for grounding smoothies and warm drinks.",
    image: "https://commons.wikimedia.org/wiki/Special:FilePath/Ashwagandha.jpg?width=900",
    color: "#d6bd9a",
    price: 420,
    unit: "100 g · root powder",
    description: "Ashwagandha root powder has a warm, earthy profile and is traditionally used in calming wellness routines. It is best approached as a supportive ritual, not a replacement for medical treatment.",
    ingredients: ["Ashwagandha root", "Single botanical powder"],
    preparation: "Mix a small serving into warm milk or a smoothie according to the product label. Ask a clinician before use if pregnant, taking medication, or managing a thyroid condition.",
  },
  {
    id: 12,
    name: "Tulsi leaf tea",
    category: "Wellness",
    benefit: "For a clear daily reset",
    note: "A fragrant holy basil infusion with a fresh, peppery finish.",
    image: "https://commons.wikimedia.org/wiki/Special:FilePath/Holy%20basil.jpg?width=900",
    color: "#c7dfc1",
    price: 275,
    unit: "50 g · dried leaves",
    description: "Tulsi, also known as holy basil, makes a fragrant herbal infusion that fits morning or afternoon reset rituals with a fresh, gently peppery taste.",
    ingredients: ["Tulsi leaves", "Dried botanical tea"],
    preparation: "Steep in hot water for 4 to 6 minutes and enjoy plain. Check with a clinician if you take blood-thinning or blood-sugar medication.",
  },
  {
    id: 13,
    name: "Neem leaf blend",
    category: "Wellness",
    benefit: "For a traditional botanical ritual",
    note: "A bitter, intensely green leaf blend best used with thoughtful guidance.",
    image: "https://commons.wikimedia.org/wiki/Special:FilePath/Azadirachta%20indica.jpg?width=900",
    color: "#b8d0b1",
    price: 350,
    unit: "75 g · dried leaves",
    description: "Neem leaf has a distinctive bitter character and a long history in traditional botanical practices. Use only as directed and choose qualified guidance for concentrated preparations.",
    ingredients: ["Neem leaves", "Dried botanical blend"],
    preparation: "Prepare only according to the label and avoid internal use during pregnancy or alongside medication without professional advice.",
  },
  {
    id: 14,
    name: "Brahmi focus blend",
    category: "Wellness",
    benefit: "For mindful focus",
    note: "A gentle botanical blend for study, journaling, and intentional pauses.",
    image: "https://commons.wikimedia.org/wiki/Special:FilePath/Bacopa%20monnieri.jpg?width=900",
    color: "#c7d8c4",
    price: 450,
    unit: "60 g · herbal blend",
    description: "Brahmi-inspired botanical blends are often included in mindful focus routines alongside sleep, hydration, and regular breaks. It is not intended to diagnose or treat memory concerns.",
    ingredients: ["Brahmi herb", "Caffeine-free botanical blend"],
    preparation: "Use the labeled serving in tea or a warm drink and pause for a short screen-free focus ritual.",
  },
  {
    id: 15,
    name: "Overnight oats jar",
    category: "Nutrition",
    benefit: "For steady morning energy",
    note: "Whole-grain oats and seeds for a simple, filling breakfast base.",
    image: "https://commons.wikimedia.org/wiki/Special:FilePath/Oatmeal.jpg?width=900",
    color: "#e4c89f",
    price: 210,
    unit: "400 g · pantry staple",
    description: "A convenient oat and seed blend designed for balanced breakfasts with slow-release carbohydrates and satisfying texture.",
    ingredients: ["Rolled oats", "Chia seeds", "Pumpkin seeds"],
    preparation: "Soak overnight with milk or yogurt, then add fresh fruit and nuts before serving.",
  },
  {
    id: 16,
    name: "Plant protein blend",
    category: "Nutrition",
    benefit: "For post-workout recovery",
    note: "A smooth pea and rice protein blend for shakes and nourishing snacks.",
    image: "https://commons.wikimedia.org/wiki/Special:FilePath/Protein%20shake.jpg?width=900",
    color: "#d8c8b8",
    price: 680,
    unit: "500 g · vanilla",
    description: "A plant-based protein powder for convenient recovery meals. Pair it with a varied diet rather than treating it as a substitute for whole foods.",
    ingredients: ["Pea protein", "Brown rice protein", "Natural vanilla"],
    preparation: "Blend one labeled serving with water or milk after training or as part of a balanced snack.",
  },
  {
    id: 17,
    name: "Electrolyte hydration mix",
    category: "Nutrition",
    benefit: "For active-day hydration",
    note: "A light citrus drink mix for workouts, travel, and warm-weather routines.",
    image: "https://commons.wikimedia.org/wiki/Special:FilePath/Healthy%20food.jpg?width=900",
    color: "#b9d8df",
    price: 360,
    unit: "20 sachets · citrus",
    description: "A convenient electrolyte drink mix for active days and hot conditions. Check the nutrition label if you are limiting sodium or managing a medical condition.",
    ingredients: ["Electrolyte minerals", "Citrus flavor", "No herbal stimulants"],
    preparation: "Mix one sachet with the labeled amount of water and sip during prolonged activity.",
  },
  {
    id: 18,
    name: "Cork yoga mat",
    category: "Fitness",
    benefit: "For grounded movement",
    note: "A supportive, easy-grip mat for stretching, yoga, mobility, and home workouts.",
    image: "https://commons.wikimedia.org/wiki/Special:FilePath/Yoga%20mat.jpg?width=900",
    color: "#c9b49a",
    price: 1250,
    unit: "1 mat · 5 mm",
    description: "A durable cork-surface mat that creates a comfortable base for mobility work, yoga, stretching, and low-impact strength sessions.",
    ingredients: ["Cork surface", "Natural rubber base"],
    preparation: "Unroll on a level surface, wipe clean after use, and allow it to air dry before storing.",
  },
  {
    id: 19,
    name: "Resistance band set",
    category: "Fitness",
    benefit: "For strength anywhere",
    note: "Three resistance levels for warm-ups, strength sessions, and travel workouts.",
    image: "https://commons.wikimedia.org/wiki/Special:FilePath/Resistance%20band.jpg?width=900",
    color: "#c6d6c8",
    price: 550,
    unit: "3 bands · light to heavy",
    description: "A compact resistance set for progressive home workouts, activation exercises, and mobility routines without bulky equipment.",
    ingredients: ["Natural latex bands", "Storage pouch"],
    preparation: "Start with the lightest band, keep controlled form, and stop if you feel sharp pain or unusual dizziness.",
  },
];

export const carePlaces: CarePlace[] = [
  { name: "Greenleaf Family Clinic", kind: "Primary care", category: "Clinic", distance: "Illustrative", specialty: "General wellness", source: "sample", position: { lat: 28.8448, lng: 78.7692 } },
  { name: "Sunrise Community Hospital", kind: "Hospital", category: "Hospital", distance: "Illustrative", specialty: "24/7 urgent care", source: "sample", position: { lat: 28.8327, lng: 78.7811 } },
  { name: "The Apothecary Practice", kind: "Integrative care", category: "Clinic", distance: "Illustrative", specialty: "Nutrition support", source: "sample", position: { lat: 28.8514, lng: 78.7579 } },
  { name: "Harbor Fresh Market", kind: "Fruit & vegetable store", category: "Fruit & Veg", distance: "Illustrative", specialty: "Seasonal produce & herbs", source: "sample", position: { lat: 28.8381, lng: 78.7764 } },
  { name: "Oak Valley Pharmacy", kind: "Medical shop", category: "Medical Shop", distance: "Illustrative", specialty: "Supplements & remedies", source: "sample", position: { lat: 28.8279, lng: 78.7668 } },
  { name: "Cedar Wellness Market", kind: "Fruit & vegetable store", category: "Fruit & Veg", distance: "Illustrative", specialty: "Organic greens & wellness fruits", source: "sample", position: { lat: 28.8582, lng: 78.7838 } },
  { name: "Bloom Health Clinic", kind: "Clinic", category: "Clinic", distance: "Illustrative", specialty: "Holistic & preventive care", source: "sample", position: { lat: 28.8218, lng: 78.7894 } },
  { name: "Wellspring Medical Hub", kind: "Medical shop", category: "Medical Shop", distance: "Illustrative", specialty: "Herbal products & prescriptions", source: "sample", position: { lat: 28.8462, lng: 78.7941 } },
  { name: "Valley Care Hospital", kind: "Hospital", category: "Hospital", distance: "Illustrative", specialty: "Urgent care & diagnostics", source: "sample", position: { lat: 28.8149, lng: 78.7598 } },
];

const googleMapsOpenUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent("hospitals clinics fruit vegetable shops medical shops near Moradabad Uttar Pradesh India")}`;

export const experts: Expert[] = [
  { id: 1, name: "Maya Rao", specialty: "Family medicine · example profile", availability: "Preview profile", mode: "Chat + video", initials: "MR", tone: "#d79a32" },
  { id: 2, name: "Elias Chen", specialty: "Nutrition · example profile", availability: "Preview profile", mode: "Chat", initials: "EC", tone: "#b9c8ad" },
  { id: 3, name: "Amara Lewis", specialty: "Integrative care · example profile", availability: "Preview profile", mode: "Video", initials: "AL", tone: "#d8b6a1" },
];

export const faqList = [
  { q: "What is HEALTH HUB designed for?", a: "It is a wellness discovery experience to explore food, herbs, gentle routines, expert guidance, and care resources without pretending to replace medical care." },
  { q: "Can I ask health questions to the AI assistant?", a: "The demo can offer AI-generated general information, which may be inaccurate. It cannot diagnose or recommend treatment. Avoid sharing identifying or highly sensitive details, and contact a clinician or emergency services for urgent concerns." },
  { q: "Can I talk to a real expert?", a: "Expert profiles and availability shown here are illustrative previews, not verified clinicians. Peer-to-peer voice/video calls can be billed to a signed-in rupee wallet at the displayed rates. Appointment requests are not sent to a provider or confirmed." },
  { q: "Does the cart support checkout?", a: "Basket checkout and wallet top-ups use Razorpay when the merchant, MongoDB replica-set, and server settings are configured. The current catalog and fulfillment are still previews; use test payment credentials until real stock and delivery are ready." },
];

const supportCards = [
  { title: "Daily habits", desc: "Gentle routines for focus, sleep, and recovery.", icon: BrainCircuit },
  { title: "Expert guidance", desc: "Request a preferred time or start a peer-to-peer video and chat room.", icon: Stethoscope },
  { title: "Nearby care", desc: "Explore the map preview and verify provider details independently.", icon: MapPin },
  { title: "Safe support", desc: "General education only—not diagnosis, treatment, or emergency care.", icon: ShieldCheck },
];

function getRecommendedProducts(question: string): Product[] {
  const q = question.toLowerCase();
  const keywordMap: Record<string, string[]> = {
    sleep: ["Chamomile", "Lemon balm", "Ginger root"],
    digestion: ["Ginger root", "Mint blend", "Turmeric root"],
    stress: ["Lemon balm", "Chamomile", "Aloe vera"],
    focus: ["Blueberry", "Mango", "Pomegranate"],
    immunity: ["Pomegranate", "Turmeric root", "Dragon fruit"],
    energy: ["Mango", "Blueberry", "Pomegranate"],
  };

  const matches = Object.entries(keywordMap).filter(([key]) => q.includes(key));
  const preferredNames = matches.flatMap(([, names]) => names);

  const prioritized = featuredProducts.filter((product) => {
    if (preferredNames.includes(product.name)) return true;
    const name = `${product.name} ${product.benefit} ${product.note}`.toLowerCase();
    return ["sleep", "stress", "focus", "digestion", "immunity", "energy"].some((keyword) => q.includes(keyword) && name.includes(keyword));
  });

  const unique: Product[] = [];
  const seen = new Set<number>();
  for (const product of prioritized.length ? prioritized : featuredProducts) {
    if (!seen.has(product.id)) {
      unique.push(product);
      seen.add(product.id);
    }
  }
  return unique.slice(0, 3);
}

function generateHealthReply(question: string): AiHealthResult {
  const q = question.toLowerCase();

  if (q.includes("sleep") || q.includes("insomnia") || q.includes("tired")) {
    return {
      answer: "For better sleep, try a consistent wind-down ritual: dim lights, avoid heavy meals late evening, and add a calming herbal tea such as chamomile or lemon balm. If you’re struggling for several weeks, a clinician can help assess underlying causes.",
      medicinalSuggestions: ["Chamomile tea 30 minutes before bed", "Warm lemon balm infusion", "A small evening ritual with hydration and reduced screen time"],
      recommendedProducts: getRecommendedProducts(q),
      safetyNote: "This is general wellness guidance, not a diagnosis or treatment plan.",
    };
  }

  if (q.includes("digest") || q.includes("bloating") || q.includes("gut")) {
    return {
      answer: "Gentle digestion support often starts with hydration, regular meals, and smaller portions. Ginger and peppermint are commonly explored for comfort, but symptoms that are severe or persistent should be checked by a health professional.",
      medicinalSuggestions: ["Ginger tea after meals", "Steady hydration and lighter portions", "A calm routine with less greasy food late in the day"],
      recommendedProducts: getRecommendedProducts(q),
      safetyNote: "Seek care if pain, vomiting, or blood in stool appears.",
    };
  }

  if (q.includes("stress") || q.includes("anxiety") || q.includes("overwhelm")) {
    return {
      answer: "A few supportive habits can help: steady breathing, sunlight early in the day, a shorter screen break, and a calm, regular meal rhythm. If stress feels constant or overwhelming, it is wise to connect with a professional.",
      medicinalSuggestions: ["Lemon balm infusion", "Gentle breathing practice for 5 minutes", "A slow walk outside to reset attention"],
      recommendedProducts: getRecommendedProducts(q),
      safetyNote: "Severe anxiety or panic episodes deserve a clinician conversation.",
    };
  }

  if (q.includes("focus") || q.includes("brain") || q.includes("memory")) {
    return {
      answer: "For focus support, consider consistent meals, hydration, quality sleep, and regular movement. Foods such as berries, leafy greens, and protein-rich options can support a steady day. If concentration changes suddenly, a clinician may be worth speaking with.",
      medicinalSuggestions: ["Blueberry or pomegranate-rich snack", "Hydration reminder after a long work block", "Short movement breaks to reset attention"],
      recommendedProducts: getRecommendedProducts(q),
      safetyNote: "Sudden cognitive changes should be assessed by a clinician.",
    };
  }

  if (q.includes("immune") || q.includes("cold") || q.includes("wellness")) {
    return {
      answer: "Daily wellness support is often about consistency: quality sleep, hydration, a varied diet, and stress management. Vitamin-rich foods, herbs like ginger, and regular routines can all contribute to a grounded approach.",
      medicinalSuggestions: ["A turmeric and ginger tonic", "Pomegranate-rich meals for antioxidant support", "Simple daily hydration and rest routines"],
      recommendedProducts: getRecommendedProducts(q),
      safetyNote: "Persistent illness or worsening symptoms should be discussed with a licensed clinician.",
    };
  }

  const fallbackProducts = getRecommendedProducts(q);
  return {
    answer: "That sounds like a good place to begin with a small, supportive wellness plan. Try tracking your symptoms, the timing of meals, sleep, hydration, and stress. Persistent or worsening symptoms should be discussed with a licensed clinician.",
    medicinalSuggestions: ["Start with gentle hydration", "Add a simple morning ritual with sunlight", "Keep a symptom log for a few days"],
    recommendedProducts: fallbackProducts,
    safetyNote: "This is educational guidance and not a medical diagnosis.",
  };
}

export default function Home() {
  const [, navigate] = useLocation();
  const [searchTerm, setSearchTerm] = useState("");
  const [heroQuery, setHeroQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<"All" | "Fruit" | "Herb" | "Wellness" | "Nutrition" | "Fitness">("All");
  const { cart, addToCart: addCartProduct, removeFromCart } = useCart(featuredProducts);
  const [cartOpen, setCartOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    { id: 1, role: "assistant", text: "Hi! I can help with gentle wellness guidance. Tell me what you’re feeling, like digestion, sleep, stress, or focus." },
  ]);
  const [botInput, setBotInput] = useState("");
  const [isBotLoading, setIsBotLoading] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "signup">("login");
  const [authForm, setAuthForm] = useState({ name: "", email: "", password: "" });
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState("");
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [productDetailOpen, setProductDetailOpen] = useState(false);
  const [visibleCarePlaces, setVisibleCarePlaces] = useState<CarePlace[]>(carePlaces);
  const [activeCareCategory, setActiveCareCategory] = useState<"All" | CarePlace["category"]>("All");

  const [showAllProducts, setShowAllProducts] = useState(false);
  const [selectedCarePlace, setSelectedCarePlace] = useState<CarePlace | null>(null);

  const filteredCarePlaces = useMemo(
    () => activeCareCategory === "All" ? visibleCarePlaces : visibleCarePlaces.filter((place) => place.category === activeCareCategory),
    [activeCareCategory, visibleCarePlaces],
  );

  const filteredProducts = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    return featuredProducts.filter((item) => {
      const matchesCategory = activeCategory === "All" || item.category === activeCategory;
      const matchesQuery = !query || `${item.name} ${item.benefit} ${item.category}`.toLowerCase().includes(query);
      return matchesCategory && matchesQuery;
    });
  }, [activeCategory, searchTerm]);

  const discoveryProducts = showAllProducts ? filteredProducts : filteredProducts.slice(0, 4);

  useEffect(() => {
    setShowAllProducts(false);
  }, [activeCategory, searchTerm]);

  const cartTotal = cart.reduce((sum, item) => sum + item.price, 0);

  useEffect(() => {
    const authRequested = new URLSearchParams(window.location.search).get("auth");
    window.localStorage.removeItem("herbal-health-user");
    if (authRequested === "login" || authRequested === "signup") {
      setAuthMode(authRequested);
      setAuthError("");
      setAuthOpen(true);
    }
  }, []);

  const scrollToId = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const runSearch = () => {
    setSearchTerm(heroQuery.trim());
    void trackAnalyticsEvent("product_search");
    scrollToId("discover");
  };

  const addToCart = (item: Product) => {
    const result = addCartProduct(item);
    if (!result.added) {
      toast.error(`You can add up to 20 ${item.name} items per order.`);
      return;
    }
    setCartOpen(true);
    toast.success(`${item.name} added to basket`, { description: "A small step for your pantry and routine." });
  };

  const openProductDetail = (product: Product) => {
    void trackAnalyticsEvent("product_view");
    setSelectedProduct(product);
    setProductDetailOpen(true);
  };

  const sendBotMessage = async () => {
    const trimmed = botInput.trim();
    if (!trimmed) return;

    const userMessage: ChatMessage = { id: Date.now(), role: "user", text: trimmed };
    setChatMessages((current) => [...current, userMessage]);
    setBotInput("");
    setIsBotLoading(true);

    try {
      const response = await fetch("/api/health/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: trimmed }),
      });
      const data = response.ok ? await response.json() : generateHealthReply(trimmed);
      const aiReply = typeof data === "string" ? data : data.answer;
      const suggestedProducts = (typeof data === "string" ? [] : data.recommendedProducts) || [];
      const medicinalSuggestions = (typeof data === "string" ? [] : data.medicinalSuggestions) || [];
      const fitnessAdvice = (typeof data === "string" ? [] : data.fitnessAdvice) || [];
      const actionPlan = (typeof data === "string" ? [] : data.actionPlan) || [];
      const assistantMessage: ChatMessage = {
        id: Date.now() + 1,
        role: "assistant",
        text: `${aiReply}\n\nSuggested products: ${suggestedProducts.map((product: Product) => product.name).join(", ") || "No direct match"}.\nMedicinal suggestions: ${medicinalSuggestions.join(" • ") || "Keep it gentle and consistent."}\nFitness guidance: ${fitnessAdvice.join(" • ") || "Add gentle movement and recovery time."}\nAction plan: ${actionPlan.join(" • ") || "Keep a simple daily rhythm and monitor trends."}`,
      };

      setChatMessages((current) => [...current, assistantMessage]);
    } catch (error) {
      console.error(error);
      const fallback = generateHealthReply(trimmed);
      setChatMessages((current) => [...current, { id: Date.now() + 2, role: "assistant", text: `${fallback.answer}\n\nSuggested products: ${fallback.recommendedProducts.map((product) => product.name).join(", ")}\nFitness guidance: ${fallback.fitnessAdvice?.join(" • ") || "Add gentle movement and recovery time."}` }]);
    }

    setIsBotLoading(false);
  };

  const handleAuthSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (authBusy) return;
    setAuthBusy(true);
    setAuthError("");
    try {
      const response = await fetch(`/api/auth/${authMode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: authForm.name,
          email: authForm.email,
          password: authForm.password,
        }),
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.message || "Authentication failed");
      }

      window.localStorage.removeItem("herbal-health-user");
      setAuthOpen(false);
      setAuthForm({ name: "", email: "", password: "" });
      toast.success(authMode === "login" ? "Welcome back" : "Account created", {
        description: authMode === "login" ? "Your account is ready for checkout and care access." : "You can now save orders and schedule expert support.",
      });
    } catch (error) {
      console.error(error);
      const message = error instanceof Error ? error.message : "Please check your details and try again.";
      setAuthError(message);
      toast.error("Could not sign in", { description: message });
    } finally {
      setAuthBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_#f9f6ef_0%,_#f0eee6_34%,_#e6ebde_100%)] text-[#173d32]">
      <div className="pointer-events-none fixed inset-0 z-0 opacity-25 paper-grain" aria-hidden="true" />

      <SiteHeader />

      <main id="top" className="relative z-10">
        <section className="mx-auto max-w-[1440px] px-5 pb-10 pt-10 lg:px-12 lg:pb-16 lg:pt-14">
          <div className="hero-shell rounded-[2.2rem] border border-white/15 p-6 text-[#f7f3eb] shadow-[0_24px_70px_rgba(18,41,35,0.24)] lg:p-10">
            <div className="grid gap-8 md:grid-cols-[1.05fr_0.95fr] md:items-center">
              <div className="min-w-0 max-w-[620px]">
                <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-[#f7d8a4]/35 bg-[#f7d8a4]/10 px-3.5 py-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-[#ffe8bb] shadow-[0_8px_24px_rgba(0,0,0,0.08)]">
                  <Sparkles className="h-3.5 w-3.5" />
                  Daily wellness guidance
                </div>

                <h1 className="font-display text-[clamp(3.2rem,6vw,6.5rem)] leading-[0.88] tracking-[-0.08em] text-[#fffaf1]">
                  Small steps.
                  <span className="block bg-gradient-to-r from-[#ffe5a9] via-[#f4cc86] to-[#f2b978] bg-clip-text text-transparent">Thoughtful choices.</span>
                  <span className="block text-[#e7f2e4]">Your wellbeing.</span>
                </h1>

                <p className="mt-6 max-w-[530px] font-sans text-base leading-7 text-[#edf3ea]/80 sm:text-lg">
                  Explore everyday wellness products and practical, general guidance at your own pace. Find clear information, understand your options, and choose a next step that feels right for you.
                </p>

                <div className="mt-8 flex flex-wrap items-center gap-3">
                  <button className="rounded-full bg-gradient-to-r from-[#f8d18a] to-[#e7a94f] px-5 py-3 font-sans text-xs font-bold uppercase tracking-[0.16em] text-[#133a33] shadow-[0_10px_24px_rgba(231,169,79,0.25)] transition hover:-translate-y-0.5 hover:brightness-105" onClick={() => scrollToId("discover")}>
                    Explore wellness
                  </button>
                  <button className="rounded-full border border-[#f7f3eb]/20 bg-[#f7f3eb]/5 px-5 py-3 font-sans text-xs font-bold uppercase tracking-[0.16em] text-[#f7f3eb] transition hover:bg-[#f7f3eb]/10" onClick={() => scrollToId("guidance")}>
                    Explore guidance
                  </button>
                </div>

                <form className="hero-search mt-5 flex max-w-xl items-center gap-2 rounded-full border border-white/20 bg-white/10 p-1.5 backdrop-blur-sm" onSubmit={(event) => { event.preventDefault(); runSearch(); }}>
                  <Search className="ml-3 h-4 w-4 shrink-0 text-[#f7f3eb]/65" />
                  <input
                    value={heroQuery}
                    onChange={(event) => setHeroQuery(event.target.value)}
                    placeholder="Search products by name or type"
                    aria-label="Search wellness products by name or type"
                    className="min-w-0 flex-1 bg-transparent px-1 py-2 text-sm text-[#f7f3eb] outline-none placeholder:text-[#f7f3eb]/55"
                  />
                  <button type="submit" className="rounded-full bg-[#f7f3eb] px-4 py-2.5 font-sans text-[10px] font-bold uppercase tracking-[0.14em] text-[#173d32]">
                    Explore
                  </button>
                </form>

                <div className="mt-7 grid gap-3 sm:grid-cols-3">
                  {[
                    { value: "Explore", label: "Product details & ingredients" },
                    { value: "Learn", label: "General wellness information" },
                    { value: "Choose", label: "Your next step, at your pace" },
                  ].map((item) => (
                    <div key={item.label} className="rounded-2xl border border-[#f7f3eb]/15 bg-[#f7f3eb]/5 p-3 backdrop-blur-sm">
                      <p className="font-display text-2xl leading-none text-[#f4cc86]">{item.value}</p>
                      <p className="mt-2 font-sans text-[10px] uppercase tracking-[0.14em] text-[#edf3ea]/70">{item.label}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="relative min-w-0 h-[360px] sm:h-[440px] lg:h-[520px]">
                <div className="hero-orbit absolute -right-8 top-0 h-64 w-64 rounded-full border border-[#f7d8a4]/35" />
                <div className="absolute inset-y-8 right-6 w-[66%] rounded-[38%_62%_49%_51%/42%_44%_56%_58%] bg-[radial-gradient(circle_at_center,_rgba(245,201,124,0.85),_rgba(245,201,124,0.32)_36%,_rgba(255,255,255,0)_69%)] blur-3xl" />
                <div className="relative h-full overflow-hidden rounded-[2rem] border border-white/20 bg-white/10 p-3 shadow-[0_20px_40px_rgba(12,24,20,0.22)] backdrop-blur-sm">
                  <img
                    src="https://commons.wikimedia.org/wiki/Special:FilePath/Healthy%20food.jpg?width=1200"
                    alt="Fresh herbs, fruits and wellness ingredients"
                    className="hero-image h-full w-full rounded-[1.5rem] object-cover"
                  />
                  <div className="hero-float absolute right-7 top-7 rounded-2xl border border-white/20 bg-[#173d32]/75 px-4 py-3 text-white shadow-xl backdrop-blur-md">
                    <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-[#f7d8a4]">A considered place to begin</p>
                    <p className="mt-1 font-display text-xl">Explore at your own pace.</p>
                  </div>
                  <div className="absolute bottom-6 left-6 max-w-[240px] rounded-2xl border border-[#f7f3eb]/20 bg-[#f7f3eb]/10 p-4 backdrop-blur-md">
                    <p className="font-sans text-[10px] uppercase tracking-[0.2em] text-[#edf3ea]/75">Our approach</p>
                    <p className="mt-2 font-display text-2xl leading-none text-[#f7f3eb]">Clear choices. No pressure.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-[1440px] px-5 pb-4 lg:px-12">
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              { label: "Explore products", detail: "Browse details and ingredient information", href: "/products", icon: ShoppingBag },
              { label: "Get general guidance", detail: "Educational ideas, not a diagnosis", href: "/guidance", icon: Stethoscope },
              { label: "Browse nearby care", detail: "Preview map pins · verify listings independently", href: "/care", icon: MapPin },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <Link key={item.label} href={item.href} className="group flex items-center gap-4 rounded-2xl border border-[#173d32]/10 bg-white/65 p-4 transition duration-300 hover:-translate-y-1 hover:border-[#d79a32]/50 hover:bg-white hover:shadow-[0_16px_30px_rgba(23,61,50,0.08)]">
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[#e9f1e4] text-[#173d32] transition group-hover:bg-[#f4cc86]"><Icon className="h-5 w-5" /></span>
                  <span><strong className="block font-display text-xl leading-none">{item.label}</strong><span className="mt-1 block text-xs text-[#173d32]/55">{item.detail}</span></span>
                  <ArrowRight className="ml-auto h-4 w-4 text-[#173d32]/35 transition group-hover:translate-x-1 group-hover:text-[#173d32]" />
                </Link>
              );
            })}
          </div>
        </section>

        <section className="mx-auto max-w-[1440px] px-5 pb-6 lg:px-12">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {supportCards.map(({ title, desc, icon: Icon }) => (
              <div key={title} className="rounded-[1.7rem] border border-[#173d32]/10 bg-white/60 p-5 shadow-sm backdrop-blur-sm">
                <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-[#dfe9d5] text-[#173d32]">
                  <Icon className="h-5 w-5" />
                </div>
                <p className="font-display text-2xl leading-none text-[#173d32]">{title}</p>
                <p className="mt-3 font-sans text-sm leading-6 text-[#173d32]/65">{desc}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-[1440px] px-5 pb-6 lg:px-12">
          <div className="rounded-[2rem] border border-[#173d32]/10 bg-[linear-gradient(135deg,#fffaf0_0%,#edf5ea_50%,#f4ead6_100%)] p-6 shadow-[0_18px_40px_rgba(23,61,50,0.06)] lg:p-8">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <div className="mb-3 flex items-center gap-3 font-sans text-[11px] font-semibold uppercase tracking-[0.25em] text-[#a36d21]">
                  <Leaf className="h-4 w-4" />
                  Why it works
                </div>
                <h3 className="font-display text-[clamp(2.2rem,3vw,4rem)] leading-[0.95] tracking-[-0.06em] text-[#173d32]">Explore without the overwhelm.</h3>
              </div>
              <p className="max-w-xl font-sans text-base leading-7 text-[#173d32]/68">
                Start with information, explore options, and decide what feels useful. This site offers general educational content—not personal medical advice—and makes preview features clear before you rely on them.
              </p>
            </div>

            <div className="mt-7 grid gap-4 md:grid-cols-3">
              {[
                { title: "Start where you are", text: "Browse products, read general guidance, or open the care map preview." },
                { title: "See the details", text: "Review the catalog descriptions and ingredients before exploring a product." },
                { title: "Know the limits", text: "Expert profiles, sample map pins, catalog data, and fulfillment are labeled as previews." },
              ].map((item) => (
                <div key={item.title} className="rounded-[1.6rem] border border-[#173d32]/10 bg-white/60 p-5">
                  <p className="font-display text-2xl leading-none text-[#173d32]">{item.title}</p>
                  <p className="mt-3 font-sans text-sm leading-6 text-[#173d32]/65">{item.text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-[1440px] px-5 py-16 lg:px-12 lg:py-20">
          <div className="mb-8 flex items-end justify-between gap-4">
            <div>
              <div className="mb-4 flex items-center gap-3 font-sans text-[11px] font-semibold uppercase tracking-[0.25em] text-[#a36d21]">
                <Sparkles className="h-4 w-4" />
                Product ideas
              </div>
              <h2 className="font-display text-[clamp(2.6rem,4vw,4.5rem)] leading-[0.95] tracking-[-0.06em] text-[#173d32]">A few places to start.</h2>
            </div>
            <button className="hidden rounded-full border border-[#173d32]/10 bg-white/60 px-5 py-3 font-sans text-[10px] font-semibold uppercase tracking-[0.16em] text-[#173d32] lg:inline-flex" onClick={() => scrollToId("discover")}>
              Shop the collection
            </button>
          </div>

          <div className="grid gap-5 lg:grid-cols-3">
            {featuredProducts.slice(0, 3).map((product) => {
              const match = product;
              return (
                <div key={product.id} className="group overflow-hidden rounded-[2rem] border border-[#173d32]/10 bg-[#f7f4ee] shadow-[0_18px_36px_rgba(23,61,50,0.08)] transition duration-200 hover:-translate-y-1 hover:shadow-[0_24px_44px_rgba(23,61,50,0.12)]">
                  <div className="relative h-72 overflow-hidden">
                    <button className="block h-full w-full text-left" onClick={() => openProductDetail(match)}>
                      <img src={product.image} alt={product.name} className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
                    </button>
                    <button className="absolute right-4 top-4 inline-flex h-11 w-11 items-center justify-center rounded-full border border-[#173d32]/10 bg-white/85 text-[#173d32] shadow-sm" onClick={() => addToCart(match)} aria-label={`Add ${product.name} to cart`}>
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="space-y-4 p-5">
                    <div className="flex items-start justify-between gap-4">
                      <button className="text-left" onClick={() => openProductDetail(match)}>
                        <p className="font-display text-3xl leading-none text-[#173d32]">{product.name}</p>
                        <p className="mt-2 font-sans text-xs uppercase tracking-[0.16em] text-[#173d32]/55">{product.category} · catalog preview</p>
                      </button>
                      <p className="font-display text-2xl text-[#173d32]">{formatINR(product.price)}</p>
                    </div>
                    <div className="flex gap-2">
                      <button className="inline-flex flex-1 items-center justify-center gap-2 rounded-full bg-[#173d32] px-4 py-2.5 font-sans text-[10px] font-semibold uppercase tracking-[0.14em] text-[#f7f3eb]" onClick={() => addToCart(match)}>
                        Add to basket
                        <ArrowRight className="h-3.5 w-3.5" />
                      </button>
                      <button className="inline-flex items-center justify-center rounded-full border border-[#173d32]/10 bg-white px-3 py-2.5 font-sans text-[10px] font-semibold uppercase tracking-[0.14em] text-[#173d32]" onClick={() => openProductDetail(match)}>
                        Details
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="mx-auto max-w-[1440px] px-5 pb-8 lg:px-12">
          <div className="rounded-[2rem] border border-[#173d32]/10 bg-[#173d32] p-6 text-[#f7f3eb] shadow-[0_20px_44px_rgba(23,61,50,0.16)] lg:p-8">
            <div className="grid gap-6 lg:grid-cols-[.8fr_1.2fr] lg:items-center">
              <div>
                <div className="mb-3 flex items-center gap-3 font-sans text-[11px] font-semibold uppercase tracking-[0.25em] text-[#f7d8a4]">
                  <ShieldCheck className="h-4 w-4" />
                  Clear from the start
                </div>
                <h3 className="font-display text-[clamp(2.2rem,3vw,4rem)] leading-[0.95] tracking-[-0.06em]">Wellness information, with honest limits.</h3>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                {[
                  ["Not medical advice", "This site cannot diagnose, treat, or replace a clinician."],
                  ["Preview features", "Expert profiles, care pins, product catalog, and fulfillment are examples—not live services."],
                  ["Your choice", "Explore information freely; share only what you are comfortable sharing."],
                ].map(([title, text]) => (
                  <div key={title} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <p className="font-display text-xl">{title}</p>
                    <p className="mt-2 text-sm leading-6 text-white/70">{text}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section id="discover" className="scroll-mt-24 mx-auto max-w-[1440px] px-5 py-16 lg:px-12 lg:py-24">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="mb-4 flex items-center gap-3 font-sans text-[11px] font-semibold uppercase tracking-[0.25em] text-[#a36d21]">
                <span className="h-px w-10 bg-[#a36d21]" />
                Discovery
              </div>
              <h2 className="font-display text-[clamp(2.8rem,4vw,5.4rem)] leading-[0.95] tracking-[-0.06em] text-[#173d32]">
                Good places to begin.
              </h2>
            </div>
            <div className="flex w-full max-w-md items-center gap-3 rounded-full border border-[#173d32]/15 bg-white/50 px-4 py-3 shadow-sm">
              <Search className="h-4 w-4 text-[#173d32]/55" />
              <input value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Filter the shortlist" className="w-full bg-transparent text-sm text-[#173d32] placeholder:text-[#173d32]/50 focus:outline-none" aria-label="Filter product list" />
            </div>
          </div>

          <div className="mt-8 flex flex-wrap gap-3">
            {(["All", "Fruit", "Herb", "Wellness", "Nutrition", "Fitness"] as const).map((category) => (
              <button key={category} className={`rounded-full px-5 py-2 text-sm font-medium transition ${activeCategory === category ? "bg-[#173d32] text-[#f7f3eb]" : "bg-[#edf1ea] text-[#173d32]/75 hover:bg-[#e3eadc]"}`} onClick={() => setActiveCategory(category)}>
                {category}
              </button>
            ))}
          </div>

          <div className="mt-10 grid gap-6 xl:grid-cols-2">
            {discoveryProducts.map((item) => (
              <article key={item.id} className="group overflow-hidden rounded-[2rem] border border-[#173d32]/10 bg-[#f6f3ed] shadow-[0_18px_40px_rgba(23,61,50,0.08)] transition duration-300 hover:-translate-y-1 hover:shadow-[0_26px_48px_rgba(23,61,50,0.1)]">
                <div className="relative h-[240px] overflow-hidden border-b border-[#173d32]/8">
                  <img src={item.image} alt={item.name} className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
                  <span className="absolute left-4 top-4 inline-flex items-center gap-2 rounded-full bg-white/80 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-[#173d32] backdrop-blur-sm">
                    {item.category}
                  </span>
                  <button className="absolute right-4 top-4 inline-flex h-11 w-11 items-center justify-center rounded-full border border-[#173d32]/10 bg-white/85 text-[#173d32] shadow-sm transition hover:scale-105" onClick={() => addToCart(item)} aria-label={`Add ${item.name} to cart`}>
                    <Plus className="h-4 w-4" />
                  </button>
                </div>

                <div className="space-y-4 p-6">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-display text-4xl leading-none tracking-[-0.05em] text-[#173d32]">{item.name}</p>
                      <p className="mt-2 font-sans text-sm text-[#173d32]/60">{item.benefit}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-display text-2xl text-[#173d32]">{formatINR(item.price)}</p>
                      <p className="text-[10px] uppercase tracking-[0.16em] text-[#173d32]/55">{item.unit}</p>
                    </div>
                  </div>

                  <p className="font-sans text-sm leading-6 text-[#173d32]/65">{item.note}</p>

                  <div className="flex items-center justify-between gap-3 border-t border-[#173d32]/10 pt-4">
                    <div className="inline-flex items-center gap-2 text-[#173d32]/70">
                      <span className="h-2 w-2 rounded-full bg-[#d79a32]" />
                      <span className="font-sans text-xs uppercase tracking-[0.16em]">Catalog preview</span>
                    </div>
                    <button className="inline-flex items-center gap-2 rounded-full border border-[#173d32]/10 bg-[#ebefe7] px-4 py-2 font-sans text-xs font-semibold text-[#173d32] transition hover:bg-[#dde7d4]" onClick={() => addToCart(item)}>
                      Add to cart
                      <ArrowRight className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
          {filteredProducts.length === 0 && (
            <div className="mt-10 rounded-[2rem] border border-dashed border-[#173d32]/20 bg-white/50 p-10 text-center">
              <p className="font-display text-3xl text-[#173d32]">No close matches yet.</p>
              <p className="mt-2 text-sm text-[#173d32]/60">Try another search or browse all wellness picks.</p>
              <button
                type="button"
                className="mt-5 rounded-full bg-[#173d32] px-5 py-2 text-sm font-semibold text-white"
                onClick={() => { setSearchTerm(""); setActiveCategory("All"); }}
              >
                Reset discovery
              </button>
            </div>
          )}
          {filteredProducts.length > 4 && (
            <div className="mt-10 flex justify-center">
              <button
                type="button"
                className="inline-flex items-center gap-2 rounded-full border border-[#173d32]/15 bg-white/60 px-6 py-3 font-sans text-xs font-semibold uppercase tracking-[0.16em] text-[#173d32] transition hover:bg-[#edf1ea]"
                onClick={() => setShowAllProducts((current) => !current)}
              >
                {showAllProducts ? "Show less" : `See more products (${filteredProducts.length - 4})`}
                <ChevronRight className={`h-4 w-4 transition-transform ${showAllProducts ? "-rotate-90" : "rotate-90"}`} />
              </button>
            </div>
          )}
        </section>

        <section id="guidance" className="scroll-mt-24 border-t border-[#173d32]/10 bg-[#eef4eb] py-16 lg:py-24">
          <div className="mx-auto max-w-[1440px] px-5 lg:px-12">
            <div className="grid gap-8 lg:grid-cols-[0.95fr_1.05fr]">
              <div className="rounded-[2rem] border border-[#173d32]/10 bg-[linear-gradient(145deg,#fefaf3_0%,#edf4ea_100%)] p-6 shadow-sm">
                <div className="mb-4 flex items-center gap-3 font-sans text-[11px] font-semibold uppercase tracking-[0.25em] text-[#a36d21]">
                  <Bot className="h-4 w-4" />
                  AI wellness assistant
                </div>
                <h3 className="font-display text-[clamp(2.5rem,4vw,4rem)] leading-[0.95] tracking-[-0.06em] text-[#173d32]">Ask before you try.</h3>
                <p className="mt-4 font-sans text-base leading-7 text-[#173d32]/70">
                  Explore general information about everyday routines. This AI-generated demo can be inaccurate and is not a diagnosis, treatment plan, or substitute for a clinician.
                </p>
                <p className="mt-3 rounded-xl border border-[#173d32]/10 bg-white/70 p-3 text-xs leading-5 text-[#173d32]/70">
                  Your message is sent to the Health Hub service to generate a response. Avoid sharing your name, contact details, or highly sensitive health information.
                </p>

                <div className="mt-8 space-y-3">
                  {[
                    "I’m having trouble sleeping",
                    "My digestion feels off",
                    "I feel stressed and unfocused",
                  ].map((prompt) => (
                    <button key={prompt} className="flex w-full items-center justify-between rounded-2xl border border-[#173d32]/10 bg-white/70 px-4 py-3 text-left font-sans text-sm text-[#173d32]/75 transition hover:bg-[#edf3eb]" onClick={() => setBotInput(prompt)}>
                      <span>{prompt}</span>
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  ))}
                </div>
              </div>

              <div className="rounded-[2rem] border border-[#173d32]/10 bg-[#173d32] p-4 text-[#f7f3eb] shadow-[0_24px_48px_rgba(23,61,50,0.18)]">
                <div className="mb-4 flex items-center justify-between gap-3 border-b border-white/10 pb-3">
                  <div className="flex items-center gap-3">
                    <div className="grid h-10 w-10 place-items-center rounded-2xl bg-[#d79a32] text-[#173d32]">
                      <Bot className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="font-sans text-sm font-semibold">Herbal Guide AI</p>
                      <p className="text-[10px] uppercase tracking-[0.17em] text-[#f7f3eb]/60">AI-generated demo · not medical care</p>
                    </div>
                  </div>
                  <button className="rounded-full border border-white/15 bg-white/5 px-2.5 py-1.5 text-[10px] uppercase tracking-[0.14em] text-[#f7f3eb]" onClick={() => setChatMessages([{ id: 1, role: "assistant", text: "Hi! I can help with gentle wellness guidance. Tell me what you’re feeling, like digestion, sleep, stress, or focus." }])}>
                    Reset
                  </button>
                </div>

                <div className="chat-scroll max-h-[420px] space-y-4 overflow-y-auto pr-1">
                  {chatMessages.map((message) => (
                    <div key={message.id} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-6 ${message.role === "user" ? "bg-[#d79a32] text-[#173d32]" : "bg-white/8 text-[#f7f3eb]"}`}>
                        {message.text}
                      </div>
                    </div>
                  ))}

                  {isBotLoading && (
                    <div className="flex justify-start">
                      <div className="rounded-2xl bg-white/8 px-4 py-3 text-sm text-[#f7f3eb]/85">Thinking…</div>
                    </div>
                  )}
                </div>

                <div className="mt-4 flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 p-2">
                  <Input value={botInput} onChange={(event) => setBotInput(event.target.value)} onKeyDown={(event) => event.key === "Enter" && sendBotMessage()} placeholder="Ask about sleep, stress or digestion" className="border-0 bg-transparent text-[#f7f3eb] placeholder:text-[#f7f3eb]/55 focus-visible:ring-0" />
                  <Button className="rounded-full bg-[#d79a32] text-[#173d32] hover:bg-[#e1b667]" onClick={sendBotMessage}>
                    Send
                  </Button>
                </div>

                <div className="mt-6 grid gap-4 xl:grid-cols-2">
                  <div className="rounded-[1.5rem] border border-white/10 bg-white/5 p-4">
                    <p className="font-sans text-[10px] uppercase tracking-[0.16em] text-[#f7f3eb]/60">Recommended products</p>
                    <div className="mt-3 space-y-2">
                      {featuredProducts.slice(0, 3).map((product) => (
                        <button key={product.id} className="flex w-full items-center justify-between rounded-2xl border border-white/10 bg-[#f7f3eb]/5 px-3 py-2 text-left" onClick={() => addToCart(product)}>
                          <div>
                            <p className="font-display text-xl leading-none text-[#f7f3eb]">{product.name}</p>
                            <p className="mt-1 font-sans text-[10px] uppercase tracking-[0.12em] text-[#f7f3eb]/60">{product.category}</p>
                          </div>
                          <span className="font-sans text-sm font-semibold text-[#f7f3eb]">{formatINR(product.price)}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-[1.5rem] border border-white/10 bg-white/5 p-4">
                    <p className="font-sans text-[10px] uppercase tracking-[0.16em] text-[#f7f3eb]/60">General ideas to consider</p>
                    <ul className="mt-3 space-y-2 font-sans text-sm text-[#f7f3eb]/80">
                      {[
                        "Chamomile tea for evening calm",
                        "Ginger routine for digestion",
                        "Hydration + lemon balm for stress support",
                      ].map((tip) => (
                        <li key={tip} className="flex items-start gap-2">
                          <span className="mt-1 h-2 w-2 rounded-full bg-[#d79a32]" />
                          <span>{tip}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="care" className="scroll-mt-24 mx-auto max-w-[1440px] px-5 py-16 lg:px-12 lg:py-24">
          <div className="mb-8 flex items-center justify-between gap-4">
            <div>
              <div className="mb-4 flex items-center gap-3 font-sans text-[11px] font-semibold uppercase tracking-[0.25em] text-[#a36d21]">
                <MapPin className="h-4 w-4" />
                Care finder
              </div>
              <h2 className="font-display text-[clamp(2.8rem,4vw,5rem)] leading-[0.95] tracking-[-0.06em] text-[#173d32]">Care near you.</h2>
            </div>
            <p className="max-w-sm text-sm leading-6 text-[#173d32]/65">Sample map pins and third-party map results may be incomplete. Confirm addresses, hours, and services directly before travelling.</p>
          </div>

          <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
            <div className="overflow-hidden rounded-[2rem] border border-[#173d32]/10 bg-[#dfe8d2] shadow-[0_18px_40px_rgba(23,61,50,0.08)]">
              <div className="flex items-center justify-between border-b border-[#173d32]/10 bg-[#edf5ea]/50 px-5 py-4">
                <div className="flex items-center gap-3 font-sans text-[10px] font-semibold uppercase tracking-[0.2em] text-[#173d32]/60">
                  <MapPin className="h-4 w-4 text-[#173d32]" />
                  Moradabad area · map preview
                </div>
                <div className="flex flex-wrap items-center gap-2 text-[9px] font-semibold uppercase tracking-[0.14em] text-[#173d32]/70">
                  {['All', 'Hospital', 'Clinic', 'Fruit & Veg', 'Medical Shop', 'Local Shop'].map((label) => (
                    <button key={label} onClick={() => setActiveCareCategory(label as "All" | CarePlace["category"])} className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-1 transition ${activeCareCategory === label ? "border-[#173d32] bg-[#173d32] text-white" : "border-[#173d32]/10 bg-white/60 hover:bg-white"}`}>
                      {label !== "All" && <span className="h-2 w-2 rounded-full" style={{ backgroundColor: label === 'Hospital' ? '#173d32' : label === 'Clinic' ? '#2f8d61' : label === 'Fruit & Veg' ? '#d79a32' : label === 'Medical Shop' ? '#a96749' : '#7d6a55' }} />}
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="h-[420px] overflow-hidden">
                <MapView
                  key={activeCareCategory}
                  className="h-full w-full rounded-none"
                  initialCenter={{ lat: 28.8386, lng: 78.7733 }}
                  initialZoom={12}
                  places={carePlaces.map((place) => ({
                    name: place.name,
                    category: place.category,
                    specialty: place.specialty,
                    position: place.position,
                    source: "sample",
                  }))}
                  visibleCategories={activeCareCategory === "All" ? undefined : [activeCareCategory]}
                  onPlacesLoaded={(places) => {
                    const nextPlaces = places.map((place) => ({
                        name: place.name,
                        kind: place.category,
                        category: place.category as CarePlace["category"],
                        distance: place.distance ?? "Nearby",
                        specialty: place.specialty ?? "Nearby support",
                        source: place.source ?? "map-provider",
                        position: place.position,
                      }));
                    setVisibleCarePlaces(nextPlaces);
                    setSelectedCarePlace((current) => current && nextPlaces.some((place) => place.name === current.name) ? current : null);
                  }}
                  onMarkerClick={(place) => setSelectedCarePlace({
                    name: place.name,
                    kind: place.category,
                    category: place.category as CarePlace["category"],
                    distance: place.distance ?? "Nearby",
                    specialty: place.specialty ?? "Nearby support",
                    source: place.source ?? "map-provider",
                    position: place.position,
                  })}
                />
              </div>
              <div className="flex items-center justify-between border-t border-[#173d32]/10 bg-[#edf5ea]/50 px-5 py-3">
                <div className="font-sans text-[10px] uppercase tracking-[0.18em] text-[#173d32]/65">Sample pins · not verified provider listings</div>
                <button
                  className="rounded-full border border-[#173d32]/10 bg-white/80 px-3 py-1.5 font-sans text-[10px] font-semibold uppercase tracking-[0.14em] text-[#173d32]"
                  onClick={() => window.open(googleMapsOpenUrl, "_blank", "noopener,noreferrer")}
                >
                  Open directions
                </button>
              </div>
            </div>

            <div className="rounded-[2rem] border border-[#173d32]/10 bg-[#173d32] p-5 text-[#f7f3eb] shadow-[0_22px_44px_rgba(23,61,50,0.16)]">
              <div className="mb-4 flex items-center justify-between gap-3 text-[#d79a32]">
                <div className="flex items-center gap-3">
                  <HeartPulse className="h-5 w-5" />
                  <span className="font-sans text-[10px] font-semibold uppercase tracking-[0.2em]">Care map preview</span>
                </div>
                <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1.5 font-sans text-[9px] font-semibold uppercase tracking-[0.16em] text-[#f7f3eb]">
                  Preview
                </span>
              </div>

              <div className="max-h-[620px] space-y-3 overflow-y-auto pr-1">
                {selectedCarePlace && (
                  <div className="rounded-2xl border border-[#d79a32]/40 bg-[#f7d8a4]/15 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-display text-2xl leading-none text-[#f7f3eb]">{selectedCarePlace.name}</p>
                        <p className="mt-2 text-[10px] uppercase tracking-[0.16em] text-[#f7f3eb]/65">{selectedCarePlace.category} · {selectedCarePlace.distance}</p>
                      </div>
                      <button type="button" className="rounded-full border border-white/15 px-2 py-1 text-xs text-[#f7f3eb]/75" onClick={() => setSelectedCarePlace(null)} aria-label="Close selected place details">Close</button>
                    </div>
                    <p className="mt-3 text-sm text-[#f7f3eb]/75">{selectedCarePlace.specialty}</p>
                  </div>
                )}
                {filteredCarePlaces.map((place) => (
                  <div key={place.name} className="rounded-2xl border border-white/8 bg-white/4 p-4 transition hover:bg-white/6">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-display text-2xl leading-none text-[#f7f3eb]">{place.name}</p>
                        <p className="mt-2 font-sans text-[10px] uppercase tracking-[0.16em] text-[#f7f3eb]/60">{place.kind}</p>
                      </div>
                      <span className="rounded-full bg-[#f7d8a4] px-2 py-1 font-sans text-[10px] font-semibold uppercase tracking-[0.16em] text-[#173d32]">{place.source === "map-provider" ? "Map provider result" : "Sample pin"}</span>
                    </div>
                    <div className="mt-3 flex items-center justify-between gap-3">
                      <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1 font-sans text-[9px] uppercase tracking-[0.14em] text-[#f7f3eb]">{place.category}</span>
                      <span className="font-sans text-xs text-[#f7f3eb]/70">{place.specialty}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section id="experts" className="scroll-mt-24 bg-[#f6f0df] py-16 lg:py-24">
          <div className="mx-auto max-w-[1440px] px-5 lg:px-12">
            <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <div className="mb-4 flex items-center gap-3 font-sans text-[11px] font-semibold uppercase tracking-[0.25em] text-[#a36d21]">
                  <CalendarClock className="h-4 w-4" />
                  Talk to experts
                </div>
                <h2 className="font-display text-[clamp(2.8rem,4vw,5rem)] leading-[0.95] tracking-[-0.06em] text-[#173d32]">Human support, when connected.</h2>
                <p className="mt-4 max-w-xl font-sans text-sm leading-6 text-[#173d32]/65">These example profiles do not represent verified clinicians or real appointment availability. Peer-to-peer voice/video and account rupee-wallet billing are available when configured; appointment requests are not sent to a provider or confirmed.</p>
              </div>
              <Link href="/experts" className="inline-flex items-center gap-2 self-start rounded-full bg-[#173d32] px-5 py-3 font-sans text-xs font-semibold uppercase tracking-[0.15em] text-[#f7f3eb]">
                Preview expert support
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>

            <div className="grid gap-6 lg:grid-cols-3">
              {experts.map((expert) => (
                <div key={expert.id} className="rounded-[2rem] border border-[#173d32]/10 bg-white/60 p-5 shadow-[0_12px_26px_rgba(23,61,50,0.08)]">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="grid h-12 w-12 place-items-center rounded-2xl font-display text-lg text-[#173d32]" style={{ backgroundColor: `${expert.tone}66` }}>
                        {expert.initials}
                      </div>
                      <div>
                        <p className="font-display text-3xl leading-none text-[#173d32]">{expert.name}</p>
                        <p className="mt-2 font-sans text-xs uppercase tracking-[0.14em] text-[#173d32]/55">{expert.specialty}</p>
                      </div>
                    </div>
                    <span className="rounded-full bg-[#f7d8a4] px-2.5 py-1 font-sans text-[10px] font-semibold uppercase tracking-[0.12em] text-[#173d32]">Preview only</span>
                  </div>

                  <div className="mt-6 rounded-2xl border border-[#173d32]/10 bg-[#f9f5ef] p-4">
                    <div className="flex items-center justify-between gap-3 font-sans text-sm text-[#173d32]/75">
                      <span className="inline-flex items-center gap-2"><MessageSquareText className="h-4 w-4" /> {expert.mode}</span>
                      <span>Booking not connected</span>
                      <span className="inline-flex items-center gap-2 text-[#a36d21]"><Sparkles className="h-4 w-4" /> Example profile</span>
                    </div>
                  </div>

                  <div className="mt-6 flex gap-3">
                    <Link href="/experts" className="flex-1 rounded-full border border-[#173d32]/10 bg-[#173d32] px-4 py-3 text-center font-sans text-xs font-semibold uppercase tracking-[0.14em] text-[#f7f3eb]">
                      Chat & video
                    </Link>
                    <Link href="/experts" className="flex-1 rounded-full border border-[#173d32]/10 bg-[#edf1e9] px-4 py-3 text-center font-sans text-xs font-semibold uppercase tracking-[0.14em] text-[#173d32]">
                      Request a time
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="faq" className="mx-auto max-w-[1440px] px-5 py-16 lg:px-12 lg:py-24">
          <div className="grid gap-8 lg:grid-cols-[0.7fr_1.3fr] lg:items-start">
            <div>
              <div className="mb-4 flex items-center gap-3 font-sans text-[11px] font-semibold uppercase tracking-[0.25em] text-[#a36d21]">
                <Leaf className="h-4 w-4" />
                FAQ
              </div>
              <h2 className="font-display text-[clamp(2.8rem,4vw,5rem)] leading-[0.95] tracking-[-0.06em] text-[#173d32]">Questions people ask.</h2>
              <p className="mt-4 max-w-md font-sans text-base leading-7 text-[#173d32]/65">We aim to keep information gentle and clear, with a reminder that general wellness education is not a diagnosis or substitute for medical care.</p>
            </div>

            <div className="space-y-3">
              {faqList.map((faq) => (
                <details key={faq.q} className="group rounded-[1.5rem] border border-[#173d32]/10 bg-[#f8f5ee] p-4 shadow-sm open:bg-[#f1ebdf]">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-display text-2xl leading-tight text-[#173d32] marker:hidden">
                    <span>{faq.q}</span>
                    <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[#173d32]/10 bg-white text-[#173d32]">
                      <Plus className="h-4 w-4 transition group-open:rotate-45" />
                    </span>
                  </summary>
                  <p className="mt-4 max-w-[90%] font-sans text-sm leading-7 text-[#173d32]/70">{faq.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-[#173d32]/10 bg-[linear-gradient(135deg,#eaf0ea_0%,#edf1eb_100%)]">
        <div className="mx-auto max-w-[1440px] px-5 py-10 lg:px-12">
          <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="flex items-center gap-3">
                <div className="grid h-10 w-10 place-items-center rounded-full border border-[#173d32]/15 bg-[#e7eee5]">
                  <Leaf className="h-5 w-5 text-[#173d32]" />
                </div>
                <p className="wordmark wordmark-footer">HEALTH HUB</p>
              </div>
              <p className="mt-4 max-w-md font-sans text-base leading-7 text-[#173d32]/65">A thoughtfully designed starting point for food, herbs, and the care around them.</p>
            </div>

            <div className="flex flex-wrap gap-6 font-sans text-sm text-[#173d32]/70">
              <button className="hover:text-[#173d32]" onClick={() => scrollToId("discover")}>Discover</button>
              <Link className="hover:text-[#173d32]" href="/care">Care finder</Link>
              <button className="hover:text-[#173d32]" onClick={() => scrollToId("experts")}>Experts</button>
              <Link className="hover:text-[#173d32]" href="/faq">FAQ</Link>
              <Link className="hover:text-[#173d32]" href="/account">Account</Link>
            </div>
          </div>
        </div>
      </footer>

      <button className="fixed bottom-5 right-5 z-50 inline-flex h-14 w-14 items-center justify-center rounded-full bg-[#173d32] text-[#f7f3eb] shadow-[0_18px_34px_rgba(23,61,50,0.2)] transition hover:scale-105" onClick={() => scrollToId("guidance")} aria-label="Open AI guidance">
        <Bot className="h-6 w-6" />
      </button>

      <Dialog open={cartOpen} onOpenChange={setCartOpen}>
        <DialogContent className="min-w-[320px] max-w-lg rounded-[2rem] border border-[#173d32]/10 bg-[#f9f6ef] p-0">
          <div className="border-b border-[#173d32]/10 p-5">
            <div className="flex items-center justify-between">
              <DialogTitle className="font-display text-3xl text-[#173d32]">Your basket</DialogTitle>
              <button className="rounded-full border border-[#173d32]/10 bg-white p-2" onClick={() => setCartOpen(false)}><X className="h-4 w-4" /></button>
            </div>
          </div>

          <div className="p-5">
            {cart.length === 0 ? (
              <div className="rounded-[1.5rem] border border-dashed border-[#173d32]/15 bg-[#edf3ea] p-8 text-center">
                <ShoppingBag className="mx-auto h-8 w-8 text-[#173d32]/50" />
                <p className="mt-4 font-display text-2xl text-[#173d32]">Your basket is empty.</p>
                <p className="mt-2 font-sans text-sm text-[#173d32]/60">Add a few wellness picks to continue.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {cart.map((item, index) => (
                  <div key={`${item.id}-${index}`} className="flex items-center gap-3 rounded-[1.25rem] border border-[#173d32]/10 bg-white p-3">
                    <img src={item.image} alt={item.name} className="h-16 w-16 rounded-xl object-cover" />
                    <div className="min-w-0 flex-1">
                      <p className="font-display text-2xl leading-none text-[#173d32]">{item.name}</p>
                      <p className="mt-1 font-sans text-xs uppercase tracking-[0.12em] text-[#173d32]/55">{item.category}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-sans text-sm font-semibold text-[#173d32]">{formatINR(item.price)}</p>
                      <button className="mt-2 text-[10px] uppercase tracking-[0.15em] text-[#173d32]/60" onClick={() => removeFromCart(index)}>Remove</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <DialogFooter className="flex items-center justify-between border-t border-[#173d32]/10 p-5">
            <div>
              <p className="font-sans text-[10px] uppercase tracking-[0.18em] text-[#173d32]/55">Total</p>
              <p className="mt-1 font-display text-3xl text-[#173d32]">{formatINR(cartTotal)}</p>
            </div>
            <button disabled={cart.length === 0} className="rounded-full bg-[#173d32] px-5 py-3 font-sans text-xs font-semibold uppercase tracking-[0.14em] text-[#f7f3eb] disabled:cursor-not-allowed disabled:opacity-40" onClick={() => { setCartOpen(false); navigate("/checkout"); }}>
              Checkout
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={authOpen} onOpenChange={setAuthOpen}>
        <DialogContent className="max-w-md rounded-[2rem] border border-[#173d32]/10 bg-[#f9f6ef] p-0">
          <div className="border-b border-[#173d32]/10 p-5">
            <div className="flex items-center justify-between">
              <DialogTitle className="font-display text-3xl text-[#173d32]">{authMode === "login" ? "Welcome back" : "Create account"}</DialogTitle>
              <button className="rounded-full border border-[#173d32]/10 bg-white p-2" onClick={() => setAuthOpen(false)}><X className="h-4 w-4" /></button>
            </div>
            <DialogDescription className="mt-2 font-sans text-sm text-[#173d32]/70">
              Save your cart, track orders, and access expert support faster.
            </DialogDescription>
          </div>

          <form className="space-y-4 p-5" onSubmit={handleAuthSubmit}>
            {authMode === "signup" && (
              <Input
                aria-label="Full name"
                autoComplete="name"
                required
                maxLength={120}
                value={authForm.name}
                onChange={(event) => setAuthForm((current) => ({ ...current, name: event.target.value }))}
                placeholder="Full name"
                className="h-12 rounded-xl border-[#173d32]/10 bg-white"
              />
            )}
            <Input
              aria-label="Email address"
              type="email"
              autoComplete="email"
              required
              maxLength={254}
              value={authForm.email}
              onChange={(event) => setAuthForm((current) => ({ ...current, email: event.target.value }))}
              placeholder="Email address"
              className="h-12 rounded-xl border-[#173d32]/10 bg-white"
            />
            <Input
              aria-label="Password"
              type="password"
              autoComplete={authMode === "login" ? "current-password" : "new-password"}
              required
              minLength={authMode === "signup" ? 8 : undefined}
              maxLength={128}
              value={authForm.password}
              onChange={(event) => setAuthForm((current) => ({ ...current, password: event.target.value }))}
              placeholder="Password"
              className="h-12 rounded-xl border-[#173d32]/10 bg-white"
            />

            <div className="flex items-center justify-between gap-3 rounded-[1.2rem] border border-[#173d32]/10 bg-[#edf5ea] p-3 text-xs text-[#173d32]/65">
              <span>{authMode === "login" ? "Need an account?" : "Already a member?"}</span>
              <button type="button" className="font-semibold uppercase tracking-[0.12em] text-[#173d32]" onClick={() => { setAuthMode((current) => (current === "login" ? "signup" : "login")); setAuthError(""); }}>
                {authMode === "login" ? "Sign up" : "Log in"}
              </button>
            </div>

            {authError && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm leading-5 text-red-800">{authError}</p>}
            <button type="submit" disabled={authBusy} className="w-full rounded-full bg-[#173d32] px-5 py-3 font-sans text-xs font-semibold uppercase tracking-[0.14em] text-[#f7f3eb] disabled:cursor-wait disabled:opacity-60">
              {authBusy ? "Please wait…" : authMode === "login" ? "Login" : "Create account"}
            </button>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={productDetailOpen} onOpenChange={setProductDetailOpen}>
        <DialogContent className="max-w-3xl rounded-[2rem] border border-[#173d32]/10 bg-[#f9f6ef] p-0">
          {selectedProduct && (
            <>
              <div className="grid gap-0 md:grid-cols-2">
                <div className="h-full min-h-[320px] overflow-hidden">
                  <img src={selectedProduct.image} alt={selectedProduct.name} className="h-full w-full object-cover" />
                </div>
                <div className="p-6">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="font-sans text-[10px] uppercase tracking-[0.16em] text-[#173d32]/55">{selectedProduct.category}</p>
                      <DialogTitle className="mt-2 font-display text-4xl leading-none text-[#173d32]">{selectedProduct.name}</DialogTitle>
                    </div>
                    <span className="font-display text-3xl text-[#173d32]">{formatINR(selectedProduct.price)}</span>
                  </div>

                  <p className="mt-5 font-sans text-sm leading-7 text-[#173d32]/70">{selectedProduct.description}</p>

                  <div className="mt-5 rounded-[1.3rem] border border-[#173d32]/10 bg-white p-4">
                    <p className="font-sans text-[10px] uppercase tracking-[0.15em] text-[#173d32]/55">Why it stands out</p>
                    <p className="mt-2 font-sans text-sm text-[#173d32]/70">{selectedProduct.note}</p>
                  </div>

                  <div className="mt-5">
                    <p className="font-sans text-[10px] uppercase tracking-[0.15em] text-[#173d32]/55">Ingredients</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {(selectedProduct.ingredients || [selectedProduct.name]).map((ingredient) => (
                        <span key={ingredient} className="rounded-full border border-[#173d32]/10 bg-[#edf5ea] px-3 py-1.5 font-sans text-[10px] uppercase tracking-[0.12em] text-[#173d32]">{ingredient}</span>
                      ))}
                    </div>
                  </div>

                  <div className="mt-5 rounded-[1.3rem] border border-[#173d32]/10 bg-[#f0eadc] p-4">
                    <p className="font-sans text-[10px] uppercase tracking-[0.15em] text-[#173d32]/55">Preparation idea · follow package label</p>
                    <p className="mt-2 font-sans text-sm leading-6 text-[#173d32]/70">{selectedProduct.preparation}</p>
                  </div>
                  <p className="rounded-[1.3rem] border border-[#a36d21]/20 bg-[#fff8e9] p-4 text-xs leading-5 text-[#173d32]/70">
                    Catalog information is educational and may not match the final product label. Check ingredients and warnings on the package; ask a clinician or pharmacist about interactions or suitability.
                  </p>

                  <div className="mt-6 flex gap-3">
                    <button className="flex-1 rounded-full bg-[#173d32] px-5 py-3 font-sans text-[10px] font-semibold uppercase tracking-[0.14em] text-[#f7f3eb]" onClick={() => addToCart(selectedProduct)}>
                      Add to basket
                    </button>
                    <button className="rounded-full border border-[#173d32]/10 bg-white px-4 py-3 font-sans text-[10px] font-semibold uppercase tracking-[0.14em] text-[#173d32]" onClick={() => setProductDetailOpen(false)}>
                      Close
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

    </div>
  );
}
