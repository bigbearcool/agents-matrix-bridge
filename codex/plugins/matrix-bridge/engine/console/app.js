async function api(path,options){const m=typeof options==='string'?options:(options?.method||'GET');const b=typeof options==='string'?arguments[2]:options?.body;const opts={method:m,headers:{'Content-Type':'application/json'}};if(b!==undefined&&b!==null)opts.body=typeof b==='string'?b:JSON.stringify(b);const u=path.startsWith('http')?path:((['127.0.0.1','localhost'].includes(location.hostname)?'':'http://127.0.0.1:47614')+path);const r=await fetch(u,opts);const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error||`HTTP ${r.status}`);return d;}
(() => {
  const $ = (id) => document.getElementById(id);

  const EFFORT_OPTIONS = [
    { value: '', label: '默认' },
    { value: 'low', label: 'Low' },
    { value: 'medium', label: 'Medium' },
    { value: 'high', label: 'High' },
    { value: 'xhigh', label: 'XHigh' },
    { value: 'max', label: 'Max' }
  ];

  // State
  let statusState = {
    connected: false,
    sync_state: 'offline',
    configured: false,
    homeserver: '',
    server_domain: '',
    user_id: '',
    default_policy: 'mention',
    default_model: '',
    default_effort: '',
    admin_count: 0,
    invite_policy: 'all',
    message_policy: 'all',
    room_count: 0,
    last_error: ''
  };

  let securityState = {
    server_domain: '',
    admins: [],
    invite_policy: 'all',
    invite_allowlist: [],
    message_policy: 'all',
    message_allowlist: [],
    message_blocklist: [],
    federated_room_guard: true,
    isolate_unbound_rooms: true,
    admin_only_workspace: false,
    redact_sensitive: true,
    rate_limit_enabled: true,
    known_peers: []
  };

  let availableModels = [];
  let roomsList = [];
  let projectsList = [];
  let logsList = [];
  let activeHostWorkspaces = [];

  let roomFilter = 'all';
  let roomSearch = '';
  let logFilter = 'all';
  let openPickerRoomId = null;
  let openPickerBrowsePath = '';
  let openModelRoomId = null;
  let editingAuth = false;
  let initialRouteDone = false;

  // ---------- Theme Sync with Antigravity Host ----------
  function parseColorIsLight(raw) {
    if (!raw) return null;
    const val = String(raw).trim();
    if (val.startsWith('#')) {
      let hex = val.slice(1);
      if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
      if (hex.length >= 6) {
        const r = parseInt(hex.slice(0, 2), 16);
        const g = parseInt(hex.slice(2, 4), 16);
        const b = parseInt(hex.slice(4, 6), 16);
        const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
        return lum > 0.58;
      }
    }
    const rgbMatch = val.match(/rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/i);
    if (rgbMatch) {
      const lum = (0.299 * Number(rgbMatch[1]) + 0.587 * Number(rgbMatch[2]) + 0.114 * Number(rgbMatch[3])) / 255;
      return lum > 0.58;
    }
    return null;
  }

  window.addEventListener('message', (ev) => {
    if (ev.data?.type === 'theme-change') {
      const vars = ev.data.payload?.cssVariables || {};
      const bg = vars['--background'] || vars['--vscode-sideBar-background'];
      const isLight = parseColorIsLight(bg);
      if (isLight !== null) {
        document.documentElement.dataset.theme = isLight ? 'light' : 'dark';
      }
    }
  });

  // Track active Antigravity workspace folders
  if (window.sidecar && typeof window.sidecar.onWorkspaceChange === 'function') {
    window.sidecar.onWorkspaceChange((uris) => {
      activeHostWorkspaces = (uris || [])
        .filter(u => typeof u === 'string' && u.startsWith('file://'))
        .map(u => decodeURIComponent(u.replace(/^file:\/\//, '')));
      if (openPickerRoomId) renderRooms();
    });
  }

  // ---------- Utilities ----------
  function escapeHtml(str) {
    return String(str ?? '').replace(/[&<>"']/g, m => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    })[m]);
  }

  function showToast(text, type = 'success') {
    const stack = $('toastStack');
    if (!stack) return;
    const el = document.createElement('div');
    el.className = `toast-msg ${type}`;
    el.textContent = text;
    stack.appendChild(el);
    setTimeout(() => {
      el.style.opacity = '0';
      el.style.transform = 'translateY(5px)';
      el.style.transition = 'all 0.18s ease';
      setTimeout(() => el.remove(), 180);
    }, 2400);
  }

  async function copyText(text, label = '已复制到剪贴板') {
    try {
      await navigator.clipboard.writeText(text);
      showToast(label);
    } catch (_) {
      showToast('复制失败，请手动选择复制', 'error');
    }
  }

  function normalizeClientMxids(rawText, allowDomainWildcard = false) {
    const domain = securityState.server_domain || statusState.server_domain || '';
    const tokens = String(rawText || '').split(/[\s,，;；\n]+/).map(s => s.trim()).filter(Boolean);
    const result = [];
    for (const t of tokens) {
      if (t === '*') continue;
      if (allowDomainWildcard) {
        if (t.startsWith('@*:') && t.length > 3) {
          result.push(`@*:${t.slice(3).toLowerCase()}`);
          continue;
        }
        if (t.startsWith('*:') && t.length > 2) {
          result.push(`@*:${t.slice(2).toLowerCase()}`);
          continue;
        }
      } else if (t.includes('*')) {
        continue;
      }

      if (t.startsWith('@') && t.includes(':')) {
        result.push(t);
      } else if (!t.startsWith('@') && t.includes(':')) {
        result.push(`@${t}`);
      } else {
        const local = t.replace(/^@/, '');
        if (local && !local.includes('*')) {
          result.push(domain ? `@${local}:${domain}` : `@${local}`);
        }
      }
    }
    return result;
  }

  // ---------- Secure API Client (supports Sidecar Token + Standalone) ----------
  const urlSidecarToken = new URLSearchParams(window.location.search).get('token');

  const API_BASE = ['127.0.0.1', 'localhost'].includes(location.hostname)
    ? ''
    : 'http://127.0.0.1:47614';

  // uses top-level api

  // ---------- Navigation ----------
  function switchView(viewId) {
    document.querySelectorAll('.nav-tab').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === viewId);
    });
    document.querySelectorAll('.view-pane').forEach(pane => {
      pane.classList.toggle('active', pane.id === viewId);
    });
  }

  document.querySelectorAll('.nav-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      switchView(tab);
      if (tab === 'view-rooms') refreshRooms(true);
      if (tab === 'view-security' || tab === 'view-settings') loadConfig();
      if (tab === 'view-activity') refreshLogs();
    });
  });

  // Auth mode switch (Password vs Token)
  document.querySelectorAll('.mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const mode = btn.dataset.authMode;
      document.querySelectorAll('.mode-btn').forEach(b => b.classList.toggle('active', b === btn));
      $('authPanePassword').classList.toggle('hidden', mode !== 'password');
      $('authPaneToken').classList.toggle('hidden', mode !== 'token');
    });
  });

  // Password / Token peek toggles
  document.querySelectorAll('.peek-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const input = $(btn.dataset.peek);
      if (!input) return;
      const isPwd = input.type === 'password';
      input.type = isPwd ? 'text' : 'password';
      btn.textContent = isPwd ? '隐藏' : '显示';
    });
  });

  // ---------- Header & Account State Rendering ----------
  function renderHeaderAndAccount() {
    const pill = $('statePill');
    const label = $('stateLabel');
    const sub = $('headerSub');
    const btnSync = $('btnToggleSync');
    const errBanner = $('errorBanner');
    const errText = $('errorBannerText');

    $('roomCountBadge').textContent = String(statusState.room_count || 0);

    const shortServer = (statusState.homeserver || '').replace(/^https?:\/\//i, '');
    const shortUser = statusState.user_id ? statusState.user_id.split(':')[0] : '';

    if (!statusState.configured) {
      pill.className = 'state-pill offline';
      label.textContent = '未配置';
      sub.textContent = '完成账号登录即可接入 Matrix 房间';
      btnSync.classList.add('hidden');
    } else if (statusState.sync_state === 'online') {
      pill.className = 'state-pill online';
      label.textContent = '运行中';
      sub.textContent = `${shortUser || '已登录'} · ${shortServer}`;
      btnSync.classList.remove('hidden');
      btnSync.textContent = '暂停';
      btnSync.className = 'btn btn-sm btn-outline';
    } else if (statusState.sync_state === 'connecting') {
      pill.className = 'state-pill connecting';
      label.textContent = '连接中';
      sub.textContent = `正在同步 ${shortServer}...`;
      btnSync.classList.remove('hidden');
      btnSync.textContent = '取消';
      btnSync.className = 'btn btn-sm btn-outline';
    } else if (statusState.sync_state === 'error') {
      pill.className = 'state-pill error';
      label.textContent = '连接异常';
      sub.textContent = `${shortUser || 'Bot'} · ${shortServer}`;
      btnSync.classList.remove('hidden');
      btnSync.textContent = '重试';
      btnSync.className = 'btn btn-sm btn-primary';
    } else {
      pill.className = 'state-pill offline';
      label.textContent = '已暂停';
      sub.textContent = `${shortUser || 'Bot'} · ${shortServer}`;
      btnSync.classList.remove('hidden');
      btnSync.textContent = '启动';
      btnSync.className = 'btn btn-sm btn-primary';
    }

    if (statusState.last_error) {
      errBanner.classList.remove('hidden');
      errText.textContent = statusState.last_error;
    } else {
      errBanner.classList.add('hidden');
    }

    const summaryCard = $('accountSummaryCard');
    const authCard = $('authFormCard');
    const cancelBtn = $('btnCancelEditAuth');

    if (statusState.configured && !editingAuth) {
      summaryCard.classList.remove('hidden');
      authCard.classList.add('hidden');
      const uid = statusState.user_id || '已配置 Token';
      $('accountUserId').textContent = uid;
      $('accountServer').textContent = statusState.homeserver || '-';
      $('accountAvatar').textContent = uid.replace(/^@/, '').charAt(0).toUpperCase() || 'M';
    } else {
      summaryCard.classList.add('hidden');
      authCard.classList.remove('hidden');
      cancelBtn.classList.toggle('hidden', !statusState.configured);
    }
  }

  // ---------- Models & Effort Rendering ----------
  function renderDefaultModelSelect(selectedModel) {
    const sel = $('selectDefaultModel');
    if (!sel) return;
    const curVal = selectedModel !== undefined ? selectedModel : (statusState.default_model || '');
    const options = [`<option value="">跟随 Antigravity CLI 默认设置</option>`];
    const seen = new Set(['']);
    for (const m of availableModels) {
      seen.add(m.id);
      options.push(`<option value="${escapeHtml(m.id)}">${escapeHtml(m.label)} (${escapeHtml(m.id)})</option>`);
    }
    if (curVal && !seen.has(curVal)) {
      options.push(`<option value="${escapeHtml(curVal)}">${escapeHtml(curVal)}</option>`);
    }
    sel.innerHTML = options.join('');
    sel.value = curVal;
  }

  function renderGlobalEffort(effortVal) {
    const cur = effortVal || '';
    document.querySelectorAll('#globalEffortGroup .seg-pill').forEach(btn => {
      btn.classList.toggle('active', (btn.dataset.effort || '') === cur);
    });
  }

  async function loadModels() {
    try {
      const res = await api('/api/models');
      availableModels = res.models || [];
      renderDefaultModelSelect();
      if (openModelRoomId) renderRooms();
    } catch (_) {}
  }

  // ---------- Security & Federation Guard View ----------
  function renderMxidList(listKey, chipsElId, suggestElId, emptyHint, isDanger = false) {
    const chipsEl = $(chipsElId);
    const suggestEl = $(suggestElId);
    const items = securityState[listKey] || [];

    if (chipsEl) {
      if (items.length === 0) {
        chipsEl.innerHTML = `<span class="mxid-empty">${escapeHtml(emptyHint)}</span>`;
      } else {
        chipsEl.innerHTML = '';
        items.forEach(mxid => {
          const peer = (securityState.known_peers || []).find(p => p.user_id === mxid);
          let displayLabel = mxid;
          if (mxid.startsWith('@*:')) {
            displayLabel = `整服规则 (${mxid})`;
          } else if (peer && peer.name && !mxid.startsWith(`@${peer.name}:`)) {
            displayLabel = `${peer.name} (${mxid})`;
          }

          const chip = document.createElement('span');
          chip.className = 'mxid-chip';
          chip.innerHTML = `
            <span class="mxid-chip-text" title="${escapeHtml(mxid)}">${escapeHtml(displayLabel)}</span>
            <button type="button" class="mxid-chip-del" title="移除 ${escapeHtml(mxid)}" aria-label="移除">×</button>
          `;
          chip.querySelector('.mxid-chip-del').addEventListener('click', () => {
            const nextList = items.filter(x => x !== mxid);
            saveSecurityPatch({ [listKey]: nextList }, `已移除 ${mxid}`);
          });
          chipsEl.appendChild(chip);
        });
      }
    }

    if (suggestEl) {
      const excluded = new Set(items);
      if (listKey === 'invite_allowlist' || listKey === 'message_allowlist' || listKey === 'message_blocklist') {
        (securityState.admins || []).forEach(a => excluded.add(a));
      }
      const candidates = (securityState.known_peers || []).filter(p => p.user_id && !excluded.has(p.user_id));
      suggestEl.innerHTML = '';
      if (candidates.length > 0) {
        const lbl = document.createElement('span');
        lbl.className = 'peer-suggest-label';
        lbl.textContent = isDanger ? '快速屏蔽已发现成员：' : '快速添加已发现成员：';
        suggestEl.appendChild(lbl);

        candidates.slice(0, 8).forEach(peer => {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = `peer-chip ${isDanger ? 'danger-peer' : ''}`;
          btn.title = `点击添加 ${peer.user_id}`;
          btn.innerHTML = `<span>+ ${escapeHtml(peer.name)}</span><span class="peer-chip-id">${escapeHtml(peer.user_id)}</span>`;
          btn.addEventListener('click', () => {
            const nextList = [...items, peer.user_id];
            saveSecurityPatch({ [listKey]: nextList }, `${isDanger ? '已屏蔽' : '已添加'} ${peer.user_id}`);
          });
          suggestEl.appendChild(btn);
        });
      }
    }
  }

  function renderSecurityView() {
    const domain = securityState.server_domain || statusState.server_domain || '';
    if ($('inviteLocalDomainDesc')) {
      $('inviteLocalDomainDesc').textContent = domain ? `仅限 @*:${domain}` : '仅接受本服账号邀请';
    }
    if ($('msgLocalDomainDesc')) {
      $('msgLocalDomainDesc').textContent = domain ? `仅限 @*:${domain}` : '拦截外服联邦用户对话';
    }

    // 1. Admins
    const adminCount = (securityState.admins || []).length;
    const adminTag = $('adminCountTag');
    if (adminTag) {
      adminTag.textContent = adminCount > 0 ? `${adminCount} 人` : '未配置';
      adminTag.classList.toggle('muted', adminCount === 0);
    }
    renderMxidList(
      'admins',
      'chipsAdmins',
      'suggestAdmins',
      '尚未配置管理员（添加后可在聊天中直接执行 /workspace、/model、/effort 等命令）'
    );

    // 2. Invite Policy
    const invPol = securityState.invite_policy || 'all';
    document.querySelectorAll('#invitePolicyGroup .policy-option').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.invitePol === invPol);
    });
    $('boxInviteAllowlist')?.classList.toggle('hidden', invPol !== 'allowlist');
    renderMxidList(
      'invite_allowlist',
      'chipsInviteAllow',
      'suggestInviteAllow',
      '暂无额外白名单账号（管理员邀请始终允许）'
    );

    // 3. Message Sender Filter Policy
    const msgPol = securityState.message_policy || 'all';
    document.querySelectorAll('#messagePolicyGroup .policy-option').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.msgPol === msgPol);
    });
    $('boxMessageAllowlist')?.classList.toggle('hidden', msgPol !== 'allowlist');
    $('boxMessageBlocklist')?.classList.toggle('hidden', msgPol !== 'blocklist');

    renderMxidList(
      'message_allowlist',
      'chipsMsgAllow',
      'suggestMsgAllow',
      '暂无额外白名单账号（仅管理员可触发对话）'
    );
    renderMxidList(
      'message_blocklist',
      'chipsMsgBlock',
      'suggestMsgBlock',
      '黑名单为空',
      true
    );

    // 4. Federation & Privacy Defense Switches
    if ($('toggleFedRoomGuard')) $('toggleFedRoomGuard').checked = securityState.federated_room_guard !== false;
    if ($('toggleIsolateUnbound')) $('toggleIsolateUnbound').checked = securityState.isolate_unbound_rooms !== false;
    if ($('toggleAdminOnlyWs')) $('toggleAdminOnlyWs').checked = Boolean(securityState.admin_only_workspace);
    if ($('toggleRedactSensitive')) $('toggleRedactSensitive').checked = securityState.redact_sensitive !== false;
    if ($('toggleRateLimit')) $('toggleRateLimit').checked = securityState.rate_limit_enabled !== false;
  }

  async function saveSecurityPatch(patch, toastMsg) {
    try {
      const res = await api('/api/config', 'POST', patch);
      if (res.admins) securityState.admins = res.admins;
      if (res.invite_policy) securityState.invite_policy = res.invite_policy;
      if (res.invite_allowlist) securityState.invite_allowlist = res.invite_allowlist;
      if (res.message_policy) securityState.message_policy = res.message_policy;
      if (res.message_allowlist) securityState.message_allowlist = res.message_allowlist;
      if (res.message_blocklist) securityState.message_blocklist = res.message_blocklist;
      for (const k of [
        'federated_room_guard',
        'isolate_unbound_rooms',
        'admin_only_workspace',
        'redact_sensitive',
        'rate_limit_enabled'
      ]) {
        if (res[k] !== undefined) securityState[k] = res[k];
      }
      renderSecurityView();
      if (patch.isolate_unbound_rooms !== undefined) {
        renderRooms();
      }
      if (toastMsg) showToast(toastMsg);
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  function wireMxidAdder(inputId, btnId, listKey, allowWildcard = false, successPrefix = '已添加') {
    const input = $(inputId);
    const btn = $(btnId);
    if (!input || !btn) return;

    const submit = async () => {
      const raw = input.value.trim();
      if (!raw) return;
      if (raw === '*') {
        showToast('安全限制：不支持使用全量 * 通配符', 'error');
        return;
      }
      const parsed = normalizeClientMxids(raw, allowWildcard);
      if (parsed.length === 0) {
        showToast(
          allowWildcard
            ? '请输入有效的 Matrix ID (@user:server) 或域名规则 (@*:domain)'
            : '管理员仅支持具体 Matrix 账号 (@user:server)，不支持通配符',
          'error'
        );
        return;
      }
      const current = securityState[listKey] || [];
      const merged = Array.from(new Set([...current, ...parsed]));
      input.value = '';
      await saveSecurityPatch({ [listKey]: merged }, `${successPrefix}: ${parsed.join(', ')}`);
    };

    btn.addEventListener('click', submit);
    input.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') {
        ev.preventDefault();
        submit();
      }
    });
  }

  // ---------- Load Status & Config ----------
  async function refreshStatus() {
    try {
      const s = await api('/api/status');
      statusState = s;
      renderHeaderAndAccount();

      if (!initialRouteDone) {
        initialRouteDone = true;
        switchView(s.configured ? 'view-rooms' : 'view-settings');
      }
    } catch (_) {}
  }

  async function loadConfig() {
    try {
      const cfg = await api('/api/config');
      if (document.activeElement !== $('inputHomeserver')) {
        $('inputHomeserver').value = cfg.homeserver || 'http://192.168.124.203:18010';
      }
      if (document.activeElement !== $('inputUsername')) {
        $('inputUsername').value = cfg.username || '';
      }
      if (document.activeElement !== $('inputAccessToken')) {
        $('inputAccessToken').value = cfg.access_token || '';
      }
      if (document.activeElement !== $('inputBaseDir')) {
        $('inputBaseDir').value = cfg.base_dir || '';
      }
      if (document.activeElement !== $('inputCodexCmd')) {
        $('inputCodexCmd').value = cfg.codex_cmd || '';
      }

      statusState.default_policy = cfg.default_policy || 'mention';
      statusState.default_model = cfg.default_model || '';
      statusState.default_effort = cfg.default_effort || '';
      statusState.server_domain = cfg.server_domain || '';

      const defaultPol = cfg.default_policy || 'mention';
      document.querySelectorAll('#globalPolicyGroup .policy-option').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.policy === defaultPol);
      });

      renderDefaultModelSelect(cfg.default_model || '');
      renderGlobalEffort(cfg.default_effort || '');

      securityState = {
        server_domain: cfg.server_domain || '',
        admins: cfg.admins || [],
        invite_policy: cfg.invite_policy || 'all',
        invite_allowlist: cfg.invite_allowlist || [],
        message_policy: cfg.message_policy || 'all',
        message_allowlist: cfg.message_allowlist || [],
        message_blocklist: cfg.message_blocklist || [],
        federated_room_guard: cfg.federated_room_guard !== false,
        isolate_unbound_rooms: cfg.isolate_unbound_rooms !== false,
        admin_only_workspace: Boolean(cfg.admin_only_workspace),
        redact_sensitive: cfg.redact_sensitive !== false,
        rate_limit_enabled: cfg.rate_limit_enabled !== false,
        known_peers: cfg.known_peers || []
      };
      renderSecurityView();
    } catch (_) {}
  }

  async function loadProjects() {
    try {
      const res = await api('/api/projects');
      projectsList = res.projects || [];
      $('projectCountMeta').textContent = `一级目录 ${projectsList.length} 个 · 支持多级下钻`;
    } catch (_) {}
  }

  // ---------- Rooms & Multi-Level Directory Explorer ----------
  let lastRoomsSignature = '';

  async function refreshRooms(forceRender = false) {
    try {
      const res = await api('/api/rooms');
      roomsList = res.rooms || [];
      statusState.room_count = roomsList.length;
      $('roomCountBadge').textContent = String(roomsList.length);

      const sig = JSON.stringify(roomsList.map(r => [
        r.id, r.name, r.is_dm, r.member_count, r.policy, r.effective_policy,
        r.workspace, r.model, r.effort, r.is_federated, r.encrypted
      ]));
      if (forceRender || (sig !== lastRoomsSignature && !openPickerRoomId && !openModelRoomId)) {
        lastRoomsSignature = sig;
        renderRooms();
      }
    } catch (e) {
      if (forceRender) {
        $('roomsContainer').innerHTML = `<div class="empty-card"><div class="empty-title">加载房间失败</div><div class="empty-desc">${escapeHtml(e.message)}</div></div>`;
      }
    }
  }

  function formatPolicyHint(room) {
    if (room.is_dm) return '默认(直回)';
    const g = statusState.default_policy || 'mention';
    if (g === 'all') return '默认(全回)';
    if (g === 'mute') return '默认(静音)';
    return '默认(@)';
  }

  function formatRoomModelSummary(room) {
    const hasCustom = Boolean(room.model || room.effort);
    const effModel = room.model || statusState.default_model || 'CLI 默认模型';
    const effEffort = room.effort || statusState.default_effort || '';
    const effortPart = effEffort ? ` · 思考:${effEffort.toUpperCase()}` : '';
    return {
      hasCustom,
      title: hasCustom ? `${effModel}${effortPart}` : `跟随默认 (${effModel}${effortPart})`
    };
  }

  function mountMultiLevelExplorer(card, room, title) {
    const hostSlot = card.querySelector('.js-host-ws-slot');
    const filterInput = card.querySelector('.js-proj-filter');
    const browserHead = card.querySelector('.js-ws-browser-head');
    const listEl = card.querySelector('.js-proj-list');
    const customInput = card.querySelector('.js-custom-ws');
    const customBtn = card.querySelector('.js-bind-custom');

    if (activeHostWorkspaces.length > 0) {
      const wsPath = activeHostWorkspaces[0];
      const wsName = wsPath.split('/').filter(Boolean).pop() || wsPath;
      const quickBtn = document.createElement('button');
      quickBtn.type = 'button';
      quickBtn.className = 'picker-Quick-btn';
      quickBtn.innerHTML = `<span>绑定当前窗口项目：${escapeHtml(wsName)}</span><span>一键绑定</span>`;
      quickBtn.addEventListener('click', () => bindRoomWorkspace(room.id, title, wsPath));
      hostSlot.appendChild(quickBtn);
    }

    const renderDirRows = (dirs, showRelPath = false) => {
      if (!dirs || dirs.length === 0) {
        listEl.innerHTML = `<div class="field-hint" style="padding:8px 6px;text-align:center;">当前层级下无更多子目录，可直接点击上方「绑定此目录」</div>`;
        return;
      }
      listEl.innerHTML = '';
      dirs.forEach(d => {
        const isCur = room.workspace === d.path;
        const row = document.createElement('div');
        row.className = `picker-dir-row ${isCur ? 'current' : ''}`;

        const labelText = showRelPath ? (d.rel_path || d.name) : d.name;
        const subHint = d.sub_count > 0 ? `<span class="dir-badge">${d.sub_count}个子目录 ▸</span>` : '';
        const repoBadge = d.is_repo ? `<span class="dir-badge repo">Git</span>` : '';

        row.innerHTML = `
          <button type="button" class="picker-dir-enter" title="点击进入「${escapeHtml(d.name)}」查看下级子目录">
            <span class="dir-left">
              <svg class="dir-folder-icon" viewBox="0 0 16 16" width="13" height="13" fill="currentColor">
                <path d="M1.75 2.5A1.25 1.25 0 0 0 .5 3.75v8.5A1.25 1.25 0 0 0 1.75 13.5h12.5a1.25 1.25 0 0 0 1.25-1.25v-6.5A1.25 1.25 0 0 0 14.25 4.5H7.62l-1.35-1.6A1.25 1.25 0 0 0 5.31 2.5H1.75z"/>
              </svg>
              <span class="dir-name-text">${escapeHtml(labelText)}</span>
            </span>
            <span class="dir-meta-badges">
              ${repoBadge}
              ${subHint}
            </span>
          </button>
          <button type="button" class="picker-dir-bind" title="直接绑定 ${escapeHtml(d.path)}">${isCur ? '已绑定' : '绑定'}</button>
        `;

        // 点击左侧目录名：下钻进入该子目录浏览其下级目录
        row.querySelector('.picker-dir-enter').addEventListener('click', () => {
          filterInput.value = '';
          browseTo(d.path);
        });

        // 点击右侧「绑定」：直接将该目录绑定为房间工作区
        row.querySelector('.picker-dir-bind').addEventListener('click', () => {
          bindRoomWorkspace(room.id, title, d.path);
        });

        listEl.appendChild(row);
      });
    };

    const browseTo = async (targetPath = '') => {
      try {
        const res = await api(`/api/fs/browse?path=${encodeURIComponent(targetPath || '')}`);
        openPickerBrowsePath = res.current_path;
        customInput.value = res.current_path;
        browserHead.classList.remove('hidden');

        const crumbsHtml = (res.breadcrumbs || []).map((c, idx, arr) => {
          const isLast = idx === arr.length - 1;
          return `
            <button type="button" class="ws-crumb ${isLast ? 'current' : ''}" data-crumb-path="${escapeHtml(c.path)}" title="${escapeHtml(c.path)}">${escapeHtml(c.name)}</button>
            ${!isLast ? '<span class="ws-crumb-sep">/</span>' : ''}
          `;
        }).join('');

        const isCurBound = room.workspace === res.current_path;
        browserHead.innerHTML = `
          <div class="ws-crumb-row">
            ${!res.is_base && res.parent_path ? `<button type="button" class="ws-up-btn js-go-up" title="返回上一级 (${escapeHtml(res.parent_path)})">↑ 上级</button>` : ''}
            ${!res.is_within_base ? `<button type="button" class="ws-up-btn js-go-base" title="回到默认根目录">🏠 默认目录</button>` : ''}
            ${crumbsHtml}
          </div>
          <div class="ws-cur-bar">
            <span class="ws-cur-path" title="${escapeHtml(res.current_path)}">当前：${escapeHtml(res.rel_current === '.' ? res.current_path : res.rel_current)}</span>
            <button type="button" class="btn btn-xs ${isCurBound ? 'btn-subtle' : 'btn-primary'} js-bind-cur-dir">${isCurBound ? '✓ 已绑定此目录' : '绑定当前目录'}</button>
          </div>
        `;

        browserHead.querySelector('.js-go-up')?.addEventListener('click', () => browseTo(res.parent_path));
        browserHead.querySelector('.js-go-base')?.addEventListener('click', () => browseTo(res.base_dir));
        browserHead.querySelectorAll('.ws-crumb').forEach(btn => {
          btn.addEventListener('click', () => browseTo(btn.dataset.crumbPath));
        });
        browserHead.querySelector('.js-bind-cur-dir')?.addEventListener('click', () => {
          bindRoomWorkspace(room.id, title, res.current_path);
        });

        renderDirRows(res.dirs || [], false);
      } catch (err) {
        listEl.innerHTML = `<div class="field-hint" style="padding:6px;">目录读取失败: ${escapeHtml(err.message)}</div>`;
      }
    };

    let searchTimer = null;
    filterInput.addEventListener('input', () => {
      clearTimeout(searchTimer);
      const kw = filterInput.value.trim();
      if (!kw) {
        browseTo(openPickerBrowsePath || room.workspace || '');
        return;
      }
      searchTimer = setTimeout(async () => {
        try {
          const res = await api(`/api/fs/search?q=${encodeURIComponent(kw)}`);
          browserHead.classList.add('hidden');
          renderDirRows(res.results || [], true);
        } catch (_) {}
      }, 150);
    });

    const submitCustom = () => {
      const val = customInput.value.trim();
      if (!val) {
        showToast('请输入目录路径', 'error');
        return;
      }
      bindRoomWorkspace(room.id, title, val);
    };
    customBtn.addEventListener('click', submitCustom);
    customInput.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') submitCustom();
    });

    browseTo(openPickerBrowsePath || room.workspace || '');
  }

  function renderRooms() {
    const container = $('roomsContainer');
    if (!container) return;

    if (!statusState.configured && roomsList.length === 0) {
      container.innerHTML = `
        <div class="empty-card">
          <div class="empty-badge">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8">
              <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M15 12H3" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </div>
          <div class="empty-title">尚未登录 Matrix 账号</div>
          <div class="empty-desc">先前往「账号与模型」登录机器人账号，系统将自动同步私聊与群聊房间</div>
          <button type="button" class="btn btn-primary btn-sm" id="btnEmptyGoSetup">前往配置账号</button>
        </div>
      `;
      $('btnEmptyGoSetup')?.addEventListener('click', () => switchView('view-settings'));
      return;
    }

    const q = roomSearch.trim().toLowerCase();
    const filtered = roomsList.filter(r => {
      if (roomFilter === 'group' && r.is_dm) return false;
      if (roomFilter === 'dm' && !r.is_dm) return false;
      if (roomFilter === 'bound' && !r.workspace) return false;
      if (q) {
        const hay = `${r.name || ''} ${r.id || ''} ${r.workspace || ''} ${r.model || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    if (filtered.length === 0) {
      const emptyMsg = roomsList.length === 0
        ? (statusState.connected
          ? '连接已就绪。在 Matrix 客户端向机器人发起私聊或邀请入群后，房间会自动出现在这里。'
          : '当前暂无已缓存房间，启动同步后将自动拉取。')
        : '没有匹配当前筛选条件的房间。';
      container.innerHTML = `
        <div class="empty-card">
          <div class="empty-badge">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </div>
          <div class="empty-title">${roomsList.length === 0 ? '暂无房间记录' : '未找到匹配房间'}</div>
          <div class="empty-desc">${escapeHtml(emptyMsg)}</div>
        </div>
      `;
      return;
    }

    container.innerHTML = '';

    filtered.forEach(room => {
      const card = document.createElement('div');
      card.className = 'room-card';

      const isDm = Boolean(room.is_dm);
      const title = room.name || room.id;
      const initial = title.replace(/^[@#!]/, '').trim().charAt(0).toUpperCase() || 'R';
      const kindLabel = isDm
        ? '私聊'
        : (room.member_count > 0 ? `群聊 · ${room.member_count}人` : '群聊');

      const curPol = room.policy || 'default';
      const isBound = Boolean(room.workspace);
      const boundFolderName = isBound ? room.workspace.split('/').filter(Boolean).pop() : '';
      const unboundLabel = securityState.isolate_unbound_rooms !== false
        ? '未绑定目录（安全沙箱隔离中）'
        : '未单独绑定（使用默认目录）';
      const isPickerOpen = openPickerRoomId === room.id;
      const isModelOpen = openModelRoomId === room.id;
      const modelSummary = formatRoomModelSummary(room);

      const fedBadgeHtml = room.is_federated
        ? `<span class="room-fed-tag" title="检测到外部联邦服务器: ${escapeHtml((room.external_domains || []).join(', '))}">🌐 含外服</span>`
        : '';
      const encBadgeHtml = room.encrypted
        ? `<span class="room-fed-tag" style="background: rgba(16, 185, 129, 0.15); color: #34d399; border-color: rgba(16, 185, 129, 0.3);" title="端到端加密房间 (E2EE)">🔒 已加密</span>`
        : '';

      const roomModelVal = room.model || '';
      const roomEffortVal = room.effort || '';
      const modelOptionsHtml = [
        `<option value="">跟随全局默认 (${escapeHtml(statusState.default_model || 'CLI 默认')})</option>`
      ];
      const seenModels = new Set(['']);
      availableModels.forEach(m => {
        seenModels.add(m.id);
        modelOptionsHtml.push(
          `<option value="${escapeHtml(m.id)}" ${roomModelVal === m.id ? 'selected' : ''}>${escapeHtml(m.label)} (${escapeHtml(m.id)})</option>`
        );
      });
      if (roomModelVal && !seenModels.has(roomModelVal)) {
        modelOptionsHtml.push(`<option value="${escapeHtml(roomModelVal)}" selected>${escapeHtml(roomModelVal)}</option>`);
      }

      const effortButtonsHtml = EFFORT_OPTIONS.map(opt => `
        <button type="button" class="seg-pill ${roomEffortVal === opt.value ? 'active' : ''}" data-room-effort="${escapeHtml(opt.value)}">${escapeHtml(opt.label)}</button>
      `).join('');

      let extraAlert = '';
      if (room.migration_candidates?.length) {
        extraAlert += `
          <div class="room-notice-box warn" style="margin:8px 0;padding:10px 12px;background:var(--warning-soft);border:1px solid var(--warning-border);border-radius:var(--radius-sm);color:var(--text-primary);">
            <div style="display:flex;align-items:center;gap:6px;font-size:12px;font-weight:600;color:var(--warning);margin-bottom:6px;">
              <svg viewBox="0 0 16 16" width="13" height="13" fill="currentColor"><path d="M8 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13zM7.25 4.75h1.5v4h-1.5v-4zm0 5.25h1.5v1.5h-1.5V10z"/></svg>
              <span>发现旧会话候选，请指定延续哪个历史上下文：</span>
            </div>
            <div style="display:flex;gap:6px;flex-wrap:wrap;">`;
        for (const cand of room.migration_candidates) {
          const scopeStr = (cand.scopes || []).map(s => {
            const m = s.match(/@([^:]+)/);
            return m ? `@${m[1]}` : s;
          }).join(', ');
          const label = scopeStr ? `延续 ${scopeStr} 会话` : `延续 ${cand.thread_id.slice(0, 8)}...`;
          extraAlert += `<button type="button" class="btn btn-xs btn-outline js-pick-migration" data-thread="${escapeHtml(cand.thread_id)}" title="${escapeHtml(cand.thread_id)}" style="font-size:11px;padding:3px 8px;max-width:100%;text-overflow:ellipsis;overflow:hidden;white-space:nowrap;">${escapeHtml(label)}</button>`;
        }
        extraAlert += `</div></div>`;
      }
      if (room.blocked && (!room.migration_candidates || !room.migration_candidates.length)) {
        const pending = (room.pending || []).find(x => x.status !== 'queued');
        extraAlert += `
          <div class="room-notice-box danger" style="margin:8px 0;padding:10px 12px;background:var(--danger-soft);border:1px solid var(--danger-border);border-radius:var(--radius-sm);color:var(--text-primary);">
            <div style="font-size:12px;font-weight:600;color:var(--danger);margin-bottom:6px;">上一次执行结果未知，房间已自动暂停保护</div>
            <div style="font-size:11.5px;color:var(--text-secondary);margin-bottom:8px;">事件：${escapeHtml(pending?.id || '待处理事件')}</div>
            <button type="button" class="btn btn-xs btn-danger js-reconcile-event" data-event="${escapeHtml(pending?.id || '')}">核对无误并恢复队列</button>
          </div>`;
      }

      card.innerHTML = `
        <div class="room-head">
          <div class="room-identity">
            <div class="room-avatar ${isDm ? 'dm' : 'group'}">${escapeHtml(initial)}</div>
            <div class="room-title-wrap">
              <div class="room-title-row">
                <span class="room-title" title="${escapeHtml(title)}">${escapeHtml(title)}</span>
                <span class="room-kind-tag">${escapeHtml(kindLabel)}</span>
                ${fedBadgeHtml}
                ${encBadgeHtml}
              </div>
              <span class="room-id-line" data-copy-id="${escapeHtml(room.id)}" title="点击复制 Room ID">${escapeHtml(room.id)}</span>
            </div>
          </div>
        </div>

        ${extraAlert}

        <div class="room-policy-row">
          <span class="room-row-label">触发规则</span>
          <div class="seg-pills js-pol-group" role="group">
            <button type="button" class="seg-pill ${curPol === 'default' ? 'active' : ''}" data-pol="default">${escapeHtml(formatPolicyHint(room))}</button>
            <button type="button" class="seg-pill ${curPol === 'mention' ? 'active' : ''}" data-pol="mention">仅 @</button>
            <button type="button" class="seg-pill ${curPol === 'all' ? 'active' : ''}" data-pol="all">全部</button>
            <button type="button" class="seg-pill ${curPol === 'mute' ? 'active' : ''}" data-pol="mute">静音</button>
          </div>
        </div>

        <div class="ws-bar ${isBound ? 'bound' : ''}">
          <div class="ws-info">
            <svg class="ws-icon" viewBox="0 0 16 16" width="14" height="14" fill="currentColor">
              <path d="M1.75 2.5A1.25 1.25 0 0 0 .5 3.75v8.5A1.25 1.25 0 0 0 1.75 13.5h12.5a1.25 1.25 0 0 0 1.25-1.25v-6.5A1.25 1.25 0 0 0 14.25 4.5H7.62l-1.35-1.6A1.25 1.25 0 0 0 5.31 2.5H1.75z"/>
            </svg>
            <div class="ws-text-col">
              <span class="ws-name">${isBound ? escapeHtml(boundFolderName) : escapeHtml(unboundLabel)}</span>
              ${isBound ? `<span class="ws-path" title="${escapeHtml(room.workspace)}">${escapeHtml(room.workspace)}</span>` : ''}
            </div>
          </div>
          <div class="ws-actions">
            <button type="button" class="btn btn-xs btn-subtle js-toggle-picker">${isPickerOpen ? '收起' : (isBound ? '更换' : '绑定目录')}</button>
            ${isBound ? `<button type="button" class="btn btn-xs btn-ghost js-unbind-ws" title="解除绑定">解绑</button>` : ''}
          </div>
        </div>

        <div class="ws-picker ${isPickerOpen ? '' : 'hidden'}">
          <div class="js-host-ws-slot"></div>
          <input type="text" class="text-input js-proj-filter" placeholder="搜索多级子目录 (如 Developer/项目名)...">
          <div class="ws-browser-head js-ws-browser-head"></div>
          <div class="picker-list js-proj-list"></div>
          <div class="picker-custom-row">
            <input type="text" class="text-input mono js-custom-ws" placeholder="或直接输入任意多级路径..." value="${escapeHtml(room.workspace || '')}">
            <button type="button" class="btn btn-xs btn-primary js-bind-custom">确定</button>
          </div>
        </div>

        <div class="model-bar ${modelSummary.hasCustom ? 'customized' : ''}">
          <div class="ws-info">
            <svg class="ws-icon" viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5">
              <rect x="2.5" y="2.5" width="11" height="11" rx="2.5"></rect>
              <circle cx="8" cy="8" r="2"></circle>
            </svg>
            <div class="ws-text-col">
              <span class="ws-name" title="${escapeHtml(modelSummary.title)}">${escapeHtml(modelSummary.title)}</span>
            </div>
          </div>
          <div class="ws-actions">
            <button type="button" class="btn btn-xs btn-subtle js-toggle-model">${isModelOpen ? '收起' : '模型/思考'}</button>
            ${modelSummary.hasCustom ? `<button type="button" class="btn btn-xs btn-ghost js-reset-model" title="恢复跟随全局默认">默认</button>` : ''}
          </div>
        </div>

        <div class="model-picker ${isModelOpen ? '' : 'hidden'}">
          <div class="form-field">
            <span class="field-label">房间专属模型</span>
            <select class="select-input js-room-model-select">${modelOptionsHtml.join('')}</select>
          </div>
          <div class="form-field">
            <span class="field-label">房间思考深度</span>
            <div class="seg-pills full-seg js-room-effort-group">${effortButtonsHtml}</div>
          </div>
          <div class="label-split" style="padding-top:2px;">
            <span class="field-hint">${room.session_id ? `主会话 ID: ${escapeHtml(room.session_id.slice(0, 8))}...` : '当前尚无活跃会话缓存'}</span>
            <button type="button" class="btn btn-xs btn-ghost js-reset-room-session">重置会话上下文</button>
          </div>
        </div>
      `;

      // Copy Room ID
      card.querySelector('.room-id-line').addEventListener('click', () => {
        copyText(room.id, 'Room ID 已复制');
      });

      // Instant Policy Switch
      card.querySelectorAll('.js-pol-group .seg-pill').forEach(pillBtn => {
        pillBtn.addEventListener('click', async () => {
          const nextPol = pillBtn.dataset.pol;
          if (nextPol === room.policy) return;
          try {
            await api('/api/rooms/update', 'POST', { id: room.id, policy: nextPol });
            room.policy = nextPol;
            showToast(`「${title}」策略已切换为 ${pillBtn.textContent}`);
            await refreshRooms(true);
          } catch (err) {
            showToast(err.message, 'error');
          }
        });
      });

      // Pick Migration Candidate
      card.querySelectorAll('.js-pick-migration').forEach(btn => {
        btn.addEventListener('click', async () => {
          try {
            await api('/api/migration', 'POST', { id: room.id, thread_id: btn.dataset.thread });
            showToast('已确认会话迁移');
            await refreshRooms(true);
          } catch (e) {
            showToast(e.message, 'error');
          }
        });
      });

      // Reconcile Event
      card.querySelectorAll('.js-reconcile-event').forEach(btn => {
        btn.addEventListener('click', async () => {
          try {
            await api('/api/reconcile', 'POST', { id: room.id, event_id: btn.dataset.event });
            showToast('已核对未知结果，队列已恢复');
            await refreshRooms(true);
          } catch (e) {
            showToast(e.message, 'error');
          }
        });
      });

      // Unbind Workspace
      const unbindBtn = card.querySelector('.js-unbind-ws');
      if (unbindBtn) {
        unbindBtn.addEventListener('click', async () => {
          try {
            await api('/api/rooms/update', 'POST', { id: room.id, workspace: '' });
            openPickerRoomId = null;
            openPickerBrowsePath = '';
            showToast(`已解除「${title}」目录绑定`);
            await refreshRooms(true);
          } catch (err) {
            showToast(err.message, 'error');
          }
        });
      }

      // Toggle Multi-Level Workspace Explorer
      card.querySelector('.js-toggle-picker').addEventListener('click', () => {
        if (isPickerOpen) {
          openPickerRoomId = null;
          openPickerBrowsePath = '';
        } else {
          openPickerRoomId = room.id;
          openPickerBrowsePath = room.workspace || '';
          openModelRoomId = null;
        }
        renderRooms();
      });

      if (isPickerOpen) {
        mountMultiLevelExplorer(card, room, title);
      }

      // Toggle Per-Room Model & Effort Drawer
      card.querySelector('.js-toggle-model').addEventListener('click', () => {
        openModelRoomId = isModelOpen ? null : room.id;
        if (openModelRoomId) {
          openPickerRoomId = null;
          openPickerBrowsePath = '';
        }
        renderRooms();
      });

      const resetModelBtn = card.querySelector('.js-reset-model');
      if (resetModelBtn) {
        resetModelBtn.addEventListener('click', async () => {
          try {
            await api('/api/rooms/update', 'POST', { id: room.id, model: '', effort: '' });
            openModelRoomId = null;
            showToast(`「${title}」已恢复跟随全局默认模型与思考深度`);
            await refreshRooms(true);
          } catch (err) {
            showToast(err.message, 'error');
          }
        });
      }

      if (isModelOpen) {
        const roomModelSel = card.querySelector('.js-room-model-select');
        roomModelSel.addEventListener('change', async () => {
          try {
            await api('/api/rooms/update', 'POST', { id: room.id, model: roomModelSel.value });
            room.model = roomModelSel.value;
            showToast(`「${title}」模型已更新`);
            await refreshRooms(true);
          } catch (err) {
            showToast(err.message, 'error');
          }
        });

        card.querySelectorAll('.js-room-effort-group .seg-pill').forEach(efBtn => {
          efBtn.addEventListener('click', async () => {
            const ef = efBtn.dataset.roomEffort || '';
            if (ef === (room.effort || '')) return;
            try {
              await api('/api/rooms/update', 'POST', { id: room.id, effort: ef });
              room.effort = ef;
              showToast(`「${title}」思考深度已设为 ${ef || '默认'}`);
              await refreshRooms(true);
            } catch (err) {
              showToast(err.message, 'error');
            }
          });
        });

        card.querySelector('.js-reset-room-session').addEventListener('click', async () => {
          try {
            await api('/api/rooms/update', 'POST', { id: room.id, reset_session: true });
            showToast(`已重置「${title}」对话上下文`);
            await refreshRooms(true);
          } catch (err) {
            showToast(err.message, 'error');
          }
        });
      }

      container.appendChild(card);
    });
  }

  async function bindRoomWorkspace(roomId, roomTitle, targetPath) {
    try {
      await api('/api/rooms/update', 'POST', { id: roomId, workspace: targetPath });
      openPickerRoomId = null;
      openPickerBrowsePath = '';
      const folder = targetPath.split('/').filter(Boolean).pop() || targetPath;
      showToast(`「${roomTitle}」已绑定至 ${folder}`);
      await refreshRooms(true);
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  // ---------- Activity Logs ----------
  async function refreshLogs() {
    try {
      const res = await api('/api/logs');
      logsList = res.logs || [];
      renderLogs();
    } catch (_) {}
  }

  function renderLogs() {
    const box = $('logStream');
    if (!box) return;
    const filtered = logsList.filter(item => {
      if (logFilter === 'msg') return item.level === 'msg';
      if (logFilter === 'sec') return item.level === 'sec';
      if (logFilter === 'error') return item.level === 'error' || item.level === 'warn';
      return true;
    });

    if (filtered.length === 0) {
      box.innerHTML = `<div class="log-empty">暂无符合条件的运行记录</div>`;
      return;
    }

    box.innerHTML = '';
    filtered.slice(-120).forEach(item => {
      const row = document.createElement('div');
      row.className = 'log-row';
      const lvl = (item.level || 'info').toLowerCase();
      const ts = item.time ? item.time.slice(11, 19) : '';
      const extra = item.data && Object.keys(item.data).length ? ' ' + JSON.stringify(item.data) : '';
      row.innerHTML = `
        <span class="log-ts">${escapeHtml(ts)}</span>
        <span class="log-tag ${escapeHtml(lvl)}">${escapeHtml(lvl.toUpperCase())}</span>
        <span class="log-body">${escapeHtml(item.message)}${escapeHtml(extra)}</span>
      `;
      box.appendChild(row);
    });
    box.scrollTop = box.scrollHeight;
  }

  // ---------- Event Listeners ----------
  $('roomSearchInput').addEventListener('input', (e) => {
    roomSearch = e.target.value;
    renderRooms();
  });

  document.querySelectorAll('#roomFilterBar .filter-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      roomFilter = chip.dataset.filter;
      document.querySelectorAll('#roomFilterBar .filter-chip').forEach(c => c.classList.toggle('active', c === chip));
      renderRooms();
    });
  });

  $('btnRefreshRooms').addEventListener('click', async () => {
    await Promise.all([loadProjects(), loadConfig(), refreshRooms(true)]);
    showToast('房间与项目列表已刷新');
  });

  // Security View Bindings
  wireMxidAdder('inputAddAdmin', 'btnAddAdmin', 'admins', false, '已添加管理员');
  wireMxidAdder('inputAddInviteAllow', 'btnAddInviteAllow', 'invite_allowlist', true, '已加入邀请白名单');
  wireMxidAdder('inputAddMsgAllow', 'btnAddMsgAllow', 'message_allowlist', true, '已加入消息白名单');
  wireMxidAdder('inputAddMsgBlock', 'btnAddMsgBlock', 'message_blocklist', true, '已加入消息黑名单');

  document.querySelectorAll('#invitePolicyGroup .policy-option').forEach(btn => {
    btn.addEventListener('click', () => {
      const nextPol = btn.dataset.invitePol;
      if (nextPol === securityState.invite_policy) return;
      const labelMap = {
        all: '接受所有人邀请',
        local_server: '仅接受本服务器用户邀请',
        allowlist: '仅接受白名单邀请',
        none: '拒绝所有新邀请'
      };
      saveSecurityPatch({ invite_policy: nextPol }, `邀请策略已更新：${labelMap[nextPol] || nextPol}`);
    });
  });

  document.querySelectorAll('#messagePolicyGroup .policy-option').forEach(btn => {
    btn.addEventListener('click', () => {
      const nextPol = btn.dataset.msgPol;
      if (nextPol === securityState.message_policy) return;
      const labelMap = {
        all: '接收所有人消息',
        local_server: '仅接收本服务器用户消息',
        allowlist: '仅接收白名单消息',
        blocklist: '拦截黑名单消息',
        none: '拒绝所有对话消息（仅保留管理员命令）'
      };
      saveSecurityPatch({ message_policy: nextPol }, `消息准入已更新：${labelMap[nextPol] || nextPol}`);
    });
  });

  // Federation & Privacy Defense Switches
  const bindSecurityToggle = (elId, key, onMsg, offMsg) => {
    const el = $(elId);
    if (!el) return;
    el.addEventListener('change', () => {
      saveSecurityPatch({ [key]: el.checked }, el.checked ? onMsg : offMsg);
    });
  };

  bindSecurityToggle(
    'toggleFedRoomGuard',
    'federated_room_guard',
    '已开启：含外部联邦成员的群聊自动静默保护',
    '已关闭：允许在含外服成员的群聊中响应'
  );
  bindSecurityToggle(
    'toggleIsolateUnbound',
    'isolate_unbound_rooms',
    '已开启：未绑定目录房间强制沙箱隔离',
    '已关闭：未绑定房间将回退使用默认项目根目录'
  );
  bindSecurityToggle(
    'toggleAdminOnlyWs',
    'admin_only_workspace',
    '已开启：仅管理员可触发本地工作区执行',
    '已关闭：允许准入名单内的群成员触发对话'
  );
  bindSecurityToggle(
    'toggleRedactSensitive',
    'redact_sensitive',
    '已开启：出站回复路径与密钥自动脱敏',
    '已关闭：出站回复不做自动脱敏'
  );
  bindSecurityToggle(
    'toggleRateLimit',
    'rate_limit_enabled',
    '已开启：非管理员防洪限流与超长载荷保护',
    '已关闭：非管理员请求频次限制'
  );

  // Header Start / Stop Sync
  $('btnToggleSync').addEventListener('click', async () => {
    const btn = $('btnToggleSync');
    btn.disabled = true;
    try {
      if (statusState.connected) {
        await api('/api/disconnect', 'POST');
        showToast('已暂停 Matrix 实时同步');
      } else {
        await api('/api/connect', 'POST');
        showToast('已启动 Matrix 实时同步');
      }
      await refreshStatus();
      setTimeout(() => refreshRooms(true), 1200);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      btn.disabled = false;
    }
  });

  // Switch / Logout Account
  $('btnSwitchAccount').addEventListener('click', () => {
    editingAuth = true;
    renderHeaderAndAccount();
  });

  $('btnCancelEditAuth').addEventListener('click', () => {
    editingAuth = false;
    renderHeaderAndAccount();
  });

  $('btnLogoutAccount').addEventListener('click', async () => {
    try {
      await api('/api/logout', 'POST');
      editingAuth = false;
      $('inputAccessToken').value = '';
      $('inputPassword').value = '';
      showToast('已退出解绑当前账号');
      await refreshStatus();
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  // Password Login & Auto-Connect
  $('btnSubmitLogin').addEventListener('click', async () => {
    const homeserver = $('inputHomeserver').value.trim();
    const username = $('inputUsername').value.trim();
    const password = $('inputPassword').value;
    if (!homeserver || !username || !password) {
      showToast('请完整填写服务器地址、Bot 用户名与密码', 'error');
      return;
    }
    const btn = $('btnSubmitLogin');
    btn.disabled = true;
    btn.textContent = '正在鉴权并连接...';
    try {
      const res = await api('/api/login', 'POST', { homeserver, username, password, auto_start: true });
      $('inputPassword').value = '';
      $('inputAccessToken').value = res.access_token || '';
      editingAuth = false;
      showToast(`已成功接入 ${res.user_id}`);
      await Promise.all([refreshStatus(), loadConfig()]);
      switchView('view-rooms');
      setTimeout(() => refreshRooms(true), 1500);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = '登录并启动连接';
    }
  });

  // Token Verify & Auto-Connect
  $('btnSubmitToken').addEventListener('click', async () => {
    const homeserver = $('inputHomeserver').value.trim();
    const access_token = $('inputAccessToken').value.trim();
    if (!homeserver || !access_token) {
      showToast('请填写服务器地址与 Access Token', 'error');
      return;
    }
    const btn = $('btnSubmitToken');
    btn.disabled = true;
    btn.textContent = '正在校验凭证...';
    try {
      const res = await api('/api/verify-token', 'POST', { homeserver, access_token, auto_start: true });
      editingAuth = false;
      showToast(`凭证校验通过：${res.user_id}`);
      await Promise.all([refreshStatus(), loadConfig()]);
      switchView('view-rooms');
      setTimeout(() => refreshRooms(true), 1500);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = '验证 Token 并启动';
    }
  });

  // Global Default Model & Effort Auto-Save
  $('selectDefaultModel').addEventListener('change', async (e) => {
    const default_model = e.target.value;
    try {
      await api('/api/config', 'POST', { default_model });
      statusState.default_model = default_model;
      showToast(default_model ? `全局默认模型已设为 ${default_model}` : '全局模型已恢复 CLI 默认');
      renderRooms();
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  document.querySelectorAll('#globalEffortGroup .seg-pill').forEach(btn => {
    btn.addEventListener('click', async () => {
      const default_effort = btn.dataset.effort || '';
      if (default_effort === (statusState.default_effort || '')) return;
      renderGlobalEffort(default_effort);
      try {
        await api('/api/config', 'POST', { default_effort });
        statusState.default_effort = default_effort;
        showToast(default_effort ? `全局默认思考深度已设为 ${default_effort.toUpperCase()}` : '全局思考深度已恢复默认');
        renderRooms();
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  });

  // Global Default Policy Auto-Save
  document.querySelectorAll('#globalPolicyGroup .policy-option').forEach(btn => {
    btn.addEventListener('click', async () => {
      const pol = btn.dataset.policy;
      document.querySelectorAll('#globalPolicyGroup .policy-option').forEach(b => b.classList.toggle('active', b === btn));
      try {
        await api('/api/config', 'POST', { default_policy: pol });
        statusState.default_policy = pol;
        showToast('群聊默认触发策略已更新');
        renderRooms();
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  });

  // Save Base Projects Dir
  $('btnSaveBaseDir').addEventListener('click', async () => {
    const base_dir = $('inputBaseDir').value.trim();
    try {
      await api('/api/config', 'POST', { base_dir });
      await loadProjects();
      showToast('项目根目录已更新');
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  // Save Codex CLI Path
  const btnSaveCmd = $('btnSaveCodexCmd') || $('btnSaveZcodeCmd');
  btnSaveCmd?.addEventListener('click', async () => {
    const codex_cmd = $('inputCodexCmd')?.value.trim();
    try {
      await api('/api/config', 'POST', { codex_cmd });
      await loadModels();
      showToast('CLI 执行路径已保存');
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  // Copyable Chat Commands
  document.querySelectorAll('.cmd-item').forEach(btn => {
    btn.addEventListener('click', () => {
      copyText(btn.dataset.copyCmd, `已复制指令: ${btn.dataset.copyCmd}`);
    });
  });

  // Log Filters & Clear
  document.querySelectorAll('#logFilterBar .filter-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      logFilter = chip.dataset.logFilter;
      document.querySelectorAll('#logFilterBar .filter-chip').forEach(c => c.classList.toggle('active', c === chip));
      renderLogs();
    });
  });

  $('btnClearLogs').addEventListener('click', async () => {
    try {
      await api('/api/logs/clear', 'POST');
      logsList = [];
      renderLogs();
      showToast('运行日志已清空');
    } catch (_) {}
  });

  // ---------- Bootstrap ----------
  async function init() {
    await Promise.all([loadConfig(), loadModels(), loadProjects(), refreshStatus()]);
    await Promise.all([refreshRooms(true), refreshLogs()]);

    setInterval(async () => {
      await refreshStatus();
      await refreshRooms(false);
    }, 3500);

    setInterval(() => {
      if ($('view-activity')?.classList.contains('active')) {
        refreshLogs();
      }
    }, 4000);
  }

  init();
})();
