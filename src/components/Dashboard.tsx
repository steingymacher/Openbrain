import { useState, useEffect, useCallback, useRef } from 'react';
import { auth, db } from '../firebase';
import { doc, onSnapshot, collection, addDoc, serverTimestamp, setDoc, updateDoc, deleteDoc, query, where } from 'firebase/firestore';
import { UserProfile, Product, CartItem, ServiceMode, ShoppingList } from '../types';
import { fetchProductByBarcode, fetchAvailableProducts, forceUpdateDatabase } from '../services/productService';
import { handleFirestoreError, OperationType } from '../lib/firestore-errors';
import Scanner from './Scanner';
import ProductDetail from './ProductDetail';
import ProfileSettings from './ProfileSettings';
import CartView from './CartView';
import AdminPanel from './AdminPanel';
import GreenhouseTasks from './GreenhouseTasks';
import GreenhouseMonitor from './GreenhouseMonitor';
import Marketplace from './Marketplace';
import ChatView from './ChatView';
import AIChatAssistant from './AIChatAssistant';
import BernardTutorial from './BernardTutorial';
import { GroupsView } from './GroupsView';
import { motion, AnimatePresence } from 'motion/react';
import { Scan, User, LogOut, ShoppingBag, ChevronRight, ShieldAlert, Calendar, Eye, Truck, Package, Search, Plus, Cookie, Droplets, Apple, Milk, Croissant, Snowflake, HelpCircle, Drumstick, ChevronDown, Trash2, Globe, MessageSquare, Bath, Sparkles, Dog, PenTool, Users } from 'lucide-react';
import { cn } from '../lib/utils';
import { useTranslation, TranslationKeys } from '../lib/LanguageContext';
import { useTheme } from '../lib/ThemeContext';

const CATEGORY_MAP: Record<string, { icon: any, key: TranslationKeys }> = {
  'Snacks & Süßes': { icon: Cookie, key: 'category_snacks' },
  'Getränke': { icon: Droplets, key: 'category_drinks' },
  'Obst & Gemüse': { icon: Apple, key: 'category_produce' },
  'Milchprodukte': { icon: Milk, key: 'category_dairy' },
  'Bäckerei': { icon: Croissant, key: 'category_bakery' },
  'Tiefkühl': { icon: Snowflake, key: 'category_frozen' },
  'Fleisch & Wurst': { icon: Drumstick, key: 'category_meat' },
  'Vorratsschrank': { icon: Package, key: 'category_pantry' as any },
  'Drogerie & Pflege': { icon: Bath, key: 'category_drugstore' as any },
  'Haushalt': { icon: Sparkles, key: 'category_household' as any },
  'Heimtierbedarf': { icon: Dog, key: 'category_pets' as any },
  'Schreibwaren & Sonstiges': { icon: PenTool, key: 'category_misc' as any },
  'Sonstiges': { icon: HelpCircle, key: 'category_other' }
};

