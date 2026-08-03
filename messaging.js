/* ============================================================
   FRUVER — Navegación, chat, avisos, precios del día
   ============================================================ */

const navStack=[];

function pushNavState(state){
  navStack.push(state);
}
function popNavState(){
  return navStack.pop();
}
function clearNavStack(){
  navStack.length=0;
}

function goBackNav(){
  const prev=popNavState();
  if(!prev){
    showView('v-admin');
    adminNav(adminTab||'dash');
    return;
  }
  if(prev.kind==='admin-tab'){
    showView('v-admin');
    adminNav(prev.tab||'dash');
    return;
  }
  if(prev.kind==='order-detail'){
    renderOrderDetailPage(prev.orderId,prev.readOnly);
    showView('v-order-detail');
    return;
  }
  if(prev.kind==='remision'){
    renderRemisionPage();
    showView('v-remision');
    return;
  }
  if(prev.kind==='chat'){
    openChatView(prev.conversacionId);
    return;
  }
  if(prev.kind==='client-view'){
    showView(prev.view||'v-order');
    if(prev.view==='v-history') renderHistory();
    else if(typeof renderClientOrder==='function') renderClientOrder();
    return;
  }
  showView(prev.view||'v-admin');
  if(prev.view==='v-admin') adminNav(prev.tab||adminTab||'dash');
  else if(prev.view==='v-worker') renderWorker();
}

function openSubView(viewId, state){
  pushNavState(state);
  showView(viewId);
}

/* ---------- precios del día ---------- */
function ensurePreciosDia(){
  if(!DB.preciosDia) DB.preciosDia={};
}
function getDailyPrice(pid,date){
  ensurePreciosDia();
  return DB.preciosDia[date||todayStr()]?.[pid]||null;
}
function setDailyPrice(pid,unitPrice,priceUnit,date){
  ensurePreciosDia();
  const d=date||todayStr();
  if(!DB.preciosDia[d]) DB.preciosDia[d]={};
  DB.preciosDia[d][pid]={unitPrice:+unitPrice,priceUnit:priceUnit||'kilo',updatedAt:new Date().toISOString()};
  saveDB();
}
function applyDailyPricesToOrder(o){
  if(!o?.items) return;
  const d=o.date||todayStr();
  o.items.forEach(it=>{
    if(it.unitPrice!=null) return;
    const dp=getDailyPrice(it.p,d);
    if(dp){
      it.unitPrice=dp.unitPrice;
      it.priceUnit=dp.priceUnit||it.u||'kilo';
      it.total=calcPriceTotal(it);
    }
  });
}

function deliveryDateForOrder(atTime){
  return new Date().toISOString().slice(0,10);
}
function deliveryDateLabel(dateStr){
  return fmtDate(dateStr);
}

/* ---------- urgent requests → chat ---------- */
function sendUrgentRequestViaChat({clientId,orderId,mensaje}){
  ensureChatDB();
  const conv=getOrCreateConversation(clientId,orderId||null);
  const c=DB.clients.find(x=>x.id===clientId)||{};
  sendChatMessage(conv.id,mensaje||'🚨 Solicitud urgente',{
    deRol:'client',deId:clientId,deNombre:c.name||'Cliente',
  });
  if(typeof renderAdminTopActions==='function') renderAdminTopActions();
  return conv;
}

function adminUnreadChatCount(){
  ensureChatDB();
  return DB.mensajes.filter(m=>{
    if(m.deRol!=='client'||m.leido) return false;
    return DB.conversaciones.some(c=>c.id===m.conversacionId);
  }).length;
}

