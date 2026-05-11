import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useTranslation, TranslationKeys } from '../lib/LanguageContext';
import { ChevronRight, X, Sparkles } from 'lucide-react';

interface TutorialStep {
  id: string;
  translationKey: TranslationKeys;
  targetId?: string;
  position?: 'top' | 'bottom' | 'center';
}

interface BernardTutorialProps {
  onComplete: () => void;
  onStepChange?: (stepId: string) => void;
  isOpen: boolean;
}

const TUTORIAL_STEPS: TutorialStep[] = [
  { id: 'intro', translationKey: 'tutorial_intro', position: 'center' },
  { id: 'profile', translationKey: 'tutorial_profile', targetId: 'profile-button', position: 'bottom' },
  { id: 'recommendations', translationKey: 'tutorial_recommendations', targetId: 'product-recommendations', position: 'bottom' },
  { id: 'service', translationKey: 'tutorial_service_mode', targetId: 'service-mode-badge', position: 'bottom' },
  { id: 'pickup', translationKey: 'tutorial_pickup_flow', targetId: 'scan-button', position: 'bottom' },
  { id: 'shopping_lists', translationKey: 'tutorial_shopping_lists', targetId: 'shopping-lists-button', position: 'bottom' },
  { id: 'marketplace', translationKey: 'tutorial_marketplace', targetId: 'marketplace-tab', position: 'bottom' },
  { id: 'checkout', translationKey: 'tutorial_checkout', targetId: 'cart-tab', position: 'bottom' },
  { id: 'finish', translationKey: 'tutorial_finish', targetId: 'ai-assistant-bubble', position: 'bottom' },
];

export default function BernardTutorial({ onComplete, onStepChange, isOpen }: BernardTutorialProps) {
  const { t } = useTranslation();
  const [currentStep, setCurrentStep] = useState(0);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    if (isOpen) {
      const step = TUTORIAL_STEPS[currentStep];
      onStepChange?.(step.id);
      
      // Give UI time to update before measuring rect
      const timeout = setTimeout(() => {
        if (step.targetId) {
          const element = document.getElementById(step.targetId);
          if (element) {
            setTargetRect(element.getBoundingClientRect());
            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
          } else {
            setTargetRect(null);
          }
        } else {
          setTargetRect(null);
        }
      }, 100);

      return () => clearTimeout(timeout);
    }
  }, [currentStep, isOpen, onStepChange]);

  const handleNext = () => {
    if (currentStep < TUTORIAL_STEPS.length - 1) {
      setCurrentStep(prev => prev + 1);
    } else {
      onComplete();
    }
  };

  if (!isOpen) return null;

  const currentStepData = TUTORIAL_STEPS[currentStep];

  return (
    <div className="fixed inset-0 z-[100] pointer-events-none">
      {/* Dimmed background with hole */}
      <AnimatePresence>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 bg-black/40 backdrop-blur-[2px] pointer-events-auto"
          style={{
            clipPath: targetRect 
              ? `polygon(0% 0%, 0% 100%, ${targetRect.left - 8}px 100%, ${targetRect.left - 8}px ${targetRect.top - 8}px, ${targetRect.right + 8}px ${targetRect.top - 8}px, ${targetRect.right + 8}px ${targetRect.bottom + 8}px, ${targetRect.left - 8}px ${targetRect.bottom + 8}px, ${targetRect.left - 8}px 100%, 100% 100%, 100% 0%)`
              : 'none'
          }}
        />
      </AnimatePresence>

      <div className="absolute inset-0 flex flex-col items-center pointer-events-none">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentStep}
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ 
              opacity: 1, 
              scale: 1, 
              y: targetRect 
                ? (targetRect.bottom + 40 > window.innerHeight - 200 ? targetRect.top - 220 : targetRect.bottom + 20) 
                : (window.innerHeight / 2 - 100)
            }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className="pointer-events-auto w-[90%] max-w-sm bg-white dark:bg-[#1a1a1a] rounded-[32px] p-6 shadow-2xl border border-gray-100 dark:border-gray-800 relative transition-colors"
          >
            {/* Bernard Visual */}
            <div className="absolute -top-12 left-1/2 -translate-x-1/2">
              <motion.div
                animate={{ 
                  y: [0, -10, 0],
                  scale: [1, 1.05, 1]
                }}
                transition={{ 
                  duration: 4, 
                  repeat: Infinity,
                  ease: "easeInOut"
                }}
                className="w-20 h-20 bg-gradient-to-br from-[#5A5A40] to-[#8A8A70] rounded-full flex items-center justify-center shadow-lg relative overflow-hidden"
              >
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_30%,rgba(255,255,255,0.2),transparent)]" />
                <Sparkles className="w-8 h-8 text-white animate-pulse" />
              </motion.div>
            </div>

            <div className="pt-8 text-center">
              <h3 className="font-serif font-bold text-xl mb-3 dark:text-white">Bernard</h3>
              <p className="text-gray-600 dark:text-gray-400 text-sm leading-relaxed mb-6">
                {t(currentStepData.translationKey)}
              </p>

              <div className="flex items-center justify-between gap-4">
                <div className="flex gap-1.5">
                  {TUTORIAL_STEPS.map((_, i) => (
                    <div 
                      key={i}
                      className={`h-1.5 rounded-full transition-all ${
                        i === currentStep ? 'w-6 bg-[#5A5A40]' : 'w-1.5 bg-gray-200 dark:bg-gray-800'
                      }`}
                    />
                  ))}
                </div>
                <button
                  onClick={handleNext}
                  className="bg-[#5A5A40] text-white px-6 py-2.5 rounded-2xl font-bold text-sm flex items-center gap-2 hover:bg-[#4A4A30] transition-all shadow-md active:scale-95"
                >
                  {currentStep === TUTORIAL_STEPS.length - 1 ? t('close') : t('next')}
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Close Button */}
            <button 
              onClick={onComplete}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
