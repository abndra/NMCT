import { useEffect, useState } from "react";
import {
  onProductsChange,
  onCategoriesChange,
  onReviewsChange,
  onAnnouncementsChange,
  onAuthChange,
  onSettingsChange,
  type Product,
  type Category,
  type Review,
  type Announcement,
} from "@/lib/db";
import type { User } from "firebase/auth";

export function useProducts() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let unsub = () => {};
    try {
      unsub = onProductsChange((items) => {
        setProducts(items);
        setLoading(false);
      });
    } catch {
      setLoading(false);
    }
    return () => unsub();
  }, []);
  return { products, visible: products.filter((p) => !p.hidden), loading };
}

export function useCategories() {
  const [categories, setCategories] = useState<Category[]>([]);
  useEffect(() => {
    let unsub = () => {};
    try {
      unsub = onCategoriesChange(setCategories);
    } catch {
      /* ignore */
    }
    return () => unsub();
  }, []);
  return categories.filter((c) => !c.hidden);
}

export function useReviews() {
  const [reviews, setReviews] = useState<Review[]>([]);
  useEffect(() => {
    let unsub = () => {};
    try {
      unsub = onReviewsChange(setReviews);
    } catch {
      /* ignore */
    }
    return () => unsub();
  }, []);
  return reviews;
}

export function useAnnouncements() {
  const [items, setItems] = useState<Announcement[]>([]);
  useEffect(() => {
    let unsub = () => {};
    try {
      unsub = onAnnouncementsChange(setItems);
    } catch {
      /* ignore */
    }
    return () => unsub();
  }, []);
  return items.filter((a) => a.active !== false);
}

export function useAuthUser() {
  const [user, setUser] = useState<User | null>(null);
  useEffect(() => {
    let unsub = () => {};
    try {
      unsub = onAuthChange(setUser);
    } catch {
      /* ignore */
    }
    return () => unsub();
  }, []);
  return user;
}
export function useSettings() {
  const [settings, setSettings] = useState<Record<string, unknown>>({});
  useEffect(() => {
    let unsub = () => {};
    try {
      unsub = onSettingsChange(setSettings);
    } catch {
      /* ignore */
    }
    return () => unsub();
  }, []);
  return settings;
}
