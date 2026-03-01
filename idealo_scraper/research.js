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

const systemPrompt = `You are a precise data extraction assistant for a German e-commerce market intelligence tool. You receive raw research text from a web search engine and extract only the relevant, factual information. 

Rules:
- Always respond with valid JSON only — no markdown, no backticks, no explanation text
- All text values in the JSON must be in German
- If information is not clearly stated in the source text, set the field to null or an empty array — never invent or assume data
- Remove all source citations like [1], [2], [3] from any text you include
- Remove all markdown formatting (**, ###, -, bullet points) from text values
- Keep text values concise — summaries max 3 sentences, list items max 1 sentence each
- If the source text is in English or contains very little useful information, still return the correct JSON structure with empty arrays and null values, and set "keine_daten" to true`;

const extractionPrompts = {
    trends: `Extract market trend information from the following research text and return this exact JSON structure:

{
  "trending_kategorien": [
    {"name": "category name", "beschreibung": "one sentence description"}
  ],
  "regulierung": "text about regulatory changes, or null if none mentioned",
  "medien_wissenschaft": "text about media or scientific influences, or null if none mentioned",
  "zusammenfassung": "2-3 sentence overall summary",
  "keine_daten": false
}`,
    natugena: `Extract manufacturer intelligence from the following research text and return this exact JSON structure:

{
  "neue_produkte": ["product name or announcement"],
  "rabattaktionen": ["description of discount or promotion"],
  "direktverkauf": {
    "aktiv": true,
    "preisbeispiele": [
      {"produkt": "product name", "preis": 0.00}
    ]
  },
  "zusammenfassung": "2-3 sentence overall summary",
  "keine_daten": false
}

Set "keine_daten" to true if the source text contains very little or no useful information about this manufacturer.`,
    vitaworld: `Extract manufacturer intelligence from the following research text and return this exact JSON structure:

{
  "neue_produkte": ["product name or announcement"],
  "rabattaktionen": ["description of discount or promotion"],
  "direktverkauf": {
    "aktiv": true,
    "preisbeispiele": [
      {"produkt": "product name", "preis": 0.00}
    ]
  },
  "zusammenfassung": "2-3 sentence overall summary",
  "keine_daten": false
}

Set "keine_daten" to true if the source text contains very little or no useful information about this manufacturer.`,
    dr_niedermaier: `Extract manufacturer intelligence from the following research text and return this exact JSON structure:

{
  "neue_produkte": ["product name or announcement"],
  "rabattaktionen": ["description of discount or promotion"],
  "direktverkauf": {
    "aktiv": true,
    "preisbeispiele": [
      {"produkt": "product name", "preis": 0.00}
    ]
  },
  "zusammenfassung": "2-3 sentence overall summary",
  "keine_daten": false
}

Set "keine_daten" to true if the source text contains very little or no useful information about this manufacturer.`,
    shop_naturpur: `Extract competitor intelligence from the following research text and return this exact JSON structure:

{
  "neue_produkte": ["product name or listing"],
  "aktuelle_aktionen": ["description of sale, discount or promotion"],
  "preishinweise": ["any specific price change or noteworthy pricing information"],
  "zusammenfassung": "2-3 sentence overall summary",
  "keine_daten": false
}

Set "keine_daten" to true if the source text contains very little or no useful information about this competitor.`,
    vitaminversand24: `Extract competitor intelligence from the following research text and return this exact JSON structure:

{
  "neue_produkte": ["product name or listing"],
  "aktuelle_aktionen": ["description of sale, discount or promotion"],
  "preishinweise": ["any specific price change or noteworthy pricing information"],
  "zusammenfassung": "2-3 sentence overall summary",
  "keine_daten": false
}

Set "keine_daten" to true if the source text contains very little or no useful information about this competitor.`
};

