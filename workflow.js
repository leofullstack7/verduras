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
function productName(pid){const p=DB.products.find(x=>x.id===pid);return p?p.name:'—';}

function orderPreview(o,max=3){
  const names=(o.items||[]).map(it=>productName(it.p));
  const shown=names.slice(0,max).join(', ');
  return shown+(names.length>max?` +${names.length-max} más`:'');
}

function statusChip(st){
  const m={pendiente:'pend',acomodando:'cons',acomodado:'cons',remisionado:'cons',pesado:'cons',facturado:'cons',consolidado:'cons',cerrado:'cerr',anulado:'anul'};
  return m[st]||'pend';
}
function statusLabel(st){
  return {pendiente:'Pendiente',acomodando:'Acomodándose…',acomodado:'Acomodado',remisionado:'Remisionado',pesado:'Acomodado',facturado:'Remisionado',consolidado:'Consolidado',cerrado:'Cerrado',anulado:'Anulado'}[st]||st;
}

function calcPriceTotal(it){
  const qty=it.w!=null?+it.w:+it.q;
  const qU=it.wUnit||it.u||'kilo';
  const pU=it.priceUnit||'kilo';
  const price=+it.unitPrice;
  if(!price||!qty) return 0;
  let amt=qty;
  if(pU==='kilo'&&qU==='gramo') amt=qty/1000;
  else if(pU==='gramo'&&qU==='kilo') amt=qty*1000;
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
  return `<div class="order-card pop" style="background:${sc.bg};cursor:pointer" onclick="${onclick}">
    <div class="oc-head"><span class="oc-emoji">${c.emoji||'🏪'}</span>
      <div class="oc-title"><b>${c.name||'—'}</b>
        <span>${ch} ${o.time}${o.deliveryTime?' · 🕐 '+o.deliveryTime:''}${o.description?' · 📝 '+o.description:''}</span>
        ${pulse||`<span class="oc-preview">${orderPreview(o)}</span>`}
        ${op?`<span class="oc-op">${op}</span>`:''}
      </div>
      <span class="chip ${sc.chip||statusChip(o.status)}">${statusLabel(o.status)}</span>
    </div></div>`;
}

function orderRowHTML(o){return orderCardHTML(o);}

/* ---------- operario: pantalla inicio ---------- */
function renderWorker(){
  const date=todayStr();
  const byClient={};
  DB.orders.filter(o=>o.date===date&&o.status!=='anulado'&&o.status!=='cerrado'&&o.status!=='remisionado')
    .forEach(o=>{
      if(!byClient[o.clientId]||o.time>byClient[o.clientId].time) byClient[o.clientId]=o;
    });
  const list=Object.values(byClient).sort((a,b)=>a.time.localeCompare(b.time));
  $('#workerBody').innerHTML=`
    <p style="font-size:13px;color:var(--ink-soft);font-weight:700;margin-bottom:10px">Pedidos de hoy por cliente — toca para acomodar o ver.</p>
    ${list.map(o=>orderCardHTML(o,{onclick:`workerTapOrder('${o.id}')`})).join('')||
      '<div class="empty"><span class="ee">✅</span><b class="display">Sin pedidos hoy</b><span>Cuando lleguen pedidos aparecerán aquí</span></div>'}`;
  renderNotifFab();
  renderAcomodoBubble();
}

