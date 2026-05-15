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
}

// Initialize Firebase for backend use (Arduino monitoring)
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
const cloudName = process.env.CLOUDINARY_CLOUD_NAME?.trim();
const apiKey = process.env.CLOUDINARY_API_KEY?.trim();
const apiSecret = process.env.CLOUDINARY_API_SECRET?.trim();

console.log('Cloudinary Config Check:', {
  cloudName: cloudName ? `Set (${cloudName.substring(0, 3)}...)` : 'Missing',
  apiKey: apiKey ? `Set (${apiKey.substring(0, 3)}...)` : 'Missing',
  apiSecret: apiSecret ? 'Set (exists)' : 'Missing'
});

if (cloudName && apiKey && apiSecret) {
  cloudinary.config({
    cloud_name: cloudName,
    api_key: apiKey,
    api_secret: apiSecret,
    secure: true
  });
}

const storage = multer.memoryStorage();
const upload = multer({ 
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }
});

// Configure axios for OpenFoodFacts proxy
const client = axios.create({ timeout: 20000 });
axiosRetry(client, { 
  retries: 3, 
  retryDelay: (retryCount) => retryCount * 2000,
  retryCondition: (error) => axiosRetry.isNetworkOrIdempotentRequestError(error) || (error.response?.status || 0) >= 500
});

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT || 3000);

  app.use(express.json());

  // AI Setup Helpers
  async function handleOpenRouterChat(req: any, res: any) {
    const { prompt, history, systemInstruction } = req.body;
    
    // Fallback model list
    const fallbackModels = [
      "inclusionai/ring-2.6-1t:free",
      "baidu/cobuddy:free",
      "openrouter/owl-alpha",
      "nvidia/nemotron-3-super-120b-a12b:free",
      "recraft/recraft-v4.1-pro-vector"
    ];

    let lastError: any = null;

    for (const model of fallbackModels) {
      try {
        console.log(`Attempting OpenRouter request with model: ${model}`);
        const response = await axios.post(
          "https://openrouter.ai/api/v1/chat/completions",
          {
            model: model,
            messages: [
              { role: "system", content: systemInstruction },
              ...history.map((msg: any) => ({
                role: msg.role === 'user' ? 'user' : 'assistant',
                content: msg.text
              })),
              { role: "user", content: prompt }
            ],
            stream: true,
          },
          {
            headers: {
              "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
              "HTTP-Referer": "https://ai.studio/build",
              "X-Title": "Food-Connect-Markt",
              "Content-Type": "application/json"
            },
            responseType: "stream"
          }
        );

        res.setHeader('Content-Type', 'text/plain');
        res.setHeader('Transfer-Encoding', 'chunked');

        response.data.on("data", (chunk: Buffer) => {
          const chunks = chunk.toString().split("\n");
          for (const line of chunks) {
            if (line.startsWith("data: ")) {
              const data = line.slice(6).trim();
              if (data === "[DONE]") continue;
              try {
                const parsed = JSON.parse(data);
                const content = parsed.choices?.[0]?.delta?.content;
                if (content) res.write(content);
              } catch (e) {
                // Ignore partial or malformed JSON
              }
            }
          }
        });

        response.data.on("end", () => res.end());
        response.data.on("error", (err: any) => {
          console.error("OpenRouter Stream Error:", err);
          if (!res.headersSent) res.status(500).send("Stream error");
          res.end();
        });

        // If we successfully started the stream, we are done
        return;

      } catch (error: any) {
        lastError = error;
        const status = error.response?.status || 500;
        const message = error.message || "Unknown error";
        console.error(`OpenRouter Attempt Failed [${model}] [${status}]:`, message);
        
        // If it's a 401 (Unauthorized) or 400 (Bad Request), maybe don't retry?
        // But for "free" models, quota errors (429) or 500s are common.
        if (status === 401) break; // Wrong API key probably
      }
    }

    // If we reach here, all attempts failed
    if (lastError) {
      const status = lastError.response?.status || 500;
      const message = lastError.message || "Unknown error";
      
      console.error(`All OpenRouter attempts failed. Final status: ${status}`);
      
      if (!res.headersSent) {
        res.status(status).json({ 
          error: "OpenRouter API failure after all fallbacks", 
          details: message,
          status: status 
        });
      }
    }
  }

  const { GoogleGenerativeAI } = await import("@google/generative-ai");
  let genAI: any = null;
  function getAI() {
    if (!genAI) {
      const key = process.env.GEMINI_API_KEY;
      if (!key) {
        console.warn("GEMINI_API_KEY missing on server");
        return null;
      }
      genAI = new GoogleGenerativeAI(key);
    }
    return genAI;
  }

  // Proxy route for AI Chat
  app.post("/api/ai/chat", async (req, res) => {
    if (process.env.OPENROUTER_API_KEY) {
      return handleOpenRouterChat(req, res);
    }

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
    // If using OpenRouter, we'll use a model that handles search or just standard chat
    if (process.env.OPENROUTER_API_KEY) {
      const { prompt } = req.body;
      const fallbackModels = [
        "google/gemini-2.0-flash-001",
        "inclusionai/ring-2.6-1t:free",
        "baidu/cobuddy:free",
        "nvidia/nemotron-3-super-120b-a12b:free",
        "recraft/recraft-v4.1-pro-vector"
      ];

      let lastError: any = null;

      for (const model of fallbackModels) {
        try {
          console.log(`Attempting OpenRouter image search with model: ${model}`);
          const response = await axios.post(
            "https://openrouter.ai/api/v1/chat/completions",
            {
              model: model,
              messages: [
                { role: "system", content: "You are a helpful assistant. If the user asks to find an image or search for something, provide a descriptive answer and include relevant source links if possible." },
                { role: "user", content: `Please provide information and source URLs for: ${prompt}` }
              ]
            },
            {
              headers: {
                "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
                "Content-Type": "application/json"
              }
            }
          );
          const text = response.data.choices[0].message.content;
          const urlMatch = text.match(/https?:\/\/[^\s)]+/);
          res.json({ text, groundingUrl: urlMatch ? urlMatch[0] : null });
          return;
        } catch (error: any) {
          lastError = error;
          const status = error.response?.status || 500;
          console.error(`OpenRouter Image Search Attempt Failed [${model}] [${status}]`);
        }
      }

      if (lastError) {
        const status = lastError.response?.status || 500;
        const message = lastError.message || "Unknown error";
        console.error('All OpenRouter image search fallbacks failed:', message);
        res.status(status).json({ error: "AI search failed", details: message });
      }
      return;
    }

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
      if (!cloudName || !apiKey || !apiSecret) {
        return res.status(400).json({ 
          error: "Cloudinary ist nicht konfiguriert. Bitte setze CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY und CLOUDINARY_API_SECRET in den Umgebungsvariablen." 
        });
      }

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
      console.error('Detailed Upload error:', error);
      
      const cloudinaryError = error.error?.message || error.message || "Unbekannter Fehler";
      
      // Check if it's a Cloudinary specific 403 error
      if (error.http_code === 403 || cloudinaryError.includes('403') || cloudinaryError.includes('unauthorized')) {
        return res.status(403).json({ 
          error: "Cloudinary Zugriff verweigert (403).",
          details: cloudinaryError,
          help: "Bitte überprüfe in den Cloudinary-Einstellungen, ob der API-Key und das Secret korrekt kopiert wurden (ohne Leerzeichen) und ob dein Kontolimit (Credits) nicht überschritten wurde."
        });
      }
      
      res.status(500).json({ error: cloudinaryError });
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
