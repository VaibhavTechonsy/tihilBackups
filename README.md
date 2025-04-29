# Trade Data Scraper Scripts

This repository contains three Puppeteer-based Node.js scripts to fetch and update trade-related data into a Supabase database.

## Requirements

- Node.js v20.18+
- `.env` file containing: supabase credits
- `countries.json` file for country codes (used in `importDuty.js`)


**Setup**
1. Clone this repository or download the script.

2. Install dependencies:

npm install

3. Create a .env file in the root folder with the following environment variables:

SUPABASE_URL=your-supabase-url
SUPABASE_KEY=your-supabase-key

4. Ensure countries.json exists in the root directory and follows this structure:

[
  { "Name": "India", "Code": "356" },
  { "Name": "United_States", "Code": "840" }
]

5. How to Run
   - IMPORT DUTY : node importDuty.js
   - RODTEP : node rodtep.js
   - DDB : node ddb.js
  

**1. importDuty.js**
  - Purpose:
    Scrapes import duty rates per HSN code from macmap.org for various countries and updates the import_duties table in Supabase.

  - Main Actions:
    Read country list from countries.json
    Fetch all HSN codes from market_prices table
    Scrape the customs duty rate for each country-HSN combination
    Insert/update the import_duties table with the collected rates

  - Run command:
    node importDuty.js


**2. rodtep.js**
  - Purpose:
    Fetches the RODTEP (Remission of Duties and Taxes on Exported Products) rates for different HSN codes from dgft.gov.in and updates the backups table in Supabase.

  - Main Actions:
    Fetch all HSN codes from market_prices table
    Scrape the RODTEP value for each HSN code
    Insert/update the backups table with RODTEP values
    Handles blocking of unwanted popups and external navigation (e.g., india.gov.in)

  - Run command:
    node rodtep.js


**3. ddb.js**
  - Purpose:
    Scrapes the DDB (Duty Drawback) rates for HSN codes from icegate.gov.in and updates the backups table in Supabase.

  - Main Actions:
    Fetch all HSN codes from market_prices table
    Scrape the DDB value for each HSN code
    Insert/update the backups table with DDB values

  - Run command:
    node ddb.js


**NOTES**
  - These scripts use Puppeteer with --no-sandbox mode (suitable for cloud hosting but ensure proper security if used in production).
  - In case of website structure changes, scraping selectors may need updates.
