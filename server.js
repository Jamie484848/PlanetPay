import express from 'express';
import { Low, JSONFile } from 'lowdb';
import cors from 'cors';
import path from 'path';
import crypto from 'crypto';
import fs from 'fs';
import { fileURLToPath } from 'url';

const app = express();
const PORT = process.env.PORT || 3000;

// ----- LowDB Setup -----
// Wir speichern in der Datei db.json und definieren drei Sammlungen: users, shops und apikeys.
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const adapter = new JSONFile(path.join(__dirname, 'db.json'));
const db = new Low(adapter, { users: [], shops: [], apikeys: [] });

await db.read();
if (!db.data) {
  db.data = { users: [], shops: [], apikeys: [] };
  await db.write();
} else {
  if (!db.data.users) db.data.users = [];
  if (!db.data.shops) db.data.shops = [];
  if (!db.data.apikeys) db.data.apikeys = [];
}

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Hilfsfunktion zur Ermittlung der nächsten ID in einem Array
function getNextId(arr) {
  if (!Array.isArray(arr)) arr = [];
  return arr.length ? Math.max(...arr.map(item => item.id)) + 1 : 1;
}

/* ====================
   Benutzer-Endpunkte (/api/admin/users)
==================== */
app.get('/api/admin/users', (req, res) => {
  res.json(db.data.users);
});

app.put('/api/admin/users/:id', async (req, res) => {
  const id = parseInt(req.params.id);
  const user = db.data.users.find(u => u.id === id);
  if (!user) return res.status(404).json({ message: 'User not found' });
  const { username, password, balance, banned } = req.body;
  if (username) user.username = username;
  if (password) user.password = password;
  if (balance !== undefined) user.balance = balance;
  if (banned !== undefined) user.banned = banned;
  await db.write();
  res.json({ message: 'User updated', user });
});

/* ====================
   Shop-Endpunkte (Collection: shops)
   Diese Endpunkte werden vom Shop Creator und Shop Management genutzt.
==================== */
app.get('/api/admin/shops', (req, res) => {
  res.json(db.data.shops);
});

app.get('/api/admin/shops/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const shop = db.data.shops.find(s => s.id === id);
  if (!shop) return res.status(404).json({ message: 'Shop not found' });
  res.json(shop);
});

app.post('/api/admin/shops', async (req, res) => {
  // Shop Creator: Erwarte alle Felder.
  const { name, owner, apiKey, color, textStyle, font, status, products } = req.body;
  if (!name || !owner || !apiKey) {
    return res.status(400).json({ message: 'Name, owner and apiKey are required' });
  }
  if (!/^[0-9a-f]{32}$/i.test(apiKey)) {
    return res.status(400).json({ message: 'Invalid API Key format' });
  }
  const domain = name.toLowerCase().replace(/\s+/g, "") + ".planetpay.com";
  const shop = {
    id: getNextId(db.data.shops),
    name,
    owner,
    apiKey,
    domain,
    color: color || "#FFA500",
    textStyle: textStyle || "normal",
    font: font || "Arial",
    status: status || "online",
    products: products || [],
    banned: false
  };
  db.data.shops.push(shop);
  await db.write();

  // Erstelle eine HTML-Datei für den Shop im Ordner "shops".
  const shopHTML = `
  <!DOCTYPE html>
  <html lang="de">
  <head>
    <meta charset="UTF-8">
    <title>${shop.name} – Planet Pay Shop</title>
    <style>
      body { font-family: ${shop.font || "Arial, sans-serif"}; background-color: ${shop.color || "#121212"}; color: #f0f0f0; margin: 0; padding: 0; }
      header { text-align: center; padding: 20px; background: rgba(0,0,0,0.8); }
      header h1 { color: #FFA500; }
      .container { width: 90%; max-width: 1000px; margin: 20px auto; padding: 20px; }
      a { color: #FFA500; text-decoration: none; font-weight: bold; }
    </style>
  </head>
  <body>
    <header>
      <h1>${shop.name}</h1>
      <p>Status: ${shop.status}</p>
      <p>Domain: ${shop.domain}</p>
      <a href="/${shop.name.toLowerCase().replace(/\s+/g, "")}.html" target="_blank">Shop besuchen</a>
    </header>
    <div class="container">
      <p>Willkommen bei ${shop.name}!</p>
    </div>
  </body>
  </html>
  `;
  const shopsDir = path.join(__dirname, 'shops');
  if (!fs.existsSync(shopsDir)) {
    fs.mkdirSync(shopsDir);
  }
  const shopFilename = path.join(shopsDir, name.toLowerCase().replace(/\s+/g, "") + ".html");
  fs.writeFile(shopFilename, shopHTML, (err) => {
    if (err) console.error("Fehler beim Schreiben der Shop-HTML Datei:", err);
    else console.log("Shop-HTML Datei erstellt:", shopFilename);
  });
  
  res.json({ message: 'Shop created', shop });
});