async function callClaudeSonnet(content, category, API_KEY) {
    const claudePrompt = extractionPrompts[category] + "\n\nResearch text:\n" + content;

    try {
        if (API_KEY.startsWith("sk-or-")) {
            // User provided an OpenRouter key in .env, use openrouter anthropic endpoint
            const res = await axios.post("https://openrouter.ai/api/v1/chat/completions", {
                model: "anthropic/claude-3.5-sonnet",
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: claudePrompt }
                ]
            }, { headers: { "Authorization": `Bearer ${API_KEY}`, "Content-Type": "application/json" } });
            return res.data.choices[0].message.content;
        } else {
            // Assume valid Anthropic key
            const res = await axios.post("https://api.anthropic.com/v1/messages", {
                model: "claude-3-5-sonnet-20240620",
                max_tokens: 2000,
                system: systemPrompt,
                messages: [{ role: "user", content: claudePrompt }]
            }, {
                headers: {
                    "x-api-key": API_KEY,
                    "anthropic-version": "2023-06-01",
                    "content-type": "application/json"
                }
            });
            return res.data.content[0].text;
        }
    } catch (err) {
        console.error("Claude Extraction failed:", err.response ? err.response.data : err.message);
        throw err;
    }
}

async function runResearch() {
    let OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
    if (OPENROUTER_API_KEY && OPENROUTER_API_KEY.startsWith('=')) {
        OPENROUTER_API_KEY = OPENROUTER_API_KEY.substring(1);
    }

    let ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || OPENROUTER_API_KEY;
    if (ANTHROPIC_API_KEY && ANTHROPIC_API_KEY.startsWith('=')) {
        ANTHROPIC_API_KEY = ANTHROPIC_API_KEY.substring(1);
    }

    if (!OPENROUTER_API_KEY) {
        throw new Error("OPENROUTER_API_KEY is not defined in the environment.");
    }

    console.log("Starting Market Research run with Perplexity + Claude Sonnet...");

    // Determine the next run_id
    const newRunId = await new Promise((resolve, reject) => {
        db.get("SELECT MAX(run_id) as maxRunId FROM market_research", (err, row) => {
            if (err) reject(err);
            else resolve((row && row.maxRunId) ? row.maxRunId + 1 : 1);
        });
    });
    console.log(`Assigned Run ID: ${newRunId}`);

    for (const q of queries) {
        console.log(`Querying Perplexity category: ${q.category}`);
        let finalJsonStr = null;

        try {
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

            const rawContent = response.data.choices[0].message.content;

            console.log(`Extracting JSON via Claude Sonnet for: ${q.category}`);
            let claudeResponse = await callClaudeSonnet(rawContent, q.category, ANTHROPIC_API_KEY);

            // Validate JSON
            try {
                // Remove potential markdown fences just in case Claude ignored instructions
                if (claudeResponse.includes('\`\`\`')) {
                    claudeResponse = claudeResponse.replace(/\`\`\`json/g, '').replace(/\`\`\`/g, '').trim();
                }
                JSON.parse(claudeResponse);
                finalJsonStr = claudeResponse;
            } catch (e) {
                console.warn(`JSON parsing failed for ${q.category}. Falling back to raw text.`);
                finalJsonStr = JSON.stringify({ parse_error: true, raw_text: rawContent });
            }

        } catch (err) {
            console.error(`Error during research phase for ${q.category}:`, err.message);
            // Save null for this section on failure
            finalJsonStr = null;
        }

        // Save to DB
        db.run(`INSERT INTO market_research (run_id, category, result) VALUES (?, ?, ?)`, [newRunId, q.category, finalJsonStr], (err) => {
            if (err) console.error(`Error saving research for ${q.category}:`, err.message);
        });

        console.log(`Saved result for ${q.category}. Waiting 2s before next query...`);
        await new Promise(res => setTimeout(res, 2000));
    }

    // Cleanup: keep max 10 runs
    db.all("SELECT DISTINCT run_id FROM market_research WHERE run_id IS NOT NULL ORDER BY run_id ASC", [], (err, rows) => {
        if (!err && rows.length > 10) {
            const limit = rows.length - 10;
            const idsToDelete = rows.slice(0, limit).map(r => r.run_id);
            const placeholders = idsToDelete.map(() => '?').join(',');
            db.run(`DELETE FROM market_research WHERE run_id IN (${placeholders})`, idsToDelete, (err) => {
                if (err) console.error("Error cleaning up old research:", err.message);
                else console.log(`Deleted ${idsToDelete.length} old research runs to keep max 10.`);
            });
        }
    });

    console.log("Market Research run completed.");
}

module.exports = { runResearch };
