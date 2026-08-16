import { ref, get, set, push } from "firebase/database";
import { getDb } from "./firebase";
import { Product, Category } from "./db";

export async function seedDemoData() {
  const db = getDb();
  
  // 1. Ensure Admin exists
  const adminSnap = await get(ref(db, "admin"));
  if (!adminSnap.exists()) {
    console.log("Seeding default admin key...");
    await set(ref(db, "admin"), {
      key: "admin123",
      user: "admin"
    });
  }

  // 2. Seed Categories (Idempotent)
  const categoriesSnap = await get(ref(db, "categories"));
  const existingCats = categoriesSnap.exists() ? Object.values(categoriesSnap.val() as Record<string, Category>) : [];
  
  const demoCategories: Omit<Category, "id">[] = [
    { name: "العاب اكشن", nameEn: "Action Games", image: "https://images.unsplash.com/photo-1542751371-adc38448a05e?w=400", hidden: false },
    { name: "العاب رياضة", nameEn: "Sports Games", image: "https://images.unsplash.com/photo-1552667466-07770ae110d0?w=400", hidden: false },
  ];

  for (const cat of demoCategories) {
    if (!existingCats.some(c => c.name === cat.name)) {
      console.log(`Seeding category: ${cat.name}`);
      await push(ref(db, "categories"), { ...cat, createdAt: Date.now() });
    }
  }

  // 3. Seed Products (Idempotent)
  const productsSnap = await get(ref(db, "products"));
  const existingProds = productsSnap.exists() ? Object.values(productsSnap.val() as Record<string, Product>) : [];

  const demoProducts: Omit<Product, "id">[] = [
    { 
      name: "فيفا 25", 
      nameEn: "FIFA 25", 
      price: 60, 
      oldPrice: 70, 
      image: "https://images.unsplash.com/photo-1614627751653-43ef4cf71d11?w=400",
      platform: "PS5",
      description: "أحدث إصدار من لعبة كرة القدم الشهيرة",
      hidden: false,
      soldCount: 0,
      createdAt: Date.now()
    },
    { 
      name: "كول اوف ديوتي", 
      nameEn: "Call of Duty", 
      price: 70, 
      image: "https://images.unsplash.com/photo-1552820728-8b83bb6b773f?w=400",
      platform: "Xbox",
      description: "لعبة القنص والحروب الشهيرة",
      hidden: false,
      soldCount: 0,
      createdAt: Date.now()
    }
  ];

  for (const prod of demoProducts) {
    if (!existingProds.some(p => p.name === prod.name)) {
      console.log(`Seeding product: ${prod.name}`);
      await push(ref(db, "products"), { ...prod, createdAt: Date.now() });
    }
  }
  
  return true;
}