export default function Dashboard() {
  const { t, language } = useTranslation();
  const { theme } = useTheme();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [availableProducts, setAvailableProducts] = useState<Product[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'scan' | 'tasks' | 'cart' | 'monitor' | 'lists' | 'marketplace' | 'messages' | 'groups'>('scan');
  const [serviceMode, setServiceMode] = useState<ServiceMode | null>(null);
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isAdminOpen, setIsAdminOpen] = useState(false);
  const [scannedProduct, setScannedProduct] = useState<Product | null>(null);
  const [isAddingProduct, setIsAddingProduct] = useState(false);
  const [loading, setLoading] = useState(false);
  const [shoppingLists, setShoppingLists] = useState<ShoppingList[]>([]);
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({});
  const [isTutorialOpen, setIsTutorialOpen] = useState(false);
  const isScanningRef = useRef(false);

  const toggleCategory = (category: string) => {
    setExpandedCategories(prev => ({
      ...prev,
      [category]: !prev[category]
    }));
  };

  const loadProducts = useCallback(async () => {
    try {
      let products = await fetchAvailableProducts();
      if (products.length < 50) {
        console.log('Database too small, seeding products...');
        await forceUpdateDatabase();
        products = await fetchAvailableProducts();
      }
      setAvailableProducts(products);
    } catch (err) {
      console.error('Error loading products:', err);
    }
  }, []);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  useEffect(() => {
    if (availableProducts.length > 0 && Object.keys(expandedCategories).length === 0) {
      const allCats = availableProducts.reduce((acc, p) => {
        acc[p.category || 'Sonstiges'] = false;
        return acc;
      }, {} as Record<string, boolean>);
      setExpandedCategories(allCats);
    }
  }, [availableProducts, expandedCategories]);

  useEffect(() => {
    if (!auth.currentUser) return;

    // Check API health
    fetch('/api/health')
      .then(r => r.json())
      .then(data => console.log('API Health:', data))
      .catch(err => console.error('API Health Check Failed:', err));

    const unsub = onSnapshot(doc(db, 'users', auth.currentUser.uid), async (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data() as UserProfile;
        // Auto-upgrade to admin if email matches
        const adminEmails = [
          'mihail.cozirev2017@gmail.com', 
          'steingymacher@gmail.com', 
          '1@mail.com',
          'derstein-shop@mail.com'
        ];
        const isHardcodedAdmin = adminEmails.includes(data.email.toLowerCase());
        
        if (isHardcodedAdmin && data.role !== 'admin') {
          console.log('Upgrading user to admin profile in Firestore...');
          try {
            await updateDoc(doc(db, 'users', auth.currentUser!.uid), { role: 'admin' });
          } catch (err) {
            console.error('Failed to upgrade user to admin:', err);
            setProfile({ ...data, role: 'admin' });
          }
        } else {
          setProfile(data);
          if (data.hasCompletedTutorial === false && !isTutorialOpen) {
            setIsTutorialOpen(true);
          }
        }
      } else {
        // Create default profile if it doesn't exist
        console.log('Profile not found, creating default...');
        const adminEmails = ['mihail.cozirev2017@gmail.com', 'steingymacher@gmail.com', '1@mail.com', 'derstein-shop@mail.com'];
        const isAdminEmail = adminEmails.includes(auth.currentUser!.email?.toLowerCase() || '');
        const defaultProfile: UserProfile = {
          uid: auth.currentUser!.uid,
          name: auth.currentUser!.displayName || 'Nutzer',
          email: auth.currentUser!.email || '',
          role: isAdminEmail ? 'admin' : 'user',
          language: (language as 'de' | 'en') || 'de',
          dietaryProfile: {
            lactoseIntolerance: false,
            glutenIntolerance: false,
            vegan: false,
            vegetarian: false,
            nutAllergy: false,
            lowCalorie: false,
            highProtein: false,
            co2Conscious: false,
          }
        };
        try {
          await setDoc(doc(db, 'users', auth.currentUser!.uid), defaultProfile);
        } catch (err) {
          console.error('Error creating default profile:', err);
        }
      }
    });

    const unsubLists = onSnapshot(
      query(collection(db, 'shopping_lists'), where('userId', '==', auth.currentUser.uid)), 
      (snapshot) => {
        const lists = snapshot.docs
          .map(doc => ({ id: doc.id, ...doc.data() } as ShoppingList))
          .sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
        setShoppingLists(lists);
      },
      (err) => {
        console.error("Error fetching shopping lists:", err);
      }
    );

    return () => {
      unsub();
      unsubLists();
    };
  }, []);

  const handleScan = useCallback(async (barcode: string) => {
    if (isScanningRef.current) return;
    
    console.log(`Handle scan for: ${barcode}`);
    isScanningRef.current = true;
    setIsScannerOpen(false);
    setLoading(true);
    
    try {
      const product = await fetchProductByBarcode(barcode);
      if (product) {
        setScannedProduct(product);
      } else {
        alert(t('product_not_found'));
      }
    } catch (err) {
      console.error('Scan handling error:', err);
    } finally {
      setLoading(false);
      isScanningRef.current = false;
    }
  }, []);

  const addToCart = (updatedProduct?: Product) => {
    const productToUse = updatedProduct || scannedProduct;
    if (!productToUse) return;
    
    setCart(prev => {
      const existing = prev.find(item => item.id === productToUse.id);
      if (existing) {
        return prev.map(item => item.id === productToUse.id ? { ...item, quantity: item.quantity + 1, price: productToUse.price } : item);
      }
      return [...prev, { ...productToUse, quantity: 1 }];
    });
    setScannedProduct(null);
  };

  const updateQuantity = (id: string, delta: number) => {
    setCart(prev => prev.map(item => {
      if (item.id === id) {
        const newQty = Math.max(1, item.quantity + delta);
        return { ...item, quantity: newQty };
      }
      return item;
    }));
  };

  const removeItem = (id: string) => {
    setCart(prev => prev.filter(item => item.id !== id));
  };

  const handleSaveShoppingList = async (name: string) => {
    if (!profile || cart.length === 0) return;
    try {
      await addDoc(collection(db, 'shopping_lists'), {
        userId: profile.uid,
        name,
        items: cart,
        createdAt: serverTimestamp()
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'shopping_lists');
    }
  };

  const handleLoadShoppingList = (list: ShoppingList) => {
    setCart(list.items);
    setActiveTab('cart');
  };

  const handleCheckout = async (type: 'online' | 'instore', co2Fee: number = 0) => {
    if (cart.length === 0) return;
    try {
      const co2Total = cart.reduce((sum, item) => sum + item.co2 * item.quantity, 0);
      await addDoc(collection(db, 'orders'), {
        userId: auth.currentUser?.uid,
        items: cart,
        totalPrice: cart.reduce((sum, item) => sum + item.price * item.quantity, 0) + co2Fee,
        co2Fee,
        totalKcal: cart.reduce((sum, item) => sum + item.kcal * item.quantity, 0),
        totalCo2: co2Total,
        type,
        serviceMode,
        status: 'pending',
        timestamp: serverTimestamp()
      });

      // Update total Co2 saved in profile (simulated metric based on organic/sustainable choices)
      // Here we simulate that 50% of the co2 value is "saved" compared to industrial standard if user bought green
      if (profile) {
        const savedCo2 = co2Total * 0.4; // Conservative estimate: 40% less than industrial average
        await updateDoc(doc(db, 'users', profile.uid), {
          totalCo2Saved: (profile.totalCo2Saved || 0) + savedCo2
        });
      }

      setCart([]);
      alert(type === 'online' ? t('checkout_online') : t('checkout_instore'));
    } catch (err) {
      console.error('Checkout error:', err);
    }
  };

  const completeTutorial = async () => {
    if (!profile) return;
    setIsTutorialOpen(false);
    setIsProfileOpen(false);
    try {
      await updateDoc(doc(db, 'users', profile.uid), { hasCompletedTutorial: true });
    } catch (err) {
      console.error('Error completing tutorial:', err);
    }
  };

  const handleTutorialStepChange = (stepId: string) => {
    switch (stepId) {
      case 'profile':
        setIsProfileOpen(true);
        break;
      case 'recommendations':
      case 'service':
      case 'pickup':
        setIsProfileOpen(false);
        setActiveTab('scan');
        break;
      case 'shopping_lists':
        setIsProfileOpen(false);
        setActiveTab('lists');
        break;
      case 'marketplace':
        setIsProfileOpen(false);
        if (serviceMode !== 'marketplace') setServiceMode('marketplace');
        setActiveTab('marketplace');
        break;
      case 'checkout':
        setIsProfileOpen(false);
        setActiveTab('cart');
        break;
      case 'finish':
        setIsProfileOpen(false);
        break;
    }
  };

  if (!profile) return <div className="min-h-screen bg-[#F5F5F0] dark:bg-[#121212] flex items-center justify-center transition-colors dark:text-white">{t('loading')}</div>;
  
  return (
    <div className="min-h-screen bg-[#F5F5F0] dark:bg-[#121212] pb-32 transition-colors">
      {!serviceMode ? (
        <div className="min-h-screen flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white dark:bg-[#1a1a1a] w-full max-w-md rounded-[40px] p-8 shadow-2xl border border-gray-100 dark:border-gray-800 transition-colors"
            >
              <div className="text-center mb-8">
                <div className="w-16 h-16 bg-[#5A5A40]/10 dark:bg-[#5A5A40]/20 rounded-full flex items-center justify-center mx-auto mb-4">
                  <ShoppingBag className="w-8 h-8 text-[#5A5A40]" />
                </div>
                <h2 className="text-3xl font-serif font-bold text-[#1a1a1a] dark:text-white mb-2">{t('welcome')}</h2>
                <p className="text-gray-400 dark:text-gray-500">{t('how_to_shop')}</p>
              </div>

            <div className="space-y-4">
              <button
                onClick={() => {
                  setServiceMode('pickup');
                  setActiveTab('scan');
                }}
                className="w-full flex items-center gap-6 p-6 rounded-[32px] border-2 border-gray-50 dark:border-gray-900/50 hover:border-[#5A5A40] hover:bg-[#5A5A40]/5 dark:hover:bg-[#5A5A40]/10 transition-all group text-left"
              >
                <div className="w-14 h-14 bg-orange-50 dark:bg-orange-500/10 rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform">
                  <Package className="w-7 h-7 text-orange-500" />
                </div>
                <div>
                  <h3 className="font-bold text-[#1a1a1a] dark:text-white text-lg">{t('pickup')}</h3>
                  <p className="text-xs text-gray-400 dark:text-gray-500">{t('pickup_desc')}</p>
                </div>
                <ChevronRight className="w-5 h-5 ml-auto text-gray-300 dark:text-gray-700" />
              </button>

              <button
                onClick={() => {
                  setServiceMode('delivery');
                  setActiveTab('scan');
                }}
                className="w-full flex items-center gap-6 p-6 rounded-[32px] border-2 border-gray-50 dark:border-gray-900/50 hover:border-[#5A5A40] hover:bg-[#5A5A40]/5 dark:hover:bg-[#5A5A40]/10 transition-all group text-left"
              >
                <div className="w-14 h-14 bg-blue-50 dark:bg-blue-500/10 rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform">
                  <Truck className="w-7 h-7 text-blue-500" />
                </div>
                <div>
                  <h3 className="font-bold text-[#1a1a1a] dark:text-white text-lg">{t('delivery')}</h3>
                  <p className="text-xs text-gray-400 dark:text-gray-500">{t('delivery_desc')}</p>
                </div>
                <ChevronRight className="w-5 h-5 ml-auto text-gray-300 dark:text-gray-700" />
              </button>

              <div className="w-full h-px bg-gray-100 dark:bg-gray-800 my-2" />

              <button
                onClick={() => {
                  setServiceMode('marketplace');
                  setActiveTab('marketplace');
                }}
                className="w-full flex items-center gap-6 p-6 rounded-[32px] border-2 border-gray-50 dark:border-gray-900/50 hover:border-[#5A5A40] hover:bg-[#5A5A40]/5 dark:hover:bg-[#5A5A40]/10 transition-all group text-left"
              >
                <div className="w-14 h-14 bg-green-50 dark:bg-green-500/10 rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform">
                  <Globe className="w-7 h-7 text-green-600" />
                </div>
                <div>
                  <h3 className="font-bold text-[#1a1a1a] dark:text-white text-lg">{t('marketplace')}</h3>
                  <p className="text-xs text-gray-400 dark:text-gray-500">{t('marketplace_desc')}</p>
                </div>
                <ChevronRight className="w-5 h-5 ml-auto text-gray-300 dark:text-gray-700" />
              </button>

              {(profile.role === 'admin' || profile.role === 'staff') && (
                <button
                  onClick={() => {
                    setServiceMode('staff_portal');
                    setActiveTab('tasks');
                  }}
                  className="w-full flex items-center gap-6 p-6 rounded-[32px] border-2 border-gray-50 dark:border-gray-900/50 hover:border-[#5A5A40] hover:bg-[#5A5A40]/5 dark:hover:bg-[#5A5A40]/10 transition-all group text-left"
                >
                  <div className="w-14 h-14 bg-purple-50 dark:bg-purple-500/10 rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform">
                    <ShieldAlert className="w-7 h-7 text-purple-600" />
                  </div>
                  <div>
                    <h3 className="font-bold text-[#1a1a1a] dark:text-white text-lg">{t('staff_portal' as any)}</h3>
                    <p className="text-xs text-gray-400 dark:text-gray-500">{t('staff_portal_desc' as any)}</p>
                  </div>
                  <ChevronRight className="w-5 h-5 ml-auto text-gray-300 dark:text-gray-700" />
                </button>
              )}
            </div>

            <div className="mt-8 pt-6 border-t border-gray-50 dark:border-gray-800 text-center">
              <p className="text-[10px] text-gray-300 font-bold uppercase tracking-widest">
                {t('later_change')}
              </p>
            </div>
          </motion.div>
        </div>
      ) : (
        <>
          {/* Header */}
          <header className="bg-white dark:bg-[#1a1a1a] px-6 py-6 flex justify-between items-center sticky top-0 z-30 shadow-sm transition-colors border-b dark:border-gray-800">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-[#5A5A40] rounded-full flex items-center justify-center text-white font-bold transition-transform">
            {profile.name[0]}
          </div>
          <div>
            <p className="text-xs text-gray-400 dark:text-gray-500 font-bold uppercase tracking-widest">{t('welcome')}</p>
            <h2 className="font-serif font-bold text-lg dark:text-white">{profile.name}</h2>
          </div>
        </div>
        <div className="flex gap-2">
          <button 
            id="service-mode-badge"
            onClick={() => setServiceMode(null)}
            className="p-3 bg-gray-50 dark:bg-white/5 rounded-2xl hover:bg-gray-100 dark:hover:bg-white/10 transition-all flex items-center gap-2"
            title={t('change_service_mode')}
          >
            {serviceMode === 'pickup' && <Package className="w-5 h-5 text-[#5A5A40]" />}
            {serviceMode === 'delivery' && <Truck className="w-5 h-5 text-[#5A5A40]" />}
            {serviceMode === 'marketplace' && <Globe className="w-5 h-5 text-[#5A5A40]" />}
            {serviceMode === 'staff_portal' && <ShieldAlert className="w-5 h-5 text-[#5A5A40]" />}
            
            <span className="text-[10px] font-bold uppercase tracking-widest hidden sm:inline text-gray-600 dark:text-gray-400">
              {serviceMode === 'pickup' && t('pickup')}
              {serviceMode === 'delivery' && t('delivery')}
              {serviceMode === 'marketplace' && t('marketplace')}
              {serviceMode === 'staff_portal' && t('staff_portal' as any)}
            </span>
          </button>
          {profile.role === 'admin' && (
            <button 
              onClick={() => setIsAdminOpen(true)}
              className="p-3 bg-amber-50 dark:bg-amber-500/10 rounded-2xl hover:bg-amber-100 dark:hover:bg-amber-500/20 transition-all border border-amber-100 dark:border-amber-500/20"
              title={t('admin_panel')}
            >
              <ShieldAlert className="w-6 h-6 text-amber-600 dark:text-amber-400" />
            </button>
          )}
          <button 
            id="profile-button"
            onClick={() => setIsProfileOpen(true)}
            className="p-3 bg-gray-50 dark:bg-white/5 rounded-2xl hover:bg-gray-100 dark:hover:bg-white/10 transition-all font-medium"
            title={t('profile_settings')}
          >
            <User className="w-6 h-6 text-gray-600 dark:text-gray-400" />
          </button>
          <button 
            onClick={() => auth.signOut()}
            className="p-3 bg-gray-50 dark:bg-white/5 rounded-2xl hover:bg-red-50 dark:hover:bg-red-500/10 transition-all"
            title={t('logout')}
          >
            <LogOut className="w-6 h-6 text-gray-600 dark:text-gray-400" />
          </button>
        </div>
      </header>

      <main className="max-w-2xl mx-auto p-6 pb-32">
        {/* Tab Navigation */}
        <div className="flex overflow-x-auto no-scrollbar bg-gray-100/50 dark:bg-white/5 p-1.5 rounded-[24px] mb-8 gap-1 transition-colors">
          {(serviceMode === 'pickup' || serviceMode === 'delivery') && (
            <button 
              onClick={() => setActiveTab('scan')}
              className={`flex-1 min-w-fit flex items-center justify-center gap-2 py-3 px-4 rounded-[20px] text-sm font-bold transition-all whitespace-nowrap ${
                activeTab === 'scan' ? 'bg-white dark:bg-[#1a1a1a] text-[#1a1a1a] dark:text-white shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              {serviceMode === 'delivery' ? <ShoppingBag className="w-4 h-4" /> : <Scan className="w-4 h-4" />}
              {serviceMode === 'delivery' ? t('shop') : t('scan')}
            </button>
          )}
          
          {(serviceMode === 'staff_portal') && (
            <>
              <button 
                onClick={() => setActiveTab('tasks')}
                className={`flex-1 min-w-fit flex items-center justify-center gap-2 py-3 px-4 rounded-[20px] text-sm font-bold transition-all whitespace-nowrap ${
                  activeTab === 'tasks' ? 'bg-white dark:bg-[#1a1a1a] text-[#1a1a1a] dark:text-white shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                }`}
              >
                <Calendar className="w-4 h-4" />
                {t('tasks')}
              </button>
              <button 
                onClick={() => setActiveTab('monitor')}
                className={`flex-1 min-w-fit flex items-center justify-center gap-2 py-3 px-4 rounded-[20px] text-sm font-bold transition-all whitespace-nowrap ${
                  activeTab === 'monitor' ? 'bg-white dark:bg-[#1a1a1a] text-[#1a1a1a] dark:text-white shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                }`}
              >
                <Eye className="w-4 h-4" />
                {t('monitor')}
              </button>
            </>
          )}

          {(serviceMode === 'pickup' || serviceMode === 'delivery') && (
            <button 
              id="shopping-lists-button"
              onClick={() => setActiveTab('lists')}
              className={`flex-1 min-w-fit flex items-center justify-center gap-2 py-3 px-4 rounded-[20px] text-sm font-bold transition-all whitespace-nowrap ${
                activeTab === 'lists' ? 'bg-white dark:bg-[#1a1a1a] text-[#1a1a1a] dark:text-white shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              <Calendar className="w-4 h-4" />
              {t('my_shopping_lists')}
            </button>
          )}

          {(serviceMode === 'marketplace' || activeTab === 'messages') && (
            <>
              <button 
                id="marketplace-tab"
                onClick={() => setActiveTab('marketplace')}
                className={`flex-1 min-w-fit flex items-center justify-center gap-2 py-3 px-4 rounded-[20px] text-sm font-bold transition-all whitespace-nowrap ${
                  activeTab === 'marketplace' ? 'bg-white dark:bg-[#1a1a1a] text-[#1a1a1a] dark:text-white shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                }`}
              >
                <Globe className="w-4 h-4" />
                {t('marketplace')}
              </button>
              <button 
                onClick={() => setActiveTab('messages')}
                className={`flex-1 min-w-fit flex items-center justify-center gap-2 py-3 px-4 rounded-[20px] text-sm font-bold transition-all whitespace-nowrap ${
                  activeTab === 'messages' ? 'bg-white dark:bg-[#1a1a1a] text-[#1a1a1a] dark:text-white shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                }`}
              >
                <MessageSquare className="w-4 h-4" />
                {t('messages' as any) || 'Nachrichten'}
              </button>
            </>
          )}

          {(serviceMode === 'pickup' || serviceMode === 'delivery') && (
            <button 
              onClick={() => setActiveTab('groups')}
              className={`flex-1 min-w-fit flex items-center justify-center gap-2 py-3 px-4 rounded-[20px] text-sm font-bold transition-all whitespace-nowrap ${
                activeTab === 'groups' ? 'bg-white dark:bg-[#1a1a1a] text-[#1a1a1a] dark:text-white shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              <Users className="w-4 h-4" />
              {t('groups')}
            </button>
          )}

          {(serviceMode === 'pickup' || serviceMode === 'delivery') && activeTab !== 'messages' && (
            <button 
              id="cart-tab"
              onClick={() => setActiveTab('cart')}
              className={`flex-1 min-w-fit flex items-center justify-center gap-2 py-3 px-4 rounded-[20px] text-sm font-bold transition-all whitespace-nowrap ${
                activeTab === 'cart' ? 'bg-white dark:bg-[#1a1a1a] text-[#1a1a1a] dark:text-white shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              <ShoppingBag className="w-4 h-4" />
              {t('cart')}
              {cart.length > 0 && (
                <span className="bg-[#5A5A40] text-white text-[10px] w-4 h-4 rounded-full flex items-center justify-center">
                  {cart.length}
                </span>
              )}
            </button>
          )}
        </div>

        <AnimatePresence mode="wait">
          {activeTab === 'scan' && (
            <motion.div
              key="scan-tab"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="space-y-8"
            >
              <motion.button 
                id="scan-button"
                whileTap={{ scale: 0.95 }}
                onClick={() => setIsScannerOpen(true)}
                className={cn(
                  "w-full bg-white dark:bg-[#1a1a1a] rounded-[40px] p-10 shadow-xl flex flex-col items-center justify-center border-2 border-dashed border-gray-200 dark:border-gray-800 hover:border-[#5A5A40] transition-all group",
                  serviceMode === 'delivery' && "hidden"
                )}
              >
                <div className="w-20 h-20 bg-[#5A5A40]/10 dark:bg-[#5A5A40]/20 rounded-full flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                  <Scan className="w-10 h-10 text-[#5A5A40]" />
                </div>
                <h3 className="text-2xl font-serif font-bold text-[#1a1a1a] dark:text-white mb-2">{t('scan_product')}</h3>
                <p className="text-gray-400 dark:text-gray-500 text-center max-w-[200px]">{t('scan_desc')}</p>
              </motion.button>

              {serviceMode === 'delivery' && (
                <div className="relative">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="text"
                    placeholder={t('search_placeholder')}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full bg-white dark:bg-[#1a1a1a] border border-gray-100 dark:border-gray-800 rounded-2xl py-4 pl-12 pr-4 focus:outline-none focus:ring-2 focus:ring-[#5A5A40]/20 transition-all font-medium dark:text-white"
                  />
                </div>
              )}

              <div className="flex items-center justify-between mb-6">
                <h3 id="product-recommendations" className="text-xl font-serif font-bold text-[#1a1a1a] dark:text-white flex items-center gap-2">
                  <ShoppingBag className="w-6 h-6" />
                  {serviceMode === 'delivery' ? t('available_products') : t('recently_scanned')}
                </h3>
                <div className="flex items-center gap-4">
                  {profile?.role === 'admin' && (
                    <button 
                      onClick={() => {
                        setIsAddingProduct(true);
                        setScannedProduct({
                          id: Math.random().toString(36).substr(2, 9),
                          name: '',
                          brand: '',
                          image: 'https://loremflickr.com/400/400/product',
                          price: 0,
                          category: 'Sonstiges',
                          co2: 0,
                          kcal: 0,
                          proteins: 0,
                          carbs: 0,
                          fat: 0,
                          sugar: 0,
                          ingredients: [],
                          allergens: [],
                          stock: 0
                        });
                      }}
                      className="text-[#5A5A40] text-sm font-bold flex items-center gap-1 hover:underline"
                    >
                      <Plus className="w-4 h-4" /> {t('new')}
                    </button>
                  )}
                  {serviceMode !== 'delivery' && (
                    <button onClick={() => setActiveTab('cart')} className="text-[#5A5A40] text-sm font-bold flex items-center gap-1 hover:underline">
                      {t('view_all')} <ChevronRight className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>

              <div className="space-y-8">
                {loading ? (
                  <div className="bg-white/40 dark:bg-white/5 rounded-[32px] p-12 text-center border border-white/60 dark:border-white/10 transition-colors">
                    <div className="w-8 h-8 border-4 border-[#5A5A40] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                    <p className="text-gray-400 dark:text-gray-500 font-bold uppercase tracking-widest text-[10px]">{t('loading')}</p>
                  </div>
                ) : availableProducts.length === 0 ? (
                  <div className="bg-white/40 dark:bg-white/5 rounded-[40px] p-12 text-center border border-dashed border-gray-300 dark:border-gray-800 transition-colors">
                    <ShoppingBag className="w-16 h-16 text-gray-200 dark:text-gray-800 mx-auto mb-4" />
                    <h3 className="text-xl font-serif font-bold text-gray-900 dark:text-white mb-2">{t('no_products_found')}</h3>
                    <p className="text-gray-400 dark:text-gray-500 mb-6 transition-colors">{t('no_products_desc' as any) || 'Momentan sind keine Produkte im Sortiment verfügbar.'}</p>
                    {profile.role === 'admin' && (
                      <button 
                        onClick={async () => {
                          setLoading(true);
                          await forceUpdateDatabase();
                          await loadProducts();
                        }}
                        className="bg-[#5A5A40] text-white px-6 py-3 rounded-2xl font-bold hover:bg-[#4A4A30] transition-all"
                      >
                        {t('restore_defaults')}
                      </button>
                    )}
                  </div>
                ) : serviceMode === 'delivery' ? (
                  (Object.entries(
                    availableProducts
                      .filter(p => 
                        p.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                        p.brand.toLowerCase().includes(searchQuery.toLowerCase())
                      )
                      .reduce((acc, product) => {
                        const cat = product.category || 'Sonstiges';
                        if (!acc[cat]) acc[cat] = [];
                        acc[cat].push(product);
                        return acc;
                      }, {} as Record<string, Product[]>)
                  ) as [string, Product[]][]).map(([category, categoryProducts]) => {
                    const categoryConfig = CATEGORY_MAP[category] || { icon: HelpCircle, key: 'category_other' };
                    const Icon = categoryConfig.icon;
                    const isExpanded = expandedCategories[category] ?? false;
                    return (
                      <div key={category} className="bg-white/40 dark:bg-white/5 rounded-[32px] p-4 border border-white/60 dark:border-white/10 transition-colors">
                        <button 
                          onClick={() => toggleCategory(category)}
                          className="w-full flex items-center gap-2 mb-0 group"
                        >
                          <div className="w-10 h-10 bg-[#5A5A40]/10 dark:bg-[#5A5A40]/20 rounded-xl flex items-center justify-center text-[#5A5A40] group-hover:scale-110 transition-transform">
                            <Icon className="w-6 h-6" />
                          </div>
                          <h4 className="font-bold text-lg text-[#1a1a1a] dark:text-white flex-1 text-left">{t(categoryConfig.key)}</h4>
                          <div className="flex items-center gap-3">
                            <span className="text-xs font-bold text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded-full transition-colors">
                              {categoryProducts.length}
                            </span>
                            <motion.div
                              animate={{ rotate: isExpanded ? 180 : 0 }}
                              transition={{ duration: 0.3 }}
                            >
                              <ChevronDown className="w-5 h-5 text-gray-400" />
                            </motion.div>
                          </div>
                        </button>
                        
                        <AnimatePresence initial={false}>
                          {isExpanded && (
                            <motion.div
                              initial={{ height: 0, opacity: 0, marginTop: 0 }}
                              animate={{ height: 'auto', opacity: 1, marginTop: 16 }}
                              exit={{ height: 0, opacity: 0, marginTop: 0 }}
                              className="overflow-hidden"
                            >
                              <div className="grid grid-cols-2 gap-4">
                                {categoryProducts.map(product => (
                                  <motion.button
                                    key={product.id}
                                    whileHover={{ y: -5 }}
                                    onClick={() => setScannedProduct(product)}
                                    className="bg-white dark:bg-[#1a1a1a] p-4 rounded-[32px] border border-gray-100 dark:border-gray-800 shadow-sm text-left group transition-colors"
                                  >
                                    <h4 className="font-bold text-sm text-[#1a1a1a] dark:text-white truncate">{product.name}</h4>
                                    <p className="text-[10px] text-gray-400 dark:text-gray-500 mb-2 flex justify-between items-center transition-colors">
                                      <span>{product.brand}</span>
                                      <span className={cn(
                                        "font-black uppercase tracking-tighter",
                                        (product.stock || 0) <= 5 ? "text-orange-500" : "text-gray-300 dark:text-gray-700"
                                      )}>
                                        {(product.stock || 0)} Stk
                                      </span>
                                    </p>
                                    <div className="flex justify-between items-center">
                                      <span className="font-bold text-[#5A5A40] dark:text-[#a0a090]">{product.price.toFixed(2)} €</span>
                                      <div className="w-8 h-8 bg-[#5A5A40] text-white rounded-full flex items-center justify-center">
                                        <Plus className="w-4 h-4" />
                                      </div>
                                    </div>
                                  </motion.button>
                                ))}
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    );
                  })
                ) : (
                  <div className="grid grid-cols-2 gap-4">
                    {cart.slice(0, 2).map(item => (
                      <div key={item.id} className="bg-white dark:bg-[#1a1a1a] p-4 rounded-[32px] border border-gray-100 dark:border-gray-800 shadow-sm transition-colors">
                        <h4 className="font-bold text-sm text-[#1a1a1a] dark:text-white truncate">{item.name}</h4>
                        <p className="text-xs text-gray-400 dark:text-gray-500">{item.brand}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {activeTab === 'lists' && (
            <motion.div
              key="lists-tab"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="space-y-6"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-2xl font-serif font-bold text-[#1a1a1a] dark:text-white transition-colors">
                  {t('my_shopping_lists')}
                </h3>
              </div>

              {shoppingLists.length === 0 ? (
                <div className="bg-white dark:bg-[#1a1a1a] p-12 rounded-[40px] text-center border border-gray-100 dark:border-gray-800 shadow-sm transition-colors">
                  <Package className="w-16 h-16 text-gray-200 dark:text-gray-800 mx-auto mb-4" />
                  <p className="text-gray-400 dark:text-gray-500">{t('no_shopping_lists')}</p>
                </div>
              ) : (
                <div className="grid gap-4">
                  {shoppingLists.map(list => (
                    <div 
                      key={list.id}
                      className="bg-white dark:bg-[#1a1a1a] p-6 rounded-[32px] border border-gray-100 dark:border-gray-800 shadow-sm flex items-center justify-between hover:shadow-md transition-all group"
                    >
                      <div className="flex-1">
                        <h4 className="font-bold text-[#1a1a1a] dark:text-white mb-1 transition-colors">{list.name}</h4>
                        <p className="text-xs text-gray-400 dark:text-gray-500 transition-colors">
                          {list.items.length} {t('items')} • {list.createdAt?.toDate ? list.createdAt.toDate().toLocaleDateString() : 'Gerade jetzt'}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button 
                          onClick={() => handleLoadShoppingList(list)}
                          className="px-4 py-2 bg-[#5A5A40]/10 text-[#5A5A40] rounded-xl font-bold text-xs hover:bg-[#5A5A40] hover:text-white transition-all"
                        >
                          {t('load_list')}
                        </button>
                        <button 
                          onClick={async () => {
                            try {
                              await deleteDoc(doc(db, 'shopping_lists', list.id));
                            } catch (err) {
                              console.error('Error deleting shopping list:', err);
                            }
                          }}
                          className="p-2 text-gray-300 hover:text-red-500 transition-colors"
                        >
                          <Trash2 className="w-5 h-5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          )}

          {activeTab === 'groups' && (
            <motion.div
              key="groups-tab"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="bg-white dark:bg-[#1a1a1a] rounded-[40px] shadow-sm overflow-hidden min-h-[600px] flex flex-col transition-colors"
            >
              <GroupsView 
                onClose={() => setActiveTab('scan')} 
                onAddToCart={(product) => {
                  setCart(prev => {
                    const existing = prev.find(item => item.id === product.id);
                    if (existing) {
                      return prev.map(item => item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item);
                    }
                    return [...prev, { ...product, quantity: 1 }];
                  });
                  setActiveTab('cart');
                }}
                products={availableProducts}
              />
            </motion.div>
          )}

          {activeTab === 'tasks' && serviceMode === 'staff_portal' && (profile.role === 'admin' || profile.role === 'staff') && (
            <motion.div
              key="tasks-tab"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
            >
              <GreenhouseTasks user={profile} />
            </motion.div>
          )}

          {activeTab === 'monitor' && serviceMode === 'staff_portal' && (
            <motion.div
              key="monitor-tab"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
            >
              <GreenhouseMonitor user={profile} />
            </motion.div>
          )}

          {activeTab === 'marketplace' && serviceMode === 'marketplace' && (
            <motion.div
              key="marketplace-tab"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
            >
              <Marketplace 
                userProfile={profile} 
                onContact={(chatId) => {
                  setSelectedChatId(chatId);
                  setActiveTab('messages');
                }} 
              />
            </motion.div>
          )}

          {activeTab === 'messages' && (
            <motion.div
              key="messages-tab"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
            >
              <ChatView 
                userProfile={profile} 
                initialChatId={selectedChatId} 
                onClose={() => setSelectedChatId(null)} 
              />
            </motion.div>
          )}

          {activeTab === 'cart' && (
            <motion.div
              key="cart-tab"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
            >
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-serif font-bold text-[#1a1a1a] dark:text-white flex items-center gap-2 transition-colors">
                  <ShoppingBag className="w-6 h-6" />
                  {t('cart')}
                </h3>
                <span className="bg-[#5A5A40] dark:bg-[#a0a090] text-white dark:text-[#1a1a1a] px-3 py-1 rounded-full text-xs font-bold transition-colors">
                  {cart.length} {t('items')}
                </span>
              </div>
              <CartView 
                items={cart} 
                serviceMode={serviceMode}
                availableProducts={availableProducts}
                onUpdateQuantity={updateQuantity} 
                onUpdateCart={setCart}
                onRemove={removeItem} 
                onCheckout={handleCheckout} 
                onSaveShoppingList={handleSaveShoppingList}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </>
    )}

      {/* Floating Scan Button for mobile */}
      {serviceMode && serviceMode !== 'delivery' && activeTab === 'scan' && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-40">
          <motion.button 
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setIsScannerOpen(true)}
            className="bg-[#5A5A40] text-white px-8 py-4 rounded-full shadow-2xl flex items-center gap-3 font-bold"
          >
            <Scan className="w-6 h-6" />
            {t('scan')}
          </motion.button>
        </div>
      )}

      <AnimatePresence>
        {isScannerOpen && (
          <Scanner onScan={handleScan} onClose={() => setIsScannerOpen(false)} />
        )}
        {scannedProduct && (
          <ProductDetail 
            product={scannedProduct} 
            serviceMode={serviceMode!}
            userProfile={profile!} 
            onAdd={addToCart} 
            onCancel={() => {
              setScannedProduct(null);
              setIsAddingProduct(false);
            }} 
            onUpdate={loadProducts}
            initialEditMode={isAddingProduct}
          />
        )}
        {isProfileOpen && (
          <ProfileSettings profile={profile} onClose={() => setIsProfileOpen(false)} />
        )}
        {isAdminOpen && (
          <AdminPanel 
            onClose={() => setIsAdminOpen(false)} 
            onEditProduct={(product) => {
              setScannedProduct(product);
              setIsAddingProduct(false);
              setIsAdminOpen(false);
            }}
            onNewProduct={() => {
              setIsAddingProduct(true);
              setScannedProduct({
                id: Math.random().toString(36).substr(2, 9),
                name: '',
                brand: '',
                image: 'https://loremflickr.com/400/400/product',
                price: 0,
                co2: 0,
                kcal: 0,
                proteins: 0,
                carbs: 0,
                fat: 0,
                sugar: 0,
                ingredients: [],
                allergens: []
              });
              setIsAdminOpen(false);
            }}
          />
        )}
      </AnimatePresence>

      {loading && (
        <div className="fixed inset-0 z-[60] bg-black/20 backdrop-blur-sm flex items-center justify-center">
          <div className="bg-white p-6 rounded-3xl shadow-xl flex items-center gap-4">
            <div className="w-6 h-6 border-4 border-[#5A5A40] border-t-transparent rounded-full animate-spin"></div>
            <span className="font-bold">{t('loading')}</span>
          </div>
        </div>
      )}

      {/* AI Assistant */}
      <AIChatAssistant 
        userProfile={profile} 
        currentCart={cart}
        onSaveCart={handleSaveShoppingList}
      />

      <BernardTutorial 
        isOpen={isTutorialOpen} 
        onComplete={completeTutorial} 
        onStepChange={handleTutorialStepChange}
      />
    </div>
  );
}
