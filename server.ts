import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import axios from "axios";
import axiosRetry from "axios-retry";
import multer from "multer";
import { v2 as cloudinary } from "cloudinary";
import { initializeApp } from 'firebase/app';
import { getFirestore, doc, getDoc, setDoc, collection, getDocs, query, orderBy, limit, serverTimestamp } from 'firebase/firestore';

import fs from "fs";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load Firebase config safely
let firebaseConfig: any = {};
const configPath = path.join(__dirname, 'firebase-applet-config.json');
if (fs.existsSync(configPath)) {
  firebaseConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
} else {
  console.warn("firebase-applet-config.json not found, using environment variables only.");
}

// Initialize Firebase for backend use
const firebaseConfigModel = {
  apiKey: process.env.VITE_FIREBASE_API_KEY || firebaseConfig.apiKey,
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN || firebaseConfig.authDomain,
  projectId: process.env.VITE_FIREBASE_PROJECT_ID || firebaseConfig.projectId,
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET || firebaseConfig.storageBucket,
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID || firebaseConfig.messagingSenderId,
  appId: process.env.VITE_FIREBASE_APP_ID || firebaseConfig.appId,
  firestoreDatabaseId: process.env.VITE_FIREBASE_DATABASE_ID || firebaseConfig.firestoreDatabaseId,
};

const firebaseApp = initializeApp(firebaseConfigModel);
const db = getFirestore(firebaseApp, firebaseConfigModel.firestoreDatabaseId);

// Cloudinary Configuration
const cloudinaryCloudName = process.env.CLOUDINARY_CLOUD_NAME;
const cloudinaryApiKey = process.env.CLOUDINARY_API_KEY;
const cloudinaryApiSecret = process.env.CLOUDINARY_API_SECRET;

console.log(`Initialising Cloudinary with Cloud Name: ${cloudinaryCloudName || 'missing'}, API Key: ${cloudinaryApiKey ? 'present' : 'missing'}, API Secret: ${cloudinaryApiSecret ? 'present' : 'missing'}`);

cloudinary.config({
  cloud_name: cloudinaryCloudName,
  api_key: cloudinaryApiKey,
  api_secret: cloudinaryApiSecret,
});

const storage = multer.memoryStorage();
const upload = multer({ 
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  }
});

// Configure axios with retries
const client = axios.create({
  timeout: 20000,
});

axiosRetry(client, { 
  retries: 4, 
  retryDelay: (retryCount) => {
    console.log(`Backend retry attempt ${retryCount}...`);
    return retryCount * 2000; // Linear backoff: 2s, 4s, 6s, 8s
  },
  retryCondition: (error) => {
    // Retry on network errors, timeouts, or 5xx responses
    return axiosRetry.isNetworkOrIdempotentRequestError(error) || 
           error.code === 'ECONNABORTED' || 
           error.code === 'ECONNRESET' ||
           (error.response?.status || 0) >= 500;
  }
});

import { GoogleGenAI } from "@google/genai";

// Initialize AI
let genAI: GoogleGenAI | null = null;
function getAI() {
  if (!genAI) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.warn("GEMINI_API_KEY not set on server");
      return null;
    }
    genAI = new GoogleGenAI(apiKey);
  }
  return genAI;
}

