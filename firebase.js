// firebase.js
// Handles Firebase initialization and exports shared auth + db instances.

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.2/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.7.2/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.7.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBu1YTBZmsCPXzJb0Bo8jbyAzY1G5cVDJc",
  authDomain: "arrow-51e11.firebaseapp.com",
  projectId: "arrow-51e11",
  storageBucket: "arrow-51e11.firebasestorage.app",
  messagingSenderId: "430376591284",
  appId: "1:430376591284:web:d312f5dbc44e20cf7d9ce1",
};

const app = initializeApp(firebaseConfig);

const auth = getAuth(app);
const db = getFirestore(app);

export { auth, db };
