import { 
  collection, 
  query, 
  where, 
  getDocs, 
  addDoc, 
  updateDoc, 
  doc, 
  serverTimestamp, 
  orderBy, 
  onSnapshot,
  setDoc,
  limit
} from 'firebase/firestore';
import { db, auth } from '../firebase';
import { Chat, Message, MarketplaceOffer } from '../types';

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export const chatService = {
  // Start or get existing chat
  async getOrCreateChat(buyerId: string, sellerId: string, offer: MarketplaceOffer): Promise<string> {
    if (!auth.currentUser) throw new Error('Not authenticated');

    console.log(`getOrCreateChat: buyer=${buyerId}, seller=${sellerId}, offer=${offer.id}`);

    try {
      // Check if chat already exists for this offer and participants
      const chatsRef = collection(db, 'chats');
      // Use a query that filters by participants to satisfy security rules
      // We filter by participants primary as it doesn't require a composite index
      const q = query(
        chatsRef, 
        where('participants', 'array-contains', buyerId)
      );
      
      const snapshot = await getDocs(q);
      const existingChat = snapshot.docs.find(doc => {
        const data = doc.data();
        return data.offerId === offer.id && data.participants && data.participants.includes(sellerId);
      });

      if (existingChat) {
        console.log(`Found existing chat: ${existingChat.id}`);
        return existingChat.id;
      }

      // Create new chat
      const newChat = {
        participants: [buyerId, sellerId],
        buyerId,
        sellerId,
        offerId: offer.id,
        offerTitle: offer.title,
        lastMessage: '',
        lastMessageTimestamp: serverTimestamp(),
        createdAt: serverTimestamp()
      };

      console.log('Creating new chat:', newChat);
      const docRef = await addDoc(chatsRef, newChat);
      console.log(`New chat created: ${docRef.id}`);
      return docRef.id;
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'chats');
      throw error; // never reached but for TS
    }
  },

  // Send a message
  async sendMessage(chatId: string, text: string) {
    if (!auth.currentUser) throw new Error('Not authenticated');

    try {
      const messagesRef = collection(db, 'chats', chatId, 'messages');
      await addDoc(messagesRef, {
        senderId: auth.currentUser.uid,
        text,
        timestamp: serverTimestamp()
      });

      // Update chat metadata
      const chatRef = doc(db, 'chats', chatId);
      await updateDoc(chatRef, {
        lastMessage: text,
        lastMessageTimestamp: serverTimestamp()
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `chats/${chatId}/messages`);
    }
  },

  // Listen to user's chats
  subscribeToUserChats(userId: string, callback: (chats: Chat[]) => void) {
    const chatsRef = collection(db, 'chats');
    // Use a simple query and sort in memory to avoid composite index requirements
    const q = query(
      chatsRef,
      where('participants', 'array-contains', userId)
    );

    return onSnapshot(q, (snapshot) => {
      const chats = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Chat[];
      
      // Sort in memory by lastMessageTimestamp descending
      const sortedChats = chats.sort((a, b) => {
        const timeA = a.lastMessageTimestamp?.toMillis?.() || 0;
        const timeB = b.lastMessageTimestamp?.toMillis?.() || 0;
        return timeB - timeA;
      });
      
      callback(sortedChats);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'chats');
    });
  },

  // Listen to messages in a chat
  subscribeToMessages(chatId: string, callback: (messages: Message[]) => void) {
    const messagesRef = collection(db, 'chats', chatId, 'messages');
    const q = query(messagesRef, orderBy('timestamp', 'asc'), limit(50));

    return onSnapshot(q, (snapshot) => {
      const messages = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Message[];
      callback(messages);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, `chats/${chatId}/messages`);
    });
  }
};
