const express = require('express');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const cors = require('cors');
const db = require('./database');
const { importCSV } = require('./csvImporter');
const { runResearch } = require('./research');

puppeteer.use(StealthPlugin());
const app = express();
app.use(cors());
app.use(express.json());

// Load CSV on startup
importCSV();

// ------------------------------------------------------------------
// API ENDPOINTS
// ------------------------------------------------------------------

// Get all products + latest scrape data for the frontend
app.get('/api/products', (req, res) => {
    // We want the product data, and we want to join the LAST TWO scrapes to determine trend arrows.
    // To do this efficiently, we can fetch all products, and then fetch the latest 2 scrapes per product.

    db.all("SELECT * FROM products", [], (err, products) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }

        db.all("SELECT * FROM scrapes ORDER BY product_id, timestamp DESC", [], (err, scrapes) => {
            if (err) {
                return res.status(500).json({ error: err.message });
            }

            // Group scrapes by product
            const scrapesByProduct = {};
            scrapes.forEach(s => {
                if (!scrapesByProduct[s.product_id]) scrapesByProduct[s.product_id] = [];
                scrapesByProduct[s.product_id].push(s);
            });

            // Attach to products
            const productsWithHistory = products.map(p => {
                const pScrapes = scrapesByProduct[p.id] || [];
                // pScrapes[0] is the latest, pScrapes[1] is the previous
                const currentScrape = pScrapes[0] || null;
                const prevScrape = pScrapes[1] || null;

                return {
                    ...p,
                    currentScrape,
                    prevScrape
                };
            });

            res.json({ success: true, data: productsWithHistory });
        });
    });
});

// Manual trigger for CSV import
app.post('/api/sync-csv', (req, res) => {
    importCSV();
    res.json({ success: true, message: "CSV import triggered" });
});

