import express from 'express';
import path from 'path';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';
import * as dotenv from 'dotenv';
import { GarmentAnalysisService, GarmentInventory } from './server/services/GarmentAnalysisService';
import { GarmentExtractionPipeline } from './server/services/GarmentExtractionPipeline';
import { QwenImageEditService } from './server/services/QwenImageEditService';
import { GarmentTryOnService, GarmentInput } from './server/services/GarmentTryOnService';

dotenv.config();
dotenv.config({ path: '.env.example' });

const app = express();
const PORT = 3000;

// Setup directories
const uploadsDir = path.join(process.cwd(), 'uploads');
const generatedDir = path.join(process.cwd(), 'uploads', 'generated');

if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
if (!fs.existsSync(generatedDir)) fs.mkdirSync(generatedDir, { recursive: true });

// Multer config
const storage = multer.diskStorage({
  destination: function (req, file, cb) { cb(null, uploadsDir); },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname);
    cb(null, `${uuidv4()}${ext}`);
  }
});
const upload = multer({ storage, limits: { fileSize: 20 * 1024 * 1024 } }); // 20MB limit

// Middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use('/uploads', express.static(uploadsDir));

function getDashscopeKey(res: express.Response): string | null {
  const dashscopeKey = process.env.DASHSCOPE_API_KEY;
  if (!dashscopeKey) {
    res.status(500).json({ success: false, message: 'AI service authentication key missing.' });
    return null;
  }
  return dashscopeKey;
}

// Route 1: Fast Garment Analysis (Stage 1) — compresses image before sending to AI
app.post('/api/garment/analyze', (req, res, next) => {
  upload.single('image')(req, res, (err) => {
    if (err) return res.status(400).json({ success: false, message: err.message });
    next();
  });
}, async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'No image uploaded' });

    const apiKey = getDashscopeKey(res);
    if (!apiKey) return;

    // Compress image before sending to AI to reduce upload payload
    const { base64: compressedBase64 } = await QwenImageEditService.compressInputImage(req.file.path);

    console.log('[Server] Requesting Stage 1 Garment Analysis (compressed)...');
    const inventory = await GarmentAnalysisService.analyzeImage(compressedBase64, apiKey);

    res.json({ success: true, inventory });

  } catch (error: any) {
    console.error('Garment analysis error:', error);
    res.status(500).json({ success: false, message: error.message || 'Failed to analyze garments.' });
  }
});

// Route 2: Fast Parallel Garment Extraction Pipeline
app.post('/api/garment/extract', (req, res, next) => {
  upload.single('image')(req, res, (err) => {
    if (err) return res.status(400).json({ success: false, message: err.message });
    next();
  });
}, async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'No image uploaded' });

    const apiKey = getDashscopeKey(res);
    if (!apiKey) return;

    let confirmedInventory: GarmentInventory | null = null;
    if (req.body.confirmed_inventory) {
      try {
        confirmedInventory = typeof req.body.confirmed_inventory === 'string'
          ? JSON.parse(req.body.confirmed_inventory)
          : req.body.confirmed_inventory;
      } catch (e) {
        console.warn('Failed to parse confirmed_inventory — will run auto-analysis');
      }
    }

    console.log('[Server] Executing Fast Parallel Garment Extraction Pipeline...');
    const pipelineResult = await GarmentExtractionPipeline.processExtraction(
      req.file.path,
      req.file.mimetype,
      confirmedInventory,
      apiKey,
      generatedDir
    );

    res.json(pipelineResult);

  } catch (error: any) {
    console.error('Garment extraction error:', error);
    res.status(500).json({ success: false, message: error.message || 'Extraction failed.' });
  }
});

// Route 3: Multi-garment Virtual Try-On (Dress model in selected outfit)
app.post('/api/garment/tryon', (req, res, next) => {
  upload.single('person_image')(req, res, (err) => {
    if (err) return res.status(400).json({ success: false, message: err.message });
    next();
  });
}, async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'No model/person image uploaded' });

    const apiKey = getDashscopeKey(res);
    if (!apiKey) return;

    let selectedGarments: Array<{ id: string; category: string; description: string; color: string; imageUrl: string }> = [];
    if (req.body.selected_garments) {
      try {
        selectedGarments = typeof req.body.selected_garments === 'string'
          ? JSON.parse(req.body.selected_garments)
          : req.body.selected_garments;
      } catch (e) {
        return res.status(400).json({ success: false, message: 'Invalid selected_garments JSON format' });
      }
    }

    if (!selectedGarments || selectedGarments.length === 0) {
      return res.status(400).json({ success: false, message: 'Please select at least 1 garment from your closet to try on.' });
    }

    console.log(`[Server] Processing Try-On with ${selectedGarments.length} garment(s)...`);

    // Resolve local file paths for each selected garment
    const garmentInputs: GarmentInput[] = [];

    for (const g of selectedGarments) {
      let garmentPath = '';
      if (g.imageUrl.startsWith('/uploads/')) {
        garmentPath = path.join(process.cwd(), g.imageUrl.replace(/^\//, ''));
      } else if (g.imageUrl.startsWith('data:image')) {
        // Save base64 to temp file
        const base64Data = g.imageUrl.replace(/^data:image\/\w+;base64,/, '');
        const tempFilename = `temp_garment_${uuidv4()}.png`;
        garmentPath = path.join(uploadsDir, tempFilename);
        fs.writeFileSync(garmentPath, Buffer.from(base64Data, 'base64'));
      } else if (fs.existsSync(g.imageUrl)) {
        garmentPath = g.imageUrl;
      }

      if (garmentPath && fs.existsSync(garmentPath)) {
        garmentInputs.push({
          imagePath: garmentPath,
          description: g.description || g.category || 'Garment item',
          category: g.category || 'garment',
          color: g.color
        });
      } else {
        console.warn(`[Server] Garment image not found on disk: ${g.imageUrl}`);
      }
    }

    if (garmentInputs.length === 0) {
      return res.status(400).json({ success: false, message: 'Could not locate selected garment images on server.' });
    }

    const tryOnResult = await GarmentTryOnService.executeTryOn(
      req.file.path,
      garmentInputs,
      apiKey,
      generatedDir
    );

    res.json({
      success: true,
      image_url: tryOnResult.publicUrl,
      message: 'Virtual try-on completed successfully!'
    });

  } catch (error: any) {
    console.error('Virtual try-on error:', error);
    res.status(500).json({ success: false, message: error.message || 'Virtual try-on failed.' });
  }
});

// Error handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error(err.stack);
  res.status(500).json({ success: false, message: 'Internal Server Error' });
});

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => res.sendFile(path.join(distPath, 'index.html')));
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer();