function openAdminChatTray(){
  ensureChatDB();
  const convs=DB.conversaciones.slice().sort((a,b)=>b.actualizadoEn.localeCompare(a.actualizadoEn));
  const rows=convs.length?convs.map(conv=>{
    const c=DB.clients.find(x=>x.id===conv.clientId)||{};
    const o=conv.orderId?DB.orders.find(x=>x.id===conv.orderId):null;
    const unread=DB.mensajes.filter(m=>m.conversacionId===conv.id&&m.deRol==='client'&&!m.leido).length;
    return `<div class="list-row" style="cursor:pointer;${unread?'border-color:var(--orange)':''}" onclick="closeSheet();openChatView('${conv.id}')">
      <span class="le">${c.emoji||'🏪'}</span>
      <div class="lt"><b>${escHtml(c.name||'Cliente')}</b>
        <span>${escHtml(conv.ultimoMensaje||'Sin mensajes')}</span>
        ${o?`<span style="font-size:12px;color:var(--ink-soft)">Pedido ${fmtDate(o.date)} ${fmtTime12(o.time)}</span>`:''}
      </div>${unread?`<span class="chip exc">${unread} nuevo${unread>1?'s':''}</span>`:''}
    </div>`;
  }).join(''):'<div class="empty"><span class="ee">💬</span><span>Aún no hay conversaciones</span></div>';
  openSheet('💬 Mensajes con clientes',rows,[]);
}

/* ---------- chat ---------- */
function ensureChatDB(){
  if(!DB.conversaciones) DB.conversaciones=[];
  if(!DB.mensajes) DB.mensajes=[];
}
function getOrCreateConversation(clientId,orderId){
  ensureChatDB();
  let c=DB.conversaciones.find(x=>x.clientId===clientId&&x.orderId===(orderId||null));
  if(!c){
    c={id:uid(),clientId,orderId:orderId||null,creadoEn:new Date().toISOString(),actualizadoEn:new Date().toISOString()};
    DB.conversaciones.push(c);
    saveDB();
  }
  return c;
}
function sendChatMessage(conversacionId,texto,opts={}){
  ensureChatDB();
  const conv=DB.conversaciones.find(x=>x.id===conversacionId);
  if(!conv||!texto?.trim()) return;
  const msg={
    id:uid(),conversacionId,
    deRol:opts.deRol||session.role,
    deId:opts.deId||(session.role==='admin'?'admin':session.id),
    deNombre:opts.deNombre||session.name,
    texto:texto.trim(),
    creadoEn:new Date().toISOString(),leido:false,
  };
  DB.mensajes.push(msg);
  conv.actualizadoEn=msg.creadoEn;
  conv.ultimoMensaje=texto.trim().slice(0,120);
  const targetUser=session.role==='admin'?conv.clientId:'admin';
  addNotification(targetUser,'chat_mensaje',conv.id,session.role==='admin'?'admin':session.id);
  saveDB();
}
function openOrderChat(orderId){
  const o=DB.orders.find(x=>x.id===orderId);
  if(!o) return;
  const conv=getOrCreateConversation(o.clientId,orderId);
  const active=$('.view.active')?.id;
  if(active==='v-order-detail') pushNavState({kind:'order-detail',orderId,readOnly:false});
  else if(active==='v-remision') pushNavState({kind:'remision'});
  else pushNavState({kind:'admin-tab',tab:adminTab,view:active||'v-admin'});
  openChatView(conv.id);
}
function openChatView(conversacionId){
  const active=$('.view.active')?.id;
  if(active&&active!=='v-chat'){
    if(session?.role==='client') pushNavState({kind:'client-view',view:active});
    else if(session?.role==='admin'){
      if(active==='v-order-detail') pushNavState({kind:'order-detail',orderId:window._currentOrderDetailId,readOnly:false});
      else if(active==='v-remision') pushNavState({kind:'remision'});
      else pushNavState({kind:'admin-tab',tab:adminTab,view:active||'v-admin'});
    }
  }
  window.activeChatId=conversacionId;
  renderChatPage();
  showView('v-chat');
  if(session?.role==='client') $$('[data-nav]').forEach(b=>b.classList.toggle('on',b.dataset.nav==='chat'));
}
function renderChatPage(){
  ensureChatDB();
  const conv=DB.conversaciones.find(x=>x.id===window.activeChatId);
  if(!conv){goBackNav();return;}
  const c=DB.clients.find(x=>x.id===conv.clientId)||{};
  const o=conv.orderId?DB.orders.find(x=>x.id===conv.orderId):null;
  $('#chatTitle').textContent=c.name||'Chat';
  $('#chatSub').textContent=o?`Pedido ${fmtDate(o.date)} ${fmtTime12(o.time)}`:'Conversación general';
  const msgs=DB.mensajes.filter(m=>m.conversacionId===conv.id).sort((a,b)=>a.creadoEn.localeCompare(b.creadoEn));
  msgs.forEach(m=>{
    if(session.role!=='admin'&&m.deRol==='admin') m.leido=true;
    if(session.role==='admin'&&m.deRol==='client') m.leido=true;
  });
  saveDB();
  $('#chatBody').innerHTML=msgs.map(m=>{
    const mine=(session.role==='admin'&&m.deRol==='admin')||(session.role==='client'&&m.deRol==='client');
    return `<div class="chat-bubble ${mine?'mine':'theirs'}">
      <span class="chat-who">${escHtml(m.deNombre||'')}</span>
      <span class="chat-txt">${escHtml(m.texto)}</span>
      <span class="chat-time">${new Date(m.creadoEn).toLocaleTimeString('es-CO',{hour:'2-digit',minute:'2-digit'})}</span>
    </div>`;
  }).join('')||'<div class="empty" style="padding:20px"><span class="ee">💬</span><span>Inicia la conversación</span></div>';
  const box=$('#chatBody'); if(box) box.scrollTop=box.scrollHeight;
  renderAdminTopActions();
  renderClientChatFab();
}
function sendChatFromUI(){
  const t=$('#chatInput')?.value?.trim();
  if(!t||!window.activeChatId) return;
  sendChatMessage(window.activeChatId,t);
  $('#chatInput').value='';
  renderChatPage();
}

