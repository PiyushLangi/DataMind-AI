// ============================================
// CONFIGURATION — Global API Keys and Settings
// ============================================
const CONFIG = {
    // Replace "YOUR_GEMINI_API_KEY_HERE" with your actual Gemini API Key
    geminiApiKey: "YOUR_API_KEY",
    geminiModel: "gemini-2.0-flash",
    maxTokens: 2048,
    geminiEndpoint: "https://generativelanguage.googleapis.com/v1beta/models/",

    // Firebase Configuration
    firebaseConfig: {
        apiKey: "YOUR_FIREBASE_API_KEY",
        authDomain: "YOUR_PROJECT.firebaseapp.com",
        projectId: "YOUR_PROJECT_ID",
        storageBucket: "YOUR_PROJECT.appspot.com",
        messagingSenderId: "YOUR_SENDER_ID",
        appId: "YOUR_APP_ID"
    }
};

// Log to console to verify config is loaded
console.log("DataMind AI Config Loaded Successfully.");
