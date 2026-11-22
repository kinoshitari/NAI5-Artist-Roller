"""Sequential TAGs V5 favorites collector. Standard-library only; never bypasses challenges.

python scripts/update_artists.py
python scripts/update_artists.py --from-snapshots data/raw/<capture-directory> --allow-partial

HTTP 403 stops the collection. Rate limits / transient errors use exponential backoff.
An incomplete or inconsistent run never replaces an existing published snapshot.
"""
from __future__ import annotations
import argparse
import csv
import html
import io
import json
import pathlib
import re
import shutil
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from html.parser import HTMLParser

ROOT = pathlib.Path(__file__).resolve().parents[1]
DATA = ROOT / 'data'
BASE = 'https://tags.gallery/en/v5?s=favorites'

def now(): return datetime.now(timezone.utc).isoformat()

def parse_html(body: str, page: int):
    """Parse public Next.js serialized card props, not scripts or arbitrary executable code."""
    streams = []
    for m in re.finditer(r'self\.__next_f\.push\((\[.*?\])\)\s*</script>', body, re.S):
        try:
            packet = json.loads(m[1])
            if len(packet) > 1 and isinstance(packet[1], str): streams.append(packet[1])
        except (ValueError, TypeError): pass
    text = ''.join(streams)
    if not re.search(r'"sort"\s*:\s*"favorites"', text):
        raise ValueError('Cannot verify favorites sort in public page props')
    decoder = json.JSONDecoder()
    rows = []
    for m in re.finditer(r'\{"a":\{', text):
        props, _ = decoder.raw_decode(text[m.start():])
        a = props['a']
        if props.get('catKey') != 'artist' or props.get('modelPref') != 'v5': continue
        sample = next((i for i in props.get('images', []) if i.get('model') == 'v5'), None)
        fallback = props.get('images', [None])[0] if props.get('images') else None
        shown = sample or fallback
        rows.append({'tag': a['tag'], 'favorites': props.get('initialUp'),
                     'aliases': a.get('aliases'), 'postCount': a.get('post_count'), 'topScore': a.get('top_score'),
                     'modelEvidence': 'v5_gallery_sample' if sample else 'v5_gallery_listing',
                     'sampleModel': shown.get('model') if shown else None,
                     'sampleUrl': 'https://tags.gallery'+shown['file_path'] if shown else None,
                     'sourceUrl': 'https://tags.gallery/artist/' + urllib.parse.quote(a['slug'], safe='')})
    plain = html.unescape(re.sub(r'<[^>]+>', ' ', body))
    # These visible pagination markers occur outside the card props in the rendered HTML.
    marker = re.search(r'artist\s*--count\s*([\d,]+).*?\[\s*(\d+)\s*/\s*(\d+)\s*\]', plain, re.S)
    if not marker or int(marker[2]) != page: raise ValueError('Pagination marker missing or page mismatch')
    if not rows or (len(rows) != 60 and int(marker[2]) != int(marker[3])): raise ValueError('Unexpected card count; inspect raw HTML before updating parser')
    return rows, int(marker[1].replace(',', '')), int(marker[3])

def parse_web_snapshot(record):
    url = record['url']
    parsed = urllib.parse.urlsplit(url)
    if parsed.netloc != 'tags.gallery' or parsed.path != '/en/v5' or urllib.parse.parse_qs(parsed.query).get('s') != ['favorites']:
        raise ValueError('Snapshot is not explicitly V5 favorites')
    plain = re.sub(r'^L\d+: ?', '', record['response'], flags=re.M)
    marker = re.search(r'artist --count ([\d,]+)\[(\d+)/(\d+)\]', plain)
    if not marker or int(marker[2]) != record['page'] or 'V5 Artists' not in plain or '>FAVS' not in plain:
        raise ValueError('Cannot verify model / sort / pagination')
    rows = [{'tag':m[1].strip(),'favorites':int(m[2].replace(',',''))} for m in re.finditer(r'^(.+?)\s*COPY\s*\n+\s*(\d[\d,]*)\s*$', plain, re.M)]
    if len(rows) != 60: raise ValueError('Expected 60 artists per full page')
    return rows, int(marker[1].replace(',', '')), int(marker[3])

