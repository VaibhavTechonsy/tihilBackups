import puppeteer from 'puppeteer';
import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';
import fs from 'fs';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

async function coutrywise_export() {
  const countries = JSON.parse(fs.readFileSync('countries.json', 'utf8'));

  const newCountries = countries.map(country => {
    if (country.Name) {
      country.Name = country.Name.replace(/\s+/g, '_').toUpperCase();
    }
    return country;
  });
  console.log('fetch HSN');

  let allHsnData = [];
  let start = 0;
  const batchSize = 1000; // Max allowed by Supabase
  let hasMore = true;
  
  while (hasMore) {
      const { data: hsnData, error } = await supabase
          .from('market_prices')
          .select('hsn_code')
          .range(start, start + batchSize - 1); // Fetch 1000 at a time
  
      if (error) {
          console.error('Supabase fetch error:', error.message);
          return;
      }
  
      if (!hsnData?.length) {
          hasMore = false;
      } else {
          allHsnData = [...allHsnData, ...hsnData];
          start += batchSize;
      }
  }
  
  console.log('DONE: ', JSON.stringify(allHsnData));

  const validHSNCodes = allHsnData
    .map(item => item.hsn_code.toString())
    .filter(code => code.length === 5 || code.length === 6)
    .map(code => code.length === 5 ? '0' + code : code);

  console.log(validHSNCodes);

  const browser = await puppeteer.launch({
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox']
});
  const page = await browser.newPage();
  await page.setDefaultNavigationTimeout(50000);
  
  for (const country of newCountries) {
    for (const hsn of validHSNCodes) {
      const url = `https://www.macmap.org/en//query/results?reporter=${country.Code}&partner=699&product=${hsn}&level=6`;
      try {
        await page.goto(url, { waitUntil: 'networkidle2' });
        const textSelector = await page.waitForSelector(
          '#customs-duties-results-section .customs-tariff-info .customs-tariff-rate-details',
          { timeout: 30000 }
        );
        const data = await textSelector.evaluate(el => el.textContent);
        const dutyRate = parseFloat(data.trim().replace('%', ''));
        
        console.log(`HSN: ${hsn}, Code: ${country.Code}, Name: ${country.Name}, Data: ${dutyRate}`);
        
        // Check if HSN exists in the table
        const { data: existingRecord, error: fetchError } = await supabase
          .from('import_duties')
          .select('hsn_code')
          .eq('hsn_code', parseInt(hsn))
          .single();

        if (fetchError && fetchError.code !== 'PGRST116') { // PGRST116 is "No rows found" error
          console.error('Error checking for HSN:', fetchError.message);
          continue;
        }

        if (!existingRecord) {
          // Create new record with just the HSN code
          const { error: insertError } = await supabase
            .from('import_duties')
            .insert([{ hsn_code: parseInt(hsn) }]);
          
          if (insertError) {
            console.error('Error creating new HSN record:', insertError.message);
            continue;
          }
        }

        // Update the specific country column
        const updateData = {};
        updateData[`${country.Name}`] = isNaN(dutyRate) ? null : dutyRate;
        
        const { error: updateError } = await supabase
          .from('import_duties')
          .update(updateData)
          .eq('hsn_code', parseInt(hsn));
        
        if (updateError) {
          console.error('Error updating duty rate:', updateError.message);
        }

      } catch (err) {
        console.error(`Error for HSN: ${hsn}, Code: ${country.Code}, Name: ${country.Name} =>`, err.message);
        continue;
      }
    }
  }

  await browser.close();
}

coutrywise_export();
