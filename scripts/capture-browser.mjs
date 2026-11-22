/** Run in a Codex CUA session after the user completes a normal TAGs browser challenge.
 * This function only navigates public URLs and reads rendered card DOM. It never
 * retrieves cookies, private state, credentials, or unlisted endpoints.
 *
 * const { captureBrowser } = await import('file:///G:/AI/日常/NAI5-Artist-Roller/scripts/capture-browser.mjs');
 * await captureBrowser(sourceTab, 'G:/AI/日常/NAI5-Artist-Roller/data/raw/browser-YYYY-MM-DD-HHMMSS');
 * Then: python scripts/update_artists.py --from-browser data/raw/browser-YYYY-MM-DD-HHMMSS
 */
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';

export async function captureBrowser(tab,directory,{target=1000}={}) {
  const startedAt=new Date().toISOString(),seen=new Set();let page=1,expectedPopulation=null;
  await mkdir(directory,{recursive:true});
  while(seen.size<target){
    const url='https://tags.gallery/en/v5?s=favorites'+(page>1?'&p='+page:'');
    if(await tab.url()!==url)await tab.goto(url);
    await tab.playwright.getByText(new RegExp('^\\['+page+'/\\d+\\]$')).waitFor({state:'visible'});
    const view=await tab.playwright.evaluate(()=>({
      header:document.body.innerText.slice(0,180),
      cards:Array.from(document.querySelectorAll('.card-scan')).map(c=>({
        tag:c.querySelector('[aria-label^="Copy tag:"]')?.getAttribute('aria-label')?.replace(/^Copy tag: /,''),
        favoritesLabel:c.querySelector('[aria-label^="Total likes "]')?.getAttribute('aria-label'),
        sourcePath:c.querySelector('a[aria-label^="Open detail:"]')?.getAttribute('href'),
        samplePath:c.querySelector('img')?.getAttribute('src')??null,html:c.outerHTML,
      })),
    }));
    const marker=view.header.match(/artist --count ([\d,]+)\s*\[(\d+)\/(\d+)\]/),observedUrl=await tab.url();
    if(!marker||+marker[2]!==page||!view.header.includes('FAVS')||view.cards.length!==60||new URL(observedUrl).searchParams.get('s')!=='favorites')throw new Error('Model / pagination / favorites evidence failed at page '+page);
    const population=+marker[1].replace(/,/g,'');
    if(expectedPopulation!==null&&population!==expectedPopulation)throw new Error('Population changed during this run');
    expectedPopulation=population;
    const rows=view.cards.map((c,i)=>{
      if(!c.tag||!/^Total likes \d+$/.test(c.favoritesLabel??'')||!c.sourcePath?.startsWith('/en/artist/'))throw new Error(`Invalid public card at ${page}/${i}`);
      const sampleModel=c.samplePath?.match(/^\/images\/([^_]+)_/)?.[1]??null;
      return {tag:c.tag,favorites:+c.favoritesLabel.replace('Total likes ',''),sourceUrl:'https://tags.gallery'+c.sourcePath,sampleUrl:c.samplePath?'https://tags.gallery'+c.samplePath:null,sampleModel,modelEvidence:sampleModel==='v5'?'v5_gallery_sample':'v5_gallery_listing',cardHtml:c.html};
    });
    const record={page,url,observedUrl,fetchedAt:new Date().toISOString(),population,totalPages:+marker[3],header:view.header,rows};
    await writeFile(path.join(directory,`page-${String(page).padStart(2,'0')}.json`),JSON.stringify(record,null,2));
    rows.forEach(r=>seen.add(r.tag));
    if(seen.size>=target||page>=record.totalPages)break;
    page++;
    // Request pacing, not a page-load timing workaround.
    await new Promise(resolve=>setTimeout(resolve,1200));
  }
  const report={startedAt,endedAt:new Date().toISOString(),pages:page,unique:seen.size,source:'public rendered card HTML; sequential explicit s=favorites'};
  await writeFile(path.join(directory,'capture.json'),JSON.stringify(report,null,2));
  return report;
}
