import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Users, 
  Plus, 
  LogIn, 
  ChevronRight, 
  X, 
  Copy, 
  Check, 
  UserPlus, 
  ShoppingBag,
  ThumbsUp,
  ThumbsDown,
  Clock,
  CheckCircle2,
  XCircle,
  LogOut,
  Trash2
} from 'lucide-react';
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  doc, 
  deleteDoc,
  serverTimestamp,
  getDocs,
  arrayUnion,
  arrayRemove,
  orderBy,
  writeBatch
} from 'firebase/firestore';
import { auth, db } from '../firebase';
import { useTranslation } from '../lib/LanguageContext';
import { handleFirestoreError, OperationType } from '../lib/firestore-errors';
import { cn } from '../lib/utils';
import { Product } from '../types';

interface Group {
  id: string;
  name: string;
  ownerId: string;
  inviteCode: string;
  password: string;
  members: string[];
  createdAt: any;
}

interface PurchaseRequest {
  id: string;
  groupId: string;
  requesterId: string;
  requesterName: string;
  productId: string;
  productName: string;
  status: 'pending' | 'approved' | 'rejected';
  approvals: string[];
  rejections: string[];
  createdAt: any;
}

interface GroupsViewProps {
  onClose?: () => void;
  onAddToCart: (product: Product) => void;
  products: Product[];
  isEmbedded?: boolean;
}