app.put('/api/admin/shops/:id', async (req, res) => {
  const id = parseInt(req.params.id);
  const shop = db.data.shops.find(s => s.id === id);
  if (!shop) return res.status(404).json({ message: 'Shop not found' });
  const { name, owner, color, textStyle, font, status, products, banned, domain } = req.body;
  if (name) {
    shop.name = name;
    if (!domain) shop.domain = name.toLowerCase().replace(/\s+/g, "") + ".planetpay.com";
  }
  if (owner) shop.owner = owner;
  if (color) shop.color = color;
  if (textStyle) shop.textStyle = textStyle;
  if (font) shop.font = font;
  if (status) shop.status = status;
  if (products) shop.products = products;
  if (banned !== undefined) shop.banned = banned;
  if (domain) shop.domain = domain;
  await db.write();
  res.json({ message: 'Shop updated', shop });
});

app.delete('/api/admin/shops/:id', async (req, res) => {
  const id = parseInt(req.params.id);
  const index = db.data.shops.findIndex(s => s.id === id);
  if (index === -1) return res.status(404).json({ message: 'Shop not found' });
  const shopToDelete = db.data.shops[index];
  db.data.shops.splice(index, 1);
  await db.write();
  
  // Lösche die zugehörige HTML-Datei im Ordner "shops"
  const shopFilename = path.join(__dirname, 'shops', shopToDelete.name.toLowerCase().replace(/\s+/g, "") + ".html");
  fs.unlink(shopFilename, (err) => {
    if (err) console.error("Fehler beim Löschen der Shop-HTML Datei:", err);
    else console.log("Shop-HTML Datei gelöscht:", shopFilename);
  });
  
  res.json({ message: 'Shop deleted' });
});

/* =====================================
   API Keys-Endpunkte (Collection: apikeys)
   Hier werden nur API Key-Datensätze erstellt, bearbeitet und gelöscht.
   Es wird keine Domain gespeichert.
===================================== */
app.get('/api/apikeys', (req, res) => {
  res.json(db.data.apikeys);
});

app.post('/api/apikeys', async (req, res) => {
  if (!db.data.apikeys) db.data.apikeys = [];
  const { name } = req.body;
  if (!name) return res.status(400).json({ message: 'Shop Name is required' });
  const apiKey = crypto.randomBytes(16).toString("hex");
  const record = {
    id: getNextId(db.data.apikeys),
    name,
    apiKey,
    banned: false
  };
  db.data.apikeys.push(record);
  await db.write();
  res.json({ message: 'API Key created', record });
});

app.put('/api/apikeys/:id', async (req, res) => {
  const id = parseInt(req.params.id);
  const record = db.data.apikeys.find(r => r.id === id);
  if (!record) return res.status(404).json({ message: 'Record not found' });
  const { name, banned } = req.body;
  if (name) record.name = name;
  if (banned !== undefined) record.banned = banned;
  await db.write();
  res.json({ message: 'API Key record updated', record });
});

app.delete('/api/apikeys/:id', async (req, res) => {
  const id = parseInt(req.params.id);
  const index = db.data.apikeys.findIndex(r => r.id === id);
  if (index === -1) return res.status(404).json({ message: 'Record not found' });
  db.data.apikeys.splice(index, 1);
  await db.write();
  res.json({ message: 'API Key record deleted' });
});

/* =====================================
   Dynamische Shop-Seite (Self-hosted)
   Jeder Shop aus "shops" wird als eigene HTML-Seite gespeichert.
   Aufruf: /storename.html
===================================== */
app.get('/:storename', (req, res) => {
  let storename = req.params.storename;
  // Falls die URL mit ".html" endet, entferne diese Endung
  if (storename.endsWith('.html')) {
    storename = storename.slice(0, -5);
  }
  // Reserviere Pfade
  if (storename.startsWith('api') || storename.startsWith('admin')) return res.status(404).send("Not found");
  
  // Suche in der shops-Collection (case-insensitive)
  const shop = db.data.shops.find(s => s.name.toLowerCase() === storename.toLowerCase());
  if (!shop) return res.status(404).send("Shop not found.");
  
  let productsHTML = "";
  if (shop.products && shop.products.length > 0) {
    productsHTML = shop.products.map(prod => `
      <div style="border:1px solid #444; padding:10px; margin:10px;">
        <h2>${prod.name}</h2>
        <p>Preis: €${prod.price.toFixed(2)}</p>
        <p>${prod.available ? "Verfügbar" : "Nicht verfügbar"}</p>
      </div>
    `).join("");
  } else {
    productsHTML = "<p>Keine Produkte vorhanden.</p>";
  }
  
  const html = `
    <!DOCTYPE html>
    <html lang="de">
    <head>
      <meta charset="UTF-8">
      <title>${shop.name} – Planet Pay Shop</title>
      <style>
        body {
          font-family: ${shop.font || "Arial, sans-serif"};
          background-color: ${shop.color || "#121212"};
          color: #f0f0f0;
          ${shop.textStyle === "italic" ? "font-style: italic;" : ""}
          ${shop.textStyle === "bold" ? "font-weight: bold;" : ""}
          margin: 0;
          padding: 0;
        }
        header { text-align: center; padding: 20px; background: rgba(0,0,0,0.8); }
        header h1 { color: #FFA500; }
        .container { width: 90%; max-width: 1000px; margin: 20px auto; padding: 20px; }
      </style>
    </head>
    <body>
      <header>
        <h1>${shop.name}</h1>
        <p>Status: ${shop.status}</p>
        <p>Domain: ${shop.domain}</p>
      </header>
      <div class="container">
        ${productsHTML}
      </div>
    </body>
    </html>
  `;
  res.send(html);
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
