const http = require('http');

const data = JSON.stringify({
    targetUrl: "https://www.idealo.de/preisvergleich/OffersOfProduct/206209607_-magnesia-7-1-magnesium-komplex-vegan-kapseln-90-stk-natugena.html"
});

const options = {
    hostname: 'localhost',
    port: 3000,
    path: '/scrape',
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Content-Length': data.length
    }
};

const req = http.request(options, res => {
    console.log(`statusCode: ${res.statusCode}`);
    let responseBody = '';
    res.on('data', d => {
        responseBody += d;
    });

    res.on('end', () => {
        console.log("Response:", responseBody);
    });
});

req.on('error', error => {
    console.error(error);
});

req.write(data);
req.end();
