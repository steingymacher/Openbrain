import React, { useState, useEffect, useRef } from 'react';
import { auth, db } from '../firebase';
import { Chat, Message, UserProfile } from '../types';
import { chatService } from '../services/chatService';
import { motion, AnimatePresence } from 'motion/react';
import { MessageSquare, Send, ChevronLeft, User, Package, Clock } from 'lucide-react';
import { cn } from '../lib/utils';
import { useTranslation } from '../lib/LanguageContext';
import { doc, getDoc } from 'firebase/firestore';

interface ChatViewProps {
  userProfile: UserProfile;
  initialChatId?: string | null;
  onClose?: () => void;
}

export default function ChatView({ userProfile, initialChatId, onClose }: ChatViewProps) {
  const { t } = useTranslation();
  const [chats, setChats] = useState<Chat[]>([]);
  const [selectedChat, setSelectedChat] = useState<Chat | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [participantsInfo, setParticipantsInfo] = useState<Record<string, string>>({});
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const unsub = chatService.subscribeToUserChats(userProfile.uid, (updatedChats) => {
      setChats(updatedChats);
    });

    return () => unsub();
  }, [userProfile.uid]);

  // Handle initial selection
  useEffect(() => {
    if (initialChatId && chats.length > 0 && !selectedChat) {
      const found = chats.find(c => c.id === initialChatId);
      if (found) setSelectedChat(found);
    }
  }, [initialChatId, chats, selectedChat]);

  useEffect(() => {
    if (!selectedChat) {
      setMessages([]);
      return;
    }

    const unsub = chatService.subscribeToMessages(selectedChat.id, (updatedMessages) => {
      setMessages(updatedMessages);
    });

    // Fetch participant info if missing
    selectedChat.participants.forEach(async (id) => {
      if (id !== userProfile.uid && !participantsInfo[id]) {
        try {
          const userDoc = await getDoc(doc(db, 'users', id));
          if (userDoc.exists()) {
            setParticipantsInfo(prev => ({ ...prev, [id]: userDoc.data().name }));
          }
        } catch (error) {
          console.error('Error fetching user profile:', error);
        }
      }
    });

    return () => unsub();
  }, [selectedChat, userProfile.uid]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedChat || !newMessage.trim()) return;

    try {
      await chatService.sendMessage(selectedChat.id, newMessage.trim());
      setNewMessage('');
    } catch (error) {
      console.error('Error sending message:', error);
    }
  };

  const getOtherParticipantName = (chat: Chat) => {
    const otherId = chat.participants.find(id => id !== userProfile.uid);
    return otherId ? (participantsInfo[otherId] || '...') : 'Unbekannt';
  };

  return (
    <div className="bg-white dark:bg-[#1a1a1a] rounded-[40px] shadow-xl border border-gray-100 dark:border-gray-800 overflow-hidden h-[600px] flex transition-colors">
      {/* Sidebar - Chat List */}
      <div className={cn(
        "w-full sm:w-80 border-r border-gray-50 dark:border-gray-800 flex flex-col transition-all",
        selectedChat && "hidden sm:flex"
      )}>
        <div className="p-6 border-b border-gray-50 dark:border-gray-800">
          <h3 className="text-xl font-serif font-bold text-[#1a1a1a] dark:text-white flex items-center gap-2 transition-colors">
            <MessageSquare className="w-6 h-6 text-[#5A5A40]" />
            {t('messages' as any) || 'Nachrichten'}
          </h3>
        </div>
        
        <div className="flex-1 overflow-y-auto no-scrollbar bg-white dark:bg-[#1a1a1a] transition-colors">
          {chats.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full p-8 text-center text-gray-400 dark:text-gray-600">
              <MessageSquare className="w-12 h-12 mb-4 opacity-10" />
              <p className="text-sm font-medium">{t('no_messages' as any) || 'Noch keine Nachrichten'}</p>
            </div>
          ) : (
            chats.map(chat => (
              <button
                key={chat.id}
                onClick={() => setSelectedChat(chat)}
                className={cn(
                  "w-full p-6 flex gap-4 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors border-b border-gray-50 dark:border-gray-800 text-left relative",
                  selectedChat?.id === chat.id && "bg-[#5A5A40]/5 dark:bg-[#5A5A40]/10"
                )}
              >
                <div className="w-12 h-12 bg-gray-100 dark:bg-white/5 rounded-full flex items-center justify-center flex-shrink-0">
                  <User className="w-6 h-6 text-gray-400 dark:text-gray-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-start mb-1">
                    <h4 className="font-bold text-[#1a1a1a] dark:text-white truncate transition-colors">{getOtherParticipantName(chat)}</h4>
                    <span className="text-[10px] text-gray-400 dark:text-gray-500 font-bold uppercase tracking-widest">
                      {chat.lastMessageTimestamp?.toDate ? chat.lastMessageTimestamp.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '...'}
                    </span>
                  </div>
                  <p className="text-xs text-[#5A5A40] dark:text-[#a0a090] font-bold truncate mb-1 flex items-center gap-1 transition-colors">
                    <Package className="w-3 h-3" /> {chat.offerTitle}
                  </p>
                  <p className="text-xs text-gray-400 dark:text-gray-500 truncate transition-colors">{chat.lastMessage || (t('start_conversation' as any) || 'Schreibe eine Nachricht...')}</p>
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Main Content - Chat Window */}
      <div className={cn(
        "flex-1 flex flex-col bg-gray-50/50 dark:bg-[#121212]/50 transition-colors",
        !selectedChat && "hidden sm:flex items-center justify-center text-gray-400 dark:text-gray-600"
      )}>
        {selectedChat ? (
          <>
            {/* Chat Header */}
            <div className="bg-white dark:bg-[#1a1a1a] p-4 sm:p-6 border-b border-gray-50 dark:border-gray-800 flex items-center gap-4 transition-colors">
              <button 
                onClick={() => setSelectedChat(null)}
                className="sm:hidden p-2 hover:bg-gray-100 dark:hover:bg-white/10 rounded-full transition-colors"
              >
                <ChevronLeft className="w-6 h-6 dark:text-white" />
              </button>
              <div className="w-10 h-10 bg-gray-100 dark:bg-white/5 rounded-full flex items-center justify-center transition-colors">
                <User className="w-5 h-5 text-gray-400 dark:text-gray-600" />
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="font-bold text-[#1a1a1a] dark:text-white truncate transition-colors">{getOtherParticipantName(selectedChat)}</h4>
                <p className="text-[10px] text-[#5A5A40] dark:text-[#a0a090] font-black uppercase tracking-widest flex items-center gap-1 transition-colors">
                  <Package className="w-3 h-3" /> {selectedChat.offerTitle}
                </p>
              </div>
            </div>

            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4 no-scrollbar">
              {messages.map((msg, idx) => {
                const isMe = msg.senderId === userProfile.uid;
                const showDate = idx === 0 || 
                  (messages[idx-1].timestamp?.toDate && msg.timestamp?.toDate && 
                   messages[idx-1].timestamp.toDate().toDateString() !== msg.timestamp.toDate().toDateString());

                return (
                  <div key={msg.id} className="space-y-2">
                    {showDate && msg.timestamp?.toDate && (
                      <div className="flex justify-center my-4">
                        <span className="px-3 py-1 bg-gray-200 dark:bg-gray-800 text-gray-500 dark:text-gray-400 text-[10px] font-bold rounded-full uppercase tracking-widest transition-colors">
                          {msg.timestamp.toDate().toLocaleDateString()}
                        </span>
                      </div>
                    )}
                    <div className={cn(
                      "flex",
                      isMe ? "justify-end" : "justify-start"
                    )}>
                      <div className={cn(
                        "max-w-[80%] p-4 rounded-3xl text-sm shadow-sm transition-all",
                        isMe ? "bg-[#5A5A40] text-white rounded-br-none" : "bg-white dark:bg-[#1a1a1a] text-gray-800 dark:text-gray-200 rounded-bl-none border border-gray-100 dark:border-gray-800"
                      )}>
                        <p>{msg.text}</p>
                        <div className={cn(
                          "text-[9px] mt-1 flex items-center gap-1 opacity-70",
                          isMe ? "justify-end text-white/70" : "justify-start text-gray-400 dark:text-gray-500"
                        )}>
                          <Clock className="w-2.5 h-2.5" />
                          {msg.timestamp?.toDate ? msg.timestamp.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '...'}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <form onSubmit={handleSendMessage} className="p-6 bg-white dark:bg-[#1a1a1a] border-t border-gray-50 dark:border-gray-800 flex gap-4 transition-colors">
              <input
                type="text"
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                placeholder={t('write_message' as any) || 'Nachricht schreiben...'}
                className="flex-1 px-6 py-4 bg-gray-50 dark:bg-white/5 rounded-2xl border-none focus:ring-2 focus:ring-[#5A5A40]/20 outline-none text-sm dark:text-white transition-colors placeholder:text-gray-400 dark:placeholder:text-gray-600"
              />
              <button
                type="submit"
                disabled={!newMessage.trim()}
                className="w-14 h-14 bg-[#5A5A40] text-white rounded-2xl flex items-center justify-center shadow-lg hover:bg-[#4a4a35] transition-all disabled:opacity-50"
              >
                <Send className="w-6 h-6" />
              </button>
            </form>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center p-12 text-center">
            <MessageSquare className="w-16 h-16 mb-4 opacity-5 dark:opacity-10" />
            <h3 className="text-2xl font-serif font-bold text-gray-300 dark:text-gray-700 transition-colors">{t('select_chat' as any) || 'Wähle einen Chat aus'}</h3>
            <p className="text-gray-400 dark:text-gray-600 mt-2 max-w-xs transition-colors">{t('select_chat_desc' as any) || 'Klicke auf eine Unterhaltung, um die Nachrichten zu sehen.'}</p>
          </div>
        )}
      </div>
    </div>
  );
}
