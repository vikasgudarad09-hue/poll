export interface Candidate {
  id: string;
  name: string;
  photoUrl: string;
  colorTheme: 'blue' | 'green' | 'orange' | 'purple';
  votes: number;
}

export interface PollHistoryEntry {
  id: string;
  timestamp: string;
  question: string;
  candidates: Candidate[];
}

export interface PollData {
  question: string;
  candidates: Candidate[];
  interstitialAdUrl: string;
  interstitialAdText: string;
  bannerAdUrl: string;
  bannerAdText: string;
  contactPhone: string;
  recentPhotos?: string[];
  history?: PollHistoryEntry[];
}
