import { initializeApp } from 'firebase/app';
import { getFirestore, doc, getDoc, setDoc, collection, getDocs, deleteDoc } from 'firebase/firestore';
import * as fs from 'fs';

const firebaseConfig = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));
const app = initializeApp(firebaseConfig);
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

async function reset() {
  const pollRef = doc(db, 'polls', 'main_poll');
  const pollSnap = await getDoc(pollRef);
  if (pollSnap.exists()) {
    const data = pollSnap.data();
    if (data.questions) {
       data.questions.forEach((q: any) => {
         q.candidates.forEach((c: any) => {
           c.votes = 0;
         });
       });
       await setDoc(pollRef, data);
       console.log('Votes reset.');
    }
  }

  const votedIpsRef = collection(db, 'polls', 'main_poll', 'ip_records');
  const ipsSnap = await getDocs(votedIpsRef);
  let deleted = 0;
  for (const docSnap of ipsSnap.docs) {
    await deleteDoc(docSnap.ref);
    deleted++;
  }
  console.log(`Deleted ${deleted} IP records.`);
  process.exit(0);
}

reset().catch(console.error);