// Helper Function: The Scrape Logic
async function scrapeUrlForProduct(url, pId) {
    let browser;
    try {
        browser = await puppeteer.launch({
            headless: 'new',
            executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium',
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu',
                '--single-process'
            ]
        });

        const page = await browser.newPage();
        await page.setViewport({ width: 1920, height: 1080 });

        console.log(`Navigating to Idealo: ${url}`);
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

        try {
            await page.waitForSelector('a.productOffers-listItemOfferPrice', { timeout: 15000 });
        } catch (e) {
            console.log("Timeout waiting for offers... continuing anyway.");
        }

        const results = await page.evaluate(() => {
            const offerNodes = document.querySelectorAll('li.productOffers-listItem');
            const data = [];
            let healthRiseOffer = null;
            let lowestPriceVal = null;

            const maxToExtract = Math.min(20, offerNodes.length);

            for (let i = 0; i < maxToExtract; i++) {
                const node = offerNodes[i];
                let price = null;
                let shop = "Unbekannt";
                let link = "";

                // Link extraction
                const linkNode = node.querySelector('a[href]');
                if (linkNode) link = linkNode.href;

                // Shop extraction
                const shopLink = node.querySelector('a[data-shop-name]');
                if (shopLink) {
                    shop = shopLink.getAttribute('data-shop-name');
                } else {
                    const shopImg = node.querySelector('img.productOffers-listItemOfferShopV2LogoImage');
                    if (shopImg && shopImg.alt && !shopImg.alt.includes('idealo')) {
                        shop = shopImg.alt;
                    } else {
                        const dMtrx = node.getAttribute('data-mtrx-click');
                        if (dMtrx) {
                            try { const parsed = JSON.parse(dMtrx); if (parsed.shop_name) shop = parsed.shop_name; } catch (e) { }
                        }
                    }
                }
                if (shop.includes(' - ')) shop = shop.split(' - ')[0];

                // Price extraction
                const priceLink = node.querySelector('a.productOffers-listItemOfferPrice');
                if (priceLink) {
                    let priceText = "";
                    for (let child of priceLink.childNodes) {
                        if (child.nodeType === 3) priceText += child.textContent; // TEXT_NODE
                    }
                    if (priceText.trim() === "") priceText = priceLink.innerText;

                    // German comma to float format
                    let rawPriceStr = priceText.match(/[\d.,]+/);
                    if (rawPriceStr) {
                        let cleanPriceStr = rawPriceStr[0].trim().replace(/\./g, '').replace(',', '.');
                        price = parseFloat(cleanPriceStr);
                    }
                }

                if (i === 0 && price !== null) lowestPriceVal = price;

                // Always push top 2
                if (i < 2) {
                    data.push({ rank: i + 1, price, shop, link });
                }

                // Check for Health Rise
                if (shop.toLowerCase().includes('health rise') || shop.toLowerCase().includes('health-rise')) {
                    healthRiseOffer = { rank: i + 1, price, shop, link };
                }
            }

            return { top2: data, healthRise: healthRiseOffer, lowestPrice: lowestPriceVal, competitorCount: offerNodes.length };
        });

        console.log(`Scraping successful for ${url}`, results);

        // Map to DB Schema
        const rank1 = results.top2[0] || {};
        const rank2 = results.top2[1] || {};
        const hr = results.healthRise || {};

        db.run(`
            INSERT INTO scrapes (product_id, rank1_shop, rank1_price, rank1_link, rank2_shop, rank2_price, rank2_link, hr_rank, hr_price, hr_link, competitor_count, lowest_price) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            pId,
            rank1.shop || null, rank1.price || null, rank1.link || null,
            rank2.shop || null, rank2.price || null, rank2.link || null,
            hr.rank || null, hr.price || null, hr.link || null,
            results.competitorCount || null,
            results.lowestPrice || null
        ]);

        return { success: true };
    } catch (err) {
        console.error(`Failed to scrape ${url}:`, err.message);
        return { success: false, error: err.message };
    } finally {
        if (browser) await browser.close();
    }
}

// Background scraping worker route
app.post('/api/scrape/start', async (req, res) => {
    console.log("Triggered background scraping run...");

    try {
        await new Promise((resolve, reject) => {
            db.all("SELECT id, idealo_link FROM products WHERE idealo_link IS NOT NULL AND idealo_link != ''", [], async (err, products) => {
                if (err) {
                    console.error("Error fetching products for scrape", err.message);
                    return reject(err);
                }

                for (const p of products) {
                    await scrapeUrlForProduct(p.idealo_link, p.id);
                    // Wait between requests to avoid ban
                    await new Promise(r => setTimeout(r, 5000));
                }
                console.log("Finished scraping loop for all products.");
                resolve();
            });
        });

        res.json({ success: true, message: "Scraping completed successfully." });
    } catch (e) {
        console.error("Scraping loop failed:", e);
        res.status(500).json({ success: false, error: e.message });
    }
});

// Get all Market Research Versions
app.get('/api/research/versions', (req, res) => {
    db.all(`
        SELECT run_id, MAX(created_at) as created_at
        FROM market_research 
        WHERE run_id IS NOT NULL 
        GROUP BY run_id 
        ORDER BY run_id ASC
    `, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });

        // Map to add version_number
        const versions = rows.map((r, index) => ({
            run_id: r.run_id,
            created_at: r.created_at,
            version_number: index + 1
        }));
        res.json({ success: true, data: versions });
    });
});

// Get specific Market Research Version
app.get('/api/research/version/:run_id', (req, res) => {
    const runId = req.params.run_id;
    db.all(`
        SELECT category, result, created_at as timestamp 
        FROM market_research 
        WHERE run_id = ?
    `, [runId], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true, data: rows });
    });
});

// Get latest Market Research Results (Backward compatibility)
app.get('/api/market-research', (req, res) => {
    // We want the rows belonging to the most recent run_id
    db.all(`
        SELECT category, result, created_at as timestamp 
        FROM market_research 
        WHERE run_id = (SELECT MAX(run_id) FROM market_research)
    `, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true, data: rows });
    });
});

// Trigger Market Research Run
app.post('/api/market-research/run', (req, res) => {
    console.log("Triggered market research run...");

    // Background execution safely detached from HTTP Request
    runResearch()
        .then(() => {
            console.log("Market research finished and saved.");
        })
        .catch(e => {
            console.error("Market research background execution failed:", e);
        });

    res.json({ success: true, message: "Market research started in background." });
});

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Backend API & Scraper running on port ${PORT}`);
});
