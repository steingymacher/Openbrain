import { Product } from '../types';
import { db } from '../firebase';
import { doc, getDoc, setDoc, serverTimestamp, collection, getDocs, query, limit, deleteDoc, writeBatch } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../lib/firestore-errors';

export async function fetchProductByBarcode(barcode: string): Promise<Product | null> {
  console.log(`Fetching product for barcode: ${barcode}`);
  
  // Try to get full product from Firestore first
  try {
    const productDoc = await getDoc(doc(db, 'products', barcode));
    if (productDoc.exists()) {
      console.log(`Found full product in database for ${barcode}`);
      return productDoc.data() as Product;
    }
  } catch (err) {
    console.warn('Error fetching product from database:', err);
  }

  // Fallback for demo/testing
  if (barcode === '12345678') {
    return {
      id: '12345678',
      name: 'Demo Apfel',
      brand: 'Bio-Hof',
      image: 'https://picsum.photos/seed/apple/400/400',
      price: 0.99,
      co2: 0.2,
      kcal: 52,
      proteins: 0.3,
      carbs: 14,
      fat: 0.2,
      sugar: 10,
      ingredients: ['Apfel'],
      allergens: [],
      category: 'Obst & Gemüse',
      stock: 15,
    };
  }

  const maxRetries = 2;
  let lastError: any = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 45000); // 45s timeout to allow server retries

      const apiUrl = `${window.location.origin}/api/product/${barcode}`;
      console.log(`Calling API (Attempt ${attempt + 1}): ${apiUrl}`);
      
      const response = await fetch(apiUrl, {
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      
      const contentType = response.headers.get("content-type");
      if (!response.ok) {
        let errorMsg = `Proxy error: ${response.status}`;
        if (contentType && contentType.includes("application/json")) {
          const errorData = await response.json().catch(() => ({}));
          errorMsg = errorData.details || errorMsg;
        } else {
          // If it's HTML, don't try to parse it as JSON
          await response.text().catch(() => "");
        }
        throw new Error(errorMsg);
      }

      if (!contentType || !contentType.includes("application/json")) {
        throw new Error("Received non-JSON response from server");
      }

      const data = await response.json();
      console.log('API Response status:', data.status);

      if (data.status !== 1 || !data.product) {
        console.warn('Product not found in OpenFoodFacts, falling out of API loop to use fallback');
        break; // Exit loop to reach fallback mock at the end
      }

      const p = data.product;
      
      // Try to get price from Firestore first
      let finalPrice: number | null = null;
      try {
        const priceDoc = await getDoc(doc(db, 'product_prices', barcode));
        if (priceDoc.exists()) {
          finalPrice = priceDoc.data().price;
          console.log(`Found price in database for ${barcode}: ${finalPrice}€`);
        }
      } catch (err) {
        console.warn('Error fetching price from database:', err);
      }

      // Helper to estimate price based on categories and quantity
      const estimatePrice = (product: any): number => {
        const categories = (product.categories || '').toLowerCase();
        const productName = (product.product_name || '').toLowerCase();
        const quantityStr = (product.quantity || '100g').toLowerCase();
        
        // Base ranges
        let min = 0.79;
        let max = 2.49;

        // Category-based adjustments
        if (categories.includes('meat') || categories.includes('fleisch') || productName.includes('steak') || productName.includes('hähnchen')) {
          min = 4.99; max = 14.99;
        } else if (categories.includes('fish') || categories.includes('fisch') || productName.includes('lachs')) {
          min = 3.99; max = 12.99;
        } else if (categories.includes('cheese') || categories.includes('käse')) {
          min = 1.99; max = 5.99;
        } else if (categories.includes('wine') || categories.includes('wein') || categories.includes('spirits')) {
          min = 3.99; max = 19.99;
        } else if (categories.includes('coffee') || categories.includes('kaffee')) {
          min = 3.49; max = 8.99;
        } else if (categories.includes('chocolate') || categories.includes('schokolade') || categories.includes('sweets')) {
          min = 0.89; max = 3.49;
        } else if (categories.includes('beverages') || categories.includes('drinks') || categories.includes('saft')) {
          min = 0.99; max = 2.99;
        } else if (categories.includes('water') || categories.includes('wasser')) {
          min = 0.19; max = 1.29;
        } else if (categories.includes('fruit') || categories.includes('vegetable') || categories.includes('obst') || categories.includes('gemüse')) {
          min = 0.99; max = 4.99;
        } else if (categories.includes('frozen') || categories.includes('tiefkühl')) {
          min = 2.49; max = 6.99;
        } else if (categories.includes('oil') || categories.includes('öl')) {
          min = 1.49; max = 9.99;
        }

        // Quantity-based multiplier (very rough estimation)
        let multiplier = 1.0;
        if (quantityStr.includes('kg')) {
          const val = parseFloat(quantityStr) || 1;
          multiplier = val;
        } else if (quantityStr.includes('g')) {
          const val = parseFloat(quantityStr) || 100;
          multiplier = val / 250; // Normalize to 250g
        } else if (quantityStr.includes('l')) {
          const val = parseFloat(quantityStr) || 1;
          multiplier = val;
        } else if (quantityStr.includes('ml')) {
          const val = parseFloat(quantityStr) || 500;
          multiplier = val / 500; // Normalize to 500ml
        }

        const basePrice = Math.random() * (max - min) + min;
        return Math.max(0.29, parseFloat((basePrice * multiplier).toFixed(2)));
      };

      if (finalPrice === null) {
        finalPrice = estimatePrice(p);
      }

      const mockCo2 = (Math.random() * 2 + 0.1).toFixed(2);
      const productData: Product = {
        id: barcode,
        name: p.product_name || 'Unbekanntes Produkt',
        brand: p.brands || 'Unbekannte Marke',
        image: p.image_url || `https://loremflickr.com/400/400/${encodeURIComponent(p.product_name || 'grocery,food')}`,
        price: finalPrice,
        category: p.categories_tags?.[0]?.replace('en:', '') || 'Sonstiges',
        co2: parseFloat(mockCo2),
        kcal: p.nutriments?.['energy-kcal_100g'] || 0,
        proteins: p.nutriments?.proteins_100g || 0,
        carbs: p.nutriments?.carbohydrates_100g || 0,
        fat: p.nutriments?.fat_100g || 0,
        sugar: p.nutriments?.sugars_100g || 0,
        ingredients: p.ingredients_text ? p.ingredients_text.split(',').map((i: string) => i.trim()) : [],
        allergens: p.allergens_tags ? p.allergens_tags.map((a: string) => a.replace('en:', '')) : [],
        description: p.generic_name_de || p.generic_name || p.product_name || 'Hochwertiges Produkt aus unserem Sortiment.',
        stock: Math.floor(Math.random() * 50),
      };

      // Save the product to the products collection for future use and display in deliveries
      try {
        await setDoc(doc(db, 'products', barcode), {
          ...productData,
          updatedAt: serverTimestamp()
        });
        console.log(`Automatically added new product to library: ${productData.name} (${barcode})`);
        
        // Also save price to price history/lookup table
        await setDoc(doc(db, 'product_prices', barcode), {
          price: finalPrice,
          barcode: barcode,
          productName: productData.name,
          updatedAt: serverTimestamp()
        });
      } catch (err) {
        console.warn('Error auto-saving new product to database:', err);
      }

      return productData;
    } catch (error: any) {
      lastError = error;
      console.warn(`Attempt ${attempt + 1} failed:`, error.message);
      if (attempt < maxRetries) {
        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, 1500 * (attempt + 1)));
      }
    }
  }

  console.error('All fetch attempts failed, using fallback mock:', lastError);
  
  // Fallback mock so the user isn't stuck
  return {
    id: barcode,
    name: `Produkt ${barcode.slice(-4)} (Offline-Modus)`,
    brand: 'Unbekannte Marke',
    image: `https://loremflickr.com/400/400/${encodeURIComponent(barcode)}`,
    price: 1.99,
    co2: 0.8,
    kcal: 150,
    proteins: 5,
    carbs: 20,
    fat: 5,
    sugar: 8,
    ingredients: ['Daten konnten nicht geladen werden'],
    allergens: [],
    category: 'Sonstiges',
    description: 'Informationen zu diesem Produkt werden bald aktualisiert.',
    stock: 0,
  };
}

export function checkProfileMatch(product: Product, profile: any): { matches: boolean; reason?: string } {
  const ingredients = product.ingredients || [];
  const allergens = product.allergens || [];

  if (profile.lactoseIntolerance && (allergens.includes('milk') || ingredients.some(i => i.toLowerCase().includes('lactose') || i.toLowerCase().includes('milk')))) {
    return { matches: false, reason: 'Dieses Produkt enthält Laktose.' };
  }
  if (profile.glutenIntolerance && (allergens.includes('gluten') || ingredients.some(i => i.toLowerCase().includes('wheat') || i.toLowerCase().includes('gluten')))) {
    return { matches: false, reason: 'Dieses Produkt enthält Gluten.' };
  }
  if (profile.nutAllergy && (allergens.includes('nuts') || allergens.includes('peanuts'))) {
    return { matches: false, reason: 'Dieses Produkt enthält Nüsse.' };
  }
  if (profile.vegan && (allergens.includes('milk') || allergens.includes('eggs') || ingredients.some(i => i.toLowerCase().includes('meat') || i.toLowerCase().includes('beef') || i.toLowerCase().includes('pork')))) {
    return { matches: false, reason: 'Dieses Produkt ist nicht vegan.' };
  }
  if (profile.vegetarian && ingredients.some(i => i.toLowerCase().includes('meat') || i.toLowerCase().includes('beef') || i.toLowerCase().includes('pork'))) {
    return { matches: false, reason: 'Dieses Produkt ist nicht vegetarisch.' };
  }
  if (profile.lowCalorie && product.kcal > 250) {
    return { matches: false, reason: 'Dieses Produkt hat viele Kalorien (>250 kcal/100g).' };
  }
  if (profile.highProtein && product.proteins < 10) {
    return { matches: false, reason: 'Dieses Produkt hat wenig Protein (<10g/100g).' };
  }
  if (profile.co2Conscious && product.co2 > 1.5) {
    return { matches: false, reason: 'Dieses Produkt hat einen hohen CO₂-Fußabdruck (>1.5kg).' };
  }

  return { matches: true };
}

export async function fetchAvailableProducts(): Promise<Product[]> {
  try {
    const productsSnapshot = await getDocs(collection(db, 'products'));
    
    if (productsSnapshot.empty) {
      console.log('Database empty.');
      return [];
    }
    
    return productsSnapshot.docs.map(doc => doc.data() as Product);
  } catch (err) {
    console.error('Error fetching available products:', err);
    return [];
  }
}

