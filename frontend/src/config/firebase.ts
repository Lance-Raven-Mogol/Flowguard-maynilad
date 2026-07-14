import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyClpR_ZaVu7_Ja5MlnF0Kq9Kpyv_VTrB8k",
  authDomain: "flowguard-a39c9.firebaseapp.com",
  projectId: "flowguard-a39c9",
  storageBucket: "flowguard-a39c9.firebasestorage.app",
  messagingSenderId: "352045626085",
  appId: "1:352045626085:web:d4413d3f315f97ffdb5a0c",
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export default app;
