# EPUB Sources: open, public-domain, and DRM-free

Reference list of places to get EPUBs that Skim can legally load, for the planned Store/Catalog feature. Compiled 2026-09-16 from live checks (HTTP status, CORS headers, page content) plus web research. Everything here will drift; re-verify before shipping a source.

**Legend**

- **Mirror OK** = the license lets Skim re-host the files on its own CDN (public domain, CC0, CC-BY variants). "Link-only" = free to read but not to redistribute; the Store can deep-link, not download.
- **CORS** = the file host sends `Access-Control-Allow-Origin: *`, so the browser build can fetch directly. "No" means the Android build must use native HTTP, or the PWA needs a proxy or mirror.
- **Quality** = EPUB markup quality for Skim's parser: hand-edited semantic EPUB3 is best, auto-generated EPUB2 is fine, OCR-derived is poor.

---

## 0. Shortlist for Skim

The sources worth building on first, in order.

| Source | Why | Get files via | Mirror OK | CORS |
|---|---|---|---|---|
| Standard Ebooks | ~1,500 hand-edited EPUB3 classics, CC0. Best quality anywhere. | Per-book download URLs, or clone GitHub repos | Yes | Yes |
| Project Gutenberg | ~79k PD titles; use for breadth after quality filtering | Gutendex API + `/robot/harvest` or rsync mirror | Yes | Metadata yes, files no |
| Wolne Lektury | 7,300 Polish PD/CC works, hand-edited, JSON API | `wolnelektury.pl/api/books/` | Yes | API yes, files no |
| Thoth | GraphQL index of ~2,300 OA scholarly EPUBs with direct URLs | `api.thoth.pub/graphql` | Per-title CC | Yes |
| Open Book Publishers | 450+ CC BY monographs, EPUB free | URLs from Thoth | Yes | Yes |
| Unglue.it | 85k CC/PD titles, OPDS feed, no key | `unglue.it/api/opds/epub/` | Per-title | No |
| Open Textbook Library | 1,900 CC textbooks, JSON API | `open.umn.edu/opentextbooks/textbooks.json` | Per-title | Yes |
| Cory Doctorow, Peter Watts, Charles Stross | Contemporary CC fiction with direct EPUB files | Direct URLs | Yes, non-commercial | No |
| NASA e-Books | US Government PD, EPUB | nasa.gov/ebooks or IA mirror | Yes | No |
| Baen Free Library | 82 in-copyright SF novels, free EPUB | Deep link | Link-only | No |

Standard Ebooks is the only CORS-friendly EPUB file host found. Everything else needs the Capacitor HTTP plugin, a proxy, or pre-mirroring.

---

## 1. Public domain, English, hand-curated

**Standard Ebooks** — https://standardebooks.org — ~1,500 titles (Aug 2026). EPUB3 plus `_advanced.epub`, `.kepub.epub`, `.azw3`. CC0 for their work, texts US-PD. Per-book downloads are free, but the plain download URL returns a donate interstitial page; append `?source=download` to get the EPUB itself (verified: `application/epub+zip`, CORS `*`). Atom new-releases feed public at `/feeds/atom/new-releases`. **OPDS (`/feeds/opds`) and bulk zips return 401, patrons only.** Full source per book on GitHub under `github.com/standardebooks/`, so cloning is the practical mirror route. Mirror OK: yes. CORS: yes on downloads. Quality: best-in-class semantic EPUB3. Alive.

**Faded Page** — https://www.fadedpage.com — 9,132 ebooks. EPUB2, MOBI, PDF, HTML, TXT via `link.php?file=<id>.epub`. PD in Canada (life+50 through the 2022 freeze), so many titles are still copyrighted in the US and EU; check per title before mirroring to a US host. No OPDS or API, no bulk. Hand-proofed by Distributed Proofreaders Canada, auto EPUB build. CORS: no. Alive.

**Project Gutenberg Canada** — http://gutenberg.ca (HTTP only) — ~2k titles, EPUB and HTML, PD-Canada with the same caveat. No feed or API. Still adding pre-freeze authors (last update Feb 2026). CORS: no.

**Project Gutenberg Australia** — https://gutenberg.net.au — 5,000+ titles, mostly TXT/HTML, newer items EPUB/MOBI. PD-Australia. **Stopped adding books 31 Dec 2024**, archive remains. Roy Glashan's Library moved to https://freeread.de (HTML + EPUB). CORS: no.

**MobileRead Library** — https://www.mobileread.com/forums/ebooks.php — 38,324 member uploads, hand-made EPUB/MOBI/PDF/LRF. PD by the uploader's country, so mixed. RSS only, no OPDS. Guest downloads worked in testing. No explicit license on uploads; treat as PD-text-only. CORS: no. Alive.

