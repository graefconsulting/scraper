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

                let grossProfit = null;
                if (nettoVK !== null && ekNetto !== null && p.quantity) {
                    grossProfit = (nettoVK - ekNetto) * p.quantity;
                }

                let diffLowestEur = null;
                let diffLowestPct = null;
                const lowestRaw = currentScrape ? currentScrape.lowest_price : null;
                const lowestComp = currentScrape ? Math.min(
                    currentScrape.rank1_price || 999999,
                    currentScrape.rank2_price || 999999
                ) : 999999;
                const lowestPrice = lowestRaw || (lowestComp === 999999 ? null : lowestComp);

                if (bruttoVK !== null && lowestPrice !== null) {
                    diffLowestEur = bruttoVK - lowestPrice;
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
                if (grossProfit) {
                    gesamtrohertrag += grossProfit;
                    if (p.revenue_net && marginPct !== null) {
                        totalWeightedMargin += (marginPct * p.revenue_net);
                    }
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
