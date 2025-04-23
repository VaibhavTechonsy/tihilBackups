import puppeteer from 'puppeteer';
import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';
import fs from 'fs';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

async function coutrywise_export() {
  console.log('fetch HSN');

  let allHsnData = [];
  let start = 0;
  const batchSize = 1000;
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
    .filter(code => code.length === 5 || code.length === 6 )
    .map(code => code.length === 5 ? '0' + code : code);

  console.log(validHSNCodes);

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();
  await page.setDefaultNavigationTimeout(50000);



  for (const hsn of validHSNCodes) {
    let ddb = 0;
    const url = `https://www.old.icegate.gov.in/Webappl/ccr_details_new.jsp?cth_duty_nw=${hsn}`;
    try {
      await page.goto(url, { waitUntil: 'networkidle2' });

      
      await new Promise(resolve => setTimeout(resolve, 8000));
      const pageData = await page.evaluate(() => {
        const element = document.querySelectorAll('.rowh')[1];
        ddb = element.querySelectorAll('.cell')[3];
        return ddb ? ddb.innerText : null;
      });


      console.log(hsn, ":", pageData !== null ? pageData : "NULL");

    //   Upsert operation (insert or update)
      const { error } = await supabase
        .from('backups')
        .upsert(
          {
            hsn_code: parseInt(hsn),
            DDB: parseFloat(pageData)
          },
          { onConflict: 'hsn_code' }
        );

      if (error) {
        console.error(`Error saving HSN ${hsn}:`, error.message);
      }

    } catch (err) {
      console.error(`Error for HSN: ${hsn} =>`, err.message);

      // Save null value if there was an error
      const { error } = await supabase
        .from('backups')
        .upsert(
          {
            hsn_code: parseInt(hsn),
            DDB: null
          },
          { onConflict: 'hsn_code' }
        );

      continue;
    }
  }

  await browser.close();
}

coutrywise_export();