class PublicCard(HTMLParser):
    def __init__(self):
        super().__init__(); self.tag = self.favorites = self.source = self.sample = None
    def handle_starttag(self, tag, attrs):
        a = dict(attrs); label = a.get('aria-label', '')
        if tag == 'button' and label.startswith('Copy tag: '): self.tag = label[len('Copy tag: '):]
        if label.startswith('Total likes '): self.favorites = int(label[len('Total likes '):])
        if tag == 'a' and label.startswith('Open detail: '): self.source = a.get('href')
        if tag == 'img': self.sample = a.get('src')

def parse_browser_snapshot(record):
    """Re-parse the actual public card HTML; never trust a claimed row list on its own."""
    parsed = urllib.parse.urlsplit(record['observedUrl'])
    query = urllib.parse.parse_qs(parsed.query)
    page = record['page']
    if parsed.netloc != 'tags.gallery' or parsed.path != '/en/v5' or query.get('s') != ['favorites'] or int(query.get('p',['1'])[0]) != page:
        raise ValueError('Browser URL is not the explicit V5 favorites page')
    marker = re.search(r'artist --count ([\d,]+)\s*\[(\d+)/(\d+)\]', record['header'])
    if not marker or int(marker[2]) != page or 'NovelAI V5 Artist Tags List' not in record['header'] or 'FAVS' not in record['header']:
        raise ValueError('Browser model / sort / pagination evidence missing')
    rows = []
    for item in record['rows']:
        card=PublicCard();card.feed(item['cardHtml'])
        if not card.tag or card.favorites is None or not card.source or not card.source.startswith('/en/artist/'):
            raise ValueError('Invalid public card HTML')
        model = re.match(r'/images/([^_]+)_',card.sample or '')
        sample_model = model[1] if model else None
        row={'tag':card.tag,'favorites':card.favorites,'sourceUrl':'https://tags.gallery'+card.source,
             'sampleUrl':'https://tags.gallery'+card.sample if card.sample else None,'sampleModel':sample_model,
             'modelEvidence':'v5_gallery_sample' if sample_model=='v5' else 'v5_gallery_listing'}
        if item['tag'] != row['tag'] or item['favorites'] != row['favorites']:
            raise ValueError('Parsed card does not match captured row')
        rows.append(row)
    if len(rows) != 60: raise ValueError('Expected a complete 60-card page')
    return rows,int(marker[1].replace(',','')),int(marker[3])