**Global Grey** — https://www.globalgreyebooks.com — 2,400+ titles, PDF/EPUB/AZW3, hand-formatted by one person. **Terms forbid re-hosting GG files unless all GG branding is removed.** Link-only in practice. No feed or API. CORS: no. Alive.

**Planet eBook** — https://www.planetebook.com — ~150 classics, EPUB/PDF/MOBI, PD-Australia. Site claims all rights reserved on its editions. Cloudflare blocks bots. Tiny. Link-only.

**epubBooks** — https://www.epubbooks.com — curated PD aggregator (PG, PGA, Faded Page, SE), daily updates, historically requires a free account to download. No feed. Low value over the originals.

**Loyal Books** — https://www.loyalbooks.com — 7,000+ PG texts plus LibriVox audio, direct EPUB at `/download/epub/<slug>.epub`. Repackaged Gutenberg; nothing new. CORS: no.

**ManyBooks** — https://manybooks.net — ~50k PG-derived titles, free account required, ads. Cloudflare-walled to non-browser clients; unverified. Low value.

**Delphi Classics (free titles)** — https://www.delphiclassics.com — a handful of free DRM-free EPUBs alongside the paid catalog. Link-only.

## 2. Public domain aggregators, mirrors, and metadata

**Project Gutenberg** — https://www.gutenberg.org — 79,412 ebooks. EPUB3 (`pgNNNN-images-3.epub`), EPUB2, KF8, HTML, TXT. PD; the PG trademark license says strip the PG header and the text is unrestricted. Access: OPDS Atom at `/ebooks.opds/` and `/ebooks/search.opds/?query=` (CORS yes; XML feeds slated to sunset 2027, OPDS2 JSON in testing); per-book RDF at `/ebooks/<id>.rdf`; offline catalogs under `/cache/epub/feeds/` (`pg_catalog.csv` 20 MB weekly, `rdf-files.tar.bz2` 121 MB daily, `today.rss`); harvest with `wget -w 2 -m -H "https://www.gutenberg.org/robot/harvest?filetypes[]=epub.images&langs[]=en"`; rsync from `rsync.ibiblio.org::gutenberg` or `gutenberg.pglaf.org::gutenberg`. Mirroring explicitly permitted (`/help/mirroring.html`). Scraping outside harvest/rsync gets IP-banned. CORS: OPDS yes, EPUB files under `/cache/epub/` no. Quality: auto-generated by `ebookmaker` from volunteer HTML, variable; multiple editions of the same work. Alive.

**PG mirrors** — listed at `/dirs/MIRRORS.ALL`: gutenberg.pglaf.org (HTTPS + rsync), mirror.cs.odu.edu, mirrors.xmission.com, mirror.csclub.uwaterloo.ca, mirrorservice.org (UK, different path layout), rsync.ibiblio.org. aleph.gutenberg.org is HTTP only.

**Gutendex** — https://gutendex.com — JSON API over PG metadata with format URLs, no key, CORS yes. Filters: languages, topic, mime_type, copyright, author years, sort. MIT-licensed and self-hostable (`github.com/garethbjohnson/gutendex`); the public instance has no SLA, so self-host for production. Alive.

**Kiwix Gutenberg ZIMs** — https://download.kiwix.org/zim/gutenberg/ — offline bundles containing EPUBs: `gutenberg_en_all_2025-11.zim` (206 GB), `_de_` 10 GB, `_fr_` 9.8 GB, `_nl_` 3.9 GB, `_mul_` 236 GB. Useful for bulk quality scoring offline.

**Internet Archive (texts)** — https://archive.org — 52M text items, 6.6M with an EPUB derivative; `collection:gutenberg` 59k items, `collection:standardebooks` 82. Mixed licenses; filter by `licenseurl` or collection. Access: `advancedsearch.php` (CORS yes), `/metadata/<id>` (CORS yes), `/download/<id>/<file>` 302s to a `dnNNN.archive.org` host with no CORS. OPDS at `bookserver.archive.org` is dead. Quality: auto-OCR EPUBs, poor for reading. Alive. Controlled-lending items are DRM and shrinking after Hachette v. IA (2024).

**Open Library** — https://openlibrary.org/developers/api — metadata only (`search.json`, works/editions JSON, covers), CORS yes, monthly dumps. Rate limit about 1 req/s anonymous, 3 with a User-Agent that includes contact email. Files come from archive.org. Alive.

**Unglue.it** — https://unglue.it — 85k+ free-licensed and PD titles aggregated from DOAB, OAPEN, Gutenberg, and CC authors. EPUB/PDF/MOBI, many records link out. OPDS at `https://unglue.it/api/opds/epub/` with filters `/by-sa/`, `/kw.fiction/`, `/doab/`; ONIX 3.0 feeds; no key. CORS: no; downloads often 302 to third-party hosts. Run by the Free Ebook Foundation. Alive.