/* ---------- enviar a acomodar ---------- */
async function sendToAcomodar(orderId){
  if(typeof saveOrderPrices==='function') return saveOrderPrices(orderId);
  const o=DB.orders.find(x=>x.id===orderId);
  if(!o) return;
  o.items.forEach((it,i)=>{
    const up=parseFloat($('#pu_'+i)?.value);
    if(!isNaN(up)&&up>=0){
      it.unitPrice=up;
      it.priceUnit=$('#punit_'+i)?.value||it.u||'kilo';
      it.total=calcPriceTotal(it);
      setDailyPrice(it.p,up,it.priceUnit,o.date);
    }
  });
  audit('Guardó precios del pedido',clientName(o.clientId));
  await flushSave();
  toast('Precios guardados ✅');
  renderOrderDetailPage(orderId);
}

/* ---------- avisos / notificaciones top bar ---------- */
function renderAdminTopActions(){
  if(session?.role!=='admin') return;
  let bar=$('#adminTopActions');
  if(!bar){
    bar=document.createElement('div');
    bar.id='adminTopActions';
    bar.className='admin-top-actions';
    const topbar=$('#v-admin .topbar');
    if(topbar){
      const logoutBtn=topbar.querySelector('[onclick="logout()"]');
      topbar.insertBefore(bar,logoutBtn);
    }
  }
  const chatUnread=adminUnreadChatCount();
  const notif=unreadNotifCount();
  bar.innerHTML=`
    <button type="button" class="top-action-btn" onclick="openAdminChatTray()" title="Mensajes">
      💬${chatUnread?`<span class="top-action-badge">${chatUnread}</span>`:''}
    </button>
    <button type="button" class="top-action-btn" onclick="openNotifTray()" title="Avisos">
      👩‍🌾${notif?`<span class="top-action-badge">${notif}</span>`:''}
    </button>`;
  renderSubViewTopActions();
}

