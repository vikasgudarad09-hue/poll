import { useState, useEffect, useCallback, useRef } from 'react';
import { Menu, BarChart2, Share2, Phone, Megaphone, Clock, User, Check, Settings, History, Maximize, X, Download, LogOut, ChevronDown, Plus, Trash2, HelpCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import confetti from 'canvas-confetti';
import Cropper from 'react-easy-crop';
import { PollData } from './types';
import { db } from './firebase';
import { doc, onSnapshot, setDoc, updateDoc, increment, getDoc, getDocFromServer, runTransaction, collection, getDocs, deleteDoc } from 'firebase/firestore';

const THEMES = {
  blue: { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-700', fill: 'bg-blue-600', lightFill: 'bg-blue-100' },
  green: { bg: 'bg-green-50', border: 'border-green-200', text: 'text-green-700', fill: 'bg-green-600', lightFill: 'bg-green-100' },
  orange: { bg: 'bg-orange-50', border: 'border-orange-200', text: 'text-orange-700', fill: 'bg-orange-600', lightFill: 'bg-orange-100' },
  purple: { bg: 'bg-purple-50', border: 'border-purple-200', text: 'text-purple-700', fill: 'bg-purple-600', lightFill: 'bg-purple-100' }
};

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

  return canvas.toDataURL('image/jpeg', 0.65);
};

const DEFAULT_POLL_DATA: PollData = {
  questions: [
    {
      id: "q1",
      text: "Which one is good?",
      candidates: [
        { id: "c1", name: "Name 1", photoUrl: "", colorTheme: "blue", votes: 0 },
        { id: "c2", name: "Name 2", photoUrl: "", colorTheme: "green", votes: 0 },
        { id: "c3", name: "Name 3", photoUrl: "", colorTheme: "orange", votes: 0 },
        { id: "c4", name: "Name 4", photoUrl: "", colorTheme: "purple", votes: 0 },
      ]
    }
  ],
  interstitialAdUrl: "",
  interstitialAdText: "Ad induced by Admin",
  adRedirectUrl: "",
  bannerAdUrl: "",
  bannerAdText: "Ad Banner",
  contactPhone: "9876543210",
  recentPhotos: [],
  faqs: [
    { question: "How does the poll work?", answer: "Simply tap on your preferred candidate and click Vote!" }
  ]
};

const getFallbackIpHash = () => {
  let hash = localStorage.getItem('fallbackIpHash');
  if (!hash) {
    hash = 'fb_' + Math.random().toString(36).substring(2) + Date.now().toString(36);
    localStorage.setItem('fallbackIpHash', hash);
  }
  return hash;
};

const fetchUserIpHash = async (): Promise<string> => {
  const providers = [
    'https://api.ipify.org?format=json',
    'https://api64.ipify.org?format=json',
    'https://api.seeip.org/jsonip',
  ];

  for (const url of providers) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2500);
      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);
      const data = await response.json();
      const ip = data.ip || data.query;
      if (ip) {
        // Hash it securely using Web Crypto API to avoid exposing IPs
        const encoder = new TextEncoder();
        const ipData = encoder.encode(ip + "_salt_pbook");
        const hashBuffer = await crypto.subtle.digest('SHA-256', ipData);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 32);
      }
    } catch (e) {
      console.warn(`Failed to fetch IP from ${url}`);
    }
  }
  return getFallbackIpHash();
};

function GoogleAd({ className = "" }: { className?: string }) {
  const adPushed = useRef(false);
  const insRef = useRef<HTMLModElement>(null);

  useEffect(() => {
    let timeoutId: number;
    
    const pushAd = () => {
      if (adPushed.current) return;
      if (insRef.current && insRef.current.offsetWidth > 0) {
        try {
          // @ts-ignore
          (window.adsbygoogle = window.adsbygoogle || []).push({});
          adPushed.current = true;
        } catch (e) {
          // Ignore known adsense errors
        }
      } else {
        // Retry after a short delay if width is 0 (e.g., during animations)
        timeoutId = window.setTimeout(pushAd, 200);
      }
    };

    pushAd();

    return () => {
      clearTimeout(timeoutId);
    };
  }, []);

  return (
    <div className={`w-full overflow-hidden flex flex-col items-center justify-center bg-zinc-50 border border-zinc-200/60 rounded-3xl p-2 ${className}`}>
      <span className="text-[10px] uppercase text-zinc-400 font-bold tracking-wider mb-1">Advertisement</span>
      <ins ref={insRef}
           className="adsbygoogle w-full block"
           style={{ display: 'block', minHeight: '100px', width: '100%' }}
           data-ad-client="ca-pub-XXXXXXXXXXXXXXXX" 
           data-ad-slot="XXXXXXXXXX"
           data-ad-format="auto"
           data-full-width-responsive="true"></ins>
    </div>
  );
}

