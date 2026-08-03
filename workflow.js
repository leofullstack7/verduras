/* ============================================================
   FRUVER PEDIDOS — flujo operarios, remisiones, notificaciones
   (Plan claude/PROMPT_CURSOR.md bloques 4–11)
   ============================================================ */
const DIAS=['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
const MOTIVATIONAL=[
  '¡Eso es! Uno más que cae. Vas a full 💪',
  'De una, quedó liso. Sigue con esa energía 🙌',
  '¡Otro pedido acomodado como todo un profesional! Dale que vas bien 🔥',
  'Bien hecho, parcero. A por el siguiente 🚀',
];
const STATUS_MAP={pesado:'acomodado',facturado:'remisionado',consolidado:'cerrado'};
const STATUS_COLORS={
  por_confirmar:{bg:'rgba(255,122,31,.18)',chip:'exc'},
  pendiente:{bg:'rgba(229,72,77,.2)',chip:'pend'},
  acomodando:{bg:'rgba(255,198,26,.2)',chip:'cons',pulse:true},
  acomodado:{bg:'rgba(31,168,77,.2)',chip:'cons'},
  remisionado:{bg:'rgba(31,168,77,.2)',chip:'cons'},
  cerrado:{bg:'rgba(31,168,77,.15)',chip:'cerr'},
  anulado:{bg:'rgba(150,150,150,.15)',chip:'anul'},
};

let adminClientFilter='all';
let acomodoMinimized=null;
let acomodoDraftTimer=null;

function migrateWorkflow(){
  if(!DB.invitations) DB.invitations=[];
  if(!DB.notifications) DB.notifications=[];
  if(!DB.remisiones) DB.remisiones=[];
  (DB.workers||[]).forEach(w=>{if(!w.avatarEmoji) w.avatarEmoji='👩‍🌾'; if(w.activo==null) w.activo=true;});
  DB.orders.forEach(o=>{
    if(STATUS_MAP[o.status]) o.status=STATUS_MAP[o.status];
    if(o.transcribeDraft==null) o.transcribeDraft=null;
    if(!o.transcripcionAplicadaEn&&o.imagenOriginal&&o.items?.length&&!o.photoOnly) o.transcripcionAplicadaEn=o.confirmadoEn||null;
    if(!o.operarioId&&o.weighedBy){
      const w=(DB.workers||[]).find(x=>x.name===o.weighedBy);
      if(w) o.operarioId=w.id;
    }
    if(o.weighedAt&&!o.acomodoFinalizadoEn) o.acomodoFinalizadoEn=o.weighedAt;
    if(o.weighedAt&&!o.acomodoIniciadoEn) o.acomodoIniciadoEn=o.weighedAt;
  });
}
if(typeof migrateDB==='function'){
  const _migrateDB=migrateDB;
  migrateDB=function(){_migrateDB();migrateWorkflow();};
}

function dispatchDateStr(){
  const d=new Date();
  if(typeof cutoffPassed==='function'&&cutoffPassed()) d.setDate(d.getDate()+1);
  return d.toISOString().slice(0,10);
}
function dispatchDayLabel(){
  const d=new Date();
  if(typeof cutoffPassed==='function'&&cutoffPassed()) d.setDate(d.getDate()+1);
  return DIAS[d.getDay()];
}
function workerName(id){const w=(DB.workers||[]).find(x=>x.id===id);return w?w.name:'';}
function productName(pid){const p=DB.products.find(x=>x.id===pid);return p?p.name:'';}

function statusChip(st){
  const m={por_confirmar:'exc',pendiente:'pend',acomodando:'cons',acomodado:'cons',remisionado:'cons',pesado:'cons',facturado:'cons',consolidado:'cons',cerrado:'cerr',anulado:'anul'};
  return m[st]||'pend';
}
function statusLabel(st){
  return {por_confirmar:'Por confirmar',pendiente:'Pendiente',acomodando:'Acomodándose…',acomodado:'Acomodado',remisionado:'Remisionado',pesado:'Acomodado',facturado:'Remisionado',consolidado:'Consolidado',cerrado:'Cerrado',anulado:'Anulado'}[st]||st;
}
function ordersVisibleToWorkers(o){
  return o&&o.status!=='por_confirmar'&&o.status!=='anulado';
}

function sortByDeliveryTime(a,b){
  const ta=a.deliveryTime||'99:99';
  const tb=b.deliveryTime||'99:99';
  if(ta!==tb) return ta.localeCompare(tb);
  return (a.time||'').localeCompare(b.time||'');
}

function syncOrderDetailScrollPad(){
  requestAnimationFrame(()=>{
    const bottom=$('#orderDetailBottom');
    const scroll=$('#orderDetailBody');
    if(bottom&&scroll) scroll.style.paddingBottom=(bottom.offsetHeight+20)+'px';
  });
}
window.syncOrderDetailScrollPad=syncOrderDetailScrollPad;

function calcPriceTotal(it){
  normItem(it);
  if(it.u==='valor'){
    const valor=+it.q||+it.valorPedido||0;
    if(it.qKg!=null&&it.unitPrice) return Math.round(it.qKg*it.unitPrice);
    return valor;
  }
  const qty=it.w!=null?+it.w:+it.q;
  const qU=it.wUnit||it.u||'kilo';
  const pU=it.priceUnit||'kilo';
  const price=+it.unitPrice;
  if(!price||!qty) return 0;
  let amt=qty;
  if(pU==='kilo'&&qU==='gramo') amt=qty/1000;
  else if(pU==='gramo'&&qU==='kilo') amt=qty*1000;
  else if(pU==='kilo'&&qU==='libra') amt=qty*0.453592;
  else if(pU==='libra'&&qU==='kilo') amt=qty/0.453592;
  return Math.round(amt*price);
}

function orderCardHTML(o,opts={}){
  normOrder(o);
  const c=DB.clients.find(x=>x.id===o.clientId)||{};
  const sc=STATUS_COLORS[o.status]||STATUS_COLORS.pendiente;
  const ch={app:'📱',voz:'🎙️',foto:'📸',manual:'✍️'}[o.channel]||'📱';
  const op=o.operarioId?workerName(o.operarioId):'';
  const pulse=sc.pulse?'<span class="acomodando-pulse">Acomodándose…</span>':'';
  const onclick=opts.onclick||`openOrderDetail('${o.id}')`;
  const isAdmin=session?.role==='admin'&&!opts.worker;
  const needsPricing=isAdmin&&typeof orderNeedsPricing==='function'&&orderNeedsPricing(o);
  const isListo=isAdmin&&typeof orderIsPricingComplete==='function'&&orderIsPricingComplete(o);
  const cardCls=['order-card','pop'];
  if(needsPricing) cardCls.push('order-needs-pricing');
  const listoBadge=isListo?'<div class="order-listo-corner"><span>LISTO</span></div>':'';
  return `<div class="${cardCls.join(' ')}" style="background:${sc.bg};cursor:pointer" onclick="${onclick}">
    <div class="oc-head"><span class="oc-emoji">${c.emoji||'🏪'}</span>
      <div class="oc-title"><b>${c.name||'—'}</b>
        <span>${ch} ${fmtTime12(o.time)}${o.deliveryTime?' · 🕐 '+fmtTime12(o.deliveryTime):''}${o.description?' · 📝 '+o.description:''}</span>
        ${pulse||`<span class="oc-preview">${orderPreview(o)}</span>`}
        ${op?`<span class="oc-op">${op}</span>`:''}
        ${needsPricing?'<span class="oc-preview" style="color:var(--green-dark);margin-top:4px">💰 Falta poner precios</span>':''}
      </div>
      <span class="chip ${sc.chip||statusChip(o.status)}">${statusLabel(o.status)}</span>
    </div>${listoBadge}</div>`;
}

function orderRowHTML(o){return orderCardHTML(o);}

/* ---------- operario: pantalla inicio ---------- */
function renderWorker(){
  const date=todayStr();
  const list=DB.orders.filter(o=>o.date===date&&ordersVisibleToWorkers(o)&&o.status!=='cerrado'&&o.status!=='remisionado')
    .sort(sortByDeliveryTime);
  $('#workerBody').innerHTML=`
    <p style="font-size:13px;color:var(--ink-soft);font-weight:700;margin-bottom:10px">Pedidos de hoy por hora de entrega — toca para acomodar o ver.</p>
    ${list.map(o=>orderCardHTML(o,{onclick:`workerTapOrder('${o.id}')`,worker:true})).join('')||
      '<div class="empty"><span class="ee">✅</span><b class="display">Sin pedidos hoy</b><span>Cuando lleguen pedidos aparecerán aquí</span></div>'}`;
  renderNotifFab();
  renderAcomodoBubble();
}

function workerTapOrder(id){
  const o=DB.orders.find(x=>x.id===id); if(!o)return;
  if(o.status==='pendiente'){
    openSheet('🏪 '+clientName(o.clientId),`<p style="font-weight:700;margin-bottom:12px">${orderPreview(o,5)}</p>`,[
      {label:'📦 Acomodar pedido',cls:'green',fn:()=>{closeSheet();startAcomodo(id);}},
      {label:'👁️ Solo ver',cls:'ghost',fn:()=>{closeSheet();openWorkerAcomodoPage(id,true);}},
    ]);
    return;
  }
  if(o.status==='acomodando'&&o.operarioId===session.id){
    openWorkerAcomodoPage(id,false);
    return;
  }
  openWorkerAcomodoPage(id,o.operarioId!==session.id);
}

function startAcomodo(id){
  const o=DB.orders.find(x=>x.id===id); if(!o)return;
  if(o.status==='acomodando'&&o.operarioId&&o.operarioId!==session.id){
    toast('Otro operario ya está acomodando este pedido'); return;
  }
  o.status='acomodando';
  o.operarioId=session.id;
  o.acomodoIniciadoEn=o.acomodoIniciadoEn||new Date().toISOString();
  audit('Tomó pedido para acomodar',clientName(o.clientId));
  flushSave().then(()=>{openWorkerAcomodoPage(id);renderWorker();});
}

function openWorkerAcomodoPage(id,readOnly){
  const o=DB.orders.find(x=>x.id===id); if(!o)return;
  normOrder(o);
  window._workerAcomodoId=id;
  window._workerAcomodoReadOnly=!!readOnly||!(o.status==='acomodando'&&o.operarioId===session.id);
  renderWorkerAcomodoPage();
  showView('v-worker-acomodo');
}

function renderWorkerAcomodoPage(){
  const id=window._workerAcomodoId;
  const o=DB.orders.find(x=>x.id===id); if(!o){showView('v-worker');return;}
  normOrder(o);
  const ro=window._workerAcomodoReadOnly;
  $('#workerAcomodoTitle').textContent=clientName(o.clientId);
  $('#workerAcomodoSub').textContent=`${statusLabel(o.status)} · Pedido ${fmtTime12(o.time)}`;
  const rows=o.items.map((it,i)=>{
    const p=DB.products.find(x=>x.id===it.p)||{};
    const wVal=it.w!=null?it.w:'';
    const wU=it.wUnit||it.u||'kilo';
    return `<div class="rev-row worker-acom-row" data-ai="${i}">
      <span class="re">${typeof productThumbHTML==='function'?productThumbHTML(p,32):p.emoji||'🥬'}</span>
      <div class="rn"><b>${typeof itemProductName==='function'?itemProductName(it):(p.name||'Producto')}</b>
        <span>Pedido: ${it.q} ${it.uCliente||fmtUnit(it.u)}</span>
        ${it.equivNote?`<span style="display:block;font-size:12px;color:var(--ink-soft)">📝 ${it.equivNote}</span>`:''}
        ${it.notaAdmin?`<span style="display:block;font-size:12px;color:var(--orange-dark)">👩‍🌾 ${it.notaAdmin}</span>`:''}
      </div>
      <div class="worker-acom-inputs">
        <input class="qty-in acomodo-in" inputmode="decimal" id="aw_${i}" value="${wVal}" placeholder="Real" ${ro?'disabled':''} oninput="acomodoInput('${id}',${i})">
        <select id="awu_${i}" class="acomodo-unit" ${ro?'disabled':''} onchange="acomodoInput('${id}',${i})">
          ${UNITS.map(u=>`<option value="${u.id}" ${wU===u.id?'selected':''}>${u.short}</option>`).join('')}
        </select>
      </div>
    </div>`;
  }).join('');
  $('#workerAcomodoBody').innerHTML=`
    <p style="font-size:13px;color:var(--ink-soft);font-weight:700;margin-bottom:10px">${ro?'Vista de solo lectura.':'Ingresa la cantidad o peso real de cada producto acomodado.'}</p>
    ${rows||'<div class="empty"><span class="ee">📦</span><span>Sin productos en este pedido</span></div>'}`;
  const foot=$('#workerAcomodoFoot'); foot.innerHTML='';
  const addBtn=(label,cls,fn)=>{
    const b=document.createElement('button'); b.className='btn '+cls; b.textContent=label; b.onclick=fn; foot.appendChild(b);
  };
  if(!ro&&o.status==='acomodando'){
    addBtn('✅ Enviar al administrador','green',()=>finishAcomodo(id));
    addBtn('↔️ Transferir','yellow',()=>openTransfer(id));
  }
  acomodoMinimized=null;
  renderAcomodoBubble();
  if(typeof renderWorkerTopActions==='function') renderWorkerTopActions();
}

function closeWorkerAcomodo(){
  showView('v-worker');
  renderWorker();
}

function saveAcomodoDraft(id){
  clearTimeout(acomodoDraftTimer);
  acomodoDraftTimer=setTimeout(()=>{
    const o=DB.orders.find(x=>x.id===id); if(!o)return;
    try{localStorage.setItem('acomodo_'+id,JSON.stringify(o.items));}catch(e){}
    saveDB();
  },400);
}

function openAcomodoPanel(id,readOnly){
  const o=DB.orders.find(x=>x.id===id); if(!o)return;
  normOrder(o);
  const ro=readOnly||!(o.status==='acomodando'&&o.operarioId===session.id);
  const rows=o.items.map((it,i)=>{
    const p=DB.products.find(x=>x.id===it.p)||{};
    const wVal=it.w!=null?it.w:'';
    const wU=it.wUnit||'kilo';
    return `<div class="rev-row" data-ai="${i}">
      <span class="re">${p.emoji||'🥬'}</span>
      <div class="rn"><b>${p.name}</b><span>Pedido: ${itemQtyLabel(it)}${it.variacion?` · ${it.variacion}`:''}${it.equivNote?` · 📝 ${it.equivNote}`:''}${it.notaAdmin?` · 👩‍🌾 ${it.notaAdmin}`:''}</span></div>
      <input class="qty-in acomodo-in" style="width:70px" inputmode="decimal" id="aw_${i}" value="${wVal}" placeholder="Cant." ${ro?'disabled':''} oninput="acomodoInput('${id}',${i})">
      <select id="awu_${i}" class="acomodo-unit" ${ro?'disabled':''} onchange="acomodoInput('${id}',${i})">
        ${UNITS.map(u=>`<option value="${u.id}" ${wU===u.id?'selected':''}>${u.short}</option>`).join('')}
      </select></div>`;
  }).join('');
  const canTransfer=!ro&&o.status==='acomodando';
  const canSend=!ro&&o.status==='acomodando';
  const btns=[];
  if(canSend) btns.push({label:'✅ Enviar al administrador',cls:'green',fn:()=>finishAcomodo(id)});
  if(canTransfer) btns.push({label:'↔️ Transferir',cls:'yellow',fn:()=>openTransfer(id)});
  btns.push({label:'➖ Minimizar',cls:'ghost',fn:()=>minimizeAcomodo(id)});
  acomodoMinimized=null;
  openSheet((ro?'👁️ Ver':'📦 Acomodar')+' — '+clientName(o.clientId),rows,btns);
  window._acomodoOrderId=id;
}

function acomodoInput(id,i){
  const o=DB.orders.find(x=>x.id===id); if(!o)return;
  const w=parseFloat($('#aw_'+i)?.value);
  const wU=$('#awu_'+i)?.value||'kilo';
  if(!isNaN(w)&&w>0){o.items[i].w=w;o.items[i].wUnit=wU;}
  else{o.items[i].w=null;o.items[i].wUnit=wU;}
  saveAcomodoDraft(id);
}

function minimizeAcomodo(id){
  const o=DB.orders.find(x=>x.id===id);
  acomodoMinimized={id,client:o?clientName(o.clientId):'Pedido'};
  closeSheet();
  renderAcomodoBubble();
}

function renderAcomodoBubble(){
  let el=$('#acomodoBubble');
  if(!acomodoMinimized){
    if(el) el.remove(); return;
  }
  if(!el){
    el=document.createElement('div');
    el.id='acomodoBubble';
    el.className='acomodo-bubble';
    document.body.appendChild(el);
  }
  el.innerHTML=`<span>📦 ${acomodoMinimized.client}</span>
    <button class="btn green sm" onclick="openWorkerAcomodoPage('${acomodoMinimized.id}',false)">Abrir</button>
    <button class="icon-btn" onclick="acomodoMinimized=null;renderAcomodoBubble()">✕</button>`;
}

function finishAcomodo(id){
  const o=DB.orders.find(x=>x.id===id); if(!o)return;
  o.items.forEach((it,i)=>{
    const w=parseFloat($('#aw_'+i)?.value);
    if(!isNaN(w)&&w>0){it.w=w;it.wUnit=$('#awu_'+i)?.value||'kilo';}
    if(it.unitPrice!=null) it.total=calcPriceTotal(it);
  });
  o.status='acomodado';
  o.acomodoFinalizadoEn=new Date().toISOString();
  const started=o.acomodoIniciadoEn?new Date(o.acomodoIniciadoEn):new Date();
  const mins=Math.max(1,Math.round((new Date()-started)/60000));
  const todayCount=DB.orders.filter(x=>x.operarioId===session.id&&x.status==='acomodado'&&x.date===todayStr()).length;
  let msg=MOTIVATIONAL[Math.floor(Math.random()*MOTIVATIONAL.length)];
  msg=msg.replace('[N]',todayCount);
  audit('Acomodó pedido',clientName(o.clientId)+' · '+mins+' min');
  acomodoMinimized=null;
  flushSave().then(()=>{
    closeWorkerAcomodo();
    renderWorker();
    openSheet('🎉 ¡Listo!',`
      <p style="font-weight:700;font-size:15px;margin-bottom:10px">${msg}</p>
      <div class="card" style="padding:12px;text-align:center">
        <div style="font-size:28px;font-family:Fredoka;font-weight:700;color:var(--green)">${todayCount}</div>
        <div style="font-size:13px;color:var(--ink-soft);font-weight:700">pedidos acomodados hoy</div>
        <div style="margin-top:8px;font-size:13px;font-weight:700">Este pedido: ${mins} min ⏱️</div>
      </div>`,[]);
  });
}

function openTransfer(id){
  const others=(DB.workers||[]).filter(w=>w.id!==session.id&&w.activo!==false);
  if(!others.length){toast('No hay otros operarios disponibles');return;}
  const opts=others.map(w=>`<option value="${w.id}">${w.name}</option>`).join('');
  openSheet('↔️ Transferir pedido',`
    <p style="font-weight:700;margin-bottom:10px">Elige operario destino. Recibirá una invitación.</p>
    <select id="xferTo" style="width:100%;border:2px solid var(--line);border-radius:12px;padding:10px;font-weight:700">${opts}</select>`,
    [{label:'Enviar invitación',cls:'yellow',fn:()=>{
      const dest=$('#xferTo').value;
      const inv={id:uid(),pedidoId:id,operarioOrigenId:session.id,operarioDestinoId:dest,estado:'pendiente',creadoEn:new Date().toISOString(),resueltoEn:null};
      DB.invitations.push(inv);
      addNotification(dest,'invitacion_transferencia',inv.id,session.id);
      audit('Invitó transferencia',clientName(DB.orders.find(x=>x.id===id)?.clientId)+' → '+workerName(dest));
      flushSave(); closeSheet(); toast('Invitación enviada 📨');
    }}]);
}

function addNotification(userId,tipo,refId,fromId,mensaje){
  DB.notifications.unshift({id:uid(),usuarioId:userId,tipo,referenciaId:refId,deUsuarioId:fromId||null,mensaje:mensaje||null,leida:false,creadoEn:new Date().toISOString()});
  DB.notifications=DB.notifications.slice(0,300);
  saveDB();
  if(typeof renderNotifFab==='function') renderNotifFab();
}

function unreadNotifCount(){
  if(!session||!DB.notifications) return 0;
  const uid=session.role==='admin'?'admin':session.id;
  return DB.notifications.filter(n=>n.usuarioId===uid&&!n.leida).length;
}

function markNotifRead(nid){
  const n=DB.notifications.find(x=>x.id===nid);
  if(n){n.leida=true;saveDB();if(typeof renderNotifFab==='function') renderNotifFab();}
}

function resolveTransfer(invId,res,nid){
  const inv=DB.invitations.find(x=>x.id===invId); if(!inv)return;
  const o=DB.orders.find(x=>x.id===inv.pedidoId); if(!o)return;
  inv.estado=res==='aceptada'?'aceptada':'rechazada';
  inv.resueltoEn=new Date().toISOString();
  markNotifRead(nid);
  if(res==='aceptada'){
    o.operarioId=inv.operarioDestinoId;
    o.status='acomodando';
    if(!o.acomodoIniciadoEn) o.acomodoIniciadoEn=new Date().toISOString();
    addNotification(inv.operarioOrigenId,'transferencia_aceptada',inv.id,session.id);
    addNotification(inv.operarioDestinoId,'acomodo_transferido',o.id,inv.operarioOrigenId,`Pedido de ${clientName(o.clientId)} — ya puedes acomodarlo`);
    toast('Transferencia aceptada ✅');
    if(session.id===inv.operarioDestinoId){
      closeSheet();
      openWorkerAcomodoPage(o.id,false);
    }
  }else{
    addNotification(inv.operarioOrigenId,'transferencia_rechazada',inv.id,session.id);
    toast('Transferencia rechazada');
  }
  audit('Transferencia '+inv.estado,clientName(o.clientId));
  flushSave(); closeSheet(); renderWorker(); renderNotifFab();
}

/* ---------- admin: detalle pedido pantalla completa + remisión ---------- */
function renderOrderDetailPage(id,readOnly){
  const o=DB.orders.find(x=>x.id===id); if(!o)return;
  normOrder(o);
  applyDailyPricesToOrder(o);
  const c=DB.clients.find(x=>x.id===o.clientId)||{};
  const isAdmin=session.role==='admin';
  const isPorConfirmar=o.status==='por_confirmar';
  const canPriceAdmin=isAdmin&&!readOnly&&(o.status==='pendiente'||isPorConfirmar||o.status==='acomodado')&&!o.remisionNo;
  const canRemision=isAdmin&&o.status==='acomodado'&&!readOnly;
  const rem=DB.remisiones.find(r=>r.pedidoId===o.id);
  $('#orderDetailTitle').textContent=c.name||'Pedido';
  $('#orderDetailSub').textContent=`${statusLabel(o.status)} · ${fmtTime12(o.time)}`;
  const photoHero=o.imagenOriginal?`
    <div class="order-detail-hero order-detail-hero-lg">
      <img src="${o.imagenOriginal}" alt="Foto del pedido" onclick="showOrderPhotoById('${o.id}')">
    </div>`:'';
  const photoInfo=o.photoOnly&&!o.items?.length?`
    <div class="photo-info-banner">📷 <b>Pedido con foto.</b> ${isAdmin?'Revisa la imagen y transcribe los productos cuando estés lista.':'Olga revisará la foto y armará el pedido.'}</div>`:'';
  const priceHint=canPriceAdmin?`<div class="photo-info-banner" style="margin-bottom:10px">💰 <b>Precios del día ${fmtDate(o.date||todayStr())}.</b> Se guardan automáticamente para otros pedidos de hoy con el mismo producto.</div>`:'';
  const incomplete=isAdmin&&orderIsIncomplete(o)&&o.items?.length?incompleteWidgetHTML():'';
  const needsTranscription=orderNeedsTranscription(o);
  const savedTranscribe=isAdmin&&o.transcribeDraft?.length&&window.transcribingOrderId!==id
    ?renderSavedTranscriptionHTML(o.transcribeDraft):'';
  const transcribePanel=isAdmin&&!readOnly&&window.transcribingOrderId===id?`<div id="orderTranscribePanel" class="transcribe-panel"></div>`:'';
  const confirmBanner=isPorConfirmar&&isAdmin?`<div class="photo-info-banner" style="margin-bottom:10px;border-color:var(--orange);background:rgba(255,122,31,.12)">📋 <b>Pedido por confirmar.</b> ${needsTranscription?'Transcribe y corrige la foto antes de confirmar. ':'Revisa productos, agrega notas para operarios y confirma para que aparezca en Compras y despacho.'}</div>`:'';
  const sortedItems=o.items.map((it,i)=>({it,i})).sort((a,b)=>{
    const aw=a.it.w!=null&&a.it.w!==''?1:0;
    const bw=b.it.w!=null&&b.it.w!==''?1:0;
    return aw-bw;
  });
  const rows=sortedItems.map(({it,i})=>{
    const p=DB.products.find(x=>x.id===it.p)||{};
    const pname=typeof itemProductName==='function'?itemProductName(it):(p.name||'Producto');
    const acom=it.w!=null&&it.w!==''?` · Acomodado: ${it.w} ${fmtUnit(it.wUnit||'kilo')}`:'';
    const priced=it.unitPrice!=null;
    const lineTot=itemLineTotalDisplay(it);
    const dp=getDailyPrice(it.p,o.date||todayStr());
    const priceVal=formatOrderPriceValue(it.unitPrice??dp?.unitPrice??'');
    return `<div class="rev-row order-item-row ${it.w==null||it.w===''?'pending-acomodo':''}" id="prow_${i}">
      <span class="re">${typeof productThumbHTML==='function'?productThumbHTML(p,36):p.emoji||'🥬'}</span>
      <div class="rn"><b>${pname}</b>
        <span>Pedido: ${itemQtyLabel(it)}${it.variacion?` · <b>${it.variacion}</b>`:''}${acom}${!isPorConfirmar&&it.equivNote?` · 📝 ${it.equivNote}`:''}${!isPorConfirmar&&it.notaAdmin?` · 👩‍🌾 ${it.notaAdmin}`:''}</span>
        ${it.u==='valor'?`<div class="valor-hint">${it.qKg!=null?`✅ ${it.qKg} kg calculados`:'Ingresa precio/kg abajo → se calculan los kilos automáticamente'}</div>`:''}
        ${isPorConfirmar&&isAdmin?`<input class="nota-admin-in" id="notaAdmin_${i}" placeholder="Nota para operarios (opcional)" value="${(it.notaAdmin||'').replace(/"/g,'&quot;')}">`:''}
        ${canPriceAdmin?`<div class="order-price-row">
          <input class="order-price-in" id="pu_${i}" inputmode="decimal" value="${priceVal}" placeholder="Precio hoy" oninput="onOrderPriceInput(${i},'${id}')" onblur="formatOrderPriceBlur(${i})">
          <select class="order-price-unit" id="punit_${i}" onchange="onOrderPriceInput(${i},'${id}')">
            ${UNITS.map(u=>`<option value="${u.id}" ${(it.priceUnit||dp?.priceUnit||it.wUnit||it.u||'kilo')===u.id?'selected':''}>/${u.short}</option>`).join('')}
          </select></div>`:''}
        ${priced?(lineTot?.pending?`<div class="price-total-box pending">⏳ Falta por acomodar</div>`:`<div class="price-total-box">🪙 $${fmtMoney(lineTot.total)}</div>`):''}
      </div></div>`;
  }).join('');
  $('#orderDetailBody').innerHTML=`
    ${photoHero}${photoInfo}${confirmBanner}${savedTranscribe}${transcribePanel}${priceHint}${incomplete}
    <div class="order-detail-meta">
      ${fmtDate(o.date)} · ${fmtTime12(o.time)} · ${shiftLabel(o.shift)} · Entrega: ${o.deliveryTime?fmtTime12(o.deliveryTime):'sin hora'}
      ${o.description?'<br>📝 '+o.description:''}
      ${rem?'<br>📄 Remisión Nº '+rem.numero:''}
      <br>Estado: <b>${statusLabel(o.status)}</b>${isPorConfirmar?' (operarios y Compras aún no lo ven)':''}${o.operarioId?' · '+workerName(o.operarioId):''}
    </div>
    ${rows||'<p style="font-weight:700;color:var(--ink-soft);padding:8px 0">Sin productos listados aún.</p>'}`;
  const showTotal=canPriceAdmin||o.status==='remisionado'||o.remisionNo;
  const totalBar=$('#orderDetailTotalBar');
  if(totalBar){
    if(showTotal&&o.items?.length){
      const pending=orderAcomodoPendingCount(o);
      const realTotal=orderTotalAcomodado(o);
      totalBar.classList.add('show');
      totalBar.innerHTML=`<div><span class="total-lbl">Total acomodado</span>${pending?`<span class="total-sub">${pending} producto(s) falta por acomodar</span>`:''}</div><span class="total-amt" id="orderGrandTotal">$${fmtMoney(realTotal)}</span>`;
    }else{
      totalBar.classList.remove('show');
      totalBar.innerHTML='';
    }
  }
  const foot=$('#orderDetailFoot'); foot.innerHTML='';
  const addBtn=(label,cls,fn,large)=>{
    const b=document.createElement('button');
    b.className='btn '+cls+(large?' btn-lg':''); b.innerHTML=label; b.onclick=fn; foot.appendChild(b);
  };
  const canConfirm=isAdmin&&isPorConfirmar&&!readOnly&&o.status!=='anulado'&&!needsTranscription;
  if(canConfirm)
    addBtn('✅ Confirmar pedido','green',()=>confirmOrderAdmin(id),true);
  else if(isAdmin&&o.status==='pendiente'&&!readOnly)
    addBtn('💾 Guardar precios','ghost',()=>saveOrderPrices(id));
  if(canRemision) addBtn('📄 Crear remisión','green',()=>createRemision(id));
  if(isAdmin) addBtn('💬 Chat con cliente','yellow',()=>openOrderChat(id));
  if(rem||o.remisionNo) addBtn('📄 Ver remisión','yellow',()=>viewRemision(rem?.id,o.remisionNo||orderRemisionNo(o)));
  if(isAdmin&&o.status==='acomodando'&&!readOnly) addBtn('🔄 Actualizar','ghost',()=>renderOrderDetailPage(id,readOnly));
  if(isAdmin&&o.imagenOriginal&&!o.photoOnly) addBtn('📷 Foto','ghost',()=>showOrderPhotoById(o.id));
  if(isAdmin&&o.photoOnly&&!o.items?.length) addBtn('✍️ Transcribir','green',()=>startOrderPhotoInterpret(id));
  else if(isAdmin&&o.imagenOriginal&&o.items?.length) addBtn('✍️ Re-transcribir','ghost',()=>startOrderPhotoInterpret(id));
  if(rem&&isAdmin&&!rem.enviadaAOperarioId) addBtn('📨 Enviar a operario','orange',()=>sendRemisionToWorker(rem.id));
  if(isAdmin&&o.status!=='anulado'&&!readOnly) addBtn('Anular','ghost sm',()=>voidOrder(o.id));
  if(typeof renderSubViewTopActions==='function') renderSubViewTopActions();
  if(window.transcribingOrderId===id&&window.pendingItems?.length&&typeof renderInterpretInline==='function'){
    renderInterpretInline('orderTranscribePanel');
  }
  syncOrderDetailScrollPad();
}

function saveOrderPrices(orderId){
  const o=DB.orders.find(x=>x.id===orderId);
  if(!o) return;
  o.items.forEach((it,i)=>{
    const up=parseOrderPriceInput($('#pu_'+i));
    if(!isNaN(up)&&up>=0){
      it.unitPrice=up;
      it.priceUnit=$('#punit_'+i)?.value||it.u||'kilo';
      it.total=calcPriceTotal(it);
      setDailyPrice(it.p,up,it.priceUnit,o.date);
    }
  });
  audit('Guardó precios del pedido',clientName(o.clientId));
  flushSave().then(()=>{toast('Precios guardados ✅');renderOrderDetailPage(orderId);});
}

async function confirmOrderAdmin(orderId){
  const o=DB.orders.find(x=>x.id===orderId);
  if(!o||o.status!=='por_confirmar') return;
  if(orderNeedsTranscription(o)){
    toast('Transcribe y corrige el pedido por foto antes de confirmar');
    return;
  }
  if(window.transcribingOrderId===orderId&&window.pendingItems?.length){
    toast('Termina la transcripción antes de confirmar');
    return;
  }
  if(o.transcribeDraft?.some(it=>!it.removed&&it.highlight!=='none'&&!it.resolved)){
    toast('Corrige las palabras resaltadas en la transcripción');
    return;
  }
  o.items.forEach((it,i)=>{
    const note=$('#notaAdmin_'+i)?.value;
    if(note!=null) it.notaAdmin=note.trim();
    const up=parseOrderPriceInput($('#pu_'+i));
    if(!isNaN(up)&&up>=0){
      it.unitPrice=up;
      it.priceUnit=$('#punit_'+i)?.value||it.u||'kilo';
      if(it.u==='valor') resolveValorToKg(it,up);
      it.total=calcPriceTotal(it);
      setDailyPrice(it.p,up,it.priceUnit,o.date);
    }
  });
  o.status='pendiente';
  o.confirmadoEn=new Date().toISOString();
  o.confirmadoPor=session?.name||'Admin';
  audit('Confirmó pedido',clientName(o.clientId));
  await flushSave();
  toast('Pedido confirmado — visible para operarios y Compras ✅');
  renderOrderDetailPage(orderId);
  if(typeof updateAdminNavBadges==='function') updateAdminNavBadges();
}

function onOrderPriceInput(i,oid){
  updatePriceRow(i,oid);
  const o=DB.orders.find(x=>x.id===oid);
  const it=o?.items[i];
  if(it&&it.u==='valor'){
    resolveValorToKg(it,it.unitPrice);
    const hint=$('#prow_'+i+' .valor-hint');
    if(hint) hint.textContent=it.qKg!=null?`✅ ${it.qKg} kg calculados (@ $${fmtMoney(it.unitPrice)}/kg)`:'Ingresa precio/kg abajo → se calculan los kilos automáticamente';
  }
  if(it&&it.unitPrice!=null) setDailyPrice(it.p,it.unitPrice,it.priceUnit,o.date);
}

function openOrderDetail(id,readOnly){
  const o=DB.orders.find(x=>x.id===id); if(!o)return;
  if(session.role==='admin'){
    const active=$('.view.active');
    if(active?.id==='v-remision') pushNavState({kind:'remision'});
    else if(active?.id==='v-order-detail') pushNavState({kind:'order-detail',orderId:window._currentOrderDetailId||id,readOnly});
    else if(active?.id==='v-chat') pushNavState({kind:'chat',conversacionId:window.activeChatId});
    else pushNavState({kind:'admin-tab',tab:adminTab,view:active?.id||'v-admin'});
    window._currentOrderDetailId=id;
    renderOrderDetailPage(id,readOnly);
    showView('v-order-detail');
    return;
  }
  renderOrderDetailSheet(id,readOnly);
}

function renderOrderDetailSheet(id,readOnly){
  const o=DB.orders.find(x=>x.id===id); if(!o)return;
  normOrder(o);
  const c=DB.clients.find(x=>x.id===o.clientId)||{};
  const isAdmin=session.role==='admin';
  const canPrice=isAdmin&&o.status==='acomodado'&&!readOnly;
  const rem=DB.remisiones.find(r=>r.pedidoId===o.id);
  const photoBanner=o.photoOnly&&!o.items?.length?`
    <div class="photo-info-banner">📷 <b>Pedido con foto.</b> Olga transcribirá este pedido.</div>
    ${o.imagenOriginal?`<img src="${o.imagenOriginal}" class="photo-client-wide" style="margin-bottom:10px" onclick="showOrderPhotoById('${o.id}')">`:''}`:'';
  const rows=o.items.map((it,i)=>{
    const p=DB.products.find(x=>x.id===it.p)||{};
    const acom=it.w!=null?` · Acomodado: ${it.w} ${fmtUnit(it.wUnit||'kilo')}`:'';
    const tot=it.total!=null?it.total:calcPriceTotal(it);
    const priced=it.unitPrice!=null;
    return `<div class="rev-row" id="prow_${i}">
      <span class="re">${p.emoji||'🥬'}</span>
      <div class="rn"><b>${p.name}</b>
        <span>Pedido: ${it.q} ${it.uCliente||fmtUnit(it.u)}${acom}${it.equivNote?` · 📝 ${it.equivNote}`:''}</span>
        ${canPrice?`<div style="margin-top:6px;display:flex;gap:6px;align-items:center;flex-wrap:wrap">
          <input class="qty-in price-in" id="pu_${i}" inputmode="decimal" value="${it.unitPrice||''}" placeholder="Precio" oninput="updatePriceRow(${i},'${id}')">
          <select id="punit_${i}" onchange="updatePriceRow(${i},'${id}')">
            ${UNITS.map(u=>`<option value="${u.id}" ${(it.priceUnit||it.wUnit||'kilo')===u.id?'selected':''}>/${u.short}</option>`).join('')}
          </select></div>`:''}
        ${priced?`<div class="price-total-box">🪙 $${fmtMoney(tot)}</div>`:''}
      </div></div>`;
  }).join('');
  const btns=[];
  if(canPrice) btns.push({label:'📄 Crear remisión',cls:'green',fn:()=>createRemision(id)});
  if(rem||o.remisionNo) btns.push({label:'📄 Ver remisión',cls:'yellow',fn:()=>viewRemision(rem?.id,o.remisionNo)});
  if(o.imagenOriginal&&!o.photoOnly) btns.push({label:'📷 Foto original',cls:'ghost',fn:()=>showOrderPhotoById(o.id)});
  if(isAdmin&&o.photoOnly&&!o.items?.length) btns.push({label:'✍️ Transcribir pedido',cls:'green',fn:()=>{closeSheet();openOrderDetail(o.id);setTimeout(()=>startOrderPhotoInterpret(o.id),50);}});
  if(rem&&isAdmin&&!rem.enviadaAOperarioId) btns.push({label:'📨 Enviar a operario',cls:'orange',fn:()=>sendRemisionToWorker(rem.id)});
  if(isAdmin&&o.status!=='anulado'&&!readOnly) btns.push({label:'🗑️ Anular',cls:'orange',fn:()=>voidOrder(o.id)});
  openSheet(`${readOnly?'👁️ ':''}📦 Pedido — ${c.name}`,`
    <div style="font-size:13px;font-weight:700;color:var(--ink-soft);margin-bottom:10px">
      ${fmtDate(o.date)} · ${fmtTime12(o.time)} · ${shiftLabel(o.shift)} · Entrega: ${o.deliveryTime?fmtTime12(o.deliveryTime):'sin hora'}
      ${o.description?'<br>📝 '+o.description:''}
      ${rem?'<br>📄 Remisión Nº '+rem.numero:''}
      <br>Estado: <b>${statusLabel(o.status)}</b>${o.operarioId?' · '+workerName(o.operarioId):''}
    </div>${photoBanner}${rows||'<p style="font-weight:700;color:var(--ink-soft);padding:8px 0">Sin productos listados aún.</p>'}
    ${canPrice?`<div id="orderGrandTotal" style="text-align:right;font-family:Fredoka;font-size:22px;font-weight:700;color:var(--green);margin-top:10px">Total: $${fmtMoney(orderTotal(o))}</div>`:''}
    ${o.status==='remisionado'||o.remisionNo?`<div style="text-align:right;font-family:Fredoka;font-size:22px;font-weight:700;color:var(--green);margin-top:10px">Total: $${fmtMoney(orderTotal(o))}</div>`:''}`,
    btns);
}

function formatOrderPriceBlur(i){
  const inp=$('#pu_'+i);
  if(!inp) return;
  const n=parseOrderPriceInput(inp);
  if(!isNaN(n)&&n>=0) inp.value=formatOrderPriceValue(n);
}

function updatePriceRow(i,oid){
  const o=DB.orders.find(x=>x.id===oid); if(!o)return;
  const it=o.items[i];
  const up=parseOrderPriceInput($('#pu_'+i));
  if(!isNaN(up)&&up>=0){
    it.unitPrice=up;
    it.priceUnit=$('#punit_'+i)?.value||'kilo';
    if(it.u==='valor') resolveValorToKg(it,up);
    it.total=calcPriceTotal(it);
  }
  const row=$('#prow_'+i);
  let box=row?.querySelector('.price-total-box');
  if(it.unitPrice!=null){
    const lineTot=itemLineTotalDisplay(it);
    if(!box&&row){box=document.createElement('div');box.className='price-total-box';row.querySelector('.rn').appendChild(box);}
    if(box){
      box.className='price-total-box'+(lineTot?.pending?' pending':'');
      box.innerHTML=lineTot?.pending?'⏳ Falta por acomodar':('🪙 $'+fmtMoney(lineTot.total));
    }
  }
  if(it.u==='valor'&&it.qKg!=null){
    const hint=row?.querySelector('.valor-hint');
    if(hint) hint.textContent=`✅ ${it.qKg} kg calculados (@ $${fmtMoney(it.unitPrice)}/kg)`;
  }
  const gt=$('#orderGrandTotal');
  if(gt) gt.textContent='$'+fmtMoney(orderTotalAcomodado(o));
  const pending=orderAcomodoPendingCount(o);
  const sub=$('.order-detail-total-bar .total-sub');
  if(sub) sub.textContent=pending?`${pending} producto(s) falta por acomodar`:'';
  else if(pending){
    const lbl=$('.order-detail-total-bar .total-lbl')?.parentElement;
    if(lbl&&!lbl.querySelector('.total-sub')){
      const sp=document.createElement('span');
      sp.className='total-sub';
      sp.textContent=`${pending} producto(s) falta por acomodar`;
      lbl.appendChild(sp);
    }
  }
}

async function createRemision(id){
  const o=DB.orders.find(x=>x.id===id); if(!o)return;
  o.items.forEach((it,i)=>{
    const up=parseOrderPriceInput($('#pu_'+i));
    if(!isNaN(up)&&up>=0){
      it.unitPrice=up; it.priceUnit=$('#punit_'+i)?.value||'kilo';
      it.total=calcPriceTotal(it);
    }
  });
  const num=nextRemisionNo();
  const rem={
    id:uid(),numero:num,pedidoId:o.id,clienteId:o.clientId,
    fecha:o.date,
    items:o.items.map(it=>({...it})),
    valorTotalGeneral:orderTotal(o),
    enviadaAOperarioId:null,enviadaEn:null,vistaPorOperario:false,
    creadoEn:new Date().toISOString(),
  };
  DB.remisiones.push(rem);
  o.remisionNo=num;
  o.status='remisionado';
  o.pricedBy=session.name;
  o.pricedAt=new Date().toISOString();
  audit('Creó remisión','Nº '+num+' · '+clientName(o.clientId));
  await flushSave();
  if($('#v-order-detail')?.classList.contains('active')){
    renderOrderDetailPage(id);
  }else{
    closeSheet();
    adminNav(adminTab);
  }
  viewRemision(rem.id);
  toast('Remisión Nº '+num+' creada ✅');
}

function viewRemision(remId,legacyNo){
  const rem=DB.remisiones.find(x=>x.id===remId);
  let o, num;
  if(rem){
    o=DB.orders.find(x=>x.id===rem.pedidoId);
    num=rem.numero;
  }else{
    o=DB.orders.find(x=>x.remisionNo===legacyNo);
    num=legacyNo||o?.remisionNo;
  }
  if(!o){toast('Remisión no encontrada');return;}
  const active=$('.view.active');
  if(active?.id==='v-order-detail'){
    pushNavState({kind:'order-detail',orderId:window._currentOrderDetailId||o.id,readOnly:false});
  }else if(active?.id==='v-chat'){
    pushNavState({kind:'chat',conversacionId:window.activeChatId});
  }else{
    pushNavState({kind:'admin-tab',tab:adminTab,view:active?.id||'v-admin'});
  }
  window.currentRemisionView={remId:rem?.id,orderId:o.id,num,html:remisionHTML([{...o,items:rem?.items||o.items,remisionNo:num}],'',num)};
  renderRemisionPage();
  showView('v-remision');
}

function renderRemisionPage(){
  const v=window.currentRemisionView; if(!v)return;
  $('#remisionTitle').textContent='Remisión Nº '+v.num;
  $('#remisionSub').textContent=clientName(DB.orders.find(x=>x.id===v.orderId)?.clientId||'');
  $('#remisionBody').innerHTML=(typeof orderIsIncomplete==='function'&&orderIsIncomplete(DB.orders.find(x=>x.id===v.orderId))?incompleteWidgetHTML():'')+v.html;
  const foot=$('#remisionFoot'); foot.innerHTML='';
  const printBtn=document.createElement('button');
  printBtn.className='btn yellow'; printBtn.textContent='🖨️ Imprimir / PDF';
  printBtn.onclick=printRemisionView;
  foot.appendChild(printBtn);
  if(v.orderId){
    const see=document.createElement('button');
    see.className='btn ghost'; see.textContent='📦 Ver pedido';
    see.onclick=()=>{
      pushNavState({kind:'remision'});
      window._currentOrderDetailId=v.orderId;
      renderOrderDetailPage(v.orderId,true);
      showView('v-order-detail');
    };
    foot.appendChild(see);
  }
}

function printRemisionView(){
  const v=window.currentRemisionView;
  const o=v?.orderId?DB.orders.find(x=>x.id===v.orderId):null;
  const doPrint=()=>{
    const h=v?.html||$('#remisionBody')?.innerHTML;
    if(!h)return;
    $('#printArea').innerHTML=h;
    $('#printArea').style.display='block';
    window.print();
    setTimeout(()=>{$('#printArea').style.display='none';},500);
  };
  if(o&&typeof orderIsIncomplete==='function'&&orderIsIncomplete(o)){
    openSheet('Remisión incompleta',`
      <p style="font-weight:700;line-height:1.5;margin-bottom:8px">Este pedido aún no tiene todos los precios unitarios o totales.</p>
      <p style="font-weight:700;color:var(--ink-soft);line-height:1.5">¿Deseas imprimir o exportar a PDF de todos modos?</p>`,
      [{label:'🖨️ Imprimir igualmente',cls:'orange',fn:()=>{closeSheet();doPrint();}}]);
    return;
  }
  doPrint();
}

function sendRemisionToWorker(remId){
  const rem=DB.remisiones.find(x=>x.id===remId); if(!rem)return;
  const opts=(DB.workers||[]).filter(w=>w.activo!==false).map(w=>`<option value="${w.id}">${w.name}</option>`).join('');
  openSheet('📨 Enviar remisión a operario',`
    <select id="remWorker" style="width:100%;border:2px solid var(--line);border-radius:12px;padding:10px;font-weight:700">${opts}</select>`,
    [{label:'Enviar',cls:'green',fn:()=>{
      const wid=$('#remWorker').value;
      rem.enviadaAOperarioId=wid;
      rem.enviadaEn=new Date().toISOString();
      addNotification(wid,'remision_recibida',rem.id,session.id);
      audit('Envió remisión a operario','Nº '+rem.numero+' → '+workerName(wid));
      flushSave(); closeSheet(); toast('Remisión enviada 📨');
    }}]);
}

/* ---------- admin pedidos con filtros ---------- */
function renderOrders(){
  const porConfirmar=DB.orders.filter(o=>o.date===ordersDate&&o.status==='por_confirmar').sort(sortByDeliveryTime);
  const list=DB.orders.filter(o=>o.date===ordersDate&&o.status!=='anulado'&&o.status!=='por_confirmar').sort(sortByDeliveryTime);
  const clients=[...new Set([...porConfirmar,...list].map(o=>o.clientId))];
  const chips=[`<button class="filter-chip ${adminClientFilter==='all'?'on':''}" onclick="adminClientFilter='all';renderOrders()">Todos</button>`]
    .concat(clients.map(cid=>{
      const c=DB.clients.find(x=>x.id===cid)||{};
      return `<button class="filter-chip ${adminClientFilter===cid?'on':''}" onclick="adminClientFilter='${cid}';renderOrders()" title="${c.name||''}">${c.name||'Cliente'}</button>`;
    })).join('');
  const filteredPor=adminClientFilter==='all'?porConfirmar:porConfirmar.filter(o=>o.clientId===adminClientFilter);
  const filtered=adminClientFilter==='all'?list:list.filter(o=>o.clientId===adminClientFilter);
  const porSection=filteredPor.length?`
    <div class="card pop" style="padding:12px;margin-bottom:12px;border:2px solid var(--orange)">
      <b class="display" style="font-size:16px">📋 ${filteredPor.length} por confirmar</b>
      <span style="font-size:12px;color:var(--ink-soft);font-weight:700;display:block;margin:6px 0 10px">Revisa y confirma antes de que sumen en Compras</span>
      ${filteredPor.map(o=>orderRowHTML(o)).join('')}
    </div>`:'';
  $('#adminBody').innerHTML=`
    ${ORDER_GUIDE}
    ${porSection}
    <div class="card pop" style="padding:12px;margin-bottom:10px;display:flex;gap:10px;align-items:center;flex-wrap:wrap">
      <b class="display" style="font-size:17px">📦 Pedidos del día</b><div class="spacer"></div>
      <input type="date" value="${ordersDate}" onchange="ordersDate=this.value;renderOrders()" style="border:2px solid var(--line);border-radius:11px;padding:8px;font-weight:700">
    </div>
    <button class="btn orange block" style="margin-bottom:10px" onclick="openManualOrder()">✍️ Registrar pedido manual</button>
    <div class="filter-scroll">${chips}</div>
    ${filtered.map(o=>orderRowHTML(o)).join('')||`<div class="empty"><span class="ee">📭</span><b class="display">Sin pedidos ese día</b></div>`}`;
  renderNotifFab();
}

/* ---------- dashboard rediseñado ---------- */
function renderDash(){
  const porConfirmar=DB.orders.filter(o=>o.date===todayStr()&&o.status==='por_confirmar').sort(sortByDeliveryTime);
  const t=ordersOf(todayStr()).filter(o=>o.status!=='por_confirmar');
  const acomodados=t.filter(o=>['acomodado','remisionado','cerrado','pesado','facturado'].includes(o.status)).length;
  const total=t.length||1;
  const pct=Math.round((acomodados/total)*100);
  const ingresosAcomodados=t.filter(o=>['acomodado','remisionado','cerrado','facturado'].includes(o.status)).reduce((s,o)=>s+orderTotal(o),0);
  const ingresosRemisionados=t.filter(o=>['remisionado','cerrado','facturado'].includes(o.status)).reduce((s,o)=>s+orderTotal(o),0);
  const valorParcial=ingresosAcomodados;
  const tiempos=t.filter(o=>o.acomodoIniciadoEn&&o.acomodoFinalizadoEn).map(o=>(new Date(o.acomodoFinalizadoEn)-new Date(o.acomodoIniciadoEn))/60000);
  const avgMin=tiempos.length?Math.round(tiempos.reduce((a,b)=>a+b,0)/tiempos.length):0;
  const clientsIn=new Set(t.map(o=>o.clientId)).size;
  const pendClients=DB.clients.length-clientsIn;
  const title=`Pedidos para despachar hoy ${dispatchDayLabel()}`;
  const dashOrders=t.sort(sortByDeliveryTime);
  const chips=[`<button class="filter-chip ${adminClientFilter==='all'?'on':''}" onclick="adminClientFilter='all';renderDash()">Todos</button>`]
    .concat([...new Set(dashOrders.map(o=>o.clientId))].map(cid=>{
      const c=DB.clients.find(x=>x.id===cid)||{};
      return `<button class="filter-chip ${adminClientFilter===cid?'on':''}" onclick="adminClientFilter='${cid}';renderDash()" title="${c.name||''}">${c.name||'Cliente'}</button>`;
    })).join('');
  const filtered=adminClientFilter==='all'?dashOrders:dashOrders.filter(o=>o.clientId===adminClientFilter);
  $('#adminBody').innerHTML=`
    <div class="dash-grid dash-grid-5">
      <div class="dash-ring card pop">
        <svg viewBox="0 0 120 120" class="progress-ring">
          <circle cx="60" cy="60" r="52" fill="none" stroke="#edf0f3" stroke-width="12"/>
          <circle cx="60" cy="60" r="52" fill="none" stroke="var(--green)" stroke-width="12"
            stroke-dasharray="${326*pct/100} 326" stroke-linecap="round" transform="rotate(-90 60 60)"/>
        </svg>
        <div class="ring-label"><b>${acomodados}</b> de <b>${t.length}</b><span>acomodados hoy</span></div>
      </div>
      <div class="dash-stat card pop y"><div class="ds-num">$${fmtMoney(valorParcial)}</div><div class="ds-lbl">Ingresos acomodados <small>(con precios)</small></div></div>
      <div class="dash-stat card pop p"><div class="ds-num">$${fmtMoney(ingresosRemisionados)}</div><div class="ds-lbl">Ingresos remisionados</div></div>
      <div class="dash-stat card pop o"><div class="ds-num">${avgMin||'—'}<small> min</small></div><div class="ds-lbl">Tiempo promedio acomodo</div></div>
      <div class="dash-stat card pop g"><div class="ds-num">${pendClients}</div><div class="ds-lbl">Clientes sin pedir hoy</div></div>
    </div>
    <div class="card pop" style="padding:14px;margin-top:12px;animation-delay:.2s">
      <b class="display">⏰ Hora de corte: ${typeof fmtCutoffLabel==='function'?fmtCutoffLabel():fmtTime12(DB.config.cutoff)}</b>
      <span style="font-size:12px;color:var(--ink-soft);font-weight:700;display:block;margin-top:4px">Pedidos 2 pm – medianoche → compra madrugada 3–6 am</span>
    </div>
    ${porConfirmar.length?`<div class="card pop" style="padding:12px;margin-top:12px;border:2px solid var(--orange)">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
        <b class="display">📋 ${porConfirmar.length} pedido(s) por confirmar</b>
        <span class="chip exc">Revisar</span>
      </div>
      ${porConfirmar.map(o=>orderCardHTML(o)).join('')}
    </div>`:''}
    <div style="display:grid;gap:10px;grid-template-columns:1fr 1fr;margin-top:12px">
      <button class="btn green" onclick="adminNav('consol')">🧮 Ver lista de compra</button>
      <button class="btn orange" onclick="openManualOrder()">✍️ Registrar pedido</button>
    </div>
    <h3 style="margin:16px 0 8px;font-weight:600">${title}</h3>
    <div class="filter-scroll">${chips}</div>
    ${filtered.slice(0,20).map(o=>orderCardHTML(o)).join('')||'<div class="empty" style="padding:16px"><span class="ee">🌅</span><span>Aún no llegan pedidos hoy</span></div>'}`;
  renderNotifFab();
}

function voidOrder(id){
  const o=DB.orders.find(x=>x.id===id);
  openSheet('🗑️ Anular pedido',`
    <p style="font-weight:700;margin-bottom:12px">¿Anular el pedido de <b>${clientName(o.clientId)}</b> (${o.time})?</p>
    <div class="field"><label>Escribe <b>ANULAR</b> para confirmar</label>
      <input id="voidConfirm" placeholder="ANULAR" oninput="document.getElementById('voidBtn').disabled=this.value!=='ANULAR'"></div>`,
    [{label:'Sí, anular',cls:'orange',fn:()=>{
      if($('#voidConfirm').value!=='ANULAR'){toast('Debes escribir ANULAR');return;}
      o.status='anulado';
      audit('Anuló pedido',clientName(o.clientId)+' · '+o.date+' '+o.time);
      flushSave(); goBackNav(); adminNav(adminTab); toast('Pedido anulado');
    }}]);
  setTimeout(()=>{
    const btn=$('#sheetFoot')?.querySelector('.btn.orange');
    if(btn){btn.id='voidBtn';btn.disabled=true;}
  },50);
}

const _refreshCurrentView=typeof refreshCurrentView==='function'?refreshCurrentView:null;
refreshCurrentView=function(){
  if(_refreshCurrentView) _refreshCurrentView();
  renderNotifFab();
  renderAcomodoBubble();
};

window._renderDashImpl=renderDash;
window._renderOrdersImpl=renderOrders;
window._voidOrderImpl=voidOrder;
window._openOrderDetail=openOrderDetail;
window._orderRowHTML=orderRowHTML;
window.closeWorkerAcomodo=closeWorkerAcomodo;
window.openWorkerAcomodoPage=openWorkerAcomodoPage;
window.renderWorkerAcomodoPage=renderWorkerAcomodoPage;
window.saveOrderPrices=saveOrderPrices;
window.formatOrderPriceBlur=formatOrderPriceBlur;
window.ordersVisibleToWorkers=ordersVisibleToWorkers;
window.sortByDeliveryTime=sortByDeliveryTime;

window.addEventListener('resize',()=>{
  if($('#v-order-detail')?.classList.contains('active')) syncOrderDetailScrollPad();
});

function updateAdminNavBadges(){
  if(session?.role!=='admin') return;
  const n=DB.orders.filter(o=>o.status==='por_confirmar'&&o.date===todayStr()).length;
  $$('[data-anav]').forEach(b=>{
    let badge=b.querySelector('.nav-badge');
    if(b.dataset.anav==='dash'||b.dataset.anav==='orders'){
      if(n){
        if(!badge){badge=document.createElement('span');badge.className='nav-badge';b.appendChild(badge);}
        badge.textContent=n;
      }else if(badge) badge.remove();
    }
  });
}
window.updateAdminNavBadges=updateAdminNavBadges;
