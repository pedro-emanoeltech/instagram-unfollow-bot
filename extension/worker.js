(() => {
  const VERSION = '1.22.0';
  let expectedAccount = ''; 
  if (globalThis.__igLocalWorker) return;
  globalThis.__igLocalWorker = true;
  let running = false;
  let stopped = false;
  let wakePause;
  let pipelineActive = false;
  let paused = false;
  let resumePause;
  let control;
  let requestSequence = 0;
  const recordHttp = async record => {
    const history = (await chrome.storage.local.get('igLocalHttp')).igLocalHttp ?? [];
    await chrome.storage.local.set({igLocalHttp:[...history,record]});
  };
  const saveControl = () => chrome.storage.local.set({igLocalControl: control});
  async function checkpoint() {
    while (paused) await new Promise(resolve => { resumePause = resolve; });
    resumePause = undefined;
    if (stopped) throw new Error('Parado pelo usuário.');
  }
  const wait = async until => {
    try {
      if (Date.now() < until) await chrome.runtime.sendMessage({kind:'ig-local-schedule-wake',when:until});
      while (Date.now() < until) {
        if (stopped) throw new Error('Parado pelo usuário.');
        await new Promise(resolve => { wakePause = resolve; setTimeout(resolve, Math.min(1000, until - Date.now())); });
      }
      if (stopped) throw new Error('Parado pelo usuário.');
    } finally {
      wakePause = undefined;
      await chrome.runtime.sendMessage({kind:'ig-local-clear-wake'}).catch(() => {});
    }
  };
  const cookie = name => document.cookie.split(';').map(value => value.trim()).find(value => value.startsWith(name + '='))?.slice(name.length + 1);
  async function request(path, method = 'GET', observe, extra = {}) {
    await checkpoint();
    if (stopped) throw new Error('Parado pelo usuário.');
    const csrf = cookie('csrftoken');
    if (!csrf) throw new Error('Sessão não encontrada nesta aba. Faça login no Instagram.');
    const startedAt = Date.now();
    const requestId = `${startedAt}-${++requestSequence}`;
    const secrets = document.cookie.split(';').map(part => part.trim().split('=').slice(1).join('='));
    if (extra.body) {
      const fields = new URLSearchParams(extra.body);
      for (const name of ['fb_dtsg','lsd','jazoest','av']) if (fields.get(name)) secrets.push(fields.get(name));
    }
    const redact = input => {
      let text = String(input ?? '');
      for (const secret of secrets.filter(value=>value.length>=6)) {
        text = text.split(secret).join('[REMOVIDO]');
        try { text = text.split(decodeURIComponent(secret)).join('[REMOVIDO]'); } catch {}
      }
      return text.replace(/https?:\/\/[^\s<>"']+/gi,'[URL]').replace(/<[^>]*>/g,' ')
        .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,'[EMAIL]')
        .replace(/(?:sessionid|csrftoken|fb_dtsg|lsd)\s*[:=]\s*[^\s,;]+/gi,'[CREDENCIAL]')
        .replace(/[a-zA-Z0-9_%=+\/-]{40,}/g,'[DADO LONGO]').slice(0,600);
    };
    let response;
    try { response = await fetch(path, {
      method, credentials: 'same-origin', redirect: 'error', signal: AbortSignal.timeout(30000),
      ...(method === 'POST' ? {body: extra.body} : {}),
      headers: { 'X-IG-App-ID': '936619743392459', 'X-CSRFToken': csrf,
        'Accept': 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
        ...(method === 'POST' ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
        ...(extra.headers ?? {}) },
    }); } catch (cause) {
      await recordHttp({time:new Date().toISOString(),version:VERSION,request_id:requestId,method,
        route:path.split('?')[0].replace(/\d{3,}/g,'{id}'),username:extra.targetUsername ?? null,
        format:'network_error',http_status:null,duration_ms:Date.now()-startedAt,
        error_name:redact(cause.name),message:redact(cause.message),
        online:typeof navigator.onLine === 'boolean' ? navigator.onLine : null,
        visibility:document.visibilityState ?? null});
      const error = new Error(`Falha sem resposta HTTP (${cause.name}). Referência ${requestId}. Resultado da ação não confirmado.`);
      error.requestId = requestId; throw error;
    }
    if (observe) await observe(response);
    const raw = await response.text();
    let result;
    try { result = JSON.parse(raw); } catch { result = null; }
    const type = response.headers.get('content-type') || '';
    const retry = response.headers.get('retry-after');
    const safeResponse = {
      time: new Date().toISOString(), version: VERSION, method,
      request_id:requestId,duration_ms:Date.now()-startedAt,username:extra.targetUsername ?? null,
      route: path.split('?')[0].replace(/\d{3,}/g, '{id}'),
      http_status: response.status,
      content_type: type.split(';')[0].replace(/[^a-zA-Z0-9/+.\-]/g, ''),
      response_length: raw.length,
      retry_after_seconds: retry && /^\d+$/.test(retry) ? Number(retry) : null,
      format: result && typeof result === 'object' ? 'json' : /^\s*(?:<!doctype|<html)/i.test(raw) ? 'html' : 'other',
      json_status: ['ok','fail'].includes(result?.status) ? result.status : null,
      following: typeof (result?.data?.xdt_destroy_friendship?.friendship_status?.following ?? result?.friendship_status?.following) === 'boolean' ? (result?.data?.xdt_destroy_friendship?.friendship_status?.following ?? result?.friendship_status?.following) : null,
      graphql_errors: Array.isArray(result?.errors) ? result.errors.length : 0,
      graphql_error_details: Array.isArray(result?.errors) ? result.errors.slice(0,5).map(error => {
        const description = [error.message,error.description,error.summary,error.error_user_msg,error.extensions?.error_user_msg].filter(Boolean).join(' ');
        const code = error.code ?? error.extensions?.code;
        return {
          code: typeof code === 'number' || (typeof code === 'string' && /^[a-zA-Z0-9_]{1,60}$/.test(code)) ? code : null,
          transient: typeof error.is_transient === 'boolean' ? error.is_transient : null,
          api_error_code: typeof (error.api_error_code ?? error.extensions?.api_error_code) === 'number' ? (error.api_error_code ?? error.extensions.api_error_code) : null,
          message:redact(error.message),description:redact(error.description),
          summary:redact(error.summary),type:redact(error.type),severity:redact(error.severity),
          user_title:redact(error.error_user_title ?? error.extensions?.error_user_title),
          user_message:redact(error.error_user_msg ?? error.extensions?.error_user_msg),
          path:Array.isArray(error.path) ? error.path.slice(0,8).map(value=>redact(value)) : [],
          category: /rate.limit|too many|please wait|try again later|temporarily.block|tente novamente mais tarde|aguarde alguns|restringimos|limitamos|actividad.{0,20}restring/i.test(description) ? 'possible_limit' : /challenge|checkpoint|verifique sua identidade/i.test(description) ? 'verification' : /login|session|authenticat|sessão expirada|autentica/i.test(description) ? 'authentication' : /csrf/i.test(description) ? 'csrf' : 'unspecified',
        };
      }) : [],
      login_hint: /login_required|log into instagram|loginform/i.test(raw),
      challenge_hint: !!result?.challenge || !!result?.checkpoint_url || /challenge_required|checkpoint_required/i.test(raw),
      csrf_hint: /csrf.*(?:failed|missing|invalid)/i.test(raw),
      rate_limit_hint: response.status === 429 || /too many requests|rate limit|please wait a few minutes/i.test(raw),
    };
    await recordHttp(safeResponse);
    if (!response.ok) {
      const retry = response.headers.get('retry-after');
      const retryInfo = retry && /^\d+$/.test(retry) ? ` Retry-After: ${retry} segundos.` : '';
      throw new Error(`HTTP ${response.status} em ${path.split('?')[0]}.${retryInfo} Execução interrompida; sem repetição automática.`);
    }
    if (!result || typeof result !== 'object') throw new Error(`HTTP ${response.status}: resposta ${safeResponse.format}, tipo ${safeResponse.content_type || 'ausente'}. Baixe o log HTTP para diagnóstico; resultado da ação não confirmado.`);
    if (result.status === 'fail' || result.challenge || result.checkpoint_url || result.spam || result.errors?.length) {
      const first = safeResponse.graphql_error_details[0];
      const error = new Error(first ? `GraphQL ${first.code ?? 'sem código'}: ${first.message || first.description || 'sem descrição'}. Referência ${requestId}.` : `Instagram recusou a operação ou exige verificação. Referência ${requestId}.`);
      error.requestId = requestId;
      const hardCategories = ['possible_limit','verification','authentication','csrf'];
      error.profileFailure = method === 'POST' && path === '/api/graphql' && Array.isArray(result.errors) && result.errors.length > 0 &&
        !result.challenge && !result.checkpoint_url && !result.spam && !result.require_login &&
        !safeResponse.rate_limit_hint && !safeResponse.login_hint && !safeResponse.challenge_hint && !safeResponse.csrf_hint &&
        !safeResponse.graphql_error_details.some(detail => hardCategories.includes(detail.category));
      throw error;
    }
    return result;
  }
  async function identify() {
    const id = cookie('ds_user_id');
    if (!id || !/^\d+$/.test(id)) throw new Error('Cookie de identificação ausente ou inválido.');
    const identity = await request('/api/v1/accounts/edit/web_form_data/');
    const form = identity.form_data;
    const responseId = form?.user_id ?? form?.username_id ?? form?.pk ?? form?.id;
    if (identity.status !== 'ok' || (expectedAccount && form?.username?.toLowerCase() !== expectedAccount) ||
      (responseId != null && String(responseId) !== id)) throw new Error('Conta autenticada não corresponde à conta esperada.');
    const username = form?.username?.toLowerCase();
    if (!/^[a-z0-9._]{1,30}$/.test(username || '')) throw new Error('Conta autenticada inválida.');
    return {id, username, totals: {followers:form.follower_count, following:form.following_count}};
  }
  async function prepare(data = {}) {
    expectedAccount = data?.account || ''; 
    running = true; stopped = false;
    const report = { version: VERSION, time: new Date().toISOString(), ready: false, events: [] };
    const log = async (event, detail) => {
      report.events.push({ time: new Date().toISOString(), event, detail });
      await chrome.storage.local.set({ igLocalPreparation: report });
    };
    try {
      const previous = await chrome.storage.local.get(['igLocalPreparation', 'igLocalPreparationHistory']);
      if (previous.igLocalPreparation) await chrome.storage.local.set({igLocalPreparationHistory: [...(previous.igLocalPreparationHistory ?? []), previous.igLocalPreparation]});
      // An earlier snapshot must not remain usable after an incomplete new scan.
      await chrome.storage.local.set({ igLocalSnapshot: null });
      const identity = await identify();
      expectedAccount = identity.username;
      report.accountId = identity.id;
      report.account = identity.username;
      await log('authenticated', 'Conta conectada identificada; carregando listas atuais');
      const readList = async kind => {
        const users = new Map();
        const cursors = new Set();
        let cursor = '';
        for (let page = 1; page <= 200; page++) {
          await log('reading', `${kind}: página ${page}`);
          const params = kind === 'following' ? 'order=date_followed_latest' : 'count=50';
          const result = await request(`/api/v1/friendships/${report.accountId}/${kind}/?${params}${cursor ? '&max_id=' + encodeURIComponent(cursor) : ''}`);
          if (!Array.isArray(result.users) || result.status !== 'ok') throw new Error(`Formato de ${kind} não reconhecido.`);
          const previousCount = users.size;
          for (const user of result.users) {
            const id = user.pk ?? user.pk_id ?? user.id;
            if ((typeof id === 'number' && !Number.isSafeInteger(id)) || !/^\d+$/.test(String(id)) ||
              typeof user.username !== 'string' || !/^[a-zA-Z0-9._]{1,30}$/.test(user.username)) throw new Error('ID ou username inválido na lista.');
            const username = user.username.toLowerCase();
            if (users.has(username) && users.get(username) !== String(id)) throw new Error('IDs conflitantes para o mesmo username.');
            users.set(username, String(id));
          }
          await log('read_count', `${kind}: ${users.size} perfis`);
          const next = result.next_max_id;
          await log('page_result', `${kind}: página ${page}, recebidos ${result.users.length}, novos ${users.size - previousCount}, repetidos ${result.users.length - (users.size - previousCount)}, próxima página ${next ? 'sim' : 'não'}, ordem ${kind === 'following' ? 'date_followed_latest' : 'padrão'}`);
          if (!next) {
            if (result.has_more === true || result.more_available === true) throw new Error(`Paginação de ${kind} indica continuação sem cursor.`);
            const total = identity.totals[kind];
            if (Number.isSafeInteger(total) && total >= 0 && users.size !== total)
              throw new Error(`Lista ${kind} diverge do total informado (${users.size}/${total}); nova leitura necessária.`);
            if (!Number.isSafeInteger(total)) await log('warning', `${kind}: fim da paginação; total independente não informado pelo Instagram.`);
            return Object.fromEntries(users);
          }
          if (!result.users.length || typeof next !== 'string' || cursors.has(next)) throw new Error('Paginação vazia ou repetida; leitura incompleta.');
          if (users.size === previousCount) throw new Error('Página sem novos perfis; leitura incompleta.');
          cursors.add(next); cursor = next;
        }
        throw new Error('Limite de páginas atingido; leitura incompleta.');
      };
      const following = await readList('following');
      const followers = await readList('followers');
      const followerIds = new Set(Object.values(followers));
      const candidates = Object.keys(following).filter(name => !followers[name] && !followerIds.has(following[name]));
      report.following_count = Object.keys(following).length;
      report.followers_count = Object.keys(followers).length;
      report.protected_count = report.followers_count;
      report.candidates_with_id = candidates.length;
      const verified = await identify();
      if (verified.id !== identity.id || verified.username !== identity.username) throw new Error('Conta mudou durante a leitura.');
      const snapshot = {version:VERSION, source:'instagram-current', account:identity.username, accountId:identity.id,
        capturedAt:Date.now(), following, followers, candidates, paginationComplete:true};
      await chrome.storage.local.set({igLocalSnapshot:snapshot});
      report.ready = true;
      await log('compared', `${report.following_count} seguindo; ${report.followers_count} seguidores; ${candidates.length} não seguem de volta.`);
      await log('ready', 'Listas atuais e comparação salvas localmente; nenhum unfollow enviado na preparação.');
      return {source:'instagram-current', account:identity.username, users:candidates};
    } catch (error) { await log('stopped', error.message); }
    finally { running = false; }
  }
  async function diagnose(probe) {
    running = true; stopped = false;
    const id = cookie('ds_user_id');
    const report = {
      version: VERSION, time: new Date().toISOString(), probe,
      local: { csrf_present: !!cookie('csrftoken'), user_id_present: !!id,
        user_id_numeric: !!id && /^\d+$/.test(id),
        session_cookie_readable: !!cookie('sessionid'),
        note: 'sessionid pode ser HttpOnly: não ser legível por JavaScript é normal. Sua presença não é comprovada por este teste.',
        locks_available: !!navigator.locks,
        credentials_mode: 'same-origin',
        header_names: ['X-IG-App-ID', 'X-CSRFToken', 'X-Requested-With', 'Accept'] },
      status: 'Verificações locais concluídas', requests: [],
    };
    await chrome.storage.local.set({ igLocalDiagnostic: report });
    try {
      if (!['local', 'info', 'web-form'].includes(probe)) throw new Error('Teste não reconhecido.');
      if (probe !== 'local') {
        if (!id || !/^\d+$/.test(id)) throw new Error('Cookie de identificação ausente ou inválido.');
        const path = probe === 'info' ? `/api/v1/users/${id}/info/` : '/api/v1/accounts/edit/web_form_data/';
        const result = await request(path, 'GET', async response => {
          const contentType = response.headers.get('content-type') || '';
          const retry = response.headers.get('retry-after');
          const entry = { route: probe === 'info' ? '/api/v1/users/{id}/info/' : path,
            http_status: response.status,
            content_type: contentType.split(';')[0].replace(/[^a-zA-Z0-9/+.\-]/g, ''),
            retry_after_seconds: retry && /^\d+$/.test(retry) ? Number(retry) : null };
          if (contentType.includes('application/json')) {
            try {
              const body = await response.clone().json();
              // Never export raw body, cookies, user/contact fields or server-provided URLs.
              entry.response = {
                status: ['ok', 'fail'].includes(body.status) ? body.status : 'unspecified',
                login_required: body.require_login === true || /login_required|login required/i.test(String(body.message || '')),
                checkpoint_required: !!body.checkpoint_url || /checkpoint/i.test(String(body.message || '')),
                challenge_required: !!body.challenge || /challenge/i.test(String(body.message || '')),
                spam: body.spam === true,
                throttled: response.status === 429 || /please wait|too many|rate limit/i.test(String(body.message || '')),
                user_object_present: !!body.user,
                form_data_present: !!body.form_data,
              };
            } catch { entry.json_parse_failed = true; }
          }
          report.requests.push(entry);
          await chrome.storage.local.set({ igLocalDiagnostic: report });
        });
        const user = probe === 'info' ? result.user : result.form_data;
        const responseId = user?.pk ?? user?.id ?? user?.user_id ?? user?.username_id;
        report.identity = { username_present: typeof user?.username === 'string',
          expected_username_matches: expectedAccount ? user?.username?.toLowerCase() === expectedAccount : null,
          id_present: responseId !== undefined && responseId !== null,
          expected_id_matches: responseId == null ? null : String(responseId) === id };
        report.status = 'Consulta concluída; nenhum unfollow enviado';
      }
    } catch (error) {
      report.status = 'Diagnóstico interrompido';
      // Keep network error text bounded and free of request/cookie values.
      report.error = report.requests.length ? `Resposta HTTP ${report.requests.at(-1).http_status}; consulte os campos classificados.` :
        !id || !/^\d+$/.test(id) ? 'Cookie de identificação ausente ou inválido.' :
        !cookie('csrftoken') ? 'CSRF ausente.' : 'Falha de rede, redirecionamento, timeout ou formato inesperado.';
    } finally {
      await chrome.storage.local.set({ igLocalDiagnostic: report });
      running = false;
    }
  }
  async function run(data, execute, pageContext) {
    running = true; stopped = false;
    let state;
    const save = () => chrome.storage.local.set({ igLocalState: state });
    const log = async (event, username, detail) => {
      state.events.push({ time: new Date().toISOString(), version: VERSION, event, ...(username ? { username } : {}), ...(detail ? { detail } : {}) });
      await save();
    };
    try {
      if (data?.source !== 'instagram-current' || !Array.isArray(data.users) || !data.users.every(value => typeof value === 'string' && /^[a-zA-Z0-9._]{1,30}$/.test(value))) throw new Error('Lista inválida.');
      const users = [...new Set(data.users)];
      const previous = (await chrome.storage.local.get('igLocalState')).igLocalState;
      const account = data.account;
      if (!/^[a-z0-9._]{1,30}$/.test(account || '')) throw new Error('Configure a conta esperada.');
      state = previous?.account === account ? previous : { account, done: [], events: [], nextBatchAt: 0, inBatch: 0 };
      state.total = users.length; state.status = 'Validando sessão';
      if (!state.pacing) {
        const attempts = state.events.filter(event => event.event === 'attempting');
        state.pacing = { count: Math.min(20, attempts.length), lastAttemptAt: attempts.length ? Date.parse(attempts.at(-1).time) : 0 };
      }
      state.currentRun = { startedAt: new Date().toISOString(), mode: '20-attempts-30s-pause', attempts: 0, confirmed: 0, failed: 0, consecutiveFailures: 0 };
      await log('starting', null, execute ? 'Execução real' : 'Simulação');
      if (execute && (!pageContext?.dtsg || !pageContext?.lsd)) throw new Error('Contexto de sessão da página ausente. Recarregue o Instagram e abra novamente a extensão.');
      const id = cookie('ds_user_id');
      if (!id || !/^\d+$/.test(id)) throw new Error('Cookie de identificação não encontrado.');
      await log('validating_account', null, '/api/v1/accounts/edit/web_form_data/');
      const identity = await request('/api/v1/accounts/edit/web_form_data/');
      const form = identity.form_data;
      const responseId = form?.user_id ?? form?.username_id ?? form?.pk ?? form?.id;
      if (identity.status !== 'ok' || form?.username?.toLowerCase() !== account ||
          (responseId != null && String(responseId) !== id)) throw new Error('Conta autenticada não corresponde à conta configurada ou resposta web inválida.');
      await log('authenticated', account);
      const snapshot = (await chrome.storage.local.get('igLocalSnapshot')).igLocalSnapshot;
      if (!snapshot || snapshot.version !== VERSION || snapshot.source !== 'instagram-current' || !snapshot.paginationComplete || snapshot.account !== account || snapshot.accountId !== id || !Number.isFinite(snapshot.capturedAt) || JSON.stringify(users) !== JSON.stringify(snapshot.candidates)) {
        throw new Error('Prepare os IDs e listas atuais primeiro.');
      }
      const unresolved = new Map();
      for (const event of state.events) {
        if (event.event === 'attempting') unresolved.set(event.username, Date.parse(event.time));
        if (['unfollowed', 'skipped'].includes(event.event)) unresolved.delete(event.username);
      }
      if ([...unresolved.values()].some(time => snapshot.capturedAt <= time)) throw new Error('Tentativa anterior com resultado incerto. Prepare listas novas antes de retomar para conferir o estado atual.');
      const completed = new Set(state.done);
      for (const username of users) {
        await checkpoint();
        if (completed.has(username)) continue;
        if (stopped) throw new Error('Parado pelo usuário.');
        state.status = execute ? 'Executando' : 'Simulando';
        state.inBatch++;
        await log('checking', username);
        const targetId = snapshot.following[username];
        const followsYou = !!snapshot.followers[username];
        if (!targetId) {
          await log('pending', username, 'ID ausente na lista atual; nenhuma ação enviada');
        } else if (followsYou) {
          state.done.push(username);
          await log('skipped', username, 'Segue você no snapshot atual');
        } else if (!execute) {
          await log('would_unfollow', username);
        } else {
          if (!/^\d+$/.test(String(targetId))) throw new Error('ID do perfil ausente.');
          if (state.pacing.count >= 20) {
            const until = state.pacing.lastAttemptAt + 30000;
            state.status = 'Pausa preventiva'; state.nextBatchAt = until;
            await log('pause', null, `20 tentativas: aguardando ${Math.max(0, Math.ceil((until - Date.now()) / 1000))} segundos; pausa de 30s desde a última tentativa`);
            await wait(until);
            state.pacing.count = 0; state.nextBatchAt = 0; state.status = 'Executando';
            await log('pause_complete');
          }
          // Persist the attempted action first. An interrupted request is checked again on resume.
          state.currentRun.attempts++;
          state.pacing.count++; state.pacing.lastAttemptAt = Date.now();
          await log('attempting', username);
          const form = new URLSearchParams({
            av: id, __user: '0', __a: '1', __d: 'www', __comet_req: '7',
            fb_dtsg: pageContext.dtsg, lsd: pageContext.lsd,
            jazoest: '2' + [...pageContext.dtsg].reduce((sum, char) => sum + char.charCodeAt(0), 0),
            fb_api_caller_class: 'RelayModern', fb_api_req_friendly_name: 'usePolarisUnfollowMutation',
            server_timestamps: 'true', doc_id: pageContext.docId || '27789106940691111',
            variables: JSON.stringify({ target_user_id: String(targetId), container_module: 'profile' }),
          });
          let response;
          try {
            response = await request('/api/graphql', 'POST', undefined, {
              body: form.toString(), targetUsername:username, headers: {'X-FB-Friendly-Name': 'usePolarisUnfollowMutation', 'X-FB-LSD': pageContext.lsd},
            });
          } catch (error) {
            if (!error.profileFailure) throw error;
            state.currentRun.failed++;
            state.currentRun.consecutiveFailures++;
            state.currentRun.lastFailure = {username,requestId:error.requestId,reason:error.message,time:new Date().toISOString()};
            await log('profile_failed', username, `Sem confirmação; perfil pendente. Falhas consecutivas: ${state.currentRun.consecutiveFailures}/5. ${error.message} ${state.currentRun.consecutiveFailures < 5 ? 'Seguindo para o próximo.' : 'Limite de falhas atingido.'}`);
            if (state.currentRun.consecutiveFailures >= 5) throw new Error('Execução interrompida após 5 falhas GraphQL consecutivas. Perfis com falha continuam pendentes.');
            continue;
          }
          const changed = response.data?.xdt_destroy_friendship;
          if (String(changed?.id) !== String(targetId) || changed?.username?.toLowerCase() !== username || changed?.friendship_status?.following !== false) throw new Error('Unfollow não confirmado para o perfil esperado.');
          state.done.push(username);
          state.currentRun.confirmed++;
          state.currentRun.consecutiveFailures = 0;
          await log('unfollowed', username);
        }
        await save();
      }
      const pending = users.filter(username => !state.done.includes(username) && !snapshot.following[username]).length;
      const failures = state.currentRun.failed;
      state.status = pending || failures ? `Finalizado com ${pending} perfis sem ID e ${failures} falhas pendentes` : 'Concluído';
      await log('complete', null, pending || failures ? `${pending} perfis sem ID; ${failures} perfis sem confirmação. Nenhum foi marcado como removido.` : undefined);
    } catch (error) {
      if (state) { state.status = 'Interrompido'; await log('stopped', null, error.message); }
      else console.error('Lista local inválida.');
    } finally {
      if (state?.currentRun) {
        state.currentRun.endedAt = new Date().toISOString();
        state.currentRun.elapsedMs = Date.now() - Date.parse(state.currentRun.startedAt);
        await save();
      }
      running = false;
    }
  }
  chrome.runtime.onMessage.addListener((message, sender, reply) => {
    if (sender.id !== chrome.runtime.id) return;
    if (message.kind === 'ig-local-wake') { wakePause?.(); reply({ok:true}); return; }
    if (message.kind === 'ig-local-status') { reply({running:running || pipelineActive,paused,pipelineActive,version:VERSION}); return; }
    if (message.kind === 'ig-local-version') { reply({ version: VERSION }); return; }
    if (message.kind === 'ig-local-toggle') {
      if (pipelineActive) {
        paused = !paused;
        control.status = paused ? 'paused' : 'running';
        saveControl();
        if (!paused) resumePause?.();
        reply({ok:true,paused}); return;
      }
      if (running) { reply({error:'Já existe uma operação ativa. Aguarde terminar.'}); return; }
      pipelineActive = true; paused = false; stopped = false;
      control = {version:VERSION,status:'running',phase:'preparing',startedAt:new Date().toISOString()};
      reply({ok:true});
      navigator.locks.request('ig-local-unique-runner', {ifAvailable:true}, async lock => {
        try {
          if (!lock) throw new Error('Outra aba já está executando.');
          await saveControl();
          const prepared = await prepare();
          const preparation = (await chrome.storage.local.get('igLocalPreparation')).igLocalPreparation;
          if (!preparation?.ready) throw new Error('Preparação interrompida; confira o log.');
          await checkpoint();
          control.phase = 'removing'; await saveControl();
          await run(prepared, true, message.pageContext);
          const state = (await chrome.storage.local.get('igLocalState')).igLocalState;
          control.status = state?.status === 'Interrompido' ? 'error' : 'complete';
          if (control.status === 'error') control.error = state.events.filter(event => event.event === 'stopped').at(-1)?.detail ?? 'Execução interrompida; consulte o log.';
        } catch (error) { control.status = 'error'; control.error = error.message; }
        finally {
          pipelineActive = false; running = false; paused = false; resumePause?.();
          control.endedAt = new Date().toISOString(); await saveControl();
        }
      });
      return;
    }
    if (message.kind === 'ig-local-prepare') {
      if (running || pipelineActive) { reply({ error: 'Já existe uma execução nesta aba.' }); return; }
      reply({ ok: true });
      navigator.locks.request('ig-local-unique-runner', { ifAvailable: true }, async lock => {
        if (lock) await prepare(message.data);
      });
      return;
    }
    if (message.kind === 'ig-local-diagnose') {
      if (running || pipelineActive) { reply({ error: 'Pare a execução antes de diagnosticar.' }); return; }
      if (!['local', 'info', 'web-form'].includes(message.probe)) { reply({ error: 'Teste inválido.' }); return; }
      reply({ ok: true });
      navigator.locks.request('ig-local-unique-runner', { ifAvailable: true }, async lock => {
        if (lock) await diagnose(message.probe);
      });
      return;
    }
    if (message.kind === 'ig-local-stop') { stopped = true; paused = false; resumePause?.(); wakePause?.(); reply({ ok: true }); }
    if (message.kind === 'ig-local-start') {
      if (running || pipelineActive) { reply({ error: 'Já existe uma execução nesta aba.' }); return; }
      reply({ ok: true });
      navigator.locks.request('ig-local-unique-runner', { ifAvailable: true }, async lock => {
        if (lock) await run(message.data, message.execute === true, message.pageContext);
        else console.warn('Outra aba já está executando a fila.');
      });
    }
  });
})();
