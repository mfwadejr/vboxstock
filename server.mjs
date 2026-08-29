import { createServer } from "node:http";
import { readFile, stat, readdir, writeFile, copyFile, unlink } from "node:fs/promises";
import { mkdirSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { backup, DatabaseSync } from "node:sqlite";

const port = Number(process.env.PORT || 3000);
const dataDir = process.env.DATA_DIR || "/data";
const databasePath = join(dataDir, "stockroom.db");
const backupDir = join(dataDir, "backups");
const publicDir = join(import.meta.dirname, "public");
mkdirSync(dataDir, { recursive: true });
mkdirSync(backupDir, { recursive: true });
const db = new DatabaseSync(databasePath);
db.exec(`
  PRAGMA journal_mode=WAL;
  PRAGMA foreign_keys=ON;
  CREATE TABLE IF NOT EXISTS products (
    id TEXT PRIMARY KEY, uid TEXT NOT NULL DEFAULT '', sn TEXT NOT NULL DEFAULT '', mac TEXT NOT NULL DEFAULT '',
    manufacturer TEXT NOT NULL DEFAULT 'vSeeBox' CHECK(manufacturer='vSeeBox'),
    model TEXT NOT NULL CHECK(model IN ('V3 Plus','V6 Plus','V6 Pro','V5 Pro')),
    condition TEXT NOT NULL CHECK(condition IN ('New','Used','Refurbished')),
    received_at TEXT NOT NULL, cost REAL NOT NULL DEFAULT 0, notes TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'available' CHECK(status IN ('available','sold')),
    sold_at TEXT, customer_name TEXT, phone TEXT, sale_price REAL
  );
  CREATE TABLE IF NOT EXISTS customers (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, phone TEXT NOT NULL DEFAULT '',
    address1 TEXT NOT NULL DEFAULT '', address2 TEXT NOT NULL DEFAULT '', city TEXT NOT NULL DEFAULT '',
    state TEXT NOT NULL DEFAULT '', zip TEXT NOT NULL DEFAULT '', shipping_notes TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS customer_notes (
    id TEXT PRIMARY KEY, customer_id TEXT NOT NULL, category TEXT NOT NULL DEFAULT 'General', note TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(customer_id) REFERENCES customers(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_products_status ON products(status);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_products_uid ON products(uid) WHERE uid != '';
  CREATE UNIQUE INDEX IF NOT EXISTS idx_products_sn ON products(sn) WHERE sn != '';
  CREATE UNIQUE INDEX IF NOT EXISTS idx_products_mac ON products(mac) WHERE mac != '';
  CREATE INDEX IF NOT EXISTS idx_customer_notes_customer_id ON customer_notes(customer_id);
`);

const productColumnNames = new Set(db.prepare("PRAGMA table_info(products)").all().map((column) => column.name));
for (const [name, definition] of [
  ["customer_id", "TEXT"], ["ship_address1", "TEXT NOT NULL DEFAULT ''"], ["ship_address2", "TEXT NOT NULL DEFAULT ''"],
  ["ship_city", "TEXT NOT NULL DEFAULT ''"], ["ship_state", "TEXT NOT NULL DEFAULT ''"], ["ship_zip", "TEXT NOT NULL DEFAULT ''"],
  ["shipping_notes", "TEXT NOT NULL DEFAULT ''"], ["payment_method", "TEXT NOT NULL DEFAULT ''"],
  ["payment_reference", "TEXT NOT NULL DEFAULT ''"], ["sale_notes", "TEXT NOT NULL DEFAULT ''"]
]) if (!productColumnNames.has(name)) db.exec(`ALTER TABLE products ADD COLUMN ${name} ${definition}`);
db.exec("CREATE INDEX IF NOT EXISTS idx_products_customer_id ON products(customer_id)");

const seed = [
  ["Logan Crabtree","273D000000021255","A0:BB:3E:02:12:55"], ["Marvin Wade","273D00000002194E","A0:BB:3E:02:19:4E"],
  ["Logan Crabtree","273D00000002185F","A0:BB:3E:02:18:5F"], ["Logan Crabtree","273D00000002193A","A0:BB:3E:02:19:3A"],
  ["Mark Milburn","273D0000000218BD","A0:BB:3E:02:18:BD"], ["Matt Avila","273D0000000219D5","A0:BB:3E:02:19:D5"],
  ["Andy Nguyen","273D0000000219FD","A0:BB:3E:02:19:FD"], ["Andy Nguyen","273D000000021181","A0:BB:3E:02:11:81"],
  ["Daniel Wade","273D00000002125A","A0:BB:3E:02:12:5A"], ["Marvin Wade","273D0000000219D4","A0:BB:3E:02:19:D4"]
];
if (db.prepare("SELECT COUNT(*) AS count FROM products").get().count === 0) {
  const insert = db.prepare("INSERT INTO products (id,uid,sn,mac,model,condition,received_at,status,sold_at,customer_name) VALUES (?,?,?,?,?,?,?,?,?,?)");
  db.exec("BEGIN");
  try { seed.forEach(([name, sn, mac]) => insert.run(crypto.randomUUID(), "", sn, mac, "V3 Plus", "New", "2024-08-20", "sold", "2024-08-20", name)); db.exec("COMMIT"); }
  catch (error) { db.exec("ROLLBACK"); throw error; }
}
const findCustomerByName = db.prepare("SELECT id FROM customers WHERE lower(name)=lower(?) ORDER BY updated_at DESC LIMIT 1");
const addCustomer = db.prepare("INSERT INTO customers (id,name,phone,address1,address2,city,state,zip,shipping_notes) VALUES (?,?,?,?,?,?,?,?,?)");
const oldSales = db.prepare("SELECT DISTINCT customer_name AS name, phone FROM products WHERE status='sold' AND customer_name IS NOT NULL AND customer_name!='' AND customer_id IS NULL").all();
for (const old of oldSales) {
  let customer = findCustomerByName.get(old.name);
  if (!customer) { const id = crypto.randomUUID(); addCustomer.run(id,old.name,old.phone||"","","","","","",""); customer = { id }; }
  db.prepare("UPDATE products SET customer_id=? WHERE status='sold' AND customer_id IS NULL AND lower(customer_name)=lower(?)").run(customer.id,old.name);
}
db.exec("PRAGMA optimize");

const columns = `id, uid, sn, mac, manufacturer, model, condition, received_at AS receivedAt, cost, notes,
  status, sold_at AS soldAt, customer_id AS customerId, customer_name AS customerName, phone, sale_price AS salePrice,
  ship_address1 AS shipAddress1, ship_address2 AS shipAddress2, ship_city AS shipCity, ship_state AS shipState,
  ship_zip AS shipZip, shipping_notes AS shippingNotes, payment_method AS paymentMethod, payment_reference AS paymentReference,
  sale_notes AS saleNotes`;
const list = db.prepare(`SELECT ${columns} FROM products ORDER BY CASE WHEN status='available' THEN received_at ELSE sold_at END DESC, rowid DESC`);
const get = db.prepare(`SELECT ${columns} FROM products WHERE id=?`);
const allowedModels = new Set(["V3 Plus", "V6 Plus", "V6 Pro", "V5 Pro"]);
const allowedConditions = new Set(["New", "Used", "Refurbished"]);

function json(res, status, value) { const body = JSON.stringify(value); res.writeHead(status, { "content-type": "application/json", "content-length": Buffer.byteLength(body) }); res.end(body); }
async function body(req) { let raw = ""; for await (const chunk of req) { raw += chunk; if (raw.length > 1_000_000) throw new Error("Request too large"); } return raw ? JSON.parse(raw) : {}; }
async function rawBody(req) { const chunks=[]; let size=0; for await(const chunk of req){size+=chunk.length;if(size>100_000_000)throw new Error("Backup file is too large");chunks.push(chunk);}return Buffer.concat(chunks); }
const backupName = (prefix="stockroom") => `${prefix}-${new Date().toISOString().replace(/[:.]/g,"-")}.db`;
async function createBackup(prefix) { const name=backupName(prefix), path=join(backupDir,name); await backup(db,path); return name; }
function safeBackup(name) { if(!/^[a-zA-Z0-9._-]+\.db$/.test(name)) throw new Error("Invalid backup name"); return join(backupDir,name); }
function validateBackup(path) { const candidate=new DatabaseSync(path,{readOnly:true}); try { const tables=new Set(candidate.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(x=>x.name)); if(!tables.has("products")||!tables.has("customers"))throw new Error("This is not a valid Stockroom database."); candidate.prepare("PRAGMA integrity_check").get(); } finally { candidate.close(); } }
async function restoreFrom(path,res) { validateBackup(path); await createBackup("pre-restore"); db.exec("PRAGMA wal_checkpoint(TRUNCATE)"); db.close(); await copyFile(path,databasePath); await unlink(`${databasePath}-wal`).catch(()=>{}); await unlink(`${databasePath}-shm`).catch(()=>{}); json(res,200,{ok:true,restarting:true}); setTimeout(()=>process.exit(0),250); }
function productInput(value) {
  const model = String(value.model || ""); const condition = String(value.condition || "");
  if (!allowedModels.has(model) || !allowedConditions.has(condition) || !value.receivedAt) throw new Error("Model, condition, and received date are required.");
  return { uid:String(value.uid||"").trim(), sn:String(value.sn||"").trim(), mac:String(value.mac||"").trim(), model, condition, receivedAt:String(value.receivedAt), cost:Number(value.cost)||0, notes:String(value.notes||"").trim() };
}

async function api(req, res, url) {
  if (url.pathname === "/api/health") return json(res, 200, { ok:true });
  if (url.pathname === "/api/admin/backups" && req.method === "GET") {
    const files=await readdir(backupDir,{withFileTypes:true}), result=[]; for(const file of files){if(file.isFile()&&file.name.endsWith(".db")){const info=await stat(join(backupDir,file.name));result.push({name:file.name,size:info.size,createdAt:info.mtime.toISOString()});}}
    return json(res,200,result.sort((a,b)=>b.createdAt.localeCompare(a.createdAt)));
  }
  if (url.pathname === "/api/admin/backups" && req.method === "POST") return json(res,201,{name:await createBackup("stockroom")});
  if (url.pathname === "/api/admin/restore-upload" && req.method === "POST") { const path=join(backupDir,`upload-${crypto.randomUUID()}.db`); await writeFile(path,await rawBody(req)); return await restoreFrom(path,res); }
  const adminMatch=url.pathname.match(/^\/api\/admin\/backups\/([^/]+)\/(download|restore)$/);
  if(adminMatch){const name=decodeURIComponent(adminMatch[1]),action=adminMatch[2],path=safeBackup(name);await stat(path);
    if(action==="download"&&req.method==="GET"){const content=await readFile(path);res.writeHead(200,{"content-type":"application/vnd.sqlite3","content-disposition":`attachment; filename="${name}"`,"content-length":content.length});return res.end(content);}
    if(action==="restore"&&req.method==="POST")return await restoreFrom(path,res);
  }
  const deleteBackupMatch=url.pathname.match(/^\/api\/admin\/backups\/([^/]+)$/);
  if(deleteBackupMatch&&req.method==="DELETE"){const path=safeBackup(decodeURIComponent(deleteBackupMatch[1]));await unlink(path);res.writeHead(204);return res.end();}
  if (url.pathname === "/api/products" && req.method === "GET") return json(res, 200, list.all());
  if (url.pathname === "/api/products" && req.method === "POST") {
    const p = productInput(await body(req)); const id = crypto.randomUUID();
    db.prepare("INSERT INTO products (id,uid,sn,mac,model,condition,received_at,cost,notes) VALUES (?,?,?,?,?,?,?,?,?)").run(id,p.uid,p.sn,p.mac,p.model,p.condition,p.receivedAt,p.cost,p.notes);
    return json(res, 201, get.get(id));
  }
  const customerMatch = url.pathname.match(/^\/api\/customers\/([^/]+)$/);
  if (customerMatch && req.method === "GET") {
    const id = decodeURIComponent(customerMatch[1]);
    const customer = db.prepare("SELECT id,name,phone,address1,address2,city,state,zip,shipping_notes AS shippingNotes FROM customers WHERE id=?").get(id);
    if (!customer) return json(res, 404, { error:"Customer not found" });
    const purchases = db.prepare(`SELECT ${columns} FROM products WHERE status='sold' AND customer_id=? ORDER BY sold_at DESC, rowid DESC`).all(id);
    const notes = db.prepare("SELECT id,category,note,created_at AS createdAt,updated_at AS updatedAt FROM customer_notes WHERE customer_id=? ORDER BY created_at DESC, rowid DESC").all(id);
    return json(res, 200, { ...customer, purchases, notes });
  }
  const notesMatch = url.pathname.match(/^\/api\/customers\/([^/]+)\/notes(?:\/([^/]+))?$/);
  if (notesMatch) {
    const customerId=decodeURIComponent(notesMatch[1]), noteId=notesMatch[2]?decodeURIComponent(notesMatch[2]):null;
    if (!db.prepare("SELECT id FROM customers WHERE id=?").get(customerId)) return json(res,404,{error:"Customer not found"});
    if (req.method === "POST" && !noteId) {
      const v=await body(req), note=String(v.note||"").trim(), category=String(v.category||"General");
      if (!note) throw new Error("Note text is required.");
      if (!new Set(["General","Support","Follow-up"]).has(category)) throw new Error("Invalid note category.");
      const id=crypto.randomUUID(); db.prepare("INSERT INTO customer_notes (id,customer_id,category,note) VALUES (?,?,?,?)").run(id,customerId,category,note);
      return json(res,201,db.prepare("SELECT id,category,note,created_at AS createdAt,updated_at AS updatedAt FROM customer_notes WHERE id=?").get(id));
    }
    if (req.method === "DELETE" && noteId) {
      db.prepare("DELETE FROM customer_notes WHERE id=? AND customer_id=?").run(noteId,customerId); res.writeHead(204); return res.end();
    }
    return json(res,405,{error:"Method not allowed"});
  }
  const match = url.pathname.match(/^\/api\/products\/([^/]+)(?:\/(sell|restock))?$/);
  if (!match) return json(res, 404, { error:"Not found" });
  const id = decodeURIComponent(match[1]); const action = match[2]; const current = get.get(id);
  if (!current) return json(res, 404, { error:"Product not found" });
  if (req.method === "DELETE" && !action) { db.prepare("DELETE FROM products WHERE id=?").run(id); res.writeHead(204); return res.end(); }
  if (req.method === "PATCH" && !action) {
    if (current.status !== "sold") return json(res,400,{error:"Transaction notes can only be added to sales."});
    const v=await body(req); db.prepare("UPDATE products SET sale_notes=? WHERE id=?").run(String(v.saleNotes||"").trim(),id);
    return json(res,200,get.get(id));
  }
  if (req.method === "POST" && action === "sell") {
    const v = await body(req); if (!String(v.customerName||"").trim() || !v.soldAt) throw new Error("Customer name and sale date are required.");
    const paymentMethod=String(v.paymentMethod||"").trim();
    if (!new Set(["Cash","Venmo","PayPal"]).has(paymentMethod)) throw new Error("Payment method must be Cash, Venmo, or PayPal.");
    const name=String(v.customerName).trim(), phone=String(v.phone||"").trim(), address1=String(v.shipAddress1||"").trim(), address2=String(v.shipAddress2||"").trim(), city=String(v.shipCity||"").trim(), state=String(v.shipState||"").trim(), zip=String(v.shipZip||"").trim(), shippingNotes=String(v.shippingNotes||"").trim();
    let customer = v.customerId ? db.prepare("SELECT id FROM customers WHERE id=?").get(String(v.customerId)) : findCustomerByName.get(name);
    if (!customer) { customer={id:crypto.randomUUID()}; addCustomer.run(customer.id,name,phone,address1,address2,city,state,zip,shippingNotes); }
    else db.prepare("UPDATE customers SET name=?,phone=?,address1=?,address2=?,city=?,state=?,zip=?,shipping_notes=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(name,phone,address1,address2,city,state,zip,shippingNotes,customer.id);
    db.prepare("UPDATE products SET status='sold', sold_at=?, customer_id=?, customer_name=?, phone=?, sale_price=?, ship_address1=?, ship_address2=?, ship_city=?, ship_state=?, ship_zip=?, shipping_notes=?, payment_method=?, payment_reference=?, sale_notes=? WHERE id=? AND status='available'").run(String(v.soldAt),customer.id,name,phone,Number(v.salePrice)||0,address1,address2,city,state,zip,shippingNotes,paymentMethod,String(v.paymentReference||"").trim(),String(v.saleNotes||"").trim(),id);
    return json(res, 200, get.get(id));
  }
  if (req.method === "POST" && action === "restock") {
    const v = await body(req); if (!allowedConditions.has(v.condition) || !v.receivedAt) throw new Error("Condition and return date are required.");
    db.prepare("UPDATE products SET status='available', condition=?, received_at=?, sold_at=NULL, customer_id=NULL, customer_name=NULL, phone=NULL, sale_price=NULL, ship_address1='', ship_address2='', ship_city='', ship_state='', ship_zip='', shipping_notes='', payment_method='', payment_reference='', sale_notes='' WHERE id=? AND status='sold'").run(v.condition,String(v.receivedAt),id);
    return json(res, 200, get.get(id));
  }
  return json(res, 405, { error:"Method not allowed" });
}

const mime = { ".html":"text/html; charset=utf-8", ".css":"text/css; charset=utf-8", ".js":"text/javascript; charset=utf-8", ".svg":"image/svg+xml" };
createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    if (url.pathname.startsWith("/api/")) return await api(req, res, url);
    const requested = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
    const file = normalize(join(publicDir, requested));
    if (!file.startsWith(publicDir) || !(await stat(file)).isFile()) throw new Error("NOT_FOUND");
    const content = await readFile(file); res.writeHead(200, { "content-type": mime[extname(file)] || "application/octet-stream" }); res.end(content);
  } catch (error) {
    if (error.message === "NOT_FOUND" || error.code === "ENOENT") return json(res, 404, { error:"Not found" });
    const duplicate = String(error.message).includes("UNIQUE constraint failed");
    json(res, duplicate ? 409 : 400, { error: duplicate ? "That UID, SN, or MAC is already recorded." : error.message });
  }
}).listen(port, "0.0.0.0", () => console.log(`Stockroom listening on port ${port}`));
