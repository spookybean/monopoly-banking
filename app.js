const BANK_ID_JS = 'bank';
const SAVE_KEY = 'monopoly_gh_state';
const MAX_TRANSACTIONS = 300;
const MAX_PLAYERS = 8;

function app() {
  return {
    view: 'dashboard',
    dark_mode: localStorage.getItem('theme') !== 'light',
    players: [],
    properties: [],
    transactions: [],
    game_started: false,
    _pl_ctr: 0,
    _tx_ctr: 0,
    _starting_balance: 1_500_000,
    _bank_initial_bal: 10_000_000,
    sel_player: null,
    sel_player_props: [],
    sel_player_txs: [],
    toast: { show: false, msg: '', type: 'success' },
    tx: { from_id: '', to_id: '', amount: 0, desc: '' },
    buy_form: { player_id: '', prop_id: '' },
    rent_form: { prop_id: '', payer_id: '', rent_amt: 0 },
    reg_form: { name: '', card_uid: '' },
    quick_act: { active: false, type: '', label: '', player_id: '' },
    config_form: { url: '', dragging: false, loading: false },
    player_colors: ['#f59e0b','#34d399','#60a5fa','#f87171','#a78bfa','#fb923c','#f472b6','#67e8f9'],

    async init() {
      this._apply_theme();
      await this._try_load_props();
      this._load_from_storage();
      this._refresh_derived();
    },

    _apply_theme() {
      document.documentElement.setAttribute('data-theme', this.dark_mode ? 'dark' : 'light');
    },

    toggle_theme() {
      this.dark_mode = !this.dark_mode;
      localStorage.setItem('theme', this.dark_mode ? 'dark' : 'light');
      this._apply_theme();
    },

    set_view(v) { this.view = v; },

    // ─── Properties loading ───────────────────────────────────────────────────

    async _try_load_props() {
      for (const url of ['./properties.json', '../data/properties.json']) {
        try {
          const r = await fetch(url);
          if (!r.ok) continue;
          this._parse_props_json(await r.json());
          return true;
        } catch(_) {}
      }
      this.show_toast('Could not load properties — upload one in Settings', 'error');
      this._seed_bank();
      return false;
    },

    _parse_props_json(raw) {
      this._starting_balance = raw.player_amount   || 1_500_000;
      this._bank_initial_bal  = raw.starting_amount || 10_000_000;
      const next = [];
      for (const [id, p] of Object.entries(raw)) {
        if (typeof p !== 'object' || p === null) continue;
        const type_str = p.type || 'property';
        const rent  = p.rent  || {};
        const price = p.price || {};
        let prop_type, rent_arr;
        if (type_str === 'transport') {
          prop_type = 'station';
          rent_arr  = [rent['1owned']||0, rent['2owned']||0, rent['3owned']||0, rent['4owned']||0, 0, 0];
        } else if (type_str === 'utility') {
          prop_type = 'utility';
          rent_arr  = [rent['1owned']||0, rent['2owned']||0, 0, 0, 0, 0];
        } else {
          prop_type = 'colored';
          rent_arr  = [rent.site||0, rent['1house']||0, rent['2house']||0,
                       rent['3house']||0, rent['4house']||0, rent.hotel||0];
        }
        const hc = price.house || 0;
        const ex = this.properties.find(x => x.id === id);
        next.push({
          id,
          name:          p.name || id.charAt(0).toUpperCase() + id.slice(1),
          group:         p.colour || 'unknown',
          color_hex:     p.colorHex || '#888888',
          type:          prop_type,
          price:         price.site || 0,
          mortgage:      p.mortgage_value || Math.floor((price.site || 0) / 2),
          house_cost:    hc,
          hotel_cost:    price.hotel || hc,
          rent_schedule: rent_arr,
          rent:          0,
          owner_id:      ex?.owner_id   || '',
          owner_name:    ex?.owner_name || '',
          houses:        ex?.houses     || 0,
          hotel:         ex?.hotel      || false,
          mortgaged:     ex?.mortgaged  || false,
        });
      }
      this.properties = next;
    },

    // ─── Persistence ──────────────────────────────────────────────────────────

    _seed_bank() {
      if (!this.players.find(p => p.id === BANK_ID_JS))
        this.players = [{ id: BANK_ID_JS, name: 'Bank', card_uid: '', balance: this._bank_initial_bal, is_bank: true, prop_ids: [] }];
      this._pl_ctr = 0;
    },

    _load_from_storage() {
      try {
        const raw = localStorage.getItem(SAVE_KEY);
        if (!raw) { this._seed_bank(); return; }
        const d = JSON.parse(raw);
        this.game_started      = d.started          || false;
        this._pl_ctr           = d.pl_ctr           || 0;
        this._tx_ctr           = d.tx_ctr           || 0;
        this._starting_balance = d.starting_balance || this._starting_balance;
        this._bank_initial_bal  = d.bank_initial_bal  || this._bank_initial_bal;
        this.players      = d.players      || [];
        this.transactions = d.transactions || [];
        if (d.prop_state) {
          for (const s of d.prop_state) {
            const pr = this._find_prop(s.id);
            if (pr) { pr.owner_id = s.owner_id || ''; pr.houses = s.houses || 0; pr.hotel = s.hotel || false; pr.mortgaged = s.mortgaged || false; }
          }
          for (const p of this.players)
            p.prop_ids = this.properties.filter(pr => pr.owner_id === p.id).map(pr => pr.id);
        }
        if (this.players.length === 0) this._seed_bank();
      } catch(e) { console.warn('Load from storage failed', e); this._seed_bank(); }
    },

    _save() {
      try {
        localStorage.setItem(SAVE_KEY, JSON.stringify({
          started:         this.game_started,
          pl_ctr:          this._pl_ctr,
          tx_ctr:          this._tx_ctr,
          starting_balance: this._starting_balance,
          bank_initial_bal:  this._bank_initial_bal,
          players:      this.players,
          prop_state:   this.properties.map(({ id, owner_id, houses, hotel, mortgaged }) => ({ id, owner_id, houses, hotel, mortgaged })),
          transactions: this.transactions.slice(0, 100)
        }));
      } catch(e) { console.warn('Save failed', e); }
    },

    export_save() {
      const data = localStorage.getItem(SAVE_KEY) || '{}';
      const a = Object.assign(document.createElement('a'), {
        href: URL.createObjectURL(new Blob([data], { type: 'application/json' })),
        download: 'monopoly-save.json'
      });
      a.click();
    },

    async import_save(e) {
      const file = e.target.files[0];
      if (!file) return;
      try {
        const text = await file.text();
        JSON.parse(text);
        localStorage.setItem(SAVE_KEY, text);
        this._load_from_storage();
        this._refresh_derived();
        this.show_toast('Save restored!');
      } catch { this.show_toast('Invalid save file', 'error'); }
      e.target.value = '';
    },

    // ─── Game logic ───────────────────────────────────────────────────────────

    _find_player(id) { return this.players.find(p => p.id === id) || null; },
    _find_prop(id)   { return this.properties.find(p => p.id === id) || null; },

    _owns_full_group(player_id, group) {
      const grp = this.properties.filter(p => p.group === group && p.type === 'colored');
      return grp.length > 0 && grp.every(p => p.owner_id === player_id);
    },

    _calc_rent_val(pr) {
      if (!pr || !pr.owner_id || pr.mortgaged) return 0;
      const rs = pr.rent_schedule;
      if (pr.type === 'colored') {
        if (pr.hotel)      return rs[5] || 0;
        if (pr.houses > 0) return rs[pr.houses] || 0;
        return this._owns_full_group(pr.owner_id, pr.group) ? (rs[0] || 0) * 2 : (rs[0] || 0);
      }
      if (pr.type === 'station') {
        const n = this.properties.filter(p => p.type === 'station' && p.owner_id === pr.owner_id).length;
        return rs[Math.max(0, n - 1)] || 0;
      }
      if (pr.type === 'utility') {
        const n = this.properties.filter(p => p.type === 'utility' && p.owner_id === pr.owner_id).length;
        return rs[Math.max(0, n - 1)] || 0;
      }
      return 0;
    },

    _refresh_derived() {
      for (const pr of this.properties) {
        pr.rent = this._calc_rent_val(pr);
        const owner = this._find_player(pr.owner_id);
        pr.owner_name = owner ? owner.name : '';
      }
    },

    _add_tx(fi, fn, ti, tn, amt, desc) {
      this._tx_ctr++;
      this.transactions.unshift({ id: `t${this._tx_ctr}`, from_id: fi, from_name: fn, to_id: ti, to_name: tn, amount: amt, description: desc, ts: Date.now() });
      if (this.transactions.length > MAX_TRANSACTIONS) this.transactions.length = MAX_TRANSACTIONS;
    },

    do_register() {
      const name = this.reg_form.name.trim();
      if (!name) return;
      if (this.players.filter(p => !p.is_bank).length >= MAX_PLAYERS) { this.show_toast('Max players reached', 'error'); return; }
      const uid = (this.reg_form.card_uid || '').toUpperCase().trim();
      if (uid && this.players.find(p => p.card_uid === uid)) { this.show_toast('Card UID already registered', 'error'); return; }
      this._pl_ctr++;
      this.players.push({ id: `p${this._pl_ctr}`, name, card_uid: uid, balance: 0, is_bank: false, prop_ids: [] });
      this.reg_form = { name: '', card_uid: '' };
      this._save();
      this.show_toast(name + ' registered!');
    },

    do_delete_player(id, name) {
      if (id === BANK_ID_JS) return;
      if (!confirm('Remove ' + name + '? Their balance and properties will return to the bank.')) return;
      const player = this._find_player(id);
      const bank   = this._find_player(BANK_ID_JS);
      if (bank && player && player.balance > 0) bank.balance += player.balance;
      for (const pr of this.properties) {
        if (pr.owner_id === id) { pr.owner_id = ''; pr.houses = 0; pr.hotel = false; pr.mortgaged = false; }
      }
      this.players = this.players.filter(p => p.id !== id);
      this._refresh_derived(); this._save();
      this.show_toast(name + ' removed');
    },

    start_game() {
      if (this.game_started) { this.show_toast('Already started', 'error'); return; }
      const humans = this.players.filter(p => !p.is_bank);
      if (humans.length < 2) { this.show_toast('Need at least 2 players', 'error'); return; }
      const bank = this._find_player(BANK_ID_JS);
      this.game_started = true;
      for (const p of humans) {
        p.balance     = this._starting_balance;
        bank.balance -= this._starting_balance;
        this._add_tx(BANK_ID_JS, 'Bank', p.id, p.name, this._starting_balance, 'Starting balance');
      }
      this._save();
      this.show_toast('Game started! ₹' + Math.round(this._starting_balance / 100000) + 'L to each player.');
    },

    confirm_reset() { if (confirm('Reset the entire game? All progress will be lost.')) this.reset_game(); },

    reset_game() {
      this.game_started = false; this._pl_ctr = 0; this._tx_ctr = 0;
      this.transactions = [];
      for (const pr of this.properties) { pr.owner_id = ''; pr.houses = 0; pr.hotel = false; pr.mortgaged = false; }
      this._seed_bank(); this._refresh_derived(); this._save();
      this.show_toast('Game reset.', 'error');
    },

    do_transfer() {
      if (!this.tx.from_id || !this.tx.to_id || this.tx.amount <= 0) return;
      const amt  = Number(this.tx.amount);
      const from = this._find_player(this.tx.from_id);
      const to   = this._find_player(this.tx.to_id);
      if (!from || !to) { this.show_toast('Player not found', 'error'); return; }
      if (!from.is_bank && from.balance < amt) { this.show_toast('Insufficient balance', 'error'); return; }
      from.balance -= amt; to.balance += amt;
      this._add_tx(from.id, from.name, to.id, to.name, amt, this.tx.desc || 'Transfer');
      this.tx.amount = 0; this.tx.desc = '';
      this._save(); this.show_toast('Transfer done!');
    },

    do_buy_prop() {
      const player = this._find_player(this.buy_form.player_id);
      const prop   = this._find_prop(this.buy_form.prop_id);
      if (!player || !prop)        { this.show_toast('Not found', 'error'); return; }
      if (prop.owner_id)           { this.show_toast('Already owned', 'error'); return; }
      if (player.balance < prop.price) { this.show_toast('Insufficient balance', 'error'); return; }
      const bank = this._find_player(BANK_ID_JS);
      player.balance -= prop.price; bank.balance += prop.price;
      prop.owner_id = player.id;
      (player.prop_ids = player.prop_ids || []).push(prop.id);
      this._add_tx(player.id, player.name, BANK_ID_JS, 'Bank', prop.price, 'Bought ' + prop.name);
      this.buy_form.prop_id = '';
      this._refresh_derived(); this._save(); this.show_toast('Property purchased!');
    },

    calc_rent() {
      if (!this.rent_form.prop_id) return;
      const pr = this._find_prop(this.rent_form.prop_id);
      this.rent_form.rent_amt = pr ? this._calc_rent_val(pr) : 0;
    },

    collect_rent() {
      const prop  = this._find_prop(this.rent_form.prop_id);
      if (!prop || !prop.owner_id) return;
      const amt   = this.rent_form.rent_amt;
      const payer = this._find_player(this.rent_form.payer_id);
      const owner = this._find_player(prop.owner_id);
      if (!payer || !owner) { this.show_toast('Player not found', 'error'); return; }
      if (!payer.is_bank && payer.balance < amt) { this.show_toast('Insufficient balance', 'error'); return; }
      payer.balance -= amt; owner.balance += amt;
      this._add_tx(payer.id, payer.name, owner.id, owner.name, amt, 'Rent: ' + prop.name);
      this.rent_form.prop_id = ''; this.rent_form.payer_id = ''; this.rent_form.rent_amt = 0;
      this._save(); this.show_toast('Rent collected!');
    },

    build_house(player_id, prop_id) {
      const player = this._find_player(player_id), prop = this._find_prop(prop_id);
      if (!player || !prop) return;
      if (prop.type !== 'colored')                       { this.show_toast('Only colored properties', 'error'); return; }
      if (prop.owner_id !== player_id)                   { this.show_toast('Not your property', 'error'); return; }
      if (!this._owns_full_group(player_id, prop.group)) { this.show_toast('Must own full color group', 'error'); return; }
      if (prop.hotel)                                    { this.show_toast('Already has a hotel', 'error'); return; }
      if (prop.houses >= 4)                              { this.show_toast('Max 4 houses — build hotel', 'error'); return; }
      if (player.balance < prop.house_cost)              { this.show_toast('Insufficient balance', 'error'); return; }
      const bank = this._find_player(BANK_ID_JS);
      player.balance -= prop.house_cost; bank.balance += prop.house_cost; prop.houses++;
      this._add_tx(player_id, player.name, BANK_ID_JS, 'Bank', prop.house_cost, 'Built house on ' + prop.name);
      this._refresh_derived(); this._save(); this._refresh_sel_player(); this.show_toast('House built!');
    },

    demolish_house(player_id, prop_id) {
      const player = this._find_player(player_id), prop = this._find_prop(prop_id);
      if (!player || !prop) return;
      if (prop.owner_id !== player_id) { this.show_toast('Not your property', 'error'); return; }
      if (prop.hotel)                  { this.show_toast('Demolish hotel first', 'error'); return; }
      if (prop.houses === 0)           { this.show_toast('No houses', 'error'); return; }
      const refund = Math.floor(prop.house_cost / 2);
      const bank = this._find_player(BANK_ID_JS);
      player.balance += refund; bank.balance -= refund; prop.houses--;
      this._add_tx(BANK_ID_JS, 'Bank', player_id, player.name, refund, 'Demolished house on ' + prop.name);
      this._refresh_derived(); this._save(); this._refresh_sel_player(); this.show_toast('House demolished');
    },

    build_hotel(player_id, prop_id) {
      const player = this._find_player(player_id), prop = this._find_prop(prop_id);
      if (!player || !prop) return;
      if (prop.type !== 'colored')          { this.show_toast('Only colored properties', 'error'); return; }
      if (prop.owner_id !== player_id)      { this.show_toast('Not your property', 'error'); return; }
      if (prop.hotel)                       { this.show_toast('Already has a hotel', 'error'); return; }
      if (prop.houses !== 4)                { this.show_toast('Need exactly 4 houses first', 'error'); return; }
      if (player.balance < prop.hotel_cost) { this.show_toast('Insufficient balance', 'error'); return; }
      const bank = this._find_player(BANK_ID_JS);
      player.balance -= prop.hotel_cost; bank.balance += prop.hotel_cost; prop.houses = 0; prop.hotel = true;
      this._add_tx(player_id, player.name, BANK_ID_JS, 'Bank', prop.hotel_cost, 'Built hotel on ' + prop.name);
      this._refresh_derived(); this._save(); this._refresh_sel_player(); this.show_toast('Hotel built!');
    },

    demolish_hotel(player_id, prop_id) {
      const player = this._find_player(player_id), prop = this._find_prop(prop_id);
      if (!player || !prop) return;
      if (prop.owner_id !== player_id) { this.show_toast('Not your property', 'error'); return; }
      if (!prop.hotel)                 { this.show_toast('No hotel', 'error'); return; }
      const refund = Math.floor(prop.hotel_cost / 2);
      const bank = this._find_player(BANK_ID_JS);
      player.balance += refund; bank.balance -= refund; prop.hotel = false; prop.houses = 4;
      this._add_tx(BANK_ID_JS, 'Bank', player_id, player.name, refund, 'Demolished hotel on ' + prop.name);
      this._refresh_derived(); this._save(); this._refresh_sel_player(); this.show_toast('Hotel demolished');
    },

    sell_prop(player_id, prop_id) {
      const prop = this._find_prop(prop_id);
      if (!confirm('Sell ' + (prop?.name || prop_id) + ' back to bank for ' + this.fmt(prop?.mortgage || 0) + '?')) return;
      const player = this._find_player(player_id);
      if (!player || !prop) return;
      if (prop.owner_id !== player_id)   { this.show_toast('Not your property', 'error'); return; }
      if (prop.houses > 0 || prop.hotel) { this.show_toast('Demolish buildings first', 'error'); return; }
      const bank = this._find_player(BANK_ID_JS);
      player.balance += prop.mortgage; bank.balance -= prop.mortgage;
      prop.owner_id = '';
      player.prop_ids = (player.prop_ids || []).filter(id => id !== prop_id);
      this._add_tx(BANK_ID_JS, 'Bank', player_id, player.name, prop.mortgage, 'Sold ' + prop.name);
      this._refresh_derived(); this._save(); this._refresh_sel_player(); this.show_toast('Property sold');
    },

    quick_banker(p) { this.tx.from_id = p.id; this.tx.to_id = BANK_ID_JS; this.view = 'banker'; },

    quick_action(type) {
      const labels = { 'pass-go': 'Pass Go (+₹2,00,000)', 'income-tax': 'Income Tax (-₹2,00,000)', 'luxury-tax': 'Luxury Tax (-₹75,000)', 'community': 'Community Chest (+₹50,000)' };
      this.quick_act = { active: true, type, label: labels[type], player_id: '' };
    },

    do_quick_action() {
      const pid = this.quick_act.player_id;
      const configs = {
        'pass-go':    { from_id: BANK_ID_JS, to_id: pid, amount: 200000, desc: 'Pass Go' },
        'income-tax': { from_id: pid, to_id: BANK_ID_JS, amount: 200000, desc: 'Income Tax' },
        'luxury-tax': { from_id: pid, to_id: BANK_ID_JS, amount: 75000,  desc: 'Luxury Tax' },
        'community':  { from_id: BANK_ID_JS, to_id: pid, amount: 50000,  desc: 'Community Chest' },
      };
      const cfg  = configs[this.quick_act.type];
      const from = this._find_player(cfg.from_id);
      const to   = this._find_player(cfg.to_id);
      if (!from || !to) return;
      if (!from.is_bank && from.balance < cfg.amount) { this.show_toast('Insufficient balance', 'error'); return; }
      from.balance -= cfg.amount; to.balance += cfg.amount;
      this._add_tx(from.id, from.name, to.id, to.name, cfg.amount, cfg.desc);
      this._save(); this.show_toast('Done!'); this.quick_act.active = false;
    },

    // ─── Config upload ────────────────────────────────────────────────────────

    async do_config_upload(obj) {
      this.config_form.loading = true;
      try { this._parse_props_json(obj); this.reset_game(); this.show_toast('Properties loaded — game has been reset'); }
      catch(e) { this.show_toast('Failed to parse: ' + e.message, 'error'); }
      this.config_form.loading = false;
    },

    async on_file_drop(e) {
      this.config_form.dragging = false;
      const file = e.dataTransfer.files[0];
      if (!file) return;
      try { await this.do_config_upload(JSON.parse(await file.text())); }
      catch { this.show_toast('Invalid JSON file', 'error'); }
    },

    async on_file_select(e) {
      const file = e.target.files[0];
      if (!file) return;
      try { await this.do_config_upload(JSON.parse(await file.text())); }
      catch { this.show_toast('Invalid JSON file', 'error'); }
      e.target.value = '';
    },

    async do_load_url() {
      if (!this.config_form.url) return;
      this.config_form.loading = true;
      try {
        const r = await fetch(this.config_form.url);
        if (!r.ok) throw new Error('HTTP ' + r.status);
        await this.do_config_upload(await r.json());
        this.config_form.url = '';
      } catch(e) { this.show_toast('Failed: ' + e.message, 'error'); this.config_form.loading = false; }
    },

    // ─── Player detail ────────────────────────────────────────────────────────

    open_player(p) {
      this.sel_player = p;
      this._refresh_sel_player();
      this.view = 'player-detail';
    },

    _refresh_sel_player() {
      if (!this.sel_player) return;
      const fresh = this._find_player(this.sel_player.id);
      if (fresh) {
        this.sel_player       = fresh;
        this.sel_player_props = this.properties.filter(pr => pr.owner_id === fresh.id);
        this.sel_player_txs   = this.transactions.filter(t => t.from_id === fresh.id || t.to_id === fresh.id);
      }
    },

    // ─── Computed getters ─────────────────────────────────────────────────────

    get bank_player()      { return this.players.find(p => p.is_bank) || null; },
    get colored_props()    { return this.properties.filter(p => p.type === 'colored'); },
    get owned_prop_count() { return this.colored_props.filter(p => !!p.owner_id).length; },
    get total_prop_count() { return this.colored_props.length; },
    get human_players()    { return this.players.filter(p => !p.is_bank); },
    get available_props()  { return this.properties.filter(p => !p.owner_id); },
    get owned_props()      { return this.properties.filter(p => !!p.owner_id); },
    props_by_owner(id)     { return this.properties.filter(p => p.owner_id === id); },

    get dashboard_players() {
      return this.human_players
        .map(p => ({ ...p, owned_props: this.properties.filter(pr => pr.owner_id === p.id) }))
        .sort((a, b) => b.balance - a.balance);
    },

    player_color(id) {
      const idx = this.human_players.findIndex(p => p.id === id);
      return idx >= 0 ? this.player_colors[idx % this.player_colors.length] : '#6b7280';
    },

    balance_pct(p) {
      const max = Math.max(...this.human_players.map(x => x.balance), 1);
      return Math.max(0, Math.min(100, (p.balance / max) * 100));
    },

    get property_groups() {
      const seen = new Set();
      const groups = [];
      for (const p of this.properties) {
        if (!p.group || seen.has(p.group)) continue;
        seen.add(p.group);
        groups.push({ group: p.group, label: p.group.charAt(0).toUpperCase() + p.group.slice(1), color: p.color_hex || '#888', props: this.properties.filter(x => x.group === p.group) });
      }
      return groups;
    },

    deed_colored_rows(pr) {
      const s = pr.rent_schedule;
      return ['Rent','With 1 House','With 2 Houses','With 3 Houses','With 4 Houses','Hotel']
        .map((label, idx) => ({ idx, label, val: s ? this.fmt(s[idx]) : (idx === 0 ? this.fmt(pr.rent) : '—'), active: pr.hotel ? idx === 5 : pr.houses === idx }));
    },

    deed_station_rows(pr) {
      const s = pr.rent_schedule;
      return ['1 Station','2 Stations','3 Stations','4 Stations']
        .map((label, idx) => ({ idx, label, val: s ? this.fmt(s[idx]) : '—', active: s ? (s[idx] === pr.rent && !!pr.owner_id) : false }));
    },

    deed_utility_rows(pr) {
      const s = pr.rent_schedule;
      return ['1 Utility','2 Utilities']
        .map((label, idx) => ({ idx, label, val: s ? this.fmt(s[idx]) : '—', active: s ? (s[idx] === pr.rent && !!pr.owner_id) : false }));
    },

    show_toast(msg, type = 'success') {
      this.toast = { show: true, msg, type };
      setTimeout(() => { this.toast.show = false; }, 3500);
    },

    fmt(n) {
      if (n == null) return '₹0';
      const abs = Math.abs(n);
      let s;
      if      (abs >= 1e9) s = (abs / 1e9).toFixed(1) + 'B';
      else if (abs >= 1e6) s = (abs / 1e6).toFixed(1) + 'M';
      else if (abs >= 1e3) s = (abs / 1e3).toFixed(0) + 'K';
      else                 s = String(abs);
      return (n < 0 ? '-₹' : '₹') + s;
    },
  };
}
