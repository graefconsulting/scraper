const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}
const dbPath = path.join(dataDir, 'data.db');

const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error opening database', err.message);
    } else {
        console.log('Connected to the SQLite database.');
        db.run('PRAGMA foreign_keys = ON;');
        createTables();
    }
});

function createTables() {
    db.serialize(() => {
        // Products table
        db.run(`
            CREATE TABLE IF NOT EXISTS products (
                id TEXT PRIMARY KEY, /* Artikelnummer */
                gtin TEXT,
                name TEXT,
                quantity INTEGER, /* Menge 3 Monate */
                revenue_net REAL, /* Umsatz Netto */
                idealo_link TEXT,
                price_gross REAL, /* Brutto-VK */
                price_net REAL, /* Netto-VK */
                purchase_price_net REAL, /* EK netto */
                uvp REAL,
                tax_rate REAL, /* Steuersatz in Prozent */
                clicks_30_days INTEGER /* Idealo Clicks */
            )
        `);

        // Scrapes table
        db.run(`
            CREATE TABLE IF NOT EXISTS scrapes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                product_id TEXT,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                
                rank1_shop TEXT,
                rank1_price REAL,
                rank1_link TEXT,
                
                rank2_shop TEXT,
                rank2_price REAL,
                rank2_link TEXT,
                
                hr_rank INTEGER,
                hr_price REAL,
                hr_link TEXT,
                
                lowest_price REAL,
                
                FOREIGN KEY (product_id) REFERENCES products (id)
            )
        `);

        // Market Research table
        db.run(`
            CREATE TABLE IF NOT EXISTS market_research (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                category TEXT, /* 'trends', 'natugena', 'vitaworld', 'dr_niedermaier', 'shop_naturpur', 'vitaminversand24' */
                result TEXT
            )
        `);

        console.log("Database tables initialized.");
    });
}

module.exports = db;
