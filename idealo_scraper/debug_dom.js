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
        await page.goto(targetUrl, { waitUntil: 'networkidle2', timeout: 30000 });

        console.log('Page loaded, evaluating for prices...');

        // Let's grab the HTML of the main offers list to see what selectors to use
        const html = await page.evaluate(() => {
            // Let's find any element containing '€' or 'productOffers'
            const offerList = document.querySelector('.productOffers-list') || document.querySelector('[data-type="offerList"]');

            if (offerList) return offerList.innerHTML.substring(0, 3000);

            return document.body.innerHTML.substring(0, 3000);
        });

        const fs = require('fs');
        fs.writeFileSync('idealo_dom.html', html);
        console.log('Saved DOM snippet to idealo_dom.html');

    } catch (error) {
        console.error("Scraping error:", error);
    } finally {
        if (browser) {
            await browser.close();
        }
    }
})();
