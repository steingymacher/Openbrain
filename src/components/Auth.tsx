import React, { useState } from 'react';
import { auth, db } from '../firebase';
import { 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  updateProfile,
  signInWithPopup,
  GoogleAuthProvider
} from 'firebase/auth';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { UserProfile } from '../types';
import { motion } from 'motion/react';
import { ShoppingBag, Mail, Lock, User as UserIcon } from 'lucide-react';
import { useTranslation } from '../lib/LanguageContext';

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
  return errInfo;
}

export default function Auth() {
  const { t } = useTranslation();
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleGoogleLogin = async () => {
    setLoading(true);
    setError('');
    const provider = new GoogleAuthProvider();
    try {
      const result = await signInWithPopup(auth, provider);
      const user = result.user;
      
      // Check if user profile already exists
      try {
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        
        if (!userDoc.exists()) {
          const initialProfile: UserProfile = {
            uid: user.uid,
            name: user.displayName || 'Google User',
            email: user.email || '',
            role: (user.email === 'mihail.cozirev2017@gmail.com' || user.email === 'steingymacher@gmail.com' || user.email === '1@mail.com') ? 'admin' : 'user',
            language: 'de',
            hasCompletedTutorial: false,
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
          await setDoc(doc(db, 'users', user.uid), initialProfile);
        }
      } catch (firestoreErr) {
        handleFirestoreError(firestoreErr, OperationType.WRITE, `users/${user.uid}`);
        // Login itself succeeded, but profile creation failed. 
        // We might still be able to proceed if the app handles missing profiles.
      }
    } catch (err: any) {
      console.error('Auth Error:', err);
      setError(err.message || 'Ein Fehler ist bei der Anmeldung aufgetreten.');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      if (isLogin) {
        await signInWithEmailAndPassword(auth, email, password);
      } else {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        await updateProfile(userCredential.user, { displayName: name });
        
        const initialProfile: UserProfile = {
          uid: userCredential.user.uid,
          name,
          email,
          role: (email === 'mihail.cozirev2017@gmail.com' || email === 'steingymacher@gmail.com' || email === '1@mail.com') ? 'admin' : 'user',
          language: 'de',
          hasCompletedTutorial: false,
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
          await setDoc(doc(db, 'users', userCredential.user.uid), initialProfile);
        } catch (firestoreErr) {
          handleFirestoreError(firestoreErr, OperationType.WRITE, `users/${userCredential.user.uid}`);
        }
      }
    } catch (err: any) {
      console.error('Auth Error:', err);
      setError(err.message || 'Ein Fehler ist bei der Anmeldung aufgetreten.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F5F5F0] dark:bg-[#121212] flex items-center justify-center p-4 transition-colors">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md bg-white dark:bg-[#1a1a1a] rounded-[32px] p-8 shadow-xl transition-colors"
      >
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 bg-[#5A5A40] rounded-full flex items-center justify-center mb-4">
            <ShoppingBag className="text-white w-8 h-8" />
          </div>
          <h1 className="text-3xl font-serif font-bold text-[#1a1a1a] dark:text-white">
            {isLogin ? t('login_title') : t('register_title')}
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mt-2">Smart Supermarket Checkout</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {!isLogin && (
            <div className="relative">
              <UserIcon className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                type="text"
                placeholder={t('name_placeholder')}
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full pl-12 pr-4 py-4 bg-gray-50 dark:bg-white/5 border-none rounded-2xl focus:ring-2 focus:ring-[#5A5A40] transition-all dark:text-white"
                required
              />
            </div>
          )}
          <div className="relative">
            <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input
              type="email"
              placeholder={t('email_placeholder')}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full pl-12 pr-4 py-4 bg-gray-50 dark:bg-white/5 border-none rounded-2xl focus:ring-2 focus:ring-[#5A5A40] transition-all dark:text-white"
              required
            />
          </div>
          <div className="relative">
            <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input
              type="password"
              placeholder={t('password_placeholder')}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full pl-12 pr-4 py-4 bg-gray-50 dark:bg-white/5 border-none rounded-2xl focus:ring-2 focus:ring-[#5A5A40] transition-all dark:text-white"
              required
            />
          </div>

          {error && <p className="text-red-500 text-sm text-center">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-4 bg-[#5A5A40] text-white rounded-2xl font-bold hover:bg-[#4A4A30] transition-all disabled:opacity-50"
          >
            {loading ? t('loading_button') : isLogin ? t('login_button') : t('register_button')}
          </button>
        </form>

        <div className="mt-4 flex items-center gap-4">
          <div className="flex-1 h-px bg-gray-200 dark:bg-gray-800"></div>
          <span className="text-gray-400 text-sm">{t('or')}</span>
          <div className="flex-1 h-px bg-gray-200 dark:bg-gray-800"></div>
        </div>

        <button
          onClick={handleGoogleLogin}
          disabled={loading}
          className="w-full mt-4 py-4 bg-white dark:bg-white/5 border-2 border-gray-100 dark:border-gray-800 text-gray-700 dark:text-gray-300 rounded-2xl font-bold hover:bg-gray-50 dark:hover:bg-white/10 transition-all flex items-center justify-center gap-3 disabled:opacity-50"
        >
          <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google" className="w-5 h-5" />
          {t('google_login')}
        </button>

        <div className="mt-6 text-center">
          <button
            onClick={() => setIsLogin(!isLogin)}
            className="text-[#5A5A40] font-medium hover:underline"
          >
            {isLogin ? t('no_account') : t('have_account')}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
