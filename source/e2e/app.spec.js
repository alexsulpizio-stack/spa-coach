import { test, expect } from '@playwright/test';

async function finishOnboarding(page){
  await page.goto('/');
  await page.getByRole('button',{name:"LET'S GET STARTED"}).click();
  await expect(page.getByRole('button',{name:'TEST MY WATER'})).toBeVisible();
}

test('onboarding leads to the water-care dashboard',async({page})=>{
  await finishOnboarding(page);
  await expect(page.getByRole('heading',{name:'Spa Coach'})).toBeVisible();
  await expect(page.getByText('Upcoming care')).toBeVisible();
});

test('manual readings produce conservative treatment guidance',async({page})=>{
  await finishOnboarding(page);
  await page.getByRole('button',{name:'TEST MY WATER'}).click();
  await page.getByRole('button',{name:'ENTER READINGS MANUALLY'}).click();
  await page.locator('#edit_freeChlorine').selectOption('1');
  await page.locator('#edit_ph').selectOption('7.2');
  await page.getByRole('button',{name:'USE THESE READINGS'}).click();
  await expect(page.getByText("DON'T USE THE SPA YET")).toBeVisible();
  await page.getByRole('button',{name:'WHAT SHOULD I DO?'}).click();
  await expect(page.getByRole('heading',{name:'Raise free chlorine first'})).toBeVisible();
  await expect(page.locator('.treatment-product span')).toContainText('0.29 oz');
});

test('maintenance settings schedule native reminders',async({page})=>{
  await page.addInitScript(()=>{
    window.__scheduled=[];
    window.SpaNative={
      isNativeApp:()=>true,
      getNotificationPermission:()=> 'granted',
      getAppVersion:()=> '0.9.0',
      scheduleReminder:(...args)=>window.__scheduled.push(args),
      cancelReminder:()=>{}
    };
  });
  await finishOnboarding(page);
  await page.getByRole('button',{name:'Open settings'}).click();
  await page.locator('#filterReminderEnabled').check();
  await page.locator('#filterIntervalDays').fill('10');
  await page.getByRole('button',{name:'SAVE REMINDERS'}).click();
  const keys=await page.evaluate(()=>window.__scheduled.map(item=>item[0]));
  expect(keys).toContain('filter');
});

test('full backup restore migrates state and reloads safely',async({page})=>{
  await finishOnboarding(page);
  await page.getByRole('button',{name:'Open settings'}).click();
  page.on('dialog',dialog=>dialog.accept());
  const payload={
    format:'spa-coach-full-backup',
    version:3,
    createdAt:'2026-08-31T12:00:00.000Z',
    state:{profile:{name:'Restored Spa',volume:350,sanitizer:'chlorine'},history:[],inventory:[],maintenance:{}},
    photos:[]
  };
  await page.locator('#restoreBackupInput').setInputFiles({
    name:'spa-backup.json',
    mimeType:'application/json',
    buffer:Buffer.from(JSON.stringify(payload))
  });
  await expect(page.locator('#backupStatus')).toContainText('Restore complete');
  await page.waitForTimeout(700);
  await page.getByRole('button',{name:'Open settings'}).click();
  await expect(page.locator('#spaNameInput')).toHaveValue('Restored Spa');
});