**HathiTrust** — https://www.hathitrust.org — ~18M volumes, ~7M full-view PD. Bib API at `catalog.hathitrust.org/api/volumes/brief/oclc/<n>.json` works with CORS. Whole-book download of Google-digitized volumes needs member login; otherwise page-level PDF/TXT. Web UI Cloudflare-walled. Not practical as an EPUB source.

**Online Books Page (UPenn)** — https://onlinebooks.library.upenn.edu — 3M+ links, directory only.

**Free Speculative Fiction Online** — https://www.freesfonline.net — link directory, no files, updated Mar 2026.

**Europeana** — https://www.europeana.eu — metadata aggregator, API at `api.europeana.eu/record/v2/search.json?wskey=` with CORS; rights per record, files live at providers. Not an EPUB host.

**Wikisource** — https://en.wikisource.org — 636k English texts, PD/CC BY-SA. EPUB via WSExport at `https://ws-export.wmcloud.org/?format=epub-3&lang=en&page=<Title>` or `/api/v1/books/{lang}/{title}?format=epub-3`. **Now behind Anubis proof-of-work; non-browser fetches get Access Denied.** Wikisource REST API (`/api/rest_v1/page/html/`) has CORS; `w/api.php` needs `origin=*`. Repo moved to gitlab.wikimedia.org/toolforge-repos/wsexport. Quality: auto from wikitext, decent. Alive but gated.

**Wikibooks** — https://en.wikibooks.org — 3,296 books CC BY-SA 4.0. HTML; EPUB via WSExport (same gating). The old Wikipedia Book Creator is defunct (removed 2021).

**Perseus Digital Library** — https://www.perseus.tufts.edu/hopper/ — Greek and Latin TEI XML, CC BY-SA 3.0, on GitHub (`PerseusDL/canonical-greekLit`). No EPUB. Alive.

**Sacred Texts** — https://sacred-texts.com — HTML only, Cloudflare-blocked, claims copyright on transcriptions. No EPUB.

**Bartleby.com** — now a paid homework site; the old library is gone. Defunct for this purpose.

**Feedbooks public domain** — **Defunct.** Redirects to Cantook since July 2024; every old OPDS URL is broken.

## 3. Public domain, non-English

### German
**Projekt Gutenberg-DE** — https://projekt-gutenberg.org — ~13,000 texts / ~3,700 works, HTML plus free EPUB per book. **Taken over by tredition 1 Jan 2026; terms say use is exclusively private and redistribution is not permitted.** Link-only, do not mirror. Formerly geo-blocked US IPs; US fetches now return 200. Hand-proofed HTML, auto EPUB. CORS: no.
**Zeno.org** — http://www.zeno.org — huge gemeinfrei HTML corpus, no EPUB, no API, HTTP only.
**Deutsches Textarchiv** — https://www.deutschestextarchiv.de — 5,483 works, TEI/TXT, CC BY-SA 4.0, API, JS cookie challenge on book pages. No EPUB.
**TextGrid Digitale Bibliothek** — 96k TEI texts (Zeno-derived), CC BY 3.0, bulk XML. No EPUB.
**Kiwix `gutenberg_de`** — easiest bulk German PD EPUB set.

### French
**Ebooks libres et gratuits (ELG)** — https://www.ebooksgratuits.com — 3,248 titles, EPUB/MOBI/PDF/HTML/ODT, PD, free for non-commercial use. OPDS at `https://www.ebooksgratuits.com/opds/feed.php`; direct EPUB at `/epub/<slug>.epub`. Hand-made EPUB2. CORS: no. Alive.
**BEQ (Bibliothèque électronique du Québec)** — https://beq.ebooksgratuits.com — 2,840 volumes, EPUB/MOBI/PDF, PD, hand-made, no feed.
**Bibliothèque numérique romande** — https://ebooks-bnr.com — 1,475 EPUBs (Sept 2026), non-commercial use, OPDS at `https://ebooks-bnr.com/opds/`. Hand-made. CORS: no.
**Bibebook** — https://www.bibebook.com — 1,700+ EPUB/PDF/HTML, CC BY-SA, sourced from ELG and Wikisource; static site, low activity.
**noslivres.net** — union catalog of 15 French PD libraries, 26,001 entries (Jan 2026), RSS and TSV/OPDS.
**Gallica** — https://gallica.bnf.fr — millions of scans, SRU API, EPUB export for OCR'd books, **but every non-browser request hits a bot check.** Non-commercial reuse free. Not usable client-side.

