import {test,expect} from '@playwright/test';
test('a phone can join, contribute, reallocate and receive another participant’s live votes',async({page,browser})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/');await expect(page.getByRole('heading',{name:'Your sound. Our next track.'})).toBeVisible();
 const events=await (await page.request.get('/api/events')).json();const slug=events.events[0].slug;
 await page.goto('/event/'+slug);await page.getByRole('button',{name:"I'm in. Let's make music"}).click();
 const text='Brass '+Date.now();await page.getByLabel('What would you mix this with?').fill(text);await page.getByRole('button',{name:'Contribute Sound Wave'}).click();
 await expect(page.getByRole('button',{name:'Support '+text,exact:true})).toBeEnabled();
 await page.getByRole('button',{name:'Support '+text,exact:true}).click();
 await expect(page.getByLabel('3 of 5 points remaining')).toBeVisible();
 const other=await browser.newContext();const friend=await other.newPage();await friend.goto('/event/'+slug);await friend.getByRole('button',{name:"I'm in. Let's make music"}).click();await friend.getByRole('button',{name:'Support '+text,exact:true}).click();
 await expect(page.locator('.wave-row').filter({hasText:text})).toContainText('3 points');
 await page.getByRole('button',{name:'Remove a point from '+text,exact:true}).click();await expect(page.getByLabel('4 of 5 points remaining')).toBeVisible();
 await page.screenshot({path:`test-results/${test.info().project.name}-audience.png`,fullPage:true});
 await other.close();expect(errors.filter(e=>!e.includes('WebGL'))).toEqual([]);
});
test('performer authentication is required and console can open crowd view',async({page})=>{
 await page.goto('/performer');await expect(page.getByRole('heading',{name:'Performer access'})).toBeVisible();
 await page.getByLabel('Performer credential').fill('browser-test-only-operator-token-123456');await page.getByRole('button',{name:'Open my console'}).click();
 await page.getByRole('link',{name:/The first wave/}).first().click();await expect(page.getByText('PERFORMER CONSOLE',{exact:true})).toBeVisible();await expect(page.getByRole('link',{name:'Open crowd display'})).toBeVisible();
 const events=await (await page.request.get('/api/events')).json();await page.goto('/screen/'+events.events[0].slug);await expect(page.getByText('FREE · JOIN & DOWNLOAD')).toBeVisible();await page.screenshot({path:`test-results/${test.info().project.name}-screen.png`,fullPage:true});
});
