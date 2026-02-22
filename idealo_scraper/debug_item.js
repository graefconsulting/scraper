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

        const html = await page.evaluate(() => {
            const node = document.querySelector('li.productOffers-listItem');
            return node ? node.outerHTML : 'No list item found';
        });

        const fs = require('fs');
        fs.writeFileSync('idealo_item_dom.html', html);
        console.log('Saved item snippet to idealo_item_dom.html');

    } catch (error) {
        console.error("Scraping error:", error);
    } finally {
        if (browser) {
            await browser.close();
        }
    }
})();