### Italian, Spanish, Portuguese
**Liber Liber** — https://liberliber.it — ~4,000 ebooks (Manuzio), EPUB/PDF/ODT/HTML. Texts PD but Liber Liber editions are CC BY-NC-SA per book. No OPDS or API. CORS: no.
**Biblioteca Virtual Miguel de Cervantes** — https://www.cervantesvirtual.com — ~200k records, HTML/PDF, ~700 EPUB, OAI-PMH; BVMC editions are non-commercial. CORS: no.
**textos.info** — https://www.textos.info — 6,000+ Spanish PD books, EPUB/PDF/MOBI, community-run, no feed.
**Elejandría** — https://www.elejandria.com — 2,312 books, PDF/EPUB/MOBI, PD.
**Domínio Público (Brazil)** — https://www.dominiopublico.gov.br — ~200k items, almost all PDF, Cloudflare-walled, effectively unmaintained. Low value.
**eBooksBrasil** — http://www.ebooksbrasil.org — old volunteer site, custom non-commercial license, HTML/PDF/some EPUB.
**Literatura Brasileira (UFSC)** — https://literaturabrasileira.ufsc.br — 86k records, HTML/PDF.
**SciELO Books** — see section 4.

### Nordic and Dutch
**Runeberg (Lysator)** — https://runeberg.org — 3.5M pages of Nordic PD scans and OCR, HTML/TXT, **no EPUB**, went static in 2025 because of AI bots. Mirroring tolerated.
**Litteraturbanken (SE)** — https://litteraturbanken.se — 1,597 e-texts, API at `/api/list_all/etext`, EPUB downloads, PD texts with site-terms restrictions on editions.
**Bokselskap (NO)** — https://www.bokselskap.no — 400+ works, EPUB/MOBI/PDF/HTML, PD, free.
**tekster.kb.dk / ADL (DK)** — 10,598 items, TEI, Royal Library API; most texts limited to private use via Copydan; only a subset PD. No EPUB.
**Heimskringla.no** — 9,100 Old Norse titles, MediaWiki, no EPUB. **Netútgáfan (IS)** — https://www.snerpa.is/net/ — small HTML-only. **Bókmenntir.is** — literature portal, not an ebook source.
**DBNL (NL)** — https://www.dbnl.org — large Dutch corpus, EPUB for PD titles in the e-books collection, no public API. Kiwix `gutenberg_nl` is easier.

### Central and Eastern Europe
**Wolne Lektury (PL)** — https://wolnelektury.pl — 7,326 works, EPUB/MOBI/PDF/FB2/TXT/HTML at `/media/book/epub/<slug>.epub`. PD or CC BY-SA 4.0; redistribution and commercial use OK with attribution. JSON API at `https://wolnelektury.pl/api/books/` (CORS yes), OPDS at `/opds/` (no CORS), files no CORS. Source on GitHub (`fnp/wolnelektury`). Hand-edited, good EPUB2. Alive. The best non-English source found.
**MEK (HU)** — https://mek.oszk.hu — ~25k docs, per-doc EPUB/PDF/HTML, OAI-PMH, mixed PD/permission.
**MLP e-knihovna (CZ)** — https://www.mlp.cz — ~2k free Czech classics, EPUB/PDF/PRC, JS-driven catalog.
**lib.ru (RU)** — http://lib.ru — 21,200 texts, TXT/HTML, OPDS at `http://lib.ru/opds/`, HTTP only, **mixed copyright (much by author permission)**. Handle with care.

### Japanese, Chinese, Indian
**Aozora Bunko** — https://www.aozora.gr.jp — 17,840 works (17,352 PD, 488 CC). Ruby-annotated TXT zip and XHTML, no native EPUB; convert with AozoraEpub3. PD works explicitly allow copy, redistribution, modification, and commercial use. Git mirror at `github.com/aozorabunko/aozorabunko`, tooling at `github.com/aozorahack`. CORS: no. Alive.
**Chinese Text Project** — https://ctext.org — 30k pre-modern titles, HTML/API, automatic download prohibited, no EPUB.
**Haodoo 好讀** — https://www.haodoo.org — relaunched Jul 2025, reader-made EPUB/PRC of Chinese classics, mixed copyright, no license statement. Risky.
**Chinese Wikisource** — 3.88M pages, same WSExport path as English.
**Digital Library of India** — original site defunct; scans at https://archive.org/details/digitallibraryindia (578k items, PDF plus IA auto-EPUB, rights uncertain).
**StoryWeaver** — https://storyweaver.org.in — ~60k CC BY children's stories, PDF/EPUB, login to download.
**Book Dash** — https://bookdash.org — ~250 CC BY 4.0 picture books, PDF/EPUB, no login.

## 4. Open access academic and textbooks

Most OA publishing is PDF-first. EPUB availability is noted per source. For Skim, harvest EPUB URLs through Thoth, DOAB, OAPEN, or unglue.it rather than scraping publishers.

