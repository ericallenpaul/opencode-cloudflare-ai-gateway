import express from 'express';
import { createApp } from './app.js';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3001;

const app = createApp();

// Serve built React frontend
const distPath = join(__dirname, '..', 'dist');
app.use(express.static(distPath));

// Fallback: serve index.html for all non-API routes (SPA)
app.get('*', (req, res) => {
  res.sendFile(join(distPath, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
