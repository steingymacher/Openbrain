export interface DietaryProfile {
  lactoseIntolerance: boolean;
  glutenIntolerance: boolean;
  vegan: boolean;
  vegetarian: boolean;
  nutAllergy: boolean;
  lowCalorie: boolean;
  highProtein: boolean;
  co2Conscious: boolean;
}

export interface UserProfile {
  uid: string;
  name: string;
  email: string;
  role?: string;
  language?: 'de' | 'en';
  dietaryProfile: DietaryProfile;
  totalCo2Saved?: number;
  hasCompletedTutorial?: boolean;
  createdAt?: string;
  isMarked?: boolean;
  isIgnored?: boolean;
}

export interface Product {
  id: string;
  name: string;
  brand: string;
  image: string;
  price: number;
  category: string;
  subCategory?: string;
  co2: number; // kg CO2 per kg/unit
  kcal: number;
  proteins: number;
  carbs: number;
  fat: number;
  sugar: number;
  ingredients: string[];
  allergens: string[];
  description?: string;
  stock: number;
}

export interface CartItem extends Product {
  quantity: number;
}

export interface GreenhouseTask {
  id: string;
  title: string;
  description: string;
  assignedTo?: string; // User UID
  assignedName?: string; // User Name
  date: string; // ISO Date
  completed: boolean;
}

export interface GreenhouseStatus {
  temperature: number;
  humidity: number;
  lastUpdated: string;
  cameraUrl?: string;
}

export interface PlantRecord {
  id: string;
  name: string;
  variety: string;
  plantedAt: string;
  expectedHarvestAt: string;
  harvestedAt?: string;
  status: 'growing' | 'harvested' | 'failed';
  notes?: string;
}

export interface Order {
  id: string;
  userId: string;
  items: CartItem[];
  totalPrice: number;
  type: 'online' | 'instore';
  status: 'pending' | 'completed' | 'cancelled';
  createdAt: string;
}

export interface ShoppingList {
  id: string;
  userId: string;
  name: string;
  items: CartItem[];
  createdAt: any;
}

export interface MarketplaceOffer {
  id: string;
  userId: string;
  userName: string;
  title: string;
  description: string;
  price: number;
  category: string;
  type: 'product' | 'service' | 'announcement';
  images: string[];
  createdAt: any;
  status: 'active' | 'sold' | 'reserved';
  eventDate?: string;
}

export interface Chat {
  id: string;
  participants: string[];
  lastMessage: string;
  lastMessageTimestamp: any;
  offerId: string;
  offerTitle: string;
  sellerId: string;
  buyerId: string;
}

export interface Message {
  id: string;
  senderId: string;
  text: string;
  timestamp: any;
}

export type ServiceMode = 'pickup' | 'delivery' | 'staff_portal' | 'marketplace' | 'messages';
