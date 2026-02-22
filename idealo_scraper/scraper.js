const express = require('express');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const cors = require('cors');

// Enable stealth plugin
puppeteer.use(StealthPlugin());

const app = express();
app.use(cors());
app.use(express.json());

app.post('/scrape', async (req, res) => {
    let { targetUrl, urls } = req.body;
    console.log("INCOMING REQUEST BODY:", req.body);

    // Normalize input to an array of URLs
    if (targetUrl && !urls) {
        urls = [targetUrl];
    }

    if (!urls || !Array.isArray(urls) || urls.length === 0) {
        return res.status(400).json({ error: "Missing 'urls' array in request body.", receivedBody: req.body });
    }

    console.log(`Received request to scrape ${urls.length} URLs`);
    let browser;
    try {
        browser = await puppeteer.launch({
            headless: 'new',
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });

        const page = await browser.newPage();
        await page.setViewport({ width: 1920, height: 1080 });

        const allResults = [];

        for (const url of urls) {
            console.log(`Navigating to Idealo: ${url}`);
            try {
                await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

                console.log('Waiting for offers to load...');
                try {
                    // We ensure the list item that holds the price is visible
                    await page.waitForSelector('a.productOffers-listItemOfferPrice', { timeout: 15000 });
                } catch (e) {
                    console.log("Timeout waiting for offers... continuing anyway.");
                }

                console.log('Page loaded, evaluating for prices...');

                const results = await page.evaluate(() => {
                    const offerNodes = document.querySelectorAll('li.productOffers-listItem');
                    const data = [];

                    const maxToExtract = Math.min(20, offerNodes.length); // Scan up to 20 to find Health Rise
                    let healthRiseOffer = null;

                    for (let i = 0; i < maxToExtract; i++) {
                        const node = offerNodes[i];
                        let price = null;
                        let shop = "Unbekannt";

                        // Shop extraction
                        // Strategy 1: data-shop-name attribute on the logo link
                        const shopLink = node.querySelector('a[data-shop-name]');
                        if (shopLink) {
                            shop = shopLink.getAttribute('data-shop-name');
                        } else {
                            // Strategy 2: Image alt text
                            const shopImg = node.querySelector('img.productOffers-listItemOfferShopV2LogoImage');
                            if (shopImg && shopImg.alt && !shopImg.alt.includes('idealo')) {
                                shop = shopImg.alt;
                            } else {
                                // Strategy 3: Parse from data-mtrx-click if present
                                const dMtrx = node.getAttribute('data-mtrx-click');
                                if (dMtrx) {
                                    try {
                                        const parsed = JSON.parse(dMtrx);
                                        if (parsed.shop_name) shop = parsed.shop_name;
                                    } catch (e) { }
                                }
                            }
                        }

                        // Clean shop name (e.g. "docmorris.de - Shop aus Heerlen" -> "docmorris.de")
                        if (shop.includes(' - ')) {
                            shop = shop.split(' - ')[0];
                        }

                        // Price extraction
                        const priceLink = node.querySelector('a.productOffers-listItemOfferPrice');
                        if (priceLink) {
                            // Try to extract the direct text node that holds the price, excluding the span with the base price
                            let priceText = "";
                            for (let child of priceLink.childNodes) {
                                if (child.nodeType === 3) { // TEXT_NODE
                                    priceText += child.textContent;
                                }
                            }
                            if (priceText.trim() === "") priceText = priceLink.innerText;

                            const match = priceText.match(/[\d.,]+/);
                            if (match) {
                                price = match[0].trim();
                            }
                        }

                        // Always push top 2
                        if (i < 2) {
                            data.push({
                                rank: i + 1,
                                price: price,
                                shop: shop
                            });
                        }

                        // Check for Health Rise
                        if (shop.toLowerCase().includes('health rise') || shop.toLowerCase().includes('health-rise')) {
                            healthRiseOffer = {
                                rank: i + 1,
                                price: price,
                                shop: shop,
                                isHealthRise: true
                            };
                        }
                    }

                    // Append Health Rise if found and not already in top 2
                    if (healthRiseOffer && healthRiseOffer.rank > 2) {
                        data.push(healthRiseOffer);
                    }

                    return data;
                });

                console.log(`Scraping successful for ${url}:`, results);

                // Fetch the product title to display nicely in the frontend
                const title = await page.evaluate(() => {
                    const h1 = document.querySelector('h1');
                    return h1 ? h1.innerText.trim() : 'Unknown Product';
                });

                allResults.push({
                    url: url,
                    title: title,
                    offers: results,
                    success: true
                });

            } catch (err) {
                console.error(`Failed to scrape ${url}:`, err.message);
                allResults.push({
                    url: url,
                    success: false,
                    error: err.message
                });
            }

            // Wait slightly between requests
            await new Promise(resolve => setTimeout(resolve, 2000));
        }

        res.json({
            success: true,
            results: allResults
        });

    } catch (error) {
        console.error("Scraping error:", error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    } finally {
        if (browser) {
            await browser.close();
        }
    }
});

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Stealth Scraper Service running on port ${PORT}`);
});