### Aggregators
**Thoth** — https://thoth.pub, GraphQL at `https://api.thoth.pub/graphql` — ~25k works from 90+ OA presses (OBP, punctum, LSE Press, African Minds, meson…), ~2,300 EPUB publications with direct `fullTextUrl`. Per-work CC license in metadata. CORS enabled. ONIX/MARC/KBART exports. **Best programmatic source of OA EPUB URLs.**
**DOAB** — https://directory.doabooks.org — ~33k OA books, metadata only, files at publisher or OAPEN. REST at `/rest/search?query=dc.type:book&expand=metadata`, OAI-PMH at `/oai/request`. Metadata CC0. CORS: no.
**OAPEN Library** — https://library.oapen.org — ~30k OA books, mostly PDF, minority EPUB (facet `format:epub`). DSpace REST at `/rest/search?query=…&expand=bitstreams,metadata`, OAI-PMH, CSV/ONIX/MARC. Bitstreams bot-blocked, no CORS.
**Open Textbook Library** — https://open.umn.edu/opentextbooks — 1,879 textbooks, CC, PDF/EPUB/online varies. JSON API at `/opentextbooks/textbooks.json?page=N` with CORS `*`, RSS/Atom, OpenAPI docs at `/api-docs/`. Files hosted externally.
**Pressbooks Directory** — https://pressbooks.directory — ~9k public books, each network exports EPUB/PDF/HTML. API at `/api/v1/books` is Cloudflare-blocked to bots; per-network WP REST at `/wp-json/pressbooks/v2/`.
**Open Research Library (Knowledge Unlatched)** — https://openresearchlibrary.org — ~7k OA books, in-browser/PDF, JS app, no API. KU moved to Annual Reviews in 2025 and is a funder, not a host; find its titles via OAPEN/DOAB.
**JSTOR OA books** — 15k+ OA titles, PDF only, no API. Harvest via DOAB.
**Project MUSE OA** — 4k+ titles, mostly chapter PDF, some EPUB. No API.
**Internet Archive CC texts** — `advancedsearch.php?q=mediatype:texts AND licenseurl:*creativecommons*&output=json`, CORS yes.

### Publishers with free EPUB
**Open Book Publishers** — https://www.openbookpublishers.com — 450+ titles CC BY, PDF/HTML/XML/EPUB free. EPUB at `books.openbookpublishers.com/10.11647/obp.NNNN.epub`, host sends CORS `*`. URLs via Thoth. Main site rate-limits bots.
**punctum books** — https://punctumbooks.com — ~400 titles CC BY-NC-SA, PDF free, EPUB for many via Thoth, files at `books.punctumbooks.com`.
**Ubiquity Press** — https://www.ubiquitypress.com/site/books/ — few hundred, CC BY / BY-NC, PDF/EPUB/MOBI free.
**Language Science Press** — https://langsci-press.org — 389 titles CC BY, PDF, some EPUB, sources on GitHub.
**ANU Press** — https://press.anu.edu.au — 1,000+ titles, PDF/HTML/EPUB/MOBI free without registration, CC BY-NC-ND typical.
**UCL Press** — https://uclpress.co.uk — 477 books, CC BY, PDF/HTML free, accessible EPUB3 for all new titles since Sept 2024, backlist conversion targeted end-2026.
**Springer Nature OA books** — https://link.springer.com — 2,000+ OA books, HTML/PDF/EPUB full-book download, CC BY-NC-ND default. Metadata API at dev.springernature.com (key). Apress OA titles included.
**Frontiers eBooks** — https://www.frontiersin.org/books — thousands of Research-Topic ebooks CC BY, PDF and EPUB, redistribution explicitly allowed. In DOAB.
**SciELO Books** — https://books.scielo.org — ~1,600 books, 62% OA, CC BY / BY-NC, EPUB and PDF, OAI-PMH. Portuguese and Spanish.
**Manchester University Press OA** — https://manchesteropenhive.com — DRM-free PDF and EPUB, CC BY-NC-ND.
**Leuven University Press OA** — https://lup.be/open-access/ — ePDF + EPUB since 2024, CC BY-NC-ND, on OAPEN/JSTOR/MUSE.
**Amsterdam University Press OA** — https://www.aup.nl/en/open-access/books — EPUB added for OA books from 2025, CC BY-NC-ND.
**Milne Open Textbooks (SUNY)** — https://milneopentextbooks.org — ~100 titles CC BY, PDF + EPUB, RSS.
**BCcampus Open Collection** — https://collection.bccampus.ca — 400+ textbooks, EPUB/PDF/web, mostly CC BY, Pressbooks REST per book. Also re-exports OpenStax as EPUB.
**NASA e-Books** — https://www.nasa.gov/ebooks/ — ~40–100 titles, EPUB/MOBI/PDF, US Government PD (some third-party images excepted). IA mirror at `archive.org/details/nasa-ebooks_202111`. Updated Aug 2026.
**Athabasca University Press** — https://www.aupress.ca — 200+ books CC BY-NC-ND, free PDF; free EPUB not confirmed.
**De Gruyter Brill OA** — ~10,000 OA books, mostly PDF, some EPUB, no open API. Harvest via DOAB.
**OpenEdition Books** — https://books.openedition.org — 16.5k books, >50% OA as HTML; EPUB/PDF only for the fully-open subset. OAI-PMH at `https://oai.openedition.org`.

