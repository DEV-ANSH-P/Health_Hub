import { useCallback, useEffect, useState } from "react";
import type { Product } from "@/pages/Home";

const CART_KEY = "herbal-health-cart";
const CART_UPDATED_EVENT = "health-hub-cart-updated";
const MAX_ITEM_QUANTITY = 20;

function readCart(catalog: Product[]): Product[] {
  try {
    const stored: unknown = JSON.parse(window.localStorage.getItem(CART_KEY) || "[]");
    if (!Array.isArray(stored)) return [];
    const products = new Map(catalog.map((product) => [product.id, product]));
    return stored.flatMap((entry) => {
      if (!entry || typeof entry !== "object" || !("id" in entry)) return [];
      const product = products.get(Number(entry.id));
      return product ? [product] : [];
    });
  } catch {
    return [];
  }
}

function publishCart(cart: Product[]) {
  window.localStorage.setItem(CART_KEY, JSON.stringify(cart));
  window.dispatchEvent(new Event(CART_UPDATED_EVENT));
}

export function useCart(catalog: Product[]) {
  const [cart, setCart] = useState<Product[]>(() => readCart(catalog));

  useEffect(() => {
    const syncCart = () => setCart(readCart(catalog));
    window.addEventListener("storage", syncCart);
    window.addEventListener(CART_UPDATED_EVENT, syncCart);
    return () => {
      window.removeEventListener("storage", syncCart);
      window.removeEventListener(CART_UPDATED_EVENT, syncCart);
    };
  }, [catalog]);

  const addToCart = useCallback((product: Product) => {
    const current = readCart(catalog);
    if (current.filter((item) => item.id === product.id).length >= MAX_ITEM_QUANTITY) {
      return { added: false, cart: current };
    }
    const next = [...current, product];
    publishCart(next);
    setCart(next);
    return { added: true, cart: next };
  }, [catalog]);

  const removeFromCart = useCallback((index: number) => {
    const next = readCart(catalog);
    if (index < 0 || index >= next.length) return;
    next.splice(index, 1);
    publishCart(next);
    setCart(next);
  }, [catalog]);

  const setCartItems = useCallback((next: Product[]) => {
    publishCart(next);
    setCart(next);
  }, []);

  return { cart, addToCart, removeFromCart, setCartItems };
}

export function useCartCount() {
  const [count, setCount] = useState(() => {
    try {
      const stored: unknown = JSON.parse(window.localStorage.getItem(CART_KEY) || "[]");
      return Array.isArray(stored) ? stored.length : 0;
    } catch {
      return 0;
    }
  });

  useEffect(() => {
    const syncCount = () => {
      try {
        const stored: unknown = JSON.parse(window.localStorage.getItem(CART_KEY) || "[]");
        setCount(Array.isArray(stored) ? stored.length : 0);
      } catch {
        setCount(0);
      }
    };
    window.addEventListener("storage", syncCount);
    window.addEventListener(CART_UPDATED_EVENT, syncCount);
    return () => {
      window.removeEventListener("storage", syncCount);
      window.removeEventListener(CART_UPDATED_EVENT, syncCount);
    };
  }, []);

  return count;
}
