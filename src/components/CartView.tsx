import { useState, useMemo } from 'react';
import { CartItem, ServiceMode, Product } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { Trash2, Plus, Minus, ShoppingCart, Leaf, Zap, Globe, Store, CheckCircle2, Truck, Package, Info, X, Sparkles, RefreshCw, Calculator } from 'lucide-react';
import { useTranslation } from '../lib/LanguageContext';

interface CartViewProps {
  items: CartItem[];
  serviceMode: ServiceMode | null;
  availableProducts: Product[];
  onUpdateQuantity: (id: string, delta: number) => void;
  onUpdateCart: (items: CartItem[]) => void;
  onRemove: (id: string) => void;
  onCheckout: (type: 'online' | 'instore', co2Fee?: number) => void;
  onSaveShoppingList: (name: string) => Promise<void>;
}

type OptimizationMode = 'price' | 'co2' | 'balanced';

export default function CartView({ items, serviceMode, availableProducts, onUpdateQuantity, onUpdateCart, onRemove, onCheckout, onSaveShoppingList }: CartViewProps) {
  const { t } = useTranslation();
  const [orderType, setOrderType] = useState<'online' | 'instore' | null>(null);
  const [isCompensating, setIsCompensating] = useState(false);
  const [showCo2Info, setShowCo2Info] = useState(false);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [listName, setListName] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [optimizationMode, setOptimizationMode] = useState<OptimizationMode | null>(null);

  const totalPrice = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const totalKcal = items.reduce((sum, item) => sum + item.kcal * item.quantity, 0);
  const totalCo2 = items.reduce((sum, item) => sum + item.co2 * item.quantity, 0);
  
  const co2CompensationFee = totalCo2 * 0.15; // 0.15€ per kg CO2
  const finalPrice = totalPrice + (isCompensating ? co2CompensationFee : 0);

  // Optimization Logic
  const suggestedCart = useMemo(() => {
    if (!optimizationMode) return null;

    const newItems = items.map(item => {
      // Find within same subCategory ONLY for realistic matches
      const alternatives = availableProducts.filter(p => {
        if (item.subCategory && p.subCategory) {
          return p.subCategory === item.subCategory && p.id !== item.id;
        }
        // If subCategory is missing, we don't have enough granularity for a safe replacement
        return false;
      });
      
      let bestMatch = item as Product;

      alternatives.forEach(alt => {
        if (optimizationMode === 'price') {
          if (alt.price < bestMatch.price) bestMatch = alt;
        } else if (optimizationMode === 'co2') {
          if (alt.co2 < bestMatch.co2) bestMatch = alt;
        } else if (optimizationMode === 'balanced') {
          // Heuristic: lower price AND lower co2/equal co2 or significantly lower one
          const currentScore = bestMatch.price * (1 + bestMatch.co2);
          const altScore = alt.price * (1 + alt.co2);
          if (altScore < currentScore) bestMatch = alt;
        }
      });

      return { ...bestMatch, quantity: item.quantity } as CartItem;
    });

    // Only return if any items actually changed
    const itemsChanged = newItems.some((item, index) => item.id !== items[index].id);
    return itemsChanged ? newItems : null;
  }, [items, optimizationMode, availableProducts]);

  const savingsSummary = useMemo(() => {
    if (!suggestedCart) return null;
    const sPrice = suggestedCart.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const sCo2 = suggestedCart.reduce((sum, item) => sum + item.co2 * item.quantity, 0);
    
    return {
      price: totalPrice - sPrice,
      co2: totalCo2 - sCo2
    };
  }, [suggestedCart, totalPrice, totalCo2]);

  const handleApplyOptimization = () => {
    if (suggestedCart) {
      onUpdateCart(suggestedCart);
      setOptimizationMode(null);
    }
  };

  const handleSaveList = async () => {
    if (!listName.trim()) return;
    setIsSaving(true);
    try {
      await onSaveShoppingList(listName);
      setShowSaveModal(false);
      setListName('');
    } finally {
      setIsSaving(false);
    }
  };

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-gray-400">
        <ShoppingCart className="w-16 h-16 mb-4 opacity-20" />
        <p className="text-lg">{t('cart_empty')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Action Header */}
      <div className="flex items-center justify-between px-2">
        <h3 className="font-serif font-bold text-xl text-[#1a1a1a] dark:text-white transition-colors">{t('cart')}</h3>
        <button 
          onClick={() => setShowSaveModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-[#5A5A40]/10 dark:bg-[#5A5A40]/20 hover:bg-[#5A5A40]/20 dark:hover:bg-[#5A5A40]/30 rounded-xl text-xs font-bold text-[#5A5A40] dark:text-[#a0a090] transition-all border border-[#5A5A40]/10 dark:border-[#5A5A40]/30"
        >
          <Plus className="w-4 h-4" />
          {t('save_as_shopping_list')}
        </button>
      </div>

      {/* Cart Optimization Suggestions */}
      <div className="bg-white dark:bg-[#1a1a1a] p-6 rounded-[32px] border border-gray-100 dark:border-gray-800 shadow-sm space-y-6 transition-colors">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-indigo-50 dark:bg-indigo-500/10 rounded-2xl flex items-center justify-center transition-colors">
            <Sparkles className="w-5 h-5 text-indigo-500" />
          </div>
          <div>
            <h3 className="font-serif font-bold text-lg text-[#1a1a1a] dark:text-white transition-colors">{t('optimize_cart_title')}</h3>
            <p className="text-xs text-gray-400 dark:text-gray-500 transition-colors">{t('optimize_cart_desc')}</p>
          </div>
        </div>

        <div className="flex gap-2">
          {(['price', 'co2', 'balanced'] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => setOptimizationMode(prev => prev === mode ? null : mode)}
              className={`flex-1 py-3 px-2 rounded-2xl text-[10px] font-black uppercase tracking-wider transition-all border ${
                optimizationMode === mode 
                  ? 'bg-indigo-600 text-white border-indigo-600 shadow-lg' 
                  : 'bg-gray-50 dark:bg-white/5 text-gray-500 dark:text-gray-400 border-gray-100 dark:border-gray-800 hover:border-indigo-200'
              }`}
            >
              {t(`optimize_for_${mode}` as any)}
            </button>
          ))}
        </div>

        <AnimatePresence>
          {optimizationMode && suggestedCart && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="bg-indigo-50/50 dark:bg-indigo-500/10 rounded-3xl p-6 border border-indigo-100 dark:border-indigo-500/20 space-y-4 transition-colors">
                <div className="flex items-center justify-between text-indigo-800 dark:text-indigo-400 font-bold">
                  <span className="flex items-center gap-2">
                    <Calculator className="w-4 h-4" />
                    {t('optimization_savings')}
                  </span>
                  <div className="flex gap-4 text-sm">
                    {savingsSummary && savingsSummary.price > 0 && (
                      <span className="text-emerald-600">-{savingsSummary.price.toFixed(2)} €</span>
                    )}
                    {savingsSummary && savingsSummary.co2 > 0 && (
                      <span className="text-blue-600">-{savingsSummary.co2.toFixed(3)} {t('kg_co2')}</span>
                    )}
                  </div>
                </div>

                <div className="space-y-3">
                  {items.map((item, idx) => {
                    const suggested = suggestedCart[idx];
                    if (item.id === suggested.id) return null;
                    return (
                      <div key={item.id} className="flex items-center justify-between gap-4 p-3 bg-white dark:bg-[#121212] rounded-2xl border border-indigo-100/50 dark:border-indigo-500/10 transition-colors">
                        <div className="flex items-center gap-3">
                          <div className="flex flex-col">
                            <span className="text-[10px] text-gray-400 dark:text-gray-600 font-bold uppercase line-through">{item.name}</span>
                            <span className="text-xs font-bold text-[#1a1a1a] dark:text-white">{suggested.name}</span>
                          </div>
                        </div>
                        <div className="text-right">
                          <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400">{suggested.price.toFixed(2)} €</span>
                          <div className="text-[9px] text-emerald-500 opacity-70">
                            {suggested.co2 < item.co2 ? `-${(item.co2 - suggested.co2).toFixed(3)} CO2` : ''}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <button
                  onClick={handleApplyOptimization}
                  className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-bold flex items-center justify-center gap-2 shadow-lg hover:bg-indigo-700 transition-all"
                >
                  <RefreshCw className="w-4 h-4" />
                  {t('apply_optimization')}
                </button>
              </div>
            </motion.div>
          )}

          {optimizationMode && !suggestedCart && (
            <motion.p 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-center text-xs text-gray-400 italic py-2"
            >
              {t('already_optimized' as any) || 'Dein Warenkorb ist für diesen Modus bereits ideal.'}
            </motion.p>
          )}
        </AnimatePresence>
      </div>

      <div className="space-y-4">
        {items.map((item) => (
          <motion.div 
            layout
            key={item.id}
            className="bg-white dark:bg-[#1a1a1a] p-4 rounded-3xl flex items-center gap-4 shadow-sm transition-colors border border-gray-100 dark:border-gray-800 hover:shadow-md"
          >
            <div className="flex-1">
              <h4 className="font-bold text-[#1a1a1a] dark:text-white line-clamp-1 transition-colors">{item.name}</h4>
              <p className="text-sm text-gray-500 dark:text-gray-400 transition-colors">{item.brand}</p>
              <p className="font-bold text-[#5A5A40] dark:text-[#a0a090] mt-1 transition-colors">{item.price.toFixed(2)} €</p>
            </div>
            <div className="flex items-center gap-3 bg-gray-50 dark:bg-white/5 p-1 rounded-xl transition-colors">
              <button 
                onClick={() => onUpdateQuantity(item.id, -1)}
                className="p-1 hover:bg-white dark:hover:bg-white/10 rounded-lg text-gray-400 dark:text-gray-500 transition-all"
              >
                <Minus className="w-4 h-4" />
              </button>
              <span className="font-bold w-4 text-center dark:text-white">{item.quantity}</span>
              <button 
                onClick={() => onUpdateQuantity(item.id, 1)}
                className="p-1 hover:bg-white dark:hover:bg-white/10 rounded-lg text-gray-400 dark:text-gray-500 transition-all"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
            <button 
              onClick={() => onRemove(item.id)}
              className="p-2 text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-xl transition-all"
            >
              <Trash2 className="w-5 h-5" />
            </button>
          </motion.div>
        ))}
      </div>

      {/* CO2 Compensation Card */}
      <div className="bg-emerald-50 dark:bg-emerald-500/5 p-6 rounded-[32px] border border-emerald-100 dark:border-emerald-500/20 shadow-sm space-y-4 transition-colors">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <Leaf className="w-5 h-5 text-emerald-600" />
              <h3 className="font-serif font-bold text-emerald-800 dark:text-emerald-500 transition-colors">{t('co2_compensation')}</h3>
            </div>
            <p className="text-xs text-emerald-700/70 dark:text-gray-400 leading-relaxed mb-3 transition-colors">
              {t('co2_compensation_desc')}
            </p>
            <button 
              onClick={() => setShowCo2Info(true)}
              className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-emerald-600 hover:text-emerald-700 transition-colors"
            >
              <Info className="w-3 h-3" />
              {t('co2_compensation_info')}
            </button>
          </div>
          <button 
            onClick={() => setIsCompensating(!isCompensating)}
            className={`px-4 py-2 rounded-2xl font-bold text-xs transition-all ${
              isCompensating 
                ? 'bg-emerald-600 text-white shadow-lg' 
                : 'bg-white dark:bg-white/5 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/30'
            }`}
          >
            {isCompensating ? <CheckCircle2 className="w-4 h-4 inline mr-1" /> : null}
            {isCompensating ? t('signed_up') : t('co2_compensate_now')}
            {!isCompensating && ` (+${co2CompensationFee.toFixed(2)}€)`}
          </button>
        </div>
      </div>

      <div className="bg-white dark:bg-[#1a1a1a] p-6 rounded-[32px] border border-gray-100 dark:border-gray-800 shadow-sm space-y-4 transition-colors">
        <h3 className="font-serif font-bold text-lg text-[#1a1a1a] dark:text-white transition-colors">{t('choose_order_type')}</h3>
        <div className="grid grid-cols-2 gap-4">
          <button
            onClick={() => setOrderType('online')}
            className={`flex flex-col items-center gap-3 p-6 rounded-[24px] border-2 transition-all ${
              orderType === 'online' 
                ? 'border-[#5A5A40] bg-[#5A5A40]/10 text-[#5A5A40]' 
                : 'border-gray-100 dark:border-gray-800 hover:border-gray-200 dark:hover:border-white/10 text-gray-400 dark:text-gray-500'
            }`}
          >
            {serviceMode === 'delivery' ? <Truck className="w-8 h-8" /> : <Package className="w-8 h-8" />}
            <span className="font-bold text-sm">
              {serviceMode === 'delivery' ? t('order_delivery') : t('order_pickup')}
            </span>
            {orderType === 'online' && <CheckCircle2 className="w-4 h-4" />}
          </button>
          <button
            onClick={() => setOrderType('instore')}
            className={`flex flex-col items-center gap-3 p-6 rounded-[24px] border-2 transition-all ${
              orderType === 'instore' 
                ? 'border-[#5A5A40] bg-[#5A5A40]/10 text-[#5A5A40]' 
                : 'border-gray-100 dark:border-gray-800 hover:border-gray-200 dark:hover:border-white/10 text-gray-400 dark:text-gray-500'
            }`}
          >
            <Store className="w-8 h-8" />
            <span className="font-bold text-sm">{t('instore_payment')}</span>
            {orderType === 'instore' && <CheckCircle2 className="w-4 h-4" />}
          </button>
        </div>
      </div>

      <div className="bg-[#5A5A40] text-white p-8 rounded-[32px] shadow-xl relative overflow-hidden group transition-all">
        <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:scale-110 transition-transform">
          <Calculator className="w-32 h-32 rotate-12" />
        </div>
        <div className="relative z-10">
          <div className="grid grid-cols-2 gap-6 mb-8">
            <div>
              <div className="flex items-center gap-2 opacity-60 mb-1">
                <Zap className="w-4 h-4" />
                <span className="text-[10px] font-bold uppercase tracking-wider">{t('total_kcal')}</span>
              </div>
              <p className="text-2xl font-bold">{totalKcal.toFixed(0)} kcal</p>
            </div>
            <div>
              <div className="flex items-center gap-2 opacity-60 mb-1">
                <Leaf className="w-4 h-4" />
                <span className="text-[10px] font-bold uppercase tracking-wider">{t('total_co2')}</span>
              </div>
              <p className="text-2xl font-bold">{totalCo2.toFixed(2)} kg</p>
            </div>
          </div>

          <div className="flex flex-col border-t border-white/20 pt-6 mb-8 gap-2 transition-colors">
            {isCompensating && (
              <div className="flex justify-between items-center text-sm opacity-60 italic">
                <span>{t('co2_compensation')}</span>
                <span>+{co2CompensationFee.toFixed(2)} €</span>
              </div>
            )}
            <div className="flex justify-between items-end mb-4">
              <span className="text-lg opacity-80">{t('total_price')}</span>
              <span className="text-4xl font-bold">{finalPrice.toFixed(2)} €</span>
            </div>
          </div>

          <button 
            onClick={() => {
              if (orderType) {
                onCheckout(orderType, isCompensating ? co2CompensationFee : 0);
              }
            }}
            disabled={!orderType}
            className={`w-full py-5 rounded-2xl font-bold text-lg transition-all shadow-lg ${
              orderType 
                ? 'bg-white text-[#5A5A40] hover:bg-gray-100' 
                : 'bg-white/20 text-white/40 cursor-not-allowed'
            }`}
          >
            {orderType === 'online' ? t('finish_online') : orderType === 'instore' ? t('pay_instore') : t('choose_order_type')}
          </button>
        </div>
      </div>

      {/* Save Modal */}
      <AnimatePresence>
        {showSaveModal && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowSaveModal(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="relative w-full max-w-sm bg-white dark:bg-[#1a1a1a] rounded-[40px] p-8 shadow-2xl space-y-6 transition-colors"
            >
              <h3 className="text-xl font-bold text-[#1a1a1a] dark:text-white transition-colors">{t('save_as_shopping_list')}</h3>
              <div className="space-y-4">
                <input 
                  type="text" 
                  value={listName}
                  onChange={(e) => setListName(e.target.value)}
                  placeholder={t('shopping_list_name')}
                  className="w-full px-5 py-4 bg-gray-50 dark:bg-[#121212] dark:text-white rounded-2xl border-none focus:ring-2 focus:ring-[#5A5A40] outline-none transition-all"
                  autoFocus
                />
                <div className="flex gap-4 pt-4">
                  <button 
                    onClick={() => setShowSaveModal(false)}
                    className="flex-1 py-4 bg-gray-100 dark:bg-white/5 rounded-2xl font-bold text-gray-500 dark:text-gray-400"
                  >
                    {t('cancel')}
                  </button>
                  <button 
                    onClick={handleSaveList}
                    disabled={!listName.trim() || isSaving}
                    className="flex-1 py-4 bg-[#5A5A40] text-white rounded-2xl font-bold shadow-lg disabled:opacity-50"
                  >
                    {isSaving ? t('saving') : t('save')}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* CO2 Info Modal */}
      <AnimatePresence>
        {showCo2Info && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowCo2Info(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="relative w-full max-w-md bg-white dark:bg-[#1a1a1a] rounded-[40px] p-8 shadow-2xl space-y-6 transition-colors"
            >
              <button 
                onClick={() => setShowCo2Info(false)}
                className="absolute top-6 right-6 p-2 hover:bg-gray-100 dark:hover:bg-white/5 rounded-full transition-all"
              >
                <X className="w-6 h-6 text-gray-400 dark:text-gray-500" />
              </button>

              <div className="w-16 h-16 bg-emerald-50 dark:bg-emerald-500/10 rounded-3xl flex items-center justify-center mb-6">
                <Globe className="w-8 h-8 text-emerald-500 animate-pulse" />
              </div>

              <div className="space-y-4">
                <h3 className="text-2xl font-serif font-bold text-[#1a1a1a] dark:text-white transition-colors">
                  {t('co2_info_title')}
                </h3>
                <p className="text-gray-600 dark:text-gray-400 leading-relaxed transition-colors">
                  {t('co2_info_text')}
                </p>
              </div>

              <div className="pt-4">
                <button 
                  onClick={() => setShowCo2Info(false)}
                  className="w-full py-4 bg-[#5A5A40] text-white rounded-2xl font-bold hover:bg-[#4a4a35] transition-all"
                >
                  Verstanden
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
