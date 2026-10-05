export default async ({ page, shot, wait, ev, key }) => {
  await wait(800);
  if (await page.$('#tl-go')) { await page.click('#tl-go'); await wait(500); }
  await page.fill('#cc-name', 'Brunehaut');
  await page.click('[data-c="druide"]');
  await wait(800);
  await shot('create2');
  await page.click('[data-f="1"]'); await page.click('[data-c="guerrier"]');
  await wait(800);
  await shot('create3');
};
