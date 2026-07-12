export interface Candidate {
  id: string;
  name: string;
  photoUrl: string;
  colorTheme: 'blue' | 'green' | 'orange' | 'purple';
  votes: number;
}

export interface Question {
  id: string;
  text: string;
  candidates: Candidate[];
}

export interface PollHistoryEntry {
  id: string;
  timestamp: string;
  questions: Question[];
}

export interface PollData {
  questions: Question[];
  interstitialAdUrl: string;
  interstitialAdText: string;
  bannerAdUrl: string;
  bannerAdText: string;
  adRedirectUrl?: string;
  contactPhone: string;
  recentPhotos?: string[];
  history?: PollHistoryEntry[];
  faqs?: { question: string; answer: string }[];
}