function renderSubViewTopActions(){
  if(session?.role!=='admin') return;
  const chatUnread=adminUnreadChatCount();
  const notif=unreadNotifCount();
  ['v-order-detail','v-manual-order','v-remision','v-chat'].forEach(vid=>{
    const v=$(('#'+vid));
    if(!v) return;
    let bar=v.querySelector('.admin-top-actions-sub');
    if(!bar){
      bar=document.createElement('div');
      bar.className='admin-top-actions-sub';
      const topbar=v.querySelector('.topbar');
      if(topbar){
        const sp=topbar.querySelector('.spacer');
        if(sp) topbar.insertBefore(bar,sp);
      }
    }
    bar.innerHTML=`
      <button type="button" class="top-action-btn sm" onclick="openAdminChatTray()" title="Mensajes">💬${chatUnread?`<span class="top-action-badge">${chatUnread}</span>`:''}</button>
      <button type="button" class="top-action-btn sm" onclick="openNotifTray()" title="Avisos">👩‍🌾${notif?`<span class="top-action-badge">${notif}</span>`:''}</button>`;
  });
}

function renderClientTopActions(){
  if(session?.role!=='client') return;
  ensureChatDB();
  const convs=DB.conversaciones.filter(c=>c.clientId===session.id);
  const chatUnread=DB.mensajes.filter(m=>{
    const c=convs.find(x=>x.id===m.conversacionId);
    return c&&m.deRol==='admin'&&!m.leido;
  }).length;
  const notif=unreadNotifCount();
  const html=`
    <button type="button" class="top-action-btn sm" onclick="nav('chat')" title="Chat con Olga">💬${chatUnread?`<span class="top-action-badge">${chatUnread}</span>`:''}</button>
    <button type="button" class="top-action-btn sm" onclick="openNotifTray()" title="Avisos de Olga">👩‍🌾${notif?`<span class="top-action-badge">${notif}</span>`:''}</button>`;
  const main=$('#clientTopActions');
  if(main) main.innerHTML=html;
  $$('.client-top-actions').forEach(bar=>{bar.innerHTML=html;});
}

function renderWorkerTopActions(){
  if(session?.role!=='worker') return;
  const notif=unreadNotifCount();
  const html=`
    <button type="button" class="top-action-btn sm" onclick="openNotifTray()" title="Avisos de Olga">👩‍🌾${notif?`<span class="top-action-badge">${notif}</span>`:''}</button>
    <button type="button" class="top-action-btn sm" onclick="openWorkerAdminChat()" title="Chat con Olga">💬</button>`;
  const main=$('#workerTopActions');
  if(main) main.innerHTML=html;
  $$('.worker-top-actions').forEach(bar=>{bar.innerHTML=html;});
}

function openWorkerAdminChat(){
  openSheet('💬 Mensaje a Olga',`
    <p style="font-size:13px;font-weight:700;color:var(--ink-soft);margin-bottom:10px">Escribe un mensaje para la administradora.</p>
    <textarea id="workerChatMsg" rows="4" placeholder="Ej.: Falta producto en bodega, necesito ayuda con un pedido…" style="width:100%;border:2px solid var(--line);border-radius:12px;padding:10px;font-weight:700"></textarea>`,
    [{label:'Enviar',cls:'green',fn:()=>{
      const msg=$('#workerChatMsg')?.value?.trim();
      if(!msg){toast('Escribe un mensaje');return;}
      addNotification('admin','mensaje_operario',null,session.id,`${session.name}: ${msg}`);
      flushSave(); closeSheet(); toast('Mensaje enviado ✅');
    }}]);
}

