import { useState, useEffect } from 'react';
import { Menu, BarChart2, Share2, Phone, Megaphone, Clock, User, Check, Settings, History, Maximize, X, Download, LogOut } from 'lucide-react';
import { motion } from 'motion/react';
import confetti from 'canvas-confetti';
import { PollData } from './types';
import { db } from './firebase';
import { doc, onSnapshot, setDoc, updateDoc, increment, getDoc } from 'firebase/firestore';

const THEMES = {
  blue: { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-700', fill: 'bg-blue-600', lightFill: 'bg-blue-100' },
  green: { bg: 'bg-green-50', border: 'border-green-200', text: 'text-green-700', fill: 'bg-green-600', lightFill: 'bg-green-100' },
  orange: { bg: 'bg-orange-50', border: 'border-orange-200', text: 'text-orange-700', fill: 'bg-orange-600', lightFill: 'bg-orange-100' },
  purple: { bg: 'bg-purple-50', border: 'border-purple-200', text: 'text-purple-700', fill: 'bg-purple-600', lightFill: 'bg-purple-100' }
};

const DEFAULT_POLL_DATA: PollData = {
  question: "Which one is good?",
  candidates: [
    { id: "c1", name: "Name 1", photoUrl: "", colorTheme: "blue", votes: 25 },
    { id: "c2", name: "Name 2", photoUrl: "", colorTheme: "green", votes: 50 },
    { id: "c3", name: "Name 3", photoUrl: "", colorTheme: "orange", votes: 10 },
    { id: "c4", name: "Name 4", photoUrl: "", colorTheme: "purple", votes: 15 },
  ],
  interstitialAdUrl: "",
  interstitialAdText: "Ad induced by Admin",
  bannerAdUrl: "",
  bannerAdText: "Ad Banner",
  contactPhone: "9876543210",
  recentPhotos: []
};

export default function App() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [showAdminLogin, setShowAdminLogin] = useState(false);
  const [adminPassword, setAdminPassword] = useState('');
  const [adminError, setAdminError] = useState('');
  const [pollData, setPollData] = useState<PollData | null>(null);
  
  const [viewState, setViewState] = useState<'voting' | 'ad' | 'results'>('voting');
  const [selectedCandidate, setSelectedCandidate] = useState<string | null>(null);
  const [fullScreenImage, setFullScreenImage] = useState<string | null>(null);
  const [timeLeft, setTimeLeft] = useState(5);
  const [hasVoted, setHasVoted] = useState(false);

  useEffect(() => {
    let timeout: NodeJS.Timeout;

    const resetTimer = () => {
      clearTimeout(timeout);
      if (isAdmin) {
        timeout = setTimeout(() => {
          setIsAdmin(false);
        }, 15 * 60 * 1000); // 15 minutes
      }
    };

    if (isAdmin) {
      resetTimer();
      window.addEventListener('mousemove', resetTimer);
      window.addEventListener('keydown', resetTimer);
      window.addEventListener('click', resetTimer);
      window.addEventListener('scroll', resetTimer);
      
      return () => {
        clearTimeout(timeout);
        window.removeEventListener('mousemove', resetTimer);
        window.removeEventListener('keydown', resetTimer);
        window.removeEventListener('click', resetTimer);
        window.removeEventListener('scroll', resetTimer);
      };
    }
  }, [isAdmin]);

  useEffect(() => {
    const pollRef = doc(db, 'polls', 'main_poll');
    
    const unsubscribe = onSnapshot(pollRef, (snapshot) => {
      if (snapshot.exists()) {
        setPollData(snapshot.data() as PollData);
      } else {
        setDoc(pollRef, DEFAULT_POLL_DATA).catch(err => console.error("Error setting default data", err));
        setPollData(DEFAULT_POLL_DATA);
      }
    }, (err) => {
      console.error("Firestore onSnapshot error", err);
      // Fallback in case of permission errors so the app at least loads
      setPollData(DEFAULT_POLL_DATA);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (viewState === 'ad') {
      timer = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            clearInterval(timer);
            setViewState('results');
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [viewState]);

  const handleResultClick = async () => {
    if (selectedCandidate && !hasVoted && pollData) {
      setHasVoted(true);
      try {
        const pollRef = doc(db, 'polls', 'main_poll');
        
        // Find the index of the selected candidate to update their votes
        const candidateIndex = pollData.candidates.findIndex(c => c.id === selectedCandidate);
        
        if (candidateIndex !== -1) {
          // We can't use increment() directly in an array in Firestore easily without rewriting the whole array,
          // so we will just rewrite the array with the new vote count.
          // Note: In a highly concurrent environment, this could cause race conditions,
          // but for this simple app, it's acceptable.
          const updatedCandidates = [...pollData.candidates];
          updatedCandidates[candidateIndex] = {
            ...updatedCandidates[candidateIndex],
            votes: updatedCandidates[candidateIndex].votes + 1
          };
          
          await updateDoc(pollRef, {
            candidates: updatedCandidates
          });
          
          confetti({
            particleCount: 150,
            spread: 70,
            origin: { y: 0.6 }
          });
        }
      } catch (e) {
        console.error(e);
      }
    }
    
    setTimeLeft(5);
    setViewState('ad');
  };

  const handleShare = () => {
    if (navigator.share) {
      navigator.share({
        title: pollData?.question || 'Poll',
        text: 'Check out this poll!',
        url: window.location.href,
      });
    } else {
      alert("Sharing is not supported on this browser.");
    }
  };

  if (!pollData) return <div className="flex justify-center p-10 font-sans">Loading...</div>;

  const totalVotes = pollData.candidates.reduce((sum, c) => sum + c.votes, 0) || 1;

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col items-center font-sans">
      {/* Admin Login Modal */}
      {showAdminLogin && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-white p-6 rounded-2xl shadow-xl max-w-sm w-full">
            <h2 className="text-xl font-bold mb-4">Admin Access</h2>
            <p className="text-sm text-slate-500 mb-4">Please enter the admin password.</p>
            <input 
              type="password"
              value={adminPassword}
              onChange={(e) => setAdminPassword(e.target.value)}
              className="w-full border-2 border-slate-200 p-3 rounded-xl focus:border-blue-500 focus:outline-none mb-2"
              placeholder="Password"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  if (adminPassword === 'Poll123') {
                    setIsAdmin(true);
                    setShowAdminLogin(false);
                  } else {
                    setAdminError('Incorrect password');
                  }
                }
              }}
            />
            {adminError && <p className="text-red-500 text-xs mb-4">{adminError}</p>}
            <div className="flex justify-end gap-2 mt-4">
              <button 
                onClick={() => setShowAdminLogin(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 rounded-lg text-sm font-bold text-slate-600 transition"
              >
                Cancel
              </button>
              <button 
                onClick={() => {
                  if (adminPassword === 'Poll123') {
                    setIsAdmin(true);
                    setShowAdminLogin(false);
                  } else {
                    setAdminError('Incorrect password');
                  }
                }}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-sm font-bold text-white transition"
              >
                Login
              </button>
            </div>
          </div>
        </div>
      )}

      {isAdmin ? (
        <AdminPanel 
          data={pollData} 
          onSave={(newData) => {
            setPollData(newData);
            setIsAdmin(false);
          }} 
          onLogout={() => setIsAdmin(false)}
        />
      ) : (
        <div className="w-full max-w-md bg-white min-h-screen shadow-2xl flex flex-col relative overflow-hidden">
          
          {/* Header */}
          <header className="bg-[#1a4f9c] text-white p-4 flex justify-between items-center shrink-0">
            <div className="w-6" />
            <button onClick={() => {
              setShowAdminLogin(true);
              setAdminPassword('');
              setAdminError('');
            }} className="hover:opacity-80 transition-opacity" title="Open Admin Panel">
              <Menu className="w-6 h-6" />
            </button>
          </header>

          {/* Main Content Area */}
          <div className="flex-grow flex flex-col overflow-y-auto">
            {viewState === 'voting' && (
              <div className="p-5 md:p-8 flex flex-col h-full max-w-2xl mx-auto w-full">
                <h2 className="text-2xl md:text-3xl font-bold mb-8 text-slate-800 leading-tight">
                  {pollData.question}
                </h2>
                
                <div className="flex flex-col gap-3 mb-10">
                  {pollData.candidates.map(c => {
                    const isSelected = selectedCandidate === c.id;
                    return (
                      <div 
                        key={c.id}
                        onClick={() => setSelectedCandidate(c.id)}
                        className={`flex items-center gap-4 p-4 border-2 rounded-xl cursor-pointer transition-all ${isSelected ? 'border-blue-500 bg-blue-50/50' : 'border-slate-200 hover:bg-slate-50 hover:border-slate-300'}`}
                      >
                        <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${isSelected ? 'border-blue-500 bg-blue-500 text-white' : 'border-slate-300'}`}>
                          {isSelected && <Check className="w-4 h-4" />}
                        </div>
                        {c.photoUrl && (
                           <div className="relative group shrink-0">
                             <img src={c.photoUrl} className="w-12 h-12 object-cover rounded-lg shadow-sm" alt={c.name} />
                             <button 
                               onClick={(e) => { e.stopPropagation(); setFullScreenImage(c.photoUrl); }}
                               className="absolute inset-0 bg-black/40 hover:bg-black/60 rounded-lg text-white backdrop-blur-sm transition-colors opacity-0 group-hover:opacity-100 shadow-sm flex items-center justify-center"
                               title="View Fullscreen"
                             >
                               <Maximize className="w-4 h-4" />
                             </button>
                           </div>
                        )}
                        <span className="font-semibold text-slate-800 text-base md:text-lg">
                          {c.name}
                        </span>
                      </div>
                    )
                  })}
                </div>

                <div className="flex flex-col sm:flex-row gap-4 mt-auto pb-4">
                  <button 
                    onClick={handleResultClick}
                    disabled={!selectedCandidate || hasVoted}
                    className={`flex-1 py-4 rounded-xl font-bold flex items-center justify-center gap-2 transition shadow-md ${!selectedCandidate || hasVoted ? 'bg-slate-200 text-slate-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700 text-white'}`}
                  >
                    {hasVoted ? 'Voted' : 'Vote'}
                  </button>
                  <button 
                    onClick={handleShare}
                    className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 py-4 rounded-xl font-bold flex items-center justify-center gap-2 transition shadow-sm"
                  >
                    <Share2 className="w-5 h-5" />
                    Share
                  </button>
                  <button 
                    onClick={() => { setViewState('results'); }}
                    className="flex-1 sm:flex-none sm:px-6 bg-slate-100 hover:bg-slate-200 text-slate-700 py-4 rounded-xl font-bold flex items-center justify-center gap-2 transition shadow-sm"
                  >
                    <BarChart2 className="w-5 h-5" />
                    Results
                  </button>
                </div>
              </div>
            )}

            {viewState === 'ad' && (
              <div className="flex-grow flex flex-col bg-white">
                <div className="flex-grow p-6 flex flex-col items-center justify-center">
                   <div className="w-full aspect-[4/3] bg-[#fff9e6] border-2 border-[#ffcc80] rounded-2xl flex flex-col items-center justify-center text-center p-6 shadow-sm overflow-hidden relative">
                     {pollData.interstitialAdUrl ? (
                        <img src={pollData.interstitialAdUrl} className="absolute inset-0 w-full h-full object-cover" alt="Ad" />
                     ) : (
                       <>
                         <Megaphone className="w-16 h-16 text-[#f57c00] mb-4 drop-shadow-sm" />
                         <h3 className="text-3xl font-black text-[#f57c00] mb-2">Ad</h3>
                         <p className="text-[#f57c00] font-medium max-w-[80%]">{pollData.interstitialAdText}</p>
                       </>
                     )}
                   </div>
                </div>
                <div className="bg-[#e8f5e9] border-t-2 border-[#c8e6c9] p-4 flex items-center justify-center gap-2 text-[#2e7d32] font-medium shrink-0 shadow-inner">
                  <Clock className="w-5 h-5" />
                  Result will be shown in {timeLeft} seconds
                </div>
              </div>
            )}

            {viewState === 'results' && (
              <div className="flex-grow flex flex-col p-5 md:p-8 max-w-2xl mx-auto w-full">
                <h2 className="text-2xl md:text-3xl font-bold mb-8 text-slate-800 leading-tight">
                  {pollData.question}
                </h2>
                
                <div className="flex flex-col gap-5 mb-8">
                  {pollData.candidates.map(c => {
                    const percentage = totalVotes > 0 ? Math.round((c.votes / totalVotes) * 100) : 0;
                    return (
                      <div key={c.id} className="flex flex-col gap-2">
                        <div className="flex justify-between items-end text-sm font-semibold text-slate-700">
                          <span className="flex items-center gap-3">
                             {c.photoUrl && <img src={c.photoUrl} className="w-8 h-8 object-cover rounded-lg shadow-sm" alt={c.name} />}
                             <span className="text-base">{c.name}</span>
                          </span>
                          <span>{c.votes} {c.votes === 1 ? 'vote' : 'votes'} ({percentage}%)</span>
                        </div>
                        <div className="w-full h-8 bg-slate-100 rounded-lg overflow-hidden border border-slate-200 shadow-inner">
                          <motion.div 
                            className="h-full bg-blue-500 flex items-center px-3 text-xs font-bold text-white/90 whitespace-nowrap"
                            initial={{ width: 0 }}
                            animate={{ width: `${percentage}%` }}
                            transition={{ duration: 0.8, type: 'spring', bounce: 0.3 }}
                          >
                            {percentage > 5 && `${percentage}%`}
                          </motion.div>
                        </div>
                      </div>
                    )
                  })}
                </div>
                
                <div className="text-center text-sm font-medium text-slate-500 mb-6">
                  Total votes: {totalVotes}
                </div>

                <div className="mt-auto w-full mb-2">
                   <div className="w-full h-28 bg-[#fff9e6] border-2 border-[#ffcc80] rounded-2xl flex items-center justify-center shadow-sm overflow-hidden relative cursor-pointer hover:bg-[#fff3e0] transition-colors">
                     {pollData.bannerAdUrl ? (
                        <img src={pollData.bannerAdUrl} className="absolute inset-0 w-full h-full object-cover" alt="Banner Ad" />
                     ) : (
                       <div className="flex flex-col items-center gap-2 text-[#f57c00]">
                         <Megaphone className="w-8 h-8" />
                         <h3 className="text-xl font-black">{pollData.bannerAdText}</h3>
                       </div>
                     )}
                   </div>
                </div>
                
                <div className="mt-6 flex justify-center">
                   <button 
                    onClick={() => { setViewState('voting'); }}
                    className="px-8 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold transition shadow-sm"
                  >
                    Back to Poll
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          {(viewState === 'voting' || viewState === 'results') && (
            <footer className="bg-[#1a4f9c] text-white p-3 flex justify-center items-center gap-2 shrink-0">
              <Phone className="w-4 h-4" />
              <span className="text-sm font-medium tracking-wide">Contact for Ad: {pollData.contactPhone}</span>
            </footer>
          )}
          
          {/* Fullscreen Image Overlay */}
          {fullScreenImage && (
            <div 
              className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-black/95 backdrop-blur-md p-4" 
              onClick={() => setFullScreenImage(null)}
            >
              <button 
                className="absolute top-6 right-6 p-3 bg-white/10 hover:bg-white/20 rounded-full text-white transition-colors"
                onClick={() => setFullScreenImage(null)}
              >
                <X className="w-6 h-6" />
              </button>
              <img 
                src={fullScreenImage} 
                alt="Fullscreen" 
                className="max-w-full max-h-[80vh] object-contain rounded-lg shadow-2xl mb-4" 
                onClick={e => e.stopPropagation()} 
              />
              <a 
                href={fullScreenImage}
                download
                onClick={e => e.stopPropagation()}
                target="_blank"
                rel="noreferrer"
                className="px-6 py-3 bg-blue-600 hover:bg-blue-500 rounded-xl font-bold uppercase tracking-widest text-white text-xs flex items-center gap-2 transition shadow-lg mt-2"
              >
                <Download className="w-4 h-4" /> Download Photo
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function AdminPanel({ data, onSave, onLogout }: { data: PollData, onSave: (d: PollData) => void, onLogout: () => void }) {
  const [form, setForm] = useState<PollData>(data);
  const [isSaving, setIsSaving] = useState(false);

  const handleImageUpload = (file: File, callback: (url: string) => void) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 800;
        const MAX_HEIGHT = 800;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height;
            height = MAX_HEIGHT;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, width, height);
        
        const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
        const newRecent = [dataUrl, ...(form.recentPhotos || []).filter(p => p !== dataUrl)].slice(0, 5);
        setForm(prev => ({...prev, recentPhotos: newRecent}));
        callback(dataUrl);
      };
      img.src = e.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const renderPhotoPicker = (currentUrl: string, callback: (url: string) => void) => (
    <div className="flex flex-col gap-2 w-full mt-2">
      <div className="flex items-center gap-2 flex-wrap">
        <label className="text-[10px] font-bold uppercase tracking-wider bg-slate-900 text-white px-3 py-2 rounded-lg cursor-pointer hover:bg-slate-800 transition shadow-sm">
           Upload Image
           <input type="file" className="hidden" accept="image/*" onChange={(e) => {
             if(e.target.files?.[0]) {
               handleImageUpload(e.target.files[0], callback);
             }
           }} />
        </label>
        {currentUrl && (
          <button onClick={() => callback('')} className="text-red-500 text-[10px] font-bold px-2 hover:underline uppercase tracking-wider">Remove</button>
        )}
      </div>
      {(form.recentPhotos && form.recentPhotos.length > 0) && (
        <div className="mt-1 bg-slate-50 p-2 rounded-lg border border-slate-100">
          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-2">Recent Images</p>
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
      const historyEntry = {
        id: Date.now().toString(),
        timestamp: new Date().toISOString(),
        question: form.question,
        candidates: JSON.parse(JSON.stringify(form.candidates))
      };
      
      const newHistory = [historyEntry, ...(form.history || [])].slice(0, 15);
      const dataToSave = { ...form, history: newHistory };

      const pollRef = doc(db, 'polls', 'main_poll');
      await setDoc(pollRef, dataToSave);
      
      onSave(dataToSave);
    } catch (e) {
      console.error(e);
    }
    setIsSaving(false);
  };

  return (
    <div className="w-full max-w-2xl bg-white min-h-screen shadow-2xl p-6 md:p-8 overflow-y-auto">
      <div className="flex justify-between items-center mb-8">
        <h2 className="text-3xl font-black flex items-center gap-3 text-slate-800">
          <Settings className="w-8 h-8 text-blue-600" /> Backend Admin
        </h2>
        <button 
          onClick={onLogout}
          className="flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold uppercase tracking-wider text-sm transition-colors"
        >
          <LogOut className="w-4 h-4" /> Logout
        </button>
      </div>
      
      <div className="space-y-8">
        <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200">
          <label className="block text-sm font-bold text-slate-700 mb-2">Poll Question</label>
          <input 
            type="text" 
            value={form.question} 
            onChange={e => setForm({...form, question: e.target.value})}
            className="w-full border-2 border-slate-200 p-3 rounded-xl focus:border-blue-500 focus:outline-none font-medium"
          />
        </div>

        <div>
          <h3 className="font-bold text-lg mb-4 text-slate-800">Candidates configuration</h3>
          <div className="space-y-4">
            {form.candidates.map((c, i) => (
              <div key={c.id} className="border-2 border-slate-100 p-4 rounded-2xl bg-white flex flex-col sm:flex-row gap-4 shadow-sm">
                <div className="shrink-0 flex flex-col items-start gap-3 w-full sm:w-48">
                   <div className="flex justify-center w-full">
                     {c.photoUrl ? (
                       <img src={c.photoUrl} className="w-20 h-20 object-cover rounded-xl shadow-sm" />
                     ) : (
                       <div className="w-20 h-20 bg-slate-100 rounded-xl flex items-center justify-center text-slate-400"><User className="w-8 h-8" /></div>
                     )}
                   </div>
                   {renderPhotoPicker(c.photoUrl, (url) => {
                     const newC = [...form.candidates];
                     newC[i].photoUrl = url;
                     setForm({...form, candidates: newC});
                   })}
                </div>
                <div className="flex-grow flex flex-col justify-center space-y-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1">Display Name</label>
                    <input 
                      type="text" 
                      value={c.name}
                      onChange={e => {
                        const newC = [...form.candidates];
                        newC[i].name = e.target.value;
                        setForm({...form, candidates: newC});
                      }}
                      className="w-full border-2 border-slate-200 p-2 rounded-lg focus:border-blue-500 focus:outline-none text-sm font-medium"
                    />
                  </div>
                  <div className="flex items-center gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-500 mb-1">Votes</label>
                      <input 
                        type="number" 
                        value={c.votes}
                        onChange={e => {
                          const newC = [...form.candidates];
                          newC[i].votes = parseInt(e.target.value) || 0;
                          setForm({...form, candidates: newC});
                        }}
                        className="w-24 border-2 border-slate-200 p-2 rounded-lg focus:border-blue-500 focus:outline-none text-sm"
                      />
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-yellow-50/50 p-5 rounded-2xl border-2 border-yellow-100">
            <h3 className="font-bold text-yellow-800 mb-4 flex items-center gap-2"><Megaphone className="w-4 h-4" /> Interstitial Ad (Page 2)</h3>
            <div className="space-y-4">
              <input 
                type="text" 
                value={form.interstitialAdText}
                onChange={e => setForm({...form, interstitialAdText: e.target.value})}
                className="w-full border-2 border-yellow-200 p-2.5 rounded-xl focus:border-yellow-500 focus:outline-none text-sm"
                placeholder="Fallback Ad Text"
              />
              <div className="flex flex-col gap-3">
                {form.interstitialAdUrl && <img src={form.interstitialAdUrl} className="h-32 object-cover rounded-xl shadow-sm border border-yellow-200" />}
                {renderPhotoPicker(form.interstitialAdUrl, (url) => {
                  setForm({...form, interstitialAdUrl: url});
                })}
              </div>
            </div>
          </div>

          <div className="bg-yellow-50/50 p-5 rounded-2xl border-2 border-yellow-100">
            <h3 className="font-bold text-yellow-800 mb-4 flex items-center gap-2"><Megaphone className="w-4 h-4" /> Banner Ad (Page 3)</h3>
            <div className="space-y-4">
              <input 
                type="text" 
                value={form.bannerAdText}
                onChange={e => setForm({...form, bannerAdText: e.target.value})}
                className="w-full border-2 border-yellow-200 p-2.5 rounded-xl focus:border-yellow-500 focus:outline-none text-sm"
                placeholder="Fallback Banner Text"
              />
              <div className="flex flex-col gap-3">
                {form.bannerAdUrl && <img src={form.bannerAdUrl} className="h-16 object-cover rounded-xl shadow-sm border border-yellow-200" />}
                {renderPhotoPicker(form.bannerAdUrl, (url) => {
                  setForm({...form, bannerAdUrl: url});
                })}
              </div>
            </div>
          </div>
        </div>

        <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200">
          <label className="block text-sm font-bold text-slate-700 mb-2">Footer Contact Phone</label>
          <input 
            type="text" 
            value={form.contactPhone} 
            onChange={e => setForm({...form, contactPhone: e.target.value})}
            className="w-full border-2 border-slate-200 p-3 rounded-xl focus:border-blue-500 focus:outline-none font-medium"
          />
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
                    <p className="text-xs text-slate-500 truncate mt-0.5">Q: {entry.question}</p>
                  </div>
                  <button 
                    onClick={() => {
                      if (confirm('Revert to this configuration? This will replace current unsaved question and candidates.')) {
                        setForm(prev => ({
                          ...prev,
                          question: entry.question,
                          candidates: JSON.parse(JSON.stringify(entry.candidates))
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
          className="w-full bg-blue-600 hover:bg-blue-700 text-white font-black uppercase tracking-widest py-4 rounded-xl flex justify-center items-center shadow-lg transition-colors"
        >
          {isSaving ? 'Saving Changes...' : 'Save & Publish Poll'}
        </button>
      </div>
    </div>
  )
}
