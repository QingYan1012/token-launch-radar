// Token Radar's dashboard (radar-2). It reads window.RADAR (written beside dashboard/ by main.ts)
// and renders the ranked board, a filterable table, a per-protocol detail drawer with the model's
// own inputs and the protocol's farm plan. No network: every byte it shows is in data.js.
//
// What is new against the starter: a chain filter and a watchlist-only toggle, a highlights strip
// (the top three, the biggest seven-day mover and the newest pre-token protocol), a sector table
// that shows the market's own multiple per sector, and a detail view that breaks the implied value
// into its sector, growth, maturity and chain parts. The page recomputes every row from the
// snapshot figures, so the page's code and the board's data are visibly the same arithmetic.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('board');
  var state = { q: '', category: 'all', chain: 'all', watchlistOnly: false, starredOnly: false, tab: 'pre-token', sort: 'implied', dir: -1, selected: null, compare: new Set(), compareNote: '', starred: new Set() };

  // Starred protocols: the reader's own shortlist, kept in localStorage under
  // token-radar-starred as an array of slugs. It is separate from the board's
  // watchlist, which comes from the snapshot, and it survives reloads.
  var STAR_KEY = 'token-radar-starred';
  function loadStarred() {
    try {
      var raw = window.localStorage.getItem(STAR_KEY);
      if (!raw) return new Set();
      var parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return new Set();
      return new Set(parsed.filter(function (s) { return typeof s === 'string'; }));
    } catch (e) { return new Set(); }
  }
  function saveStarred() {
    try { window.localStorage.setItem(STAR_KEY, JSON.stringify(Array.from(state.starred))); }
    catch (e) { /* private mode: stars last for this visit only */ }
  }
  function isStarred(slug) { return state.starred.has(slug); }
  function toggleStarred(slug) {
    if (state.starred.has(slug)) state.starred.delete(slug);
    else state.starred.add(slug);
    saveStarred();
    render();
  }
  function starredCount() { return state.starred.size; }
  state.starred = loadStarred();

  var usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd.format(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }
  // The model in one function: the page recomputes a row from the snapshot figures and checks the
  // number board.json carries, so the page's code and the board's data are visibly the same arithmetic.
  // The sector multiple is the row's own: the median market-cap-per-dollar-of-TVL of its sector's
  // live-token protocols, or the global median where its sector has too few to measure.
  function impliedOf(row, model) {
    var growth = Math.min(model.growth_cap, Math.max(model.growth_floor, row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d));
    var growthMult = 1 + (growth / 100) * model.growth_weight;
    var age = row.age_days === null || row.age_days === undefined ? model.unknown_age_days : row.age_days;
    var maturity = model.maturity_floor + (Math.min(Math.max(age, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
    var chainMult = row.chain_multiplier === null || row.chain_multiplier === undefined ? 1 : row.chain_multiplier;
    var sector = row.sector_multiple === null || row.sector_multiple === undefined ? 1 : row.sector_multiple;
    return Math.max(1, Math.round(row.tvl_usd * sector * growthMult * maturity * chainMult));
  }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k === 'html') node.innerHTML = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }

  // The farm plan is the same derivation main.ts writes to board.json: category, chains, TVL and age
  // decide the actions, the capital, the hold and every cost and time. No name is special-cased.
  function chainOf(p) { return p.chains && p.chains.length > 0 ? p.chains[0] : 'its main chain'; }
  function capitalFor(p) {
    if (p.tvl_usd >= 5e9) return 250;
    if (p.tvl_usd >= 1e9) return 150;
    if (p.tvl_usd >= 1e8) return 100;
    return 50;
  }
  function holdDaysFor(age) {
    if (age === null || age === undefined) return 30;
    if (age < 180) return 60;
    if (age < 365) return 45;
    return 30;
  }
  function actionFor(p, capital, chain) {
    var c = (p.category || '').toLowerCase();
    var name = p.name;
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Supply $' + capital + ' of USDC to ' + name + ' on ' + chain + ' and keep the position open.';
    if (c.indexOf('dex') >= 0 || c.indexOf('yield') >= 0 || c.indexOf('leveraged farm') >= 0) return 'Provide $' + capital + ' of liquidity to ' + name + "'s main pool on " + chain + ' and keep the position open.';
    if (c.indexOf('bridge') >= 0) return 'Bridge $' + capital + ' of USDC to ' + chain + ' through ' + name + ' and use the bridged funds in its app.';
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) return "Stake $" + capital + " of the chain's staking asset through " + name + ' and keep the receipt token.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0) return 'Deposit $' + capital + ' of USDC as margin on ' + name + ' and open one small hedge.';
    if (c.indexOf('prediction') >= 0) return 'Fund $' + capital + ' and place one market position on ' + name + '.';
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0) return 'Deposit $' + capital + ' into a ' + name + ' vault on ' + chain + ' and keep the shares.';
    if (c.indexOf('stable') >= 0) return 'Mint or deposit $' + capital + ' of the stable asset through ' + name + ' on ' + chain + '.';
    if (c.indexOf('rwa') >= 0) return "Mint $" + capital + " of the protocol's yield asset on " + chain + ' and hold it.';
    if (c.indexOf('insurance') >= 0) return 'Buy $' + capital + ' of cover from ' + name + ' on ' + chain + ' and keep the policy.';
    if (c.indexOf('basis') >= 0) return "Deposit $" + capital + " of USDC into " + name + "'s basis vault on " + chain + ' and keep the position.';
    if (c.indexOf('options') >= 0) return 'Deposit $' + capital + ' of USDC as collateral on ' + name + ' and write one small covered position.';
    return 'Deposit $' + capital + ' of USDC into ' + name + ' on ' + chain + ' and keep the position open.';
  }
  function secondActionFor(p, capital, chain) {
    var c = (p.category || '').toLowerCase();
    var name = p.name;
    var half = Math.max(25, Math.round(capital / 2));
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Borrow $' + half + ' against the deposit on ' + name + ' and put it back to work in the same market.';
    if (c.indexOf('dex') >= 0 || c.indexOf('yield') >= 0 || c.indexOf('leveraged farm') >= 0) return 'Add $' + half + ' to a second pool on ' + name + ' so the activity spans two markets.';
    if (c.indexOf('bridge') >= 0) return 'Bridge $' + half + ' back through ' + name + ' a week later so the round trip is on record.';
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) return 'Restake the receipt token through ' + name + ' if it offers a second layer, and keep the new receipt.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0) return 'Close the hedge and open a second small position on ' + name + ' the following week.';
    if (c.indexOf('prediction') >= 0) return 'Settle the first market and place a second position on ' + name + ' in a different market.';
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0) return 'Deposit $' + half + ' into a second ' + name + ' vault with a different strategy.';
    if (c.indexOf('stable') >= 0) return 'Use $' + half + " of the minted stable asset in " + name + "'s own lending market.";
    if (c.indexOf('rwa') >= 0) return 'Reinvest the yield the first position pays into the same ' + name + ' asset.';
    if (c.indexOf('insurance') >= 0) return 'Renew the cover before it lapses so the policy history stays unbroken.';
    if (c.indexOf('basis') >= 0) return 'Top the basis vault up by $' + half + ' after the first funding round settles.';
    if (c.indexOf('options') >= 0) return 'Roll the covered position once before expiry instead of letting it lapse.';
    return 'Repeat the deposit with $' + half + ' a week later so the activity spans two dates.';
  }
  function stepText(step) {
    var s = step.text + ' Cost: ' + step.cost + '. Time: ' + step.time + '.';
    if (s.length > 600) s = s.slice(0, 596) + '...';
    if (s.length < 20) s = s + " Hold the position and check the protocol's own page.";
    return s;
  }
  function farmSteps(p) {
    var chain = chainOf(p);
    var capital = capitalFor(p);
    var hold = holdDaysFor(p.age_days);
    var others = p.chains && p.chains.length > 1 ? ' It also runs on ' + p.chains.slice(1, 3).join(', ') + ', so repeat the position there if the gas is cheap.' : '';
    return [
      { text: 'Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.', cost: 'under $3 of gas for the first transaction', time: '5 minutes' },
      { text: actionFor(p, capital, chain), cost: '$' + capital + ' of capital and about $' + (capital >= 150 ? 8 : 4) + ' of gas', time: '15 minutes to set up' },
      { text: secondActionFor(p, capital, chain) + others, cost: 'about $' + Math.max(25, Math.round(capital / 2)) + ' of extra capital and $2 to $5 of gas', time: '10 minutes' },
      { text: 'Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote.', cost: 'about $2 of gas a week', time: '10 minutes a week' },
      { text: 'Hold the position for at least ' + hold + ' days so the activity is counted in more than one snapshot.', cost: 'the $' + capital + ' stays in the position', time: hold + ' days' },
      { text: "Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes.", cost: 'no fee to check, and never pay to claim', time: '10 minutes' },
      { text: "Watch " + p.name + "'s own announcements for a token or points update, and ignore claim links that arrive by message or email.", cost: 'nothing to watch', time: '5 minutes a week' },
      { text: 'Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it.', cost: 'nothing but the log', time: '5 minutes' }
    ].map(stepText);
  }

  // Protocol comparison: pick at most two rows and see them side by side.
  // The choice lives in a Set of slugs so a row can never be picked twice,
  // and the panel only appears once exactly two are picked.
  function rowBySlug(slug) {
    return DATA.rows.filter(function (r) { return r.slug === slug; })[0] || null;
  }
  function toggleCompare(slug, picked) {
    if (picked) {
      if (state.compare.size >= 2) {
        state.compareNote = 'Compare holds at most two protocols — clear one first.';
        render();
        return;
      }
      state.compare.add(slug);
      state.compareNote = '';
    } else {
      state.compare.delete(slug);
      state.compareNote = '';
    }
    render();
  }
  function clearCompare() {
    state.compare.clear();
    state.compareNote = '';
    render();
  }
  function leadLine(label, a, b, valueOf, fmt) {
    var va = valueOf(a), vb = valueOf(b);
    if (va === null || va === undefined || vb === null || vb === undefined || !isFinite(va) || !isFinite(vb)) return label + ': not comparable here.';
    if (va === vb) return label + ': tied at ' + fmt(va) + '.';
    var lead = va > vb ? a : b, trail = va > vb ? b : a;
    var top = va > vb ? va : vb, bottom = va > vb ? vb : va;
    return label + ': ' + lead.name + ' leads ' + trail.name + ' (' + fmt(top) + ' vs ' + fmt(bottom) + ').';
  }
  function compareCard(row) {
    function fact(label, value) {
      return el('div', { class: 'cmp-fact' }, el('span', { text: label }), el('b', { class: 'num', text: value }));
    }
    return el('article', { class: 'cmp-card' },
      el('h3', { text: '#' + row.rank + ' ' + row.name }),
      el('p', { class: 'sub', text: (row.category || 'Other') + ' · ' + (row.chains || []).join(', ') }),
      fact('TVL', fmtUsd(row.tvl_usd)),
      fact('7-day change', fmtPct(row.change_7d)),
      fact('Chains', String((row.chains || []).length)),
      fact('Implied value', fmtUsd(row.implied_value_usd)),
      fact('Rank', '#' + row.rank),
      fact('Farm steps', String(farmSteps(row).length))
    );
  }
  function syncComparePanel() {
    var slot = document.getElementById('compare-panel');
    if (!slot) return;
    slot.textContent = '';
    if (state.compare.size < 2) {
      if (!state.compareNote) { slot.hidden = true; return; }
      slot.hidden = false;
      slot.appendChild(el('p', { class: 'cmp-hint', text: state.compareNote }));
      return;
    }
    var picked = Array.from(state.compare).map(rowBySlug).filter(Boolean);
    if (picked.length < 2) { slot.hidden = true; return; }
    var a = picked[0], b = picked[1];
    var verdicts = [
      leadLine('TVL', a, b, function (r) { return r.tvl_usd; }, fmtUsd),
      leadLine('Implied value', a, b, function (r) { return r.implied_value_usd; }, fmtUsd),
      leadLine('7-day growth', a, b, function (r) { return r.change_7d; }, fmtPct),
      leadLine('Chains', a, b, function (r) { return (r.chains || []).length; }, function (n) { return String(n); })
    ];
    slot.hidden = false;
    slot.appendChild(el('div', { class: 'cmp-head' },
      el('h2', { text: 'Head to head: ' + a.name + ' vs ' + b.name }),
      el('button', { type: 'button', class: 'button cmp-clear', text: 'Clear comparison', onclick: clearCompare })
    ));
    slot.appendChild(el('div', { class: 'cmp-grid' }, compareCard(a), compareCard(b)));
    slot.appendChild(el('ul', { class: 'cmp-verdicts' }, verdicts.map(function (v) { return el('li', { text: v }); })));
  }

  // CSV export: the filtered board, as a file, with no server round-trip.
  // The header names the columns; each row is one filtered protocol, quoted
  // only when a value itself holds a comma, a quote or a newline.
  function csvCell(value) {
    var text = value === null || value === undefined ? '' : String(value);
    return /[",\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
  }
  function exportCsv() {
    var list = sortedRows(rows());
    var head = ['rank', 'name', 'category', 'tvl_usd', 'change_7d_pct', 'chains', 'implied_value_usd'];
    var lines = [head.join(',')];
    list.forEach(function (r) {
      lines.push([
        r.rank, r.name, r.category || '', r.tvl_usd,
        r.change_7d === null || r.change_7d === undefined ? '' : r.change_7d,
        (r.chains || []).join('; '), r.implied_value_usd
      ].map(csvCell).join(','));
    });
    var blob = new Blob(['\ufeff' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var link = document.createElement('a');
    link.href = url;
    link.download = 'token-radar-board.csv';
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  // Reset every filter at once: search, category, chain, watchlist-only,
  // starred-only and the comparison picks, then back to the pre-token tab.
  function resetFilters() {
    state.q = '';
    state.category = 'all';
    state.chain = 'all';
    state.watchlistOnly = false;
    state.starredOnly = false;
    state.tab = 'pre-token';
    state.compare.clear();
    state.compareNote = '';
    writeHash();
    render();
  }
  // The starred toolbar lives in index.html outside the re-rendered shell,
  // so its pressed state and count label are synced here on every render.
  function syncStarToolbar() {
    var toggle = document.getElementById('starred-only');
    if (toggle) {
      toggle.setAttribute('aria-pressed', state.starredOnly ? 'true' : 'false');
      toggle.textContent = '★ 仅看收藏' + (starredCount() ? ' (' + starredCount() + ')' : '');
    }
  }

  function readHash() {
    var hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    var params = new URLSearchParams(hash);
    if (params.get('q')) state.q = params.get('q');
    if (params.get('p')) state.selected = params.get('p');
    if (params.get('category')) state.category = params.get('category');
    if (params.get('chain')) state.chain = params.get('chain');
    if (params.get('wl') === '1') state.watchlistOnly = true;
  }
  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.chain !== 'all') params.set('chain', state.chain);
    if (state.watchlistOnly) params.set('wl', '1');
    if (state.selected) params.set('p', state.selected);
    var next = params.toString();
    if (next) window.history.replaceState(null, '', '#' + next);
    else window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  function isWatchlist(r) { return DATA.watchlist && DATA.watchlist.indexOf(r.slug) >= 0; }
  function rows() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.category !== 'all' && r.category !== state.category) return false;
      if (state.chain !== 'all' && (!r.chains || r.chains.indexOf(state.chain) < 0)) return false;
      if (state.watchlistOnly && !isWatchlist(r)) return false;
      if (state.starredOnly && !isStarred(r.slug)) return false;
      if (!q) return true;
      var hay = [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }
  function sortedRows(list) {
    var key = state.sort;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null ? Infinity : a.age_days; bv = b.age_days === null ? Infinity : b.age_days; }
      else { av = a.implied_value_usd; bv = b.implied_value_usd; }
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  }

  function header() {
    return el('header', { class: 'top' },
      el('div', { class: 'brand' }, el('span', { class: 'mark' }), el('span', { class: 'brand-name', text: 'Token Radar' })),
      el('div', { class: 'top-meta' },
        el('span', { text: 'Snapshot ' + DATA.as_of }),
        el('span', { text: 'DefiLlama protocol index' }),
        el('span', { text: DATA.model_version + ' model' })
      )
    );
  }

  function lede() {
    return el('section', { class: 'lede' },
      el('div', null,
        el('h1', { text: DATA.watchlist_size + ' watchlist protocols, ranked by implied value' }),
        el('p', { text: 'The watchlist is the floor: every protocol with at least $' + Math.round(DATA.floor_usd / 1e6) + 'M of TVL and no token on record. The early radar adds ' + DATA.early_size + ' pre-token protocols below that floor. Each sector is priced at its own multiple, taken from the live-token protocols in that sector. Implied value is a model, not a promise.' })
      ),
      el('div', { class: 'facts' },
        el('div', { class: 'fact' }, el('span', { text: 'Watchlist covered' }), el('b', { text: DATA.watchlist_size + ' / ' + DATA.watchlist_size })),
        el('div', { class: 'fact' }, el('span', { text: 'Pre-token rows scored' }), el('b', { text: String(DATA.board_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Early rows below the floor' }), el('b', { text: String(DATA.early_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Live-token protocols set aside' }), el('b', { text: String(DATA.live_size) }))
      )
    );
  }

  function highlights() {
    var top = DATA.rows.slice(0, 3);
    var mover = null, newest = null;
    DATA.rows.forEach(function (r) {
      if (r.change_7d !== null && (mover === null || r.change_7d > mover.change_7d)) mover = r;
      if (r.age_days !== null && (newest === null || r.age_days < newest.age_days)) newest = r;
    });
    function card(label, row, note) {
      return el('button', { type: 'button', class: 'hl-card', onclick: function () { openDetail(row.slug); } },
        el('span', { class: 'hl-label', text: label }),
        el('b', { text: row.name }),
        el('span', { class: 'hl-note', text: note })
      );
    }
    return el('section', { class: 'highlights', 'aria-label': 'Highlights' },
      top.map(function (r, i) { return card('Rank ' + (i + 1), r, fmtUsd(r.implied_value_usd) + ' implied'); }),
      mover ? card('Fastest growing, 7d', mover, fmtPct(mover.change_7d) + ' on ' + fmtUsd(mover.tvl_usd) + ' TVL') : null,
      newest ? card('Newest on the board', newest, fmtAge(newest.age_days) + ' old, ' + fmtUsd(newest.tvl_usd) + ' TVL') : null
    );
  }

  function controls() {
    var categories = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Other'; }))).sort();
    var chains = Array.from(new Set(DATA.rows.reduce(function (acc, r) { return acc.concat(r.chains || []); }, []))).sort();
    var search = el('input', { type: 'search', id: 'q', placeholder: 'Search name, category or chain', value: state.q, 'aria-label': 'Search the board' });
    search.addEventListener('input', function () { state.q = search.value; writeHash(); render(); });
    var select = el('select', { id: 'category', 'aria-label': 'Filter by category' },
      el('option', { value: 'all', text: 'All categories' }),
      categories.map(function (c) { return el('option', { value: c, text: c, selected: c === state.category ? 'selected' : null }); })
    );
    select.addEventListener('change', function () { state.category = select.value; writeHash(); render(); });
    var chainSel = el('select', { id: 'chain', 'aria-label': 'Filter by chain' },
      el('option', { value: 'all', text: 'All chains' }),
      chains.map(function (c) { return el('option', { value: c, text: c, selected: c === state.chain ? 'selected' : null }); })
    );
    chainSel.addEventListener('change', function () { state.chain = chainSel.value; writeHash(); render(); });
    var wl = el('button', { type: 'button', class: 'toggle', 'aria-pressed': state.watchlistOnly ? 'true' : 'false', text: 'Watchlist only', onclick: function () { state.watchlistOnly = !state.watchlistOnly; writeHash(); render(); } });
    var pre = el('button', { type: 'button', 'aria-pressed': state.tab === 'pre-token' ? 'true' : 'false', text: 'Pre-token', onclick: function () { state.tab = 'pre-token'; render(); } });
    var live = el('button', { type: 'button', 'aria-pressed': state.tab === 'live' ? 'true' : 'false', text: 'Live token', onclick: function () { state.tab = 'live'; render(); } });
    return el('div', { class: 'controls' },
      el('div', { class: 'field' }, el('label', { for: 'q', text: 'Search' }), search),
      el('div', { class: 'field' }, el('label', { for: 'category', text: 'Category' }), select),
      el('div', { class: 'field' }, el('label', { for: 'chain', text: 'Chain' }), chainSel),
      el('div', { class: 'field' }, el('span', { class: 'sub', text: 'Scope' }), wl),
      el('div', { class: 'field' }, el('span', { class: 'sub', text: 'Token status' }), el('div', { class: 'tabs' }, pre, live)),
      el('span', { class: 'count', text: state.tab === 'pre-token' ? rows().length + ' rows shown' : DATA.live.length + ' live-token protocols' })
    );
  }

  function sortHeader(key, label) {
    return el('th', { scope: 'col' },
      el('button', { type: 'button', onclick: function () { if (state.sort === key) state.dir = -state.dir; else { state.sort = key; state.dir = -1; } render(); } },
        label,
        state.sort === key ? el('span', { 'aria-hidden': 'true', text: state.dir < 0 ? ' v' : ' ^' }) : null
      )
    );
  }

  function boardTable() {
    var list = sortedRows(rows());
    if (list.length === 0) {
      return el('div', { class: 'panel' }, el('div', { class: 'empty' },
        el('h2', { text: 'No protocol matches that filter' }),
        el('p', { text: 'Clear the search or pick another category to see the board again.' }),
        el('button', { class: 'button primary', type: 'button', text: 'Clear filters', onclick: resetFilters })
      ));
    }
    var max = list[0].implied_value_usd || 1;
    var tbody = el('tbody');
    list.forEach(function (r) {
      var growth = r.change_7d === null ? 'n/a' : fmtPct(r.change_7d);
      var growthClass = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      var tr = el('tr', {
        'data-selected': state.selected === r.slug ? 'true' : 'false',
        tabindex: '0',
        onclick: function () { openDetail(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } }
      },
        el('td', null, el('button', {
          type: 'button', class: 'star-btn' + (isStarred(r.slug) ? ' starred' : ''),
          'aria-label': (isStarred(r.slug) ? 'Unstar ' : 'Star ') + r.name,
          'aria-pressed': isStarred(r.slug) ? 'true' : 'false',
          title: isStarred(r.slug) ? 'Remove from starred' : 'Star this protocol',
          text: isStarred(r.slug) ? '★' : '☆',
          onclick: function (e) { e.stopPropagation(); toggleStarred(r.slug); }
        })),
        el('td', null, el('input', {
          type: 'checkbox', class: 'compare-box', 'aria-label': 'Compare ' + r.name,
          checked: state.compare.has(r.slug) ? 'checked' : null,
          onclick: function (e) { e.stopPropagation(); },
          onkeydown: function (e) { e.stopPropagation(); },
          onchange: function (e) { toggleCompare(r.slug, e.target.checked); }
        })),
        el('td', { class: 'num', text: String(r.rank) }),
        el('td', null, el('div', { class: 'name' },
          el('b', { text: r.name }),
          el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') + (isWatchlist(r) ? ' · watchlist' : '') })
        )),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + growthClass, text: growth }),
        el('td', { class: 'num', text: fmtAge(r.age_days) }),
        el('td', null, el('div', { class: 'implied' },
          el('div', { class: 'bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(3, Math.round((r.implied_value_usd / max) * 100)) + '%' })),
          el('span', { class: 'num', text: fmtUsd(r.implied_value_usd) })
        )),
        el('td', null, el('span', { class: 'status', text: 'no token' }))
      );
      tbody.appendChild(tr);
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Pre-token protocols, strongest implied value first. Select a row for its model and farm plan.' }),
          el('thead', null, el('tr', null,
            el('th', { scope: 'col', 'aria-label': 'Starred', text: '★' }),
            el('th', { scope: 'col', text: 'Compare' }),
            sortHeader('implied', 'Rank'),
            sortHeader('name', 'Protocol'),
            sortHeader('tvl', 'TVL'),
            sortHeader('growth', '7d'),
            sortHeader('age', 'Age'),
            sortHeader('implied', 'Implied value'),
            el('th', { scope: 'col', text: 'Token' })
          )),
          tbody
        )
      )
    );
  }

  function liveTable() {
    var tbody = el('tbody');
    DATA.live.forEach(function (r) {
      tbody.appendChild(el('tr', null,
        el('td', { class: 'num', text: 'live' }),
        el('td', null, el('div', { class: 'name' }, el('b', { text: r.name }), el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') }))),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + (r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtUsd(r.mcap_usd) }),
        el('td', null, el('span', { class: 'status', text: 'already trades' }))
      ));
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Token live: these protocols already trade, so their market cap is a fact, not a model. They are set aside from the pre-token ranking.' }),
          el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Status' }), el('th', { scope: 'col', text: 'Protocol' }), el('th', { scope: 'col', text: 'TVL' }), el('th', { scope: 'col', text: '7d' }), el('th', { scope: 'col', text: 'Market cap' }), el('th', { scope: 'col', text: 'Token' }))),
          tbody
        )
      )
    );
  }

  function modelPanel() {
    var m = DATA.model;
    var sectors = (DATA.sectors || []).filter(function (s) { return !s.fallback; }).slice(0, 12);
    var sectorRows = sectors.map(function (s) {
      return el('tr', null,
        el('td', { text: s.category }),
        el('td', { class: 'num', text: String(s.samples) }),
        el('td', { class: 'num', text: 'x' + s.multiple.toFixed(3) })
      );
    });
    return el('section', { class: 'panel model' },
      el('h2', { text: 'How implied value is computed' }),
      el('p', { class: 'sub', text: 'Every row is scored by one function of the snapshot figures. No protocol name is special-cased, and no row is hand-picked.' }),
      el('div', { class: 'formula' },
        'implied = round( tvl_usd x sector_multiple x (1 + clamp(change_7d, ' + m.growth_floor + ', ' + m.growth_cap + ') / 100 x ' + m.growth_weight + ') x (' + m.maturity_floor + ' + min(age_days, ' + m.maturity_days + ') / ' + m.maturity_days + ' x ' + m.maturity_range + ') x chain_multiplier )'
      ),
      el('p', { class: 'sub', text: 'The sector multiple is the median market-cap-per-dollar-of-TVL of the live-token protocols in that sector, taken from this snapshot. A sector with fewer than ' + m.sector_min_samples + ' live protocols uses the global median, x' + DATA.global_multiple.toFixed(3) + '. The chain multiplier is 1.00 for one chain and up to 1.20 for five or more. Age is the time since the protocol was first listed, the best record of how long it has run with no token; an unlisted age uses ' + m.unknown_age_days + ' days. The early radar is every pre-token protocol below the watchlist floor, by TVL, and the live-token protocols are set aside with their market caps shown.' }),
      sectors.length ? el('div', { class: 'table-wrap' },
        el('table', { class: 'sectors' },
          el('caption', { class: 'sub', text: 'Sector multiples, from the snapshot\u2019s live-token protocols (median market cap per dollar of TVL).' }),
          el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Sector' }), el('th', { scope: 'col', text: 'Live protocols' }), el('th', { scope: 'col', text: 'Multiple' }))),
          el('tbody', null, sectorRows)
        )
      ) : null
    );
  }

  // Farm plan as a timeline: each step gets a number and a phase tag.
  // Eight steps split 2 / 3 / 3 into prepare, execute and hold-and-claim;
  // shorter plans split into thirds so the three phases still appear.
  function phaseForStep(index, total) {
    var first, second;
    if (total >= 8) { first = 2; second = 5; }
    else {
      first = Math.max(1, Math.ceil(total / 3));
      second = Math.max(first + 1, Math.ceil((total * 2) / 3));
    }
    if (index < first) return { label: '准备', cls: 'phase-prep' };
    if (index < second) return { label: '执行', cls: 'phase-exec' };
    return { label: '持有与领奖', cls: 'phase-hold' };
  }
  function farmTimeline(steps) {
    var items = steps.map(function (s, i) {
      var at = s.indexOf(' Cost: ');
      var action = at >= 0 ? s.slice(0, at) : s;
      var tail = at >= 0 ? s.slice(at + 1) : '';
      var phase = phaseForStep(i, steps.length);
      var last = i === steps.length - 1;
      return el('li', { class: 'timeline-step' + (last ? ' timeline-last' : '') },
        el('span', { class: 'timeline-dot', 'aria-hidden': 'true', text: String(i + 1) }),
        el('div', { class: 'timeline-body' },
          el('span', { class: 'phase-tag ' + phase.cls, text: phase.label }),
          el('b', { text: action }),
          tail ? el('span', { class: 'cost', text: tail }) : null
        )
      );
    });
    return el('ol', { class: 'timeline' }, items);
  }

  var dialog = el('dialog', { class: 'detail', id: 'detail', 'aria-labelledby': 'detail-title' });
  dialog.addEventListener('close', function () { state.selected = null; writeHash(); });

  function openDetail(slug) {
    var row = DATA.rows.filter(function (r) { return r.slug === slug; })[0];
    if (!row) return;
    state.selected = slug;
    writeHash();
    dialog.textContent = '';
    var steps = farmSteps(row);
    dialog.appendChild(el('div', { class: 'detail-head' },
      el('div', null,
        el('span', { class: 'brand-name', text: 'Rank ' + row.rank + ' of ' + DATA.board_size + (isWatchlist(row) ? ' · watchlist' : ' · early') }),
        el('h2', { id: 'detail-title', text: row.name }),
        el('p', { class: 'sub', text: (row.category || 'Other') + ' on ' + (row.chains && row.chains.length ? row.chains.join(', ') : 'an unnamed chain') })
      ),
      el('button', { class: 'close', type: 'button', 'aria-label': 'Close details', text: 'Close', onclick: function () { dialog.close(); } })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Implied value' }),
      el('div', { class: 'equation' },
        el('div', null, el('span', { text: 'TVL' }), el('b', { class: 'num', text: fmtUsd(row.tvl_usd) })),
        el('div', null, el('span', { text: 'Sector multiple (' + (row.category || 'Other') + ')' }), el('b', { class: 'num', text: 'x' + row.sector_multiple.toFixed(4) + ' (' + row.sector_samples + ' live)' })),
        el('div', null, el('span', { text: 'Seven-day growth' }), el('b', { class: 'num', text: fmtPct(row.change_7d) })),
        el('div', null, el('span', { text: 'Age with no token' }), el('b', { class: 'num', text: fmtAge(row.age_days) })),
        el('div', null, el('span', { text: 'Growth multiplier' }), el('b', { class: 'num', text: String(row.growth_multiplier.toFixed(4)) })),
        el('div', null, el('span', { text: 'Maturity multiplier' }), el('b', { class: 'num', text: String(row.maturity_multiplier.toFixed(4)) })),
        el('div', null, el('span', { text: 'Chain multiplier' }), el('b', { class: 'num', text: String(row.chain_multiplier.toFixed(4)) })),
        el('div', null, el('span', { text: 'Implied value' }), el('b', { class: 'num', text: fmtUsd(row.implied_value_usd) }))
      ),
      el('p', { class: 'sub', text: 'Model ' + DATA.model_version + ': the same function scores every protocol. The page recomputes this row as ' + fmtUsd(impliedOf(row, DATA.model)) + (impliedOf(row, DATA.model) === row.implied_value_usd ? ', the same number board.json carries.' : ', which differs from the board: the data would be stale.') + ' This is an estimate, not a price.' })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Farm plan' }),
      farmTimeline(steps)
    ));
    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
  }

  function render() {
    app.textContent = '';
    var shell = el('div', { class: 'shell' });
    shell.appendChild(header());
    shell.appendChild(lede());
    if (state.tab === 'pre-token') shell.appendChild(highlights());
    shell.appendChild(controls());
    syncComparePanel();
    shell.appendChild(state.tab === 'pre-token' ? boardTable() : liveTable());
    if (state.tab === 'pre-token') shell.appendChild(modelPanel());
    app.appendChild(shell);
    app.setAttribute('aria-busy', 'false');
    syncStarToolbar();
    if (!dialog.isConnected) app.appendChild(dialog);
    if (state.selected) openDetail(state.selected);
  }

  readHash();
  render();
  var exportBtn = document.getElementById('export-csv');
  if (exportBtn) exportBtn.addEventListener('click', exportCsv);
  var starredBtn = document.getElementById('starred-only');
  if (starredBtn) starredBtn.addEventListener('click', function () {
    state.starredOnly = !state.starredOnly;
    writeHash();
    render();
  });
  var resetBtn = document.getElementById('reset-filters');
  if (resetBtn) resetBtn.addEventListener('click', resetFilters);
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && dialog.open) dialog.close();
  });
})();