function workerTapOrder(id){
  const o=DB.orders.find(x=>x.id===id); if(!o)return;
  if(o.status==='pendiente'){
    openSheet('🏪 '+clientName(o.clientId),`<p style="font-weight:700;margin-bottom:12px">${orderPreview(o,5)}</p>`,[
      {label:'📦 Acomodar pedido',cls:'green',fn:()=>{closeSheet();startAcomodo(id);}},
      {label:'👁️ Solo ver',cls:'ghost',fn:()=>{closeSheet();openAcomodoPanel(id,true);}},
    ]);
    return;
  }
  openAcomodoPanel(id,o.operarioId!==session.id);
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
  flushSave().then(()=>{openAcomodoPanel(id,false);renderWorker();});
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
      <div class="rn"><b>${p.name}</b><span>Pedido: ${it.q} ${fmtUnit(it.u)}</span></div>
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
    <button class="btn green sm" onclick="openAcomodoPanel('${acomodoMinimized.id}',false)">Abrir</button>
    <button class="icon-btn" onclick="acomodoMinimized=null;renderAcomodoBubble()">✕</button>`;
}

function finishAcomodo(id){
  const o=DB.orders.find(x=>x.id===id); if(!o)return;
  o.items.forEach((it,i)=>{
    const w=parseFloat($('#aw_'+i)?.value);
    if(!isNaN(w)&&w>0){it.w=w;it.wUnit=$('#awu_'+i)?.value||'kilo';}
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
    closeSheet();
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

function addNotification(userId,tipo,refId,fromId){
  DB.notifications.unshift({id:uid(),usuarioId:userId,tipo,referenciaId:refId,deUsuarioId:fromId||null,leida:false,creadoEn:new Date().toISOString()});
  DB.notifications=DB.notifications.slice(0,200);
  saveDB();
  renderNotifFab();
}

function unreadNotifCount(){
  if(!session||!DB.notifications) return 0;
  const uid=session.role==='admin'?'admin':session.id;
  return DB.notifications.filter(n=>n.usuarioId===uid&&!n.leida).length;
}

function renderNotifFab(){
  if(!session||session.role==='client'){const f=$('#notifFab');if(f)f.style.display='none';return;}
  let fab=$('#notifFab');
  if(!fab){
    fab=document.createElement('button');
    fab.id='notifFab';
    fab.className='notif-fab';
    fab.onclick=openNotifTray;
    document.body.appendChild(fab);
  }
  fab.style.display='flex';
  const n=unreadNotifCount();
  fab.innerHTML=`👩‍🌾${n?`<span class="notif-badge">${n}</span>`:''}`;
}

function openNotifTray(){
  const uid=session.role==='admin'?'admin':session.id;
  const list=(DB.notifications||[]).filter(n=>n.usuarioId===uid).sort((a,b)=>b.creadoEn.localeCompare(a.creadoEn));
  const rows=list.length?list.map(n=>notifRowHTML(n)).join(''):'<div class="empty"><span class="ee">📭</span><span>Sin notificaciones</span></div>';
  openSheet('👩‍🌾 Avisos de Olga',rows,[]);
}

function notifRowHTML(n){
  if(n.tipo==='invitacion_transferencia'){
    const inv=DB.invitations.find(x=>x.id===n.referenciaId);
    const o=inv?DB.orders.find(x=>x.id===inv.pedidoId):null;
    const from=inv?workerName(inv.operarioOrigenId):'—';
    const c=o?clientName(o.clientId):'—';
    if(inv&&inv.estado==='pendiente'){
      return `<div class="notif-row"><b>${from} te transfirió el pedido de ${c}</b>
        <div style="display:flex;gap:8px;margin-top:8px">
          <button class="btn green sm" onclick="resolveTransfer('${inv.id}','aceptada','${n.id}')">Aceptar</button>
          <button class="btn ghost sm" onclick="resolveTransfer('${inv.id}','rechazada','${n.id}')">Rechazar</button>
        </div></div>`;
    }
    return `<div class="notif-row" style="opacity:.6"><b>Transferencia ${inv?.estado||'—'}: ${c}</b></div>`;
  }
  if(n.tipo==='remision_recibida'){
    const rem=DB.remisiones.find(x=>x.id===n.referenciaId);
    return `<div class="notif-row" style="cursor:pointer" onclick="markNotifRead('${n.id}');viewRemision('${rem?.id||n.referenciaId}')">
      <b>📄 Remisión Nº ${rem?.numero||'—'} recibida</b>
      <span style="font-size:12px;color:var(--ink-soft);font-weight:700">${rem?clientName(rem.clienteId):''}</span></div>`;
  }
  return `<div class="notif-row">${n.tipo}</div>`;
}

function markNotifRead(nid){
  const n=DB.notifications.find(x=>x.id===nid);
  if(n){n.leida=true;saveDB();renderNotifFab();}
}

function resolveTransfer(invId,res,nid){
  const inv=DB.invitations.find(x=>x.id===invId); if(!inv)return;
  const o=DB.orders.find(x=>x.id===inv.pedidoId); if(!o)return;
  inv.estado=res==='aceptada'?'aceptada':'rechazada';
  inv.resueltoEn=new Date().toISOString();
  markNotifRead(nid);
  if(res==='aceptada'){
    o.operarioId=inv.operarioDestinoId;
    addNotification(inv.operarioOrigenId,'transferencia_aceptada',inv.id,session.id);
    toast('Transferencia aceptada ✅');
  }else{
    addNotification(inv.operarioOrigenId,'transferencia_rechazada',inv.id,session.id);
    toast('Transferencia rechazada');
  }
  audit('Transferencia '+inv.estado,clientName(o.clientId));
  flushSave(); closeSheet(); renderWorker(); renderNotifFab();
}

/* ---------- admin: detalle pedido + remisión ---------- */
function openOrderDetail(id,readOnly){
  const o=DB.orders.find(x=>x.id===id); if(!o)return;
  normOrder(o);
  const c=DB.clients.find(x=>x.id===o.clientId)||{};
  const isAdmin=session.role==='admin';
  const canPrice=isAdmin&&o.status==='acomodado'&&!readOnly;
  const rem=DB.remisiones.find(r=>r.pedidoId===o.id);
  const rows=o.items.map((it,i)=>{
    const p=DB.products.find(x=>x.id===it.p)||{};
    const acom=it.w!=null?` · Acomodado: ${it.w} ${fmtUnit(it.wUnit||'kilo')}`:'';
    const tot=it.total!=null?it.total:calcPriceTotal(it);
    const priced=it.unitPrice!=null;
    return `<div class="rev-row" id="prow_${i}">
      <span class="re">${p.emoji||'🥬'}</span>
      <div class="rn"><b>${p.name}</b>
        <span>Pedido: ${it.q} ${fmtUnit(it.u)}${acom}</span>
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
  if(rem&&isAdmin&&!rem.enviadaAOperarioId) btns.push({label:'📨 Enviar a operario',cls:'orange',fn:()=>sendRemisionToWorker(rem.id)});
  if(isAdmin&&o.status!=='anulado'&&!readOnly) btns.push({label:'🗑️ Anular',cls:'orange',fn:()=>voidOrder(o.id)});
  openSheet(`${readOnly?'👁️ ':''}📦 Pedido — ${c.name}`,`
    <div style="font-size:13px;font-weight:700;color:var(--ink-soft);margin-bottom:10px">
      ${fmtDate(o.date)} · ${o.time} · ${shiftLabel(o.shift)} · Entrega: ${o.deliveryTime||'—'}
      ${o.description?'<br>📝 '+o.description:''}
      ${rem?'<br>📄 Remisión Nº '+rem.numero:''}
      <br>Estado: <b>${statusLabel(o.status)}</b>${o.operarioId?' · '+workerName(o.operarioId):''}
    </div>${rows}
    ${canPrice?`<div id="orderGrandTotal" style="text-align:right;font-family:Fredoka;font-size:22px;font-weight:700;color:var(--green);margin-top:10px">Total: $${fmtMoney(orderTotal(o))}</div>`:''}
    ${o.status==='remisionado'||o.remisionNo?`<div style="text-align:right;font-family:Fredoka;font-size:22px;font-weight:700;color:var(--green);margin-top:10px">Total: $${fmtMoney(orderTotal(o))}</div>`:''}`,
    btns);
}

