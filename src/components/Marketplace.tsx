import React, { useState, useEffect, useRef } from 'react';
import { auth, db } from '../firebase';
import { collection, query, onSnapshot, addDoc, serverTimestamp, doc, updateDoc, deleteDoc, where, orderBy } from 'firebase/firestore';
import { MarketplaceOffer, UserProfile } from '../types';
import { useTranslation } from '../lib/LanguageContext';
import { chatService } from '../services/chatService';
import { handleFirestoreError, OperationType } from '../lib/firestore-errors';
import { motion, AnimatePresence } from 'motion/react';
import { Search, Plus, Filter, Tag, Trash2, CheckCircle2, Image as ImageIcon, X, ChevronRight, MessageSquare, Globe, Upload, Edit, Clock } from 'lucide-react';
import { cn } from '../lib/utils';

interface MarketplaceProps {
  userProfile: UserProfile;
  onContact?: (chatId: string) => void;
}

const TYPE_CATEGORIES: Record<MarketplaceOffer['type'], string[]> = {
  product: ['category_electronics', 'category_fashion', 'category_home', 'category_other_marketplace'],
  service: ['category_crafts', 'category_tutoring', 'category_help', 'category_other_marketplace'],
  announcement: ['category_news_announcement', 'category_parties', 'category_classes', 'category_other_marketplace']
};

