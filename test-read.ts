import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';
import * as fs from 'fs';

const firebaseConfig = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));
const app = initializeApp(firebaseConfig);
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

async function test() {
  const votedIpsRef = collection(db, 'polls', 'main_poll', 'voted_ips');
  try {
    const ipsSnap = await getDocs(votedIpsRef);
    console.log(`Found ${ipsSnap.size} docs`);
  } catch (e) {
    console.error(e);
  }
  process.exit(0);
}
test();