function getInitialProducts(): Product[] {
  const products: Product[] = [];

  const add = (id: string, name: string, brand: string, category: string, price: number, co2: number, kcal: number, proteins: number, carbs: number, fat: number, sugar: number, ingredients: string[] = [], allergens: string[] = [], description?: string, customStock?: number, subCategory?: string) => {
    // Ensure id is Firestore safe (no spaces, special chars except - and _)
    const safeId = id.replace(/[^a-zA-Z0-9_\-]/g, '_');
    const isEAN = /^\d{8,13}$/.test(id);
    let imageUrl = '';

    if (isEAN) {
      imageUrl = `https://www.edeka24.de/out/pictures/generated/product/1/380_340_75/${id}.jpg`;
    } else {
      const searchTerms = `${brand} ${name},product,white-background`.toLowerCase();
      imageUrl = `https://loremflickr.com/400/400/${encodeURIComponent(searchTerms)}`;
    }

    // Auto-generate SEO description if not provided
    const seoDescription = description || `${brand} ${name} - Hochwertige Auswahl aus unserer Kategorie ${category}. Enthält sorgfältig ausgewählte Zutaten wie ${ingredients.length > 0 ? ingredients.join(', ') : 'regionale Rohstoffe'}. Perfekt für Ihren nachhaltigen Einkauf im Food-Connect-Markt.`;

    // Random stock if not provided
    const stock = customStock !== undefined ? customStock : Math.floor(Math.random() * 100);

    products.push({
      id: safeId, name, brand, category, price, co2, kcal, proteins, carbs, fat, sugar,
      image: imageUrl,
      ingredients, allergens,
      description: seoDescription,
      stock,
      subCategory
    });
  };

  // --- OBST & GEMÜSE ---
  // Using real EANs where possible, or consistent internal ones
  add('4000140703504', 'Äpfel Gala', 'Edeka', 'Obst & Gemüse', 2.49, 0.2, 52, 0.3, 14, 0.2, 10, ['Äpfel'], [], undefined, undefined, 'Kernobst');
  add('4000140703511', 'Bananen Bio', 'Edeka Bio', 'Obst & Gemüse', 1.99, 0.1, 89, 1.1, 22.8, 0.3, 12.2, ['Bananen'], [], undefined, undefined, 'Exoten');
  add('4000140703528', 'Orangen', 'Edeka', 'Obst & Gemüse', 2.99, 0.3, 47, 0.9, 12, 0.1, 9, ['Orangen'], [], undefined, undefined, 'Zitrusfrüchte');
  add('4000140703535', 'Mandarinen', 'Saisonware', 'Obst & Gemüse', 2.79, 0.2, 53, 0.8, 13, 0.3, 10, ['Mandarinen'], [], undefined, undefined, 'Zitrusfrüchte');
  add('4000140703542', 'Zitronen', 'Edeka Bio', 'Obst & Gemüse', 1.49, 0.2, 29, 1.1, 9, 0.3, 2.5, ['Zitronen'], [], undefined, undefined, 'Zitrusfrüchte');
  add('4000140703559', 'Limetten', 'Mexiko', 'Obst & Gemüse', 1.99, 0.2, 30, 0.7, 11, 0.2, 1.7, ['Limetten'], [], undefined, undefined, 'Zitrusfrüchte');
  add('4000140703566', 'Trauben Hell', 'Edeka', 'Obst & Gemüse', 3.49, 0.5, 67, 0.7, 17, 0.4, 16, ['Trauben'], [], undefined, undefined, 'Trauben');
  add('4000140703573', 'Erdbeeren', 'Hofladen', 'Obst & Gemüse', 4.99, 0.3, 32, 0.7, 8, 0.3, 4.9, ['Erdbeeren'], [], undefined, undefined, 'Beeren');
  add('4000140703580', 'Himbeeren', 'Frisch', 'Obst & Gemüse', 3.99, 0.3, 52, 1.2, 12, 0.7, 4.4, ['Himbeeren'], [], undefined, undefined, 'Beeren');
  add('4000140703597', 'Kirschen', 'Saisonware', 'Obst & Gemüse', 5.99, 0.2, 50, 1.0, 12, 0.3, 8, ['Kirschen'], [], undefined, undefined, 'Steinobst');
  add('4000140703603', 'Pfirsiche', 'Spanien', 'Obst & Gemüse', 3.49, 0.2, 39, 0.9, 10, 0.3, 8, ['Pfirsiche'], [], undefined, undefined, 'Steinobst');
  add('4000140703610', 'Birnen Abate', 'Italien', 'Obst & Gemüse', 2.99, 0.1, 57, 0.4, 15, 0.1, 10, ['Birnen'], [], undefined, undefined, 'Kernobst');
  add('4000140703627', 'Ananas Extra Sweet', 'Costa Rica', 'Obst & Gemüse', 3.99, 0.6, 50, 0.5, 13, 0.1, 10, ['Ananas'], [], undefined, undefined, 'Exoten');
  add('4000140703634', 'Mango Ready-to-eat', 'Brasilien', 'Obst & Gemüse', 2.49, 0.8, 60, 0.8, 15, 0.4, 14, ['Mango'], [], undefined, undefined, 'Exoten');
  add('4000140703641', 'Wassermelone', 'Spanien', 'Obst & Gemüse', 5.99, 0.3, 30, 0.6, 8, 0.2, 6, ['Wassermelone'], [], undefined, undefined, 'Melonen');
  add('4000140703702', 'Speisekartoffeln', 'Edeka', 'Obst & Gemüse', 2.99, 0.2, 77, 2, 17, 0.1, 0.8, ['Kartoffeln'], [], undefined, undefined, 'Kartoffeln');
  add('4000140703719', 'Süßkartoffeln', 'USA', 'Obst & Gemüse', 2.49, 0.4, 86, 1.6, 20, 0.1, 4.2, ['Süßkartoffeln'], [], undefined, undefined, 'Kartoffeln');
  add('4000140703726', 'Tomaten Rispe', 'Edeka', 'Obst & Gemüse', 2.49, 0.4, 18, 0.9, 3.9, 0.2, 2.6, ['Tomaten'], [], undefined, undefined, 'Tomaten');
  add('4000140703733', 'Cherrytomaten', 'Bio-Hof', 'Obst & Gemüse', 1.99, 0.2, 18, 0.9, 3.9, 0.2, 2.6, ['Tomaten'], [], undefined, undefined, 'Tomaten');
  add('4000140703740', 'Gurken', 'Edeka Bio', 'Obst & Gemüse', 0.99, 0.1, 15, 0.6, 3.6, 0.1, 1.7, ['Gurke'], [], undefined, undefined, 'Gurken');
  add('4000140703757', 'Paprika Mix', 'Edeka', 'Obst & Gemüse', 2.29, 0.6, 31, 1.0, 6, 0.3, 4.2, ['Paprika'], [], undefined, undefined, 'Paprika');
  add('4000140703764', 'Zucchini', 'Edeka', 'Obst & Gemüse', 0.79, 0.2, 17, 1.2, 3, 0.3, 2.5, ['Zucchini'], [], undefined, undefined, 'Zucchini');
  add('4000140703771', 'Auberginen', 'Spanien', 'Obst & Gemüse', 1.79, 0.2, 25, 1.0, 6, 0.2, 3.5, ['Auberginen'], [], undefined, undefined, 'Auberginen');
  add('4000140703788', 'Bio Karotten', 'Edeka Bio', 'Obst & Gemüse', 1.29, 0.15, 41, 0.9, 10, 0.2, 4.7, ['Karotten'], [], undefined, undefined, 'Karotten');
  add('4000140703795', 'Zwiebeln Gelb', 'Edeka', 'Obst & Gemüse', 1.49, 0.15, 40, 1.1, 9, 0.1, 4.2, ['Zwiebeln'], [], undefined, undefined, 'Zwiebeln');
  add('4000140703801', 'Knoblauch', 'Edeka Bio', 'Obst & Gemüse', 0.99, 0.2, 149, 6.4, 33, 0.5, 1, ['Knoblauch'], [], undefined, undefined, 'Knoblauch');
  add('4000140703856', 'Brokkoli', 'Edeka', 'Obst & Gemüse', 1.49, 0.3, 34, 2.8, 7, 0.4, 1.7, ['Brokkoli'], [], undefined, undefined, 'Kohlgemüse');
  add('4000140703887', 'Champignons Weiß', 'Edeka', 'Obst & Gemüse', 1.79, 0.4, 22, 3.1, 3.3, 0.3, 1.7, ['Champignons'], [], undefined, undefined, 'Pilze');
  add('4000140703894', 'Maiskolben (2er)', 'Regional', 'Obst & Gemüse', 2.49, 0.4, 86, 3.3, 19, 1.2, 6, ['Mais'], [], undefined, undefined, 'Süßmais');
  add('4000140703900', 'Trauben Dunkel', 'Italien', 'Obst & Gemüse', 3.49, 0.5, 70, 0.7, 18, 0.3, 16, ['Trauben'], [], undefined, undefined, 'Trauben');
  add('4000140703917', 'Blaubeeren Bio', 'Kulturbeeren', 'Obst & Gemüse', 2.99, 0.4, 57, 0.7, 14, 0.3, 10, ['Blaubeeren'], [], undefined, undefined, 'Beeren');

  add('4000140704013', 'Bio Brokkoli', 'Naturland', 'Obst & Gemüse', 1.99, 0.2, 34, 2.8, 7, 0.4, 1.7, ['Brokkoli'], [], undefined, undefined, 'Kohlgemüse');
  add('4000140704020', 'Bio Blumenkohl', 'Naturland', 'Obst & Gemüse', 2.99, 0.2, 25, 1.9, 5, 0.3, 1.9, ['Blumenkohl'], [], undefined, undefined, 'Kohlgemüse');
  add('4000140704037', 'Bio Spinat', 'Naturland', 'Obst & Gemüse', 2.49, 0.2, 23, 2.9, 3.6, 0.4, 0.4, ['Spinat'], [], undefined, undefined, 'Blattgemüse');
  add('4000140704044', 'Bio Rucola', 'Naturland', 'Obst & Gemüse', 1.79, 0.2, 25, 2.6, 3.7, 0.7, 2, ['Rucola'], [], undefined, undefined, 'Salat');
  add('4000140704051', 'Bio Salat Mix', 'Naturland', 'Obst & Gemüse', 2.29, 0.2, 14, 0.9, 3, 0.1, 2, ['Salat'], [], undefined, undefined, 'Salat');
  add('4000140704068', 'Bio Lauch', 'Naturland', 'Obst & Gemüse', 1.29, 0.1, 61, 1.5, 14, 0.3, 3.9, ['Lauch'], [], undefined, undefined, 'Lauchgemüse');
  add('4000140704075', 'Bio Knoblauch', 'Naturland', 'Obst & Gemüse', 1.49, 0.1, 149, 6.4, 33, 0.5, 1, ['Knoblauch'], [], undefined, undefined, 'Lauchgemüse');
  add('4000140704082', 'Bio Zwiebeln', 'Naturland', 'Obst & Gemüse', 1.99, 0.1, 40, 1.1, 9, 0.1, 4.2, ['Zwiebeln'], [], undefined, undefined, 'Zwiebeln');
  add('4000140704099', 'Bio Karotten', 'Naturland', 'Obst & Gemüse', 1.49, 0.1, 41, 0.9, 10, 0.2, 4.7, ['Karotten'], [], undefined, undefined, 'Karotten');
  add('4000140704403', 'Rucola Frisch', 'Regional', 'Obst & Gemüse', 1.49, 0.2, 25, 2.6, 3.7, 0.7, 2, ['Rucola'], [], undefined, undefined, 'Salat');
  add('4000140704404', 'Blattspinat', 'Regional', 'Obst & Gemüse', 1.99, 0.2, 23, 2.9, 3.6, 0.4, 0.4, ['Spinat'], [], undefined, undefined, 'Blattgemüse');
  add('4000140704405', 'Honigmelone', 'Spanien', 'Obst & Gemüse', 3.49, 0.4, 34, 0.8, 8, 0.2, 7, ['Honigmelone'], [], undefined, undefined, 'Melonen');
  add('4000140704406', 'Kopfsalat', 'Regional', 'Obst & Gemüse', 1.29, 0.1, 14, 0.9, 3, 0.1, 2, ['Salat'], [], undefined, undefined, 'Salat');
  add('4000140704407', 'Blumenkohl', 'Regional', 'Obst & Gemüse', 2.49, 0.2, 25, 1.9, 5, 0.3, 1.9, ['Blumenkohl'], [], undefined, undefined, 'Kohlgemüse');
  add('4000140704105', 'Bio Auberginen', 'Naturland', 'Obst & Gemüse', 1.79, 0.2, 25, 1.0, 6, 0.2, 3.5, ['Auberginen'], [], undefined, undefined, 'Fruchtgemüse');
  add('4000140704112', 'Bio Zucchini', 'Naturland', 'Obst & Gemüse', 1.29, 0.1, 17, 1.2, 3, 0.3, 2.5, ['Zucchini'], [], undefined, undefined, 'Fruchtgemüse');
  add('4000140704113', 'Lauch Frisch', 'Regional', 'Obst & Gemüse', 0.89, 0.1, 31, 1.5, 3.3, 0.3, 2.1, ['Lauch'], [], undefined, undefined, 'Lauchgemüse');
  add('4000140704129', 'Bio Paprika', 'Naturland', 'Obst & Gemüse', 2.99, 0.3, 31, 1.0, 6, 0.3, 4.2, ['Paprika'], [], undefined, undefined, 'Paprika');
  add('4000140704136', 'Bio Gurken', 'Naturland', 'Obst & Gemüse', 1.49, 0.1, 15, 0.6, 3.6, 0.1, 1.7, ['Gurke'], [], undefined, undefined, 'Gurken');
  add('4000140704143', 'Bio Tomaten', 'Naturland', 'Obst & Gemüse', 3.49, 0.2, 18, 0.9, 3.9, 0.2, 2.6, ['Tomaten'], [], undefined, undefined, 'Tomaten');
  add('4000140704150', 'Bio Süßkartoffeln', 'Naturland', 'Obst & Gemüse', 2.49, 0.4, 86, 1.6, 20, 0.1, 4.2, ['Süßkartoffeln'], [], undefined, undefined, 'Kartoffeln');
  add('4000140704167', 'Bio Kartoffeln', 'Naturland', 'Obst & Gemüse', 3.99, 0.1, 77, 2, 17, 0.1, 0.8, ['Kartoffeln'], [], undefined, undefined, 'Kartoffeln');
  add('4000140704174', 'Bio Mais', 'Naturland', 'Obst & Gemüse', 2.99, 0.2, 86, 3.3, 19, 1.2, 6, ['Mais'], [], undefined, undefined, 'Süßmais');
  add('4000140704181', 'Bio Champignons', 'Naturland', 'Obst & Gemüse', 2.29, 0.2, 22, 3.1, 3.3, 0.3, 1.7, ['Champignons'], [], undefined, undefined, 'Pilze');
  add('4000140704198', 'Bio Grünkohl', 'Naturland', 'Obst & Gemüse', 2.49, 0.1, 49, 4.3, 9, 0.9, 2.3, ['Grünkohl'], [], undefined, undefined, 'Kohlgemüse');
  add('4000140704204', 'Bio Granatapfel', 'Naturland', 'Obst & Gemüse', 1.99, 0.4, 83, 1.7, 19, 1.2, 14, ['Granatapfel'], [], undefined, undefined, 'Exoten');
  add('4000140704211', 'Bio Kiwi', 'Naturland', 'Obst & Gemüse', 1.29, 0.4, 61, 1.1, 15, 0.5, 9, ['Kiwi'], [], undefined, undefined, 'Exoten');
  add('4000140704228', 'Bio Mango', 'Naturland', 'Obst & Gemüse', 2.49, 0.8, 60, 0.8, 15, 0.4, 14, ['Mango'], [], undefined, undefined, 'Exoten');
  add('4000140704235', 'Bio Ananas', 'Naturland', 'Obst & Gemüse', 3.99, 0.6, 50, 0.5, 13, 0.1, 10, ['Ananas'], [], undefined, undefined, 'Exoten');
  add('4000140704242', 'Bio Birnen', 'Naturland', 'Obst & Gemüse', 2.99, 0.1, 57, 0.4, 15, 0.1, 10, ['Birnen'], [], undefined, undefined, 'Kernobst');
  add('4000140704259', 'Bio Nektarinen', 'Naturland', 'Obst & Gemüse', 3.49, 0.2, 44, 1.1, 11, 0.3, 8, ['Nektarinen'], [], undefined, undefined, 'Steinobst');
  add('4000140704266', 'Bio Pfirsiche', 'Naturland', 'Obst & Gemüse', 3.49, 0.2, 39, 0.9, 10, 0.3, 8, ['Pfirsiche'], [], undefined, undefined, 'Steinobst');
  add('4000140704273', 'Bio Kirschen', 'Naturland', 'Obst & Gemüse', 5.99, 0.2, 50, 1.0, 12, 0.3, 8, ['Kirschen'], [], undefined, undefined, 'Steinobst');
  add('4000140704280', 'Bio Blaubeeren', 'Naturland', 'Obst & Gemüse', 3.49, 0.2, 57, 0.7, 14, 0.3, 10, ['Blaubeeren'], [], undefined, undefined, 'Beeren');
  add('4000140704297', 'Bio Himbeeren', 'Naturland', 'Obst & Gemüse', 3.99, 0.3, 52, 1.2, 12, 0.7, 4.4, ['Himbeeren'], [], undefined, undefined, 'Beeren');
  add('4000140704303', 'Bio Erdbeeren', 'Naturland', 'Obst & Gemüse', 4.99, 0.3, 32, 0.7, 8, 0.3, 4.9, ['Erdbeeren'], [], undefined, undefined, 'Beeren');
  add('4000140704310', 'Bio Trauben', 'Naturland', 'Obst & Gemüse', 4.49, 0.3, 67, 0.7, 17, 0.4, 16, ['Trauben'], [], undefined, undefined, 'Trauben');
  add('4000140704327', 'Bio Limetten', 'Naturland', 'Obst & Gemüse', 2.49, 0.2, 30, 0.7, 11, 0.2, 1.7, ['Limetten'], [], undefined, undefined, 'Zitrusfrüchte');
  add('4000140704334', 'Bio Zitronen', 'Naturland', 'Obst & Gemüse', 1.99, 0.1, 29, 1.1, 9, 0.3, 2.5, ['Zitronen'], [], undefined, undefined, 'Zitrusfrüchte');
  add('4000140704341', 'Bio Mandarinen', 'Naturland', 'Obst & Gemüse', 2.99, 0.2, 53, 0.8, 13, 0.3, 10, ['Mandarinen'], [], undefined, undefined, 'Zitrusfrüchte');
  add('4000140704358', 'Bio Orangen', 'Naturland', 'Obst & Gemüse', 3.49, 0.2, 47, 0.9, 12, 0.1, 9, ['Orangen'], [], undefined, undefined, 'Zitrusfrüchte');
  add('4000140704365', 'Bio Bananen', 'Naturland', 'Obst & Gemüse', 2.49, 0.1, 89, 1.1, 22.8, 0.3, 12.2, ['Bananen'], [], undefined, undefined, 'Exoten');
  add('4000140704372', 'Bio Äpfel', 'Naturland', 'Obst & Gemüse', 2.99, 0.1, 52, 0.3, 14, 0.2, 10, ['Äpfel'], [], undefined, undefined, 'Kernobst');
  add('4000140704389', 'Radieschen', 'Regional', 'Obst & Gemüse', 0.99, 0.1, 16, 0.7, 3.4, 0.1, 1.9, ['Radieschen'], [], undefined, undefined, 'Wurzelgemüse');
  add('4000140704396', 'Kohlrabi', 'Regional', 'Obst & Gemüse', 0.89, 0.1, 27, 1.7, 6.2, 0.1, 2.6, ['Kohlrabi'], [], undefined, undefined, 'Kohlgemüse');
  add('4000140704402', 'Fenchel', 'Regional', 'Obst & Gemüse', 1.49, 0.2, 31, 1.2, 7, 0.2, 3.9, ['Fenchel'], [], undefined, undefined, 'Knollengemüse');
  add('4000140704419', 'Sellerie', 'Regional', 'Obst & Gemüse', 1.29, 0.2, 16, 0.7, 3, 0.2, 1.8, ['Sellerie'], [], undefined, undefined, 'Knollengemüse');
  add('4000140704426', 'Lauchzwiebeln', 'Regional', 'Obst & Gemüse', 0.79, 0.1, 32, 1.8, 7, 0.2, 2.3, ['Lauchzwiebeln'], [], undefined, undefined, 'Lauchgemüse');
  add('4000140704433', 'Spargel Weiß', 'Regional', 'Obst & Gemüse', 8.99, 0.3, 20, 2.2, 3.7, 0.1, 1.9, ['Spargel'], [], undefined, undefined, 'Stielgemüse');
  add('4000140704440', 'Spargel Grün', 'Regional', 'Obst & Gemüse', 7.99, 0.3, 20, 2.2, 3.7, 0.1, 1.9, ['Spargel'], [], undefined, undefined, 'Stielgemüse');
  add('4000140704457', 'Avocado Hass', 'Peru', 'Obst & Gemüse', 1.49, 1.2, 160, 2, 9, 15, 0.7, ['Avocado'], [], undefined, undefined, 'Exoten');
  add('4000140704464', 'Grapefruit', 'Spanien', 'Obst & Gemüse', 0.99, 0.4, 42, 0.8, 11, 0.1, 7, ['Grapefruit'], [], undefined, undefined, 'Zitrusfrüchte');
  add('4000140704471', 'Physalis', 'Kolumbien', 'Obst & Gemüse', 1.99, 0.8, 53, 1.9, 11, 0.7, 11, ['Physalis'], [], undefined, undefined, 'Exoten');
  add('4000140704488', 'Passionsfrucht', 'Brasilien', 'Obst & Gemüse', 0.99, 1.0, 97, 2.2, 23, 0.7, 11, ['Passionsfrucht'], [], undefined, undefined, 'Exoten');

  // --- BÄCKEREI ---
  add('4002727351025', 'Vollkornbrot', 'Harry', 'Bäckerei', 1.89, 0.25, 220, 8, 40, 2, 3, ['Roggenvollkornmehl', 'Wasser', 'Salz', 'Hefe'], ['wheat', 'rye'], undefined, undefined, 'Brot');
  add('4000140704495', 'Bio Brötchen (4er)', 'Edeka Bio', 'Bäckerei', 1.49, 0.2, 250, 7, 50, 1.5, 2, ['Weizenmehl', 'Wasser', 'Hefe', 'Salz'], ['wheat'], undefined, undefined, 'Brötchen');
  add('4000140704501', 'Toastbrot Weiß', 'Golden Toast', 'Bäckerei', 1.29, 0.3, 260, 8, 49, 3.5, 4, ['Weizenmehl', 'Zucker', 'Öl'], ['wheat'], undefined, undefined, 'Brot');
  add('4000140704518', 'Baguette Frisch', 'Hausbäcker', 'Bäckerei', 0.99, 0.2, 250, 8, 50, 1, 2, ['Weizenmehl'], ['wheat'], undefined, undefined, 'Brot');
  add('4000140704525', 'Buttercroissant', 'Edeka', 'Bäckerei', 0.89, 0.3, 400, 8, 45, 21, 6, ['Weizenmehl', 'Butter', 'Zucker'], ['wheat', 'milk'], undefined, undefined, 'Gebäck');
  add('4000140704532', 'Laugenstange', 'Edeka', 'Bäckerei', 0.69, 0.2, 280, 9, 55, 2, 1, ['Weizenmehl', 'Lauge'], ['wheat'], undefined, undefined, 'Gebäck');
  add('4000140704549', 'Donut Schoko', 'Edeka', 'Bäckerei', 1.29, 0.4, 420, 5, 48, 22, 20, ['Mehl', 'Zucker', 'Fett'], ['wheat', 'milk'], undefined, undefined, 'Gebäck');
  add('4000140704556', 'Apfelkuchen Stück', 'Hausbäcker', 'Bäckerei', 2.49, 0.4, 280, 4, 45, 12, 25, ['Mehl', 'Äpfel', 'Zucker'], ['wheat', 'eggs'], undefined, undefined, 'Gebäck');
  add('4000140704563', 'Blaubeer Muffins (2er)', 'Edeka', 'Bäckerei', 1.99, 0.4, 380, 5, 52, 18, 28, ['Mehl', 'Zucker', 'Blaubeeren'], ['wheat', 'eggs'], undefined, undefined, 'Gebäck');
  add('4000140704570', 'Kirschplunder', 'Hausbäcker', 'Bäckerei', 1.49, 0.4, 350, 6, 48, 16, 22, ['Mehl', 'Kirschen', 'Zucker'], ['wheat'], undefined, undefined, 'Gebäck');
  add('4000140704655', 'Brezel', 'Edeka', 'Bäckerei', 0.79, 0.2, 260, 8, 52, 2, 1, ['Weizenmehl', 'Lauge', 'Salz'], ['wheat'], undefined, undefined, 'Gebäck');

  // --- MILCHPRODUKTE ---
  add('4000140704679', 'Vollmilch 3,5%', 'Weihenstephan', 'Milchprodukte', 1.49, 0.3, 64, 3.4, 4.8, 3.5, 4.8, ['Kuhmilch'], ['milk'], undefined, undefined, 'Milch');
  add('7350068543976', 'Hafermilch Barista', 'Oatly', 'Milchprodukte', 2.19, 0.1, 59, 1.0, 6.6, 3.0, 4.0, ['Wasser', 'Hafer', 'Rapsöl'], ['oats'], undefined, undefined, 'Milch');
  add('5411188110835', 'Sojamilch Natur', 'Alpro', 'Milchprodukte', 1.99, 0.15, 39, 3.3, 0.2, 1.8, 0, ['Wasser', 'Sojabohnen'], ['soy'], undefined, undefined, 'Milch');
  add('4006040000012', 'Bio Joghurt Natur', 'Andechser', 'Milchprodukte', 0.99, 0.25, 65, 4, 5, 3.8, 5, ['Joghurt'], ['milk'], undefined, undefined, 'Joghurt');
  add('4000230701021', 'Erdbeerjoghurt', 'Landliebe', 'Milchprodukte', 0.79, 0.3, 95, 3.5, 14, 2.5, 13, ['Joghurt', 'Erdbeeren', 'Zucker'], ['milk'], undefined, undefined, 'Joghurt');
  add('4000140210125', 'Speisequark Mager', 'Weihenstephan', 'Milchprodukte', 1.29, 0.3, 68, 12, 4, 0.3, 4, ['Quark'], ['milk'], undefined, undefined, 'Quark');
  add('4000140210126', 'Fruchtjoghurt Kirsch', 'Zottis', 'Milchprodukte', 0.69, 0.4, 98, 3.2, 15, 2.8, 14, ['Joghurt', 'Kirschen'], ['milk'], undefined, undefined, 'Joghurt');
  add('4000140210127', 'Fruchtjoghurt Heidelbeere', 'Zottis', 'Milchprodukte', 0.69, 0.4, 98, 3.2, 15, 2.8, 14, ['Joghurt', 'Heidelbeeren'], ['milk'], undefined, undefined, 'Joghurt');
  add('4000140210128', 'Fruchtjoghurt Pfirsich', 'Zottis', 'Milchprodukte', 0.69, 0.4, 98, 3.2, 15, 2.8, 14, ['Joghurt', 'Pfirsich'], ['milk'], undefined, undefined, 'Joghurt');
  add('5711953031106', 'Skyr Natur', 'Arla', 'Milchprodukte', 1.49, 0.3, 63, 11, 4, 0.2, 4, ['Skyr'], ['milk'], undefined, undefined, 'Joghurt');
  add('4000607451152', 'Gouda Scheiben', 'Milram', 'Milchprodukte', 2.49, 0.6, 350, 25, 0.1, 28, 0.1, ['Milch', 'Salz'], ['milk'], undefined, undefined, 'Käse');
  add('7622300000614', 'Frischkäse Natur', 'Philadelphia', 'Milchprodukte', 1.99, 0.4, 225, 5.4, 4.3, 21, 4.3, ['Milch', 'Rahm'], ['milk'], undefined, undefined, 'Käse');
  add('4000308000212', 'Bio Butter', 'Berchtesgadener', 'Milchprodukte', 2.59, 0.8, 740, 0.7, 0.7, 82, 0.7, ['Rahm'], ['milk'], undefined, undefined, 'Butter');
  add('4000507010002', 'Margarine', 'Rama', 'Milchprodukte', 1.79, 0.2, 540, 0.1, 0.1, 60, 0.1, ['Pflanzliche Öle'], [], undefined, undefined, 'Butter');
  add('4000140704686', 'Schlagsahne', 'Weihenstephan', 'Milchprodukte', 1.19, 0.4, 290, 2.4, 3.2, 30, 3.2, ['Sahne'], ['milk'], undefined, undefined, 'Sahne');
  add('4000504000105', 'Schokopudding', 'Dany Sahne', 'Milchprodukte', 0.89, 0.4, 120, 3.5, 18, 3.5, 15, ['Milch', 'Zucker', 'Kakao'], ['milk'], undefined, undefined, 'Pudding');
  add('8000430000051', 'Mozzarella', 'Galbani', 'Milchprodukte', 1.29, 0.5, 238, 18, 1, 18, 1, ['Milch', 'Salz', 'Säuerungsmittel'], ['milk'], undefined, undefined, 'Käse');
  add('5201168211103', 'Feta', 'Salakis', 'Milchprodukte', 2.49, 0.6, 280, 17, 0.5, 24, 0.5, ['Schafmilch', 'Ziegenmilch', 'Salz'], ['milk'], undefined, undefined, 'Käse');
  add('4000430000000', 'Körniger Frischkäse', 'Exquisa', 'Milchprodukte', 1.49, 0.3, 92, 13, 3, 3, 3, ['Milch', 'Salz'], ['milk'], undefined, undefined, 'Käse');
  add('3393610000104', 'Ziegenkäse Rolle', 'Chavroux', 'Milchprodukte', 3.49, 0.6, 280, 15, 1, 24, 1, ['Ziegenmilch', 'Salz'], ['milk'], undefined, undefined, 'Käse');
  add('8000430000105', 'Parmesan am Stück', 'Galbani', 'Milchprodukte', 4.99, 0.8, 400, 33, 0, 30, 0, ['Milch', 'Salz', 'Lab'], ['milk'], undefined, undefined, 'Käse');
  add('4000330000000', 'Kondensmilch', 'Bärenmarke', 'Milchprodukte', 1.29, 0.4, 130, 7, 10, 7.5, 10, ['Milch'], ['milk'], undefined, undefined, 'Milch');
  add('4000140704693', 'Kaffeesahne', 'Weihenstephan', 'Milchprodukte', 0.89, 0.4, 120, 3, 4, 10, 4, ['Sahne'], ['milk'], undefined, undefined, 'Sahne');
  add('4000300000000', 'Buttermilch', 'Müller', 'Milchprodukte', 0.79, 0.2, 38, 3.3, 4, 0.5, 4, ['Buttermilch'], ['milk'], undefined, undefined, 'Milch');
  add('4000300000001', 'Kefir', 'Kalinka', 'Milchprodukte', 0.99, 0.2, 45, 3.5, 4, 1.5, 4, ['Kefir'], ['milk'], undefined, undefined, 'Joghurt');
  add('8000430000204', 'Mascarpone', 'Galbani', 'Milchprodukte', 3.49, 0.8, 400, 4, 4, 40, 4, ['Sahne', 'Zitronensäure'], ['milk'], undefined, undefined, 'Käse');
  add('8000430000303', 'Ricotta', 'Galbani', 'Milchprodukte', 2.49, 0.5, 160, 9, 3, 13, 3, ['Molke', 'Milch', 'Salz'], ['milk'], undefined, undefined, 'Käse');
  add('4000607000001', 'Emmentaler Scheiben', 'Milram', 'Milchprodukte', 2.99, 0.7, 380, 28, 0, 30, 0, ['Milch', 'Salz'], ['milk'], undefined, undefined, 'Käse');
  add('4000607000002', 'Tilsiter Scheiben', 'Milram', 'Milchprodukte', 2.49, 0.6, 340, 24, 0, 27, 0, ['Milch', 'Salz'], ['milk'], undefined, undefined, 'Käse');
  add('4000607000003', 'Harzer Käse', 'Milram', 'Milchprodukte', 1.99, 0.3, 120, 27, 0.1, 0.5, 0.1, ['Milch', 'Salz', 'Reifungskulturen'], ['milk'], undefined, undefined, 'Käse');
  add('4000607000004', 'Schafskäse', 'Patros', 'Milchprodukte', 2.99, 0.6, 280, 17, 0.5, 24, 0.5, ['Schafmilch', 'Salz'], ['milk'], undefined, undefined, 'Käse');
  add('4000607000005', 'Kräuterquark', 'Milram', 'Milchprodukte', 1.49, 0.3, 110, 8, 4, 7, 4, ['Quark', 'Kräuter'], ['milk'], undefined, undefined, 'Quark');

  // --- FLEISCH & WURST ---
  add('4000140704709', 'Hähnchenbrustfilet', 'Bio-Geflügel', 'Fleisch & Wurst', 8.99, 3.5, 110, 23, 0, 1.2, 0, ['Hähnchenfleisch'], [], undefined, undefined, 'Geflügel');
  add('4000140704716', 'Rindersteak', 'Weideglück', 'Fleisch & Wurst', 14.99, 12.0, 250, 26, 0, 15, 0, ['Rindfleisch'], [], undefined, undefined, 'Rind');
  add('4000140704723', 'Schweineschnitzel', 'Metzgerfrisch', 'Fleisch & Wurst', 5.99, 4.5, 105, 21, 0, 2.5, 0, ['Schweinefleisch'], [], undefined, undefined, 'Schwein');
  add('4000140704730', 'Rinderhackfleisch', 'Bio-Hof', 'Fleisch & Wurst', 6.49, 10.5, 250, 20, 0, 19, 0, ['Rindfleisch'], [], undefined, undefined, 'Rind');
  add('4000140704747', 'Bio Salami', 'Metzgerfrisch', 'Fleisch & Wurst', 3.49, 4.5, 380, 22, 1, 32, 0.5, ['Schweinefleisch', 'Salz', 'Gewürze'], [], undefined, undefined, 'Wurst');
  add('4000140704754', 'Kochschinken', 'Metzgerfrisch', 'Fleisch & Wurst', 2.99, 3.8, 105, 19, 1, 3, 0.5, ['Schweinefleisch', 'Salz'], [], undefined, undefined, 'Wurst');
  add('4000140704761', 'Mortadella', 'Gutfried', 'Fleisch & Wurst', 1.99, 3.5, 260, 12, 1, 23, 0.5, ['Schweinefleisch', 'Speck'], [], undefined, undefined, 'Wurst');
  add('4000140704778', 'Bratwurst (5er)', 'Metzgerfrisch', 'Fleisch & Wurst', 3.99, 4.0, 300, 14, 1, 26, 0.5, ['Schweinefleisch', 'Gewürze'], [], undefined, undefined, 'Wurst');
  add('4000140704785', 'Wiener Würstchen', 'Gutfried', 'Fleisch & Wurst', 2.99, 3.8, 280, 13, 1, 25, 0.5, ['Schweinefleisch', 'Rindfleisch'], [], undefined, undefined, 'Wurst');
  add('4000140704792', 'Lachsfilet Frisch', 'Deutsche See', 'Fleisch & Wurst', 7.99, 2.5, 200, 20, 0, 13, 0, ['Lachs'], ['fish'], undefined, undefined, 'Fisch');
  add('4000140704808', 'Thunfisch Dose', 'Saupiquet', 'Fleisch & Wurst', 2.49, 1.8, 180, 25, 0, 8, 0, ['Thunfisch'], ['fish'], undefined, undefined, 'Fisch');
  add('4000140704815', 'Putenbrustfilet', 'Bio-Geflügel', 'Fleisch & Wurst', 7.49, 3.2, 105, 24, 0, 1, 0, ['Putenfleisch'], [], undefined, undefined, 'Geflügel');
  add('4000140704822', 'Bacon Streifen', 'Metzgerfrisch', 'Fleisch & Wurst', 1.99, 4.0, 350, 15, 0.5, 32, 0.5, ['Schweinefleisch', 'Salz', 'Rauch'], [], undefined, undefined, 'Wurst');
  add('4000140704839', 'Leberwurst Fein', 'Mühle', 'Fleisch & Wurst', 1.79, 3.8, 320, 12, 1, 30, 0.5, ['Schweinefleisch', 'Leber', 'Speck'], [], undefined, undefined, 'Wurst');
  add('4000140704846', 'Putenbrust Aufschnitt', 'Gutfried', 'Fleisch & Wurst', 2.49, 3.2, 105, 21, 1, 2, 0.5, ['Putenfleisch', 'Salz'], [], undefined, undefined, 'Wurst');
  add('4000140704853', 'Rindersalami', 'Metzgerfrisch', 'Fleisch & Wurst', 3.99, 8.5, 350, 24, 1, 28, 0.5, ['Rindfleisch', 'Salz', 'Gewürze'], [], undefined, undefined, 'Wurst');
  add('4000140704860', 'Geflügelwiener', 'Gutfried', 'Fleisch & Wurst', 2.99, 3.2, 220, 14, 1, 18, 0.5, ['Geflügelfleisch', 'Gewürze'], [], undefined, undefined, 'Wurst');
  add('4000140704877', 'Kabeljaufilet', 'Deutsche See', 'Fleisch & Wurst', 9.99, 1.8, 80, 18, 0, 0.5, 0, ['Kabeljau'], ['fish'], undefined, undefined, 'Fisch');
  add('4000140704884', 'Forelle Frisch', 'Regional', 'Fleisch & Wurst', 6.99, 2.0, 120, 20, 0, 4, 0, ['Forelle'], ['fish'], undefined, undefined, 'Fisch');
  add('4000140704891', 'Garnelen TK', 'Costa', 'Fleisch & Wurst', 8.99, 3.5, 90, 20, 0, 1, 0, ['Garnelen'], ['crustaceans'], undefined, undefined, 'Meeresfrüchte');
  add('4000140704907', 'Rinderbraten', 'Weideglück', 'Fleisch & Wurst', 18.99, 15.0, 180, 22, 0, 10, 0, ['Rindfleisch'], [], undefined, undefined, 'Rind');
  add('4000140704914', 'Schweinefilet', 'Metzgerfrisch', 'Fleisch & Wurst', 9.99, 5.0, 110, 22, 0, 2, 0, ['Schweinefleisch'], [], undefined, undefined, 'Schwein');
  add('4000140704921', 'Lammkoteletts', 'Neuseeland', 'Fleisch & Wurst', 14.99, 18.0, 250, 18, 0, 20, 0, ['Lammfleisch'], [], undefined, undefined, 'Lamm');
  add('4000140704938', 'Entenbrust', 'Bio-Geflügel', 'Fleisch & Wurst', 12.99, 6.0, 200, 19, 0, 14, 0, ['Entenfleisch'], [], undefined, undefined, 'Geflügel');
  add('4000140704945', 'Wildschweinbraten', 'Regional', 'Fleisch & Wurst', 16.99, 4.0, 120, 22, 0, 3, 0, ['Wildschweinfleisch'], [], undefined, undefined, 'Wild');
  add('4000140704952', 'Hirschgulasch', 'Regional', 'Fleisch & Wurst', 14.99, 4.0, 110, 22, 0, 2, 0, ['Hirschfleisch'], [], undefined, undefined, 'Wild');
  add('4000140704969', 'Leberkäse Scheiben', 'Metzgerfrisch', 'Fleisch & Wurst', 2.49, 4.5, 280, 12, 1, 25, 0.5, ['Schweinefleisch', 'Rindfleisch', 'Speck'], [], undefined, undefined, 'Wurst');
  add('4000140704976', 'Lachsfilet 2er', 'Iglo', 'Fleisch & Wurst', 6.99, 1.5, 200, 20, 0, 13, 0, ['Lachs'], ['fish'], undefined, undefined, 'Fisch');
  add('4000140704983', 'Thunfisch Dose', 'Saupiquet', 'Tiefkühl & Konserven', 1.99, 1.2, 190, 24, 0, 10, 0, ['Thunfisch', 'Sonnenblumenöl'], ['fish']);

  // --- TIEFKÜHL & KONSERVEN ---
  add('4006044000012', 'Pizza Margherita', 'Dr. Oetker', 'Tiefkühl', 3.49, 1.1, 230, 9, 28, 9, 2.5, ['Weizenmehl', 'Tomaten', 'Käse'], ['wheat', 'milk']);
  add('4000140705003', 'Pommes Frites', 'McCain', 'Tiefkühl', 2.99, 0.8, 150, 2, 25, 5, 0.5, ['Kartoffeln', 'Sonnenblumenöl']);
  add('4000140705010', 'Kroketten', 'Agrarfrost', 'Tiefkühl', 2.49, 0.7, 180, 2.5, 28, 6, 0.5, ['Kartoffeln', 'Paniermehl'], ['wheat']);
  add('4000140705011', 'Gemüsesuppe Dose', 'Erasco', 'Tiefkühl', 2.19, 0.3, 40, 1.2, 7, 0.5, 1.5, ['Wasser', 'Gemüse Mix']);
  add('4000140705012', 'Hühnersuppe', 'Erasco', 'Tiefkühl', 2.49, 0.5, 45, 2.5, 5, 1.5, 1, ['Wasser', 'Hühnerfleisch', 'Nudeln'], ['wheat']);
  add('4000140705027', 'Lasagne Bolognese', 'Frosta', 'Tiefkühl', 4.49, 2.5, 150, 8, 12, 8, 2, ['Nudeln', 'Rindfleisch', 'Tomaten'], ['wheat', 'milk']);
  add('4000140705034', 'Tomatensuppe', 'Erasco', 'Tiefkühl', 1.99, 0.4, 45, 1, 8, 1, 5, ['Tomaten', 'Wasser', 'Zucker']);
  add('4000140705041', 'Ravioli in Tomatensauce', 'Maggi', 'Tiefkühl', 2.29, 0.6, 90, 3, 14, 2, 3, ['Nudeln', 'Schweinefleisch', 'Tomaten'], ['wheat']);
  add('4000140705058', 'Baked Beans', 'Heinz', 'Tiefkühl', 1.49, 0.3, 80, 5, 13, 0.5, 5, ['Weiße Bohnen', 'Tomatensauce']);
  add('4000140705065', 'Mais Dose', 'Bonduelle', 'Tiefkühl', 1.29, 0.3, 80, 3, 15, 1, 5, ['Mais', 'Wasser', 'Salz']);
  add('4000140705072', 'TK Erbsen Bio', 'Eiszeit', 'Tiefkühl', 2.49, 0.3, 80, 5, 12, 0.5, 4, ['Erbsen']);
  add('4000140705089', 'Fischstäbchen (10er)', 'Iglo', 'Tiefkühl', 4.29, 1.8, 200, 13, 18, 8, 0.5, ['Seelachsfilet', 'Paniermehl'], ['fish', 'wheat']);
  add('4000140705096', 'Ketchup', 'Heinz', 'Tiefkühl', 2.99, 0.5, 100, 1, 23, 0.1, 22, ['Tomaten', 'Essig', 'Zucker']);
  add('4000140705102', 'Mayonnaise', 'Hellmanns', 'Tiefkühl', 2.49, 0.6, 680, 1, 3, 75, 3, ['Rapsöl', 'Eigelb', 'Essig'], ['eggs']);
  add('4000140705119', 'Senf Mittelscharf', 'Bautzner', 'Tiefkühl', 0.69, 0.2, 100, 6, 6, 5, 2, ['Wasser', 'Senfsaat', 'Essig'], ['mustard']);
  add('4000140705126', 'Tiefkühlpizza Salami', 'Dr. Oetker', 'Tiefkühl', 3.49, 1.2, 250, 10, 25, 12, 2.5, ['Weizenmehl', 'Tomaten', 'Käse', 'Salami'], ['wheat', 'milk']);
  add('4000140705133', 'Fertiggericht Pasta', 'Frosta', 'Tiefkühl', 4.99, 0.8, 120, 5, 15, 4, 2, ['Nudeln', 'Gemüse']);
  add('4000140705140', 'Ravioli Dose', 'Maggi', 'Tiefkühl', 2.29, 0.6, 90, 3, 14, 2, 3, ['Nudeln', 'Fleisch', 'Tomaten'], ['wheat']);
  add('4000140705157', 'Bohnen Dose', 'Bonduelle', 'Tiefkühl', 1.49, 0.3, 80, 5, 13, 0.5, 1, ['Bohnen']);
  add('4000140705164', 'Tomatensauce Basilico', 'Barilla', 'Tiefkühl', 2.49, 0.4, 60, 1.5, 8, 2, 5, ['Tomaten', 'Basilikum']);

  // --- VORRATSSCHRANK ---
  add('8000300403757', 'Spaghetti No. 5', 'Barilla', 'Vorratsschrank', 1.79, 0.5, 350, 12, 70, 1.5, 3, ['Hartweizengrieß'], ['wheat']);
  add('8000300403849', 'Penne Rigate', 'Barilla', 'Vorratsschrank', 1.79, 0.5, 350, 12, 70, 1.5, 3, ['Hartweizengrieß'], ['wheat']);
  add('4000521000001', 'Basmatireis', 'Ben\'s Original', 'Vorratsschrank', 2.99, 0.8, 350, 8, 77, 1, 0.5, ['Reis']);
  add('4000140705201', 'Weizenmehl Type 405', 'Aurora', 'Vorratsschrank', 0.99, 0.3, 340, 10, 70, 1, 0.5, ['Weizen'], ['wheat']);
  add('4000140705218', 'Zucker Weiß', 'Südzucker', 'Vorratsschrank', 1.49, 0.4, 400, 0, 100, 0, 100, ['Zucker']);
  add('4000140705225', 'Speisesalz Jodiert', 'Bad Reichenhaller', 'Vorratsschrank', 0.89, 0.1, 0, 0, 0, 0, 0, ['Salz']);
  add('4000540000012', 'Haferflocken Kernig', 'Kölln', 'Vorratsschrank', 1.49, 0.2, 370, 13, 59, 7, 1, ['Hafer'], ['oats']);
  add('4000140705232', 'Früchtemüsli', 'Seitenbacher', 'Vorratsschrank', 4.99, 0.4, 350, 10, 60, 6, 15, ['Hafer', 'Früchte', 'Nüsse'], ['oats', 'nuts']);
  add('4000140705249', 'Cornflakes Classic', 'Kellogg\'s', 'Vorratsschrank', 3.49, 0.5, 380, 7, 84, 1, 8, ['Mais', 'Zucker'], ['barley']);
  add('4000140705256', 'Bienenhonig', 'Langnese', 'Vorratsschrank', 5.99, 0.3, 300, 0.5, 80, 0, 80, ['Honig']);
  add('4000140705263', 'Erdbeermarmelade', 'Zentis', 'Vorratsschrank', 2.29, 0.4, 250, 0.5, 60, 0.1, 55, ['Erdbeeren', 'Zucker']);
  add('4008400401620', 'Nutella', 'Ferrero', 'Vorratsschrank', 3.99, 1.2, 539, 6.3, 57.5, 30.9, 56.3, ['Zucker', 'Palmöl', 'Haselnüsse'], ['hazelnuts', 'milk', 'soy']);
  add('4000140705264', 'Nudeln Fusilli', 'Barilla', 'Vorratsschrank', 1.99, 0.6, 359, 13, 71, 2, 3.5, ['Hartweizengrieß'], ['wheat']);
  add('4000140705270', 'Langkornreis', 'Reishunger', 'Vorratsschrank', 2.49, 0.7, 350, 7, 78, 0.5, 0.2, ['Reis']);
  add('4000140705271', 'Basmatireis', 'Reishunger', 'Vorratsschrank', 2.99, 0.8, 355, 8, 77, 1, 0.2, ['Reis']);
  add('4000140705287', 'Brauner Zucker', 'Südzucker', 'Vorratsschrank', 1.99, 0.5, 390, 0, 98, 0, 98, ['Rohrzucker']);
  add('4000140705294', 'Pfeffer Schwarz', 'Ostmann', 'Vorratsschrank', 2.49, 0.2, 250, 10, 64, 3, 0.5, ['Pfeffer']);
  add('4000140705295', 'Curry Pulver', 'Ostmann', 'Vorratsschrank', 1.99, 0.2, 320, 12, 50, 10, 2, ['Curcuma', 'Koriander', 'Bockshornklee']);
  add('4000140705296', 'Zimt Gemahlen', 'Ostmann', 'Vorratsschrank', 1.49, 0.1, 240, 4, 80, 1, 2, ['Zimt']);
  add('4000140705297', 'Basilikum Getrocknet', 'Ostmann', 'Vorratsschrank', 1.79, 0.1, 230, 23, 40, 4, 1, ['Basilikum']);
  add('4000140705300', 'Paprika Edelsüß', 'Fuchs', 'Vorratsschrank', 1.99, 0.2, 280, 14, 54, 13, 10, ['Paprika']);
  add('4000140705317', 'Olivenöl Nativ', 'Bertolli', 'Vorratsschrank', 7.99, 0.6, 820, 0, 0, 91, 0, ['Olivenöl']);
  add('4000140705324', 'Rapsöl', 'Thomy', 'Vorratsschrank', 2.99, 0.3, 820, 0, 0, 91, 0, ['Rapsöl']);
  add('4000140705331', 'Balsamico Essig', 'Mazzetti', 'Vorratsschrank', 3.49, 0.4, 100, 0.5, 20, 0, 18, ['Weinessig', 'Traubenmost']);
  add('4000140705348', 'Couscous', 'Alnatura', 'Vorratsschrank', 1.99, 0.4, 350, 12, 68, 1.5, 1.5, ['Hartweizengrieß'], ['wheat']);
  add('4000140705355', 'Quinoa Bio', 'Alnatura', 'Vorratsschrank', 3.99, 0.5, 370, 14, 60, 6, 1, ['Quinoa']);
  add('4000140705362', 'Linsen Rot', 'Alnatura', 'Vorratsschrank', 2.49, 0.3, 330, 24, 50, 1.5, 1, ['Linsen']);
  add('4000140705379', 'Kichererbsen Getrocknet', 'Alnatura', 'Vorratsschrank', 1.99, 0.3, 340, 19, 50, 6, 2, ['Kichererbsen']);
  add('4000140705386', 'Kokosmilch', 'Bamboo Garden', 'Vorratsschrank', 1.79, 1.2, 180, 1.5, 3, 18, 2.5, ['Kokosnussextrakt', 'Wasser']);
  add('4000140705393', 'Sojasauce', 'Kikkoman', 'Vorratsschrank', 3.99, 0.5, 70, 9, 8, 0, 0.5, ['Wasser', 'Sojabohnen', 'Weizen', 'Salz'], ['soy', 'wheat']);
  add('4000140705409', 'Pesto Genovese', 'Barilla', 'Vorratsschrank', 2.99, 0.6, 500, 5, 6, 50, 3, ['Basilikum', 'Öl', 'Käse', 'Cashewkerne'], ['milk', 'nuts']);
  add('4000140705416', 'Tomatenmark', 'Oro di Parma', 'Vorratsschrank', 1.29, 0.3, 100, 5, 18, 0.5, 15, ['Tomaten']);
  add('4000140705423', 'Brühwürfel Gemüse', 'Maggi', 'Vorratsschrank', 1.49, 0.2, 5, 0.1, 0.5, 0.3, 0.1, ['Salz', 'Fett', 'Gemüseextrakt']);
  add('4000140705430', 'Backpulver (10er)', 'Dr. Oetker', 'Vorratsschrank', 0.99, 0.1, 100, 0, 25, 0, 0, ['Säuerungsmittel', 'Backtriebmittel']);

  // --- SNACKS & SÜSSES ---
  add('4000539102003', 'Vollmilch Schokolade', 'Milka', 'Snacks & Süßes', 1.29, 0.8, 530, 6, 58, 30, 57, ['Zucker', 'Kakaobutter', 'Milch'], ['milk']);
  add('4000512362325', 'Gummibärchen', 'Haribo', 'Snacks & Süßes', 1.19, 0.4, 340, 7, 77, 0.1, 46, ['Zucker', 'Gelatine', 'Fruchtsaft']);
  add('4008233001004', 'Paprika Chips', 'Funny-Frisch', 'Snacks & Süßes', 1.99, 0.7, 530, 6, 49, 33, 2.5, ['Kartoffeln', 'Öl', 'Salz']);
  add('4000623000017', 'Salzstangen', 'Lorenz', 'Snacks & Süßes', 1.49, 0.5, 380, 10, 75, 4, 2, ['Mehl', 'Salz'], ['wheat']);
  add('4000140705508', 'Studentenfutter', 'Seeberger', 'Snacks & Süßes', 3.99, 0.6, 480, 12, 40, 30, 30, ['Nüsse', 'Rosinen'], ['nuts']);
  add('4000140705515', 'Proteinriegel Schoko', 'Powerbar', 'Snacks & Süßes', 1.99, 0.5, 200, 20, 15, 6, 1.5, ['Milcheiweiß', 'Schokolade'], ['milk', 'soy']);
  add('4000140705522', 'Butterkekse', 'Leibniz', 'Snacks & Süßes', 1.49, 0.4, 440, 7, 72, 13, 22, ['Weizenmehl', 'Zucker', 'Butter'], ['wheat', 'milk']);
  add('9000331602011', 'Waffeln mit Schoko', 'Manner', 'Snacks & Süßes', 2.29, 0.6, 485, 5, 65, 22, 45, ['Zucker', 'Weizenmehl', 'Haselnüsse'], ['wheat', 'hazelnuts']);
  add('4000140705539', 'Weiße Schokolade', 'Lindt', 'Snacks & Süßes', 2.49, 1.0, 560, 6, 55, 35, 55, ['Zucker', 'Kakaobutter', 'Milch'], ['milk']);
  add('4000512362332', 'Lakritz Schnecken', 'Haribo', 'Snacks & Süßes', 1.19, 0.3, 320, 3, 75, 0.5, 45, ['Zucker', 'Süßholz']);
  add('4000140705553', 'Tortilla Chips', 'Chio', 'Snacks & Süßes', 1.99, 0.7, 510, 6, 60, 25, 2, ['Mais', 'Öl', 'Salz']);
  add('4000140705560', 'Cracker Classic', 'TUC', 'Snacks & Süßes', 1.49, 0.5, 480, 8, 65, 20, 7, ['Weizenmehl', 'Öl', 'Salz'], ['wheat']);
  add('4000140705577', 'Mandeln Geröstet', 'Seeberger', 'Snacks & Süßes', 3.49, 0.4, 600, 21, 5, 50, 4, ['Mandeln'], ['nuts']);
  add('4000140705584', 'Erdnüsse Gesalzen', 'Ültje', 'Snacks & Süßes', 2.49, 0.5, 610, 25, 12, 50, 5, ['Erdnüsse', 'Salz'], ['peanuts']);
  add('4000140705591', 'Zartbitter Schokolade', 'Lindt', 'Snacks & Süßes', 2.49, 0.7, 550, 7, 35, 40, 30, ['Kakaomasse', 'Zucker', 'Kakaobutter'], ['milk']);
  add('4000140705607', 'Pistazien Gesalzen', 'Seeberger', 'Snacks & Süßes', 4.99, 0.5, 600, 20, 12, 50, 6, ['Pistazien', 'Salz'], ['nuts']);
  add('4000140705614', 'Cashewkerne Natur', 'Seeberger', 'Snacks & Süßes', 3.99, 0.6, 580, 18, 30, 44, 6, ['Cashewkerne'], ['nuts']);
  add('4000140705621', 'Walnusskerne', 'Seeberger', 'Snacks & Süßes', 4.49, 0.4, 680, 15, 10, 65, 4, ['Walnusskerne'], ['nuts']);
  add('4000140705638', 'Zwieback', 'Brandt', 'Snacks & Süßes', 1.99, 0.3, 400, 11, 75, 6, 14, ['Weizenmehl', 'Zucker', 'Eier'], ['wheat', 'eggs']);
  add('4000140705645', 'Knäckebrot', 'Wasa', 'Snacks & Süßes', 1.79, 0.2, 330, 10, 60, 1.5, 1.5, ['Roggenvollkornmehl', 'Salz'], ['rye']);

  // --- GETRÄNKE ---
  add('4000140705706', 'Mineralwasser Sprudel', 'Gerolsteiner', 'Getränke', 0.89, 0.1, 0, 0, 0, 0, 0, ['Wasser']);
  add('5449000000996', 'Cola Classic', 'Coca-Cola', 'Getränke', 1.29, 0.4, 42, 0, 10.6, 0, 10.6, ['Wasser', 'Zucker', 'Kohlensäure']);
  add('5449000000997', 'Cola Zero', 'Coca-Cola', 'Getränke', 1.29, 0.3, 0.3, 0, 0, 0, 0, ['Wasser', 'Süßungsmittel', 'Kohlensäure']);
  add('4000140705713', 'Orangensaft 100%', 'Hohes C', 'Getränke', 2.19, 0.35, 43, 0.7, 9, 0.2, 9, ['Orangensaft']);
  add('4000140705720', 'Kaffee Ganze Bohnen', 'Tchibo', 'Getränke', 5.99, 1.5, 2, 0.1, 0.3, 0.1, 0, ['Kaffee']);
  add('4000140705737', 'Pfefferminztee', 'Meßmer', 'Getränke', 1.99, 0.2, 1, 0.1, 0.2, 0.1, 0.1, ['Pfeerminze']);
  add('9002490100070', 'Energy Drink', 'Red Bull', 'Getränke', 1.49, 0.6, 45, 0, 11, 0, 11, ['Wasser', 'Zucker', 'Koffein', 'Taurin']);
  add('4000140705744', 'Stilles Wasser', 'Vittel', 'Getränke', 0.79, 0.1, 0, 0, 0, 0, 0, ['Wasser']);
  add('4000140705751', 'Apfelsaft Naturtrüb', 'Amecke', 'Getränke', 1.99, 0.3, 45, 0.1, 11, 0.1, 10, ['Apfelsaft']);
  add('4000140705768', 'Multivitaminsaft', 'Punika', 'Getränke', 1.79, 0.4, 48, 0.4, 11, 0.1, 10, ['Mehrfruchtsaft']);
  add('5449000011527', 'Fanta Orange', 'Coca-Cola', 'Getränke', 1.29, 0.4, 38, 0, 9, 0, 9, ['Wasser', 'Zucker', 'Orangensaftkonzentrat']);
  add('5449000012203', 'Sprite', 'Coca-Cola', 'Getränke', 1.29, 0.4, 37, 0, 9, 0, 9, ['Wasser', 'Zucker', 'Zitronensäure']);
  add('4000140705775', 'Eistee Pfirsich', 'Lipton', 'Getränke', 1.49, 0.3, 20, 0, 5, 0, 5, ['Wasser', 'Zucker', 'Tee-Extrakt']);
  add('4000140705782', 'Pils Bier', 'Krombacher', 'Getränke', 0.99, 0.5, 42, 0.5, 3, 0, 0.1, ['Wasser', 'Gerstenmalz', 'Hopfen'], ['barley']);
  add('4000140705799', 'Weißwein Riesling', 'Regional', 'Getränke', 5.99, 0.8, 80, 0.1, 2, 0, 0.5, ['Trauben']);
  add('4000140705805', 'Sekt Trocken', 'Rotkäppchen', 'Getränke', 4.49, 0.9, 85, 0.1, 3, 0, 1, ['Trauben']);
  add('4000140705812', 'Instant Kaffee', 'Nescafé', 'Getränke', 6.99, 0.8, 2, 0.1, 0.3, 0.1, 0, ['Kaffee']);
  add('4000140705829', 'Grüner Tee', 'Meßmer', 'Getränke', 1.99, 0.2, 1, 0.1, 0.2, 0.1, 0.1, ['Grüner Tee']);
  add('4000140705836', 'Schwarzer Tee', 'Teekanne', 'Getränke', 1.99, 0.2, 1, 0.1, 0.2, 0.1, 0.1, ['Schwarzer Tee']);

  // --- DROGERIE & PFLEGE ---
  add('4000140705904', 'Shampoo Repair', 'Pantene', 'Drogerie & Pflege', 3.49, 0.5, 0, 0, 0, 0, 0, ['Wasser', 'Tenside']);
  add('4005808812370', 'Duschgel Fresh', 'Nivea', 'Drogerie & Pflege', 1.99, 0.4, 0, 0, 0, 0, 0, ['Wasser', 'Duftstoffe']);
  add('4000140705911', 'Zahnpasta Total', 'Colgate', 'Drogerie & Pflege', 2.49, 0.3, 0, 0, 0, 0, 0, ['Fluorid', 'Reinigungskörper']);
  add('4000140705928', 'Deo Spray', 'Rexona', 'Drogerie & Pflege', 2.99, 0.6, 0, 0, 0, 0, 0, ['Aluminiumsalze', 'Alkohol']);
  add('4000140705935', 'Toilettenpapier 3-lagig', 'Zewa', 'Drogerie & Pflege', 4.49, 0.8, 0, 0, 0, 0, 0, ['Zellstoff']);
  add('4000140705942', 'Taschentücher', 'Tempo', 'Drogerie & Pflege', 2.29, 0.4, 0, 0, 0, 0, 0, ['Zellstoff']);
  add('4000140705959', 'Flüssigseife', 'Sagrotan', 'Drogerie & Pflege', 2.49, 0.3, 0, 0, 0, 0, 0, ['Wasser', 'Tenside', 'Glycerin']);
  add('4000140705966', 'Zahnbürste Medium', 'Dr. Best', 'Drogerie & Pflege', 1.49, 0.2, 0, 0, 0, 0, 0, ['Kunststoff']);
  add('4000140705973', 'Bodylotion', 'Dove', 'Drogerie & Pflege', 3.99, 0.5, 0, 0, 0, 0, 0, ['Wasser', 'Öle', 'Duftstoffe']);
  add('4000140705980', 'Einwegrasierer (5er)', 'Gillette', 'Drogerie & Pflege', 4.99, 0.6, 0, 0, 0, 0, 0, ['Kunststoff', 'Stahl']);
  add('4000140705997', 'Haarspülung Repair', 'Pantene', 'Drogerie & Pflege', 3.49, 0.5, 0, 0, 0, 0, 0, ['Wasser', 'Tenside']);
  add('4000140705998', 'Stückseife Lavendel', 'Speick', 'Drogerie & Pflege', 0.99, 0.2, 0, 0, 0, 0, 0, ['Pflanzliche Öle', 'Lavendelöl']);
  add('4000140706000', 'Mundspülung Fresh', 'Listerine', 'Drogerie & Pflege', 4.49, 0.4, 0, 0, 0, 0, 0, ['Wasser', 'Alkohol', 'Fluorid']);
  add('4000140706017', 'Rasiergel Sensitiv', 'Gillette', 'Drogerie & Pflege', 3.99, 0.5, 0, 0, 0, 0, 0, ['Wasser', 'Tenside']);
  add('4000140706024', 'Wattepads (100er)', 'Ebelin', 'Drogerie & Pflege', 0.99, 0.3, 0, 0, 0, 0, 0, ['Baumwolle']);

  // --- HAUSHALT ---
  add('4000140706109', 'Waschmittel Flüssig', 'Ariel', 'Haushalt', 8.99, 1.2, 0, 0, 0, 0, 0, ['Tenside', 'Enzyme']);
  add('4015000031021', 'Spülmittel Original', 'Pril', 'Haushalt', 1.99, 0.3, 0, 0, 0, 0, 0, ['Tenside']);
  add('4000140706116', 'Allzweckreiniger', 'Meister Proper', 'Haushalt', 2.49, 0.4, 0, 0, 0, 0, 0, ['Tenside', 'Duftstoffe']);
  add('4000140706123', 'Müllbeutel 35L', 'Swirl', 'Haushalt', 1.99, 0.5, 0, 0, 0, 0, 0, ['Polyethylen']);
  add('4000140706130', 'Küchenrolle', 'Zewa', 'Haushalt', 2.99, 0.6, 0, 0, 0, 0, 0, ['Zellstoff']);
  add('4000140706147', 'Backpapier', 'Toppits', 'Haushalt', 1.79, 0.3, 0, 0, 0, 0, 0, ['Papier', 'Silikon']);
  add('4000140706154', 'Alufolie', 'Toppits', 'Haushalt', 2.49, 2.5, 0, 0, 0, 0, 0, ['Aluminium']);
  add('4000140706161', 'Frischhaltefolie', 'Toppits', 'Haushalt', 1.49, 0.6, 0, 0, 0, 0, 0, ['Polyethylen']);
  add('4000140706178', 'Weichspüler Aprilfrisch', 'Lenor', 'Haushalt', 3.49, 0.7, 0, 0, 0, 0, 0, ['Tenside', 'Duftstoffe']);
  add('4000140706185', 'Glasreiniger', 'Sidolin', 'Haushalt', 2.49, 0.4, 0, 0, 0, 0, 0, ['Wasser', 'Alkohol']);
  add('4000140706192', 'Badreiniger', 'Antikal', 'Haushalt', 3.99, 0.5, 0, 0, 0, 0, 0, ['Säuren', 'Tenside']);
  add('4000140706208', 'Küchenreiniger', 'Cillit Bang', 'Haushalt', 4.49, 0.5, 0, 0, 0, 0, 0, ['Tenside', 'Lösungsmittel']);

  // --- HEIMTIERBEDARF ---
  add('4000140706307', 'Hundefutter Trocken', 'Pedigree', 'Heimtierbedarf', 12.99, 2.5, 350, 20, 45, 12, 2, ['Getreide', 'Fleisch']);
  add('4000140706314', 'Katzenfutter Nass', 'Whiskas', 'Heimtierbedarf', 0.89, 0.6, 80, 8, 1, 5, 0.5, ['Fleisch', 'Mineralstoffe']);
  add('4000140706321', 'Katzenstreu Klumpend', 'Catsan', 'Heimtierbedarf', 7.99, 1.5, 0, 0, 0, 0, 0, ['Quarzsand', 'Kalk']);
  add('4000140706338', 'Kleintierfutter Mix', 'Vitakraft', 'Heimtierbedarf', 3.49, 0.8, 320, 14, 50, 6, 5, ['Getreide', 'Saaten', 'Gemüse']);
  add('4000140706345', 'Vogelfutter Kanarien', 'Trill', 'Heimtierbedarf', 2.99, 0.7, 380, 15, 55, 12, 1, ['Hirse', 'Kanariensaat']);
  add('4000140706352', 'Hundefutter Nass 12er', 'Cesar', 'Heimtierbedarf', 7.29, 0.8, 90, 9, 1, 5, 0.5, ['Fleisch', 'Gemüse']);
  add('4000140706369', 'Hunde Leckerlis sticks', 'Frolic', 'Heimtierbedarf', 1.49, 0.6, 300, 15, 40, 10, 5, ['Getreide', 'Fleisch']);
  add('4000140706370', 'Hundestangen Rind', 'Vitakraft', 'Heimtierbedarf', 1.99, 0.7, 320, 18, 10, 12, 5, ['Fleisch', 'Mineralstoffe']);
  add('4000140706376', 'Katzen Leckerlis', 'Dreamies', 'Heimtierbedarf', 1.29, 0.4, 400, 20, 30, 20, 2, ['Getreide', 'Fleisch']);
  add('4000140706383', 'Nassfutter Multipack', 'Felix', 'Heimtierbedarf', 4.49, 0.6, 80, 8, 1, 5, 0.5, ['Fleisch', 'Mineralstoffe']);
  add('4000140706390', 'Trockenfutter Huhn', 'Purina ONE', 'Heimtierbedarf', 5.99, 1.2, 360, 34, 30, 14, 2, ['Fleisch', 'Getreide']);

  // --- SCHREIBWAREN & SONSTIGES ---
  add('4000140706505', 'Batterien AA (4er)', 'Varta', 'Schreibwaren & Sonstiges', 4.99, 1.5, 0, 0, 0, 0, 0, ['Zink-Kohle']);
  add('4000140706512', 'Stumpenkerze Weiß', 'Erika', 'Schreibwaren & Sonstiges', 2.49, 0.8, 0, 0, 0, 0, 0, ['Paraffin']);
  add('4000140706529', 'Kugelschreiber Blau', 'Bic', 'Schreibwaren & Sonstiges', 0.99, 0.2, 0, 0, 0, 0, 0, ['Kunststoff', 'Tinte']);
  add('4000140706536', 'Schulheft A4 liniert', 'Brunnen', 'Schreibwaren & Sonstiges', 0.49, 0.3, 0, 0, 0, 0, 0, ['Papier']);
  add('4000140706543', 'Collegeblock A4', 'Oxford', 'Schreibwaren & Sonstiges', 2.49, 0.5, 0, 0, 0, 0, 0, ['Papier']);
  add('4000140706550', 'Ordner Breit Blau', 'Leitz', 'Schreibwaren & Sonstiges', 4.99, 1.2, 0, 0, 0, 0, 0, ['Pappe', 'Metall']);
  add('4000140706567', 'Alleskleber Stift', 'UHU', 'Schreibwaren & Sonstiges', 1.49, 0.1, 0, 0, 0, 0, 0, ['Harz']);
  add('4000140706574', 'Bastelschere Pro', 'Fiskars', 'Schreibwaren & Sonstiges', 5.99, 0.6, 0, 0, 0, 0, 0, ['Stahl', 'Kunststoff']);
  add('4000140706581', 'Feuerzeug Classic', 'BIC', 'Schreibwaren & Sonstiges', 1.49, 0.4, 0, 0, 0, 0, 0, ['Butan']);
  add('4000140706598', 'Streichhölzer (10er)', 'Europa', 'Schreibwaren & Sonstiges', 0.99, 0.2, 0, 0, 0, 0, 0, ['Holz', 'Phosphor']);
  add('4000140706604', 'Zeitschrift TV Movie', 'Bauer', 'Schreibwaren & Sonstiges', 2.20, 0.5, 0, 0, 0, 0, 0, ['Papier']);
  add('4000140706611', 'Tageszeitung Regional', 'Verlagsgruppe', 'Schreibwaren & Sonstiges', 1.80, 0.4, 0, 0, 0, 0, 0, ['Papier']);
  add('4000140706628', 'Klebeband Transparent', 'tesa', 'Schreibwaren & Sonstiges', 1.99, 0.3, 0, 0, 0, 0, 0, ['Kunststoff', 'Klebstoff']);
  
  // Spezifische Barcodes aus Nutzertests
  add('4068134114426', 'Maribel Erdbeer Konfitüre', 'Maribel', 'Vorratsschrank', 1.49, 0.4, 250, 0.5, 60, 0.1, 55, ['Erdbeeren', 'Zucker', 'Geliermittel Pektin']);
  add('4068134114006', 'Maribel Kirsch Konfitüre', 'Maribel', 'Vorratsschrank', 1.49, 0.4, 240, 0.5, 58, 0.1, 54, ['Sauerkirschen', 'Zucker', 'Geliermittel Pektin']);

  // --- WEITERE PRODUKTE (Batch 2) ---
  add('4000140706500', 'Süßkartoffeln', 'Bio-Hof', 'Obst & Gemüse', 2.49, 0.4, 86, 1.6, 20, 0.1, 4.2, ['Süßkartoffeln']);
  add('4000140706501', 'Cherrytomaten', 'Regional', 'Obst & Gemüse', 1.99, 0.3, 18, 0.9, 3.9, 0.2, 2.6, ['Tomaten']);
  add('4000140706502', 'Rucola', 'Edeka Bio', 'Obst & Gemüse', 1.49, 0.2, 25, 2.6, 3.7, 0.7, 2, ['Rucola']);
  add('4000140706503', 'Spinat Frisch', 'Edeka Bio', 'Obst & Gemüse', 1.99, 0.2, 23, 2.9, 3.6, 0.4, 0.4, ['Spinat']);
  add('4000140706504', 'Grünkohl', 'Regional', 'Obst & Gemüse', 2.49, 0.1, 49, 4.3, 9, 0.9, 2.3, ['Grünkohl']);
  add('4000140706505', 'Honigmelone', 'Import', 'Obst & Gemüse', 3.49, 0.4, 34, 0.8, 8, 0.2, 7, ['Honigmelone']);
  add('4000140706506', 'Granatapfel', 'Import', 'Obst & Gemüse', 1.99, 0.4, 83, 1.7, 19, 1.2, 14, ['Granatapfel']);

  add('4000140706600', 'Toastbrot', 'Golden Toast', 'Bäckerei', 1.29, 0.3, 260, 8, 49, 3.5, 4, ['Weizenmehl', 'Zucker'], ['wheat']);
  add('4000140706601', 'Vollkornbrot', 'Harry', 'Bäckerei', 1.89, 0.25, 220, 8, 40, 2, 3, ['Roggenvollkornmehl'], ['rye']);
  add('4000140706602', 'Baguette', 'Hausbäcker', 'Bäckerei', 0.99, 0.2, 250, 8, 50, 1, 2, ['Weizenmehl'], ['wheat']);
  add('4000140706603', 'Laugenstange', 'Edeka', 'Bäckerei', 0.69, 0.2, 280, 9, 55, 2, 1, ['Weizenmehl'], ['wheat']);
  add('4000140706604', 'Donut', 'Edeka', 'Bäckerei', 1.29, 0.4, 420, 5, 48, 22, 20, ['Mehl', 'Zucker', 'Fett'], ['wheat', 'milk']);
  add('4000140706605', 'Kuchen', 'Hausbäcker', 'Bäckerei', 3.49, 0.5, 350, 4, 52, 15, 30, ['Mehl', 'Zucker', 'Eier'], ['wheat', 'eggs']);
  add('4000140706606', 'Muffins', 'Edeka', 'Bäckerei', 2.49, 0.4, 380, 5, 52, 18, 28, ['Mehl', 'Blaubeeren'], ['wheat']);
  add('4000140706607', 'Plunder', 'Hausbäcker', 'Bäckerei', 1.49, 0.4, 350, 6, 48, 16, 22, ['Mehl', 'Kirschen'], ['wheat']);

  add('4000140706700', 'Milch 3,5%', 'Weihenstephan', 'Milchprodukte', 1.49, 0.3, 64, 3.4, 4.8, 3.5, 4.8, ['Milch'], ['milk']);
  add('4000140706701', 'Hafermilch', 'Oatly', 'Milchprodukte', 2.19, 0.1, 59, 1.0, 6.6, 3.0, 4.0, ['Wasser', 'Hafer'], ['oats']);
  add('4000140706702', 'Sojamilch', 'Alpro', 'Milchprodukte', 1.99, 0.15, 39, 3.3, 0.2, 1.8, 0, ['Wasser', 'Sojabohnen'], ['soy']);
  add('4000140706703', 'Fruchtjoghurt', 'Zottis', 'Milchprodukte', 0.69, 0.4, 98, 3.2, 15, 2.8, 14, ['Joghurt', 'Früchte'], ['milk']);
  add('4000140706704', 'Naturjoghurt', 'Andechser', 'Milchprodukte', 0.99, 0.25, 65, 4, 5, 3.8, 5, ['Joghurt'], ['milk']);
  add('4000140706705', 'Quark', 'Weihenstephan', 'Milchprodukte', 1.29, 0.3, 68, 12, 4, 0.3, 4, ['Quark'], ['milk']);
  add('4000140706706', 'Käse Mix', 'Milram', 'Milchprodukte', 2.49, 0.6, 350, 25, 0.1, 28, 0.1, ['Milch'], ['milk']);
  add('4000140706707', 'Frischkäse', 'Philadelphia', 'Milchprodukte', 1.99, 0.4, 225, 5.4, 4.3, 21, 4.3, ['Milch'], ['milk']);
  add('4000140706708', 'Butter', 'Berchtesgadener', 'Milchprodukte', 2.59, 0.8, 740, 0.7, 0.7, 82, 0.7, ['Rahm'], ['milk']);
  add('4000140706709', 'Margarine', 'Rama', 'Milchprodukte', 1.79, 0.2, 540, 0.1, 0.1, 60, 0.1, ['Pflanzliche Öle']);
  add('4000140706710', 'Sahne', 'Weihenstephan', 'Milchprodukte', 1.19, 0.4, 290, 2.4, 3.2, 30, 3.2, ['Sahne'], ['milk']);
  add('4000140706711', 'Pudding', 'Dany Sahne', 'Milchprodukte', 0.89, 0.4, 120, 3.5, 18, 3.5, 15, ['Milch', 'Kakao'], ['milk']);

  add('4000140706800', 'Hähnchenbrust', 'Bio-Geflügel', 'Fleisch & Wurst', 8.99, 3.5, 110, 23, 0, 1.2, 0, ['Hähnchenfleisch']);
  add('4000140706801', 'Rindfleisch', 'Weideglück', 'Fleisch & Wurst', 14.99, 12.0, 250, 26, 0, 15, 0, ['Rindfleisch']);
  add('4000140706802', 'Schweinefleisch', 'Metzgerfrisch', 'Fleisch & Wurst', 5.99, 4.5, 105, 21, 0, 2.5, 0, ['Schweinefleisch']);
  add('4000140706803', 'Hackfleisch', 'Bio-Hof', 'Fleisch & Wurst', 6.49, 10.5, 250, 20, 0, 19, 0, ['Rindfleisch']);
  add('4000140706804', 'Wurst Mix', 'Gutfried', 'Fleisch & Wurst', 2.99, 3.8, 260, 12, 1, 23, 0.5, ['Schweinefleisch']);
  add('4000140706805', 'Salami', 'Metzgerfrisch', 'Fleisch & Wurst', 3.49, 4.5, 380, 22, 1, 32, 0.5, ['Schweinefleisch']);
  add('4000140706806', 'Schinken', 'Metzgerfrisch', 'Fleisch & Wurst', 2.99, 3.8, 105, 19, 1, 3, 0.5, ['Schweinefleisch']);
  add('4000140706807', 'Mortadella', 'Metzgerfrisch', 'Fleisch & Wurst', 1.99, 3.5, 260, 12, 1, 23, 0.5, ['Schweinefleisch']);
  add('4000140706808', 'Bratwurst', 'Regional', 'Fleisch & Wurst', 3.99, 4.0, 300, 14, 1, 26, 0.5, ['Schweinefleisch']);
  add('4000140706809', 'Wiener', 'Gutfried', 'Fleisch & Wurst', 2.99, 3.8, 280, 13, 1, 25, 0.5, ['Schweinefleisch']);
  add('4000140706810', 'Lachs', 'Deutsche See', 'Fleisch & Wurst', 7.99, 2.5, 200, 20, 0, 13, 0, ['Lachs'], ['fish']);
  add('4000140706811', 'Thunfisch', 'Saupiquet', 'Fleisch & Wurst', 2.49, 1.8, 180, 25, 0, 8, 0, ['Thunfisch'], ['fish']);
  add('4000140706812', 'Fischstäbchen', 'Iglo', 'Tiefkühl & Konserven', 4.29, 1.8, 200, 13, 18, 8, 0.5, ['Seelachs'], ['fish']);

  add('4000140706900', 'Pizza Margherita', 'Dr. Oetker', 'Tiefkühl & Konserven', 3.49, 1.1, 230, 9, 28, 9, 2.5, ['Weizen', 'Käse'], ['wheat', 'milk']);
  add('4000140706901', 'Pommes', 'McCain', 'Tiefkühl & Konserven', 2.99, 0.8, 150, 2, 25, 5, 0.5, ['Kartoffeln']);
  add('4000140706902', 'Kroketten', 'Agrarfrost', 'Tiefkühl & Konserven', 2.49, 0.7, 180, 2.5, 28, 6, 0.5, ['Kartoffeln']);
  add('4000140706903', 'Lasagne', 'Frosta', 'Tiefkühl & Konserven', 4.49, 2.5, 150, 8, 12, 8, 2, ['Nudeln', 'Rindfleisch'], ['wheat']);
  add('4000140706904', 'Linsensuppe', 'Erasco', 'Tiefkühl & Konserven', 2.19, 0.4, 90, 5, 12, 1, 1, ['Linsen']);
  add('4000140706905', 'Ravioli Dose', 'Maggi', 'Tiefkühl & Konserven', 2.29, 0.6, 90, 3, 14, 2, 3, ['Nudeln', 'Fleisch'], ['wheat']);
  add('4000140706906', 'Bohnendose', 'Bonduelle', 'Tiefkühl & Konserven', 1.49, 0.3, 80, 5, 13, 0.5, 1, ['Bohnen']);
  add('4000140706907', 'Maisdose', 'Bonduelle', 'Tiefkühl & Konserven', 1.29, 0.3, 80, 3, 15, 1, 5, ['Mais']);
  add('4000140706908', 'Erbsen Dose', 'Bonduelle', 'Tiefkühl & Konserven', 1.49, 0.3, 70, 5, 10, 0.5, 3, ['Erbsen']);
  add('4000140706909', 'Tomatensauce', 'Barilla', 'Vorratsschrank', 2.49, 0.4, 60, 1.5, 8, 2, 5, ['Tomaten']);
  add('4000140706910', 'Ketchup', 'Heinz', 'Vorratsschrank', 2.99, 0.5, 100, 1, 23, 0.1, 22, ['Tomaten']);
  add('4000140706911', 'Mayonnaise', 'Hellmanns', 'Vorratsschrank', 2.49, 0.6, 680, 1, 3, 75, 3, ['Eier'], ['eggs']);
  add('4000140706912', 'Senf', 'Bautzner', 'Vorratsschrank', 0.69, 0.2, 100, 6, 6, 5, 2, ['Senfsaat'], ['mustard']);

  add('4000140707000', 'Spaghetti', 'Barilla', 'Vorratsschrank', 1.79, 0.5, 350, 12, 70, 1.5, 3, ['Hartweizen'], ['wheat']);
  add('4000140707001', 'Penne', 'Barilla', 'Vorratsschrank', 1.79, 0.5, 350, 12, 70, 1.5, 3, ['Hartweizen'], ['wheat']);
  add('4000140707002', 'Langkornreis', 'Reishunger', 'Vorratsschrank', 2.49, 0.7, 350, 7, 78, 0.5, 0.2, ['Reis']);
  add('4000140707003', 'Basmatireis', 'Reishunger', 'Vorratsschrank', 2.99, 0.8, 355, 8, 77, 1, 0.2, ['Reis']);
  add('4000140707004', 'Mehl Type 405', 'Regional', 'Vorratsschrank', 0.99, 0.3, 340, 10, 70, 1, 0.5, ['Weizen'], ['wheat']);
  add('4000140707005', 'Zucker Weiß', 'Südzucker', 'Vorratsschrank', 1.49, 0.4, 400, 0, 100, 0, 100, ['Zucker']);
  add('4000140707006', 'Salz Jod', 'Bad Reichenhaller', 'Vorratsschrank', 0.89, 0.1, 0, 0, 0, 0, 0, ['Salz']);
  add('4000140707007', 'Pfeffer Gemahlen', 'Ostmann', 'Vorratsschrank', 2.49, 0.2, 250, 10, 64, 3, 0.5, ['Pfeffer']);
  add('4000140707008', 'Curry Gewürz', 'Ostmann', 'Vorratsschrank', 1.99, 0.2, 320, 12, 50, 10, 2, ['Curcuma']);
  add('4000140707009', 'Haferflocken', 'Kölln', 'Vorratsschrank', 1.49, 0.2, 370, 13, 59, 7, 1, ['Hafer'], ['oats']);
  add('4000140707010', 'Früchtemüsli', 'Seitenbacher', 'Vorratsschrank', 4.99, 0.4, 350, 10, 60, 6, 15, ['Hafer', 'Früchte'], ['oats']);
  add('4000140707011', 'Cornflakes', 'Kellogg\'s', 'Vorratsschrank', 3.49, 0.5, 380, 7, 84, 1, 8, ['Mais'], []);

  add('4000140707100', 'Vollmilchschokolade', 'Milka', 'Snacks & Süßes', 1.29, 0.8, 530, 6, 58, 30, 57, ['Kakaobohnen', 'Milch'], ['milk']);
  add('4000140707101', 'Zartbitterschokolade', 'Lindt', 'Snacks & Süßes', 2.49, 0.7, 550, 7, 35, 40, 30, ['Kakaomasse']);
  add('4000140707102', 'Weiße Schokolade', 'Lindt', 'Snacks & Süßes', 2.49, 1.0, 560, 6, 55, 35, 55, ['Kakaobutter', 'Milch'], ['milk']);
  add('4000140707103', 'Gummibärchen', 'Haribo', 'Snacks & Süßes', 1.19, 0.4, 340, 7, 77, 0.1, 46, ['Zucker', 'Gelatine']);
  add('4000140707104', 'Lakritz', 'Haribo', 'Snacks & Süßes', 1.19, 0.3, 320, 3, 75, 0.5, 45, ['Süßholz']);
  add('4000140707105', 'Chips Paprika', 'Funny-Frisch', 'Snacks & Süßes', 1.99, 0.7, 530, 6, 49, 33, 2.5, ['Kartoffeln']);
  add('4000140707106', 'Tortilla Chips', 'Chio', 'Snacks & Süßes', 1.99, 0.7, 510, 6, 60, 25, 2, ['Mais']);
  add('4000140707107', 'Salzstangen', 'Lorenz', 'Snacks & Süßes', 1.49, 0.5, 380, 10, 75, 4, 2, ['Mehl', 'Salz'], ['wheat']);
  add('4000140707108', 'Cracker', 'TUC', 'Snacks & Süßes', 1.49, 0.5, 480, 8, 65, 20, 7, ['Mehl'], ['wheat']);
  add('4000140707109', 'Kekse', 'Leibniz', 'Snacks & Süßes', 1.49, 0.4, 440, 7, 72, 13, 22, ['Mehl', 'Butter'], ['wheat', 'milk']);
  add('4000140707110', 'Waffeln', 'Manner', 'Snacks & Süßes', 2.29, 0.6, 485, 5, 65, 22, 45, ['Mehl', 'Haselnüsse'], ['wheat', 'hazelnuts']);
  add('4000140707111', 'Proteinriegel', 'Powerbar', 'Snacks & Süßes', 1.99, 0.5, 200, 20, 15, 6, 1.5, ['Milcheiweiß'], ['milk']);

  add('4000140707200', 'Mineralwasser', 'Gerolsteiner', 'Getränke', 0.89, 0.1, 0, 0, 0, 0, 0, ['Wasser']);
  add('4000140707201', 'Sprudel', 'Regional', 'Getränke', 0.69, 0.1, 0, 0, 0, 0, 0, ['Wasser']);
  add('4000140707202', 'Cola', 'Coca-Cola', 'Getränke', 1.29, 0.4, 42, 0, 10.6, 0, 10.6, ['Wasser', 'Zucker']);
  add('4000140707203', 'Fanta', 'Coca-Cola', 'Getränke', 1.29, 0.4, 38, 0, 9, 0, 9, ['Wasser', 'Zucker']);
  add('4000140707204', 'Sprite', 'Coca-Cola', 'Getränke', 1.29, 0.4, 37, 0, 9, 0, 9, ['Wasser', 'Zucker']);
  add('4000140707205', 'Eistee', 'Lipton', 'Getränke', 1.49, 0.3, 20, 0, 5, 0, 5, ['Wasser', 'Tee']);
  add('4000140707206', 'Orangensaft', 'Hohes C', 'Getränke', 2.19, 0.35, 43, 0.7, 9, 0.2, 9, ['Orangen']);
  add('4000140707207', 'Apfelsaft', 'Amecke', 'Getränke', 1.99, 0.3, 45, 0.1, 11, 0.1, 10, ['Äpfel']);
  add('4000140707208', 'Multivitaminsaft', 'Punika', 'Getränke', 1.79, 0.4, 48, 0.4, 11, 0.1, 10, ['Früchtemix']);
  add('4000140707209', 'Kaffee Bohnen', 'Tchibo', 'Getränke', 5.99, 1.5, 2, 0.1, 0.3, 0.1, 0, ['Kaffee']);
  add('4000140707210', 'Instantkaffee', 'Nescafé', 'Getränke', 6.99, 0.8, 2, 0.1, 0.3, 0.1, 0, ['Kaffee']);
  add('4000140707211', 'Tee Mix', 'Meßmer', 'Getränke', 1.99, 0.2, 1, 0.1, 0.2, 0.1, 0.1, ['Kräuter']);
  add('4000140707212', 'Energydrink', 'Red Bull', 'Getränke', 1.49, 0.6, 45, 0, 11, 0, 11, ['Wasser', 'Zucker']);

  add('4000140707300', 'Shampoo', 'Pantene', 'Drogerie & Pflege', 3.49, 0.5, 0, 0, 0, 0, 0, ['Wasser']);
  add('4000140707301', 'Spülung', 'Pantene', 'Drogerie & Pflege', 3.49, 0.5, 0, 0, 0, 0, 0, ['Wasser']);
  add('4000140707302', 'Duschgel', 'Nivea', 'Drogerie & Pflege', 1.99, 0.4, 0, 0, 0, 0, 0, ['Wasser']);
  add('4000140707303', 'Seife', 'Sagrotan', 'Drogerie & Pflege', 2.49, 0.3, 0, 0, 0, 0, 0, ['Wasser']);
  add('4000140707304', 'Zahnpasta', 'Colgate', 'Drogerie & Pflege', 2.49, 0.3, 0, 0, 0, 0, 0, ['Fluorid']);
  add('4000140707305', 'Zahnbürste', 'Dr. Best', 'Drogerie & Pflege', 1.49, 0.2, 0, 0, 0, 0, 0, ['Kunststoff']);
  add('4000140707306', 'Mundspülung', 'Listerine', 'Drogerie & Pflege', 4.49, 0.4, 0, 0, 0, 0, 0, ['Wasser']);
  add('4000140707307', 'Deo', 'Rexona', 'Drogerie & Pflege', 2.99, 0.6, 0, 0, 0, 0, 0, ['Alkohol']);
  add('4000140707308', 'Rasiergel', 'Gillette', 'Drogerie & Pflege', 3.99, 0.5, 0, 0, 0, 0, 0, ['Wasser']);
  add('4000140707309', 'Rasierer', 'Gillette', 'Drogerie & Pflege', 4.99, 0.6, 0, 0, 0, 0, 0, ['Stahl']);
  add('4000140707310', 'Toilettenpapier', 'Zewa', 'Drogerie & Pflege', 4.49, 0.8, 0, 0, 0, 0, 0, ['Zellstoff']);
  add('4000140707311', 'Taschentücher', 'Tempo', 'Drogerie & Pflege', 2.29, 0.4, 0, 0, 0, 0, 0, ['Zellstoff']);
  add('4000140707312', 'Wattepads', 'Ebelin', 'Drogerie & Pflege', 0.99, 0.3, 0, 0, 0, 0, 0, ['Baumwolle']);

  add('4000140707400', 'Waschmittel', 'Ariel', 'Haushalt', 8.99, 1.2, 0, 0, 0, 0, 0, ['Tenside']);
  add('4000140707401', 'Weichspüler', 'Lenor', 'Haushalt', 3.49, 0.7, 0, 0, 0, 0, 0, ['Tenside']);
  add('4000140707402', 'Spülmittel', 'Pril', 'Haushalt', 1.99, 0.3, 0, 0, 0, 0, 0, ['Tenside']);
  add('4000140707403', 'Allzweckreiniger', 'Meister Proper', 'Haushalt', 2.49, 0.4, 0, 0, 0, 0, 0, ['Tenside']);
  add('4000140707404', 'Glasreiniger', 'Sidolin', 'Haushalt', 2.49, 0.4, 0, 0, 0, 0, 0, ['Alkohol']);
  add('4000140707405', 'Badreiniger', 'Antikal', 'Haushalt', 3.99, 0.5, 0, 0, 0, 0, 0, ['Säuren']);
  add('4000140707406', 'Müllbeutel', 'Swirl', 'Haushalt', 1.99, 0.5, 0, 0, 0, 0, 0, ['Polyethylen']);
  add('4000140707407', 'Küchenrolle', 'Zewa', 'Haushalt', 2.99, 0.6, 0, 0, 0, 0, 0, ['Zellstoff']);
  add('4000140707408', 'Alufolie', 'Toppits', 'Haushalt', 2.49, 2.5, 0, 0, 0, 0, 0, ['Aluminium']);
  add('4000140707409', 'Backpapier', 'Toppits', 'Haushalt', 1.79, 0.3, 0, 0, 0, 0, 0, ['Papier']);
  add('4000140707410', 'Frischehaltefolie', 'Toppits', 'Haushalt', 1.49, 0.6, 0, 0, 0, 0, 0, ['Polyethylen']);

  add('4000140707500', 'Hundefutter', 'Pedigree', 'Heimtierbedarf', 12.99, 2.5, 350, 20, 45, 12, 2, ['Fleisch']);
  add('4000140707501', 'Katzenfutter', 'Whiskas', 'Heimtierbedarf', 0.89, 0.6, 80, 8, 1, 5, 0.5, ['Fleisch']);
  add('4000140707502', 'Leckerlis Hund', 'Frolic', 'Heimtierbedarf', 1.49, 0.6, 300, 15, 40, 10, 5, ['Fleisch']);
  add('4000140707503', 'Katzenstreu', 'Catsan', 'Heimtierbedarf', 7.99, 1.5, 0, 0, 0, 0, 0, ['Mineralstoffe']);

  add('4000140707600', 'Batterien', 'Varta', 'Schreibwaren & Sonstiges', 4.99, 1.5, 0, 0, 0, 0, 0, ['Zink']);
  add('4000140707601', 'Kerzen', 'Erika', 'Schreibwaren & Sonstiges', 2.49, 0.8, 0, 0, 0, 0, 0, ['Wachs']);
  add('4000140707602', 'Feuerzeug', 'BIC', 'Schreibwaren & Sonstiges', 1.49, 0.4, 0, 0, 0, 0, 0, ['Gas']);
  add('4000140707603', 'Stifte Mix', 'Bic', 'Schreibwaren & Sonstiges', 1.99, 0.2, 0, 0, 0, 0, 0, ['Plastik']);
  add('4000140707604', 'Hefte A4', 'Oxford', 'Schreibwaren & Sonstiges', 0.99, 0.3, 0, 0, 0, 0, 0, ['Papier']);
  add('4000140707605', 'Klebeband', 'tesa', 'Schreibwaren & Sonstiges', 1.99, 0.3, 0, 0, 0, 0, 0, ['Plastik']);
  add('4000140707606', 'Schere', 'Fiskars', 'Schreibwaren & Sonstiges', 5.99, 0.6, 0, 0, 0, 0, 0, ['Metall']);

  return products;
}

