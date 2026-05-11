import { useState, useEffect, FormEvent } from 'react';
import { db } from '../firebase';
import { collection, onSnapshot, doc, updateDoc, setDoc, query, orderBy, addDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { GreenhouseStatus, PlantRecord, UserProfile } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Thermometer, 
  Droplets, 
  Camera, 
  Sprout, 
  History, 
  Plus, 
  Trash2, 
  Calendar, 
  CheckCircle2, 
  AlertCircle,
  Clock,
  ChevronRight,
  X,
  ShieldAlert
} from 'lucide-react';
import { useTranslation } from '../lib/LanguageContext';

interface GreenhouseMonitorProps {
  user: UserProfile;
}

export default function GreenhouseMonitor({ user }: GreenhouseMonitorProps) {
  const { t, language } = useTranslation();
  const [status, setStatus] = useState<GreenhouseStatus | null>(null);
  const [plants, setPlants] = useState<PlantRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAddingPlant, setIsAddingPlant] = useState(false);
  const [newPlant, setNewPlant] = useState({ 
    name: '', 
    variety: '', 
    plantedAt: new Date().toISOString().split('T')[0],
    expectedHarvestAt: ''
  });

  const isAdmin = user.role === 'admin';
  const isStaff = user.role === 'staff' || isAdmin;

  useEffect(() => {
    // Listen to current status
    const statusUnsubscribe = onSnapshot(doc(db, 'greenhouse_status', 'current'), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data() as GreenhouseStatus;
        setStatus(data);
        
        // If it's an admin and the URL is the bicycle one or missing, update it to the user's project image
        const bicycleUrl = 'photo-1558346490-a72e53ae2d4f';
        if (isAdmin && (!data.cameraUrl || data.cameraUrl.includes(bicycleUrl) || data.cameraUrl.includes('picsum.photos') || data.cameraUrl.includes('unsplash.com/photo-1592419044706-39796d40f98c'))) {
          console.log('Replacing with user provided image...');
          updateDoc(doc(db, 'greenhouse_status', 'current'), {
            cameraUrl: 'https://i.ibb.co/FLsBP97f/image.jpg',
            lastUpdated: new Date().toISOString()
          }).catch(err => {
            console.error('Error updating default camera URL:', err);
          });
        }
      } else if (isAdmin) {
        // Seed initial status
        setDoc(doc(db, 'greenhouse_status', 'current'), {
          temperature: 24.5,
          humidity: 65,
          lastUpdated: new Date().toISOString(),
          cameraUrl: 'https://i.ibb.co/FLsBP97f/image.jpg'
        });
      }
    });

    // Listen to plant records
    const plantsQuery = query(collection(db, 'plant_records'), orderBy('plantedAt', 'desc'));
    const plantsUnsubscribe = onSnapshot(plantsQuery, (snapshot) => {
      const plantList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as PlantRecord));
      setPlants(plantList);
      setLoading(false);
    });

    return () => {
      statusUnsubscribe();
      plantsUnsubscribe();
    };
  }, [isAdmin]);

  const addPlantRecord = async (e: FormEvent) => {
    e.preventDefault();
    if (!newPlant.name || !newPlant.plantedAt) return;

    try {
      await addDoc(collection(db, 'plant_records'), {
        ...newPlant,
        status: 'growing',
        createdAt: serverTimestamp()
      });
      setNewPlant({ 
        name: '', 
        variety: '', 
        plantedAt: new Date().toISOString().split('T')[0],
        expectedHarvestAt: ''
      });
      setIsAddingPlant(false);
    } catch (err) {
      console.error('Error adding plant:', err);
      alert(t('save_error'));
    }
  };

  const updatePlantStatus = async (id: string, newStatus: PlantRecord['status']) => {
    try {
      const updateData: any = { status: newStatus };
      if (newStatus === 'harvested') {
        updateData.harvestedAt = new Date().toISOString();
      }
      await updateDoc(doc(db, 'plant_records', id), updateData);
    } catch (err) {
      console.error('Error updating plant status:', err);
    }
  };

  const deletePlant = async (id: string) => {
    if (!confirm(t('delete_confirm'))) return;
    try {
      await deleteDoc(doc(db, 'plant_records', id));
    } catch (err) {
      console.error('Error deleting plant:', err);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <div className="w-10 h-10 border-4 border-[#5A5A40] border-t-transparent rounded-full animate-spin mb-4"></div>
        <p className="text-gray-500 dark:text-gray-400 font-serif italic transition-colors">{t('monitoring_loading')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Live Status Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white dark:bg-[#1a1a1a] p-6 rounded-[32px] border border-gray-100 dark:border-gray-800 shadow-sm flex items-center gap-6 relative group transition-colors">
          <div className="w-16 h-16 bg-orange-50 dark:bg-orange-500/10 rounded-2xl flex items-center justify-center transition-colors">
            <Thermometer className="w-8 h-8 text-orange-500" />
          </div>
          <div>
            <p className="text-xs text-gray-400 dark:text-gray-500 font-bold uppercase tracking-widest mb-1 transition-colors">{t('temperature')}</p>
            <h3 className="text-3xl font-bold text-[#1a1a1a] dark:text-white transition-colors">{status?.temperature || '--'}°C</h3>
            <p className="text-[10px] text-emerald-500 font-bold">{t('optimal_range')}</p>
          </div>
          {isAdmin && (
            <button 
              onClick={async () => {
                const temp = prompt(language === 'de' ? 'Neue Temperatur (°C):' : 'New Temperature (°C):', status?.temperature?.toString());
                if (temp) {
                  await updateDoc(doc(db, 'greenhouse_status', 'current'), { 
                    temperature: parseFloat(temp),
                    lastUpdated: new Date().toISOString()
                  });
                }
              }}
              className="absolute top-4 right-4 p-2 bg-gray-50 dark:bg-white/5 rounded-xl opacity-0 group-hover:opacity-100 transition-all text-gray-400"
            >
              <Plus className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="bg-white dark:bg-[#1a1a1a] p-6 rounded-[32px] border border-gray-100 dark:border-gray-800 shadow-sm flex items-center gap-6 relative group transition-colors">
          <div className="w-16 h-16 bg-blue-50 dark:bg-blue-500/10 rounded-2xl flex items-center justify-center transition-colors">
            <Droplets className="w-8 h-8 text-blue-500" />
          </div>
          <div>
            <p className="text-xs text-gray-400 dark:text-gray-500 font-bold uppercase tracking-widest mb-1 transition-colors">{t('humidity')}</p>
            <h3 className="text-3xl font-bold text-[#1a1a1a] dark:text-white transition-colors">{status?.humidity || '--'}%</h3>
            <p className="text-[10px] text-blue-500 font-bold">{t('soil_moisture')}</p>
          </div>
          {isAdmin && (
            <button 
              onClick={async () => {
                const hum = prompt(language === 'de' ? 'Neue Feuchtigkeit (%):' : 'New Humidity (%):', status?.humidity?.toString());
                if (hum) {
                  await updateDoc(doc(db, 'greenhouse_status', 'current'), { 
                    humidity: parseFloat(hum),
                    lastUpdated: new Date().toISOString()
                  });
                }
              }}
              className="absolute top-4 right-4 p-2 bg-gray-50 dark:bg-white/5 rounded-xl opacity-0 group-hover:opacity-100 transition-all text-gray-400"
            >
              <Plus className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Camera Feed */}
      <div className="bg-white dark:bg-[#1a1a1a] rounded-[40px] overflow-hidden border border-gray-100 dark:border-gray-800 shadow-xl group transition-colors">
        <div className="relative aspect-video bg-gray-900">
          <img 
            src={status?.cameraUrl || 'https://i.ibb.co/FLsBP97f/image.jpg'} 
            alt="Greenhouse Camera" 
            className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity"
            referrerPolicy="no-referrer"
          />
          <div className="absolute top-6 left-6 flex items-center gap-2 bg-black/40 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/20">
            <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
            <span className="text-[10px] text-white font-bold uppercase tracking-widest">{t('live_feed')}</span>
          </div>
          <div className="absolute bottom-6 right-6 flex gap-2">
            {isAdmin && (
              <>
                <button 
                  onClick={async () => {
                    if (confirm(language === 'de' ? 'Kamera-Bild auf Standard zurücksetzen?' : 'Reset camera image to default?')) {
                      try {
                        await updateDoc(doc(db, 'greenhouse_status', 'current'), { 
                          cameraUrl: 'https://i.ibb.co/FLsBP97f/image.jpg',
                          lastUpdated: new Date().toISOString()
                        });
                      } catch (err) {
                        console.error('Error resetting camera URL:', err);
                      }
                    }
                  }}
                  className="p-3 bg-white/10 backdrop-blur-md rounded-2xl border border-white/20 hover:bg-white/20 transition-all group/btn"
                  title={t('reset_camera')}
                >
                  <History className="w-5 h-5 text-white group-hover/btn:rotate-[-45deg] transition-transform" />
                </button>
                <button 
                  onClick={async () => {
                    const url = prompt(language === 'de' ? 'Neue Kamera-URL eingeben:' : 'Enter new camera URL:', status?.cameraUrl);
                    if (url) {
                      try {
                        await updateDoc(doc(db, 'greenhouse_status', 'current'), { 
                          cameraUrl: url,
                          lastUpdated: new Date().toISOString()
                        });
                      } catch (err) {
                        console.error('Error updating camera URL:', err);
                      }
                    }
                  }}
                  className="p-3 bg-white/10 backdrop-blur-md rounded-2xl border border-white/20 hover:bg-white/20 transition-all group/btn"
                  title={t('change_camera')}
                >
                  <Camera className="w-5 h-5 text-white group-hover/btn:scale-110 transition-transform" />
                </button>
              </>
            )}
            {!isAdmin && (
              <div className="p-3 bg-white/10 backdrop-blur-md rounded-2xl border border-white/20">
                <Camera className="w-5 h-5 text-white" />
              </div>
            )}
          </div>
        </div>
        <div className="p-4 bg-gray-50 dark:bg-white/5 flex justify-between items-center transition-colors">
          <p className="text-xs text-gray-500 dark:text-gray-400 font-medium flex items-center gap-2 transition-colors">
            <Clock className="w-3 h-3" />
            {t('last_update')}: {status?.lastUpdated ? new Date(status.lastUpdated).toLocaleTimeString(language === 'de' ? 'de-DE' : 'en-US') : '--'}
          </p>
          <button className="text-[10px] font-bold uppercase tracking-widest text-[#5A5A40] dark:text-[#a0a090] hover:underline transition-colors">
            {t('fullscreen')}
          </button>
        </div>
      </div>

      {/* Hardware Status */}
      <div className="bg-white dark:bg-[#1a1a1a] p-6 rounded-[32px] border border-gray-100 dark:border-gray-800 shadow-sm transition-colors">
        <h3 className="text-lg font-serif font-bold text-[#1a1a1a] dark:text-white mb-4 flex items-center gap-2 transition-colors">
          <ShieldAlert className="w-5 h-5 text-[#5A5A40] dark:text-[#a0a090]" />
          {t('hardware_status')}
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="p-3 bg-blue-50 dark:bg-blue-500/10 rounded-2xl border border-blue-100 dark:border-blue-500/20 transition-colors">
            <p className="text-[10px] font-bold text-blue-400 uppercase tracking-widest mb-1">{t('dht11')}</p>
            <p className="text-xs font-bold text-blue-700 dark:text-blue-400">{t('connected')}</p>
          </div>
          <div className="p-3 bg-emerald-50 dark:bg-emerald-500/10 rounded-2xl border border-emerald-100 dark:border-emerald-500/20 transition-colors">
            <p className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest mb-1">{t('moisture_sensor')}</p>
            <p className="text-xs font-bold text-emerald-700 dark:text-emerald-400">{t('calibrated')}</p>
          </div>
          <div className="p-3 bg-orange-50 dark:bg-orange-500/10 rounded-2xl border border-orange-100 dark:border-orange-500/20 transition-colors">
            <p className="text-[10px] font-bold text-orange-400 uppercase tracking-widest mb-1">{t('pir_sensor')}</p>
            <p className="text-xs font-bold text-orange-700 dark:text-orange-400">{t('ready')}</p>
          </div>
          <div className="p-3 bg-purple-50 dark:bg-purple-500/10 rounded-2xl border border-purple-100 dark:border-purple-500/20 transition-colors">
            <p className="text-[10px] font-bold text-purple-400 uppercase tracking-widest mb-1">{t('led_status')}</p>
            <div className="flex gap-1 mt-1">
              <div className="w-2 h-2 bg-green-500 rounded-full" />
              <div className="w-2 h-2 bg-blue-500 rounded-full" />
              <div className="w-2 h-2 bg-red-500 rounded-full" />
            </div>
          </div>
        </div>
      </div>

      {/* Planting Log */}
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-serif font-bold text-[#1a1a1a] dark:text-white flex items-center gap-2 transition-colors">
            <Sprout className="w-7 h-7 text-[#5A5A40] dark:text-[#a0a090]" />
            {t('planting_log')}
          </h2>
          {isAdmin && (
            <button 
              onClick={() => setIsAddingPlant(!isAddingPlant)}
              className="p-2 bg-[#5A5A40] text-white rounded-full shadow-lg hover:scale-110 transition-all"
            >
              <Plus className="w-5 h-5" />
            </button>
          )}
        </div>

        <AnimatePresence>
          {isAddingPlant && (
            <motion.form 
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              onSubmit={addPlantRecord}
              className="bg-white dark:bg-[#1a1a1a] p-6 rounded-[32px] border border-[#5A5A40]/10 dark:border-gray-800 shadow-sm space-y-4 overflow-hidden transition-colors"
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500 ml-2">{t('plant_name')}</label>
                  <input 
                    type="text" 
                    placeholder="z.B. Tomaten" 
                    value={newPlant.name}
                    onChange={e => setNewPlant({...newPlant, name: e.target.value})}
                    className="w-full px-4 py-2 bg-gray-50 dark:bg-white/5 dark:text-white rounded-xl border-none focus:ring-2 focus:ring-[#5A5A40] transition-colors"
                    required
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500 ml-2">{t('variety')}</label>
                  <input 
                    type="text" 
                    placeholder="z.B. Roma" 
                    value={newPlant.variety}
                    onChange={e => setNewPlant({...newPlant, variety: e.target.value})}
                    className="w-full px-4 py-2 bg-gray-50 dark:bg-white/5 dark:text-white rounded-xl border-none focus:ring-2 focus:ring-[#5A5A40] transition-colors"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500 ml-2">{t('planted_date')}</label>
                  <input 
                    type="date" 
                    value={newPlant.plantedAt}
                    onChange={e => setNewPlant({...newPlant, plantedAt: e.target.value})}
                    className="w-full px-4 py-2 bg-gray-50 dark:bg-white/5 dark:text-white rounded-xl border-none focus:ring-2 focus:ring-[#5A5A40] transition-colors"
                    required
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500 ml-2">{t('expected_harvest')}</label>
                  <input 
                    type="date" 
                    value={newPlant.expectedHarvestAt}
                    onChange={e => setNewPlant({...newPlant, expectedHarvestAt: e.target.value})}
                    className="w-full px-4 py-2 bg-gray-50 dark:bg-white/5 dark:text-white rounded-xl border-none focus:ring-2 focus:ring-[#5A5A40] transition-colors"
                  />
                </div>
              </div>
              <div className="flex gap-2 pt-2">
                <button type="submit" className="flex-1 bg-[#5A5A40] text-white py-3 rounded-xl font-bold hover:bg-[#4a4a35] transition-colors">{t('record_plant')}</button>
                <button type="button" onClick={() => setIsAddingPlant(false)} className="px-6 py-3 bg-gray-100 dark:bg-white/5 text-gray-500 dark:text-gray-400 rounded-xl font-bold hover:bg-gray-200 dark:hover:bg-white/10 transition-colors">{t('cancel')}</button>
              </div>
            </motion.form>
          )}
        </AnimatePresence>

        <div className="grid gap-4">
          {plants.map((plant) => (
            <motion.div
              key={plant.id}
              layout
              className="bg-white dark:bg-[#1a1a1a] p-5 rounded-[32px] border border-gray-100 dark:border-gray-800 shadow-sm hover:shadow-md transition-all"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-4">
                  <div className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-colors ${
                    plant.status === 'harvested' ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-500' :
                    plant.status === 'failed' ? 'bg-red-50 dark:bg-red-500/10 text-red-500' : 'bg-[#5A5A40]/10 dark:bg-[#5A5A40]/20 text-[#5A5A40] dark:text-[#a0a090]'
                  }`}>
                    <Sprout className="w-6 h-6" />
                  </div>
                  <div>
                    <h4 className="font-bold text-[#1a1a1a] dark:text-white transition-colors">{plant.name} <span className="text-gray-400 dark:text-gray-500 font-normal text-sm">({plant.variety})</span></h4>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="text-[10px] flex items-center gap-1 text-gray-400 dark:text-gray-500 transition-colors">
                        <Calendar className="w-3 h-3" />
                        {t('planted_date')}: {new Date(plant.plantedAt).toLocaleDateString(language === 'de' ? 'de-DE' : 'en-US')}
                      </span>
                      {plant.expectedHarvestAt && plant.status === 'growing' && (
                        <span className="text-[10px] flex items-center gap-1 text-[#5A5A40] dark:text-[#a0a090] transition-colors">
                          <History className="w-3 h-3" />
                          {t('expected_harvest')}: {new Date(plant.expectedHarvestAt).toLocaleDateString(language === 'de' ? 'de-DE' : 'en-US')}
                        </span>
                      )}
                      {plant.harvestedAt && (
                        <span className="text-[10px] flex items-center gap-1 text-emerald-500 transition-colors">
                          <CheckCircle2 className="w-3 h-3" />
                          {t('harvested')}: {new Date(plant.harvestedAt).toLocaleDateString(language === 'de' ? 'de-DE' : 'en-US')}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {plant.status === 'growing' && isStaff && (
                    <button 
                      onClick={() => updatePlantStatus(plant.id, 'harvested')}
                      className="text-[10px] font-bold uppercase tracking-widest bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 px-3 py-1.5 rounded-full hover:bg-emerald-100 dark:hover:bg-emerald-500/20 transition-colors"
                    >
                      {t('harvest')}
                    </button>
                  )}
                  {isAdmin && (
                    <button 
                      onClick={() => deletePlant(plant.id)}
                      className="p-2 text-gray-300 dark:text-gray-600 hover:text-red-500 dark:hover:text-red-400 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            </motion.div>
          ))}

          {plants.length === 0 && (
            <div className="py-12 text-center bg-gray-50 dark:bg-white/5 rounded-[32px] border border-dashed border-gray-200 dark:border-gray-800 transition-colors">
              <Sprout className="w-12 h-12 text-gray-200 dark:text-gray-800 mx-auto mb-4" />
              <p className="text-gray-400 dark:text-gray-500 font-serif italic">{t('no_plants')}</p>
            </div>
          )}
        </div>
      </div>

      <div className="bg-[#5A5A40]/5 dark:bg-[#5A5A40]/10 p-6 rounded-[32px] border border-[#5A5A40]/10 dark:border-[#5A5A40]/20 transition-colors">
        <h4 className="font-serif font-bold text-[#5A5A40] dark:text-[#a0a090] mb-2">{t('monitor_notice')}</h4>
        <p className="text-xs text-[#5A5A40]/70 dark:text-gray-400 leading-relaxed transition-colors">
          {t('monitor_notice_desc')}
        </p>
      </div>
    </div>
  );
}