export default function App() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [showAdminLogin, setShowAdminLogin] = useState(false);
  const [adminPassword, setAdminPassword] = useState('');
  const [adminError, setAdminError] = useState('');
  const [pollData, setPollData] = useState<PollData | null>(null);
  
  const [showAd, setShowAd] = useState(false);
  const [userIp, setUserIp] = useState<string | null>(null);
  const [isVerifyingIp, setIsVerifyingIp] = useState(true);

  useEffect(() => {
    if (window.location.search.includes('clear=1')) {
      localStorage.removeItem('votedQuestions');
      localStorage.removeItem('fallbackIpHash');
      window.location.href = window.location.pathname;
    }
    
    let mounted = true;
    fetchUserIpHash().then(hash => {
      if (mounted) {
        setUserIp(hash);
        setIsVerifyingIp(false);
      }
    });
    return () => { mounted = false; };
  }, []);
  const [selectedCandidates, setSelectedCandidates] = useState<Record<string, string>>({});
  const [votedQuestions, setVotedQuestions] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem('votedQuestions');
      return saved ? JSON.parse(saved) : {};
    } catch (e) {
      return {};
    }
  });
  const [viewAllResults, setViewAllResults] = useState(false);
  const [fullScreenImage, setFullScreenImage] = useState<string | null>(null);
  const [timeLeft, setTimeLeft] = useState(5);
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(null);
  const [confirmVoteData, setConfirmVoteData] = useState<{questionId: string, candidateId: string} | null>(null);

  // Backward compatibility for old data format
  const activePollData = pollData?.questions 
    ? pollData 
    : (pollData ? { ...pollData, questions: [{ id: 'default', text: (pollData as any).question || 'Question', candidates: (pollData as any).candidates || [] }] } as PollData : null);

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
        setDoc(pollRef, DEFAULT_POLL_DATA).catch(err => console.warn("Error setting default data", err));
        setPollData(DEFAULT_POLL_DATA);
      }
    }, (err) => {
      console.warn("Firestore onSnapshot error (likely quota limit). Using current data.", err);
      setPollData(prev => prev || DEFAULT_POLL_DATA);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (showAd) {
      timer = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            clearInterval(timer);
            if (activePollData?.adRedirectUrl) {
              window.location.href = activePollData.adRedirectUrl;
            } else {
              setShowAd(false);
            }
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [showAd, activePollData?.adRedirectUrl]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const qId = params.get('q');
    if (qId && activePollData?.questions) {
      setTimeout(() => {
        const el = document.getElementById(`question-${qId}`);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          // Highlight effect
          el.classList.add('ring-4', 'ring-[#1877F2]', 'ring-opacity-50', 'transition-all', 'duration-1000');
          setTimeout(() => {
            el.classList.remove('ring-4', 'ring-[#1877F2]', 'ring-opacity-50');
          }, 2000);
        }
      }, 500);
    }
  }, [activePollData?.questions]);

  const handleVoteClick = async (questionId: string, overrideCandidateId?: string) => {
    const candidateId = overrideCandidateId || selectedCandidates[questionId];
    if (!candidateId || !activePollData || votedQuestions[questionId]) return;

    if (isVerifyingIp) {
      alert("Please wait a moment while we verify your connection, then try again.");
      return;
    }

    if (!userIp) {
      alert("Unable to verify connection. Please refresh the page.");
      return;
    }

    // Optimistic local update
    setPollData(prev => {
      if (!prev || !prev.questions) return prev;
      const newQs = JSON.parse(JSON.stringify(prev.questions));
      const qIndex = newQs.findIndex((q: any) => q.id === questionId);
      if (qIndex !== -1) {
         const cIndex = newQs[qIndex].candidates.findIndex((c: any) => c.id === candidateId);
         if (cIndex !== -1) {
            newQs[qIndex].candidates[cIndex].votes += 1;
         }
      }
      return { ...prev, questions: newQs };
    });

    confetti({ particleCount: 150, spread: 70, origin: { y: 0.6 } });

    setVotedQuestions(prev => {
      const next = { ...prev, [questionId]: true };
      try {
        localStorage.setItem('votedQuestions', JSON.stringify(next));
      } catch (e) {
        console.warn("Could not save to localStorage", e);
      }
      return next;
    });

    // Show interstitial ad after voting
    if (activePollData) {
       setTimeout(() => {
         setTimeLeft(5);
         setShowAd(true);
       }, 50);
    }


    try {
      const pollRef = doc(db, 'polls', 'main_poll');
      const ipRef = doc(db, 'polls', `main_poll/ip_records/${questionId}_${userIp}`);

      await runTransaction(db, async (transaction) => {
        const ipDoc = await transaction.get(ipRef);
        if (ipDoc.exists()) {
           throw new Error("ALREADY_VOTED");
        }

        const pollDoc = await transaction.get(pollRef);
        if (!pollDoc.exists()) {
          throw "Document does not exist!";
        }

        const currentData = pollDoc.data() as PollData;
        const isOldFormat = !currentData.questions;

        if (isOldFormat) {
          const updatedCandidates = [...(currentData as any).candidates];
          const candidateIndex = updatedCandidates.findIndex((c: any) => c.id === candidateId);
          if (candidateIndex !== -1) {
            updatedCandidates[candidateIndex] = {
              ...updatedCandidates[candidateIndex],
              votes: updatedCandidates[candidateIndex].votes + 1
            };
            transaction.update(pollRef, { candidates: updatedCandidates });
            transaction.set(ipRef, { timestamp: Date.now() });
          }
        } else {
          const updatedQuestions = JSON.parse(JSON.stringify(currentData.questions)); // deep copy
          const qIndex = updatedQuestions.findIndex((q: any) => q.id === questionId);
          if (qIndex !== -1) {
             const candidateIndex = updatedQuestions[qIndex].candidates.findIndex((c: any) => c.id === candidateId);
             if (candidateIndex !== -1) {
               updatedQuestions[qIndex].candidates[candidateIndex].votes += 1;
               transaction.update(pollRef, { questions: updatedQuestions });
               transaction.set(ipRef, { timestamp: Date.now() });
             }
          }
        }
      });
    } catch (e: any) {
      if (e?.message === "ALREADY_VOTED") {
         alert("You have already voted on this poll from this IP address.");
         return; // Skip local fallback recording if they already voted on server
      }
      console.warn("Vote recording failed (likely quota limit). Vote recorded locally.", e);
    }
  };

  const handleShare = () => {
    if (navigator.share) {
      navigator.share({
        title: activePollData?.questions?.[0]?.text || 'Poll',
        text: (activePollData?.questions?.map(q => q.text).join(' | ') || 'Check out this poll!'),
        url: window.location.href,
      });
    } else {
      alert("Sharing is not supported on this browser.");
    }
  };

  if (!pollData || !activePollData) {
    return (
      <div className="min-h-[100dvh] bg-[#F0F2F5] flex flex-col items-center justify-center font-sans antialiased text-[#1C1E21]">
        <div className="w-16 h-16 border-4 border-[#1877F2]/20 border-t-[#1877F2] rounded-full animate-spin mb-4" />
        <p className="font-bold text-zinc-500 uppercase tracking-widest text-sm">Loading Poll...</p>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-[#F0F2F5] flex flex-col items-center font-sans antialiased text-[#1C1E21] selection:bg-[#1877F2] selection:text-white">
      <AnimatePresence>
        {showAd && (
          <motion.div 
              key="ad-view"
              initial={{ opacity: 0, y: 50 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 50 }}
              transition={{ duration: 0.3 }}
              className="fixed inset-0 z-[150] flex flex-col bg-white"
            >
            <div className="flex-grow p-6 flex flex-col items-center justify-center">
               <div className="w-full max-w-2xl aspect-[4/3] bg-[#fff9e6] border-2 border-[#ffcc80] rounded-2xl flex flex-col items-center justify-center text-center p-6 shadow-sm overflow-hidden relative">
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
            <div className="bg-[#e8f5e9] border-t-2 border-[#c8e6c9] p-4 flex items-center justify-center gap-2 text-[#2e7d32] font-medium shrink-0 shadow-inner pb-8">
              <Clock className="w-5 h-5" />
              Result will be shown in {timeLeft} seconds
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Admin Login Modal */}
      <AnimatePresence>
        {showAdminLogin && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
          >
            <motion.div 
              initial={{ scale: 0.95, opacity: 0, y: 10 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 10 }}
              className="bg-white p-6 rounded-3xl shadow-2xl max-w-sm w-full relative overflow-hidden"
            >
              <div className="absolute top-0 left-0 w-full h-1.5 bg-[#1877F2]"></div>
              <h2 className="text-2xl font-bold mb-2 font-display text-[#1C1E21]">Admin Access</h2>
              <p className="text-sm text-zinc-500 mb-6 font-medium">Please enter the admin password to continue.</p>
              <input 
                type="password"
                value={adminPassword}
                onChange={(e) => setAdminPassword(e.target.value)}
                className="w-full border-2 border-zinc-200 p-3.5 rounded-xl focus:border-[#1877F2] focus:ring-4 focus:ring-[#1877F2]/10 focus:outline-none mb-2 text-lg transition-all"
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
              <AnimatePresence>
                {adminError && (
                  <motion.p 
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="text-red-500 text-xs font-bold mb-4 ml-1"
                  >
                    {adminError}
                  </motion.p>
                )}
              </AnimatePresence>
              <div className="flex justify-end gap-3 mt-6">
                <button 
                  onClick={() => setShowAdminLogin(false)}
                  className="px-5 py-2.5 bg-zinc-100 hover:bg-zinc-200 rounded-xl text-sm font-bold text-zinc-600 transition-colors uppercase tracking-wider"
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
                  className="px-6 py-2.5 bg-[#1877F2] hover:bg-[#166FE5] rounded-xl text-sm font-bold text-white transition-colors uppercase tracking-wider shadow-md"
                >
                  Login
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence mode="wait">
        {isAdmin ? (
          <motion.div 
            key="admin"
            initial={{ opacity: 0, scale: 0.98, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, y: -10 }}
            transition={{ duration: 0.3 }}
            className="w-full flex justify-center"
          >
            <AdminPanel 
              data={pollData} 
              onSave={(newData) => {
                setPollData(newData);
                setIsAdmin(false);
              }} 
              onLogout={() => setIsAdmin(false)}
              onResetData={async () => {
                try {
                  const pollRef = doc(db, 'polls', 'main_poll');
                  const newData = { ...pollData };
                  if (newData.questions) {
                    newData.questions.forEach(q => {
                      if (q.candidates) {
                        q.candidates.forEach(c => c.votes = 0);
                      }
                    });
                  } else if ((newData as any).candidates) {
                    (newData as any).candidates.forEach((c: any) => c.votes = 0);
                  }
                  await setDoc(pollRef, newData);
                  
                  const ipRecordsRef = collection(db, 'polls/main_poll/ip_records');
                  const snapshot = await getDocs(ipRecordsRef);
                  if (!snapshot.empty) {
                    for (const docSnap of snapshot.docs) {
                      await deleteDoc(docSnap.ref);
                    }
                  }
                  
                  setPollData(newData);
                  alert('All votes and IP records have been cleared successfully.');
                } catch (e: any) {
                  alert('Failed to reset votes: ' + e.message);
                }
              }}
            />
          </motion.div>
        ) : (
          <motion.div 
            key="main"
            initial={{ opacity: 0, scale: 0.98, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, y: -10 }}
            transition={{ duration: 0.3 }}
            className="w-full max-w-lg bg-white min-h-[100dvh] sm:min-h-[90vh] sm:my-8 sm:rounded-[2.5rem] shadow-2xl flex flex-col relative overflow-hidden ring-1 ring-black/5"
          >
          
          {/* Header */}
          <header className="bg-[#1877F2] text-white py-3 px-5 flex justify-between items-center shrink-0 sm:rounded-t-[2.5rem] border-b border-[#166FE5]">
            <div className="w-8" />
            <h1 className="font-display font-bold text-xl tracking-tight text-center flex-grow">PBOOK</h1>
            <button onClick={() => {
              setShowAdminLogin(true);
              setAdminPassword('');
              setAdminError('');
            }} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/10 transition-colors" title="Open Admin Panel">
              <Menu className="w-5 h-5" />
            </button>
          </header>

          {/* Main Content Area */}
          <div className="flex-grow flex flex-col overflow-y-auto scrollbar-hide bg-[#F0F2F5] relative">
            <AnimatePresence mode="wait">
                <motion.div 
                  key="main-view"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.3 }}
                  className="p-4 md:p-10 pb-24 md:pb-24 flex flex-col flex-grow max-w-2xl mx-auto w-full"
                >
                {activePollData.questions.map((q, qIndex) => {
                  const didVoteThisQuestion = votedQuestions[q.id];
                  const showResults = didVoteThisQuestion || viewAllResults;
                  const qTotalVotes = q.candidates.reduce((sum, c) => sum + c.votes, 0) || 1;
                  const selectedCandidate = selectedCandidates[q.id];

                  return (
                    <div key={q.id} id={`question-${q.id}`} className="mb-14">
                      <div className="mb-4 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <span className="px-3 py-1 bg-zinc-100 text-zinc-600 rounded-full text-xs font-bold uppercase tracking-widest border border-zinc-200">
                            Question {qIndex + 1}
                          </span>
                          {didVoteThisQuestion && (
                            <span className="px-3 py-1 bg-emerald-100 text-emerald-700 rounded-full text-xs font-bold uppercase tracking-widest border border-emerald-200 flex items-center gap-1">
                              <Check className="w-3 h-3" /> Voted
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 sm:gap-2">
                          <a href={`https://wa.me/?text=${encodeURIComponent(`Vote now: ${q.text}\n\n${window.location.origin}${window.location.pathname}?q=${q.id}`)}`} target="_blank" rel="noopener noreferrer" className="p-1.5 sm:p-2 text-zinc-400 hover:text-[#25D366] hover:bg-[#25D366]/10 rounded-lg transition-colors" title="Share on WhatsApp">
                            <svg className="w-4 h-4 sm:w-5 sm:h-5 fill-current" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/></svg>
                          </a>
                          <a href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(`${window.location.origin}${window.location.pathname}?q=${q.id}`)}&quote=${encodeURIComponent(`Vote now: ${q.text}`)}`} target="_blank" rel="noopener noreferrer" className="p-1.5 sm:p-2 text-zinc-400 hover:text-[#1877F2] hover:bg-[#1877F2]/10 rounded-lg transition-colors" title="Share on Facebook">
                            <svg className="w-4 h-4 sm:w-5 sm:h-5 fill-current" viewBox="0 0 24 24"><path d="M9.198 21.5h4v-8.01h3.604l.396-3.98h-4V7.5a1 1 0 0 1 1-1h3v-4h-3a5 5 0 0 0-5 5v2.01h-2l-.396 3.98h2.396v8.01Z"/></svg>
                          </a>
                          <button 
                            onClick={() => {
                              const shareUrl = window.location.origin + window.location.pathname + '?q=' + q.id;
                              if (navigator.share) {
                                navigator.share({
                                  title: q.text,
                                  text: `Vote now: ${q.text}`,
                                  url: shareUrl,
                                }).catch(console.error);
                              } else {
                                navigator.clipboard.writeText(shareUrl);
                                alert("Link copied to clipboard!");
                              }
                            }}
                            className="flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-1.5 text-xs sm:text-sm font-bold text-zinc-500 bg-white border border-zinc-200 rounded-xl hover:text-[#1877F2] hover:border-blue-200 hover:bg-blue-50 transition-all shadow-sm"
                          >
                            <Share2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                            <span className="hidden sm:inline">Share</span>
                          </button>
                        </div>
                      </div>
                      <h2 className="font-display text-2xl md:text-4xl font-bold mb-6 md:mb-8 text-[#1C1E21] leading-tight">
                        {q.text}
                      </h2>
                      
                      <div className="flex flex-col gap-8">
                        {!didVoteThisQuestion && (
                          <motion.div 
                            key="voting"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0, y: -10 }}
                            transition={{ duration: 0.2 }}
                            className="flex flex-col gap-4"
                          >
                            {q.candidates.map((c, i) => {
                              const isSelected = selectedCandidate === c.id;
                              return (
                                <motion.div 
                                  initial={{ opacity: 0, y: 10 }}
                                  animate={{ opacity: 1, y: 0 }}
                                  transition={{ delay: i * 0.05 }}
                                  key={c.id}
                                  onClick={() => {
                                    setSelectedCandidates({ ...selectedCandidates, [q.id]: c.id });
                                  }}
                                  className={`group flex items-center gap-3 md:gap-4 p-3 md:p-4 rounded-2xl cursor-pointer transition-all duration-300 ${isSelected ? 'bg-white shadow-[0_8px_30px_rgb(0,0,0,0.08)] ring-2 ring-[#1877F2] scale-[1.02]' : 'bg-white shadow-sm ring-1 ring-zinc-200 hover:shadow-md hover:ring-zinc-300'}`}
                                >
                                  <div className={`w-5 h-5 md:w-7 md:h-7 rounded-full flex items-center justify-center shrink-0 transition-colors duration-300 ${isSelected ? 'bg-[#1877F2] text-white' : 'bg-zinc-100 text-transparent group-hover:bg-zinc-200'}`}>
                                    <Check className="w-3 h-3 md:w-4 md:h-4" />
                                  </div>
                                  {c.photoUrl ? (
                                     <div className="relative shrink-0 overflow-hidden rounded-xl border border-zinc-100 shadow-sm">
                                       <img src={c.photoUrl} className="w-10 h-10 md:w-14 md:h-14 object-cover transition-transform duration-500 group-hover:scale-110" alt={c.name} />
                                       <button
                                          onClick={(e) => { e.stopPropagation(); setFullScreenImage(c.photoUrl); }}
                                         className="absolute inset-0 bg-[#1877F2]/40 text-white opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                                         title="View Fullscreen"
                                       >
                                         <Maximize className="w-4 h-4 md:w-5 md:h-5" />
                                       </button>
                                     </div>
                                  ) : (
                                     <div className="shrink-0 w-10 h-10 md:w-14 md:h-14 bg-zinc-50 rounded-xl flex items-center justify-center text-zinc-300 border border-zinc-200 shadow-sm transition-colors group-hover:bg-zinc-100">
                                       <User className="w-5 h-5 md:w-7 md:h-7" />
                                     </div>
                                  )}
                                  <span className={`font-medium text-base md:text-lg transition-colors ${isSelected ? 'text-[#1C1E21]' : 'text-zinc-700'}`}>
                                    {c.name}
                                  </span>
                                </motion.div>
                              )
                            })}
                            
                            <motion.button 
                              initial={{ opacity: 0, y: 10 }}
                              animate={{ opacity: 1, y: 0 }}
                              onClick={() => setConfirmVoteData({ questionId: q.id, candidateId: selectedCandidate })}
                              disabled={!selectedCandidate || isVerifyingIp}
                              className={`mt-2 py-4 px-6 rounded-2xl font-bold flex items-center justify-center gap-2 transition-all duration-300 ${!selectedCandidate || isVerifyingIp ? 'bg-zinc-100 text-zinc-400 cursor-not-allowed shadow-none' : 'bg-[#1877F2] hover:bg-[#166FE5] text-white shadow-xl hover:shadow-2xl hover:-translate-y-1'}`}
                            >
                              {isVerifyingIp ? (
                                <>
                                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-zinc-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                  </svg>
                                  Verifying...
                                </>
                              ) : (
                                "Submit Vote"
                              )}
                            </motion.button>
                          </motion.div>
                        )}

                        {showResults && (
                          <motion.div 
                            key="results"
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.3 }}
                            className="flex flex-col gap-6"
                          >
                            {q.candidates.map((c, i) => {
                              const percentage = qTotalVotes > 0 ? Math.round((c.votes / qTotalVotes) * 100) : 0;
                              return (
                                <motion.div 
                                  key={c.id} 
                                  initial={{ opacity: 0, scale: 0.95 }}
                                  animate={{ opacity: 1, scale: 1 }}
                                  transition={{ delay: i * 0.1, type: "spring", stiffness: 100 }}
                                  className={`flex flex-col gap-2 md:gap-3 p-3 md:p-4 bg-white border border-zinc-200 rounded-2xl shadow-sm hover:shadow-md transition-shadow relative overflow-hidden`}
                                >
                                  <div className="flex justify-between items-center text-xs md:text-sm font-semibold text-zinc-700 relative z-10">
                                    <span className="flex items-center gap-2 md:gap-3">
                                       {c.photoUrl ? (
                                         <img src={c.photoUrl} className="w-8 h-8 md:w-12 md:h-12 object-cover rounded-xl shadow-sm border border-zinc-100" alt={c.name} />
                                       ) : (
                                         <div className="w-8 h-8 md:w-12 md:h-12 bg-zinc-100 rounded-xl flex items-center justify-center text-zinc-400 border border-zinc-200 shadow-sm">
                                           <User className="w-4 h-4 md:w-6 md:h-6" />
                                         </div>
                                       )}
                                       <span className="text-base md:text-lg text-[#1C1E21]">{c.name}</span>
                                    </span>
                                    <div className="flex flex-col items-end">
                                      <span className="text-zinc-500 font-medium">{c.votes.toLocaleString()} <span className="hidden md:inline">{c.votes === 1 ? 'vote' : 'votes'}</span></span>
                                      <span className="text-[#1C1E21] font-bold text-base md:text-lg">{percentage}%</span>
                                    </div>
                                  </div>
                                  <div className="w-full h-3 bg-zinc-100 rounded-full overflow-hidden shadow-inner mt-1 relative z-10">
                                    <motion.div 
                                      className={`h-full ${THEMES[c.colorTheme || 'blue'].fill} rounded-full`}
                                      initial={{ width: 0 }}
                                      animate={{ width: `${percentage}%` }}
                                      transition={{ duration: 1.5, type: 'spring', bounce: 0.2, delay: i * 0.1 }}
                                    />
                                  </div>
                                  <motion.div 
                                    className={`absolute top-0 left-0 bottom-0 ${THEMES[c.colorTheme || 'blue'].bg} opacity-30 z-0`}
                                    initial={{ width: 0 }}
                                    animate={{ width: `${percentage}%` }}
                                    transition={{ duration: 1.5, type: 'spring', bounce: 0.2, delay: i * 0.1 }}
                                  />
                                </motion.div>
                              )
                            })}
                            <motion.div 
                              initial={{ opacity: 0 }} 
                              animate={{ opacity: 1 }} 
                              transition={{ delay: 0.5 }}
                              className="text-right text-sm font-medium text-zinc-400 border-b border-zinc-200 pb-6 mt-2"
                            >
                              Total votes: {qTotalVotes.toLocaleString()}
                            </motion.div>
                          </motion.div>
                        )}
                      </div>
                    </div>
                  );
                })}

                <div className="flex flex-col sm:flex-row gap-3 mt-4 mb-10">
                  <button 
                    onClick={handleShare}
                    className="flex-1 bg-white hover:bg-zinc-50 text-zinc-800 py-4 px-6 rounded-2xl font-bold flex items-center justify-center gap-2 transition-all duration-300 shadow-sm ring-1 ring-zinc-200 hover:ring-zinc-300"
                  >
                    <Share2 className="w-5 h-5" />
                    Share Poll
                  </button>
                  {!viewAllResults && (
                    <button 
                      onClick={() => {
                        if (activePollData) {
                          setTimeLeft(5);
                          setShowAd(true);
                        }
                        setViewAllResults(true);
                      }}
                      className="flex-1 bg-white hover:bg-zinc-50 text-zinc-800 py-4 px-6 rounded-2xl font-bold flex items-center justify-center gap-2 transition-all duration-300 shadow-sm ring-1 ring-zinc-200 hover:ring-zinc-300"
                    >
                      <BarChart2 className="w-5 h-5" />
                      View All Results
                    </button>
                  )}
                </div>

                <div className="w-full mb-8 flex flex-col gap-4">
                   <div className="w-full h-32 bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-200/60 rounded-3xl flex items-center justify-center shadow-sm overflow-hidden relative cursor-pointer hover:shadow-md transition-all duration-300 group">
                     {pollData.bannerAdUrl ? (
                        <img src={pollData.bannerAdUrl} className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" alt="Banner Ad" />
                     ) : (
                       <div className="flex flex-col items-center gap-2 text-amber-600">
                         <Megaphone className="w-8 h-8 opacity-80" />
                         <h3 className="text-xl font-display font-bold">{pollData.bannerAdText}</h3>
                       </div>
                     )}
                   </div>
                   
                   {/* Google Ad Slot */}
                   <GoogleAd className="w-full min-h-[100px]" />
                </div>
              </motion.div>
            </AnimatePresence>
          </div>



          {/* Footer */}
          <footer className="bg-white border-t border-zinc-200 text-[#1C1E21] p-6 md:p-8 flex flex-col items-center gap-8 shrink-0">
              {pollData.faqs && pollData.faqs.length > 0 && (
                <div className="w-full max-w-2xl flex flex-col gap-3">
                  <h3 className="text-lg font-display font-bold text-[#1C1E21] mb-2 flex items-center gap-2">
                    <HelpCircle className="w-5 h-5 text-zinc-400" /> Frequently Asked Questions
                  </h3>
                  {pollData.faqs.map((faq, index) => (
                    <div key={index} className="bg-zinc-50 rounded-2xl overflow-hidden border border-zinc-200/80 hover:border-zinc-300 transition-colors">
                      <button
                        onClick={() => setOpenFaqIndex(openFaqIndex === index ? null : index)}
                        className="w-full p-5 flex justify-between items-center text-left hover:bg-zinc-100 transition-colors font-medium text-zinc-800"
                      >
                        {faq.question}
                        <ChevronDown className={`w-5 h-5 shrink-0 text-zinc-400 transition-transform duration-300 ${openFaqIndex === index ? 'rotate-180' : ''}`} />
                      </button>
                      <AnimatePresence>
                        {openFaqIndex === index && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="overflow-hidden bg-white border-t border-zinc-100"
                          >
                            <p className="p-5 text-sm text-zinc-600 leading-relaxed whitespace-pre-wrap">
                              {faq.answer}
                            </p>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex flex-col items-center gap-3">
                <span className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Share this poll</span>
                <div className="flex items-center gap-4">
                  <a href={`https://wa.me/?text=${encodeURIComponent((activePollData?.questions?.map(q => q.text).join(' | ') || 'Check out this poll') + '\n\n' + window.location.href)}`} target="_blank" rel="noopener noreferrer" className="bg-zinc-100 text-zinc-600 hover:bg-[#25D366] hover:text-white p-3 rounded-full transition-colors" title="Share on WhatsApp">
                    <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/></svg>
                  </a>
                  <a href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(window.location.href)}&quote=${encodeURIComponent(activePollData?.questions?.map(q => q.text).join(' | ') || 'Check out this poll')}`} target="_blank" rel="noopener noreferrer" className="bg-zinc-100 text-zinc-600 hover:bg-[#1877F2] hover:text-white p-3 rounded-full transition-colors" title="Share on Facebook">
                    <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24"><path d="M9.198 21.5h4v-8.01h3.604l.396-3.98h-4V7.5a1 1 0 0 1 1-1h3v-4h-3a5 5 0 0 0-5 5v2.01h-2l-.396 3.98h2.396v8.01Z"/></svg>
                  </a>
                </div>
              </div>
              <div className="flex items-center gap-2 border-t border-zinc-100 pt-6 w-full justify-center">
                <Phone className="w-4 h-4 text-zinc-400" />
                <span className="text-sm font-medium tracking-wide text-zinc-500">Contact for Ad: <span className="text-zinc-800">{pollData.contactPhone}</span></span>
              </div>
            </footer>
          
          {/* Confirmation Dialog Overlay */}
          <AnimatePresence>
          {confirmVoteData && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
            >
              <motion.div 
                initial={{ opacity: 0, scale: 0.95, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 10 }}
                className="bg-white rounded-3xl p-6 md:p-8 max-w-sm w-full shadow-2xl border border-zinc-100"
              >
                <div className="w-12 h-12 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center mb-5 mx-auto">
                  <HelpCircle className="w-6 h-6" />
                </div>
                <h3 className="text-2xl font-display font-bold text-center text-[#1C1E21] mb-2">Confirm Vote</h3>
                <p className="text-zinc-500 text-center mb-8 font-medium">
                  Are you sure you want to vote for <span className="text-[#1C1E21] font-bold">
                    {activePollData.questions.find(q => q.id === confirmVoteData.questionId)?.candidates.find(c => c.id === confirmVoteData.candidateId)?.name}
                  </span>?
                  <br />This action cannot be undone.
                </p>
                <div className="flex gap-3">
                  <button 
                    onClick={() => setConfirmVoteData(null)}
                    className="flex-1 py-3.5 px-4 rounded-xl font-bold text-zinc-600 bg-zinc-100 hover:bg-zinc-200 transition-colors"
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={() => {
                      handleVoteClick(confirmVoteData.questionId, confirmVoteData.candidateId);
                      setConfirmVoteData(null);
                    }}
                    className="flex-1 py-3.5 px-4 rounded-xl font-bold text-white bg-[#1877F2] hover:bg-[#166FE5] shadow-md hover:shadow-lg transition-all"
                  >
                    Confirm
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
          </AnimatePresence>
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
                className="px-6 py-3 bg-[#1877F2] hover:bg-[#166FE5] rounded-xl font-bold uppercase tracking-widest text-white text-xs flex items-center gap-2 transition shadow-lg mt-2"
              >
                <Download className="w-4 h-4" /> Download Photo
              </a>
            </div>
          )}
        </motion.div>
      )}
      </AnimatePresence>
    </div>
  );
}

function AdminPanel({ data, onSave, onLogout, onResetData }: { data: PollData, onSave: (d: PollData) => void, onLogout: () => void, onResetData: () => Promise<void> }) {
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
