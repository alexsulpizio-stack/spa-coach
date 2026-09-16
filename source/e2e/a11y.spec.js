import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.use({ reducedMotion: 'reduce' });

async function expectAccessible(page){
  await page.evaluate(() => document.getAnimations().forEach((animation) => animation.finish()));
  const results=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa']).analyze();
  const blocking=results.violations.filter(item=>['serious','critical'].includes(item.impact));
  expect(blocking,blocking.map(item=>`${item.id}: ${item.help}`).join('\n')).toEqual([]);
}

test('onboarding has no serious WCAG violations',async({page})=>{
  await page.goto('/');
  await expect(page.getByRole('button',{name:"LET'S GET STARTED"})).toBeVisible();
  await expectAccessible(page);
});

test('settings has no serious WCAG violations',async({page})=>{
  await page.goto('/');
  await page.getByRole('button',{name:"LET'S GET STARTED"}).click();
  await page.getByRole('button',{name:'Open settings'}).click();
  await expect(page.locator('#settingsScreen.active')).toBeVisible();
  await expect(page.getByRole('button',{name:'← Home'})).toBeVisible();
  await expectAccessible(page);
});

test('strip reader onboarding has no serious WCAG violations',async({page})=>{
  await page.goto('/reader/');
  await expect(page.getByRole('button',{name:'START READING STRIPS'})).toBeVisible();
  await expectAccessible(page);
});