### PDF-only or effectively so (not useful until Skim's PDF path improves)
OpenStax (EPUB discontinued), LibreTexts, MIT Press Direct to Open, Cambridge Open, Bloomsbury Open, TU Delft OPEN Books, Érudit, National Academies Press (free PDF, not redistributable), Smithsonian Scholarly Press, FSF/GNU Press, O'Reilly Open Books, arXiv, PhilPapers/PhilArchive. DOAJ is journals only.

## 5. Creative Commons contemporary fiction and nonfiction

**Cory Doctorow** — https://craphound.com — ~15 novels and collections, EPUB/MOBI/PDF/HTML/TXT as direct files (e.g. `craphound.com/littlebrother/Cory_Doctorow_-_Little_Brother.epub`). CC BY-NC-SA, some BY-NC-ND. Mirror OK non-commercially. CORS: no. Also in Skim's starter shelf already.
**Charles Stross, Accelerando** — https://www.antipope.org/charlie/blog-static/fiction/accelerando/accelerando-intro.html — EPUB/MOBI/HTML/PDF, CC BY-NC-ND 2.5. Site has an invalid TLS chain for strict clients. Also on unglue.it.
**Peter Watts** — https://www.rifters.com/real/shorts.htm — Blindsight, the Rifters trilogy, 20+ shorts. EPUB/HTML/PDF, CC BY-NC-SA 2.5.
**Lawrence Lessig** — https://lessig.org/product/free-culture/ — Free Culture (CC BY-NC), Code 2.0 (CC BY-SA), Remix (CC BY-NC). PDF/HTML; EPUB via community builds and unglue.it.
**Escape Artists** (Escape Pod, PseudoPod, PodCastle, Cast of Wonders) — full story text CC BY-NC-ND, no EPUB files, scrapeable, RSS. Live June 2026.
**Leanpub free tier** — https://leanpub.com — many minimum-price-free PDF/EPUB books; license is author-chosen, some CC. Per-book license check required.
**Free Ebook Foundation** — https://ebookfoundation.org — runs unglue.it, free-programming-books (links only), and Gutenberg's EPUB3 tooling. Use unglue.it as the entry point.

## 6. Free to read, link-only (no redistribution rights)

Skim can deep-link these and let the user import the file; it cannot mirror them.

**Baen Free Library** — https://www.baen.com/categories/free-library.html — 82 in-copyright SF titles, EPUB/MOBI/HTML, no account. Read-only grant.
**Reactor (Tor.com) eBook Club** — https://reactormag.com/tag/ebook-club/ — monthly time-limited free EPUB, email signup, US/CA only. Cloudflare-blocked to bots.
**Smashwords free tier** — https://www.smashwords.com — ~100k free DRM-free EPUBs; ToS forbids third-party hosting. Store-only since Jan 2026.
**Obooko** — https://www.obooko.com — thousands of indie PDF/EPUB, account required, no re-hosting.
**Global Grey, Projekt Gutenberg-DE, Planet eBook** — see sections 1 and 3.
**Magazines** — Lightspeed, Clarkesworld, Uncanny, Strange Horizons publish free HTML; EPUB issues are paid or Patreon-gated. Beneath Ceaseless Skies EPUBs are now Patreon-only, older issues on IA. None are CC.
**Book View Café** — https://bookviewcafe.com — author co-op store, DRM-free paid, occasional free titles. Not a free source.

## 7. Paid DRM-free stores and publishers

None of these offers a buyer-side download API. The integration for all of them is affiliate link out, user buys, user imports the file. Grouped by how reliably you get a raw EPUB.

### Everything DRM-free
**Baen Ebooks** — https://www.baen.com — all titles DRM-free EPUB and more, re-downloadable forever. Plain HTML catalog.
**Leanpub** — https://leanpub.com — no DRM, PDF/EPUB. Author API only.
**Manning** — https://www.manning.com/ebooks — DRM-free PDF + EPUB, personal use.
**Pragmatic Bookshelf** — https://pragprog.com — DRM-free EPUB/PDF/MOBI. Historically exposed OPDS at `pragprog.com/catalog.opds`; verify.
**No Starch Press** — https://nostarch.com — DRM-free PDF/EPUB/MOBI.
**Angry Robot** — https://angryrobotbooks.com — DRM-free at all retailers; own store sells EPUB.
**Subterranean Press** — https://subterraneanpress.com/all-books/ebooks/ — DRM-free EPUB; free ebooks at `/free-ebooks/`.
**Weightless Books** — https://weightlessbooks.com — SFF, small press, magazines; DRM-free EPUB/PDF.
**Smashwords (Draft2Digital)** — https://www.smashwords.com — pure DRM-free storefront since Jan 2026; affiliate program; no catalog API.
**Delphi Classics** — https://www.delphiclassics.com — DRM-free EPUB collected editions.
**Wizard's Tower Press** — https://wizardstowerpress.com/shop/ — DRM-free, region-free EPUB; Payhip for non-UK.
**Tor Publishing Group** — DRM-free at every retailer since 2012, including Amazon (now downloadable as EPUB under the KDP change). No direct store; buy at Kobo or Amazon and export.
**Verso Books** — https://www.versobooks.com — watermarked DRM-free EPUB when bought direct; DRM at Amazon/Apple/Google. Free ebook collection exists.
**Apress / Springer Nature** — https://link.springer.com — watermarked PDF and EPUB, no hard DRM.
**Packt** — https://www.packtpub.com — DRM-free but PDF-first; EPUB not guaranteed.
**Humble Bundle (Books)** — https://www.humblebundle.com/books — pay-what-you-want DRM-free EPUB/PDF/MOBI bundles. Personal use only.
**StoryBundle** — https://storybundle.com — rotating DRM-free EPUB/MOBI bundles.