export default function Marketplace({ userProfile, onContact }: MarketplaceProps) {
  const { t } = useTranslation();
  const [offers, setOffers] = useState<MarketplaceOffer[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedType, setSelectedType] = useState<MarketplaceOffer['type']>('product');
  const [selectedCategory, setSelectedCategory] = useState<string | 'all'>('all');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [contactingOfferId, setContactingOfferId] = useState<string | null>(null);
  const [filterMode, setFilterMode] = useState<'all' | 'my'>('all');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingOffer, setEditingOffer] = useState<MarketplaceOffer | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!selectedFile) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(selectedFile);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [selectedFile]);

  // New Offer Form State
  const [newOffer, setNewOffer] = useState({
    title: '',
    description: '',
    price: '',
    category: TYPE_CATEGORIES['product'][0],
    type: 'product' as MarketplaceOffer['type'],
    eventDate: '',
    image: ''
  });

  // Update category when type changes in model
  useEffect(() => {
    if (showCreateModal) {
      setNewOffer(prev => ({ ...prev, category: TYPE_CATEGORIES[prev.type][0] }));
    }
  }, [newOffer.type, showCreateModal]);

  useEffect(() => {
    if (editingOffer) {
      // Ensure category is valid for type
      if (!TYPE_CATEGORIES[editingOffer.type].includes(editingOffer.category)) {
        setEditingOffer(prev => prev ? { ...prev, category: TYPE_CATEGORIES[prev.type][0] } : null);
      }
    }
  }, [editingOffer?.type]);

  useEffect(() => {
    const q = query(
      collection(db, 'marketplace_offers'),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const offersData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as MarketplaceOffer[];
      setOffers(offersData);
      setLoading(false);
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, 'marketplace_offers');
    });

    return () => unsubscribe();
  }, []);

  const handleCreateOffer = async (e: React.FormEvent) => {
    e.preventDefault();
    const isPriceRequired = newOffer.type !== 'announcement';
    if (!newOffer.title || (isPriceRequired && !newOffer.price)) return;
    if (!auth.currentUser) {
      setError(t('please_login' as any) || "Bitte melde dich an.");
      return;
    }

    // Check file size (limit to 5MB)
    if (selectedFile && selectedFile.size > 5 * 1024 * 1024) {
      setError("Das Bild ist zu groß (max. 5MB).");
      return;
    }

    setUploading(true);
    setError(null);
    try {
      let imageUrl = newOffer.image;

      if (selectedFile) {
        console.log('Uploading using server proxy...');
        try {
          const formData = new FormData();
          formData.append('image', selectedFile);

          const response = await fetch('/api/upload', {
            method: 'POST',
            body: formData,
          });

          if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Upload failed');
          }

          const data = await response.json();
          imageUrl = data.url;
          console.log('Upload successful, URL:', imageUrl);
        } catch (cErr: any) {
          console.error('Upload Error:', cErr);
          setError(`Upload fehlgeschlagen: ${cErr.message}. Du kannst es alternativ mit einer Bild-URL versuchen.`);
          setUploading(false);
          return;
        }
      }

      // If no file was successfully uploaded, we might still have a manual URL
      const finalImageUrl = imageUrl || newOffer.image;
      
      const offerData = {
        userId: auth.currentUser!.uid,
        userName: userProfile.name || 'Anonymous',
        title: newOffer.title.trim(),
        description: newOffer.description.trim(),
        price: parseFloat(newOffer.price) || 0,
        category: newOffer.category,
        type: newOffer.type,
        eventDate: newOffer.eventDate || null,
        images: finalImageUrl ? [finalImageUrl] : [],
        status: 'active',
        createdAt: serverTimestamp()
      };

      console.log('Saving marketplace offer metadata to Firestore:', offerData);
      try {
        await addDoc(collection(db, 'marketplace_offers'), offerData);
        console.log('Marketplace offer successfully saved');
      } catch (fErr: any) {
        handleFirestoreError(fErr, OperationType.CREATE, 'marketplace_offers');
      }
      
      setShowCreateModal(false);
      setNewOffer({ title: '', description: '', price: '', category: TYPE_CATEGORIES['product'][0], type: 'product', eventDate: '', image: '' });
      setSelectedFile(null);
      setPreviewUrl(null);
    } catch (err: any) {
      console.error('Marketplace Offer Creation failed:', err);
      // Main error logging handled in specific blocks
    } finally {
      setUploading(false);
    }
  };

  const handleUpdateStatus = async (offerId: string, newStatus: 'active' | 'sold' | 'reserved') => {
    try {
      await updateDoc(doc(db, 'marketplace_offers', offerId), { status: newStatus });
    } catch (error) {
      console.error('Error updating status:', error);
    }
  };

  const handleEditOffer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingOffer) return;
    setUploading(true);
    setError(null);
    try {
      let imageUrl = editingOffer.images?.[0] || '';

      if (selectedFile) {
        console.log('Uploading new image for existing offer...');
        try {
          const formData = new FormData();
          formData.append('image', selectedFile);

          const response = await fetch('/api/upload', {
            method: 'POST',
            body: formData,
          });

          if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Upload failed');
          }

          const data = await response.json();
          imageUrl = data.url;
          console.log('New image upload successful, URL:', imageUrl);
        } catch (cErr: any) {
          console.error('Edit Upload Error:', cErr);
          setError(`Upload fehlgeschlagen: ${cErr.message}. Die anderen Änderungen wurden nicht gespeichert.`);
          setUploading(false);
          return;
        }
      }

      const data = {
        title: editingOffer.title,
        description: editingOffer.description,
        price: editingOffer.price,
        category: editingOffer.category,
        type: editingOffer.type,
        eventDate: editingOffer.eventDate || null,
        images: imageUrl ? [imageUrl] : editingOffer.images || [],
        updatedAt: serverTimestamp()
      };
      
      try {
        await updateDoc(doc(db, 'marketplace_offers', editingOffer.id), data);
      } catch (uErr: any) {
        handleFirestoreError(uErr, OperationType.UPDATE, `marketplace_offers/${editingOffer.id}`);
      }
      
      setEditingOffer(null);
      setSelectedFile(null);
      setPreviewUrl(null);
    } catch (err: any) {
      console.error('Marketplace Offer Edit failed:', err);
      setError(err.message || 'Update failed');
    } finally {
      setUploading(false);
    }
  };

  const deleteOffer = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'marketplace_offers', id));
      setError(null);
    } catch (err: any) {
      handleFirestoreError(err, OperationType.DELETE, `marketplace_offers/${id}`);
    }
  };

  const handleStartChat = async (offer: MarketplaceOffer) => {
    if (!auth.currentUser) return;
    setContactingOfferId(offer.id);
    try {
      const chatId = await chatService.getOrCreateChat(
        auth.currentUser.uid,
        offer.userId,
        offer
      );
      if (onContact) onContact(chatId);
    } catch (err) {
      console.error('Error starting chat:', err);
      setError(t('chat_error' as any) || 'Fehler beim Starten des Chats');
    } finally {
      setContactingOfferId(null);
    }
  };  const filteredOffers = offers.filter(offer => {
    const matchesSearch = offer.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
                         offer.description.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesType = offer.type === selectedType;
    const matchesCategory = selectedCategory === 'all' || offer.category === selectedCategory;
    const matchesUser = filterMode === 'all' || offer.userId === userProfile.uid;
    return matchesSearch && matchesType && matchesCategory && matchesUser;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="text-3xl font-serif font-bold text-[#1a1a1a] dark:text-white">
            {t(`type_${selectedType}` as any)}
          </h2>
          <div className="flex items-center gap-3">
             <button
              onClick={() => setFilterMode(filterMode === 'all' ? 'my' : 'all')}
              className={cn(
                "px-4 py-3 rounded-2xl text-xs font-bold transition-all shadow-sm flex items-center gap-2",
                filterMode === 'my' ? "bg-[#5A5A40] text-white" : "bg-white dark:bg-white/5 text-gray-500 border border-gray-100 dark:border-gray-800"
              )}
            >
              {t('my_offers')}
            </button>
            <button
              onClick={() => {
                setError(null);
                setSelectedFile(null);
                setPreviewUrl(null);
                setNewOffer(prev => ({ ...prev, type: selectedType }));
                setShowCreateModal(true);
              }}
              className="flex items-center gap-2 px-6 py-3 bg-[#5A5A40] text-white rounded-2xl font-bold hover:bg-[#4a4a35] transition-all shadow-lg"
            >
              <Plus className="w-5 h-5" />
              {t('create_offer')}
            </button>
          </div>
        </div>
        <p className="text-gray-500 dark:text-gray-400 text-sm">
          {selectedType === 'product' ? t('marketplace_desc') : 
           selectedType === 'service' ? 'Hier findest du Hilfe und Dienstleistungen aus deiner Nachbarschaft.' :
           'Bleib informiert über Events und Kurse in deiner Nähe.'}
        </p>
      </div>

      {error && !showCreateModal && (
        <div className="p-4 bg-red-50 text-red-600 rounded-2xl text-xs font-bold border border-red-100 flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="p-1 hover:bg-red-100 rounded-full">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Main Tabs (Types) */}
      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-2">
        {(['product', 'service', 'announcement'] as MarketplaceOffer['type'][]).map(type => (
          <button
            key={type}
            onClick={() => {
              setSelectedType(type);
              setSelectedCategory('all');
            }}
            className={cn(
              "px-6 py-3 rounded-2xl text-sm font-black uppercase tracking-widest transition-all whitespace-nowrap",
              selectedType === type ? "bg-[#5A5A40] text-white shadow-xl shadow-[#5A5A40]/30" : "bg-white dark:bg-[#1a1a1a] text-gray-400 border border-gray-100 dark:border-gray-800"
            )}
          >
            {t(`type_${type}` as any)}
          </button>
        ))}
      </div>

      {/* Sub-Filters & Search */}
      <div className="space-y-4">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder={t('search_offers')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-12 pr-4 py-4 bg-white dark:bg-[#1a1a1a] dark:text-white rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm focus:ring-2 focus:ring-[#5A5A40] outline-none transition-all"
          />
        </div>

        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-2">
          <button
            onClick={() => setSelectedCategory('all')}
            className={cn(
              "px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap",
              selectedCategory === 'all' ? "bg-gray-200 dark:bg-white/20 text-gray-900 dark:text-white" : "bg-white dark:bg-[#1a1a1a] text-gray-500 border border-gray-100 dark:border-gray-800"
            )}
          >
            {t('all_categories' as any) || 'Alle'}
          </button>
          {TYPE_CATEGORIES[selectedType].map(cat => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={cn(
                "px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap",
                selectedCategory === cat ? "bg-[#8A8A70] text-white" : "bg-white dark:bg-[#1a1a1a] text-gray-500 border border-gray-100 dark:border-gray-800 shadow-sm"
              )}
            >
              {t(cat as any)}
            </button>
          ))}
        </div>
      </div>

      {/* Blackboard Content */}
      {loading ? (
        <div className="text-center py-20 text-gray-400">{t('loading')}</div>
      ) : filteredOffers.length === 0 ? (
        <div className="bg-white dark:bg-[#1a1a1a] p-12 rounded-[40px] text-center border border-gray-100 dark:border-gray-800 shadow-sm transition-colors">
          <Globe className="w-16 h-16 text-gray-200 dark:text-gray-800 mx-auto mb-4" />
          <p className="text-gray-400 dark:text-gray-500">{t('no_offers')}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {filteredOffers.map((offer, index) => (
            <motion.div
              layout
              key={offer.id}
              initial={{ rotate: index % 2 === 0 ? -1 : 1, opacity: 0, y: 20 }}
              animate={{ rotate: index % 2 === 0 ? -1 : 1, opacity: 1, y: 0 }}
              whileHover={{ rotate: 0, scale: 1.02, y: -5 }}
              className={cn(
                "group relative bg-[#fffdf0] dark:bg-[#1b1b18] p-6 shadow-[5px_5px_15px_rgba(0,0,0,0.08)] border border-gray-100 dark:border-gray-800 transition-all rounded-[40px] overflow-hidden",
                offer.status === 'sold' && "grayscale opacity-80"
              )}
              style={{
                boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)'
              }}
            >
              {/* Pin */}
              <div className="absolute top-2 left-1/2 -translate-x-1/2 w-4 h-4 bg-red-500 rounded-full shadow-inner z-10 border border-red-600">
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-1.5 h-1.5 bg-red-300 rounded-full opacity-50" />
              </div>

              {offer.images && offer.images.length > 0 && (
                <div className="w-full aspect-[4/3] relative overflow-hidden rounded-sm mb-4">
                  <img 
                    src={offer.images[0]} 
                    alt={offer.title} 
                    className="w-full h-full object-cover grayscale-[0.2] hover:grayscale-0 transition-all duration-500"
                  />
                  {offer.status === 'sold' && (
                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                      <span className="px-4 py-2 bg-white/20 backdrop-blur-md rounded-full text-white text-xs font-black uppercase tracking-widest border border-white/30">
                        {t('sold')}
                      </span>
                    </div>
                  )}
                </div>
              )}

              <div className="space-y-4">
                <div>
                  <div className="flex flex-wrap gap-2 mb-2">
                    <span className={cn(
                      "px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest",
                      offer.type === 'product' ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" :
                      offer.type === 'service' ? "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400" :
                      "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                    )}>
                      {t(`type_${offer.type}` as any)}
                    </span>
                    <span className="px-2 py-0.5 bg-gray-100 dark:bg-white/10 rounded text-[8px] font-black uppercase tracking-widest text-gray-500">
                      {t(`type_${offer.category}` as any)}
                    </span>
                  </div>
                  <h3 className="font-serif font-bold text-xl text-[#1a1a1a] dark:text-white group-hover:text-[#5A5A40] transition-colors line-clamp-2">
                    {offer.title}
                  </h3>
                  <p className="text-[10px] text-gray-400 dark:text-gray-500 font-bold uppercase tracking-widest mt-1">
                    {offer.userName} • {offer.createdAt?.toDate().toLocaleDateString(userProfile.language === 'de' ? 'de-DE' : 'en-US')}
                  </p>
                </div>

                {offer.type === 'announcement' && offer.eventDate && (
                  <div className="flex items-center gap-2 p-2 bg-amber-50 dark:bg-amber-900/10 rounded-lg border border-amber-100 dark:border-amber-900/20 text-xs text-amber-700 dark:text-amber-400 font-bold">
                    <Clock className="w-4 h-4" />
                    {offer.eventDate}
                  </div>
                )}

                <p className="text-sm text-gray-600 dark:text-gray-400 min-h-[60px] font-medium leading-relaxed italic whitespace-pre-wrap">
                  "{offer.description}"
                </p>

                <div className="flex justify-between items-center pt-2">
                  <div className="text-2xl font-black text-[#5A5A40] dark:text-[#a0a090]">
                    {['product', 'service'].includes(offer.type) ? (
                      <>{offer.price.toFixed(2)}<span className="text-xs">€</span></>
                    ) : (
                      <span className="text-xs text-gray-400 uppercase tracking-tighter">
                        Event
                      </span>
                    )}
                  </div>
                </div>

                <div className="pt-4 flex flex-col gap-4 border-t border-gray-200/50 dark:border-gray-800/50">
                  {(offer.userId === userProfile.uid || userProfile.role === 'admin') ? (
                    <div className="flex flex-col gap-2">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleUpdateStatus(offer.id, 'active')}
                          disabled={offer.userId !== userProfile.uid && userProfile.role !== 'admin'}
                          className={cn(
                            "flex-1 py-1.5 rounded-lg text-[8px] font-black uppercase tracking-widest transition-all",
                            offer.status === 'active' ? "bg-emerald-600 text-white shadow-md shadow-emerald-500/20" : "bg-gray-100 dark:bg-white/5 text-gray-500 hover:bg-gray-200"
                          )}
                        >
                          {t('active')}
                        </button>
                        <button
                          onClick={() => handleUpdateStatus(offer.id, 'reserved')}
                          disabled={offer.userId !== userProfile.uid && userProfile.role !== 'admin'}
                          className={cn(
                            "flex-1 py-1.5 rounded-lg text-[8px] font-black uppercase tracking-widest transition-all",
                            offer.status === 'reserved' ? "bg-amber-500 text-white shadow-md shadow-amber-500/20" : "bg-gray-100 dark:bg-white/5 text-gray-500 hover:bg-gray-200"
                          )}
                        >
                          {t('reserved')}
                        </button>
                        <button
                          onClick={() => handleUpdateStatus(offer.id, 'sold')}
                          disabled={offer.userId !== userProfile.uid && userProfile.role !== 'admin'}
                          className={cn(
                            "flex-1 py-1.5 rounded-lg text-[8px] font-black uppercase tracking-widest transition-all",
                            offer.status === 'sold' ? "bg-gray-800 text-white shadow-md shadow-black/20" : "bg-gray-100 dark:bg-white/5 text-gray-500 hover:bg-gray-200"
                          )}
                        >
                          {t('sold')}
                        </button>
                      </div>
                      
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => {
                            setError(null);
                            setSelectedFile(null);
                            setPreviewUrl(null);
                            setEditingOffer(offer);
                          }}
                          disabled={offer.userId !== userProfile.uid && userProfile.role !== 'admin'}
                          className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-gray-50 dark:bg-white/5 text-gray-600 dark:text-gray-400 rounded-xl text-[10px] font-bold uppercase tracking-widest border border-gray-100 dark:border-gray-800 hover:bg-gray-100 transition-all disabled:opacity-50"
                        >
                          <Edit className="w-3.5 h-3.5" />
                          {t('edit')}
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteOffer(offer.id);
                          }}
                          className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 rounded-xl text-[10px] font-bold uppercase tracking-widest hover:bg-red-100 transition-all"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          {t('delete')}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className={cn(
                        "text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded transition-colors",
                        offer.status === 'active' ? "text-emerald-600 border border-emerald-100 bg-emerald-50" : 
                        offer.status === 'reserved' ? "text-amber-600 border border-amber-100 bg-amber-50" : "text-gray-400 border border-gray-100 bg-gray-50"
                      )}>
                        {offer.status === 'active' ? t('active') : offer.status === 'reserved' ? t('reserved') : t('sold')}
                      </span>
                      
                      {offer.status === 'active' && (
                        <button 
                          onClick={() => handleStartChat(offer)}
                          disabled={contactingOfferId !== null}
                          className="flex items-center gap-2 px-4 py-2 bg-[#5A5A40] text-white rounded-xl font-bold text-[10px] uppercase tracking-widest hover:bg-[#4a4a35] transition-all disabled:opacity-50 shadow-md shadow-[#5A5A40]/20 whitespace-nowrap"
                        >
                          {contactingOfferId === offer.id ? (
                            <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          ) : (
                            <MessageSquare className="w-3.5 h-3.5" />
                          )}
                          {contactingOfferId === offer.id ? t('loading') : t('contact')}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* Edit Offer Modal */}
      <AnimatePresence>
        {editingOffer && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setEditingOffer(null)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="relative w-full max-w-lg bg-white dark:bg-[#1a1a1a] rounded-[40px] p-8 shadow-2xl space-y-6 transition-colors"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-2xl font-serif font-bold text-[#1a1a1a] dark:text-white transition-colors">{t('edit_offer' as any) || 'Anzeige bearbeiten'}</h3>
                <button onClick={() => setEditingOffer(null)} className="p-2 hover:bg-gray-100 dark:hover:bg-white/5 rounded-full transition-all">
                  <X className="w-6 h-6 text-gray-400 dark:text-gray-500" />
                </button>
              </div>

              {error && (
                <div className="p-4 bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 rounded-2xl text-xs font-bold border border-red-100 dark:border-red-500/20 transition-colors">
                  {error}
                </div>
              )}

              <form onSubmit={handleEditOffer} className="space-y-4">
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500 ml-1 transition-colors">{t('offer_title')}</label>
                  <input
                    required
                    type="text"
                    value={editingOffer.title}
                    onChange={e => setEditingOffer({ ...editingOffer, title: e.target.value })}
                    className="w-full px-5 py-4 bg-gray-50 dark:bg-[#121212] dark:text-white rounded-2xl border-none focus:ring-2 focus:ring-[#5A5A40] outline-none transition-colors"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500 ml-1 transition-colors">{t('offer_type')}</label>
                    <select
                      value={editingOffer.type}
                      onChange={e => setEditingOffer({ ...editingOffer, type: e.target.value as any })}
                      className="w-full px-5 py-4 bg-gray-50 dark:bg-[#121212] dark:text-white rounded-2xl border-none focus:ring-2 focus:ring-[#5A5A40] outline-none appearance-none transition-colors"
                    >
                      <option value="product">{t('type_product')}</option>
                      <option value="service">{t('type_service')}</option>
                      <option value="announcement">{t('type_announcement')}</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500 ml-1 transition-colors">{t('offer_category')}</label>
                    <select
                      value={editingOffer.category}
                      onChange={e => setEditingOffer({ ...editingOffer, category: e.target.value })}
                      className="w-full px-5 py-4 bg-gray-50 dark:bg-[#121212] dark:text-white rounded-2xl border-none focus:ring-2 focus:ring-[#5A5A40] outline-none appearance-none transition-colors"
                    >
                      {TYPE_CATEGORIES[editingOffer.type].map(cat => (
                        <option key={cat} value={cat}>{t(cat as any)}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500 ml-1 transition-colors">
                      {editingOffer.type === 'announcement' ? t('event_date') : t('offer_price')}
                    </label>
                    {editingOffer.type === 'announcement' ? (
                      <input
                        type="text"
                        value={editingOffer.eventDate || ''}
                        onChange={e => setEditingOffer({ ...editingOffer, eventDate: e.target.value })}
                        placeholder="z.B. Sa. 14:00"
                        className="w-full px-5 py-4 bg-gray-50 dark:bg-[#121212] dark:text-white rounded-2xl border-none focus:ring-2 focus:ring-[#5A5A40] outline-none transition-colors"
                      />
                    ) : (
                      <input
                        required
                        type="number"
                        step="0.01"
                        value={editingOffer.price}
                        onChange={e => setEditingOffer({ ...editingOffer, price: parseFloat(e.target.value) || 0 })}
                        className="w-full px-5 py-4 bg-gray-50 dark:bg-[#121212] dark:text-white rounded-2xl border-none focus:ring-2 focus:ring-[#5A5A40] outline-none transition-colors"
                      />
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500 ml-1 transition-colors">{t('offer_description')}</label>
                  <textarea
                    rows={4}
                    value={editingOffer.description}
                    onChange={e => setEditingOffer({ ...editingOffer, description: e.target.value })}
                    className="w-full px-5 py-4 bg-gray-50 dark:bg-[#121212] dark:text-white rounded-2xl border-none focus:ring-2 focus:ring-[#5A5A40] outline-none resize-none transition-colors"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500 ml-1 transition-colors">Produktbild ändern</label>
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                    accept="image/*"
                    className="hidden"
                  />
                  
                  <div 
                    onClick={() => fileInputRef.current?.click()}
                    className={cn(
                      "w-full aspect-video rounded-2xl border-2 border-dashed flex flex-col items-center justify-center cursor-pointer transition-all overflow-hidden relative",
                      (previewUrl || (editingOffer.images && editingOffer.images[0])) ? "border-solid border-[#5A5A40]" : "border-gray-200 dark:border-gray-800 hover:border-[#5A5A40] dark:hover:border-[#5A5A40]"
                    )}
                  >
                    {(previewUrl || (editingOffer.images && editingOffer.images[0])) ? (
                      <>
                        <img 
                          src={previewUrl || editingOffer.images![0]} 
                          alt="Preview" 
                          className="w-full h-full object-cover" 
                        />
                        <div className="absolute inset-0 bg-black/40 opacity-0 hover:opacity-100 flex items-center justify-center transition-opacity">
                          <Upload className="w-8 h-8 text-white" />
                        </div>
                      </>
                    ) : (
                      <>
                        <Upload className="w-8 h-8 text-gray-300 mb-2" />
                        <span className="text-xs text-gray-400 font-bold uppercase tracking-widest">Bild hochladen</span>
                      </>
                    )}
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={uploading}
                  className="w-full py-5 bg-[#5A5A40] text-white rounded-2xl font-bold text-lg shadow-xl hover:bg-[#4a4a35] transition-all disabled:opacity-50"
                >
                  {uploading ? (t('uploading' as any) || 'Wird gesichert...') : (t('save' as any) || 'Speichern')}
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Create Offer Modal */}
      <AnimatePresence>
        {showCreateModal && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowCreateModal(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="relative w-full max-w-lg bg-white dark:bg-[#1a1a1a] rounded-[40px] p-8 shadow-2xl space-y-6 transition-colors"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-2xl font-serif font-bold text-[#1a1a1a] dark:text-white transition-colors">{t('create_offer')}</h3>
                <button onClick={() => setShowCreateModal(false)} className="p-2 hover:bg-gray-100 dark:hover:bg-white/5 rounded-full transition-all">
                  <X className="w-6 h-6 text-gray-400 dark:text-gray-500" />
                </button>
              </div>

              {error && (
                <div className="p-4 bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 rounded-2xl text-xs font-bold border border-red-100 dark:border-red-500/20">
                  {error}
                </div>
              )}

              <form onSubmit={handleCreateOffer} className="space-y-4">
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500 ml-1 transition-colors">{t('offer_title')}</label>
                  <input
                    required
                    type="text"
                    value={newOffer.title}
                    onChange={e => setNewOffer({ ...newOffer, title: e.target.value })}
                    className="w-full px-5 py-4 bg-gray-50 dark:bg-[#121212] dark:text-white rounded-2xl border-none focus:ring-2 focus:ring-[#5A5A40] outline-none transition-colors"
                    placeholder="z.B. iPhone 13 Pro"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500 ml-1 transition-colors">{t('offer_type')}</label>
                    <select
                      value={newOffer.type}
                      onChange={e => setNewOffer({ ...newOffer, type: e.target.value as any })}
                      className="w-full px-5 py-4 bg-gray-50 dark:bg-[#121212] dark:text-white rounded-2xl border-none focus:ring-2 focus:ring-[#5A5A40] outline-none appearance-none transition-colors"
                    >
                      <option value="product">{t('type_product')}</option>
                      <option value="service">{t('type_service')}</option>
                      <option value="announcement">{t('type_announcement')}</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500 ml-1 transition-colors">{t('offer_category')}</label>
                    <select
                      value={newOffer.category}
                      onChange={e => setNewOffer({ ...newOffer, category: e.target.value })}
                      className="w-full px-5 py-4 bg-gray-50 dark:bg-[#121212] dark:text-white rounded-2xl border-none focus:ring-2 focus:ring-[#5A5A40] outline-none appearance-none transition-colors"
                    >
                      {TYPE_CATEGORIES[newOffer.type].map(cat => (
                        <option key={cat} value={cat}>{t(cat as any)}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500 ml-1 transition-colors">
                      {newOffer.type === 'announcement' ? t('event_date') : t('offer_price')}
                    </label>
                    {newOffer.type === 'announcement' ? (
                      <input
                        type="text"
                        value={newOffer.eventDate}
                        onChange={e => setNewOffer({ ...newOffer, eventDate: e.target.value })}
                        placeholder="z.B. Morgen, 18:00"
                        className="w-full px-5 py-4 bg-gray-50 dark:bg-[#121212] dark:text-white rounded-2xl border-none focus:ring-2 focus:ring-[#5A5A40] outline-none transition-colors"
                      />
                    ) : newOffer.type === 'news' ? (
                      <div className="px-5 py-4 bg-gray-100 dark:bg-[#121212] rounded-2xl text-gray-400 text-sm italic">
                        Kein Preis für Nachrichten erforderlich
                      </div>
                    ) : (
                      <input
                        required
                        type="number"
                        step="0.01"
                        value={newOffer.price}
                        onChange={e => setNewOffer({ ...newOffer, price: e.target.value })}
                        className="w-full px-5 py-4 bg-gray-50 dark:bg-[#121212] dark:text-white rounded-2xl border-none focus:ring-2 focus:ring-[#5A5A40] outline-none transition-colors"
                        placeholder="0.00"
                      />
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500 ml-1 transition-colors">{t('offer_description')}</label>
                  <textarea
                    rows={4}
                    value={newOffer.description}
                    onChange={e => setNewOffer({ ...newOffer, description: e.target.value })}
                    className="w-full px-5 py-4 bg-gray-50 dark:bg-[#121212] dark:text-white rounded-2xl border-none focus:ring-2 focus:ring-[#5A5A40] outline-none resize-none transition-colors"
                    placeholder="Beschreibe den Zustand, das Alter..."
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500 ml-1 transition-colors">Produktbild</label>
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                    accept="image/*"
                    className="hidden"
                  />
                  
                  <div 
                    onClick={() => fileInputRef.current?.click()}
                    className={cn(
                      "w-full aspect-video rounded-2xl border-2 border-dashed flex flex-col items-center justify-center cursor-pointer transition-all overflow-hidden relative",
                      previewUrl ? "border-solid border-[#5A5A40]" : "border-gray-200 dark:border-gray-800 hover:border-[#5A5A40] dark:hover:border-[#5A5A40]"
                    )}
                  >
                    {previewUrl ? (
                      <>
                        <img src={previewUrl} alt="Preview" className="w-full h-full object-cover" />
                        <div className="absolute inset-0 bg-black/40 opacity-0 hover:opacity-100 flex items-center justify-center transition-opacity">
                          <Edit className="w-8 h-8 text-white" />
                        </div>
                      </>
                    ) : (
                      <>
                        <Upload className="w-8 h-8 text-gray-300 mb-2" />
                        <span className="text-xs text-gray-400 font-bold uppercase tracking-widest">Bild hochladen</span>
                      </>
                    )}
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={uploading}
                  className="w-full py-5 bg-[#5A5A40] text-white rounded-2xl font-bold text-lg shadow-xl hover:bg-[#4a4a35] transition-all disabled:opacity-50"
                >
                  {uploading ? (t('uploading' as any) || 'Wird hochgeladen...') : t('create')}
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
