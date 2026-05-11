import React, { useState } from 'react';
import { UserProfile, DietaryProfile } from '../types';
import { db } from '../firebase';
import { doc, updateDoc } from 'firebase/firestore';
import { motion } from 'motion/react';
import { X, Check, Leaf, Globe, Moon, Sun, HelpCircle } from 'lucide-react';
import { cn } from '../lib/utils';
import { useTranslation } from '../lib/LanguageContext';
import { useTheme } from '../lib/ThemeContext';
import { Language } from '../translations';

interface ProfileSettingsProps {
  profile: UserProfile;
  onClose: () => void;
}

export default function ProfileSettings({ profile, onClose }: ProfileSettingsProps) {
  const { t } = useTranslation();
  const { theme, toggleTheme } = useTheme();
  const [dietary, setDietary] = useState<DietaryProfile>(profile.dietaryProfile);
  const [language, setLanguage] = useState<Language>(profile.language || 'de');

  const toggleOption = (key: keyof DietaryProfile) => {
    setDietary(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handleSave = async () => {
    try {
      await updateDoc(doc(db, 'users', profile.uid), {
        dietaryProfile: dietary,
        language: language
      });
      onClose();
    } catch (err) {
      console.error('Error updating profile:', err);
    }
  };

  const handleReplayTutorial = async () => {
    try {
      await updateDoc(doc(db, 'users', profile.uid), {
        hasCompletedTutorial: false
      });
      onClose();
    } catch (err) {
      console.error('Error resetting tutorial:', err);
    }
  };

  const options: { key: keyof DietaryProfile; label: string; icon?: React.ReactNode }[] = [
    { key: 'lactoseIntolerance', label: t('lactoseIntolerance') },
    { key: 'glutenIntolerance', label: t('glutenIntolerance') },
    { key: 'vegan', label: t('vegan') },
    { key: 'vegetarian', label: t('vegetarian') },
    { key: 'nutAllergy', label: t('nutAllergy') },
    { key: 'lowCalorie', label: t('lowCalorie') },
    { key: 'highProtein', label: t('highProtein') },
    { key: 'co2Conscious', label: t('co2Conscious'), icon: <Leaf className="w-4 h-4" /> },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <motion.div 
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="w-full max-w-md bg-white dark:bg-[#1a1a1a] rounded-[40px] overflow-hidden transition-colors"
      >
        <div className="p-8 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center">
          <div>
            <h2 className="text-2xl font-serif font-bold text-[#1a1a1a] dark:text-white">{t('profile_settings')}</h2>
            <p className="text-gray-400 dark:text-gray-500 text-sm">{profile.email}</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-all text-gray-400">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="p-8 space-y-8 max-h-[70vh] overflow-y-auto">
          {/* CO2 Savings Section */}
          <section className="bg-[#5A5A40]/5 dark:bg-[#5A5A40]/20 p-6 rounded-[32px] border border-[#5A5A40]/10 dark:border-[#5A5A40]/30 transition-colors">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 bg-[#5A5A40] rounded-2xl flex items-center justify-center text-white">
                <Globe className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-serif font-bold text-lg text-[#5A5A40] dark:text-[#a0a090]">{t('co2_saved_title')}</h3>
                <p className="text-[10px] text-[#5A5A40]/60 dark:text-[#5A5A40]/80 uppercase font-black tracking-widest">{t('your_impact' as any) || 'Dein Impact'}</p>
              </div>
            </div>
            <div className="flex items-baseline gap-2 mb-2">
              <span className="text-4xl font-black text-[#5A5A40] dark:text-[#a0a090]">
                {(profile.totalCo2Saved || 0).toFixed(2)}
              </span>
              <span className="text-sm font-bold text-[#5A5A40]/60 dark:text-[#5A5A40]/80">{t('kg_co2')}</span>
            </div>
            <p className="text-xs text-[#5A5A40]/70 dark:text-gray-400 leading-relaxed">
              {t('co2_saved_desc')}
            </p>
          </section>

          {/* Appearance Section */}
          <section>
            <h3 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-4 flex items-center gap-2 dark:text-gray-500">
              <Moon className="w-4 h-4" />
              {t('appearance' as any)}
            </h3>
            <div className="flex gap-2">
              <button
                onClick={() => theme !== 'light' && toggleTheme()}
                className={cn(
                  "flex-1 py-4 px-4 rounded-2xl font-bold transition-all border-2 flex items-center justify-center gap-2",
                  theme === 'light' 
                    ? "bg-[#5A5A40] border-[#5A5A40] text-white" 
                    : "bg-gray-50 dark:bg-[#1a1a1a] border-transparent text-gray-700 dark:text-gray-300 hover:border-gray-200 dark:hover:border-gray-800"
                )}
              >
                <Sun className="w-4 h-4" />
                {t('light_mode' as any)}
              </button>
              <button
                onClick={() => theme !== 'dark' && toggleTheme()}
                className={cn(
                  "flex-1 py-4 px-4 rounded-2xl font-bold transition-all border-2 flex items-center justify-center gap-2",
                  theme === 'dark' 
                    ? "bg-[#5A5A40] border-[#5A5A40] text-white" 
                    : "bg-gray-50 dark:bg-[#1a1a1a] border-transparent text-gray-700 dark:text-gray-300 hover:border-gray-200 dark:hover:border-gray-800"
                )}
              >
                <Moon className="w-4 h-4" />
                {t('dark_mode' as any)}
              </button>
            </div>
          </section>

          {/* Language Section */}
          <section>
            <h3 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-4 flex items-center gap-2">
              <Globe className="w-4 h-4" />
              {t('language')}
            </h3>
            <div className="flex gap-2">
              {(['de', 'en'] as Language[]).map((lang) => (
                <button
                  key={lang}
                  onClick={() => setLanguage(lang)}
                  className={cn(
                    "flex-1 py-3 px-4 rounded-2xl font-bold transition-all border-2",
                    language === lang 
                      ? "bg-[#5A5A40] border-[#5A5A40] text-white" 
                      : "bg-gray-50 dark:bg-[#1a1a1a] border-transparent text-gray-700 dark:text-gray-400 hover:border-gray-200 dark:hover:border-gray-800"
                  )}
                >
                  {lang === 'de' ? t('germany') : t('english')}
                </button>
              ))}
            </div>
          </section>

          {/* Dietary Profile Section */}
          <section>
            <h3 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-4 flex items-center gap-2">
              <Leaf className="w-4 h-4" />
              {t('dietary_profile')}
            </h3>
            <div className="grid grid-cols-1 gap-2">
              {options.map((opt) => (
                <button
                  key={opt.key}
                  onClick={() => toggleOption(opt.key)}
                  className={cn(
                    "w-full p-4 rounded-2xl flex items-center justify-between transition-all border-2 text-left",
                    dietary[opt.key] 
                      ? "bg-[#5A5A40] border-[#5A5A40] text-white" 
                      : "bg-gray-50 dark:bg-[#1a1a1a] border-transparent text-gray-700 dark:text-gray-400 hover:border-gray-200 dark:hover:border-gray-800"
                  )}
                >
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm tracking-tight">{opt.label}</span>
                    {opt.icon}
                  </div>
                  <div className={cn(
                    "w-6 h-6 rounded-full flex items-center justify-center transition-all",
                    dietary[opt.key] ? "bg-white/20" : "bg-gray-200"
                  )}>
                    {dietary[opt.key] && <Check className="w-4 h-4 text-white" />}
                  </div>
                </button>
              ))}
            </div>
          </section>

          <section className="pt-4 border-t border-gray-100 dark:border-gray-800">
            <button
              onClick={handleReplayTutorial}
              className="w-full flex items-center gap-3 p-4 rounded-2xl bg-gray-50 dark:bg-white/5 text-gray-600 dark:text-gray-400 font-bold hover:bg-gray-100 dark:hover:bg-white/10 transition-all text-sm"
            >
              <HelpCircle className="w-5 h-5 text-[#5A5A40]" />
              {t('replay_tutorial')}
            </button>
          </section>
        </div>

        <div className="p-8 bg-gray-50 dark:bg-black/20 flex gap-3 transition-colors">
          <button 
            onClick={onClose}
            className="flex-1 py-4 font-bold text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
          >
            {t('cancel')}
          </button>
          <button 
            onClick={handleSave}
            className="flex-[2] py-4 bg-[#5A5A40] text-white rounded-2xl font-bold shadow-lg shadow-[#5A5A40]/20 hover:bg-[#4A4A30] transition-all"
          >
            {t('save')}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
