async function test() {
    console.log("Testing 3 URLs...");
    try {
        const response = await fetch('http://127.0.0.1:3000/scrape', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                urls: [
                    "https://www.idealo.de/preisvergleich/OffersOfProduct/206209607_-magnesia-7-1-magnesium-komplex-vegan-kapseln-90-stk-natugena.html",
                    "https://www.idealo.de/preisvergleich/OffersOfProduct/200891965_-lipo-vitamine-forte-5000-oel-20ml-natugena.html",
                    "https://www.idealo.de/preisvergleich/OffersOfProduct/206764732_-mitochondrien-aktivator-44-14-multi-komplex-kapseln-240-stk-natugena.html"
                ]
            })
        });
        const text = await response.text();
        console.log("Status:", response.status);
        console.log("Response:", text);
    } catch (e) {
        console.error("Test failed:", e);
    }
}
test();