### Creator platforms (DRM-free by construction, quality varies)
**Gumroad** — https://gumroad.com/fiction-books?tags=ebook — raw seller files; seller API only.
**itch.io Books** — https://itch.io/books/tag-drm-free — raw downloads, DRM-free tag; no catalog search API.
**Payhip** — https://payhip.com — raw files, optional PDF stamping only.
**Ko-fi Shop** — https://ko-fi.com — raw digital downloads.
**Patreon** — creator attachments; API v2 is not a book catalog.

### DRM-free subset only
**Kobo** — https://www.kobo.com/us/en/p/drm-free — only titles marked DRM-free export as raw EPUB from My Books; the rest is Adobe DRM or KEPUB. Affiliate via Rakuten Advertising, 6% on ebooks, 14-day cookie.
**eBooks.com** — https://www.ebooks.com/en-us/drm-free-epub/ — DRM-free EPUB filter on search; per-format restrictions on product pages. Affiliate in-house 8–15%, 45-day cookie.
**Bookshop.org ebooks** — https://bookshop.org — ~600k titles, read in the Bookshop app; only publisher-flagged DRM-free titles get a Download/Transfer button. Curated list at `bookshop.org/lists/drm-free-ebooks`. Kobo integration announced, not launched as of Sept 2026. Affiliate 10%, no search API.
**Tolino / Thalia (DE)** — per-title "Kopierschutz: ja/nein"; many watermark-only raw EPUB, others Adobe DRM. Manual download.

### Directories of DRM-free shops
**Libreture** — https://libreture.com/bookshops/ — the best directory, 543 live shops as of 2026. Also cloud storage for DRM-free ebooks. No API.
**getbookshelves.app guide** — https://getbookshelves.app/guides/drm-free-ebook-stores/ — curated 2026 list.

## 8. Big-marketplace exports (manual only)

**Amazon Kindle** — https://kdp.amazon.com/en_US/help/topic/GDDXGH9VR22ACM8U — since 20 Jan 2026 verified purchasers can download EPUB/PDF of DRM-free titles from Manage Your Content and Devices. Automatic for books published after 9 Dec 2025 without DRM; older titles need author opt-in; Kindle Unlimited borrows excluded. No buyer API. Download & Transfer via USB was removed Feb 2025. Affiliate: PA-API 5.0 sunset 15 May 2026, replaced by the Creators API (catalog search only, needs 10 qualified sales in the trailing 30 days).
**Google Play Books** — https://support.google.com/googleplay/answer/179863 — export gives EPUB/PDF only when the publisher allows; otherwise an ACSM (Adobe DRM) file. Books API v1 gives metadata and the user's library list with OAuth, never purchased files.
**Apple Books** — FairPlay DRM by default, no export path. Exclude.
**Barnes & Noble Nook** — DRM. Exclude.
**Bol.com (NL), Vivlio (FR), Greek stores** — Adobe DRM or LCP. Exclude.

## 9. Self-hosted and personal library servers

All serve raw EPUBs the user already owns. A generic OPDS client in Skim covers every row marked Yes.

| Server | URL | OPDS | Notes |
|---|---|---|---|
| Calibre content server | https://manual.calibre-ebook.com/generated/en/calibre-server.html | Yes, `/opds` | Auto-on, basic auth |
| Calibre-Web | https://github.com/janeczku/calibre-web | Yes, `/opds` | Per-user auth, Kobo sync endpoint |
| Calibre-Web Automated | https://github.com/crocodilestick/Calibre-Web-Automated | Yes | Adds auto-import and convert; active 2026 |
| Kavita | https://www.kavitareader.com | Yes, per-user API key | Ebooks and comics, OPDS-PSE |
| Komga | https://komga.org | Yes, OPDS 1.2 and 2.0 | Comics-first, EPUB supported |
| COPS | https://github.com/mikespub-org/seblucas-cops | Yes | PHP read-only front for a Calibre DB |
| BookLore | https://github.com/adityachandelgit/BookLore | Yes | Newer Java server, KOReader sync |
| Ubooquity | https://vaemendis.net/ubooquity/ | Yes | Closed-source, low activity, paging bug |
| Storyteller | https://storyteller-platform.dev | Unverified | EPUB3 media-overlay producer |
| BookFusion | https://www.bookfusion.com | No | Hosted SaaS |
| Nextcloud epubreader | https://apps.nextcloud.com/apps/epubreader | No | Likely unmaintained; WebDAV is the API |

