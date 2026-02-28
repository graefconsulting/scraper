const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const db = require('./database');

function parseGermanFloat(str) {
    if (!str) return null;
    str = str.replace(/\s/g, '').replace('€', '');
    // If it contains a comma, assume German format e.g. "21454,58" or "34,95"
    if (str.includes(',')) {
        str = str.replace(/\./g, ''); // Remove thousand separators if any exist as dots
        str = str.replace(',', '.'); // Replace comma with dot for JS Float
    }
    const val = parseFloat(str);
    return isNaN(val) ? null : val;
}

function importCSV() {
    const csvFilePath = path.join(__dirname, '../produkte.csv');

    if (!fs.existsSync(csvFilePath)) {
        console.error(`CSV file not found at ${csvFilePath}`);
        return;
    }

    console.log(`Starting CSV import from ${csvFilePath}`);

    const products = [];

    fs.createReadStream(csvFilePath)
        .pipe(csv({ separator: ',' }))
        .on('data', (data) => {
            // Trim keys in case of spaces in header
            const cleanData = {};
            for (let key in data) {
                cleanData[key.trim()] = data[key];
            }
            products.push(cleanData);
        })
        .on('end', () => {
            console.log(`Parsed ${products.length} products from CSV. Updating database...`);

            db.serialize(() => {
                db.run("BEGIN TRANSACTION");

                const stmt = db.prepare(`
                    INSERT INTO products (
                        id, gtin, name, quantity, revenue_net, idealo_link, 
                        price_gross, price_net, purchase_price_net, uvp, tax_rate, clicks_30_days
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(id) DO UPDATE SET
                        gtin=excluded.gtin,
                        name=excluded.name,
                        quantity=excluded.quantity,
                        revenue_net=excluded.revenue_net,
                        idealo_link=excluded.idealo_link,
                        price_gross=excluded.price_gross,
                        price_net=excluded.price_net,
                        purchase_price_net=excluded.purchase_price_net,
                        uvp=excluded.uvp,
                        tax_rate=excluded.tax_rate,
                        clicks_30_days=excluded.clicks_30_days
                `);

                products.forEach((row) => {
                    const id = row['Artikelnummer'];
                    if (!id) return;

                    const gtin = row['GTIN'] || null;
                    const name = row['Artikelname'] || null;
                    const quantity = parseInt(row['Menge'] || '0', 10);
                    const revenue_net = parseGermanFloat(row['Umsatz Netto']);
                    const idealo_link = row['Idealo Link'] || null;
                    const price_gross = parseGermanFloat(row['Brutto-VK']);
                    const price_net = parseGermanFloat(row['Netto-VK']);
                    const purchase_price_net = parseGermanFloat(row['Durchschnittlicher Einkaufspreis (netto)']);
                    const uvp = parseGermanFloat(row['UVP']);
                    const tax_rate = parseGermanFloat(row['Steuersatz in %']);
                    const clicks_30_days = parseInt(row['Idealo Clicks 30 Tage'] || '0', 10);

                    stmt.run(
                        id, gtin, name, quantity, revenue_net, idealo_link,
                        price_gross, price_net, purchase_price_net, uvp, tax_rate, clicks_30_days,
                        (err) => {
                            if (err) console.error(`Error inserting product ${id}:`, err.message);
                        }
                    );
                });

                stmt.finalize();
                db.run("COMMIT", (err) => {
                    if (err) {
                        console.error('Error committing CSV transaction', err.message);
                    } else {
                        console.log('CSV import finished successfully.');
                    }
                });
            });
        });
}

module.exports = { importCSV };