def collect(args, run):
    artists, seen, pages, duplicates = [], set(), [], []
    population, previous = None, None
    ended, failure = False, None
    page = 1
    while len(artists) < 1000 and not ended:
        url = BASE + (f'&p={page}' if page > 1 else '')
        try:
            if args.from_browser:
                file=pathlib.Path(args.from_browser).resolve()/f'page-{page:02d}.json'
                record=json.loads(file.read_text(encoding='utf-8'))
                rows,hits,total_pages=parse_browser_snapshot(record)
                fetched=record['fetchedAt']
                raw=str(file.relative_to(ROOT)).replace('\\','/')
            elif args.from_snapshots:
                candidates = sorted(pathlib.Path(args.from_snapshots).glob(f'page-{page:02d}-*.json'))
                records = [(f,json.loads(f.read_text(encoding='utf-8-sig'))) for f in candidates]
                chosen = next(((f,r) for f,r in reversed(records) if r.get('valid')), None)
                if chosen is None: raise ValueError(f'No valid page {page}; source blocked or stale')
                file,record=chosen
                rows, hits, total_pages = parse_web_snapshot(record)
                fetched = record['fetchedAt']
                raw = str(file.resolve().relative_to(ROOT)).replace('\\','/')
            elif args.from_html:
                folder = pathlib.Path(args.from_html).resolve()
                page_meta = json.loads((folder/f'page-{page:02d}.meta.json').read_text(encoding='utf-8'))
                if page_meta['url'] != url: raise ValueError('Cached URL does not preserve the requested favorites pagination')
                file = folder/f'page-{page:02d}.html'
                body = file.read_text(encoding='utf-8')
                rows, hits, total_pages = parse_html(body, page)
                fetched = page_meta['fetchedAt']
                raw = str(file.relative_to(ROOT)).replace('\\','/')
            else:
                file = run / f'page-{page:02d}.html'
                body = None
                for attempt in range(3):
                    try:
                        req = urllib.request.Request(url, headers={'User-Agent':'NAI5-Artist-Roller/1.0 (public metadata snapshot; sequential)'})
                        with urllib.request.urlopen(req, timeout=40) as response:
                            body = response.read().decode('utf-8')
                        break
                    except urllib.error.HTTPError as exc:
                        if exc.code in (401, 403): raise RuntimeError(f'HTTP {exc.code}: verification required; no bypass attempted') from exc
                        if exc.code not in (429, 500, 502, 503, 504) or attempt == 2: raise
                        time.sleep(2 ** (attempt + 1))
                    except (TimeoutError, urllib.error.URLError):
                        if attempt == 2: raise
                        time.sleep(2 ** (attempt + 1))
                assert body is not None
                file.write_text(body, encoding='utf-8')
                fetched = now()
                (run/f'page-{page:02d}.meta.json').write_text(json.dumps({'url':url,'fetchedAt':fetched}),encoding='utf-8')
                rows, hits, total_pages = parse_html(body, page)
                raw = str(file.relative_to(ROOT)).replace('\\','/')
            if population is None: population = hits
            if hits != population: raise ValueError(f'Mixed population versions ({population} vs {hits}); refusing to combine')
            pages.append({'page':page,'url':url,'fetchedAt':fetched,'raw':raw,'rowCount':len(rows),'population':hits,'totalPages':total_pages})
            for offset, row in enumerate(rows):
                fav = row['favorites']
                if not isinstance(fav, int) or fav < 0: raise ValueError('Missing / invalid favorites count')
                if previous is not None and fav > previous: raise ValueError('Non-descending favorites; ranking changed during collection')
                previous = fav
                tag = row['tag'].strip()
                if tag in seen:
                    duplicates.append({'tag':tag,'page':page,'sourceRank':(page-1)*60+offset+1}); continue
                seen.add(tag)
                artists.append({'id':'tags.gallery:'+tag,'tag':tag,'displayName':tag,'sourceRank':(page-1)*60+offset+1,
                    'favorites':fav,'sourceUrl':row.get('sourceUrl') or url,'modelEvidence':row.get('modelEvidence','v5_gallery_listing'),
                    'sampleUrl':row.get('sampleUrl'),'sampleModel':row.get('sampleModel'),
                    'aliases':row.get('aliases'),'postCount':row.get('postCount'),'topScore':row.get('topScore')})
            ended = page >= total_pages
            page += 1
            if not (args.from_snapshots or args.from_html or args.from_browser): time.sleep(1.2)
        except Exception as exc:
            failure = str(exc); break
    return artists[:1000], pages, duplicates, failure