function updatePriceRow(i,oid){
  const o=DB.orders.find(x=>x.id===oid); if(!o)return;
  const it=o.items[i];
  const up=parseFloat($('#pu_'+i)?.value);
  if(!isNaN(up)&&up>=0){
    it.unitPrice=up;
    it.priceUnit=$('#punit_'+i)?.value||'kilo';
    it.total=calcPriceTotal(it);
  }
  const row=$('#prow_'+i);
  let box=row?.querySelector('.price-total-box');
  if(it.unitPrice!=null){
    if(!box&&row){box=document.createElement('div');box.className='price-total-box';row.querySelector('.rn').appendChild(box);}
    if(box) box.innerHTML='🪙 $'+fmtMoney(it.total);
  }
  const gt=$('#orderGrandTotal');
  if(gt) gt.textContent='Total: $'+fmtMoney(orderTotal(o));
}

async function createRemision(id){
  const o=DB.orders.find(x=>x.id===id); if(!o)return;
  o.items.forEach((it,i)=>{
    const up=parseFloat($('#pu_'+i)?.value);
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
  closeSheet();
  adminNav(adminTab);
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
  const html=remisionHTML([{...o,items:rem?.items||o.items,remisionNo:num}],'',num);
  openSheet('📄 Remisión Nº '+num,`
    <div id="remView">${html}</div>
    <div class="no-print-rem" style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap">
      <button class="btn yellow sm" onclick="printRemisionView()">🖨️ Imprimir / PDF</button>
      <button class="btn ghost sm" onclick="openOrderDetail('${o.id}',true)">📦 Ver pedido</button>
    </div>`,[]);
}

function printRemisionView(){
  const h=$('#remView')?.innerHTML;
  if(!h)return;
  $('#printArea').innerHTML=h;
  $('#printArea').style.display='block';
  window.print();
  setTimeout(()=>{$('#printArea').style.display='none';},500);
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
  const list=DB.orders.filter(o=>o.date===ordersDate&&o.status!=='anulado').sort((a,b)=>b.time.localeCompare(a.time));
  const clients=[...new Set(list.map(o=>o.clientId))];
  const chips=[`<button class="filter-chip ${adminClientFilter==='all'?'on':''}" onclick="adminClientFilter='all';renderOrders()">Todos</button>`]
    .concat(clients.map(cid=>{
      const c=DB.clients.find(x=>x.id===cid)||{};
      return `<button class="filter-chip ${adminClientFilter===cid?'on':''}" onclick="adminClientFilter='${cid}';renderOrders()">${c.name?.split(' ')[0]||'—'}</button>`;
    })).join('');
  const filtered=adminClientFilter==='all'?list:list.filter(o=>o.clientId===adminClientFilter);
  $('#adminBody').innerHTML=`
    ${ORDER_GUIDE}
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
  const t=ordersOf(todayStr());
  const acomodados=t.filter(o=>['acomodado','remisionado','cerrado','pesado','facturado'].includes(o.status)).length;
  const total=t.length||1;
  const pct=Math.round((acomodados/total)*100);
  const valorParcial=t.filter(o=>['acomodado','remisionado','facturado'].includes(o.status)).reduce((s,o)=>s+orderTotal(o),0);
  const tiempos=t.filter(o=>o.acomodoIniciadoEn&&o.acomodoFinalizadoEn).map(o=>(new Date(o.acomodoFinalizadoEn)-new Date(o.acomodoIniciadoEn))/60000);
  const avgMin=tiempos.length?Math.round(tiempos.reduce((a,b)=>a+b,0)/tiempos.length):0;
  const clientsIn=new Set(t.map(o=>o.clientId)).size;
  const pendClients=DB.clients.length-clientsIn;
  const title=`Pedidos para despachar ${cutoffPassed()?'mañana':'hoy'} ${dispatchDayLabel()}`;
  const dashOrders=t.sort((a,b)=>b.time.localeCompare(a.time));
  const chips=[`<button class="filter-chip ${adminClientFilter==='all'?'on':''}" onclick="adminClientFilter='all';renderDash()">Todos</button>`]
    .concat([...new Set(dashOrders.map(o=>o.clientId))].map(cid=>{
      const c=DB.clients.find(x=>x.id===cid)||{};
      return `<button class="filter-chip ${adminClientFilter===cid?'on':''}" onclick="adminClientFilter='${cid}';renderDash()">${c.name?.split(' ')[0]||'—'}</button>`;
    })).join('');
  const filtered=adminClientFilter==='all'?dashOrders:dashOrders.filter(o=>o.clientId===adminClientFilter);
  $('#adminBody').innerHTML=`
    <div class="dash-grid">
      <div class="dash-ring card pop">
        <svg viewBox="0 0 120 120" class="progress-ring">
          <circle cx="60" cy="60" r="52" fill="none" stroke="#edf0f3" stroke-width="12"/>
          <circle cx="60" cy="60" r="52" fill="none" stroke="var(--green)" stroke-width="12"
            stroke-dasharray="${326*pct/100} 326" stroke-linecap="round" transform="rotate(-90 60 60)"/>
        </svg>
        <div class="ring-label"><b>${acomodados}</b> de <b>${t.length}</b><span>acomodados hoy</span></div>
      </div>
      <div class="dash-stat card pop y"><div class="ds-num">$${fmtMoney(valorParcial)}</div><div class="ds-lbl">Valor del día <small>(parcial)</small></div></div>
      <div class="dash-stat card pop o"><div class="ds-num">${avgMin||'—'}<small> min</small></div><div class="ds-lbl">Tiempo promedio acomodo</div></div>
      <div class="dash-stat card pop g"><div class="ds-num">${pendClients}</div><div class="ds-lbl">Clientes sin pedir hoy</div></div>
    </div>
    <div class="card pop" style="padding:14px;margin-top:12px;animation-delay:.2s">
      <b class="display">⏰ Hora de corte: ${DB.config.cutoff}</b>
    </div>
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
      flushSave(); closeSheet(); adminNav(adminTab); toast('Pedido anulado');
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
