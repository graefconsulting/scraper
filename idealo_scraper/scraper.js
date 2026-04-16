const express = require('express');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const db = require('./database');
const { importCSV } = require('./csvImporter');
const { runResearch } = require('./research');

puppeteer.use(StealthPlugin());
const app = express();
app.use(cors());
app.use(express.json());

// In-memory scraping progress state
let scrapingState = {
    isRunning: false,
    total: 0,
    completed: 0,
    failed: [],
    completedIds: []
};

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
            const allCompetitors = [];

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

                // Collect all competitors
                allCompetitors.push({ rank: i + 1, price, shop, link });
            }

            return {
                top2: data,
                healthRise: healthRiseOffer,
                lowestPrice: lowestPriceVal,
                competitorCount: offerNodes.length,
                allCompetitors: allCompetitors
            };
        });

        console.log(`Scraping successful for ${url}`, results);

        // Map to DB Schema
        const rank1 = results.top2[0] || {};
        const rank2 = results.top2[1] || {};
        const hr = results.healthRise || {};
        const allCompsJson = JSON.stringify(results.allCompetitors || []);

        db.run(`
            INSERT INTO scrapes (product_id, rank1_shop, rank1_price, rank1_link, rank2_shop, rank2_price, rank2_link, hr_rank, hr_price, hr_link, competitor_count, lowest_price, all_competitors) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            pId,
            rank1.shop || null, rank1.price || null, rank1.link || null,
            rank2.shop || null, rank2.price || null, rank2.link || null,
            hr.rank || null, hr.price || null, hr.link || null,
            results.competitorCount || null,
            results.lowestPrice || null,
            allCompsJson
        ], (err) => {
            if (err) {
                console.error(`DB Insert Error for ${pId}:`, err.message);
            } else {
                console.log(`Successfully saved scrape for ${url} to DB.`);
            }
        });

        return { success: true };
    } catch (err) {
        console.error(`Failed to scrape ${url}:`, err.message);
        return { success: false, error: err.message };
    } finally {
        if (browser) await browser.close();
    }
}

// Scraping progress status
app.get('/api/scrape/status', (req, res) => {
    res.json({ success: true, ...scrapingState });
});

// Background scraping worker route
app.post('/api/scrape/start', (req, res) => {
    if (scrapingState.isRunning) {
        return res.status(409).json({ success: false, error: 'Ein Scraping-Vorgang läuft bereits.' });
    }

    // Respond immediately — don't block the request
    res.json({ success: true, message: "Scraping im Hintergrund gestartet." });

    setImmediate(async () => {
        try {
            const products = await new Promise((resolve, reject) => {
                db.all("SELECT id, name, idealo_link FROM products WHERE idealo_link IS NOT NULL AND idealo_link != ''", [], (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                });
            });

            scrapingState = { isRunning: true, total: products.length, completed: 0, failed: [], completedIds: [] };
            console.log(`Triggered background scraping run for ${products.length} products...`);

            for (const p of products) {
                const result = await scrapeUrlForProduct(p.idealo_link, p.id);
                if (!result.success) {
                    scrapingState.failed.push({ id: p.id, name: p.name, url: p.idealo_link, error: result.error });
                } else {
                    scrapingState.completedIds.push(p.id);
                }
                scrapingState.completed++;
                // Wait between requests to avoid ban
                await new Promise(r => setTimeout(r, 5000));
            }

            scrapingState.isRunning = false;
            console.log("Finished scraping loop for all products.");
        } catch (e) {
            scrapingState.isRunning = false;
            console.error("Background scraping failed:", e);
        }
    });
});

// Endpoint to fetch Dashboard aggregated data
app.get('/api/dashboard', (req, res) => {
    // 1. Fetch products
    db.all("SELECT * FROM products", [], (err, products) => {
        if (err) return res.status(500).json({ error: err.message, success: false });

        // 2. Fetch all latest scrapes
        db.all("SELECT * FROM scrapes ORDER BY product_id, timestamp DESC", [], (err, scrapes) => {
            if (err) return res.status(500).json({ error: err.message, success: false });

            const scrapesByProduct = {};
            scrapes.forEach(s => {
                if (!scrapesByProduct[s.product_id]) scrapesByProduct[s.product_id] = [];
                scrapesByProduct[s.product_id].push(s);
            });

            // Reconstruct Ampel and KPIs
            let gesamtumsatz = 0;
            let gesamtrohertrag = 0;
            let totalWeightedMargin = 0;
            let maxScrapeTime = 0;
            let produkteMitIdealo = 0;

            const ampel_verteilung = { gruen: 0, gelb: 0, rot: 0, grau: 0 };
            const alle_produkte = [];

            products.forEach(p => {
                let hasIdealo = (p.idealo_link && p.idealo_link.trim() !== "");
                if (hasIdealo) produkteMitIdealo++;

                const pScrapes = scrapesByProduct[p.id] || [];
                const currentScrape = pScrapes[0] || null;
                const prevScrape = pScrapes[1] || null;

                if (currentScrape && new Date(currentScrape.timestamp).getTime() > maxScrapeTime) {
                    maxScrapeTime = new Date(currentScrape.timestamp).getTime();
                }

                const is19 = p.tax_rate === 19;
                const nettoVK = p.price_net;
                const bruttoVK = p.price_gross;
                const ekNetto = p.purchase_price_net;

                let marginPct = null;
                if (nettoVK > 0 && ekNetto !== null) {
                    marginPct = ((nettoVK - ekNetto) / nettoVK) * 100;
                }

                let grossProfit = null; // Stored as per unit
                if (nettoVK !== null && ekNetto !== null) {
                    grossProfit = nettoVK - ekNetto;
                }

                let totalGrossProfit = null; // For overall KPI calculation
                if (nettoVK !== null && ekNetto !== null && p.quantity) {
                    totalGrossProfit = (nettoVK - ekNetto) * p.quantity;
                }

                let diffLowestEur = null;
                let diffLowestPct = null;
                const lowestRaw = currentScrape ? currentScrape.lowest_price : null;
                const lowestComp = currentScrape ? Math.min(
                    currentScrape.rank1_price || 999999,
                    currentScrape.rank2_price || 999999
                ) : 999999;
                const lowestPrice = lowestRaw || (lowestComp === 999999 ? null : lowestComp);

                const hrPrice = currentScrape ? currentScrape.hr_price : null; // BUG FIX 1: Use Scraped HR price

                if (hrPrice !== undefined && hrPrice !== null && lowestPrice !== null) {
                    diffLowestEur = hrPrice - lowestPrice;
                    diffLowestPct = (diffLowestEur / lowestPrice) * 100;
                }

                let trafficLight = 'grau';
                if (hasIdealo && currentScrape) {
                    let targetPrice = currentScrape.rank1_price;
                    if (currentScrape.hr_rank === 1) {
                        trafficLight = 'gruen';
                    } else if (targetPrice) {
                        const targetNetto = is19 ? targetPrice / 1.19 : targetPrice / 1.07;
                        const projectedMargin = ((targetNetto - ekNetto) / targetNetto) * 100;
                        if (projectedMargin >= 15) trafficLight = 'gruen';
                        else if (projectedMargin >= 0) trafficLight = 'gelb';
                        else trafficLight = 'rot';
                    }
                }

                // Count Ampel statuses only for scraped products
                if (hasIdealo) {
                    ampel_verteilung[trafficLight]++;
                }

                // Add to global KPIs
                if (p.revenue_net) gesamtumsatz += p.revenue_net;
                if (totalGrossProfit) {
                    gesamtrohertrag += totalGrossProfit;
                }
                if (totalGrossProfit && p.revenue_net && marginPct !== null) {
                    totalWeightedMargin += (marginPct * p.revenue_net);
                }

                // Build handlungsbedarf item
                let rangChange = 0;
                if (currentScrape && prevScrape && currentScrape.hr_rank && prevScrape.hr_rank) {
                    rangChange = prevScrape.hr_rank - currentScrape.hr_rank; // + is better
                }

                alle_produkte.push({
                    id: p.id,
                    name: p.name,
                    sku: p.id, // ID acts as SKU here typically
                    handelsspanne: marginPct || 0,
                    umsatz: p.revenue_net || 0,
                    ampel: trafficLight,
                    rang: currentScrape?.hr_rank || 0,
                    rang_change: rangChange,
                    diff_guenstigster_eur: diffLowestEur || 0,
                    diff_guenstigster_pct: diffLowestPct || 0,
                    rohertrag: grossProfit || 0
                });
            });

            const avg_handelsspanne = gesamtumsatz > 0 ? (totalWeightedMargin / gesamtumsatz) : 0;
            const letzter_scrape = maxScrapeTime > 0 ? new Date(maxScrapeTime).toISOString() : null;

            // Compute Top 10 by Rohertrag
            // filter for valid rohertrag, sort desc, take 10
            const top10_rohertrag = [...alle_produkte]
                .filter(p => typeof p.rohertrag === 'number' && p.rohertrag > 0)
                .sort((a, b) => b.rohertrag - a.rohertrag)
                .slice(0, 10)
                .map(p => ({
                    name: p.name,
                    sku: p.sku,
                    rohertrag: p.rohertrag,
                    ampel: p.ampel
                }));

            // 3. Fetch latest Research Data
            db.all(`
               SELECT category, result, created_at as timestamp 
               FROM market_research 
               WHERE run_id = (SELECT MAX(run_id) FROM market_research)
            `, [], (errMR, latestRes) => {
                if (errMR && errMR.message.includes("no such column: created_at")) {
                    // Fallback identical to the standalone route
                    return db.all(`
                       SELECT category, result, timestamp 
                       FROM market_research 
                       WHERE run_id = (SELECT MAX(run_id) FROM market_research)
                    `, [], (errMR2, latestRes2) => {
                        finalizeDashboardOutput(latestRes2);
                    });
                }
                finalizeDashboardOutput(latestRes);

                function finalizeDashboardOutput(researchRows) {
                    let latest_research = {
                        created_at: null,
                        sections: {
                            trends: { zusammenfassung: "", trending_kategorien: [] },
                            natugena: { zusammenfassung: "", neue_produkte: [] },
                            vitaworld: { zusammenfassung: "", neue_produkte: [] },
                            dr_niedermaier: { zusammenfassung: "", neue_produkte: [] },
                            shop_naturpur: { zusammenfassung: "", aktuelle_aktionen: [] },
                            vitaminversand24: { zusammenfassung: "", aktuelle_aktionen: [] }
                        }
                    };

                    if (researchRows && researchRows.length > 0) {
                        latest_research.created_at = researchRows[0].timestamp;
                        researchRows.forEach(row => {
                            try {
                                const parsed = JSON.parse(row.result);
                                if (latest_research.sections[row.category]) {
                                    latest_research.sections[row.category] = parsed;
                                }
                            } catch (e) {
                                // Raw string fallback
                            }
                        });
                    }

                    res.json({
                        success: true,
                        kpis: {
                            gesamtumsatz,
                            gesamtrohertrag,
                            avg_handelsspanne,
                            produkte_mit_idealo: produkteMitIdealo,
                            letzter_scrape
                        },
                        ampel_verteilung,
                        top10_rohertrag,
                        alle_produkte, // Has 'rohertrag', will strip safely out during serialization automatically
                        latest_research
                    });
                }
            });
        });
    });
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
        if (err) {
            console.error("GET /api/research/versions created_at error:", err.message);
            // Fallback to legacy 'timestamp' column if created_at migration failed
            return db.all(`
                SELECT run_id, MAX(timestamp) as created_at
                FROM market_research 
                WHERE run_id IS NOT NULL 
                GROUP BY run_id 
                ORDER BY run_id ASC
            `, [], (err2, rows2) => {
                if (err2) {
                    console.error("GET /api/research/versions fallback error:", err2.message);
                    return res.status(500).json({ error: err2.message, success: false });
                }
                const versions = rows2.map((r, index) => ({ run_id: r.run_id, created_at: r.created_at, version_number: index + 1 }));
                return res.json({ success: true, data: versions });
            });
        }

        const versions = rows.map((r, index) => ({ run_id: r.run_id, created_at: r.created_at, version_number: index + 1 }));
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
        if (err) {
            console.error("GET /api/research/version created_at error:", err.message);
            return db.all(`
                SELECT category, result, timestamp 
                FROM market_research 
                WHERE run_id = ?
            `, [runId], (err2, rows2) => {
                if (err2) {
                    console.error("GET /api/research/version fallback error:", err2.message);
                    return res.status(500).json({ error: err2.message, success: false });
                }
                return res.json({ success: true, data: rows2 });
            });
        }
        res.json({ success: true, data: rows });
    });
});

// Get latest Market Research Results (Backward compatibility)
app.get('/api/market-research', (req, res) => {
    db.all(`
        SELECT category, result, created_at as timestamp 
        FROM market_research 
        WHERE run_id = (SELECT MAX(run_id) FROM market_research)
    `, [], (err, rows) => {
        if (err) {
            console.error("GET /api/market-research created_at error:", err.message);
            return db.all(`
                SELECT category, result, timestamp 
                FROM market_research 
                WHERE run_id = (SELECT MAX(run_id) FROM market_research)
            `, [], (err2, rows2) => {
                if (err2) {
                    console.error("GET /api/market-research fallback error:", err2.message);
                    return res.status(500).json({ error: err2.message, success: false });
                }
                return res.json({ success: true, data: rows2 });
            });
        }
        res.json({ success: true, data: rows });
    });
});

// ── UPLOAD / PRODUCT IMPORT ──────────────────────────────────────────────────

function parseUploadNum(val) {
    if (val === null || val === undefined || val === '') return null;
    if (typeof val === 'number') return val;
    const s = String(val).replace(/\s/g, '').replace('€', '');
    if (s.includes(',')) return parseFloat(s.replace(/\./g, '').replace(',', '.')) || null;
    return parseFloat(s) || null;
}

// Analyze uploaded Excel rows — returns diff vs. current DB (no changes made)
app.post('/api/upload/analyze', (req, res) => {
    const { rows } = req.body;
    if (!rows || !Array.isArray(rows)) {
        return res.status(400).json({ success: false, error: 'Keine Zeilen erhalten.' });
    }

    // Sort by Umsatz Netto desc, take top 100
    const sorted = [...rows]
        .filter(r => parseUploadNum(r['Umsatz Netto']) > 0)
        .sort((a, b) => (parseUploadNum(b['Umsatz Netto']) || 0) - (parseUploadNum(a['Umsatz Netto']) || 0));
    const top100 = sorted.slice(0, 100);
    const top100Ids = new Set(top100.map(r => String(r['Artikelnummer'] || '').trim()));

    db.all("SELECT * FROM products", [], (err, dbProducts) => {
        if (err) return res.status(500).json({ success: false, error: err.message });

        const dbById = {};
        dbProducts.forEach(p => { dbById[p.id] = p; });

        const neu = [], aktualisiert = [], unveraendert = [];

        for (const row of top100) {
            const id = String(row['Artikelnummer'] || '').trim();
            if (!id) continue;
            const existing = dbById[id];

            if (!existing) {
                neu.push({ id, name: row['Artikelname'] });
                continue;
            }

            const diff = (
                Math.abs((existing.price_gross || 0) - (parseUploadNum(row['Brutto-VK']) || 0)) > 0.001 ||
                Math.abs((existing.price_net || 0) - (parseUploadNum(row['Netto-VK']) || 0)) > 0.001 ||
                Math.abs((existing.purchase_price_net || 0) - (parseUploadNum(row['Durchschnittlicher Einkaufspreis (netto)']) || 0)) > 0.001 ||
                Math.abs((existing.uvp || 0) - (parseUploadNum(row['UVP']) || 0)) > 0.001 ||
                existing.quantity !== parseInt(row['Menge'] || '0', 10) ||
                Math.abs((existing.revenue_net || 0) - (parseUploadNum(row['Umsatz Netto']) || 0)) > 0.01
            );

            if (diff) aktualisiert.push({ id, name: row['Artikelname'] });
            else unveraendert.push({ id, name: row['Artikelname'] });
        }

        const weggefallen = dbProducts
            .filter(p => !top100Ids.has(p.id))
            .map(p => ({ id: p.id, name: p.name, revenue_net: p.revenue_net }));

        res.json({ success: true, top100, neu, aktualisiert, unveraendert, weggefallen });
    });
});

// Execute the confirmed import
app.post('/api/upload/import', (req, res) => {
    const { rows, removeSkus } = req.body;
    if (!rows || !Array.isArray(rows)) {
        return res.status(400).json({ success: false, error: 'Keine Zeilen.' });
    }

    db.serialize(() => {
        db.run("BEGIN TRANSACTION");

        const stmt = db.prepare(`
            INSERT INTO products (id, gtin, name, quantity, revenue_net, idealo_link,
                price_gross, price_net, purchase_price_net, uvp, tax_rate, clicks_30_days)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                gtin=excluded.gtin, name=excluded.name, quantity=excluded.quantity,
                revenue_net=excluded.revenue_net, idealo_link=excluded.idealo_link,
                price_gross=excluded.price_gross, price_net=excluded.price_net,
                purchase_price_net=excluded.purchase_price_net, uvp=excluded.uvp,
                tax_rate=excluded.tax_rate, clicks_30_days=excluded.clicks_30_days
        `);

        rows.forEach(row => {
            const id = String(row['Artikelnummer'] || '').trim();
            if (!id) return;
            stmt.run(
                id, row['GTIN'] || null, row['Artikelname'] || null,
                parseInt(row['Menge'] || '0', 10),
                parseUploadNum(row['Umsatz Netto']),
                row['Idealo Link'] || null,
                parseUploadNum(row['Brutto-VK']),
                parseUploadNum(row['Netto-VK']),
                parseUploadNum(row['Durchschnittlicher Einkaufspreis (netto)']),
                parseUploadNum(row['UVP']),
                parseUploadNum(row['Steuersatz in %']),
                parseInt(row['Idealo Clicks 30 Tage'] || '0', 10)
            );
        });

        stmt.finalize();

        const toRemove = Array.isArray(removeSkus) ? removeSkus : [];
        toRemove.forEach(sku => {
            db.run("DELETE FROM products WHERE id = ?", [sku]);
        });

        db.run("COMMIT", (err) => {
            if (err) return res.status(500).json({ success: false, error: err.message });
            res.json({ success: true, total: rows.length, removed: toRemove.length });
        });
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

// ------------------------------------------------------------------
// AUSWERTUNG: Merge Produktexport.csv + Produkte-Q1.xlsx
// ------------------------------------------------------------------
function parseDeNum(v) {
    if (v === null || v === undefined || v === '') return null;
    if (typeof v === 'number') return v;
    const s = String(v).replace(/\./g, '').replace(',', '.');
    const n = parseFloat(s);
    return isNaN(n) ? null : n;
}

// Helper: load Idealo links from Q1 + Original
function loadIdealoLinks(dataDir) {
    const links = {};
    // Original file first (lower priority)
    const origPath = path.join(dataDir, 'Produkte Dez-Feb.xlsx');
    if (fs.existsSync(origPath)) {
        const wb = XLSX.readFile(origPath);
        const ws = wb.Sheets[wb.SheetNames[0]];
        XLSX.utils.sheet_to_json(ws, { defval: null }).forEach(r => {
            const sku = String(r['Artikelnummer'] || '').trim().toUpperCase();
            const link = String(r['Idealo Link'] || '').trim();
            if (sku && link) links[sku] = link;
        });
    }
    // Q1 overwrites (higher priority)
    const q1Path = path.join(dataDir, 'Produkte-Q1.xlsx');
    if (fs.existsSync(q1Path)) {
        const wb = XLSX.readFile(q1Path);
        const ws = wb.Sheets[wb.SheetNames[0]];
        XLSX.utils.sheet_to_json(ws, { defval: null }).forEach(r => {
            const sku = String(r['Artikelnummer'] || '').trim().toUpperCase();
            const link = String(r['LinkToIdealo'] || '').trim();
            if (sku && link) links[sku] = link;
        });
    }
    return links;
}

// SKUs to always exclude from all analyses
const EXCLUDED_SKUS = new Set(['HR-FB-ROT', 'TEST-001']);

// Identified discount promotion periods (from order data analysis Jan–Apr 2026)
const DISCOUNT_PERIODS = [
    ['2026-01-07', '2026-01-13'],
    ['2026-01-16', '2026-01-16'],
    ['2026-01-19', '2026-01-19'],
    ['2026-01-22', '2026-01-28'],
    ['2026-02-04', '2026-03-04'],
    ['2026-03-06', '2026-03-06'],
    ['2026-03-08', '2026-04-02'],
    ['2026-04-05', '2026-04-05'],
    ['2026-04-07', '2026-04-07'],
];

// Returns true if ddmmyyyy (format "07.01.2026") falls within a discount period
function isDiscountDate(ddmmyyyy) {
    if (!ddmmyyyy) return false;
    const parts = ddmmyyyy.split('.');
    if (parts.length !== 3) return false;
    const iso = `${parts[2]}-${parts[1]}-${parts[0]}`;
    return DISCOUNT_PERIODS.some(([from, to]) => iso >= from && iso <= to);
}

// Hersteller, die 5% Rabatt auf den Einkaufspreis gewähren — wird automatisch vom EK abgezogen
const HERSTELLER_RABATT_5_PCT = new Set([
    'Raab Vitalfood', 'Martina Gebhardt', 'Yogi Tea', 'hübner', 'Santaverde',
    'SANTE', 'Primavera', 'Urtekram', 'Salus', 'Hoyer', 'GSE', "Argand'Or",
    'FITNE', 'Weleda', 'Sanatura', 'Schoenenberger', 'P. Jentschura', 'Lavera',
    'Sanatur', 'Schalk Mühle', 'Tautropfen', 'Berk', 'Droste Laux', 'Bio Planète',
    'Kruut', 'Laboratoires de Biarritz', 'Luvos', 'Farfalla', 'Larnac Manuka',
    'i+m', 'Eliah Sahil', 'Insieme', 'Logona', 'Niyok', 'TranzAlpine',
    'Arche Naturküche', 'Balmyou', 'Bioturm', 'Elysius', 'Fair Squared',
    'Ihle Vital', 'Lebensbaum', 'Sonnentor', 'Speick',
].map(h => h.toLowerCase()));

function hasHerstellerRabatt(hersteller) {
    return hersteller && HERSTELLER_RABATT_5_PCT.has(hersteller.toLowerCase());
}

// Determine hersteller for a product (Q1 data takes precedence, fallback to name match)
function determineHersteller(prod, q1, allHersteller) {
    let h = q1 && q1['Hersteller'] ? String(q1['Hersteller']).trim() : null;
    if (h) return h;
    const nameLower = (prod['Produktname'] || '').toLowerCase();
    for (const cand of allHersteller) {
        const idx = nameLower.indexOf(cand.toLowerCase());
        if (idx >= 0) {
            const end = idx + cand.length;
            if ((idx === 0 || !nameLower[idx-1].match(/[a-z]/)) &&
                (end >= nameLower.length || !nameLower[end].match(/[a-z]/))) {
                return cand;
            }
        }
    }
    return null;
}

// Apply 5% Hersteller-Rabatt to EK if applicable
function ekMitRabatt(rawEk, hersteller) {
    if (rawEk === null || rawEk === undefined || isNaN(rawEk)) return null;
    return hasHerstellerRabatt(hersteller) ? rawEk * 0.95 : rawEk;
}

// Helper: parse CSV file into array of row objects
function parseCSV(filePath) {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const lines = raw.split('\n').filter(l => l.trim());
    const headers = lines[0].replace(/^\uFEFF/, '').split(';').map(h => h.trim());
    const rows = [];
    for (let i = 1; i < lines.length; i++) {
        const vals = lines[i].split(';');
        const row = {};
        headers.forEach((h, idx) => row[h] = (vals[idx] || '').trim());
        rows.push(row);
    }
    return rows;
}

// Helper: round to 2 decimals
function r2(v) { return v !== null && v !== undefined ? Math.round(v * 100) / 100 : null; }

// Shipping cost lookup
const SHIPPING_COSTS = {
    'gls paket': 4.05,
    'dhl warenpost': 3.25,
    'dhl paket': 4.80,
    'dhl': 4.80,
    'dhl international': 15.00,
    'dpd paket': 9.00,
    'dpd': 9.00,
    'selbstabholer': 0,
    'abholung': 0,
};

function getShippingCost(versandart) {
    if (!versandart) return 0;
    const va = versandart.toLowerCase().trim();
    for (const [key, cost] of Object.entries(SHIPPING_COSTS)) {
        if (va.includes(key)) return cost;
    }
    if (va.includes('fba') || va === 'null' || va === '') return 0; // Amazon/ignored
    return 4.05; // default GLS
}

app.get('/api/auswertung', (req, res) => {
    try {
        const dataDir = path.join(__dirname, 'data');

        // --- 1. Parse Alle Produkte.csv (Stammdaten) ---
        const prodPath = path.join(dataDir, 'Alle Produkte.csv');
        if (!fs.existsSync(prodPath)) return res.status(404).json({ success: false, error: 'Alle Produkte.csv nicht gefunden' });
        const prodRows = parseCSV(prodPath);
        const prodMap = {};
        prodRows.forEach(r => {
            const sku = r['Artikelnummer']?.trim();
            if (sku) prodMap[sku.toUpperCase()] = r;
        });

        // --- 2. Parse Bestellungen (nur SW6 live) ---
        const bestPath = path.join(dataDir, 'Bestellungen Jan7-Apr7.csv');
        let orderData = {}; // per SKU aggregation
        let orderDetails = {}; // per ordernumber
        if (fs.existsSync(bestPath)) {
            const bestRows = parseCSV(bestPath);

            // First pass: collect order-level info
            bestRows.forEach(r => {
                const herkunft = (r['Herkunft'] || '').trim();
                if (herkunft !== 'SW6 live') return;
                const orderNr = (r['ordernumber'] || '').trim();
                const sku = (r['Artikelnummer'] || '').trim().toUpperCase();
                const anzahl = parseInt(r['Anzahl'] || '1') || 1;
                const vkNetto = parseDeNum(r['VKNetto']) || 0;
                const betrag = parseDeNum(r['Betrag']) || 0;
                const versandErloes = parseDeNum(r['VersandBruttoPreis']) || 0;
                const versandart = (r['Versandart'] || '').trim();
                const mwst = parseDeNum(r['MwSt']) || 19;
                const isGutschein = sku === 'NULL' && vkNetto < 0;

                if (!orderDetails[orderNr]) {
                    const bestelldatum = (r['Bestelldatum'] || '').trim();
                    orderDetails[orderNr] = { items: [], totalStk: 0, betrag, versandErloes, versandart, gutscheine7: 0, gutscheine19: 0, bestelldatum, isRabatt: isDiscountDate(bestelldatum) };
                }

                if (isGutschein) {
                    // Discount coupon — split by MwSt
                    if (mwst === 7) orderDetails[orderNr].gutscheine7 += Math.abs(vkNetto);
                    else orderDetails[orderNr].gutscheine19 += Math.abs(vkNetto);
                } else {
                    orderDetails[orderNr].items.push({ sku, anzahl, vkNetto, mwst });
                    orderDetails[orderNr].totalStk += anzahl;
                }
            });

            // Second pass: calculate per-SKU aggregates
            for (const [orderNr, order] of Object.entries(orderDetails)) {
                if (order.totalStk === 0) continue;

                // Order-level costs
                const shippingCost = getShippingCost(order.versandart);
                const paymentFix = 0.39;
                const paymentPct = order.betrag * 0.0299;
                const verpackung = 0.25;
                const software = 0.15;
                const orderFixCost = paymentFix + paymentPct + verpackung + software + shippingCost;
                const costPerStk = orderFixCost / order.totalStk;
                const versandErloesPerStk = order.versandErloes / order.totalStk;

                // Sum VKNetto per MwSt class for discount allocation
                let totalVkNetto7 = 0, totalVkNetto19 = 0;
                order.items.forEach(item => {
                    if (item.mwst === 7) totalVkNetto7 += item.vkNetto * item.anzahl;
                    else totalVkNetto19 += item.vkNetto * item.anzahl;
                });

                for (const item of order.items) {
                    const skuUpper = item.sku;
                    if (!orderData[skuUpper]) {
                        orderData[skuUpper] = {
                            menge: 0, bestellungen: new Set(), umsatzNetto: 0, versandkosten: 0, paymentFix: 0, paymentPct: 0, verpackung: 0, software: 0, versandErloes: 0, gutscheinAbzug: 0,
                            rabatt: { menge: 0, umsatzNetto: 0, betriebskosten: 0, gutscheinAbzug: 0 },
                            normal: { menge: 0, umsatzNetto: 0, betriebskosten: 0, gutscheinAbzug: 0 },
                        };
                    }
                    const d = orderData[skuUpper];
                    d.menge += item.anzahl;
                    d.bestellungen.add(orderNr);

                    const lineUmsatz = item.vkNetto * item.anzahl;
                    d.umsatzNetto += lineUmsatz;

                    // Distribute costs per piece
                    d.versandkosten += shippingCost / order.totalStk * item.anzahl;
                    d.paymentFix += paymentFix / order.totalStk * item.anzahl;
                    d.paymentPct += paymentPct / order.totalStk * item.anzahl;
                    d.verpackung += verpackung / order.totalStk * item.anzahl;
                    d.software += software / order.totalStk * item.anzahl;
                    d.versandErloes += versandErloesPerStk * item.anzahl;

                    // Distribute discount by MwSt class
                    let gutscheinLine = 0;
                    if (item.mwst === 7 && totalVkNetto7 > 0) {
                        gutscheinLine = order.gutscheine7 * (lineUmsatz / totalVkNetto7);
                        d.gutscheinAbzug += gutscheinLine;
                    } else if (item.mwst !== 7 && totalVkNetto19 > 0) {
                        gutscheinLine = order.gutscheine19 * (lineUmsatz / totalVkNetto19);
                        d.gutscheinAbzug += gutscheinLine;
                    }

                    // Rabatt/Normal split
                    const bucket = order.isRabatt ? d.rabatt : d.normal;
                    bucket.menge += item.anzahl;
                    bucket.umsatzNetto += lineUmsatz;
                    bucket.betriebskosten += orderFixCost / order.totalStk * item.anzahl;
                    bucket.gutscheinAbzug += gutscheinLine;
                }
            }
        }

        // --- 3. Load Q1 for Werbekosten + Hersteller ---
        const q1Path = path.join(dataDir, 'Produkte-Q1.xlsx');
        let q1Map = {};
        let allHersteller = [];
        if (fs.existsSync(q1Path)) {
            const wb = XLSX.readFile(q1Path);
            const ws = wb.Sheets[wb.SheetNames[0]];
            XLSX.utils.sheet_to_json(ws, { defval: null }).forEach(r => {
                const sku = String(r['Artikelnummer'] || '').trim().toUpperCase();
                if (sku) q1Map[sku] = r;
            });
            const hSet = new Set();
            Object.values(q1Map).forEach(r => { if (r['Hersteller']) hSet.add(String(r['Hersteller']).trim()); });
            allHersteller = [...hSet].sort();
        }

        // --- 4. Load Idealo Links ---
        const idealoLinks = loadIdealoLinks(dataDir);

        // --- 5. Load Scrape Data from DB ---
        db.all("SELECT * FROM scrapes ORDER BY product_id, timestamp DESC", [], (err, scrapes) => {
            if (err) return res.status(500).json({ success: false, error: err.message });

            const scrapesByProduct = {};
            (scrapes || []).forEach(s => {
                const key = s.product_id.toUpperCase();
                if (!scrapesByProduct[key]) scrapesByProduct[key] = [];
                scrapesByProduct[key].push(s);
            });

            // --- 6. Merge and Calculate ---
            const results = [];
            for (const [skuUpper, prod] of Object.entries(prodMap)) {
                if (EXCLUDED_SKUS.has(skuUpper)) continue;
                const q1 = q1Map[skuUpper] || {};
                const orders = orderData[skuUpper] || null;

                // Determine hersteller first (needed for EK discount)
                const hersteller = determineHersteller(prod, q1, allHersteller);
                const ekRabattAktiv = hasHerstellerRabatt(hersteller);
                const ekNetto = r2(ekMitRabatt(parseDeNum(prod['EK_Netto']), hersteller));
                const vkNetto = r2(parseDeNum(prod['VK_Netto']));
                const mwst = parseDeNum(prod['MwSt_Satz']);
                const vkBrutto = (vkNetto !== null && mwst !== null) ? r2(vkNetto * (1 + mwst / 100)) : null;

                // Flags
                const dauertiefpreis = prod['Dauertiefpreis'] === '1';
                const googleAus = prod['Google_Aus'] === '1';
                const staffelpreis = prod['Staffelpreise'] === '1';
                const abverkauf = prod['Abverkauf'] === '1';
                const verfuegbar = prod['Verfuegbar'] === '1';
                const bestand = parseInt(prod['Verfuegbarer_Bestand'] || '0') || 0;
                const ueberverkaeufe = prod['Ueberverkaeufe'] === '1';

                // Order aggregates (Shop only)
                const menge90d = orders ? orders.menge : 0;
                const bestellungen90d = orders ? orders.bestellungen.size : 0;
                const avgBestellmenge = bestellungen90d > 0 ? menge90d / bestellungen90d : null;
                const umsatzNetto90d = orders ? r2(orders.umsatzNetto - orders.gutscheinAbzug) : 0;
                const versandErloes90d = orders ? r2(orders.versandErloes) : 0;

                // Betriebskosten from actual orders
                const versandkosten = orders ? r2(orders.versandkosten) : 0;
                const paymentFix = orders ? r2(orders.paymentFix) : 0;
                const paymentProzent = orders ? r2(orders.paymentPct) : 0;
                const verpackung = orders ? r2(orders.verpackung) : 0;
                const softwareKosten = orders ? r2(orders.software) : 0;
                const betriebskosten = r2(versandkosten + paymentFix + paymentProzent + verpackung + softwareKosten);
                const betriebskostenStueck = menge90d > 0 ? r2(betriebskosten / menge90d) : null;
                const betriebskostenAnteil = umsatzNetto90d > 0 ? (betriebskosten / umsatzNetto90d) * 100 : null;
                const wareneinsatzAnteil = (umsatzNetto90d > 0 && ekNetto !== null) ? ((ekNetto * menge90d) / umsatzNetto90d) * 100 : null;

                // Werbekosten from Q1
                const googleKosten = parseDeNum(q1['Google']) || 0;
                const idealoKosten = parseDeNum(q1['Idealo']) || 0;
                const msKosten = parseDeNum(q1['MS']) || 0;
                const werbekosten = r2(googleKosten + idealoKosten + msKosten);
                const werbekostenAnteil = umsatzNetto90d > 0 ? (werbekosten / umsatzNetto90d) * 100 : null;

                // Handelsspanne (based on list price)
                const handelsspanne = (vkNetto && vkNetto > 0 && ekNetto !== null) ? ((vkNetto - ekNetto) / vkNetto) * 100 : null;
                const rohertragStueck = (vkNetto !== null && ekNetto !== null) ? r2(vkNetto - ekNetto) : null;

                // Actual average selling price from orders (accounts for discounts/coupons)
                const avgVkNetto = (menge90d > 0 && umsatzNetto90d > 0) ? r2(umsatzNetto90d / menge90d) : null;

                // Rohertrag based on actual revenue
                const rohertrag90d = (umsatzNetto90d > 0 && ekNetto !== null) ? r2(umsatzNetto90d - ekNetto * menge90d) : (rohertragStueck !== null ? r2(rohertragStueck * menge90d) : null);

                // Reale Marge based on actual selling price
                let realeMargeStueck = null;
                let realeMargeProz = null;
                if (avgVkNetto !== null && ekNetto !== null && menge90d > 0) {
                    const werbeStueck = werbekosten / menge90d;
                    realeMargeStueck = r2(avgVkNetto - ekNetto - (betriebskostenStueck || 0) - werbeStueck);
                    if (avgVkNetto > 0) realeMargeProz = (realeMargeStueck / avgVkNetto) * 100;
                } else if (vkNetto !== null && ekNetto !== null && handelsspanne !== null) {
                    // No orders: estimate with 13% Betrieb + 10% Werbung
                    realeMargeProz = handelsspanne - 13 - 10;
                    realeMargeStueck = vkNetto > 0 ? r2(vkNetto * realeMargeProz / 100) : null;
                }

                // Truncate product name at first |
                let name = prod['Produktname'] || '';
                const pipeIdx = name.indexOf('|');
                if (pipeIdx > 0) name = name.substring(0, pipeIdx).trim();

                // Rabatt/Normal period split
                function calcPeriodStats(periodData, ek, werbek, totalMenge) {
                    if (!periodData || periodData.menge === 0) return null;
                    const umsatz = r2(periodData.umsatzNetto - periodData.gutscheinAbzug);
                    const warenEinsatz = ek !== null ? r2(ek * periodData.menge) : null;
                    const betrieb = r2(periodData.betriebskosten);
                    const werbeAnteil = totalMenge > 0 ? r2(werbek * periodData.menge / totalMenge) : 0;
                    const gewinn = warenEinsatz !== null ? r2(umsatz - warenEinsatz - betrieb - werbeAnteil) : null;
                    return { menge: periodData.menge, umsatzNetto: umsatz, betriebskosten: betrieb, werbekosten: werbeAnteil, gewinn };
                }
                const rabattPeriode = calcPeriodStats(orders?.rabatt, ekNetto, werbekosten, menge90d);
                const normalPeriode = calcPeriodStats(orders?.normal, ekNetto, werbekosten, menge90d);

                results.push({
                    sku: prod['Artikelnummer'],
                    name,
                    ekNetto, vkNetto, mwst, vkBrutto,
                    menge90d, bestellungen90d, avgBestellmenge,
                    umsatzNetto90d, versandErloes90d,
                    dauertiefpreis, googleAktiv: !googleAus, staffelpreis,
                    abverkauf, verfuegbar, bestand, ueberverkaeufe,
                    handelsspanne, rohertragStueck, rohertrag90d,
                    betriebskostenStueck, betriebskostenAnteil, wareneinsatzAnteil,
                    werbekosten, werbekostenAnteil,
                    realeMargeStueck, realeMargeProz,
                    // Cost breakdown
                    versandkosten, paymentFix, paymentProzent, verpackung, softwareKosten,
                    betriebskosten,
                    googleKosten, idealoKosten, msKosten,
                    q1Menge: menge90d,
                    hersteller,
                    ekRabattAktiv,
                    // Idealo
                    idealoLink: idealoLinks[skuUpper] || null,
                    currentScrape: (scrapesByProduct[skuUpper] || [])[0] || null,
                    prevScrape: (scrapesByProduct[skuUpper] || [])[1] || null,
                    // Rabatt vs. Normal split
                    rabattPeriode,
                    normalPeriode,
                });
            }

            res.json({ success: true, data: results, total: results.length });
        }); // end db.all callback
    } catch (err) {
        console.error('Auswertung error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// In-memory auswertung scraping state
let auswertungScrapeState = {
    isRunning: false, total: 0, completed: 0, failed: [], completedIds: []
};

app.get('/api/auswertung/scrape/status', (req, res) => {
    res.json({ success: true, ...auswertungScrapeState });
});

app.post('/api/auswertung/scrape/start', (req, res) => {
    if (auswertungScrapeState.isRunning || scrapingState.isRunning) {
        return res.status(409).json({ success: false, error: 'Ein Scraping-Vorgang läuft bereits.' });
    }

    res.json({ success: true, message: 'Auswertung-Scraping gestartet.' });

    setImmediate(async () => {
        try {
            const dataDir = path.join(__dirname, 'data');

            // Load CSV to get product data for exclusion logic
            const csvPath = path.join(dataDir, 'Produktexport.csv');
            const csvRaw = fs.readFileSync(csvPath, 'utf-8');
            const csvLines = csvRaw.split('\n').filter(l => l.trim());
            const csvHeaders = csvLines[0].replace(/^\uFEFF/, '').split(';').map(h => h.trim());
            const csvProducts = {};
            for (let i = 1; i < csvLines.length; i++) {
                const vals = csvLines[i].split(';');
                const row = {};
                csvHeaders.forEach((h, idx) => row[h] = (vals[idx] || '').trim());
                const sku = row['Artikelnummer'];
                if (sku) csvProducts[sku.toUpperCase()] = row;
            }

            // Load Q1 for cost data + Hersteller list
            const xlsxPath = path.join(dataDir, 'Produkte-Q1.xlsx');
            let q1Map = {};
            let allHersteller = [];
            if (fs.existsSync(xlsxPath)) {
                const wb = XLSX.readFile(xlsxPath);
                const ws = wb.Sheets[wb.SheetNames[0]];
                XLSX.utils.sheet_to_json(ws, { defval: null }).forEach(r => {
                    const sku = String(r['Artikelnummer'] || '').trim().toUpperCase();
                    if (sku) q1Map[sku] = r;
                });
                const hSet = new Set();
                Object.values(q1Map).forEach(r => { if (r['Hersteller']) hSet.add(String(r['Hersteller']).trim()); });
                allHersteller = [...hSet].sort();
            }

            // Load Idealo links
            const idealoLinks = loadIdealoLinks(dataDir);

            // Load zero-revenue SKUs to exclude (negative est. margin -> delist)
            const origPath = path.join(dataDir, 'Produkte Dez-Feb.xlsx');
            const excludeZero = new Set();
            if (fs.existsSync(origPath)) {
                const wb = XLSX.readFile(origPath);
                const ws = wb.Sheets[wb.SheetNames[0]];
                XLSX.utils.sheet_to_json(ws, { defval: null }).forEach(r => {
                    const sku = String(r['Artikelnummer'] || '').trim().toUpperCase();
                    const umsatz = parseDeNum(r['Umsatz Netto']) || 0;
                    if (umsatz > 0) return;
                    const vk = parseDeNum(r['Netto-VK']);
                    const ek = parseDeNum(r['Durchschnittlicher Einkaufspreis (netto)']);
                    if (vk && vk > 0 && ek !== null) {
                        const hs = ((vk - ek) / vk) * 100;
                        if (hs - 13 - 10 < 0) excludeZero.add(sku);
                    } else {
                        excludeZero.add(sku);
                    }
                });
            }

            // Determine which products to scrape
            const toScrape = [];
            for (const [skuUpper, csv] of Object.entries(csvProducts)) {
                const link = idealoLinks[skuUpper];
                if (!link) continue;
                if (excludeZero.has(skuUpper)) continue;

                // Calculate real margin to exclude < -2%
                const vkNetto = parseDeNum(csv['VK_Netto']);
                // Map Produktexport.csv field names to determineHersteller's expected key
                const hersteller = determineHersteller(
                    { Produktname: csv['Produktname'] },
                    q1Map[skuUpper],
                    allHersteller
                );
                const ekNetto = ekMitRabatt(parseDeNum(csv['EK_Netto']), hersteller);
                const q1 = q1Map[skuUpper] || {};
                const q1Menge = parseDeNum(q1['Menge']) || 0;
                const q1UmsatzNetto = parseDeNum(q1['Umsatz_Netto']);
                const betrieb = (parseDeNum(q1['Fixkosten']) || 0) + (parseDeNum(q1['Payment_Fix']) || 0) +
                    (parseDeNum(q1['Payment_Prozent']) || 0) + (parseDeNum(q1['Versandkosten']) || 0);
                const werbe = (parseDeNum(q1['Google']) || 0) + (parseDeNum(q1['Idealo']) || 0) + (parseDeNum(q1['MS']) || 0);
                const betriebSt = q1Menge > 0 ? betrieb / q1Menge : null;
                const werbeSt = q1Menge > 0 ? werbe / q1Menge : null;

                if (vkNetto && ekNetto !== null && betriebSt !== null && werbeSt !== null && vkNetto > 0) {
                    const realeMarge = ((vkNetto - ekNetto - betriebSt - werbeSt) / vkNetto) * 100;
                    if (realeMarge < -2) continue; // exclude deep negative
                }

                // Ensure product exists in DB for foreign key
                const mwst = parseDeNum(csv['MwSt_Satz']);
                const vkBrutto = (vkNetto !== null && mwst !== null) ? vkNetto * (1 + mwst / 100) : null;
                db.run(`INSERT OR IGNORE INTO products (id, gtin, name, quantity, revenue_net, idealo_link, price_gross, price_net, purchase_price_net, uvp, tax_rate, clicks_30_days)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, 0)`,
                    [csv['Artikelnummer'], csv['GTIN'] || null, csv['Produktname'] || '', parseInt(csv['Menge_90d'] || '0'), parseDeNum(csv['Umsatz_Netto_90d']) || 0, link, vkBrutto, vkNetto, ekNetto, mwst]);

                toScrape.push({ sku: csv['Artikelnummer'], link });
            }

            // Also include products with idealo_link in DB not covered by XLSX sources
            const xlsxSkus = new Set(toScrape.map(p => p.sku.toUpperCase()));
            const dbLinks = await new Promise((resolve, reject) => {
                db.all(
                    `SELECT id AS sku, idealo_link AS link FROM products WHERE idealo_link IS NOT NULL AND idealo_link != ''`,
                    [],
                    (err, rows) => err ? reject(err) : resolve(rows)
                );
            });
            for (const row of dbLinks) {
                if (!xlsxSkus.has(row.sku.toUpperCase())) {
                    toScrape.push({ sku: row.sku, link: row.link });
                }
            }
            console.log(`DB-only links added: ${dbLinks.filter(r => !xlsxSkus.has(r.sku.toUpperCase())).length}`);

            auswertungScrapeState = { isRunning: true, total: toScrape.length, completed: 0, failed: [], completedIds: [] };
            console.log(`Auswertung scraping started for ${toScrape.length} products...`);

            for (const p of toScrape) {
                const result = await scrapeUrlForProduct(p.link, p.sku);
                if (!result.success) {
                    auswertungScrapeState.failed.push({ id: p.sku, url: p.link, error: result.error });
                } else {
                    auswertungScrapeState.completedIds.push(p.sku);
                }
                auswertungScrapeState.completed++;
                await new Promise(r => setTimeout(r, 5000));
            }

            auswertungScrapeState.isRunning = false;
            console.log('Auswertung scraping finished.');
        } catch (e) {
            auswertungScrapeState.isRunning = false;
            console.error('Auswertung scraping failed:', e);
        }
    });
});

// ------------------------------------------------------------------
// WARENKORBANALYSE: Beikäufe, Solo-Rate, Basket Analysis
// ------------------------------------------------------------------
app.get('/api/warenkorb', (req, res) => {
    try {
        const dataDir = path.join(__dirname, 'data');

        // Produktnamen laden — mit Fallback-Kaskade
        // 1. Alle Produkte.csv (Produktname)
        const prodMap = {};
        const prodPath = path.join(dataDir, 'Alle Produkte.csv');
        if (fs.existsSync(prodPath)) {
            parseCSV(prodPath).forEach(r => {
                const sku = (r['Artikelnummer'] || '').trim().toUpperCase();
                if (!sku) return;
                let name = r['Produktname'] || '';
                const pipeIdx = name.indexOf('|');
                if (pipeIdx > 0) name = name.substring(0, pipeIdx).trim();
                if (name) prodMap[sku] = name;
            });
        }
        // 2. Produkte-Q1.xlsx (Artikelname)
        const q1Path = path.join(dataDir, 'Produkte-Q1.xlsx');
        if (fs.existsSync(q1Path)) {
            const wb = XLSX.readFile(q1Path);
            XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: null }).forEach(r => {
                const sku = String(r['Artikelnummer'] || '').trim().toUpperCase();
                if (!sku || prodMap[sku]) return;
                const name = String(r['Artikelname'] || '').trim();
                if (name) prodMap[sku] = name;
            });
        }
        // 3. Produkte Dez-Feb.xlsx (Artikelname)
        const dezFebPath = path.join(dataDir, 'Produkte Dez-Feb.xlsx');
        if (fs.existsSync(dezFebPath)) {
            const wb = XLSX.readFile(dezFebPath);
            XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: null }).forEach(r => {
                const sku = String(r['Artikelnummer'] || '').trim().toUpperCase();
                if (!sku || prodMap[sku]) return;
                const name = String(r['Artikelname'] || '').trim();
                if (name) prodMap[sku] = name;
            });
        }

        // Bestellungen einlesen (nur SW6 live) — mit vollständigen Kostendaten
        // 4. Fallback: Produktname aus Bestelldetails (erster Teil vor " | ")
        const bestPath = path.join(dataDir, 'Bestellungen Jan7-Apr7.csv');
        if (!fs.existsSync(bestPath)) {
            return res.status(404).json({ success: false, error: 'Bestellungen CSV nicht gefunden' });
        }

        // ordersMap: orderNr -> { items: [{sku, anzahl, vkNetto, ekNetto}], betrag, versandart, gutscheinTotal }
        const ordersMap = {};
        parseCSV(bestPath).forEach(r => {
            if ((r['Herkunft'] || '').trim() !== 'SW6 live') return;
            const orderNr = (r['ordernumber'] || '').trim();
            if (!orderNr) return;
            const sku = (r['Artikelnummer'] || '').trim().toUpperCase();
            const anzahl = parseInt(r['Anzahl'] || '1') || 1;
            const vkNetto = parseDeNum(r['VKNetto']) || 0;
            const ekNetto = parseDeNum(r['EKNetto']);
            const betrag = parseDeNum(r['Betrag']) || 0;
            const versandart = (r['Versandart'] || '').trim();
            const isGutschein = sku === 'NULL' && vkNetto < 0;

            if (!ordersMap[orderNr]) {
                ordersMap[orderNr] = { items: [], betrag, versandart, gutscheinTotal: 0 };
            }
            if (isGutschein) {
                ordersMap[orderNr].gutscheinTotal += Math.abs(vkNetto * anzahl);
                return;
            }
            if (!sku || sku === 'NULL') return;

            // Fallback name from Bestelldetails
            if (!prodMap[sku]) {
                const details = (r['Bestelldetails'] || '').trim();
                if (details) {
                    let name = details.split(' | ')[0].trim();
                    name = name.replace(/ Angebots-Nr\..*$/, '').trim();
                    if (name) prodMap[sku] = name;
                }
            }
            const existing = ordersMap[orderNr].items.find(i => i.sku === sku);
            if (existing) {
                existing.anzahl += anzahl;
                existing.vkNetto += vkNetto * anzahl;
            } else {
                ordersMap[orderNr].items.push({ sku, anzahl, vkNetto: vkNetto * anzahl, ekNetto });
            }
        });

        // Bestellgewinn pro Order berechnen (ohne Werbekosten — Quartalsdurchschnitt nicht per-Order sinnvoll)
        const orderProfits = {}; // orderNr -> profit (€, ohne Werbekosten)
        for (const [orderNr, order] of Object.entries(ordersMap)) {
            if (order.items.length === 0) { orderProfits[orderNr] = null; continue; }
            const shippingCost = getShippingCost(order.versandart);
            const paymentPct = order.betrag * 0.0299;
            const orderFixCost = shippingCost + 0.39 + paymentPct + 0.25 + 0.15;
            const totalVkNetto = order.items.reduce((s, i) => s + i.vkNetto, 0);

            let profit = -orderFixCost;
            for (const item of order.items) {
                const ek = (item.ekNetto !== null && item.ekNetto !== undefined) ? item.ekNetto : 0;
                const couponShare = totalVkNetto > 0 ? (item.vkNetto / totalVkNetto) * order.gutscheinTotal : 0;
                const revenueNet = item.vkNetto - couponShare;
                profit += revenueNet - ek * item.anzahl;
            }
            orderProfits[orderNr] = Math.round(profit * 100) / 100;
        }

        const orderList = Object.entries(ordersMap);
        const totalOrders = orderList.length;

        // Per-Produkt Aggregation (inkl. Profitabilität)
        const skuStats = {}; // sku -> { orderCount, totalUnits, soloCount, coOrders, profitSum, profitCount }
        for (const [orderNr, order] of orderList) {
            const skus = order.items.map(i => i.sku);
            const isSolo = skus.length === 1;
            const profit = orderProfits[orderNr];
            for (const item of order.items) {
                const { sku, anzahl } = item;
                if (!skuStats[sku]) skuStats[sku] = { orderCount: 0, totalUnits: 0, soloCount: 0, coOrders: {}, profitSum: 0, profitCount: 0 };
                const s = skuStats[sku];
                s.orderCount++;
                s.totalUnits += anzahl;
                if (isSolo) s.soloCount++;
                if (profit !== null) { s.profitSum += profit; s.profitCount++; }
                for (const other of skus) {
                    if (other === sku) continue;
                    if (!s.coOrders[other]) s.coOrders[other] = { count: 0, profitSum: 0, profitCount: 0 };
                    s.coOrders[other].count++;
                    if (profit !== null) { s.coOrders[other].profitSum += profit; s.coOrders[other].profitCount++; }
                }
            }
        }

        // Ergebnis pro Produkt aufbauen
        const products = Object.entries(skuStats).map(([sku, s]) => {
            const topCombos = Object.entries(s.coOrders)
                .filter(([otherSku, co]) => {
                    const other = skuStats[otherSku];
                    return co.count >= 3 && other && other.orderCount >= 10;
                })
                .map(([otherSku, co]) => {
                    const other = skuStats[otherSku];
                    const suppA = s.orderCount / totalOrders;
                    const suppB = other ? other.orderCount / totalOrders : 0;
                    const suppAB = co.count / totalOrders;
                    const lift = suppA > 0 && suppB > 0 ? suppAB / (suppA * suppB) : 0;
                    const confidence = s.orderCount > 0 ? (co.count / s.orderCount) * 100 : 0;
                    const avgProfit = co.profitCount > 0 ? co.profitSum / co.profitCount : null;
                    return {
                        sku: otherSku,
                        name: prodMap[otherSku] || otherSku,
                        coCount: co.count,
                        lift: Math.round(lift * 100) / 100,
                        confidence: Math.round(confidence * 10) / 10,
                        avgOrderProfit: avgProfit !== null ? Math.round(avgProfit * 100) / 100 : null,
                    };
                })
                .sort((a, b) => b.lift - a.lift)
                .slice(0, 5);

            const avgOrderProfit = s.profitCount > 0 ? Math.round((s.profitSum / s.profitCount) * 100) / 100 : null;
            return {
                sku,
                name: prodMap[sku] || sku,
                orderCount: s.orderCount,
                totalUnits: s.totalUnits,
                avgQtyPerOrder: Math.round((s.totalUnits / s.orderCount) * 100) / 100,
                soloCount: s.soloCount,
                soloRate: Math.round((s.soloCount / s.orderCount) * 1000) / 10,
                avgOrderProfit,
                topCombos,
            };
        }).sort((a, b) => b.orderCount - a.orderCount);

        // Globale Top-Paare nach Lift (min. 3 gem. Bestellungen) — inkl. Profitabilität
        const pairData = {}; // key -> { count, profitSum, profitCount }
        for (const [orderNr, order] of orderList) {
            const skus = [...new Set(order.items.map(i => i.sku))].sort();
            const profit = orderProfits[orderNr];
            for (let i = 0; i < skus.length; i++) {
                for (let j = i + 1; j < skus.length; j++) {
                    const key = skus[i] + '||' + skus[j];
                    if (!pairData[key]) pairData[key] = { count: 0, profitSum: 0, profitCount: 0 };
                    pairData[key].count++;
                    if (profit !== null) { pairData[key].profitSum += profit; pairData[key].profitCount++; }
                }
            }
        }

        const MIN_SUPPORT = 3;
        const MIN_INDIVIDUAL = 10; // Jedes Produkt muss min. 10 eigene Bestellungen haben
        const topPairs = Object.entries(pairData)
            .filter(([key, d]) => {
                if (d.count < MIN_SUPPORT) return false;
                const [skuA, skuB] = key.split('||');
                const sA = skuStats[skuA];
                const sB = skuStats[skuB];
                return sA && sB && sA.orderCount >= MIN_INDIVIDUAL && sB.orderCount >= MIN_INDIVIDUAL;
            })
            .map(([key, d]) => {
                const [skuA, skuB] = key.split('||');
                const sA = skuStats[skuA];
                const sB = skuStats[skuB];
                const suppA = sA ? sA.orderCount / totalOrders : 0;
                const suppB = sB ? sB.orderCount / totalOrders : 0;
                const suppAB = d.count / totalOrders;
                const lift = suppA > 0 && suppB > 0 ? suppAB / (suppA * suppB) : 0;
                const avgOrderProfit = d.profitCount > 0 ? Math.round((d.profitSum / d.profitCount) * 100) / 100 : null;
                return {
                    skuA, nameA: prodMap[skuA] || skuA,
                    skuB, nameB: prodMap[skuB] || skuB,
                    count: d.count,
                    lift: Math.round(lift * 100) / 100,
                    confAB: sA && sA.orderCount > 0 ? Math.round((d.count / sA.orderCount) * 1000) / 10 : 0,
                    confBA: sB && sB.orderCount > 0 ? Math.round((d.count / sB.orderCount) * 1000) / 10 : 0,
                    avgOrderProfit,
                };
            })
            .sort((a, b) => b.lift - a.lift)
            .slice(0, 25);

        const allOrderValues = Object.values(ordersMap);
        const multiItemOrders = allOrderValues.filter(o => o.items.length > 1).length;
        const totalUnitsAll = allOrderValues.reduce((s, o) => s + o.items.reduce((ss, i) => ss + i.anzahl, 0), 0);
        const profitableOrders = Object.values(orderProfits).filter(p => p !== null && p > 0).length;
        const allProfits = Object.values(orderProfits).filter(p => p !== null);
        const avgOrderProfit = allProfits.length > 0 ? Math.round((allProfits.reduce((s, p) => s + p, 0) / allProfits.length) * 100) / 100 : null;

        res.json({
            success: true,
            meta: {
                totalOrders,
                multiItemOrders,
                multiItemRate: totalOrders > 0 ? Math.round((multiItemOrders / totalOrders) * 1000) / 10 : 0,
                avgBasketSize: totalOrders > 0 ? Math.round((totalUnitsAll / totalOrders) * 100) / 100 : 0,
                profitableOrders,
                profitableRate: totalOrders > 0 ? Math.round((profitableOrders / totalOrders) * 1000) / 10 : 0,
                avgOrderProfit,
            },
            products,
            topPairs,
        });
    } catch (err) {
        console.error('Warenkorb error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// ------------------------------------------------------------------
// EMPFEHLUNGEN: Zero-revenue products from Produkte Dez-Feb.xlsx
// ------------------------------------------------------------------
app.get('/api/empfehlungen/zero-revenue', (req, res) => {
    try {
        const dataDir = path.join(__dirname, 'data');

        // Load Alle Produkte
        const prodPath = path.join(dataDir, 'Alle Produkte.csv');
        if (!fs.existsSync(prodPath)) return res.status(404).json({ success: false, error: 'Alle Produkte.csv nicht gefunden' });
        const prodRows = parseCSV(prodPath);

        // Load Bestellungen — collect SKUs with SW6 orders
        const skusWithOrders = new Set();
        const bestPath = path.join(dataDir, 'Bestellungen Jan7-Apr7.csv');
        if (fs.existsSync(bestPath)) {
            parseCSV(bestPath).forEach(r => {
                if ((r['Herkunft'] || '').trim() === 'SW6 live') {
                    const sku = (r['Artikelnummer'] || '').trim().toUpperCase();
                    if (sku && sku !== 'NULL') skusWithOrders.add(sku);
                }
            });
        }

        // Load Q1 for Werbekosten + Hersteller
        const q1Path = path.join(dataDir, 'Produkte-Q1.xlsx');
        let q1Ads = {};
        let q1Map = {};
        let allHersteller = [];
        if (fs.existsSync(q1Path)) {
            const wb = XLSX.readFile(q1Path);
            const ws = wb.Sheets[wb.SheetNames[0]];
            XLSX.utils.sheet_to_json(ws, { defval: null }).forEach(r => {
                const sku = String(r['Artikelnummer'] || '').trim().toUpperCase();
                if (sku) {
                    q1Map[sku] = r;
                    const g = parseDeNum(r['Google']) || 0;
                    const i = parseDeNum(r['Idealo']) || 0;
                    const m = parseDeNum(r['MS']) || 0;
                    if (g + i + m > 0) q1Ads[sku] = { google: g, idealo: i, ms: m, total: g + i + m };
                }
            });
            const hSet = new Set();
            Object.values(q1Map).forEach(r => { if (r['Hersteller']) hSet.add(String(r['Hersteller']).trim()); });
            allHersteller = [...hSet].sort();
        }

        const idealoLinks = loadIdealoLinks(dataDir);

        // Load scrape data
        db.all("SELECT * FROM scrapes ORDER BY product_id, timestamp DESC", [], (err, scrapes) => {
            if (err) return res.status(500).json({ success: false, error: err.message });

            const scrapesByProduct = {};
            (scrapes || []).forEach(s => {
                const key = s.product_id.toUpperCase();
                if (!scrapesByProduct[key]) scrapesByProduct[key] = [];
                scrapesByProduct[key].push(s);
            });

            const results = [];
            prodRows.forEach(r => {
                const sku = (r['Artikelnummer'] || '').trim();
                if (!sku) return;
                const skuUpper = sku.toUpperCase();

                // Skip excluded and products with SW6 orders
                if (EXCLUDED_SKUS.has(skuUpper)) return;
                if (skusWithOrders.has(skuUpper)) return;

                const hersteller = determineHersteller(r, q1Map[skuUpper], allHersteller);
                const ekRabattAktiv = hasHerstellerRabatt(hersteller);
                const ekNetto = r2(ekMitRabatt(parseDeNum(r['EK_Netto']), hersteller));
                const vkNetto = r2(parseDeNum(r['VK_Netto']));
                const mwst = parseDeNum(r['MwSt_Satz']);
                const vkBrutto = (vkNetto !== null && mwst !== null) ? r2(vkNetto * (1 + mwst / 100)) : null;

                let name = r['Produktname'] || '';
                const pipeIdx = name.indexOf('|');
                if (pipeIdx > 0) name = name.substring(0, pipeIdx).trim();

                const handelsspanne = (vkNetto && vkNetto > 0 && ekNetto !== null) ? ((vkNetto - ekNetto) / vkNetto) * 100 : null;

                const abverkauf = r['Abverkauf'] === '1';
                const verfuegbar = r['Verfuegbar'] === '1';
                const bestand = parseInt(r['Verfuegbarer_Bestand'] || '0') || 0;

                const ads = q1Ads[skuUpper] || null;

                results.push({
                    sku, name, ekNetto, vkNetto, vkBrutto, mwst, handelsspanne,
                    abverkauf, verfuegbar, bestand,
                    hersteller, ekRabattAktiv,
                    werbekosten: ads ? ads.total : 0,
                    googleKosten: ads ? ads.google : 0,
                    idealoKosten: ads ? ads.idealo : 0,
                    msKosten: ads ? ads.ms : 0,
                    idealoLink: idealoLinks[skuUpper] || null,
                    currentScrape: (scrapesByProduct[skuUpper] || [])[0] || null,
                });
            });

            results.sort((a, b) => (b.vkBrutto || 0) - (a.vkBrutto || 0));
            res.json({ success: true, data: results, total: results.length });
        });
    } catch (err) {
        console.error('Zero-revenue error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// Scrape zero-revenue products
let empfehlungenScrapeState = { isRunning: false, total: 0, completed: 0, failed: [], completedIds: [] };

app.get('/api/empfehlungen/scrape/status', (req, res) => {
    res.json({ success: true, ...empfehlungenScrapeState });
});

app.post('/api/empfehlungen/scrape/start', (req, res) => {
    if (empfehlungenScrapeState.isRunning || auswertungScrapeState.isRunning || scrapingState.isRunning) {
        return res.status(409).json({ success: false, error: 'Ein Scraping-Vorgang läuft bereits.' });
    }

    res.json({ success: true, message: 'Empfehlungen-Scraping gestartet.' });

    setImmediate(async () => {
        try {
            const dataDir = path.join(__dirname, 'data');

            // Load Alle Produkte
            const prodRows = parseCSV(path.join(dataDir, 'Alle Produkte.csv'));

            // Load Q1 for Hersteller info
            const q1Path = path.join(dataDir, 'Produkte-Q1.xlsx');
            let q1Map = {};
            let allHersteller = [];
            if (fs.existsSync(q1Path)) {
                const wb = XLSX.readFile(q1Path);
                const ws = wb.Sheets[wb.SheetNames[0]];
                XLSX.utils.sheet_to_json(ws, { defval: null }).forEach(r => {
                    const sku = String(r['Artikelnummer'] || '').trim().toUpperCase();
                    if (sku) q1Map[sku] = r;
                });
                const hSet = new Set();
                Object.values(q1Map).forEach(r => { if (r['Hersteller']) hSet.add(String(r['Hersteller']).trim()); });
                allHersteller = [...hSet].sort();
            }

            // Load Bestellungen — collect SKUs with SW6 orders
            const skusWithOrders = new Set();
            const bestPath = path.join(dataDir, 'Bestellungen Jan7-Apr7.csv');
            if (fs.existsSync(bestPath)) {
                parseCSV(bestPath).forEach(r => {
                    if ((r['Herkunft'] || '').trim() === 'SW6 live') {
                        const sku = (r['Artikelnummer'] || '').trim().toUpperCase();
                        if (sku && sku !== 'NULL') skusWithOrders.add(sku);
                    }
                });
            }

            const idealoLinks = loadIdealoLinks(dataDir);

            const toScrape = [];
            prodRows.forEach(r => {
                const sku = (r['Artikelnummer'] || '').trim();
                if (!sku) return;
                const skuUpper = sku.toUpperCase();
                if (skusWithOrders.has(skuUpper)) return; // has orders, skip
                const link = idealoLinks[skuUpper];
                if (!link) return;

                // Ensure product exists in DB for foreign key
                const vkNetto = r2(parseDeNum(r['VK_Netto']));
                const mwst = parseDeNum(r['MwSt_Satz']);
                const vkBrutto = (vkNetto !== null && mwst !== null) ? r2(vkNetto * (1 + mwst / 100)) : null;
                const hersteller = determineHersteller(r, q1Map[skuUpper], allHersteller);
                const ekNetto = r2(ekMitRabatt(parseDeNum(r['EK_Netto']), hersteller));
                const name = r['Produktname'] || '';
                const gtin = r['GTIN'] || '';

                db.run(`INSERT OR IGNORE INTO products (id, gtin, name, quantity, revenue_net, idealo_link, price_gross, price_net, purchase_price_net, uvp, tax_rate, clicks_30_days)
                    VALUES (?, ?, ?, 0, 0, ?, ?, ?, ?, NULL, ?, 0)`,
                    [sku, gtin, name, link, vkBrutto, vkNetto, ekNetto, mwst]);

                toScrape.push({ sku, link });
            });

            empfehlungenScrapeState = { isRunning: true, total: toScrape.length, completed: 0, failed: [], completedIds: [] };
            console.log(`Empfehlungen scraping started for ${toScrape.length} zero-revenue products...`);

            for (const p of toScrape) {
                const result = await scrapeUrlForProduct(p.link, p.sku);
                if (!result.success) {
                    empfehlungenScrapeState.failed.push({ id: p.sku, url: p.link, error: result.error });
                } else {
                    empfehlungenScrapeState.completedIds.push(p.sku);
                }
                empfehlungenScrapeState.completed++;
                await new Promise(r => setTimeout(r, 5000));
            }

            empfehlungenScrapeState.isRunning = false;
            console.log('Empfehlungen scraping finished.');
        } catch (e) {
            empfehlungenScrapeState.isRunning = false;
            console.error('Empfehlungen scraping failed:', e);
        }
    });
});

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Backend API & Scraper running on port ${PORT}`);
});
