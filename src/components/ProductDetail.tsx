import React, { useState } from 'react';
import { Product, UserProfile, ServiceMode } from '../types';
import { checkProfileMatch } from '../services/productService';
import { motion } from 'motion/react';
import { X, CheckCircle2, AlertCircle, Leaf, Zap, Droplets, Cookie, Edit2, Save, Trash2, ShoppingCart, Info, DollarSign, Sparkles, Package, Users } from 'lucide-react';
import { cn } from '../lib/utils';
import { db, auth } from '../firebase';
import { doc, updateDoc, serverTimestamp, deleteDoc, setDoc, collection, query, where, getDocs, addDoc } from 'firebase/firestore';
import { GoogleGenAI } from "@google/genai";
import { useTranslation } from '../lib/LanguageContext';
import { handleFirestoreError, OperationType } from '../lib/firestore-errors';

interface ProductDetailProps {
  product: Product;
  serviceMode: ServiceMode | null;
  userProfile: UserProfile;
  onAdd: (updatedProduct?: Product) => void;
  onCancel: () => void;
  onUpdate?: () => void;
  initialEditMode?: boolean;
}

export default function ProductDetail({ product, serviceMode, userProfile, onAdd, onCancel, onUpdate, initialEditMode = false }: ProductDetailProps) {
  const { t } = useTranslation();
  const [isEditing, setIsEditing] = useState(initialEditMode);
  const [editedProduct, setEditedProduct] = useState(product);
  const [isSaving, setIsSaving] = useState(false);
  const [currentProduct, setCurrentProduct] = useState(product);
  const [groups, setGroups] = useState<any[]>([]);
  const [showGroupSelect, setShowGroupSelect] = useState(false);
  const [isRequesting, setIsRequesting] = useState(false);

  const fetchGroups = async () => {
    if (!auth.currentUser) return;
    try {
      const q = query(collection(db, 'groups'), where('members', 'array-contains', auth.currentUser.uid));
      const snapshot = await getDocs(q);
      setGroups(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, 'groups');
    }
  };

  const handleAskGroup = async (groupId: string) => {
    if (!auth.currentUser) return;
    setIsRequesting(true);
    try {
      const group = groups.find(g => g.id === groupId);
      if (!group) return;

      await addDoc(collection(db, 'purchase_requests'), {
        groupId,
        memberIds: group.members,
        requesterId: auth.currentUser.uid,
        requesterName: userProfile.name,
        productId: currentProduct.id,
        productName: currentProduct.name,
        status: 'pending',
        approvals: [],
        rejections: [],
        createdAt: serverTimestamp()
      });
      alert(t('request_sent' as any));
      setShowGroupSelect(false);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'purchase_requests');
    } finally {
      setIsRequesting(false);
    }
  };

  const matchResult = checkProfileMatch(currentProduct, userProfile.dietaryProfile);
  const isAdmin = userProfile.role === 'admin';

  const handleSave = async () => {
    setIsSaving(true);
    try {
      // If ID changed, delete the old one
      if (editedProduct.id !== currentProduct.id) {
        await deleteDoc(doc(db, 'products', currentProduct.id));
      }

      await setDoc(doc(db, 'products', editedProduct.id), {
        ...editedProduct,
        updatedAt: serverTimestamp()
      });
      setCurrentProduct(editedProduct);
      setIsEditing(false);
      onUpdate?.();
    } catch (err) {
      console.error('Error updating product:', err);
      alert(t('save_error'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm(t('delete_confirm'))) return;
    setIsSaving(true);
    try {
      await deleteDoc(doc(db, 'products', currentProduct.id));
      onUpdate?.();
      onCancel();
    } catch (err) {
      console.error('Error deleting product:', err);
      alert(t('delete_error'));
    } finally {
      setIsSaving(false);
    }
  };

  const updateField = (field: keyof Product, value: any) => {
    setEditedProduct(prev => ({ ...prev, [field]: value }));
  };

  const generateAIImage = async () => {
    if (!editedProduct.name) {
      alert(t('ai_image_name_prompt'));
      return;
    }
    setIsSaving(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
      const promptText = `Find a high-quality product image URL for: ${editedProduct.name} ${editedProduct.brand}. White background. Return ONLY direct URL.`;
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: promptText,
        config: {
          tools: [{ googleSearch: {} }]
        }
      });
      
      const text = response.text.trim();
      const urlMatch = text.match(/https?:\/\/[^\s"']+/);
      const groundingUrl = response.candidates?.[0]?.groundingMetadata?.groundingChunks?.[0]?.web?.uri;
      
      let finalUrl = urlMatch ? urlMatch[0] : groundingUrl;

      if (finalUrl) {
        if (finalUrl.match(/\.(jpg|jpeg|png|webp|gif)/i)) {
          updateField('image', finalUrl);
        } else if (finalUrl.includes('edeka24.de')) {
          const barcodeMatch = finalUrl.match(/\d{8,13}/);
          if (barcodeMatch) {
            updateField('image', `https://www.edeka24.de/out/pictures/generated/product/1/380_340_75/${barcodeMatch[0]}.jpg`);
          } else {
            updateField('image', finalUrl);
          }
        } else {
          updateField('image', finalUrl);
        }
      } else {
        throw new Error('No URL found');
      }
    } catch (err) {
      console.error('AI Image generation error:', err);
      alert(t('ai_image_error'));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm">
      <motion.div 
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        className="w-full max-w-2xl bg-white dark:bg-[#1a1a1a] rounded-t-[40px] sm:rounded-[40px] overflow-hidden flex flex-col max-h-[90vh] relative transition-colors"
      >
        <button 
          onClick={onCancel}
          className="absolute top-6 right-6 p-2 bg-white/80 dark:bg-white/10 backdrop-blur rounded-full shadow-lg z-10 transition-colors"
          title={t('close')}
        >
          <X className="w-6 h-6 dark:text-white" />
        </button>

        <div className="flex-1 overflow-y-auto p-8">
          {isEditing ? (
            <div className="space-y-4 mb-6">
              <div>
                <label className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase">{t('barcode_id')}</label>
                <input 
                  type="text" 
                  value={editedProduct.id}
                  onChange={(e) => updateField('id', e.target.value)}
                  className="w-full bg-gray-50 dark:bg-white/5 dark:text-white rounded-xl p-3 border dark:border-gray-800 font-bold transition-colors"
                  placeholder="EAN-13 Barcode"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase">{t('category')}</label>
                <select 
                  value={editedProduct.category}
                  onChange={(e) => updateField('category', e.target.value)}
                  className="w-full bg-gray-50 dark:bg-white/5 dark:text-white rounded-xl p-3 border dark:border-gray-800 font-bold transition-colors"
                >
                  <option value="Snacks & Süßes">{t('category_snacks')}</option>
                  <option value="Getränke">{t('category_drinks')}</option>
                  <option value="Obst & Gemüse">{t('category_produce')}</option>
                  <option value="Milchprodukte">{t('category_dairy')}</option>
                  <option value="Bäckerei">{t('category_bakery')}</option>
                  <option value="Tiefkühl">{t('category_frozen')}</option>
                  <option value="Sonstiges">{t('category_other')}</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase">{t('brand')}</label>
                <input 
                  type="text" 
                  value={editedProduct.brand}
                  onChange={(e) => updateField('brand', e.target.value)}
                  className="w-full bg-gray-50 dark:bg-white/5 dark:text-white rounded-xl p-3 border dark:border-gray-800 font-bold transition-colors"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase">{t('name')}</label>
                <input 
                  type="text" 
                  value={editedProduct.name}
                  onChange={(e) => updateField('name', e.target.value)}
                  className="w-full bg-gray-50 dark:bg-white/5 dark:text-white rounded-xl p-3 border dark:border-gray-800 font-bold transition-colors"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase">{t('description')}</label>
                <textarea 
                  value={editedProduct.description || ''}
                  onChange={(e) => updateField('description', e.target.value)}
                  className="w-full bg-gray-50 dark:bg-white/5 dark:text-white rounded-xl p-3 border dark:border-gray-800 text-sm min-h-[80px] transition-colors"
                  placeholder="Automatisierte SEO-Beschreibung..."
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase">{t('price')}</label>
                  <input 
                    type="number" 
                    step="0.01"
                    value={editedProduct.price}
                    onChange={(e) => updateField('price', parseFloat(e.target.value))}
                    className="w-full bg-gray-50 dark:bg-white/5 dark:text-white rounded-xl p-3 border dark:border-gray-800 font-bold transition-colors"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase">Lagerbestand</label>
                  <input 
                    type="number" 
                    value={editedProduct.stock}
                    onChange={(e) => updateField('stock', parseInt(e.target.value))}
                    className="w-full bg-gray-50 dark:bg-white/5 dark:text-white rounded-xl p-3 border dark:border-gray-800 font-bold transition-colors"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase">CO₂ (kg)</label>
                <input 
                  type="number" 
                  step="0.1"
                  value={editedProduct.co2}
                  onChange={(e) => updateField('co2', parseFloat(e.target.value))}
                  className="w-full bg-gray-50 dark:bg-white/5 dark:text-white rounded-xl p-3 border dark:border-gray-800 font-bold transition-colors"
                />
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                <div>
                  <label className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase">{t('kcal')}</label>
                  <input 
                    type="number" 
                    value={editedProduct.kcal}
                    onChange={(e) => updateField('kcal', parseInt(e.target.value))}
                    className="w-full bg-gray-50 dark:bg-white/5 dark:text-white rounded-xl p-3 border dark:border-gray-800 font-bold transition-colors"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase">{t('protein')}</label>
                  <input 
                    type="number" 
                    step="0.1"
                    value={editedProduct.proteins}
                    onChange={(e) => updateField('proteins', parseFloat(e.target.value))}
                    className="w-full bg-gray-50 dark:bg-white/5 dark:text-white rounded-xl p-3 border dark:border-gray-800 font-bold transition-colors"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase">{t('sugar')}</label>
                  <input 
                    type="number" 
                    step="0.1"
                    value={editedProduct.sugar}
                    onChange={(e) => updateField('sugar', parseFloat(e.target.value))}
                    className="w-full bg-gray-50 dark:bg-white/5 dark:text-white rounded-xl p-3 border dark:border-gray-800 font-bold transition-colors"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase">{t('fat')}</label>
                  <input 
                    type="number" 
                    step="0.1"
                    value={editedProduct.fat}
                    onChange={(e) => updateField('fat', parseFloat(e.target.value))}
                    className="w-full bg-gray-50 dark:bg-white/5 dark:text-white rounded-xl p-3 border dark:border-gray-800 font-bold transition-colors"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase">{t('carbs')}</label>
                  <input 
                    type="number" 
                    step="0.1"
                    value={editedProduct.carbs}
                    onChange={(e) => updateField('carbs', parseFloat(e.target.value))}
                    className="w-full bg-gray-50 dark:bg-white/5 dark:text-white rounded-xl p-3 border dark:border-gray-800 font-bold transition-colors"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase">{t('ingredients')}</label>
                <textarea 
                  value={(editedProduct.ingredients || []).join(', ')}
                  onChange={(e) => updateField('ingredients', e.target.value.split(',').map(i => i.trim()))}
                  className="w-full bg-gray-50 dark:bg-white/5 dark:text-white rounded-xl p-3 border dark:border-gray-800 text-sm min-h-[100px] transition-colors"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase">{t('allergens')}</label>
                <input 
                  type="text"
                  value={(editedProduct.allergens || []).join(', ')}
                  onChange={(e) => updateField('allergens', e.target.value.split(',').map(i => i.trim()))}
                  className="w-full bg-gray-50 dark:bg-white/5 dark:text-white rounded-xl p-3 border dark:border-gray-800 text-sm transition-colors"
                />
              </div>
              <div className="flex gap-2 pt-4">
                <button 
                  onClick={() => {
                    setIsEditing(false);
                    setEditedProduct(currentProduct);
                  }}
                  className="flex-1 py-3 rounded-xl font-bold text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-white/5 transition-colors"
                >
                  {t('cancel')}
                </button>
                <button 
                  onClick={handleSave}
                  disabled={isSaving}
                  className="flex-1 py-3 bg-[#5A5A40] text-white rounded-xl font-bold disabled:opacity-50"
                >
                  {isSaving ? t('saving') : t('save')}
                </button>
                <button 
                  onClick={handleDelete}
                  disabled={isSaving}
                  className="bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 rounded-xl p-3 font-bold flex items-center justify-center gap-2 hover:bg-red-100 dark:hover:bg-red-500/20 transition-all disabled:opacity-50"
                  title="Produkt löschen"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="flex justify-between items-start mb-6">
                <div>
                  <p className="text-sm font-bold text-[#5A5A40] dark:text-[#a0a090] uppercase tracking-wider transition-colors">{currentProduct.brand}</p>
                  <h2 className="text-3xl font-serif font-bold text-[#1a1a1a] dark:text-white transition-colors">{currentProduct.name}</h2>
                </div>
                <div className="text-right">
                  <div className="flex flex-col items-end">
                    <div className="flex items-center gap-2">
                      <p className="text-3xl font-bold text-[#1a1a1a] dark:text-white transition-colors">{currentProduct.price.toFixed(2)} €</p>
                      {isAdmin && (
                        <button 
                          onClick={() => setIsEditing(true)}
                          className="p-2 text-gray-400 dark:text-gray-600 hover:text-[#5A5A40] dark:hover:text-[#a0a090] transition-colors"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                    <p className="text-sm text-gray-500 dark:text-gray-400 flex items-center justify-end gap-1 transition-colors">
                      <Leaf className="w-4 h-4 text-emerald-500" />
                      {currentProduct.co2} kg CO₂
                    </p>
                  </div>
                </div>
              </div>

              <div className="mb-6">
                <p className="text-gray-600 dark:text-gray-400 text-sm italic leading-relaxed bg-[#5A5A40]/5 dark:bg-[#5A5A40]/10 p-4 rounded-2xl border border-[#5A5A40]/10 dark:border-[#5A5A40]/20 transition-colors">
                  {currentProduct.description}
                </p>
              </div>

              <div className={cn(
                "p-6 rounded-3xl flex items-center gap-4 mb-8 transition-colors",
                matchResult.matches ? "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-800 dark:text-emerald-400" : "bg-red-50 dark:bg-red-500/10 text-red-800 dark:text-red-400"
              )}>
                {matchResult.matches ? (
                  <>
                    <CheckCircle2 className="w-8 h-8 flex-shrink-0" />
                    <div>
                      <p className="font-bold">{t('matches_profile')}</p>
                      <p className="text-sm opacity-80">{t('matches_profile_desc')}</p>
                    </div>
                  </>
                ) : (
                  <>
                    <AlertCircle className="w-8 h-8 flex-shrink-0" />
                    <div>
                      <p className="font-bold">{t('warning')}</p>
                      <p className="text-sm opacity-80">{matchResult.reason}</p>
                    </div>
                  </>
                )}
              </div>
            </>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 mb-8">
            <NutrientCard icon={<Zap className="w-4 h-4" />} label={t('energy')} value={`${currentProduct.kcal} kcal`} />
            <NutrientCard icon={<Droplets className="w-4 h-4" />} label={t('protein')} value={`${currentProduct.proteins}g`} />
            <NutrientCard icon={<Cookie className="w-4 h-4" />} label={t('sugar')} value={`${currentProduct.sugar}g`} />
            <NutrientCard icon={<Droplets className="w-4 h-4" />} label={t('fat')} value={`${currentProduct.fat}g`} />
            <NutrientCard 
              icon={<Package className="w-4 h-4" />} 
              label="Bestand" 
              value={`${currentProduct.stock || 0} Stk.`} 
              highlight={currentProduct.stock !== undefined && currentProduct.stock <= 5}
            />
          </div>

          <div className="mb-8">
            <h3 className="font-bold text-lg mb-3 dark:text-white transition-colors">{t('ingredients')}</h3>
            <p className="text-gray-600 dark:text-gray-400 leading-relaxed text-sm transition-colors">
              {(currentProduct.ingredients || []).join(', ') || t('no_ingredients')}
            </p>
          </div>
        </div>

        {!isEditing && (
          <div className="p-8 bg-gray-50 dark:bg-white/5 border-t dark:border-gray-800 flex flex-col gap-4 transition-colors">
            {showGroupSelect && (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white dark:bg-[#1a1a1a] p-4 rounded-3xl border border-gray-100 dark:border-gray-800 shadow-xl mb-2 transition-colors"
              >
                <div className="flex justify-between items-center mb-3 px-2">
                  <h4 className="font-bold text-sm text-[#1a1a1a] dark:text-white">{t('groups')}</h4>
                  <button onClick={() => setShowGroupSelect(false)} className="text-gray-400 dark:text-gray-500">
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="space-y-2">
                  {groups.length > 0 ? (
                    groups.map(group => (
                      <button
                        key={group.id}
                        onClick={() => handleAskGroup(group.id)}
                        disabled={isRequesting}
                        className="w-full text-left p-3 rounded-2xl bg-gray-50 dark:bg-white/5 hover:bg-[#5A5A40]/10 dark:hover:bg-[#5A5A40]/20 hover:text-[#5A5A40] dark:hover:text-[#a0a090] transition-all flex items-center justify-between group"
                      >
                        <span className="font-bold text-sm dark:text-white">{group.name}</span>
                        <Users className="w-4 h-4 text-gray-300 dark:text-gray-700 group-hover:text-[#5A5A40] dark:group-hover:text-[#a0a090]" />
                      </button>
                    ))
                  ) : (
                    <p className="text-xs text-center py-4 text-gray-400 dark:text-gray-500 font-medium">{t('no_groups')}</p>
                  )}
                </div>
              </motion.div>
            )}
            <div className="flex gap-4">
              <button 
                onClick={() => {
                  fetchGroups();
                  setShowGroupSelect(!showGroupSelect);
                }}
                className="p-4 bg-white dark:bg-white/5 text-gray-400 dark:text-gray-500 rounded-2xl font-bold flex items-center justify-center gap-2 border border-gray-200 dark:border-gray-800 hover:text-[#5A5A40] dark:hover:text-[#a0a090] hover:border-[#5A5A40] dark:hover:border-[#a0a090] transition-all"
                title={t('ask_group')}
              >
                <Users className="w-6 h-6" />
                <span className="hidden sm:inline">{t('ask_group')}</span>
              </button>
              <button 
                onClick={() => onAdd(currentProduct)}
                className="flex-1 py-4 px-6 bg-[#5A5A40] text-white rounded-2xl font-bold hover:shadow-lg hover:bg-[#4A4A30] transition-all flex items-center justify-center gap-2"
              >
                <ShoppingCart className="w-6 h-6" />
                {t('add')}
              </button>
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
}

function NutrientCard({ icon, label, value, highlight }: { icon: React.ReactNode, label: string, value: string, highlight?: boolean }) {
  return (
    <div className={cn(
      "bg-gray-50 dark:bg-white/5 p-4 rounded-2xl transition-colors", 
      highlight && "bg-orange-50 dark:bg-orange-500/10 ring-1 ring-orange-200 dark:ring-orange-500/30"
    )}>
      <div className="flex items-center gap-2 text-gray-400 dark:text-gray-500 mb-1 transition-colors">
        {icon}
        <span className={cn("text-[10px] font-bold uppercase tracking-wider", highlight && "text-orange-600 dark:text-orange-400")}>{label}</span>
      </div>
      <p className={cn("font-bold text-[#1a1a1a] dark:text-white transition-colors", highlight && "text-orange-700 dark:text-orange-500")}>{value}</p>
    </div>
  );
}
