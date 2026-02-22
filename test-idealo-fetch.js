const https = require('https');

const url = 'https://www.idealo.de/preisvergleich/OffersOfProduct/206209607_-magnesia-7-1-magnesium-komplex-vegan-kapseln-90-stk-natugena.html';

const options = {
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'Accept-Language': 'de-DE,de;q=0.9,en-US;q=0.8,en;q=0.7'
  }
};

https.get(url, options, (res) => {
  console.log('Status Code:', res.statusCode);
  
  let data = '';
  res.on('data', chunk => { data += chunk; });
  res.on('end', () => {
    console.log('Response Length:', data.length);
    if (res.statusCode !== 200) {
      console.log('Response Start:', data.substring(0, 300));
    } else {
        const titleMatch = data.match(/<title>(.*?)<\/title>/);
        console.log('Title:', titleMatch ? titleMatch[1] : 'No title found');
        const minPriceMatch = data.match(/"minPrice":([0-9.]+)/) || data.match(/data-offer-price="([^"]+)"/);
        console.log('Price Indicator:', minPriceMatch ? minPriceMatch[1] : 'No obvious price in raw HTML found');
    }
  });
}).on('error', (e) => {
  console.error('Error:', e.message);
});
