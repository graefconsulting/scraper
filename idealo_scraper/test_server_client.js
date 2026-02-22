const { spawn } = require('child_process');
const http = require('http');

const server = spawn('node', ['scraper.js']);
server.stdout.on('data', data => console.log(`Server: ${data}`));
server.stderr.on('data', data => console.error(`Server Err: ${data}`));

setTimeout(() => {
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
        let body = '';
        res.on('data', d => body += d);
        res.on('end', () => {
            console.log("Client received response:", body);
            server.kill();
            process.exit(0);
        });
    });
    req.write(data);
    req.end();
}, 2000);
