import { useState, useCallback, useRef } from 'react';
import { User, Settings, History, X, Download, LogOut, ChevronDown, Plus, Trash2, HelpCircle, Megaphone } from 'lucide-react';
import Cropper from 'react-easy-crop';
import { db } from './firebase';
import { doc, setDoc } from 'firebase/firestore';
import { PollData } from './types';

export default function AdminPanel({ data, onSave, onLogout, onResetData }: { data: PollData, onSave: (d: PollData) => void, onLogout: () => void, onResetData: () => Promise<void> }) {
const getCroppedImg = async (imageSrc: string, pixelCrop: any): Promise<string> => {
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = imageSrc;
  });

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    throw new Error('No 2d context');
  }

  const TARGET_SIZE = 400;
  const scale = Math.min(TARGET_SIZE / pixelCrop.width, TARGET_SIZE / pixelCrop.height, 1);
  const width = pixelCrop.width * scale;
  const height = pixelCrop.height * scale;

  canvas.width = width;
  canvas.height = height;

  ctx.drawImage(
    image,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    width,
    height
  );

  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        console.error('Canvas is empty');
        return;
      }
      resolve(URL.createObjectURL(blob));
    }, 'image/jpeg', 0.9);
  });
};
  const [form, setForm] = useState<PollData>(() => {
    if (data.questions) return data;
    return {
      ...data,
      questions: [{ id: 'q1', text: (data as any).question || 'Question', candidates: (data as any).candidates || [] }]
    } as PollData;
  });
  const [isSaving, setIsSaving] = useState(false);
  
  // Cropper state
  const [cropImageSrc, setCropImageSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<any>(null);
  const [cropCallback, setCropCallback] = useState<((url: string) => void) | null>(null);

  const handleImageUpload = (file: File, callback: (url: string) => void) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      setCropImageSrc(e.target?.result as string);
      setCropCallback(() => callback);
      setCrop({ x: 0, y: 0 });
      setZoom(1);
    };
    reader.readAsDataURL(file);
  };

  const onCropComplete = useCallback((croppedArea: any, croppedAreaPixels: any) => {
    setCroppedAreaPixels(croppedAreaPixels);
  }, []);

  const handleCropDone = async () => {
    try {
      if (!cropImageSrc || !croppedAreaPixels) return;
      const croppedImage = await getCroppedImg(cropImageSrc, croppedAreaPixels);
      
      const newRecent = [croppedImage, ...(form.recentPhotos || []).filter(p => p !== croppedImage)].slice(0, 3);
      setForm(prev => ({...prev, recentPhotos: newRecent}));
      
      if (cropCallback) cropCallback(croppedImage);
      
      setCropImageSrc(null);
      setCropCallback(null);
    } catch (e) {
      console.error(e);
      alert('Error cropping image');
    }
  };

  const handleCropCancel = () => {
    setCropImageSrc(null);
    setCropCallback(null);
  };

  const renderPhotoPicker = (currentUrl: string, callback: (url: string) => void) => (
    <div className="flex flex-col gap-2 w-full mt-2">
      <div className="flex items-center justify-center gap-2 flex-wrap">
        <label className="text-[10px] font-bold uppercase tracking-wider bg-zinc-900 text-white px-3 py-2 rounded-lg cursor-pointer hover:bg-zinc-800 transition shadow-sm w-full text-center">
           Upload Image
           <input type="file" className="hidden" accept="image/*" onChange={(e) => {
             if(e.target.files?.[0]) {
               handleImageUpload(e.target.files[0], callback);
             }
           }} />
        </label>
        {currentUrl && (
          <button onClick={() => callback('')} className="text-red-500 hover:text-red-600 hover:bg-red-50 w-full text-[10px] font-bold py-1.5 rounded-lg transition-colors uppercase tracking-wider">Remove Image</button>
        )}
      </div>
      {(form.recentPhotos && form.recentPhotos.length > 0) && (
        <div className="mt-1 bg-zinc-100/50 p-2 rounded-lg border border-zinc-200">
          <p className="text-[9px] font-bold text-zinc-400 uppercase tracking-widest mb-2">Recent Images</p>
          <div className="flex gap-2 overflow-x-auto pb-1 max-w-full" style={{ scrollbarWidth: 'none' }}>
            {form.recentPhotos.map((url, idx) => (
               <img 
                 key={idx} 
                 src={url} 
                 className={`w-10 h-10 min-w-[40px] object-cover rounded-md cursor-pointer border-2 transition-colors ${currentUrl === url ? 'border-blue-500' : 'border-transparent hover:border-slate-300'}`}
                 onClick={() => callback(url)}
                 alt={`recent-${idx}`}
                 title="Click to use this recent image"
               />
            ))}
          </div>
        </div>
      )}
    </div>
  );

  const save = async () => {
    setIsSaving(true);
    try {
      const historyQuestions = JSON.parse(JSON.stringify(form.questions));
      historyQuestions.forEach((q: any) => {
        q.candidates.forEach((c: any) => {
          c.photoUrl = ''; // Clear heavy base64 images from history to prevent exceeding 1MB limit
        });
      });

      const historyEntry = {
        id: Date.now().toString(),
        timestamp: new Date().toISOString(),
        questions: historyQuestions
      };
      
      const newHistory = [historyEntry, ...(form.history || [])].slice(0, 5);
      const dataToSave = { ...form, history: newHistory };

      onSave(dataToSave); // Optimistically save immediately
      setIsSaving(false);

      try {
        const pollRef = doc(db, 'polls', 'main_poll');
        await setDoc(pollRef, dataToSave);
      } catch (e) {
        console.warn("Save failed, likely due to quota limit.", e);
      }
    } catch (e) {
      console.warn("History parse error", e);
    }
  };

  return (
    <div className="w-full max-w-3xl bg-white min-h-[100dvh] sm:min-h-[90vh] shadow-2xl p-6 md:p-10 overflow-y-auto sm:my-8 sm:rounded-[2.5rem] ring-1 ring-black/5 relative">
      {cropImageSrc && (
        <div className="fixed inset-0 z-[200] bg-black/90 flex flex-col items-center justify-center p-4">
          <div className="relative w-full max-w-lg h-[60vh] bg-black rounded-2xl overflow-hidden mb-6">
            <Cropper
              image={cropImageSrc}
              crop={crop}
              zoom={zoom}
              aspect={1}
              onCropChange={setCrop}
              onCropComplete={onCropComplete}
              onZoomChange={setZoom}
            />
          </div>
          <div className="w-full max-w-lg mb-6 flex items-center gap-4 text-white">
            <span className="font-medium text-sm">Zoom</span>
            <input
              type="range"
              value={zoom}
              min={1}
              max={3}
              step={0.1}
              aria-labelledby="Zoom"
              onChange={(e) => {
                setZoom(Number(e.target.value));
              }}
              className="w-full accent-blue-500"
            />
          </div>
          <div className="flex gap-4">
            <button
              onClick={handleCropCancel}
              className="px-6 py-3 bg-zinc-800 hover:bg-zinc-700 text-white font-bold rounded-xl transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleCropDone}
              className="px-8 py-3 bg-[#1877F2] hover:bg-[#166FE5] text-white font-bold rounded-xl transition-colors shadow-lg"
            >
              Apply Crop
            </button>
          </div>
        </div>
      )}

      <div className="flex justify-between items-center mb-8 border-b border-zinc-100 pb-6">
        <h2 className="text-3xl font-display font-bold flex items-center gap-3 text-[#1C1E21]">
          <Settings className="w-8 h-8 text-[#1C1E21]" /> Admin Dashboard
        </h2>
        <div className="flex gap-2 items-center">
          <button 
            onClick={async () => {
              if (confirm('Are you sure you want to reset all votes and data? This action cannot be undone.')) {
                await onResetData();
              }
            }}
            className="flex items-center gap-2 px-4 py-2 bg-red-100 hover:bg-red-200 text-red-700 rounded-xl font-bold uppercase tracking-wider text-sm transition-colors"
          >
            <Trash2 className="w-4 h-4" /> Reset Data
          </button>
          <button 
            onClick={onLogout}
            className="flex items-center gap-2 px-4 py-2 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 rounded-xl font-bold uppercase tracking-wider text-sm transition-colors"
          >
            <LogOut className="w-4 h-4" /> Logout
          </button>
        </div>
      </div>
      
      <div className="space-y-10">
        <div className="flex justify-between items-center">
          <h3 className="font-display font-bold text-2xl text-[#1C1E21]">Questions Configuration</h3>
          <button onClick={() => {
              setForm(prev => {
                const newQs = [...prev.questions, {
                  id: Date.now().toString(),
                  text: 'New Question',
                  candidates: [
                    { id: "c1", name: "Name 1", photoUrl: "", colorTheme: "blue" as const, votes: 0 },
                    { id: "c2", name: "Name 2", photoUrl: "", colorTheme: "green" as const, votes: 0 }
                  ]
                }];
                return { ...prev, questions: newQs };
              });
          }} className="flex items-center gap-1 text-sm bg-[#1877F2] text-white hover:bg-[#166FE5] px-4 py-2 rounded-xl font-bold transition-colors shadow-sm">
            <Plus className="w-4 h-4" /> Add Question
          </button>
        </div>

        {form.questions.map((q, qIndex) => (
          <div key={q.id} className="bg-white p-6 md:p-8 rounded-2xl border border-zinc-200/80 shadow-sm relative mb-8">
             <div className="flex justify-between items-center mb-6 pb-4 border-b border-zinc-100">
               <h3 className="font-bold text-xl text-[#1C1E21] flex items-center gap-2">
                 Question {qIndex + 1}
               </h3>
               {form.questions.length > 1 && (
                 <button onClick={() => {
                   setForm(prev => ({ ...prev, questions: prev.questions.filter((_, i) => i !== qIndex) }));
                   
                 }} className="text-red-500 hover:bg-red-50 p-2 rounded-xl transition-colors" title="Remove Question">
                   <Trash2 className="w-5 h-5" />
                 </button>
               )}
             </div>
             
             <div className="mb-8">
               <label className="block text-sm font-bold text-zinc-700 mb-2">Question Text</label>
               <input 
                 type="text" 
                 value={q.text} 
                 onChange={e => {
                   setForm(prev => {
                     const newQs = [...prev.questions];
                     newQs[qIndex] = { ...newQs[qIndex], text: e.target.value };
                     return { ...prev, questions: newQs };
                   });
                 }}
                 className="w-full border border-zinc-300 p-4 rounded-xl focus:border-[#1877F2] focus:ring-1 focus:ring-[#1877F2] outline-none text-[#1C1E21] font-medium bg-zinc-50 focus:bg-white transition-all shadow-sm"
                 placeholder="Enter your question here..."
               />
             </div>

             <div className="flex justify-between items-center mb-4">
               <h4 className="font-bold text-lg text-zinc-800">Candidates / Options</h4>
               <button onClick={() => {
                 setForm(prev => {
                   const newQs = [...prev.questions];
                   newQs[qIndex] = {
                     ...newQs[qIndex],
                     candidates: [
                       ...newQs[qIndex].candidates,
                       {
                         id: Date.now().toString(),
                         name: `Option ${newQs[qIndex].candidates.length + 1}`,
                         photoUrl: "",
                         colorTheme: "blue" as const,
                         votes: 0
                       }
                     ]
                   };
                   return { ...prev, questions: newQs };
                 });
               }} className="text-sm font-bold text-[#1877F2] hover:text-[#166FE5] flex items-center gap-1 transition-colors">
                 <Plus className="w-4 h-4" /> Add Option
               </button>
             </div>
             
             <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
               {q.candidates.map((c, cIndex) => (
                 <div key={c.id} className="border border-zinc-200 p-4 rounded-xl bg-zinc-50/50 flex flex-col sm:flex-row gap-5 relative hover:border-[#1877F2]/50 transition-colors group">
                   {q.candidates.length > 2 && (
                      <button 
                        onClick={() => {
                          setForm(prev => {
                            const newQs = [...prev.questions];
                            newQs[qIndex] = { ...newQs[qIndex], candidates: newQs[qIndex].candidates.filter((_, i) => i !== cIndex) };
                            return { ...prev, questions: newQs };
                          });
                        }}
                        className="absolute top-2 right-2 text-zinc-400 hover:text-red-500 hover:bg-red-50 p-1.5 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                        title="Remove Option"
                      >
                       <Trash2 className="w-4 h-4" />
                     </button>
                   )}
                   
                   <div className="shrink-0 flex flex-col items-center gap-3 w-full sm:w-28">
                      <div className="w-full flex justify-center">
                        {c.photoUrl ? (
                          <img src={c.photoUrl} className="w-24 h-24 object-cover rounded-xl shadow-sm border border-zinc-200" alt={c.name} />
                        ) : (
                          <div className="w-24 h-24 bg-white border border-zinc-200 rounded-xl flex items-center justify-center text-zinc-300 shadow-sm">
                            <User className="w-8 h-8" />
                          </div>
                        )}
                      </div>
                      <div className="w-full">
                        {renderPhotoPicker(c.photoUrl, (url) => {
                          setForm(prev => {
                            const newQs = [...prev.questions];
                            newQs[qIndex] = {
                              ...newQs[qIndex],
                              candidates: newQs[qIndex].candidates.map((cand, i) => i === cIndex ? { ...cand, photoUrl: url } : cand)
                            };
                            return { ...prev, questions: newQs };
                          });
                        })}
                      </div>
                   </div>
                   
                   <div className="flex-grow flex flex-col justify-center space-y-4">
                     <div>
                       <label className="block text-xs font-bold text-zinc-500 mb-1.5 uppercase tracking-wider">Display Name</label>
                       <input 
                         type="text" 
                         value={c.name}
                         onChange={e => {
                           setForm(prev => {
                             const newQs = [...prev.questions];
                             newQs[qIndex] = {
                               ...newQs[qIndex],
                               candidates: newQs[qIndex].candidates.map((cand, i) => i === cIndex ? { ...cand, name: e.target.value } : cand)
                             };
                             return { ...prev, questions: newQs };
                           });
                         }}
                         className="w-full border border-zinc-300 p-2.5 rounded-lg focus:border-[#1877F2] focus:ring-1 focus:ring-[#1877F2] outline-none text-sm font-medium bg-white transition-all shadow-sm"
                         placeholder="Candidate Name"
                       />
                     </div>
                     <div>
                       <label className="block text-xs font-bold text-zinc-500 mb-1.5 uppercase tracking-wider">Initial Votes</label>
                       <input 
                         type="number" 
                         value={c.votes}
                         onChange={e => {
                           setForm(prev => {
                             const newQs = [...prev.questions];
                             newQs[qIndex] = {
                               ...newQs[qIndex],
                               candidates: newQs[qIndex].candidates.map((cand, i) => i === cIndex ? { ...cand, votes: parseInt(e.target.value) || 0 } : cand)
                             };
                             return { ...prev, questions: newQs };
                           });
                         }}
                         className="w-full sm:w-24 border border-zinc-300 p-2.5 rounded-lg focus:border-[#1877F2] focus:ring-1 focus:ring-[#1877F2] outline-none text-sm bg-white transition-all shadow-sm"
                       />
                     </div>
                   </div>
                 </div>
               ))}
             </div>
          </div>
        ))}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white p-6 md:p-8 rounded-2xl border border-zinc-200/80 shadow-sm relative">
            <h3 className="font-bold text-xl text-[#1C1E21] mb-6 flex items-center gap-2 pb-4 border-b border-zinc-100">
              <Megaphone className="w-5 h-5 text-[#1877F2]" /> Interstitial Ad (Page 2)
            </h3>
            <div className="space-y-5">
              <div>
                <label className="block text-xs font-bold text-zinc-500 mb-1.5 uppercase tracking-wider">Fallback Ad Text</label>
                <input 
                  type="text" 
                  value={form.interstitialAdText}
                  onChange={e => setForm({...form, interstitialAdText: e.target.value})}
                  className="w-full border border-zinc-300 p-3 rounded-xl focus:border-[#1877F2] focus:ring-1 focus:ring-[#1877F2] outline-none text-sm font-medium bg-zinc-50 focus:bg-white transition-all shadow-sm"
                  placeholder="Fallback Ad Text"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-zinc-500 mb-1.5 uppercase tracking-wider">Ad Image</label>
                <div className="flex flex-col gap-3">
                  {form.interstitialAdUrl && <img src={form.interstitialAdUrl} className="w-full h-32 object-cover rounded-xl shadow-sm border border-zinc-200" alt="Interstitial Ad" />}
                  {renderPhotoPicker(form.interstitialAdUrl, (url) => {
                    setForm({...form, interstitialAdUrl: url});
                  })}
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white p-6 md:p-8 rounded-2xl border border-zinc-200/80 shadow-sm relative">
            <h3 className="font-bold text-xl text-[#1C1E21] mb-6 flex items-center gap-2 pb-4 border-b border-zinc-100">
              <Megaphone className="w-5 h-5 text-[#1877F2]" /> Banner Ad (Page 3)
            </h3>
            <div className="space-y-5">
              <div>
                <label className="block text-xs font-bold text-zinc-500 mb-1.5 uppercase tracking-wider">Fallback Banner Text</label>
                <input 
                  type="text" 
                  value={form.bannerAdText}
                  onChange={e => setForm({...form, bannerAdText: e.target.value})}
                  className="w-full border border-zinc-300 p-3 rounded-xl focus:border-[#1877F2] focus:ring-1 focus:ring-[#1877F2] outline-none text-sm font-medium bg-zinc-50 focus:bg-white transition-all shadow-sm"
                  placeholder="Fallback Banner Text"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-zinc-500 mb-1.5 uppercase tracking-wider">Banner Image</label>
                <div className="flex flex-col gap-3">
                  {form.bannerAdUrl && <img src={form.bannerAdUrl} className="w-full h-20 object-cover rounded-xl shadow-sm border border-zinc-200" alt="Banner Ad" />}
                  {renderPhotoPicker(form.bannerAdUrl, (url) => {
                    setForm({...form, bannerAdUrl: url});
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white p-6 md:p-8 rounded-2xl border border-zinc-200/80 shadow-sm relative">
          <label className="block text-sm font-bold text-zinc-700 mb-2">Footer Contact Phone</label>
          <input 
            type="text" 
            value={form.contactPhone} 
            onChange={e => setForm({...form, contactPhone: e.target.value})}
            className="w-full border border-zinc-300 p-4 rounded-xl focus:border-[#1877F2] focus:ring-1 focus:ring-[#1877F2] outline-none font-medium bg-zinc-50 focus:bg-white transition-all shadow-sm"
          />
        </div>

        <div className="bg-white p-6 md:p-8 rounded-2xl border border-zinc-200/80 shadow-sm relative">
          <div className="flex justify-between items-center mb-6 pb-4 border-b border-zinc-100">
            <h3 className="font-bold text-xl text-[#1C1E21] flex items-center gap-2">
              <HelpCircle className="w-6 h-6 text-[#1877F2]" /> FAQ Configuration
            </h3>
            <button 
              onClick={() => {
                const newFaqs = [...(form.faqs || []), { question: 'New Question', answer: 'New Answer' }];
                setForm({...form, faqs: newFaqs});
              }}
              className="flex items-center gap-1 text-sm bg-[#1877F2] text-white hover:bg-[#166FE5] px-4 py-2 rounded-xl font-bold transition-colors shadow-sm"
            >
              <Plus className="w-4 h-4" /> Add FAQ
            </button>
          </div>
          <div className="space-y-4">
            {(form.faqs || []).map((faq, index) => (
              <div key={index} className="bg-zinc-50/50 border border-zinc-200 p-4 rounded-xl flex gap-5 relative hover:border-[#1877F2]/50 transition-colors group">
                <div className="flex-grow space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-zinc-500 mb-1.5 uppercase tracking-wider">Question</label>
                    <input 
                      type="text" 
                      value={faq.question}
                      onChange={e => {
                        const newFaqs = [...(form.faqs || [])];
                        newFaqs[index].question = e.target.value;
                        setForm({...form, faqs: newFaqs});
                      }}
                      className="w-full border border-zinc-300 p-2.5 rounded-lg focus:border-[#1877F2] focus:ring-1 focus:ring-[#1877F2] outline-none text-sm font-medium bg-white transition-all shadow-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-zinc-500 mb-1.5 uppercase tracking-wider">Answer</label>
                    <textarea 
                      value={faq.answer}
                      onChange={e => {
                        const newFaqs = [...(form.faqs || [])];
                        newFaqs[index].answer = e.target.value;
                        setForm({...form, faqs: newFaqs});
                      }}
                      className="w-full border border-zinc-300 p-2.5 rounded-lg focus:border-[#1877F2] focus:ring-1 focus:ring-[#1877F2] outline-none text-sm font-medium bg-white min-h-[80px] transition-all shadow-sm"
                    />
                  </div>
                </div>
                <button 
                  onClick={() => {
                    const newFaqs = (form.faqs || []).filter((_, i) => i !== index);
                    setForm({...form, faqs: newFaqs});
                  }}
                  className="shrink-0 self-start text-zinc-400 hover:text-red-500 hover:bg-red-50 p-2 rounded-lg transition-colors mt-6"
                  title="Remove FAQ"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>
            ))}
            {(!form.faqs || form.faqs.length === 0) && (
              <p className="text-center text-slate-500 text-sm py-4">No FAQs added yet.</p>
            )}
          </div>
        </div>

        {form.history && form.history.length > 0 && (
          <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200">
            <h3 className="font-bold text-lg mb-4 text-slate-800 flex items-center gap-2">
              <History className="w-5 h-5 text-blue-600" /> Configuration History
            </h3>
            <div className="space-y-2 max-h-60 overflow-y-auto pr-2" style={{ scrollbarWidth: 'thin' }}>
              {form.history.map((entry) => (
                <div key={entry.id} className="flex items-center justify-between p-3 bg-white border border-slate-100 rounded-xl shadow-sm hover:border-blue-200 transition-colors">
                  <div className="flex-grow pr-4">
                    <p className="font-bold text-sm text-slate-800">{new Date(entry.timestamp).toLocaleString()}</p>
                    <p className="text-xs text-slate-500 truncate mt-0.5">
                      Q: {entry.questions?.[0]?.text || (entry as any).question} {entry.questions?.length > 1 ? `(+${entry.questions.length - 1} more)` : ''}
                    </p>
                  </div>
                  <button 
                    onClick={() => {
                      if (confirm('Revert to this configuration? This will replace current unsaved questions and candidates.')) {
                        setForm(prev => ({
                          ...prev,
                          questions: entry.questions ? JSON.parse(JSON.stringify(entry.questions)) : [{ id: 'q1', text: (entry as any).question, candidates: JSON.parse(JSON.stringify((entry as any).candidates)) }]
                        }));
                      }
                    }}
                    className="shrink-0 px-3 py-1.5 bg-slate-100 hover:bg-blue-50 text-blue-600 rounded-lg text-xs font-bold uppercase tracking-wider transition-colors"
                  >
                    Revert
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="mt-10 pt-6 border-t border-slate-200 pb-10">
        <button 
          onClick={save}
          disabled={isSaving}
          className="w-full bg-[#1877F2] hover:bg-[#166FE5] text-white font-black uppercase tracking-widest py-4 rounded-xl flex justify-center items-center shadow-lg transition-colors"
        >
          {isSaving ? 'Saving Changes...' : 'Save & Publish Poll'}
        </button>
      </div>
    </div>
  )
}
