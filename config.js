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
        apiKey: "AIzaSyD0TSlpLX6CaohJAg-PKrPiaENROqd_UAA",
        authDomain: "datamind-ai-1e132.firebaseapp.com",
        projectId: "datamind-ai-1e132",
        storageBucket: "datamind-ai-1e132.firebasestorage.app",
        messagingSenderId: "515616745229",
        appId: "1:515616745229:web:fc89568041c1b5e4e9f244"
    }
};

// Log to console to verify config is loaded
console.log("DataMind AI Config Loaded Successfully.");
