import { initializeApp } from "firebase/app";
import { getFirestore, doc, getDoc, setDoc } from "firebase/firestore";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
} from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyDX32OKEy2_JIjBuu8iUvOIcuAxOJcaaAA",
  authDomain: "zadachki-aleshi.firebaseapp.com",
  projectId: "zadachki-aleshi",
  storageBucket: "zadachki-aleshi.firebasestorage.app",
  messagingSenderId: "480405402188",
  appId: "1:480405402188:web:db042213e7b2926ae1bae9",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

export { signInWithPopup, signOut, onAuthStateChanged };

export async function dbGetUser(login) {
  const snap = await getDoc(doc(db, "users", login));
  return snap.exists() ? snap.data() : null;
}

export async function dbCreateUser(login, password) {
  await setDoc(doc(db, "users", login), { password });
}

export async function dbGetProjects(login) {
  const snap = await getDoc(doc(db, "projects", login));
  return snap.exists() ? snap.data().items : null;
}

export async function dbSaveProjects(login, projects) {
  await setDoc(doc(db, "projects", login), { items: projects });
}
