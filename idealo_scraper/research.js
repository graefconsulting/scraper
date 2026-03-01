const axios = require('axios');
const db = require('./database');
require('dotenv').config({ path: '../.env' }); // Load .env from root

const queries = [
    {
        category: 'trends',
        prompt: "Welche Nahrungsergänzungsmittel, Vitamine, Mineralstoffe und Supplements liegen aktuell im Trend in Deutschland? Welche Inhaltsstoffe oder Produktkategorien zeigen steigende Nachfrage? Gibt es neue wissenschaftliche Erkenntnisse oder Medienberichte die das Kaufverhalten beeinflussen? Bitte auf aktuelle Entwicklungen der letzten 4 Wochen fokussieren."
    },
    {
        category: 'natugena',
        prompt: "Analysiere die Website https://natugena.de und suche nach aktuellen Informationen zu NatuGena. Gibt es neue Produkte oder Produktankündigungen? Laufen aktuell Rabattaktionen, Sale-Wochen oder Sonderangebote? Verkauft NatuGena Produkte direkt an Endkunden und zu welchen Preisen? Bitte auf Entwicklungen der letzten 4 Wochen fokussieren."
    },
    {
        category: 'vitaworld',
        prompt: "Analysiere die Website https://vita-world24.de und suche nach aktuellen Informationen zu Vitaworld. Gibt es neue Produkte oder Produktankündigungen? Laufen aktuell Rabattaktionen, Sale-Wochen oder Sonderangebote? Verkauft Vitaworld Produkte direkt an Endkunden und zu welchen Preisen? Bitte auf Entwicklungen der letzten 4 Wochen fokussieren."
    },
    {
        category: 'dr_niedermaier',
        prompt: "Analysiere die Website https://drniedermaier.de und suche nach aktuellen Informationen zu Dr. Niedermaier. Gibt es neue Produkte oder Produktankündigungen? Laufen aktuell Rabattaktionen, Sale-Wochen oder Sonderangebote? Verkauft Dr. Niedermaier Produkte direkt an Endkunden und zu welchen Preisen? Bitte auf Entwicklungen der letzten 4 Wochen fokussieren."
    },
    {
        category: 'shop_naturpur',
        prompt: "Analysiere die Website https://www.shop-naturpur.de und suche nach aktuellen Informationen zu Shop Naturpur. Gibt es neu gelistete Produkte? Laufen aktuell Rabattaktionen oder Sale-Aktionen? Gibt es Hinweise auf Preisveränderungen im Sortiment? Bitte auf Entwicklungen der letzten 4 Wochen fokussieren."
    },
    {
        category: 'vitaminversand24',
        prompt: "Analysiere die Website https://vitaminversand24.com und suche nach aktuellen Informationen zu Vitaminversand24. Gibt es neu gelistete Produkte? Laufen aktuell Rabattaktionen oder Sale-Aktionen? Gibt es Hinweise auf Preisveränderungen im Sortiment? Bitte auf Entwicklungen der letzten 4 Wochen fokussieren."
    }
];

async function runResearch() {
    const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
    if (!OPENROUTER_API_KEY) {
        throw new Error("OPENROUTER_API_KEY is not defined in the environment.");
    }

    console.log("Starting Market Research run with Perplexity...");

    for (const q of queries) {
        console.log(`Querying category: ${q.category}`);
        console.log(`Querying category: ${q.category}`);
        const response = await axios.post("https://openrouter.ai/api/v1/chat/completions", {
            model: "perplexity/sonar-pro",
            messages: [
                { role: "user", content: q.prompt }
            ]
        }, {
            headers: {
                "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
                "Content-Type": "application/json"
            }
        });

        const content = response.data.choices[0].message.content;

        // Save to DB
        db.run(`INSERT INTO market_research (category, result) VALUES (?, ?)`, [q.category, content], (err) => {
            if (err) console.error(`Error saving research for ${q.category}:`, err.message);
        });
        console.log(`Saved result for ${q.category}. Waiting 2s before next query...`);

        // Wait slightly to not overload API limits
        await new Promise(res => setTimeout(res, 2000));
    }

    console.log("Market Research run completed.");
}

module.exports = { runResearch };