## 10. Metadata and catalog APIs

**Gutendex** — see section 2. Free, no key, CORS, self-hostable.
**Open Library API** — see section 2. Free, CORS, rate-limited.
**Google Books API** — https://developers.google.com/books/docs/v1/using — metadata, API key, ~1,000 req/day default. ToS limits caching and requires attribution. Public-domain EPUB download link exists for PD volumes only.
**Inventaire** — https://api.inventaire.io (docs at https://data.inventaire.io) — Wikidata-federated book entities, ISBN lookup, open data. Active.
**Wikidata** — SPARQL at query.wikidata.org, CC0; edition coverage thin.
**OpenBD** — https://openbd.jp — free Japanese ISBN metadata, promotional-use terms.
**ISBNdb** — https://isbndb.com — paid, $14.99–$299.99/mo.
**HathiTrust Bib API** — see section 2.
**Europeana API** — see section 2.
**WorldCat Search API v2** — requires OCLC subscriptions; v1 shut off Jan 2025. Exclude.
**BookWyrm** — no REST API, ActivityPub only. Low value.
**OPDS directories** — `https://github.com/opds-community/awesome-opds` and the live-checked `https://opdshome.uo1.net/`. The old `opds-spec.org/catalogs/` list is 2010–2016 era with an expired cert; ignore it. `https://github.com/getbookshelves/opds-catalog` is a good explainer.
**OPDS spec** — 1.2 is the interoperable baseline (https://specs.opds.io/opds-1.2.html); 2.0 JSON is a draft implemented by Komga and Palace.

## 11. Not usable

- **Library lending**: OverDrive/Libby, Hoopla, cloudLibrary, Internet Archive controlled lending, Open Library borrow, Palace Project (LCP), Palace Marketplace, BiblioBoard. All DRM or in-app only.
- **Defunct**: Feedbooks PD, Bartleby library, original Digital Library of India, IA OPDS bookserver, Wikipedia Book Creator, Ebooks Direct (no value), Readarr (retired June 2025, piracy-adjacent).
- **Bot-walled beyond use**: Gallica, WSExport (Anubis), HathiTrust web, ManyBooks, Domínio Público.

---

## Appendix A: CORS matrix

Hosts that send `Access-Control-Allow-Origin: *` on the thing you actually need.

| Need | CORS yes | CORS no (use native HTTP, proxy, or mirror) |
|---|---|---|
| EPUB files | Standard Ebooks, Open Book Publishers file host | Project Gutenberg, Internet Archive, Wolne Lektury, ELG, BNR, Faded Page, Aozora, Loyal Books, PG mirrors, craphound, rifters |
| Metadata / search | Gutendex, PG OPDS, IA advancedsearch and metadata, Open Library, Thoth, Open Textbook Library, Wolne Lektury API, HathiTrust Bib, Europeana, Wikisource REST | DOAB, OAPEN, unglue.it OPDS, ELG OPDS, Standard Ebooks Atom |

## Appendix B: redistribution red flags

Do not mirror: Projekt Gutenberg-DE (private use only since tredition takeover), Global Grey (must strip branding), Baen, Reactor eBook Club, Smashwords, Obooko, Planet eBook, National Academies Press. Non-commercial only: Liber Liber editions, Cervantes Virtual editions, ELG, BNR, Doctorow/Stross/Watts (CC-NC). Jurisdiction-dependent PD: Faded Page, Gutenberg Canada, Gutenberg Australia (Canadian/Australian terms; check US status before hosting in the US). Mixed or unclear: MobileRead uploads, lib.ru, Haodoo, ADL (Copydan).

## Appendix C: implications for the Skim catalog

1. Mirror Standard Ebooks wholesale from GitHub. It is CC0, ~1,500 titles, and the only source with clean EPUB3 at scale.
2. Bulk-fetch Gutenberg via rsync or the Kiwix ZIM, run Skim's own quality score over it offline, keep the best edition per work, and mirror only those.
3. Add Wolne Lektury, ELG, BNR, Aozora (converted), and NASA as language and genre expansions with the same offline pipeline.
4. Pull OA EPUB URLs from Thoth and Open Textbook Library for a nonfiction and textbook shelf.
5. Ship a generic OPDS client for the self-hosted servers in section 9 and for unglue.it.
6. Everything in sections 6 through 8 is a link-out plus "import the file you downloaded."
