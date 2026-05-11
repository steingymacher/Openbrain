import { useState, useEffect, useMemo, FormEvent } from 'react';
import { db } from '../firebase';
import { collection, onSnapshot, doc, updateDoc, setDoc, query, orderBy, Timestamp, addDoc, deleteDoc } from 'firebase/firestore';
import { GreenhouseTask, UserProfile } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { Calendar as CalendarIcon, CheckCircle2, Circle, User as UserIcon, Sprout, Droplets, Thermometer, Wind, ShieldAlert, ChevronLeft, ChevronRight, Plus, Trash2 } from 'lucide-react';
import { useTranslation } from '../lib/LanguageContext';

interface GreenhouseTasksProps {
  user: UserProfile;
}

export default function GreenhouseTasks({ user }: GreenhouseTasksProps) {
  const { t, language } = useTranslation();
  const [tasks, setTasks] = useState<GreenhouseTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [isAddingTask, setIsAddingTask] = useState(false);
  const [newTask, setNewTask] = useState({ title: '', description: '' });
  const [deletingTaskId, setDeletingTaskId] = useState<string | null>(null);

  const isAdmin = user.role === 'admin';
  const isStaff = user.role === 'staff' || isAdmin;

  useEffect(() => {
    const q = query(collection(db, 'greenhouse_tasks'), orderBy('date', 'asc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      if (snapshot.empty) {
        seedInitialTasks();
      } else {
        const taskList = snapshot.docs.map(doc => {
          const data = doc.data();
          const date = data.date instanceof Timestamp ? data.date.toDate().toISOString() : data.date;
          return { id: doc.id, ...data, date } as GreenhouseTask;
        });
        setTasks(taskList);
        setError(null);
        setLoading(false);
      }
    }, (err) => {
      console.error("Error fetching tasks:", err);
      setError(t('loading_data_error'));
      setLoading(false);
    });

    return () => unsubscribe();
  }, [t]);

  const seedInitialTasks = async () => {
    const today = new Date();
    const initialTasks: Omit<GreenhouseTask, 'id'>[] = [];
    
    for (let i = 0; i < 7; i++) {
      const date = new Date(today);
      date.setDate(today.getDate() + i);
      const dateStr = date.toISOString();

      initialTasks.push(
        { title: t('watering'), description: t('watering_desc'), date: dateStr, completed: false },
        { title: t('temp_check'), description: t('temp_check_desc'), date: dateStr, completed: false }
      );
    }

    for (const task of initialTasks) {
      await addDoc(collection(db, 'greenhouse_tasks'), task);
    }
  };

  const createTask = async (e: FormEvent) => {
    e.preventDefault();
    if (!newTask.title || !newTask.description) return;

    try {
      await addDoc(collection(db, 'greenhouse_tasks'), {
        ...newTask,
        date: selectedDate.toISOString(),
        completed: false
      });
      setNewTask({ title: '', description: '' });
      setIsAddingTask(false);
    } catch (err) {
      console.error('Error creating task:', err);
      alert(t('save_error'));
    }
  };

  const deleteTask = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'greenhouse_tasks', id));
      setDeletingTaskId(null);
    } catch (err) {
      console.error('Error deleting task:', err);
    }
  };

  const toggleSignup = async (task: GreenhouseTask) => {
    const taskRef = doc(db, 'greenhouse_tasks', task.id);
    if (task.assignedTo === user.uid) {
      await updateDoc(taskRef, { assignedTo: null, assignedName: null });
    } else {
      await updateDoc(taskRef, { assignedTo: user.uid, assignedName: user.name });
    }
  };

  const toggleComplete = async (task: GreenhouseTask) => {
    const taskRef = doc(db, 'greenhouse_tasks', task.id);
    await updateDoc(taskRef, { completed: !task.completed });
  };

  const weekDays = useMemo(() => {
    const days = [];
    const startOfWeek = new Date(selectedDate);
    const day = startOfWeek.getDay();
    const diff = startOfWeek.getDate() - day + (day === 0 ? -6 : 1);
    startOfWeek.setDate(diff);

    for (let i = 0; i < 7; i++) {
      const d = new Date(startOfWeek);
      d.setDate(startOfWeek.getDate() + i);
      days.push(d);
    }
    return days;
  }, [selectedDate]);

  const filteredTasks = useMemo(() => {
    return tasks.filter(task => {
      const taskDate = new Date(task.date);
      return taskDate.toDateString() === selectedDate.toDateString();
    });
  }, [tasks, selectedDate]);

  const changeWeek = (direction: number) => {
    const newDate = new Date(selectedDate);
    newDate.setDate(selectedDate.getDate() + (direction * 7));
    setSelectedDate(newDate);
  };

  if (!isStaff) {
    return (
      <div className="bg-amber-50 dark:bg-amber-500/10 p-8 rounded-[32px] border border-amber-100 dark:border-amber-500/20 text-center transition-colors">
        <ShieldAlert className="w-12 h-12 text-amber-500 mx-auto mb-4" />
        <h3 className="text-lg font-bold text-amber-700 dark:text-amber-400 mb-2">{t('staff_only')}</h3>
        <p className="text-amber-600 dark:text-amber-500/70 text-sm">{t('staff_only_desc')}</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <div className="w-10 h-10 border-4 border-[#5A5A40] border-t-transparent rounded-full animate-spin mb-4"></div>
        <p className="text-gray-500 dark:text-gray-400 font-serif italic transition-colors">{t('loading_calendar')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-serif font-bold text-[#1a1a1a] dark:text-white flex items-center gap-2 transition-colors">
            <CalendarIcon className="w-7 h-7 text-[#5A5A40] dark:text-[#a0a090]" />
            {t('task_planner')}
          </h2>
          <div className="flex items-center gap-4">
            {isAdmin && (
              <button 
                onClick={() => setIsAddingTask(!isAddingTask)}
                className="p-2 bg-[#5A5A40] text-white rounded-full shadow-lg hover:scale-110 transition-all"
              >
                <Plus className="w-5 h-5" />
              </button>
            )}
            <div className="flex items-center gap-2 bg-white dark:bg-[#1a1a1a] rounded-full p-1 shadow-sm border border-gray-100 dark:border-gray-800 transition-colors">
              <button onClick={() => changeWeek(-1)} className="p-1.5 hover:bg-gray-50 dark:hover:bg-white/5 rounded-full text-gray-400 dark:text-gray-500 transition-colors">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-xs font-bold px-2 text-[#5A5A40] dark:text-[#a0a090] transition-colors">
                {t('kw')} {Math.ceil((selectedDate.getDate() + 6) / 7)}
              </span>
              <button onClick={() => changeWeek(1)} className="p-1.5 hover:bg-gray-50 dark:hover:bg-white/5 rounded-full text-gray-400 dark:text-gray-500 transition-colors">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        <AnimatePresence>
          {isAddingTask && (
            <motion.form 
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              onSubmit={createTask}
              className="bg-white dark:bg-[#1a1a1a] p-6 rounded-[32px] border border-[#5A5A40]/10 dark:border-gray-800 shadow-sm space-y-4 overflow-hidden transition-colors"
            >
              <h3 className="font-bold text-[#5A5A40] dark:text-[#a0a090]">{t('new_task_for')} {selectedDate.toLocaleDateString(language === 'de' ? 'de-DE' : 'en-US')}</h3>
              <div className="grid gap-4">
                <input 
                  type="text" 
                  placeholder={t('task_title_placeholder')} 
                  value={newTask.title}
                  onChange={e => setNewTask({...newTask, title: e.target.value})}
                  className="w-full px-4 py-2 bg-gray-50 dark:bg-white/5 dark:text-white rounded-xl border-none focus:ring-2 focus:ring-[#5A5A40] transition-colors"
                  required
                />
                <textarea 
                  placeholder={t('task_desc_placeholder')} 
                  value={newTask.description}
                  onChange={e => setNewTask({...newTask, description: e.target.value})}
                  className="w-full px-4 py-2 bg-gray-50 dark:bg-white/5 dark:text-white rounded-xl border-none focus:ring-2 focus:ring-[#5A5A40] h-20 transition-colors"
                  required
                />
                <div className="flex gap-2">
                  <button type="submit" className="flex-1 bg-[#5A5A40] text-white py-2 rounded-xl font-bold hover:bg-[#4a4a35] transition-colors">{t('create')}</button>
                  <button type="button" onClick={() => setIsAddingTask(false)} className="px-4 py-2 bg-gray-100 dark:bg-white/5 text-gray-500 dark:text-gray-400 rounded-xl font-bold hover:bg-gray-200 dark:hover:bg-white/10 transition-colors">{t('cancel')}</button>
                </div>
              </div>
            </motion.form>
          )}
        </AnimatePresence>

        <div className="flex justify-between gap-2 overflow-x-auto pb-2 scrollbar-hide no-scrollbar">
          {weekDays.map((day, idx) => {
            const isSelected = day.toDateString() === selectedDate.toDateString();
            const isToday = day.toDateString() === new Date().toDateString();
            const dayName = day.toLocaleDateString(language === 'de' ? 'de-DE' : 'en-US', { weekday: 'short' });
            const dayNum = day.getDate();

            return (
              <button
                key={idx}
                onClick={() => setSelectedDate(day)}
                className={`flex-1 min-w-[60px] flex flex-col items-center py-4 rounded-[24px] transition-all ${
                  isSelected 
                    ? 'bg-[#5A5A40] text-white shadow-lg shadow-[#5A5A40]/20 scale-105' 
                    : 'bg-white dark:bg-[#1a1a1a] text-gray-400 dark:text-gray-500 hover:bg-gray-50 dark:hover:bg-white/5 border border-gray-100 dark:border-gray-800'
                }`}
              >
                <span className={`text-[10px] font-bold uppercase tracking-widest mb-1 ${isSelected ? 'text-white/70' : 'text-gray-400 dark:text-gray-500'}`}>
                  {dayName}
                </span>
                <span className="text-lg font-bold">{dayNum}</span>
                {isToday && !isSelected && (
                  <div className="w-1 h-1 bg-[#5A5A40] dark:bg-[#a0a090] rounded-full mt-1" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between px-2">
          <h3 className="font-serif font-bold text-lg text-[#1a1a1a] dark:text-white transition-colors">
            {selectedDate.toLocaleDateString(language === 'de' ? 'de-DE' : 'en-US', { day: 'numeric', month: 'long' })}
          </h3>
          <span className="text-xs text-gray-400 dark:text-gray-500 font-bold transition-colors">
            {filteredTasks.length} {t('tasks_count')}
          </span>
        </div>

        <AnimatePresence mode="popLayout">
          {filteredTasks.length > 0 ? (
            <div className="grid gap-4">
              {filteredTasks.map((task) => (
                <motion.div
                  key={task.id}
                  layout
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className={`p-5 rounded-[32px] border transition-all ${
                    task.completed 
                      ? 'bg-gray-50 dark:bg-white/5 border-gray-100 dark:border-gray-800 opacity-75' 
                      : 'bg-white dark:bg-[#1a1a1a] border-gray-100 dark:border-gray-800 shadow-sm hover:shadow-md'
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <h4 className={`font-bold text-lg transition-colors ${task.completed ? 'text-gray-400 dark:text-gray-600 line-through' : 'text-[#1a1a1a] dark:text-white'}`}>
                            {task.title}
                          </h4>
                          {task.title.toLowerCase().includes('gießen') || task.title.toLowerCase().includes('watering') || task.title.toLowerCase().includes('bewässerung') ? <Droplets className="w-4 h-4 text-blue-400" /> : 
                           task.title.toLowerCase().includes('temperatur') || task.title.toLowerCase().includes('temp') ? <Thermometer className="w-4 h-4 text-orange-400" /> :
                           task.title.toLowerCase().includes('düngen') || task.title.toLowerCase().includes('fertil') ? <Sprout className="w-4 h-4 text-green-400" /> : <Wind className="w-4 h-4 text-gray-400" />}
                        </div>
                        {isAdmin && (
                          <div className="relative">
                            {deletingTaskId === task.id ? (
                              <div className="flex items-center gap-2 bg-red-50 dark:bg-red-500/10 p-1 rounded-xl border border-red-100 dark:border-red-500/20 animate-in fade-in zoom-in duration-200">
                                <button 
                                  onClick={() => deleteTask(task.id)}
                                  className="text-[10px] font-bold text-red-600 dark:text-red-400 px-2 py-1 hover:bg-red-100 dark:hover:bg-red-500/20 rounded-lg transition-colors"
                                >
                                  {t('delete')}
                                </button>
                                <button 
                                  onClick={() => setDeletingTaskId(null)}
                                  className="text-[10px] font-bold text-gray-400 dark:text-gray-500 px-2 py-1 hover:bg-gray-100 dark:hover:bg-white/10 rounded-lg transition-colors"
                                >
                                  {t('cancel')}
                                </button>
                              </div>
                            ) : (
                              <button 
                                onClick={() => setDeletingTaskId(task.id)} 
                                className="p-2 text-gray-300 dark:text-gray-700 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-xl transition-all"
                                title={t('delete')}
                              >
                                <Trash2 className="w-5 h-5" />
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                      <p className="text-sm text-gray-500 dark:text-gray-400 transition-colors">{task.description}</p>
                      
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => toggleSignup(task)}
                          disabled={task.completed}
                          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                            task.assignedTo === user.uid
                              ? 'bg-[#5A5A40] text-white'
                              : task.assignedTo
                              ? 'bg-gray-100 dark:bg-white/5 text-gray-400 dark:text-gray-600 cursor-not-allowed'
                              : 'bg-gray-50 dark:bg-white/5 text-[#5A5A40] dark:text-[#a0a090] hover:bg-[#5A5A40]/5 dark:hover:bg-[#5A5A40]/10 border border-[#5A5A40]/10 dark:border-[#5A5A40]/20'
                          }`}
                        >
                          <UserIcon className="w-3 h-3" />
                          {task.assignedTo === user.uid 
                            ? t('signed_up') 
                            : task.assignedTo 
                            ? `${t('taken_by')} ${task.assignedName}` 
                            : t('take_task')}
                        </button>

                        {task.assignedTo === user.uid && (
                          <button
                            onClick={() => toggleComplete(task)}
                            className={`p-2 rounded-xl transition-all ${
                              task.completed 
                                ? 'bg-green-100 dark:bg-green-500/10 text-green-600 dark:text-green-400' 
                                : 'bg-gray-100 dark:bg-white/5 text-gray-400 dark:text-gray-600 hover:bg-green-50 dark:hover:bg-green-500/10 hover:text-green-500 dark:hover:text-green-400'
                            }`}
                          >
                            {task.completed ? <CheckCircle2 className="w-5 h-5" /> : <Circle className="w-5 h-5" />}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          ) : (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="py-12 text-center bg-gray-50 dark:bg-white/5 rounded-[32px] border border-dashed border-gray-200 dark:border-gray-800 transition-colors"
            >
              <CalendarIcon className="w-12 h-12 text-gray-200 dark:text-gray-800 mx-auto mb-4" />
              <p className="text-gray-400 dark:text-gray-500 font-serif italic">{t('no_tasks')}</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="bg-[#5A5A40]/5 dark:bg-[#5A5A40]/10 p-6 rounded-[32px] border border-[#5A5A40]/10 dark:border-[#5A5A40]/20 transition-colors">
        <h4 className="font-serif font-bold text-[#5A5A40] dark:text-[#a0a090] mb-2">{t('weekly_planning')}</h4>
        <p className="text-xs text-[#5A5A40]/70 dark:text-gray-400 leading-relaxed">
          {t('weekly_planning_desc')}
        </p>
      </div>
    </div>
  );
}
