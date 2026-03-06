const { chromium } = require('playwright');

async function getHTML(url) {
    const browser = await chromium.launch();
    const page = await browser.newPage();

    await page.goto(url, { waitUntil: 'networkidle' });

    const html = await page.content();

    console.log(html);

    await browser.close();
}

getHTML("https://demo.gridbase.com/login");