function renderClientChatFab(){
  if(session?.role!=='client') return;
  ensureChatDB();
  const convs=DB.conversaciones.filter(c=>c.clientId===session.id);
  const unread=DB.mensajes.filter(m=>{
    const c=convs.find(x=>x.id===m.conversacionId);
    return c&&m.deRol==='admin'&&!m.leido;
  }).length;
  const oldFab=$('#clientChatFab'); if(oldFab) oldFab.style.display='none';
  $$('[data-nav="chat"]').forEach(btn=>{
    let badge=btn.querySelector('.nav-badge');
    if(unread){
      if(!badge){badge=document.createElement('span');badge.className='nav-badge';btn.appendChild(badge);}
      badge.textContent=unread;
    }else if(badge) badge.remove();
  });
  const old=$('#notifFab'); if(old) old.style.display='none';
  renderClientTopActions();
}

/* Override notif fab — top bar only for admin */
function renderNotifFab(){
  if(session?.role==='admin'){
    const old=$('#notifFab'); if(old) old.remove();
    renderAdminTopActions();
    return;
  }
  if(session?.role==='client'){
    renderClientChatFab();
    return;
  }
  if(session?.role==='worker'){
    let fab=$('#notifFab');
    if(fab) fab.style.display='none';
    renderWorkerTopActions();
    const n=unreadNotifCount();
    $$('.worker-nav-inner .nav-btn').forEach((btn,i)=>{
      if(i!==1) return;
      let badge=btn.querySelector('.nav-badge');
      if(n){
        if(!badge){badge=document.createElement('span');badge.className='nav-badge';btn.appendChild(badge);}
        badge.textContent=n;
      }else if(badge) badge.remove();
    });
  }
}

function openBroadcastForm(target){
  const title=target==='workers'?'📢 Aviso a todos los operarios':'👑 Aviso a todos los clientes (Premium)';
  openSheet(title,`
    <div class="field"><label>Mensaje</label>
      <textarea id="bcMsg" rows="4" placeholder="Ej.: Se cerró temprano hoy, alisten los pedidos pendientes" style="width:100%;border:2px solid var(--line);border-radius:12px;padding:10px;font-weight:700"></textarea></div>`,
    [{label:'Enviar',cls:'green',fn:()=>{
      const msg=$('#bcMsg')?.value?.trim();
      if(!msg){toast('Escribe un mensaje');return;}
      if(target==='workers'){
        (DB.workers||[]).filter(w=>w.activo!==false).forEach(w=>{
          addNotification(w.id,'aviso_admin',null,'admin',msg);
        });
        toast('Aviso enviado a operarios ✅');
      }else{
        if(!billingTrialActive?.()){toast('Función premium — activación pendiente');return;}
        DB.clients.forEach(cl=>{
          addNotification(cl.id,'aviso_admin',null,'admin',msg);
        });
        toast('Aviso enviado a clientes ✅');
      }
      closeSheet(); renderNotifFab();
    }}]);
}

function openNotifTray(){
  const uid=session.role==='admin'?'admin':session.id;
  const list=(DB.notifications||[]).filter(n=>n.usuarioId===uid).sort((a,b)=>b.creadoEn.localeCompare(a.creadoEn));
  const adminTools=session.role==='admin'?`
    <div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap">
      <button class="btn orange sm" onclick="openBroadcastForm('workers')">📢 A operarios</button>
      <button class="btn yellow sm" onclick="openBroadcastForm('clients')">👑 A clientes</button>
    </div>`:'';
  const rows=list.length?list.map(n=>notifRowHTML(n)).join(''):'<div class="empty"><span class="ee">📭</span><span>Sin notificaciones</span></div>';
  openSheet('👩‍🌾 Avisos de Olga',adminTools+rows,[]);
}

