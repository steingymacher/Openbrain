import { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, query, getDocs, doc, updateDoc, where, deleteDoc } from 'firebase/firestore';
import { UserProfile, Product } from '../types';
import { motion } from 'motion/react';
import { X, Shield, ShieldAlert, Search, User as UserIcon, ShoppingBag, Plus, Edit2, Trash2, Image as ImageIcon, Cpu, Copy, Check, RefreshCw, Flag, EyeOff, ChevronDown, ChevronRight, UserMinus } from 'lucide-react';
import { forceUpdateDatabase, deleteAllProducts } from '../services/productService';

import { useTranslation } from '../lib/LanguageContext';

interface AdminPanelProps {
  onClose: () => void;
  onEditProduct?: (product: Product) => void;
  onNewProduct?: () => void;
}

export default function AdminPanel({ onClose, onEditProduct, onNewProduct }: AdminPanelProps) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<'users' | 'products' | 'arduino'>('users');
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [copied, setCopied] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showUpdateConfirm, setShowUpdateConfirm] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    new: true,
    marked: true,
    rest: true,
    ignored: false
  });

  const toggleSection = (section: string) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const arduinoCode = `#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>

const char* ssid = "YOUR_WIFI_SSID";
const char* password = "YOUR_WIFI_PASSWORD";
const char* serverUrl = "${window.location.origin}/api/arduino/update";

void setup() {
  Serial.begin(115200);
  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
}

void loop() {
  if (WiFi.status() == WL_CONNECTED) {
    HTTPClient http;
    http.begin(serverUrl);
    http.addHeader("Content-Type", "application/json");

    StaticJsonDocument<200> doc;
    doc["temperature"] = 24.5; // Sensor-Daten hier einfügen
    doc["humidity"] = 60;
    doc["light"] = 800;
    doc["soilMoisture"] = 45;

    String requestBody;
    serializeJson(doc, requestBody);

    int httpResponseCode = http.POST(requestBody);
    Serial.print("HTTP Response code: ");
    Serial.println(httpResponseCode);
    http.end();
  }
  delay(60000); // Alle 60 Sekunden senden
}`;

  const copyToClipboard = () => {
    navigator.clipboard.writeText(arduinoCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const fetchData = async () => {
    setLoading(true);
    setError('');
    try {
      if (activeTab === 'users') {
        let q = query(collection(db, 'users'));
        if (searchQuery) {
          q = query(collection(db, 'users'), where('email', '==', searchQuery));
        }
        const snapshot = await getDocs(q);
        const userList = snapshot.docs.map(doc => ({
          ...doc.data(),
          uid: doc.id
        } as UserProfile));
        setUsers(userList);
      } else {
        const snapshot = await getDocs(collection(db, 'products'));
        let productList = snapshot.docs.map(doc => doc.data() as Product);
        if (searchQuery) {
          productList = productList.filter(p => 
            p.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
            p.brand.toLowerCase().includes(searchQuery.toLowerCase()) ||
            p.id.includes(searchQuery)
          );
        }
        if (filterCategory !== 'all') {
          productList = productList.filter(p => p.category === filterCategory);
        }
        setProducts(productList);
      }
    } catch (err: any) {
      console.error('Error fetching data:', err);
      setError('Fehler beim Laden der Daten. Bist du sicher, dass du Admin-Rechte hast?');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [activeTab, filterCategory]);

  const setRole = async (user: UserProfile, newRole: string) => {
    try {
      await updateDoc(doc(db, 'users', user.uid), {
        role: newRole
      });
      setUsers(prev => prev.map(u => u.uid === user.uid ? { ...u, role: newRole } : u));
    } catch (err) {
      console.error('Error updating user role:', err);
      alert('Fehler beim Aktualisieren der Rechte.');
    }
  };

  const toggleUserMark = async (user: UserProfile) => {
    try {
      const isMarked = !user.isMarked;
      await updateDoc(doc(db, 'users', user.uid), { isMarked });
      setUsers(prev => prev.map(u => u.uid === user.uid ? { ...u, isMarked } : u));
    } catch (err) {
      console.error('Error toggling user mark:', err);
    }
  };

  const toggleUserIgnore = async (user: UserProfile) => {
    try {
      const isIgnored = !user.isIgnored;
      await updateDoc(doc(db, 'users', user.uid), { isIgnored });
      setUsers(prev => prev.map(u => u.uid === user.uid ? { ...u, isIgnored } : u));
    } catch (err) {
      console.error('Error toggling user ignore:', err);
    }
  };

  const deleteUser = async (user: UserProfile) => {
    if (window.confirm(`Möchtest du den Account von ${user.name} wirklich unwiderruflich löschen?`)) {
      try {
        await deleteDoc(doc(db, 'users', user.uid));
        setUsers(prev => prev.filter(u => u.uid !== user.uid));
      } catch (err) {
        console.error('Error deleting user:', err);
        alert('Fehler beim Löschen des Benutzers.');
      }
    }
  };

  const categorizedUsers = {
    ignored: users.filter(u => u.isIgnored),
    marked: users.filter(u => u.isMarked && !u.isIgnored),
    new: users.filter(u => {
      if (u.isIgnored || u.isMarked) return false;
      if (!u.createdAt) return false;
      const created = new Date(u.createdAt).getTime();
      const threeDaysAgo = Date.now() - (3 * 24 * 60 * 60 * 1000);
      return created > threeDaysAgo;
    }),
    rest: users.filter(u => {
      if (u.isIgnored || u.isMarked) return false;
      if (!u.createdAt) return true; // Treat users without createdAt as old
      const created = new Date(u.createdAt).getTime();
      const threeDaysAgo = Date.now() - (3 * 24 * 60 * 60 * 1000);
      return created <= threeDaysAgo;
    })
  };

  const UserItem = ({ user }: { user: UserProfile; key?: string }) => (
    <div key={user.uid} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-gray-50 dark:bg-[#0a0a0a] rounded-2xl border border-gray-100 dark:border-gray-800 gap-4 group">
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 bg-white dark:bg-[#111] rounded-full flex items-center justify-center shadow-sm relative">
          <UserIcon className="w-6 h-6 text-gray-400 dark:text-gray-500" />
          {user.isMarked && (
            <div className="absolute -top-1 -right-1 w-4 h-4 bg-amber-500 rounded-full flex items-center justify-center border-2 border-white dark:border-black">
              <span className="w-1.5 h-1.5 bg-white rounded-full"></span>
            </div>
          )}
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h4 className="font-bold text-[#1a1a1a] dark:text-white capitalize">{user.name}</h4>
            {user.createdAt && (
              <span className="text-[8px] text-gray-400 font-mono">
                {new Date(user.createdAt).toLocaleDateString()}
              </span>
            )}
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400 truncate max-w-[200px]">{user.email}</p>
          <div className="flex gap-2 items-center mt-1">
            <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full ${
              user.role === 'admin' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' : 
              user.role === 'staff' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' : 
              'bg-gray-200 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
            }`}>
              {user.role === 'admin' ? t('admin') : user.role === 'staff' ? t('staff') : t('user')}
            </span>
            {user.isIgnored && (
              <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">
                Ignoriert
              </span>
            )}
          </div>
        </div>
      </div>
      
      <div className="flex items-center gap-2">
        <select 
          value={user.role || 'user'}
          onChange={(e) => setRole(user, e.target.value)}
          className="bg-white dark:bg-[#111] border border-gray-200 dark:border-gray-800 rounded-xl px-3 py-2 text-sm font-bold text-[#5A5A40] dark:text-[#8A8A6A] outline-none"
        >
          <option value="user">{t('user')}</option>
          <option value="staff">{t('staff')}</option>
          <option value="admin">{t('admin')}</option>
        </select>
        
        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button 
            onClick={() => toggleUserMark(user)}
            className={`p-2 rounded-xl transition-all ${user.isMarked ? 'bg-amber-100 text-amber-600 dark:bg-amber-900/30' : 'bg-gray-100 dark:bg-gray-800 text-gray-400'}`}
            title="Markieren"
          >
            <Flag className="w-4 h-4" />
          </button>
          <button 
            onClick={() => toggleUserIgnore(user)}
            className={`p-2 rounded-xl transition-all ${user.isIgnored ? 'bg-red-100 text-red-600 dark:bg-red-900/30' : 'bg-gray-100 dark:bg-gray-800 text-gray-400'}`}
            title="Ignorieren"
          >
            <EyeOff className="w-4 h-4" />
          </button>
          <button 
            onClick={() => deleteUser(user)}
            className="p-2 bg-red-50 dark:bg-red-900/20 text-red-500 rounded-xl hover:bg-red-100 transition-all"
            title="Löschen"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-md flex items-center justify-center p-4"
    >
      <motion.div 
        initial={{ scale: 0.9, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        className="bg-white dark:bg-black w-full max-w-2xl rounded-[32px] overflow-hidden flex flex-col max-h-[90vh] dark:border dark:border-gray-800"
      >
        <div className="p-6 border-b dark:border-gray-800 flex justify-between items-center bg-gray-50 dark:bg-[#0a0a0a]">
          <div className="flex items-center gap-3">
            <ShieldAlert className="w-8 h-8 text-[#5A5A40] dark:text-[#8A8A6A]" />
            <div>
              <h2 className="text-xl font-serif font-bold dark:text-white">{t('admin_area')}</h2>
              <div className="flex gap-4 mt-1">
                <button 
                  onClick={() => setActiveTab('users')}
                  className={`text-[10px] font-bold uppercase tracking-widest pb-1 border-b-2 transition-all ${activeTab === 'users' ? 'border-[#5A5A40] text-[#5A5A40] dark:border-[#8A8A6A] dark:text-[#8A8A6A]' : 'border-transparent text-gray-400'}`}
                >
                  {t('user_management')}
                </button>
                <button 
                  onClick={() => setActiveTab('products')}
                  className={`text-[10px] font-bold uppercase tracking-widest pb-1 border-b-2 transition-all ${activeTab === 'products' ? 'border-[#5A5A40] text-[#5A5A40] dark:border-[#8A8A6A] dark:text-[#8A8A6A]' : 'border-transparent text-gray-400'}`}
                >
                  {t('product_management')}
                </button>
                <button 
                  onClick={() => setActiveTab('arduino')}
                  className={`text-[10px] font-bold uppercase tracking-widest pb-1 border-b-2 transition-all ${activeTab === 'arduino' ? 'border-[#5A5A40] text-[#5A5A40] dark:border-[#8A8A6A] dark:text-[#8A8A6A]' : 'border-transparent text-gray-400'}`}
                >
                  {t('arduino')}
                </button>
              </div>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-200 dark:hover:bg-gray-800 rounded-full transition-colors dark:text-gray-400">
            <X className="w-6 h-6" />
          </button>
        </div>

        {activeTab !== 'arduino' && (
          <div className="p-6 bg-white dark:bg-black border-b dark:border-gray-800">
            <div className="flex gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
                <input 
                  type="text" 
                  placeholder={activeTab === 'users' ? t('search_email') : t('search_product_placeholder')} 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && fetchData()}
                  className="w-full pl-12 pr-4 py-3 bg-gray-50 dark:bg-[#111] rounded-2xl border-none focus:ring-2 focus:ring-[#5A5A40] dark:focus:ring-[#8A8A6A] transition-all dark:text-white"
                />
                <button 
                  onClick={fetchData}
                  className="absolute right-2 top-1/2 -translate-y-1/2 bg-[#5A5A40] dark:bg-[#8A8A6A] text-white px-4 py-1.5 rounded-xl text-sm font-bold"
                >
                  {t('search_button')}
                </button>
              </div>
              {activeTab === 'products' && (
                <div className="flex gap-2">
                  <select
                    value={filterCategory}
                    onChange={(e) => setFilterCategory(e.target.value)}
                    className="bg-gray-50 dark:bg-[#111] border-none rounded-2xl px-4 py-3 text-sm font-bold text-[#5A5A40] dark:text-[#8A8A6A] focus:ring-2 focus:ring-[#5A5A40] dark:focus:ring-[#8A8A6A] outline-none"
                  >
                    <option value="all">{t('all_categories')}</option>
                    <option value="Obst & Gemüse">{t('category_produce')}</option>
                    <option value="Bäckerei">{t('category_bakery')}</option>
                    <option value="Milchprodukte">{t('category_dairy')}</option>
                    <option value="Fleisch & Wurst">{t('category_meat')}</option>
                    <option value="Tiefkühl & Konserven">{t('category_frozen')}</option>
                    <option value="Snacks & Süßes">{t('category_snacks')}</option>
                    <option value="Getränke">{t('category_drinks')}</option>
                    <option value="Sonstiges">{t('category_other')}</option>
                  </select>
                  <div className="relative">
                    <button 
                      onClick={() => setShowUpdateConfirm(true)}
                      className="bg-gray-100 dark:bg-[#111] text-[#5A5A40] dark:text-[#8A8A6A] px-4 py-3 rounded-2xl flex items-center gap-2 font-bold hover:bg-gray-200 dark:hover:bg-gray-800 transition-all"
                      title={t('restore_defaults')}
                    >
                      <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
                    </button>
                    {showUpdateConfirm && (
                      <div className="absolute top-[calc(100%+8px)] right-0 z-[60] bg-white dark:bg-[#111] border border-gray-100 dark:border-gray-800 shadow-2xl rounded-2xl p-4 w-64 animate-in fade-in slide-in-from-top-2 duration-200">
                        <p className="text-sm text-[#1a1a1a] dark:text-white mb-4 font-bold">{t('restore_defaults')}</p>
                        <div className="flex gap-2">
                          <button 
                            onClick={async () => {
                              setShowUpdateConfirm(false);
                              setLoading(true);
                              try {
                                await forceUpdateDatabase();
                                await fetchData();
                              } catch (err) {
                                console.error('Error updating database:', err);
                              } finally {
                                setLoading(false);
                              }
                            }}
                            className="flex-1 bg-[#5A5A40] dark:bg-[#8A8A6A] text-white py-2 rounded-xl text-xs font-bold"
                          >
                            {t('yes')}
                          </button>
                          <button 
                            onClick={() => setShowUpdateConfirm(false)}
                            className="flex-1 bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 py-2 rounded-xl text-xs font-bold"
                          >
                            {t('no')}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="relative">
                    <button 
                      onClick={() => setShowDeleteConfirm(true)}
                      className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 px-4 py-3 rounded-2xl flex items-center gap-2 font-bold hover:bg-red-100 dark:hover:bg-red-900/30 transition-all"
                      title={t('delete')}
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                    {showDeleteConfirm && (
                      <div className="absolute top-[calc(100%+8px)] right-0 z-[60] bg-white dark:bg-[#111] border border-red-100 dark:border-red-900/30 shadow-2xl rounded-2xl p-4 w-64 animate-in fade-in slide-in-from-top-2 duration-200">
                        <p className="text-sm text-red-600 dark:text-red-400 mb-4 font-bold">{t('delete_all_warning')}</p>
                        <div className="flex gap-2">
                          <button 
                            onClick={async () => {
                              setShowDeleteConfirm(false);
                              setLoading(true);
                              try {
                                await deleteAllProducts();
                                await fetchData();
                              } catch (err) {
                                console.error('Error deleting all products:', err);
                              } finally {
                                setLoading(false);
                              }
                            }}
                            className="flex-1 bg-red-600 text-white py-2 rounded-xl text-xs font-bold"
                          >
                            {t('delete')}
                          </button>
                          <button 
                            onClick={() => setShowDeleteConfirm(false)}
                            className="flex-1 bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 py-2 rounded-xl text-xs font-bold"
                          >
                            {t('cancel')}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                  <button 
                    onClick={onNewProduct}
                    className="bg-[#5A5A40] text-white px-6 py-3 rounded-2xl flex items-center gap-2 font-bold shadow-lg hover:bg-[#4A4A30] transition-all"
                  >
                    <Plus className="w-5 h-5" /> {t('new')}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-6 bg-white dark:bg-black">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12">
              <div className="w-8 h-8 border-4 border-[#5A5A40] dark:border-[#8A8A6A] border-t-transparent rounded-full animate-spin mb-4"></div>
              <p className="text-gray-500 dark:text-gray-400">{t('loading')}</p>
            </div>
          ) : error ? (
            <div className="text-center py-12">
              <p className="text-red-500 font-medium">{error}</p>
              <button onClick={fetchData} className="mt-4 text-[#5A5A40] dark:text-[#8A8A6A] underline">{t('view_all')}</button>
            </div>
          ) : activeTab === 'users' ? (
            users.length === 0 ? (
              <div className="text-center py-12 text-gray-500 dark:text-gray-400">{t('no_users_found')}</div>
            ) : (
              <div className="space-y-6">
                {/* NEW USERS */}
                <div className="space-y-2">
                  <button 
                    onClick={() => toggleSection('new')}
                    className="flex items-center justify-between w-full p-2 hover:bg-gray-50 dark:hover:bg-white/5 rounded-xl transition-all"
                  >
                    <div className="flex items-center gap-3">
                      <Plus className="w-4 h-4 text-emerald-500" />
                      <span className="font-bold text-sm tracking-tight dark:text-white">Neu (letzte 3 Tage)</span>
                      <span className="bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400 text-[10px] px-2 py-0.5 rounded-full font-bold">
                        {categorizedUsers.new.length}
                      </span>
                    </div>
                    {expandedSections.new ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
                  </button>
                  {expandedSections.new && (
                    <div className="space-y-3 animate-in fade-in slide-in-from-top-2 duration-200">
                      {categorizedUsers.new.length === 0 ? (
                        <p className="text-xs text-center py-4 text-gray-400 italic">Keine neuen Nutzer</p>
                      ) : (
                        categorizedUsers.new.map(user => <UserItem key={user.uid} user={user} />)
                      )}
                    </div>
                  )}
                </div>

                {/* MARKED USERS */}
                <div className="space-y-2">
                  <button 
                    onClick={() => toggleSection('marked')}
                    className="flex items-center justify-between w-full p-2 hover:bg-gray-50 dark:hover:bg-white/5 rounded-xl transition-all"
                  >
                    <div className="flex items-center gap-3">
                      <Flag className="w-4 h-4 text-amber-500" />
                      <span className="font-bold text-sm tracking-tight dark:text-white">Markiert</span>
                      <span className="bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400 text-[10px] px-2 py-0.5 rounded-full font-bold">
                        {categorizedUsers.marked.length}
                      </span>
                    </div>
                    {expandedSections.marked ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
                  </button>
                  {expandedSections.marked && (
                    <div className="space-y-3 animate-in fade-in slide-in-from-top-2 duration-200">
                      {categorizedUsers.marked.length === 0 ? (
                        <p className="text-xs text-center py-4 text-gray-400 italic">Keine markierten Nutzer</p>
                      ) : (
                        categorizedUsers.marked.map(user => <UserItem key={user.uid} user={user} />)
                      )}
                    </div>
                  )}
                </div>

                {/* REST */}
                <div className="space-y-2">
                  <button 
                    onClick={() => toggleSection('rest')}
                    className="flex items-center justify-between w-full p-2 hover:bg-gray-50 dark:hover:bg-white/5 rounded-xl transition-all"
                  >
                    <div className="flex items-center gap-3">
                      <UserIcon className="w-4 h-4 text-blue-500" />
                      <span className="font-bold text-sm tracking-tight dark:text-white">Rest</span>
                      <span className="bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400 text-[10px] px-2 py-0.5 rounded-full font-bold">
                        {categorizedUsers.rest.length}
                      </span>
                    </div>
                    {expandedSections.rest ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
                  </button>
                  {expandedSections.rest && (
                    <div className="space-y-3 animate-in fade-in slide-in-from-top-2 duration-200">
                      {categorizedUsers.rest.length === 0 ? (
                        <p className="text-xs text-center py-4 text-gray-400 italic">Keine weiteren Nutzer</p>
                      ) : (
                        categorizedUsers.rest.map(user => <UserItem key={user.uid} user={user} />)
                      )}
                    </div>
                  )}
                </div>

                {/* IGNORED */}
                <div className="space-y-2 opacity-60">
                  <button 
                    onClick={() => toggleSection('ignored')}
                    className="flex items-center justify-between w-full p-2 hover:bg-gray-50 dark:hover:bg-white/5 rounded-xl transition-all"
                  >
                    <div className="flex items-center gap-3">
                      <EyeOff className="w-4 h-4 text-gray-500" />
                      <span className="font-bold text-sm tracking-tight dark:text-white">Ignoriert</span>
                      <span className="bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400 text-[10px] px-2 py-0.5 rounded-full font-bold">
                        {categorizedUsers.ignored.length}
                      </span>
                    </div>
                    {expandedSections.ignored ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
                  </button>
                  {expandedSections.ignored && (
                    <div className="space-y-3 animate-in fade-in slide-in-from-top-2 duration-200">
                      {categorizedUsers.ignored.length === 0 ? (
                        <p className="text-xs text-center py-4 text-gray-400 italic">Keine ignorierten Nutzer</p>
                      ) : (
                        categorizedUsers.ignored.map(user => <UserItem key={user.uid} user={user} />)
                      )}
                    </div>
                  )}
                </div>
              </div>
            )
          ) : activeTab === 'products' ? (
            products.length === 0 ? (
              <div className="text-center py-12 text-gray-500 dark:text-gray-400">{t('no_products_found')}</div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {products.map(product => (
                  <div key={product.id} className="flex items-center gap-4 p-4 bg-gray-50 dark:bg-[#0a0a0a] rounded-2xl border border-gray-100 dark:border-gray-800">
                    <div className="w-16 h-16 bg-white dark:bg-[#111] rounded-xl overflow-hidden flex-shrink-0 shadow-sm border dark:border-gray-800">
                      <img 
                        src={product.image} 
                        alt={product.name} 
                        className="w-full h-full object-contain p-2"
                        referrerPolicy="no-referrer"
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = `https://loremflickr.com/100/100/product`;
                        }}
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="font-bold text-[#1a1a1a] dark:text-white truncate">{product.name}</h4>
                      <div className="flex items-center gap-2">
                        <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{product.brand}</p>
                        <span className="text-[8px] font-bold uppercase tracking-wider bg-gray-200 dark:bg-gray-800 text-gray-600 dark:text-gray-400 px-1.5 py-0.5 rounded">
                          {product.category || t('category_other')}
                        </span>
                      </div>
                      <p className="text-xs font-mono text-gray-400 dark:text-gray-500">{product.id}</p>
                    </div>
                    <div className="flex gap-2">
                      <button 
                        onClick={() => onEditProduct?.(product)}
                        className="p-2 text-[#5A5A40] dark:text-[#8A8A6A] hover:bg-white dark:hover:bg-gray-800 rounded-lg transition-colors"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={async () => {
                          if (window.confirm(t('delete_confirm'))) {
                            await deleteDoc(doc(db, 'products', product.id));
                            fetchData();
                          }
                        }}
                        className="p-2 text-red-500 dark:text-red-400 hover:bg-white dark:hover:bg-gray-800 rounded-lg transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )
          ) : (
            <div className="space-y-6">
              <div className="bg-amber-50 dark:bg-amber-900/20 p-4 rounded-2xl border border-amber-100 dark:border-amber-900/30 flex gap-4">
                <Cpu className="w-8 h-8 text-amber-600 dark:text-amber-400 flex-shrink-0" />
                <div>
                  <h4 className="font-bold text-amber-900 dark:text-amber-200">{t('arduino_integration')}</h4>
                  <p className="text-sm text-amber-800 dark:text-amber-300">
                    {t('arduino_desc')}
                  </p>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <h5 className="text-sm font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-2">{t('api_endpoints')}</h5>
                  <div className="space-y-2">
                    <div className="p-3 bg-gray-50 dark:bg-[#0a0a0a] rounded-xl flex justify-between items-center border dark:border-gray-800">
                      <span className="text-xs font-mono dark:text-gray-300">POST /api/arduino/update</span>
                      <span className="text-[10px] bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 px-2 py-0.5 rounded-full font-bold">{t('sensor_update')}</span>
                    </div>
                    <div className="p-3 bg-gray-50 dark:bg-[#0a0a0a] rounded-xl flex justify-between items-center border dark:border-gray-800">
                      <span className="text-xs font-mono dark:text-gray-300">GET /api/arduino/status</span>
                      <span className="text-[10px] bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 px-2 py-0.5 rounded-full font-bold">{t('get_status')}</span>
                    </div>
                    <div className="p-3 bg-gray-50 dark:bg-[#0a0a0a] rounded-xl flex justify-between items-center border dark:border-gray-800">
                      <span className="text-xs font-mono dark:text-gray-300">GET /api/arduino/tasks</span>
                      <span className="text-[10px] bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400 px-2 py-0.5 rounded-full font-bold">{t('tasks_label')}</span>
                    </div>
                  </div>
                </div>

                <div>
                  <div className="flex justify-between items-center mb-2">
                    <h5 className="text-sm font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest">Arduino Sketch (ESP32/ESP8266)</h5>
                    <button 
                      onClick={copyToClipboard}
                      className="flex items-center gap-1 text-xs font-bold text-[#5A5A40] dark:text-[#8A8A6A] hover:underline"
                    >
                      {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                      {copied ? t('copied') : t('copy_code')}
                    </button>
                  </div>
                  <pre className="bg-gray-900 p-4 rounded-2xl text-[10px] overflow-x-auto font-mono leading-relaxed text-gray-300 border border-gray-800">
                    {arduinoCode}
                  </pre>
                </div>
              </div>
            </div>
          )}
        </div>
        
        <div className="p-6 bg-gray-50 dark:bg-[#0a0a0a] text-center text-xs text-gray-400 dark:text-gray-500 border-t dark:border-gray-800">
          {t('admin_warning')}
        </div>
      </motion.div>
    </motion.div>
  );
}