export async function forceUpdateDatabase(): Promise<void> {
  const initialProducts = getInitialProducts();
  await seedProducts(initialProducts);
}

export async function deleteAllProducts(): Promise<void> {
  console.log('Deleting all products from Firestore...');
  try {
    const snapshot = await getDocs(collection(db, 'products'));
    for (const productDoc of snapshot.docs) {
      try {
        await deleteDoc(doc(db, 'products', productDoc.id));
      } catch (err) {
        console.warn(`Failed to delete product ${productDoc.id}:`, err);
      }
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'products');
  }
}

async function seedProducts(products: Product[]) {
  const batchSize = 450;
  console.log('Seeding products started...');
  
  for (let i = 0; i < products.length; i += batchSize) {
    const chunk = products.slice(i, i + batchSize);
    console.log(`Processing batch ${Math.floor(i / batchSize) + 1} (${chunk.length} items)...`);
    
    try {
      const batch = writeBatch(db);
      chunk.forEach((p) => {
        batch.set(doc(db, 'products', p.id), {
          ...p,
          updatedAt: serverTimestamp()
        });
      });
      await batch.commit();
      console.log(`Batch ${Math.floor(i / batchSize) + 1} commit successful`);
    } catch (error) {
      console.error(`Batch ${Math.floor(i / batchSize) + 1} failed:`, error);
      
      // Fallback: Individual setDoc
      console.warn('Attempting fallback: Individual setDoc seeding for this batch...');
      for (const p of chunk) {
        try {
          await setDoc(doc(db, 'products', p.id), {
            ...p,
            updatedAt: serverTimestamp()
          });
        } catch (innerError) {
          handleFirestoreError(innerError, OperationType.WRITE, `products/${p.id}`);
        }
      }
    }
  }
}