function notifRowHTML(n){
  if(n.tipo==='acomodo_transferido'){
    const o=DB.orders.find(x=>x.id===n.referenciaId);
    return `<div class="notif-row"><b>📦 ${escHtml(n.mensaje||'Pedido transferido para acomodar')}</b>
      <div style="margin-top:8px"><button class="btn green sm" onclick="markNotifRead('${n.id}');closeSheet();openWorkerAcomodoPage('${o?.id||n.referenciaId}',false)">Acomodar ahora</button></div></div>`;
  }
  if(n.tipo==='invitacion_transferencia'){
    const inv=DB.invitations.find(x=>x.id===n.referenciaId);
    const o=DB.orders.find(x=>x.id===inv?.pedidoId);
    const from=inv?workerName(inv.operarioOrigenId):'';
    const c=o?clientName(o.clientId):'';
    if(inv?.estado==='pendiente'){
      return `<div class="notif-row"><b>${from} te transfirió el pedido de ${c}</b>
        <div style="display:flex;gap:8px;margin-top:8px">
          <button class="btn green sm" onclick="resolveTransfer('${inv.id}','aceptada','${n.id}')">Aceptar</button>
          <button class="btn ghost sm" onclick="resolveTransfer('${inv.id}','rechazada','${n.id}')">Rechazar</button></div></div>`;
    }
    return `<div class="notif-row" style="opacity:.6"><b>Transferencia ${inv?.estado||'—'}: ${c}</b></div>`;
  }
  if(n.tipo==='remision_recibida'){
    const rem=DB.remisiones.find(x=>x.id===n.referenciaId);
    return `<div class="notif-row" style="cursor:pointer" onclick="markNotifRead('${n.id}');viewRemision('${rem?.id||n.referenciaId}')">
      <b>📄 Remisión Nº ${rem?.numero||'—'} recibida</b></div>`;
  }
  if(n.tipo==='aviso_admin'){
    return `<div class="notif-row" onclick="markNotifRead('${n.id}')"><b>📢 Aviso de Olga</b><p style="margin-top:6px;font-weight:700">${escHtml(n.mensaje||'Mensaje del administrador')}</p></div>`;
  }
  if(n.tipo==='solicitud'){
    return `<div class="notif-row" style="cursor:pointer" onclick="markNotifRead('${n.id}');openAdminChatTray()">
      <b>💬 Mensaje de cliente</b><p style="margin-top:4px;font-weight:700">Abre el chat para ver la solicitud</p></div>`;
  }
  if(n.tipo==='chat_mensaje'){
    const conv=DB.conversaciones?.find(x=>x.id===n.referenciaId);
    return `<div class="notif-row" style="cursor:pointer" onclick="markNotifRead('${n.id}');${conv?`openChatView('${conv.id}')`:''}">
      <b>💬 Nuevo mensaje</b><p style="margin-top:4px;font-weight:700">${escHtml(conv?.ultimoMensaje||'Tienes un mensaje nuevo')}</p></div>`;
  }
  if(n.tipo==='mensaje_operario'){
    return `<div class="notif-row" onclick="markNotifRead('${n.id}')"><b>💬 Mensaje de operario</b><p style="margin-top:6px;font-weight:700">${escHtml(n.mensaje||'Mensaje del operario')}</p></div>`;
  }
  return `<div class="notif-row">${escHtml(n.mensaje||n.tipo)}</div>`;
}

function escHtml(s){return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');}

function productThumbHTML(p,size){
  const em=p.emoji||'🥬';
  const sz=size||34;
  const tint=p.tint||'#E8F8EE';
  if(p.img&&!String(p.img).startsWith('data:')){
    return `<span class="prod-thumb-wrap" style="width:${sz}px;height:${sz}px;background:${tint}">
      <img src="${p.img}" width="${sz}" height="${sz}" style="width:100%;height:100%;object-fit:contain" alt="" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='grid'">
      <span style="display:none;width:100%;height:100%;place-items:center;font-size:${Math.round(sz*.55)}px">${em}</span>
    </span>`;
  }
  if(p.img&&String(p.img).startsWith('data:')){
    return `<img src="${p.img}" width="${sz}" height="${sz}" style="width:${sz}px;height:${sz}px;border-radius:9px;object-fit:cover" alt="">`;
  }
  return `<span class="prod-thumb-wrap" style="width:${sz}px;height:${sz}px;background:${tint};font-size:${Math.round(sz*.55)}px">${em}</span>`;
}