def publish_files(data, run, payloads):
    """Stage every output before replacement; roll back a partially failed commit."""
    stage=run/'publish';stage.mkdir()
    previous={name:(data/name).read_bytes() if (data/name).exists() else None for name in payloads}
    for name,content in payloads.items():(stage/name).write_text(content,encoding='utf-8')
    committed=[]
    try:
        for name in payloads:
            (stage/name).replace(data/name);committed.append(name)
    except OSError:
        for name in committed:
            if previous[name] is None:(data/name).unlink()
            else:
                restore=data/(name+'.recovery');restore.write_bytes(previous[name]);restore.replace(data/name)
        raise

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--from-snapshots',help='Replay public web-reader raw response summaries from a single collection run')
    parser.add_argument('--from-html',help='Replay cached HTML and .meta.json files from one completed run, without network')
    parser.add_argument('--from-browser',help='Replay one verified-browser capture of public card HTML fragments, without network')
    parser.add_argument('--allow-partial',action='store_true',help='Allow first-time partial snapshot, never overwrite an existing one')
    args=parser.parse_args()
    if sum(bool(v) for v in [args.from_snapshots,args.from_html,args.from_browser])>1: parser.error('Choose one cache source')
    start=now(); run=DATA/'raw'/('update-'+start.replace(':','-'));run.mkdir(parents=True,exist_ok=True)
    artists,pages,duplicates,error=collect(args,run)
    if pages: start=min(p['fetchedAt'] for p in pages)
    end=max((p['fetchedAt'] for p in pages),default=now())
    metadata={'formatVersion':1,'name':'V5 收藏前1000','version':'v5-favs-'+start[:19].replace(':','-'),
        'source':'TAGs（第三方榜单）','sourceUrl':BASE,'requestedCount':1000,'actualCount':len(artists),
        'complete':len(artists)==1000 and not error,'collectionStartedAt':start,'collectionEndedAt':end,
        'method':'public_rendered_card_html' if args.from_browser else 'public_html_text_snapshot' if args.from_snapshots else 'public_html_nextjs_props',
        'ranking':'V5 candidate set; FAVS descending; ties in source order; cross-page exact-tag deduplication',
        'pages':pages,'duplicates':duplicates,'limitation':error,
        'fields':{'favorites':'Site favorite count (FAVS)','postCount':'Danbooru post count (POSTS)','topScore':'Danbooru highest single-post score (SCORE)','aliases':'Only source-provided aliases; otherwise null'},
        'evidence':'v5_gallery_sample: V5 thumbnail observed; v5_gallery_listing: listed in V5 candidates but the displayed thumbnail is another model or absent. Neither denotes an official training list.',
        'listingOnlyCount':sum(a['modelEvidence']=='v5_gallery_listing' for a in artists),
        'idPolicy':'Stable local namespace tags.gallery: followed by the original source tag; not an asserted upstream database ID'}
    (run/'manifest.json').write_text(json.dumps(metadata,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    (run/'candidate.json').write_text(json.dumps(artists,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    target=DATA/'artists.v5.top1000.json'
    can_publish=metadata['complete'] or (args.allow_partial and artists and not target.exists())
    if not can_publish:
        print(f'Not published: {len(artists)}/1000. Existing data preserved. {error or "Incomplete"}')
        return 1
    if target.exists():
        backup=DATA/'versions'/run.name;backup.mkdir(parents=True,exist_ok=True)
        for name in ['artists.v5.top1000.json','artists.v5.top1000.csv','source.json']:
            old=DATA/name
            if old.exists():shutil.copy2(old,backup/name)
    # All validation and serialization finish before publishing. Replace individual files atomically.
    buffer=io.StringIO(newline='');writer=csv.DictWriter(buffer,fieldnames=list(artists[0]));writer.writeheader()
    for a in artists:writer.writerow({**a,'aliases':json.dumps(a['aliases'],ensure_ascii=False)})
    publish_files(DATA,run,{'artists.v5.top1000.json':json.dumps(artists,ensure_ascii=False,indent=2)+'\n','artists.v5.top1000.csv':'\ufeff'+buffer.getvalue(),'source.json':json.dumps(metadata,ensure_ascii=False,indent=2)+'\n'})
    print(f'Published {len(artists)} real artists; complete={metadata["complete"]}; {error or "OK"}')
    return 0

if __name__=='__main__':sys.exit(main())