async function startServer() {
  const app = express();
  const PORT = process.env.PORT || 3000;

  app.use(express.json());

  // Proxy route for AI Chat
  app.post("/api/ai/chat", async (req, res) => {
    try {
      const { prompt, history, systemInstruction } = req.body;
      const ai = getAI();
      if (!ai) return res.status(500).json({ error: "AI not configured on server" });

      const model = ai.getGenerativeModel({
        model: "gemini-1.5-flash",
        systemInstruction,
      });

      const contents = [
        ...history.map((msg: any) => ({
          role: msg.role === 'user' ? 'user' : 'model',
          parts: [{ text: msg.text }]
        })),
        {
          role: 'user',
          parts: [{ text: prompt }]
        }
      ];

      const result = await model.generateContentStream({
        contents,
        generationConfig: {
          temperature: 0.7,
          topP: 0.8,
          topK: 40,
        },
      });

      // Set headers for streaming
      res.setHeader('Content-Type', 'text/plain');
      res.setHeader('Transfer-Encoding', 'chunked');

      for await (const chunk of result.stream) {
        const text = chunk.text();
        if (text) {
          res.write(text);
        }
      }
      res.end();
    } catch (error: any) {
      console.error('AI Proxy Error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Proxy route for AI Image Search
  app.post("/api/ai/image-search", async (req, res) => {
    try {
      const { prompt } = req.body;
      const ai = getAI();
      if (!ai) return res.status(500).json({ error: "AI not configured on server" });

      const model = ai.getGenerativeModel({ model: "gemini-1.5-flash" });
      const result = await model.generateContent({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        tools: [{ googleSearch: {} } as any]
      });

      const response = result.response;
      const text = response.text();
      const groundingUrl = response.candidates?.[0]?.groundingMetadata?.groundingChunks?.[0]?.web?.uri;

      res.json({ text, groundingUrl });
    } catch (error: any) {
      console.error('AI Image Search Error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Health check
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", time: new Date().toISOString() });
  });

  // Arduino API: Get current greenhouse status
  app.get("/api/arduino/status", async (req, res) => {
    try {
      const statusDoc = await getDoc(doc(db, 'greenhouse', 'current'));
      if (statusDoc.exists()) {
        res.json(statusDoc.data());
      } else {
        res.status(404).json({ error: "No status found" });
      }
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Arduino API: Update greenhouse status (sensors)
  app.post("/api/arduino/update", async (req, res) => {
    try {
      const { temperature, humidity, light, soilMoisture } = req.body;
      
      // Basic validation
      if (temperature === undefined || humidity === undefined) {
        return res.status(400).json({ error: "Missing required sensor data" });
      }

      const updateData = {
        temperature: Number(temperature),
        humidity: Number(humidity),
        light: light !== undefined ? Number(light) : 0,
        soilMoisture: soilMoisture !== undefined ? Number(soilMoisture) : 0,
        lastUpdate: serverTimestamp()
      };

      await setDoc(doc(db, 'greenhouse', 'current'), updateData, { merge: true });
      
      // Also log to history
      const historyRef = collection(db, 'greenhouse_history');
      await setDoc(doc(historyRef, new Date().toISOString()), updateData);

      res.json({ status: "success", received: updateData });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Arduino API: Get pending tasks
  app.get("/api/arduino/tasks", async (req, res) => {
    try {
      const tasksRef = collection(db, 'tasks');
      const q = query(tasksRef, orderBy('createdAt', 'desc'), limit(10));
      const snapshot = await getDocs(q);
      const tasks = snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .filter((t: any) => t.status === 'pending');
      
      res.json(tasks);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Proxy route for OpenFoodFacts to avoid CORS issues
  app.get("/api/product/:barcode", async (req, res) => {
    const { barcode } = req.params;
    console.log(`Proxying request for barcode: ${barcode}`);
    
    // Try different API versions and subdomains
    const urls = [
      `https://world.openfoodfacts.org/api/v2/product/${barcode}.json`,
      `https://world.openfoodfacts.org/api/v0/product/${barcode}.json`,
      `https://de.openfoodfacts.org/api/v2/product/${barcode}.json`,
      `https://fr.openfoodfacts.org/api/v2/product/${barcode}.json`
    ];

    let lastError: any = null;

    for (const url of urls) {
      try {
        console.log(`Trying URL: ${url}`);
        const response = await client.get(url, {
          headers: {
            'User-Agent': 'EcoScanApp/1.4 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 (mihail.cozirev2017@gmail.com)'
          }
        });
        
        // If we got a valid response
        if (response.data && typeof response.data === 'object') {
          // API v2 has a slightly different structure sometimes, but usually similar
          return res.json(response.data);
        }
      } catch (error: any) {
        lastError = error;
        console.warn(`Failed to fetch from ${url}:`, error.code || error.message);
        // If it's a 404, 400 or 403, the product cannot be found or accessed, return graceful "not found"
        if (error.response?.status === 404 || error.response?.status === 400 || error.response?.status === 403) {
          console.log(`OpenFoodFacts returned ${error.response.status} for ${barcode}, treating as not found.`);
          return res.json({ 
            status: 0, 
            status_verbose: "product not found or access denied",
            barcode: barcode,
            http_status: error.response.status
          });
        }
      }
    }
    
    // If all URLs failed
    let errorMessage = lastError?.message || "Unknown error";
    let status = 500;

    if (lastError?.response) {
      status = lastError.response.status;
      errorMessage = `OpenFoodFacts responded with ${status}`;
    } else if (lastError?.code === 'ECONNRESET' || lastError?.message?.includes('hang up')) {
      errorMessage = "Connection was reset by OpenFoodFacts (Socket Hang Up)";
    } else if (lastError?.request) {
      errorMessage = "No response received from OpenFoodFacts after multiple attempts (Network Error)";
    }
      
    console.error(`All proxy attempts failed for barcode ${barcode}:`, errorMessage);
    
    // Ensure we ALWAYS return JSON
    return res.status(status).json({ 
      error: "Failed to fetch product from OpenFoodFacts", 
      details: errorMessage,
      barcode: barcode,
      status: 0
    });
  });

  // Cloudinary Upload Route
  app.post("/api/upload", upload.single('image'), async (req: any, res: any) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      // Upload to Cloudinary using base64 or buffer
      const fileBase64 = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
      const result = await cloudinary.uploader.upload(fileBase64, {
        folder: 'greenhouse_marketplace',
      });

      res.json({ url: result.secure_url });
    } catch (error: any) {
      console.error('Upload error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
