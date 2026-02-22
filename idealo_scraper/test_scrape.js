const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

(async () => {
    const targetUrl = "https://www.idealo.de/preisvergleich/OffersOfProduct/206209607_-magnesia-7-1-magnesium-komplex-vegan-kapseln-90-stk-natugena.html";
    let browser;
    try {
        browser = await puppeteer.launch({
            headless: 'new',
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });

        const page = await browser.newPage();
        await page.setViewport({ width: 1920, height: 1080 });

        console.log('Navigating to Idealo...');
        await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

        console.log('Page loaded, evaluating for prices...');

        const results = await page.evaluate(() => {
            const offerNodes = document.querySelectorAll('li.productOffers-listItem');
            const data = [];

            const maxToExtract = Math.min(2, offerNodes.length);

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

                data.push({
                    rank: i + 1,
                    price: price,
                    shop: shop
                });
            }

            return data;
        });

        console.log("Extraction results:", results);

    } catch (error) {
        console.error("Scraping error:", error);
    } finally {
        if (browser) {
            await browser.close();
        }
    }
})();
