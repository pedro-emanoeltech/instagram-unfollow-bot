const $ = id => document.getElementById(id);
const version = chrome.runtime.getManifest().version;
$('version').textContent = 'v' + version;
let busy = false;
async function tab() {
  const [current] = await chrome.tabs.query({active:true,currentWindow:true});
  if (!current?.url?.startsWith('https://www.instagram.com/')) throw new Error('Abra a aba do Instagram conectado para iniciar.');
  return current;
}
async function attach() {
  const current = await tab();
  await chrome.scripting.executeScript({target:{tabId:current.id},files:['worker.js']});
  const worker = await chrome.tabs.sendMessage(current.id,{kind:'ig-local-status'});
  if (worker.version !== version) throw new Error('Recarregue a aba do Instagram para atualizar a versão.');
  return {current,worker};
}
async function context(current) {
  const [result] = await chrome.scripting.executeScript({target:{tabId:current.id},world:'MAIN',func:() => {
    const module = name => {try{return typeof window.require === 'function' ? window.require(name) : null;}catch{return null;}};
    const dtsg = document.querySelector('input[name="fb_dtsg"]')?.value || module('DTSGInitialData')?.token;
    const lsd = document.querySelector('input[name="lsd"]')?.value || module('LSD')?.token;
    const id = module('usePolarisUnfollowMutation.graphql')?.params?.id;
    return dtsg && lsd ? {dtsg,lsd,docId:typeof id === 'string' && /^\d+$/.test(id) ? id : null} : null;
  }});
  if (!result?.result) throw new Error('Não foi possível obter a sessão atual. Recarregue o Instagram.');
  return result.result;
}
$('toggle').onclick = async () => {
  if (busy) return;
  busy = true; $('toggle').disabled = true; $('notice').textContent = '';
  try {
    const {current,worker} = await attach();
    let message = {kind:'ig-local-toggle'};
    if (!worker.pipelineActive) {
      const pageContext = await context(current);
      message = {...message,pageContext};
    }
    const response = await chrome.tabs.sendMessage(current.id,message);
    if (response.error) throw new Error(response.error);
    await refresh();
  } catch(error) { $('notice').textContent = error.message; }
  finally {busy = false; $('toggle').disabled = false;}
};
function download(data,name) {
  const link = document.createElement('a'); link.href = URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));
  link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(link.href),1000);
}
$('download').onclick = async () => {
  const data = await chrome.storage.local.get(['igLocalState','igLocalPreparation','igLocalPreparationHistory','igLocalHttp','igLocalControl','igLocalSnapshot']);
  download({exportedAt:new Date().toISOString(),state:data.igLocalState,preparation:data.igLocalPreparation,preparationHistory:data.igLocalPreparationHistory,http:data.igLocalHttp,control:data.igLocalControl,snapshot:data.igLocalSnapshot},'instagram-progresso.json');
};
async function refresh() {
  const data = await chrome.storage.local.get(['igLocalState','igLocalPreparation','igLocalControl','igLocalDiagnostic','igLocalSnapshot']);
  const state = data.igLocalState, prep = data.igLocalPreparation, control = data.igLocalControl;
  let worker;
  try {const current = await tab();worker = await chrome.tabs.sendMessage(current.id,{kind:'ig-local-status'});}catch{}
  const active = worker?.pipelineActive;
  $('loadLists').disabled = !!worker?.running;
  $('account').textContent = data.igLocalSnapshot?.account || data.igLocalPreparation?.account || 'Identificada ao carregar listas';
  const snapshot = data.igLocalSnapshot;
  const validSnapshot = snapshot?.accountId && snapshot.following && snapshot.followers;
  const displayNumber = number => new Intl.NumberFormat('pt-BR').format(number);
  const removedAfterRead = validSnapshot ? new Set((state?.events ?? []).filter(event => event.event === 'unfollowed' && Date.parse(event.time) >= snapshot.capturedAt).map(event => event.username)).size : 0;
  const following = validSnapshot ? Object.keys(snapshot.following).length : null;
  const done = new Set(state?.done ?? []);
  const remaining = validSnapshot ? Object.keys(snapshot.following).filter(name => snapshot.candidates ? snapshot.candidates.includes(name) && !snapshot.followers[name] && !done.has(name) : false).length : null;
  $('following').textContent = following == null ? '—' : displayNumber(following);
  $('followers').textContent = validSnapshot ? displayNumber(Object.keys(snapshot.followers).length) : '—';
  $('estimated').textContent = following == null ? '—' : displayNumber(Math.max(0,following - removedAfterRead));
  $('remaining').textContent = validSnapshot && snapshot.candidates ? displayNumber(remaining) : '—';
  $('removed').textContent = displayNumber(active && control?.phase === 'preparing' ? 0 : state?.currentRun?.confirmed ?? 0);
  const automaticPause = active && !worker.paused && control?.phase === 'removing' && state?.status === 'Pausa preventiva';
  if (automaticPause) {
    const seconds = Math.max(0,Math.ceil((state.nextBatchAt-Date.now())/1000));
    $('countdown').textContent = `${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`;
    $('timerLabel').textContent = seconds ? 'Pausa preventiva · retomada automática' : 'Retomando…';
  } else {
    const failed = control?.status === 'error' || (!active && state?.status === 'Interrompido');
    $('countdown').textContent = active ? worker.paused ? 'Pausado' : control?.phase === 'preparing' ? 'Carregando' : 'Em execução' : failed ? 'Interrompido' : control?.status === 'complete' ? (state?.currentRun?.failed ? 'Com pendências' : 'Finalizado') : 'Pronto';
    $('timerLabel').textContent = !active && failed ? control?.error || state?.events?.filter(event => event.event === 'stopped').at(-1)?.detail || 'Consulte o log antes de iniciar novamente' : active && worker.paused ? 'Clique Retomar para continuar' : '20 tentativas por lote · 30 segundos de pausa';
  }
  $('toggle').textContent = active ? (worker.paused ? 'Retomar' : 'Pausar') : control?.status === 'error' || state?.status === 'Interrompido' ? 'Iniciar novamente' : 'Iniciar';
  const title = active ? (worker.paused ? 'Pausado' : control?.phase === 'preparing' ? 'Carregando e validando listas' : state?.status ?? 'Removendo') :
    control?.status === 'complete' ? 'Finalizado' : control?.status === 'error' ? 'Interrompido' : control?.status === 'running' || control?.status === 'paused' ? 'Execução anterior inativa; Iniciar carrega listas novas' : 'Pronto para iniciar';
  const confirmed = state?.events?.filter(event => event.event === 'unfollowed').length ?? 0;
  $('status').textContent = `${title} · ${confirmed} unfollows confirmados no histórico`;
  if (state?.currentRun?.failed) $('status').textContent += ` · ${state.currentRun.failed} falhas nesta execução · ${state.currentRun.consecutiveFailures}/5 consecutivas`;
  if (active && !worker.paused && state?.status === 'Pausa preventiva' && control?.phase === 'removing') $('status').textContent += ` · Retoma em ${Math.max(0,Math.ceil((state.nextBatchAt-Date.now())/1000))}s`;
  if (!active && control?.error) $('status').textContent += ' · ' + control.error;
  $('preparation').textContent = prep ? prep.events.slice(-4).map(event => `${event.event}: ${event.detail}`).join('\n') : 'Ao iniciar, as listas serão carregadas automaticamente.';
  $('logs').textContent = state?.events?.slice(-12).map(event => `${new Date(event.time).toLocaleTimeString()} [v${event.version}] ${event.event}${event.username ? ' @'+event.username : ''}${event.detail ? ' — '+event.detail : ''}`).join('\n') ?? '';
  $('diagnose').disabled = !!worker?.running;
  if (data.igLocalDiagnostic) $('diagnostic').textContent = JSON.stringify(data.igLocalDiagnostic,null,2);
}
$('diagnose').onclick = async () => {
  try {const {current} = await attach();const response = await chrome.tabs.sendMessage(current.id,{kind:'ig-local-diagnose',probe:$('probe').value});if(response.error)throw new Error(response.error);}
  catch(error){$('diagnostic').textContent = error.message;}
};
$('downloadDiagnostic').onclick = async () => {
  const {igLocalDiagnostic} = await chrome.storage.local.get('igLocalDiagnostic');
  if (igLocalDiagnostic) download(igLocalDiagnostic,'instagram-diagnostico-v1.22.json');
};
refresh(); setInterval(refresh,1000);

$('loadLists').onclick = async () => {
  if (busy) return;
  busy=true; $('loadLists').disabled=true; $('notice').textContent='';
  try {const {current}=await attach();const response=await chrome.tabs.sendMessage(current.id,{kind:'ig-local-prepare'});if(response.error)throw new Error(response.error);}
  catch(error){$('notice').textContent=error.message;}
  finally {busy=false;await refresh();}
};