export const GroupsView: React.FC<GroupsViewProps> = ({ onClose, onAddToCart, products, isEmbedded = false }) => {
  const { t } = useTranslation();
  const [groups, setGroups] = useState<Group[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<Group | null>(null);
  const [requests, setRequests] = useState<PurchaseRequest[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupPassword, setNewGroupPassword] = useState('');
  const [inviteCodeInput, setInviteCodeInput] = useState('');
  const [invitePasswordInput, setInvitePasswordInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isVoting, setIsVoting] = useState<string | null>(null);
  const [deletingGroup, setDeletingGroup] = useState(false);

  useEffect(() => {
    if (!auth.currentUser) return;

    const q = query(
      collection(db, 'groups'),
      where('members', 'array-contains', auth.currentUser.uid)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const groupsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Group[];
      setGroups(groupsData);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'groups');
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!selectedGroup) {
      setRequests([]);
      return;
    }

    const q = query(
      collection(db, 'purchase_requests'),
      where('groupId', '==', selectedGroup.id),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const requestsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as PurchaseRequest[];
      setRequests(requestsData);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'purchase_requests');
    });

    return () => unsubscribe();
  }, [selectedGroup]);

  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth.currentUser || !newGroupName.trim() || !newGroupPassword.trim()) return;

    const inviteCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    const batch = writeBatch(db);
    const groupRef = doc(collection(db, 'groups'));
    const inviteRef = doc(db, 'invite_codes', inviteCode);
    
    try {
      batch.set(groupRef, {
        name: newGroupName,
        ownerId: auth.currentUser.uid,
        inviteCode,
        password: newGroupPassword,
        members: [auth.currentUser.uid],
        createdAt: serverTimestamp()
      });

      batch.set(inviteRef, {
        groupId: groupRef.id,
        password: newGroupPassword
      });

      await batch.commit();

      setNewGroupName('');
      setNewGroupPassword('');
      setIsCreating(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'groups');
    }
  };

  const handleJoinGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth.currentUser || !inviteCodeInput.trim() || !invitePasswordInput.trim()) return;

    try {
      const inviteCode = inviteCodeInput.trim().toUpperCase();
      const inviteSnap = await getDocs(query(collection(db, 'invite_codes'), where('__name__', '==', inviteCode)));
      
      if (inviteSnap.empty) {
        alert('Invalid invite code');
        return;
      }

      const inviteData = inviteSnap.docs[0].data();
      if (inviteData.password !== invitePasswordInput) {
        alert(t('wrong_password'));
        return;
      }

      const groupId = inviteData.groupId;
      await updateDoc(doc(db, 'groups', groupId), {
        members: arrayUnion(auth.currentUser.uid)
      });

      setInviteCodeInput('');
      setInvitePasswordInput('');
      setIsJoining(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'groups');
    }
  };

  const handleVote = async (requestId: string, type: 'approve' | 'decline') => {
    if (!auth.currentUser) return;

    const requestRef = doc(db, 'purchase_requests', requestId);
    const request = requests.find(r => r.id === requestId);
    if (!request || isVoting === requestId) return;
    setIsVoting(requestId);

    try {
      if (type === 'decline') {
        // "wenn abgelehnt wird dann ist das Produkt weg"
        await deleteDoc(requestRef);
        return;
      }

      // "akzeptieren indem man es in den Warenkorb einfügt"
      const product = products.find(p => p.id === request.productId);
      if (product) {
        onAddToCart(product);
      }

      // After adding to cart, the request should disappear ("verschwinden")
      await deleteDoc(requestRef);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'purchase_requests');
    } finally {
      setIsVoting(null);
    }
  };

  const handleCancelRequest = async (requestId: string) => {
    if (!window.confirm(t('confirm_delete' as any))) return;
    try {
      await deleteDoc(doc(db, 'purchase_requests', requestId));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, 'purchase_requests');
    }
  };

  const handleLeaveGroup = async () => {
    if (!selectedGroup || !auth.currentUser) return;
    if (!window.confirm(t('confirm_leave' as any))) return;

    try {
      await updateDoc(doc(db, 'groups', selectedGroup.id), {
        members: arrayRemove(auth.currentUser.uid)
      });
      setSelectedGroup(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'groups');
    }
  };

  const handleDeleteGroup = async () => {
    if (!selectedGroup || !auth.currentUser) return;
    if (!window.confirm(t('confirm_delete' as any))) return;

    setDeletingGroup(true);
    try {
      // First delete all requests in this group (otherwise rules might fail because group lookup fails)
      const q = query(collection(db, 'purchase_requests'), where('groupId', '==', selectedGroup.id));
      const snapshot = await getDocs(q);
      const batch = writeBatch(db);
      
      // Group document deletion in the same batch
      batch.delete(doc(db, 'groups', selectedGroup.id));
      
      // Request deletions
      snapshot.docs.forEach(d => batch.delete(d.ref));
      
      await batch.commit();
      setSelectedGroup(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, 'groups');
    } finally {
      setDeletingGroup(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(text);
    setTimeout(() => setCopiedId(null), 2000);
  };
  return (
    <div className={cn(
      isEmbedded ? "w-full flex-1 flex flex-col" : "fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
    )}>
      <motion.div 
        initial={isEmbedded ? false : { opacity: 0, scale: 0.9, y: 20 }}
        animate={isEmbedded ? false : { opacity: 1, scale: 1, y: 0 }}
        exit={isEmbedded ? false : { opacity: 0, scale: 0.9, y: 20 }}
        className={cn(
          "bg-white dark:bg-[#1a1a1a] flex flex-col overflow-hidden transition-colors",
          isEmbedded ? "w-full h-full" : "w-full max-w-2xl max-h-[90vh] rounded-[40px] shadow-2xl"
        )}
      >
        {/* Header */}
        <div className="p-8 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center bg-white dark:bg-[#1a1a1a] sticky top-0 z-10 transition-colors">
          <div>
            <h2 className="text-3xl font-serif font-bold text-[#1a1a1a] dark:text-white flex items-center gap-3">
              <Users className="w-8 h-8 text-[#5A5A40]" />
              {selectedGroup ? selectedGroup.name : t('groups')}
            </h2>
            <p className="text-gray-400 dark:text-gray-500 font-medium">
              {selectedGroup ? `${selectedGroup.members.length} ${t('members')}` : t('groups_desc')}
            </p>
          </div>
          <div className="flex gap-2">
            {selectedGroup && (
              <button 
                onClick={() => setSelectedGroup(null)}
                className="p-3 bg-gray-50 dark:bg-white/5 text-gray-400 dark:text-gray-500 rounded-2xl hover:bg-gray-100 dark:hover:bg-white/10 transition-all flex items-center gap-2 font-bold text-sm"
              >
                {t('view_all')}
              </button>
            )}
            {!isEmbedded && onClose && (
              <button 
                onClick={onClose}
                className="p-3 bg-gray-50 dark:bg-white/5 text-gray-400 dark:text-gray-500 rounded-2xl hover:bg-gray-100 dark:hover:bg-white/10 transition-all"
              >
                <X className="w-6 h-6" />
              </button>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-8">
          {loading ? (
            <div className="flex flex-col items-center justify-center h-64 gap-4 text-gray-400">
              <div className="w-8 h-8 border-4 border-[#5A5A40] border-t-transparent rounded-full animate-spin" />
              <p className="font-bold">{t('loading')}</p>
            </div>
          ) : !selectedGroup ? (
            <div className="space-y-8">
              {/* Group List */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {groups.map(group => (
                  <motion.button
                    key={group.id}
                    whileHover={{ y: -4 }}
                    onClick={() => setSelectedGroup(group)}
                    className="p-6 bg-white dark:bg-[#1a1a1a] border border-gray-100 dark:border-gray-800 rounded-[32px] shadow-sm hover:shadow-md transition-all text-left flex items-center justify-between group"
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-[#5A5A40]/10 dark:bg-[#5A5A40]/20 rounded-2xl flex items-center justify-center transition-colors">
                        <Users className="w-6 h-6 text-[#5A5A40]" />
                      </div>
                      <div>
                        <h4 className="font-bold text-[#1a1a1a] dark:text-white transition-colors">{group.name}</h4>
                        <p className="text-xs text-gray-400 dark:text-gray-500 transition-colors">{group.members.length} {t('members')}</p>
                      </div>
                    </div>
                    <ChevronRight className="w-5 h-5 text-gray-300 dark:text-gray-700 group-hover:text-[#5A5A40] transition-colors" />
                  </motion.button>
                ))}
              </div>

              {groups.length === 0 && !isCreating && !isJoining && (
                <div className="text-center py-12 bg-gray-50 dark:bg-white/5 rounded-[40px] transition-colors">
                  <Users className="w-16 h-16 text-gray-200 dark:text-gray-800 mx-auto mb-4" />
                  <p className="text-gray-400 dark:text-gray-500 font-bold">{t('no_groups')}</p>
                </div>
              )}

              {/* Actions */}
              <div className="flex flex-col gap-4">
                {isCreating ? (
                  <form onSubmit={handleCreateGroup} className="bg-[#5A5A40]/5 dark:bg-[#5A5A40]/10 p-6 rounded-[32px] border border-[#5A5A40]/10 dark:border-gray-800 space-y-4">
                    <div>
                      <label className="text-xs font-bold text-[#5A5A40] dark:text-[#a0a090] uppercase tracking-widest ml-1 mb-2 block">
                        {t('group_name')}
                      </label>
                      <input 
                        type="text"
                        value={newGroupName}
                        onChange={(e) => setNewGroupName(e.target.value)}
                        placeholder="Z.B. Familie, WG..."
                        className="w-full p-4 bg-white dark:bg-[#121212] dark:text-white rounded-2xl border-none focus:ring-2 focus:ring-[#5A5A40] outline-none transition-colors"
                        autoFocus
                      />
                    </div>
                    <div>
                      <label className="text-xs font-bold text-[#5A5A40] dark:text-[#a0a090] uppercase tracking-widest ml-1 mb-2 block">
                        {t('password')}
                      </label>
                      <input 
                        type="password"
                        value={newGroupPassword}
                        onChange={(e) => setNewGroupPassword(e.target.value)}
                        placeholder="Min. 4 Zeichen"
                        className="w-full p-4 bg-white dark:bg-[#121212] dark:text-white rounded-2xl border-none focus:ring-2 focus:ring-[#5A5A40] outline-none transition-colors"
                      />
                    </div>
                    <div className="flex gap-2">
                      <button 
                        type="submit"
                        className="flex-1 p-4 bg-[#5A5A40] text-white rounded-2xl font-bold hover:shadow-lg transition-all"
                      >
                        {t('create_group')}
                      </button>
                      <button 
                        type="button"
                        onClick={() => setIsCreating(false)}
                        className="px-6 p-4 bg-white dark:bg-white/5 text-gray-400 dark:text-gray-500 rounded-2xl font-bold border border-gray-100 dark:border-gray-800 transition-colors"
                      >
                        {t('cancel')}
                      </button>
                    </div>
                  </form>
                ) : isJoining ? (
                  <form onSubmit={handleJoinGroup} className="bg-[#5A5A40]/5 dark:bg-[#5A5A40]/10 p-6 rounded-[32px] border border-[#5A5A40]/10 dark:border-gray-800 space-y-4">
                    <div>
                      <label className="text-xs font-bold text-[#5A5A40] dark:text-[#a0a090] uppercase tracking-widest ml-1 mb-2 block">
                        {t('invite_code')}
                      </label>
                      <input 
                        type="text"
                        value={inviteCodeInput}
                        onChange={(e) => setInviteCodeInput(e.target.value.toUpperCase())}
                        placeholder={t('enter_invite_code')}
                        className="w-full p-4 bg-white dark:bg-[#121212] dark:text-white rounded-2xl border-none focus:ring-2 focus:ring-[#5A5A40] outline-none transition-colors"
                        autoFocus
                      />
                    </div>
                    <div>
                      <label className="text-xs font-bold text-[#5A5A40] dark:text-[#a0a090] uppercase tracking-widest ml-1 mb-2 block">
                        {t('password')}
                      </label>
                      <input 
                        type="password"
                        value={invitePasswordInput}
                        onChange={(e) => setInvitePasswordInput(e.target.value)}
                        placeholder={t('enter_password')}
                        className="w-full p-4 bg-white dark:bg-[#121212] dark:text-white rounded-2xl border-none focus:ring-2 focus:ring-[#5A5A40] outline-none transition-colors"
                      />
                    </div>
                    <div className="flex gap-2">
                      <button 
                        type="submit"
                        className="flex-1 p-4 bg-[#5A5A40] text-white rounded-2xl font-bold hover:shadow-lg transition-all"
                      >
                        {t('join_group')}
                      </button>
                      <button 
                        type="button"
                        onClick={() => setIsJoining(false)}
                        className="px-6 p-4 bg-white dark:bg-white/5 text-gray-400 dark:text-gray-500 rounded-2xl font-bold border border-gray-100 dark:border-gray-800 transition-colors"
                      >
                        {t('cancel')}
                      </button>
                    </div>
                  </form>
                ) : (
                  <div className="grid grid-cols-2 gap-4">
                    <button 
                      onClick={() => setIsCreating(true)}
                      className="p-6 bg-[#5A5A40] text-white rounded-[32px] font-bold flex flex-col items-center gap-3 hover:shadow-lg transition-all"
                    >
                      <Plus className="w-8 h-8" />
                      {t('create_group')}
                    </button>
                    <button 
                      onClick={() => setIsJoining(true)}
                      className="p-6 bg-white dark:bg-[#1a1a1a] border-2 border-dashed border-gray-200 dark:border-gray-800 text-gray-400 dark:text-gray-500 rounded-[32px] font-bold flex flex-col items-center gap-3 hover:border-[#5A5A40] hover:text-[#5A5A40] transition-all"
                    >
                      <LogIn className="w-8 h-8" />
                      {t('join_group')}
                    </button>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-12">
              {/* Group Info */}
              <div className="bg-gray-50 dark:bg-white/5 p-8 rounded-[40px] flex items-center justify-between transition-colors">
                <div>
                  <h3 className="text-sm font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-2 transition-colors">{t('invite_code')}</h3>
                  <div className="flex items-center gap-3">
                    <span className="text-3xl font-mono font-black tracking-widest text-[#1a1a1a] dark:text-white transition-colors">
                      {selectedGroup.inviteCode}
                    </span>
                    <button 
                      onClick={() => copyToClipboard(selectedGroup.inviteCode)}
                      className={cn(
                        "p-2 rounded-xl transition-all",
                        copiedId === selectedGroup.inviteCode ? "bg-green-500 text-white" : "bg-white dark:bg-[#1a1a1a] text-gray-400 dark:text-gray-500 hover:text-[#5A5A40]"
                      )}
                    >
                      {copiedId === selectedGroup.inviteCode ? <Check className="w-5 h-5" /> : <Copy className="w-5 h-5" />}
                    </button>
                  </div>
                </div>
                <div className="flex flex-col gap-4">
                  <div className="text-right">
                    <h3 className="text-sm font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-2 transition-colors">{t('members')}</h3>
                    <div className="flex -space-x-2 justify-end">
                      {selectedGroup.members.map((m, i) => (
                        <div key={i} className="w-10 h-10 bg-[#5A5A40]/20 rounded-full border-2 border-white dark:border-[#1a1a1a] flex items-center justify-center font-bold text-xs text-[#5A5A40] transition-colors">
                          {m.substring(0, 1).toUpperCase()}
                        </div>
                      ))}
                      <div className="w-10 h-10 bg-white dark:bg-[#1a1a1a] rounded-full border-2 border-gray-100 dark:border-gray-800 flex items-center justify-center text-gray-400 dark:text-gray-500 transition-colors">
                        <UserPlus className="w-4 h-4" />
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2 justify-end">
                    {auth.currentUser?.uid === selectedGroup.ownerId ? (
                      <button 
                        onClick={handleDeleteGroup}
                        disabled={deletingGroup}
                        className="px-4 py-2 bg-red-50 text-red-500 rounded-xl font-bold text-xs hover:bg-red-100 transition-all flex items-center gap-2 disabled:opacity-50"
                      >
                        {deletingGroup ? (
                          <div className="w-4 h-4 border-2 border-red-500 border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <Trash2 className="w-4 h-4" />
                        )}
                        {t('delete_group' as any)}
                      </button>
                    ) : (
                      <button 
                        onClick={handleLeaveGroup}
                        className="px-4 py-2 bg-orange-50 text-orange-500 rounded-xl font-bold text-xs hover:bg-orange-100 transition-all flex items-center gap-2"
                      >
                        <LogOut className="w-4 h-4" />
                        {t('leave_group' as any)}
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Purchase Requests */}
              <section className="space-y-6">
                <div className="flex justify-between items-center px-2">
                  <h3 className="text-2xl font-serif font-bold text-[#1a1a1a] dark:text-white transition-colors">{t('purchase_requests')}</h3>
                  <span className="px-3 py-1 bg-[#5A5A40]/10 dark:bg-[#5A5A40]/20 rounded-full text-[10px] font-bold text-[#5A5A40] dark:text-[#a0a090] transition-colors">
                    {requests.filter(r => r.status === 'pending').length} {t('items')}
                  </span>
                </div>

                <div className="space-y-4">
                  <AnimatePresence mode="popLayout">
                    {requests.filter(r => r.status === 'pending').map(request => {
                      const isRequester = auth.currentUser?.uid === request.requesterId;

                      return (
                        <motion.div
                          key={request.id}
                          layout
                          initial={{ opacity: 0, x: -20 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, x: 20 }}
                          className="bg-white dark:bg-[#1a1a1a] p-6 rounded-[32px] border border-gray-100 dark:border-gray-800 shadow-sm flex items-center justify-between gap-6 transition-colors"
                        >
                          <div className="flex items-center gap-4 flex-1">
                            <div className="w-14 h-14 bg-gray-50 dark:bg-white/5 rounded-2xl flex items-center justify-center flex-shrink-0 transition-colors">
                              <ShoppingBag className="w-7 h-7 text-[#5A5A40] dark:text-[#a0a090]" />
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase">{request.requesterName}</span>
                                <span className="w-1 h-1 bg-gray-200 dark:bg-gray-800 rounded-full transition-colors" />
                                <span className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase flex items-center gap-1 transition-colors">
                                  <Clock className="w-3 h-3" />
                                  {request.createdAt?.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </span>
                              </div>
                              <h4 className="font-bold text-[#1a1a1a] dark:text-white text-lg truncate transition-colors">
                                {request.productName}
                              </h4>
                              <div className="flex items-center gap-4 mt-2">
                                <div className="flex items-center gap-1 text-[10px] font-bold text-green-500">
                                  <ThumbsUp className="w-3 h-3" />
                                  {request.approvals.length}
                                </div>
                                <div className="flex items-center gap-1 text-[10px] font-bold text-red-500">
                                  <ThumbsDown className="w-3 h-3" />
                                  {request.rejections.length}
                                </div>
                              </div>
                            </div>
                          </div>

                          <div className="flex flex-col gap-2 min-w-[140px]">
                            {isRequester ? (
                              <div className="flex flex-col gap-2">
                                <div className="px-4 py-3 bg-gray-50 dark:bg-white/5 text-gray-400 dark:text-gray-500 rounded-2xl text-[10px] font-bold flex items-center justify-center gap-2 border border-gray-100 dark:border-gray-800 italic transition-colors">
                                  <Clock className="w-4 h-4" />
                                  {t('waiting_for_approval' as any)}
                                </div>
                                <button
                                  onClick={() => handleCancelRequest(request.id)}
                                  className="text-red-400 dark:text-red-500 text-[10px] font-bold hover:text-red-600 dark:hover:text-red-400 transition-all"
                                >
                                  {t('cancel')}
                                </button>
                              </div>
                            ) : (
                              <div className="flex flex-col gap-2">
                                <button 
                                  onClick={() => handleVote(request.id, 'approve')}
                                  disabled={isVoting === request.id}
                                  className="w-full py-4 bg-green-500 text-white rounded-2xl hover:shadow-lg hover:scale-[1.02] transition-all flex items-center justify-center gap-2 font-black uppercase tracking-tighter disabled:opacity-50"
                                >
                                  {isVoting === request.id ? (
                                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                  ) : (
                                    <>
                                      <ThumbsUp className="w-5 h-5" />
                                      {t('approve')}
                                    </>
                                  )}
                                </button>
                                <button 
                                  onClick={() => handleVote(request.id, 'decline')}
                                  disabled={isVoting === request.id}
                                  className="w-full py-3 bg-red-50 dark:bg-red-500/10 text-red-500 rounded-2xl border-2 border-red-100 dark:border-red-500/20 hover:bg-red-100 dark:hover:bg-red-500/20 transition-all flex items-center justify-center gap-2 font-bold text-xs uppercase tracking-widest disabled:opacity-50"
                                >
                                  <ThumbsDown className="w-4 h-4" />
                                  {t('decline')}
                                </button>
                              </div>
                            )}
                          </div>
                        </motion.div>
                      );
                    })}
                  </AnimatePresence>

                  {requests.filter(r => r.status === 'pending').length === 0 && (
                    <div className="text-center py-20 bg-gray-50 dark:bg-white/5 rounded-[40px] px-8 transition-colors">
                      <ShoppingBag className="w-16 h-16 text-gray-200 dark:text-gray-800 mx-auto mb-4" />
                      <h4 className="font-bold text-[#1a1a1a] dark:text-white mb-2 transition-colors">{t('no_tasks')}</h4>
                      <p className="text-sm text-gray-400 dark:text-gray-500 max-w-xs mx-auto transition-colors">
                        Ein Mitglied deiner Gruppe kann Anfragen stellen, ob bestimmte Produkte gekauft werden sollen.
                      </p>
                    </div>
                  )}
                </div>
              </section>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
};
