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



  await page.setRequestInterception(true);
  page.on('request', (request) => {
    if (request.url().includes('india.gov.in')) {
      console.log('Blocked request to india.gov.in');
      request.abort();
    } else {
      request.continue();
    }
  });

  // Override window.open to block india.gov.in
  await page.evaluateOnNewDocument(() => {
    const originalOpen = window.open;
    window.open = function (url, target, features) {
      if (url && url.includes('india.gov.in')) {
        console.log('Blocked window.open to india.gov.in');
        return null;
      }
      return originalOpen.call(window, url, target, features);
    };
  });

  // Block navigation attempts via location changes
  await page.evaluateOnNewDocument(() => {
    const originalLocation = window.location;
    Object.defineProperty(window, 'location', {
      set: function (value) {
        if (value && value.href && value.href.includes('india.gov.in')) {
          console.log('Blocked location change to india.gov.in');
          return;
        }
        originalLocation.href = value;
      },
      get: function () {
        return originalLocation;
      }
    });
  });

  await page.evaluateOnNewDocument(() => {
    document.addEventListener('click', function (e) {
      let target = e.target;
      while (target && target !== document) {
        if (target.href && target.href.includes('india.gov.in')) {
          e.preventDefault();
          e.stopImmediatePropagation();
          console.log('Blocked click navigation to india.gov.in');
          return;
        }
        target = target.parentElement;
      }
    }, true);
  });



  for (const hsn of validHSNCodes) {
    const url = "https://www.dgft.gov.in/CP/";
    try {
      await page.goto(url, { waitUntil: 'networkidle2' });

      await page.click(".chosen-single");

      await page.type(".chosen-container-active", hsn);
      await new Promise(resolve => setTimeout(resolve, 3000));
      await page.click("a");
      await new Promise(resolve => setTimeout(resolve, 3000));

      await page.click("#discover");
      await new Promise(resolve => setTimeout(resolve, 5000));

      const pageData = await page.evaluate(() => {
        const element = document.querySelector('#itchsRodtep');
        return element ? element.innerText : null;
      });

      let rodtepValue = null;
      if (pageData) {
        const cleanData = pageData.replace('%', '').trim();
        rodtepValue = cleanData ? parseFloat(cleanData) : null;
      }

      console.log(hsn, ":", rodtepValue !== null ? rodtepValue : "No RODTEP value found");

      // Upsert operation (insert or update)
      const { error } = await supabase
        .from('backups')
        .upsert(
          {
            hsn_code: parseInt(hsn),
            RODTEP: rodtepValue
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
            RODTEP: null
          },
          { onConflict: 'hsn_code' }
        );

      continue;
    }
  }

  await browser.close();
}

coutrywise_export();
