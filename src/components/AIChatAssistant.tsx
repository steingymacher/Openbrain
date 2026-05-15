import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { MessageSquare, X, Send, Sparkles, Loader2, ShoppingBasket, Leaf, ChevronLeft, MapPin, Sparkle, ChefHat, Check, Plus, RefreshCw } from 'lucide-react';
import { getAIChatResponse, ChatMessage } from '../services/aiService';
import { Product, GreenhouseStatus, UserProfile } from '../types';
import { useTranslation } from '../lib/LanguageContext';
import { collection, getDocs, doc, onSnapshot, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { handleFirestoreError, OperationType } from '../lib/firestore-errors';
import { cn } from '../lib/utils';

interface AIChatAssistantProps {
  userProfile: UserProfile;
  currentCart: Product[];
  onSaveCart: (name: string) => Promise<void>;
}

export default function AIChatAssistant({ userProfile, currentCart, onSaveCart }: AIChatAssistantProps) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [greenhouse, setGreenhouse] = useState<GreenhouseStatus | undefined>();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      const timeout = setTimeout(() => {
        loadContext();
      }, 300);
      return () => clearTimeout(timeout);
    }
  }, [isOpen]);

  const loadContext = async () => {
    try {
      const prodSnap = await getDocs(collection(db, 'products'));
      setProducts(prodSnap.docs.map(d => d.data() as Product));
      
      onSnapshot(doc(db, 'greenhouse_status', 'current'), (snap) => {
        if (snap.exists()) setGreenhouse(snap.data() as GreenhouseStatus);
      });
    } catch (err) {
      console.error("AI context loading error:", err);
    }
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  const handleSend = async (text: string = input) => {
    if (!text.trim() || isTyping) return;

    const userMsg: ChatMessage = { role: 'user', text };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsTyping(true);

    let fullResponse = '';
    const responseMsg: ChatMessage = { role: 'model', text: '' };
    setMessages(prev => [...prev, responseMsg]);

    try {
      const stream = getAIChatResponse(text, messages, {
        products,
        greenhouse,
        profile: userProfile
      });

      for await (const chunk of stream) {
        fullResponse += chunk;
        
        // Check for data block
        let aiData = null;
        const dataMatch = fullResponse.match(/\[DATA:(\{[\s\S]*\})\]/);
        if (dataMatch && dataMatch[1]) {
          try {
            // Attempt to parse the data block
            aiData = JSON.parse(dataMatch[1].trim());
          } catch (e) {
            // Partial or malformed JSON, ignore until complete
          }
        }

        // Fallback for simple blocks like save_current_cart
        if (!aiData) {
          const simpleMatch = fullResponse.match(/\[DATA:({"type":\s*"save_current_cart"})\]/);
          if (simpleMatch && simpleMatch[1]) {
            try {
              aiData = JSON.parse(simpleMatch[1]);
            } catch (e) {}
          }
        }

        setMessages(prev => {
          const newMessages = [...prev];
          newMessages[newMessages.length - 1] = { 
            role: 'model', 
            text: fullResponse,
            recipeData: aiData // We use the same field for both recipe and list data for now
          };
          return newMessages;
        });
      }
    } catch (err) {
      console.error("Chat error:", err);
    } finally {
      setIsTyping(false);
    }
  };

  const resetChat = () => {
    setMessages([]);
    setInput('');
  };

  const handleAcceptData = async (data: any) => {
    if (!data) return;
    
    if (data.type === 'save_current_cart') {
      if (currentCart.length === 0) {
        setMessages(prev => [...prev, { role: 'model', text: "Dein Warenkorb ist aktuell leer. Füge erst etwas hinzu!" }]);
        return;
      }
      try {
        const name = `Warenkorb ${new Date().toLocaleDateString('de-DE')}`;
        await onSaveCart(name);
        setMessages(prev => [...prev, { role: 'model', text: `Erledigt! Ich habe deinen aktuellen Warenkorb als "${name}" gespeichert.` }]);
      } catch (err) {
        console.error("Save cart error:", err);
      }
      return;
    }

    if (data.type === 'shopping_list') {
      try {
        const items = data.items.map((ing: any) => {
          const found = products.find(p => p.id === ing.id || p.name.toLowerCase().includes(ing.name.toLowerCase()));
          if (found) {
            return { ...found, quantity: 1 };
          }
          return {
            id: `placeholder_${Date.now()}_${Math.random()}`,
            name: ing.name,
            brand: 'KI Vorschlag',
            image: 'https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&q=80&w=200',
            price: 0.99,
            category: 'Vorratsschrank',
            co2: 0.1,
            kcal: 0,
            proteins: 0,
            carbs: 0,
            fat: 0,
            sugar: 0,
            ingredients: [],
            allergens: [],
            quantity: 1
          };
        });

        await addDoc(collection(db, 'shopping_lists'), {
          userId: userProfile.uid,
          name: data.name,
          items,
          createdAt: serverTimestamp()
        });
        
        setMessages(prev => [
          ...prev, 
          { 
            role: 'model', 
            text: `Erfolgreich! Ich habe "${data.name}" zu deinen Einkaufslisten hinzugefügt. ✨` 
          }
        ]);
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, 'shopping_lists');
      }
    }
  };

  const suggestions = [
    { label: "Vorschlag: Einkaufsliste", icon: ShoppingBasket, prompt: "Schlage mir eine Einkaufsliste für ein CO2-bewusstes, veganes Abendessen für 2 Personen vor. Füge am Ende den [DATA] Block ein." },
    { label: "CO2-bewusste Rezepte", icon: ChefHat, prompt: "Schlage mir 3 CO2-bewusste Rezepte vor, die ich mit den Produkten aus dem Shop kochen kann." },
    { label: "Was ist heute frisch?", icon: Leaf, prompt: "Was ist heute besonders frisch im Gewächshaus oder Shop?" },
    { label: "Warenkorb optimieren", icon: Sparkle, prompt: "Ich plane meinen Einkauf. Was könnte ich an meinem Warenkorb ändern, um ihn gesünder oder nachhaltiger zu machen?" },
    ...(currentCart.length > 0 ? [{ label: "Warenkorb speichern", icon: Check, prompt: "Speichere bitte meinen aktuellen Warenkorb als Einkaufsliste." }] : []),
  ];

  const cleanText = (text: string) => {
    return text.replace(/\[DATA:[\s\S]*?\](?![\s\S]*?\])/g, '').replace(/\[DATA:[\s\S]*?\]/g, '').replace(/\[RECIPE_DATA:[\s\S]*?\]/g, '').replace(/\*\*/g, '').trim();
  };

  return (
    <>
      {/* Floating Button */}
      <AnimatePresence>
        {!isOpen && (
          <motion.button
            id="ai-assistant-bubble"
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setIsOpen(true)}
            className="fixed bottom-6 right-6 sm:bottom-8 sm:right-8 w-16 h-16 bg-[#5A5A40] text-white rounded-full shadow-[0_10px_40px_rgba(0,0,0,0.2)] flex items-center justify-center z-[5000] overflow-hidden border-2 border-white"
          >
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 10, repeat: Infinity, ease: "linear" }}
            >
              <Sparkles className="w-8 h-8" />
            </motion.div>
          </motion.button>
        )}
      </AnimatePresence>

      {/* Chat Window */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 100, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 100, scale: 0.95 }}
            className="fixed inset-x-0 top-0 bottom-0 sm:inset-auto sm:bottom-28 sm:right-8 w-full sm:w-[420px] sm:h-[650px] bg-white dark:bg-[#1a1a1a] sm:rounded-[40px] shadow-2xl z-[10000] flex flex-col overflow-hidden animate-in fade-in slide-in-from-bottom-10 duration-300 transition-colors h-[100dvh] sm:h-[650px]"
          >
            {/* Header */}
            <div className="p-6 bg-[#5A5A40] dark:bg-black/80 backdrop-blur-md text-white flex items-center justify-between shadow-xl border-b border-white/5 relative overflow-hidden shrink-0">
              <div className="absolute inset-0 bg-gradient-to-r from-white/5 to-transparent pointer-events-none" />
              <div className="flex items-center gap-3 relative z-10">
                <AnimatePresence mode="wait">
                  {messages.length > 0 && (
                    <motion.button 
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -10 }}
                      onClick={resetChat}
                      className="p-1.5 hover:bg-white/10 rounded-full transition-colors mr-1"
                      title="Zurück zum Hauptmenü"
                    >
                      <ChevronLeft className="w-6 h-6" />
                    </motion.button>
                  )}
                </AnimatePresence>
                <div className="w-11 h-11 bg-white/20 rounded-2xl flex items-center justify-center shadow-inner backdrop-blur-sm">
                  <Sparkles className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h3 className="font-serif font-black text-xl leading-tight tracking-tight">Acker-Assistent</h3>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
                    <p className="text-[10px] uppercase font-black tracking-widest text-white/50">KI-Experte online</p>
                  </div>
                </div>
              </div>
              <button 
                onClick={() => setIsOpen(false)}
                className="p-2 hover:bg-white/10 rounded-full transition-colors relative z-10"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6 overscroll-contain bg-[#FDFDFB] dark:bg-[#050505] selection:bg-[#5A5A40]/20 transition-colors">
              {messages.length === 0 && (
                <div className="space-y-8 mt-4 animate-in fade-in slide-in-from-bottom-5 duration-700">
                  <div className="text-center space-y-4">
                    <div className="mx-auto w-16 h-16 bg-[#5A5A40]/5 dark:bg-white/5 rounded-[24px] flex items-center justify-center">
                      <ChefHat className="w-8 h-8 text-[#5A5A40] dark:text-[#a0a090]" />
                    </div>
                    <div>
                      <h4 className="text-lg font-serif font-bold text-gray-900 dark:text-white">Wie kann ich helfen?</h4>
                      <p className="text-gray-500 dark:text-gray-400 text-sm mt-1 max-w-[240px] mx-auto leading-relaxed">
                        Ich bin dein Experte für nachhaltigen Genuss im Food-Connect-Markt.
                      </p>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-1 gap-3">
                    <button
                      onClick={() => handleSend("Hallo! Ich möchte einfach mit dir chatten.")}
                      className="flex items-center gap-3 p-4 bg-white dark:bg-[#111] rounded-3xl border border-gray-100 dark:border-white/5 text-left hover:border-[#5A5A40]/40 hover:bg-gray-50 dark:hover:bg-[#151515] hover:shadow-md transition-all group"
                    >
                      <div className="p-2 bg-[#5A5A40]/10 rounded-xl group-hover:bg-[#5A5A40]/20 transition-colors">
                        <MessageSquare className="w-5 h-5 text-[#5A5A40]" />
                      </div>
                      <div>
                        <span className="text-sm font-bold text-gray-900 dark:text-white block group-hover:text-[#5A5A40] transition-colors">Einfach Chatten</span>
                        <span className="text-[10px] text-gray-400 dark:text-gray-500 font-medium">Ich beantworte alle deine Fragen</span>
                      </div>
                    </button>

                    <div className="flex items-center gap-4 my-4">
                      <div className="h-px bg-gray-100 dark:bg-white/5 flex-1" />
                      <p className="text-[10px] uppercase font-black tracking-[0.2em] text-gray-300 dark:text-gray-600">Schnellzugriff</p>
                      <div className="h-px bg-gray-100 dark:bg-white/5 flex-1" />
                    </div>

                    <div className="grid grid-cols-1 gap-2.5">
                      {suggestions.map((s, i) => (
                        <button
                          key={i}
                          onClick={() => setInput(s.prompt)}
                          className="flex items-center gap-3 p-4 bg-white dark:bg-[#111] rounded-2xl border border-gray-100 dark:border-white/5 text-left hover:border-[#5A5A40]/30 hover:bg-gray-50 dark:hover:bg-[#151515] hover:shadow-sm transition-all group"
                        >
                          <div className="p-2 bg-gray-50 dark:bg-[#1a1a1a] rounded-[14px] group-hover:bg-[#5A5A40]/10 transition-colors">
                            <s.icon className="w-5 h-5 text-gray-400 dark:text-gray-500 group-hover:text-[#5A5A40] dark:group-hover:text-[#a0a090]" />
                          </div>
                          <span className="text-sm font-semibold text-gray-700 dark:text-gray-300 group-hover:text-gray-900 dark:group-hover:text-white transition-colors">{s.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              <div className="space-y-6">
                {messages.map((msg, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, y: 12, scale: 0.97 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{ type: "spring", damping: 25, stiffness: 350 }}
                    className={cn(
                      "flex group",
                      msg.role === 'user' ? "justify-end" : "justify-start"
                    )}
                  >
                    <div
                      className={cn(
                        "max-w-[88%] p-4.5 rounded-[28px] shadow-sm relative",
                        msg.role === 'user'
                          ? "bg-gradient-to-br from-[#5A5A40] to-[#4A4A30] text-white rounded-tr-none shadow-lg shadow-[#5A5A40]/10"
                          : "bg-white dark:bg-[#1a1a1a] text-gray-800 dark:text-gray-100 rounded-tl-none border border-gray-100 dark:border-[#2a2a2a] shadow-sm"
                      )}
                    >
                      <p className="text-[15px] leading-[1.6] whitespace-pre-wrap font-medium">{cleanText(msg.text)}</p>
                      
                      {msg.recipeData && msg.role === 'model' && (
                        <motion.div 
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="mt-5 p-4 bg-[#F5F5F0] dark:bg-black/30 rounded-2xl border border-[#5A5A40]/10 dark:border-white/5 flex flex-col gap-4 shadow-inner"
                        >
                          <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 bg-[#5A5A40]/10 dark:bg-white/5 rounded-full flex items-center justify-center">
                              {msg.recipeData.type === 'save_current_cart' ? <ShoppingBasket className="w-4 h-4 text-[#5A5A40]" /> : <ChefHat className="w-4 h-4 text-[#5A5A40]" />}
                            </div>
                            <span className="text-[10px] font-black uppercase tracking-[0.15em] text-[#5A5A40] dark:text-[#a0a090] opacity-80">
                              {msg.recipeData.type === 'save_current_cart' ? 'Aktion Verfügbar' : 'Vorschlag Verarbeiten'}
                            </span>
                          </div>
                          <button
                            onClick={() => handleAcceptData(msg.recipeData)}
                            className="flex items-center justify-center gap-3 w-full py-4 bg-[#5A5A40] text-white rounded-xl text-sm font-bold hover:shadow-[0_8px_20px_-4px_rgba(90,90,64,0.4)] transition-all active:scale-[0.97] hover:-translate-y-0.5"
                          >
                            {msg.recipeData.type === 'save_current_cart' ? <Check className="w-5 h-5" /> : <Plus className="w-5 h-5" />}
                            {msg.recipeData.type === 'save_current_cart' ? 'Warenkorb jetzt speichern' : 'Zur Einkaufsliste'}
                          </button>
                        </motion.div>
                      )}
                    </div>
                  </motion.div>
                ))}
              </div>
              
              {isTyping && (
                <div className="flex justify-start">
                  <div className="bg-white dark:bg-[#1a1a1a] p-5 rounded-[28px] rounded-tl-none border border-gray-100 dark:border-white/5 shadow-sm">
                    <div className="flex gap-1.5 items-center">
                      <motion.span animate={{ scale: [1, 1.2, 1], opacity: [0.3, 1, 0.3] }} transition={{ duration: 1.2, repeat: Infinity }} className="w-2 h-2 bg-[#5A5A40] rounded-full" />
                      <motion.span animate={{ scale: [1, 1.2, 1], opacity: [0.3, 1, 0.3] }} transition={{ duration: 1.2, repeat: Infinity, delay: 0.2 }} className="w-2 h-2 bg-[#5A5A40] rounded-full" />
                      <motion.span animate={{ scale: [1, 1.2, 1], opacity: [0.3, 1, 0.3] }} transition={{ duration: 1.2, repeat: Infinity, delay: 0.4 }} className="w-2 h-2 bg-[#5A5A40] rounded-full" />
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
          <div className="p-4 sm:p-6 bg-white dark:bg-[#111] border-t border-gray-100 dark:border-white/5 flex flex-col gap-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] transition-colors relative z-20">
            <div className="flex gap-2.5 overflow-x-auto no-scrollbar -mx-2 px-2 pb-1">
               <button 
                onClick={() => handleSend("Schlage mir eine Einkaufsliste für 3 gesunde Mahlzeiten vor. Füge am Ende den [DATA] Block ein.")}
                className="flex-shrink-0 flex items-center gap-2 px-5 py-2.5 bg-[#5A5A40]/5 hover:bg-[#5A5A40]/10 dark:bg-white/5 dark:hover:bg-white/10 text-[#5A5A40] dark:text-[#a0a090] rounded-full text-[10px] font-black uppercase tracking-wider transition-all shadow-sm border border-[#5A5A40]/10"
               >
                 <ChefHat className="w-3.5 h-3.5" />
                 Einkaufszettel erstellen
               </button>
               {currentCart.length > 0 && (
                 <button 
                  onClick={() => handleAcceptData({ type: 'save_current_cart' })}
                  className="flex-shrink-0 flex items-center gap-2 px-5 py-2.5 bg-orange-50/50 hover:bg-orange-100/50 dark:bg-orange-950/20 dark:hover:bg-orange-900/30 text-orange-700 dark:text-orange-400 rounded-full text-[10px] font-black uppercase tracking-wider transition-all shadow-sm border border-orange-100/30"
                 >
                   <ShoppingBasket className="w-3.5 h-3.5" />
                   Warenkorb speichern
                 </button>
               )}
            </div>
            
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSend();
              }}
              className="relative group block"
            >
              <div className="relative bg-gray-50 dark:bg-white/5 rounded-[30px] p-1.5 border border-gray-200 dark:border-white/10 focus-within:border-[#5A5A40]/50 focus-within:bg-white dark:focus-within:bg-black focus-within:shadow-[0_12px_40px_rgba(0,0,0,0.08)] dark:focus-within:shadow-[0_12px_40px_rgba(0,0,0,0.3)] transition-all duration-300">
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Frag den Acker-Assistenten..."
                  rows={2}
                  className="w-full bg-transparent border-none focus:ring-0 text-[15px] px-5 py-3.5 resize-none font-medium text-gray-800 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-600"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSend();
                    }
                  }}
                />
                <div className="flex justify-between items-center px-4 pb-2.5">
                  <div className="flex items-center gap-3">
                    <span className="text-[9px] text-gray-300 dark:text-gray-600 font-bold uppercase tracking-[0.1em]">Shift+⏎ für Absatz</span>
                  </div>
                  <button
                    type="submit"
                    disabled={!input.trim() || isTyping}
                    className="w-11 h-11 bg-[#5A5A40] text-white rounded-[20px] flex items-center justify-center disabled:opacity-20 transition-all shadow-lg active:scale-90 hover:shadow-[#5A5A40]/20"
                  >
                    {isTyping ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
                  </button>
                </div>
              </div>
            </form>

            <div className="flex justify-center -mb-2">
              <button 
                onClick={resetChat}
                className="flex items-center gap-2 px-4 py-2 rounded-full hover:bg-gray-50 dark:hover:bg-white/5 text-[10px] text-gray-400 dark:text-gray-600 uppercase font-bold tracking-widest transition-all"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                {t('reset_chat')}
              </button>
            </div>
          </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
