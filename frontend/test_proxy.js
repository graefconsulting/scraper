async function test() {
    console.log("Testing proxy...");
    try {
        const response = await fetch('http://localhost:5173/api/scrape', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                urls: ["https://www.idealo.de/preisvergleich/OffersOfProduct/206209607_-magnesia-7-1-magnesium-komplex-vegan-kapseln-90-stk-natugena.html"]
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
