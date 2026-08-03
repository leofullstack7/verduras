/* ============================================================
   FRUVER PEDIDOS — extensiones: remisiones, operarios, compras
   ============================================================ */
/* UNITS + fmtUnit → units.js */
const COMPANY={name:'DISTRIBUIDORA L y O',owner:'Olga Patricia Ocampo C.',cc:'30.394.171',address:'Cra 16 Nº 22-48 - Plaza de Mercado',phone:'310 376 56 74',city:'Manizales'};
const ORDER_GUIDE=`
<div class="hints" style="margin-bottom:12px;text-align:left">
<b>📱 Cómo piden los clientes (WhatsApp / app)</b><br><br>
• <b>Lista con montos:</b> “Piña 40.000, Limón 70.000” → el número suele ser <b>pesos aproximados</b>, no kilos. Preguntar o estimar cantidad.<br>
• <b>Cantidad + producto:</b> “5 kilos de limón”, “2 paquetes huevos codorniz”, “1 kilo semillas chía”.<br>
• <b>Solo producto:</b> “Cilantro, Perejil” → asumir 1 unidad o 1 kg según el producto.<br>
• <b>Notas especiales:</b> “papaya mitad no muy madura”, “papa criolla 30 delgadita”, “lo equivalente a 5 kilos de carbón”.<br>
• <b>Hora de entrega:</b> “que me llegue 6am”, “lo más temprano posible”.<br>
• <b>Multimedia:</b> fotos de lista escrita, audios dictando, mensajes en varias partes → unificar en un solo pedido.<br>
• <b>Varios pedidos al día:</b> el mismo cliente puede pedir desayuno y cena por separado; usar descripción para distinguirlos.
</div>`;

function orderShift(time){
  const [h,m]=(time||'12:00').split(':').map(Number);
  const mins=h*60+(m||0);
  return mins>=840?'madrugada':'manana';
}
function shiftLabel(s){return s==='madrugada'?'🌙 Compra madrugada (3–6 am)':'☀️ Turno mañana';}
function fmtMoney(n){return n==null||isNaN(n)?'—':Number(n).toLocaleString('es-CO');}
function nextRemisionNo(){
  if(!DB.config.remisionNext) DB.config.remisionNext=12588;
  return DB.config.remisionNext++;
}
function normItem(it){
  if(typeof it.q==='number'&&!it.u) it.u='kilo';
  if(it.w==null) it.w=null;
  if(it.unitPrice==null) it.unitPrice=null;
  if(it.priceUnit==null) it.priceUnit=it.u==='valor'?'kilo':(it.u||'kilo');
  if(it.total==null) it.total=null;
  if(it.notaAdmin==null) it.notaAdmin=it.nota_admin||'';
  if(it.nombreLibre==null) it.nombreLibre='';
  if(it.variacion==null) it.variacion='';
  if(it.u==='valor'&&it.valorPedido==null) it.valorPedido=+it.q||0;
  if(it.u==='valor'&&it.unitPrice>0&&it.qKg==null){
    resolveValorToKg(it,it.unitPrice);
  }
  return it;
}
function normOrder(o){
  o.description=o.description||'';
  o.deliveryTime=o.deliveryTime||'';
  o.shift=o.shift||orderShift(o.time);
  o.items=(o.items||[]).map(normItem);
  return o;
}
function itemLabel(it){
  if(typeof itemDisplayLine==='function') return itemDisplayLine(it);
  const p=DB.products.find(x=>x.id===it.p);
  const name=p?p.name:'—';
  const q=it.w!=null?it.w:it.q;
  const u=it.uCliente||(it.w!=null?fmtUnit(it.wUnit||it.u):fmtUnit(it.u));
  return `${name}: ${q} ${u}`;
}
function calcItemTotal(it){
  if(it.u==='valor'){
    if(it.qKg!=null&&it.unitPrice) return Math.round(it.qKg*it.unitPrice);
    return +it.q||+it.valorPedido||0;
  }
  const w=it.w!=null?+it.w:+it.q;
  if(!it.unitPrice||!w) return 0;
  if(it.priceUnit==='gramo'&&it.u==='kilo') return (w*1000/it.unitPrice)*it.unitPrice; // simplified
  if(it.priceUnit==='kilo'&&it.u==='gramo') return (w/1000)*it.unitPrice;
  if(it.priceUnit==='gramo') return w*it.unitPrice;
  if(it.priceUnit==='kilo') return w*it.unitPrice;
  return w*it.unitPrice;
}
function orderTotal(o){
  return o.items.reduce((s,it)=>s+(it.total!=null?+it.total:calcItemTotal(it)),0);
}
function orderTotalAcomodado(o){
  normOrder(o);
  return o.items.reduce((s,it)=>{
    if(it.w==null||it.w===''||it.unitPrice==null) return s;
    return s+(it.total!=null?+it.total:(typeof calcPriceTotal==='function'?calcPriceTotal(it):0));
  },0);
}
function orderAcomodoPendingCount(o){
  return (o.items||[]).filter(it=>it.w==null||it.w==='').length;
}
function orderNeedsTranscription(o){
  if(!o?.imagenOriginal) return false;
  if(o.photoOnly||!o.items?.length) return true;
  return !o.transcripcionAplicadaEn;
}
function parseOrderPriceInput(el){
  if(!el) return NaN;
  return typeof parsePriceInput==='function'?parsePriceInput(el.value):parseFloat(el.value);
}
function formatOrderPriceValue(n){
  if(n==null||n===''||isNaN(n)) return '';
  return typeof fmtMoneyInput==='function'?fmtMoneyInput(n):String(n);
}
function itemLineTotalDisplay(it){
  if(it.unitPrice==null) return null;
  if(it.w==null||it.w==='') return {pending:true};
  const tot=it.total!=null?+it.total:calcPriceTotal(it);
  return {pending:false,total:tot};
}
function orderIsIncomplete(o){
  if(!o) return true;
  normOrder(o);
  if(!o.items?.length) return true;
  return o.items.some(it=>it.unitPrice==null||it.total==null);
}
function orderIsAcomodadoGreen(o){
  return ['acomodado','remisionado','cerrado','pesado','facturado','consolidado'].includes(o?.status);
}
function orderNeedsPricing(o){
  if(!o||!orderIsAcomodadoGreen(o)) return false;
  normOrder(o);
  if(!o.items?.length) return false;
  return o.items.some(it=>it.unitPrice==null);
}
function orderIsPricingComplete(o){
  if(!o||!orderIsAcomodadoGreen(o)) return false;
  normOrder(o);
  if(!o.items?.length) return false;
  return o.items.every(it=>it.w!=null&&it.w!==''&&it.unitPrice!=null);
}
function incompleteWidgetHTML(){
  return `<div class="incomplete-widget"><span class="incomplete-badge">Incompleta</span></div>`;
}
function statusChip(st){
  const m={pendiente:'pend',acomodando:'cons',acomodado:'cons',remisionado:'cons',pesado:'cons',facturado:'cons',consolidado:'cons',cerrado:'cerr',anulado:'anul'};
  return m[st]||'pend';
}
function statusLabel(st){
  return {pendiente:'Pendiente',acomodando:'Acomodándose…',acomodado:'Acomodado',remisionado:'Remisionado',pesado:'Acomodado',facturado:'Remisionado',consolidado:'Consolidado',cerrado:'Cerrado',anulado:'Anulado'}[st]||st;
}


/* ---------- operario: ver workflow.js ---------- */

/* ---------- modal pedido admin: ver workflow.js openOrderDetail ---------- */
function openOrderDetail(id,readOnly){
  if(typeof window._openOrderDetail==='function') return window._openOrderDetail(id,readOnly);
}

/* ---------- PDF remisión ---------- */
function remisionHTML(orders,title,remisionNo){
  const o=orders[0];
  const c=DB.clients.find(x=>x.id===o.clientId)||{};
  const d=new Date(o.date+'T12:00');
  const merged={};
  orders.forEach(ord=>ord.items.forEach(it=>{
    const k=it.p+'|'+(it.wUnit||it.u);
    if(!merged[k]) merged[k]={...it,p:it.p};
    else{merged[k].q=(+merged[k].q||0)+(+it.q||0); if(it.w) merged[k].w=(+(merged[k].w||0))+(+it.w);}
  }));
  const lines=Object.values(merged).map(it=>{
    const name=typeof itemProductName==='function'?itemProductName(it):(DB.products.find(x=>x.id===it.p)||{name:'—'}).name;
    if(typeof normItem==='function') normItem(it);
    const cant=it.w!=null?it.w:it.q;
    const u=fmtUnit(it.wUnit||it.u);
    const unit=it.unitPrice!=null?fmtMoney(it.unitPrice):'';
    const totVal=it.total!=null?+it.total:(typeof calcPriceTotal==='function'?calcPriceTotal(it):0);
    const tot=totVal?fmtMoney(totVal):'';
    return {name,cant:`${cant} ${u}`,unit,tot};
  });
  const half=Math.ceil(lines.length/2);
  const colA=lines.slice(0,half), colB=lines.slice(half);
  const mkRows=arr=>arr.map(l=>`<tr><td>${l.cant}</td><td>${l.name}</td><td>${l.unit}</td><td>${l.tot}</td></tr>`).join('');
  const total=orders.reduce((s,ord)=>s+orderTotal(ord),0);
  const num=remisionNo||o.remisionNo||'—';
  return `<div style="font-family:Arial,sans-serif;font-size:11px;color:#1a4480;max-width:800px;margin:0 auto;padding:16px">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #1a4480;padding-bottom:8px;margin-bottom:8px">
      <div><div style="font-size:22px;font-weight:bold;color:#1a4480">${COMPANY.name}</div>
        <div>${COMPANY.owner}</div><div>C.C. ${COMPANY.cc}</div>
        <div>${COMPANY.address}</div><div>Cel: ${COMPANY.phone} - ${COMPANY.city}</div></div>
      <div style="text-align:right"><div style="font-size:28px;font-weight:bold;border:3px solid #1a4480;padding:4px 16px">REMISIÓN</div>
        <div style="font-size:20px;color:#c00;font-weight:bold;margin-top:4px">Nº ${num}</div>
        <div style="margin-top:6px;font-size:12px">DIA <u>${d.getDate()}</u> MES <u>${d.getMonth()+1}</u> AÑO <u>${d.getFullYear()}</u></div></div>
    </div>
    <div style="margin-bottom:10px;font-size:12px">
      <b>Señor(es):</b> ${c.name||'—'} &nbsp; <b>Nit:</b> ${c.nit||'—'}<br>
      <b>Dirección:</b> ${c.address||'—'} &nbsp; <b>Teléfono:</b> ${c.phone||'—'} &nbsp; <b>Ciudad:</b> ${c.city||'Manizales'}
      ${title?'<br><b>Referencia:</b> '+title:''}
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
      ${[{rows:colA},{rows:colB}].map(col=>`<table style="width:100%;border-collapse:collapse;font-size:10px">
        <tr style="background:#1a4480;color:#fff"><th>CANT.</th><th>ARTÍCULO</th><th>VR. UNIT.</th><th>VR. TOTAL</th></tr>
        ${mkRows(col.rows)}</table>`).join('')}
    </div>
    <div style="display:flex;justify-content:flex-end;margin-top:10px">
      <div style="border:3px solid #1a4480;padding:8px 24px;font-size:18px;font-weight:bold;background:#e8f0fa">TOTAL $ ${fmtMoney(total)}</div>
    </div>
    <div style="display:flex;justify-content:space-between;margin-top:40px;font-size:11px">
      <div style="border-top:1px solid #1a4480;width:40%;text-align:center;padding-top:4px">Firma</div>
      <div style="border-top:1px solid #1a4480;width:40%;text-align:center;padding-top:4px">CC/NIT.</div>
    </div></div>`;
}
function printRemision(orders,title){
  const html=remisionHTML(orders,title);
  $('#printArea').innerHTML=html; $('#printArea').style.display='block';
  window.print();
  setTimeout(()=>{$('#printArea').style.display='none';},500);
}

/* ---------- facturación admin (prueba 10 días) ---------- */
const BILLING_TRIAL_DAYS=10;
let billingClientId=null;
let billingSelectedOrders=new Set();

function ensureBillingTrialStart(){
  if(!DB.config.billingTrialStart){
    DB.config.billingTrialStart=new Date().toISOString();
    saveDB();
  }
}
function billingTrialDaysLeft(){
  ensureBillingTrialStart();
  const start=new Date(DB.config.billingTrialStart).getTime();
  const elapsed=(Date.now()-start)/(86400000);
  return Math.max(0,Math.ceil(BILLING_TRIAL_DAYS-elapsed));
}
function billingTrialActive(){return billingTrialDaysLeft()>0;}

function orderRemisionNo(o){
  if(!o) return null;
  if(o.remisionNo) return o.remisionNo;
  const rem=(DB.remisiones||[]).find(r=>r.pedidoId===o.id);
  return rem?.numero??null;
}

function facturaGeneralHTML(clientId,orderIds){
  const c=DB.clients.find(x=>x.id===clientId)||{};
  const orders=orderIds.map(id=>DB.orders.find(x=>x.id===id)).filter(Boolean);
  const grandTotal=orders.reduce((s,o)=>s+orderTotal(o),0);
  const d=new Date();
  const sections=orders.map(o=>{
    const num=orderRemisionNo(o);
    const rows=o.items.map(it=>{
      const p=DB.products.find(x=>x.id===it.p)||{name:'Producto'};
      const cant=it.w!=null?it.w:it.q;
      const u=fmtUnit(it.wUnit||it.u);
      const unit=it.unitPrice!=null?fmtMoney(it.unitPrice):'';
      const tot=it.total!=null?fmtMoney(it.total):(it.unitPrice?fmtMoney(Math.round(cant*it.unitPrice)):'');
      return `<tr><td>${cant} ${u}</td><td>${p.name}</td><td>${unit}</td><td>${tot}</td></tr>`;
    }).join('');
    return `<div style="margin-bottom:14px;border:1.5px solid #b8c9e0;border-radius:8px;padding:10px;page-break-inside:avoid">
      <div style="font-weight:bold;margin-bottom:8px;color:#1a4480;font-size:12px">
        Pedido ${fmtDate(o.date)} · ${fmtTime12(o.time)}${o.description?' · '+o.description:''}
        <span style="color:#c00;margin-left:8px">REMISIÓN Nº ${num||'—'}</span>
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:10px">
        <tr style="background:#1a4480;color:#fff"><th>CANT.</th><th>ARTÍCULO</th><th>VR. UNIT.</th><th>VR. TOTAL</th></tr>
        ${rows}
      </table>
      <div style="text-align:right;font-weight:bold;margin-top:6px;font-size:11px">Subtotal pedido: $ ${fmtMoney(orderTotal(o))}</div>
    </div>`;
  }).join('');
  return `<div style="font-family:Arial,sans-serif;font-size:11px;color:#1a4480;max-width:800px;margin:0 auto;padding:16px">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #1a4480;padding-bottom:8px;margin-bottom:12px">
      <div><div style="font-size:22px;font-weight:bold;color:#1a4480">${COMPANY.name}</div>
        <div>${COMPANY.owner}</div><div>C.C. ${COMPANY.cc}</div>
        <div>${COMPANY.address}</div><div>Cel: ${COMPANY.phone} - ${COMPANY.city}</div></div>
      <div style="text-align:right"><div style="font-size:24px;font-weight:bold;border:3px solid #1a4480;padding:4px 14px">FACTURA</div>
        <div style="font-size:12px;margin-top:6px">DIA <u>${d.getDate()}</u> MES <u>${d.getMonth()+1}</u> AÑO <u>${d.getFullYear()}</u></div></div>
    </div>
    <div style="margin-bottom:14px;font-size:12px">
      <b>Señor(es):</b> ${c.name||'—'} &nbsp; <b>Nit:</b> ${c.nit||'—'}<br>
      <b>Dirección:</b> ${c.address||'—'} &nbsp; <b>Teléfono:</b> ${c.phone||'—'} &nbsp; <b>Ciudad:</b> ${c.city||'Manizales'}
      <br><b>Resumen de ${orders.length} pedido(s) con remisión</b>
    </div>
    ${sections}
    <div style="display:flex;justify-content:flex-end;margin-top:14px">
      <div style="border:3px solid #1a4480;padding:10px 28px;font-size:20px;font-weight:bold;background:#e8f0fa">TOTAL GENERAL $ ${fmtMoney(grandTotal)}</div>
    </div>
    <div style="display:flex;justify-content:space-between;margin-top:36px;font-size:11px">
      <div style="border-top:1px solid #1a4480;width:40%;text-align:center;padding-top:4px">Firma</div>
      <div style="border-top:1px solid #1a4480;width:40%;text-align:center;padding-top:4px">CC/NIT.</div>
    </div></div>`;
}

function adminGenerateFactura(clientId,orderIds){
  if(!billingTrialActive()){toast('Periodo de prueba de facturación finalizado');return;}
  const orders=orderIds.map(id=>DB.orders.find(x=>x.id===id)).filter(Boolean);
  if(!orders.length){toast('Selecciona al menos un pedido');return;}
  const sinRem=orders.filter(o=>!orderRemisionNo(o));
  if(sinRem.length){toast('Solo pedidos con remisión creada. Crea la remisión primero.');return;}
  const html=facturaGeneralHTML(clientId,orderIds);
  $('#printArea').innerHTML=html; $('#printArea').style.display='block';
  window.print();
  setTimeout(()=>{$('#printArea').style.display='none';},500);
  audit('Generó factura general',`${clientName(clientId)} · ${orders.length} pedido(s) · ${orders.map(o=>'Rem.'+orderRemisionNo(o)).join(', ')}`);
}

function toggleBillingOrder(id,on){
  if(on) billingSelectedOrders.add(id);
  else billingSelectedOrders.delete(id);
}

function renderFacturacion(){
  ensureBillingTrialStart();
  const trialOk=billingTrialActive();
  const daysLeft=billingTrialDaysLeft();
  if(!billingClientId&&DB.clients.length) billingClientId=DB.clients[0].id;
  const clientOpts=DB.clients.map(c=>`<option value="${c.id}" ${c.id===billingClientId?'selected':''}>${c.name}</option>`).join('');
  const mine=DB.orders.filter(o=>o.clientId===billingClientId&&o.status!=='anulado'&&orderRemisionNo(o))
    .sort((a,b)=>(b.date+b.time).localeCompare(a.date+a.time));
  const trialBanner=trialOk
    ?`<div class="billing-trial">🧾 <b>Facturación — prueba gratuita:</b> ${daysLeft} día(s) restante(s). Unifica pedidos con remisión para enviar al cliente.</div>`
    :`<div class="billing-expired">⏳ El periodo de prueba de facturación terminó. Contacta soporte para activar el módulo.</div>`;
  const rows=mine.length?mine.map(o=>{
    const num=orderRemisionNo(o);
    const det=typeof orderPreview==='function'?orderPreview(o,3):o.items.length+' productos';
    return `<div class="list-row">
      <input type="checkbox" style="width:20px;height:20px;flex:none" ${billingSelectedOrders.has(o.id)?'checked':''} onchange="toggleBillingOrder('${o.id}',this.checked)" ${trialOk?'':'disabled'}>
      <span class="le">🧾</span>
      <div class="lt"><b>${fmtDate(o.date)} · ${fmtTime12(o.time)}</b>
        <span>${det}</span>
        <span style="color:var(--green);font-size:12px;font-weight:800">Remisión Nº ${num}</span>
        <span style="color:var(--ink-soft);font-size:12px"> · $${fmtMoney(orderTotal(o))}</span>
      </div>
      <button type="button" class="icon-btn" onclick="viewRemision(null,${num})" title="Ver remisión">👁️</button>
    </div>`;
  }).join(''):'<div class="empty" style="padding:16px"><span class="ee">📭</span><span>Sin pedidos con remisión para este cliente</span></div>';
  $('#adminBody').innerHTML=`
    ${trialBanner}
    <div class="card pop" style="padding:12px;margin-bottom:10px">
      <b class="display" style="font-size:17px">🧾 Facturación a clientes</b>
      <p style="font-size:13px;color:var(--ink-soft);font-weight:700;margin:6px 0 10px">Selecciona pedidos remisionados y genera la factura general con el Nº de remisión de cada uno.</p>
      <div class="field"><label>Cliente</label>
        <select id="billCli" onchange="billingClientId=this.value;billingSelectedOrders=new Set();renderFacturacion()" style="width:100%">${clientOpts}</select></div>
    </div>
    <div style="margin-bottom:10px">${rows}</div>
    <button class="btn yellow block" onclick="adminGenerateFactura(billingClientId,[...billingSelectedOrders])" ${trialOk?'':'disabled'}>📄 Generar factura general (PDF)</button>`;
  renderNotifFab();
}
window._renderFacturacionImpl=renderFacturacion;

/* ---------- compra manual (UI en compras.js) ---------- */
function openAddPurchase(){
  const opts=activeProducts().map(p=>`<option value="${p.id}">${p.name}</option>`).join('');
  openSheet('➕ Compra manual',`
    <div class="field"><label>Producto</label><select id="purProd">${opts}</select></div>
    <div class="field"><label>Cantidad</label><input id="purQty" inputmode="decimal" value="1"></div>
    <div class="field"><label>Unidad</label><select id="purUnit">${UNITS.map(u=>`<option value="${u.id}">${u.label}</option>`).join('')}</select></div>
    <div class="field"><label>Turno</label><select id="purShift"><option value="manana" ${typeof nextPurchaseShift==='function'&&nextPurchaseShift()==='manana'?'selected':''}>Mañana</option><option value="madrugada" ${typeof nextPurchaseShift==='function'&&nextPurchaseShift()==='madrugada'?'selected':''}>Madrugada (3–6 am)</option></select></div>
    <div class="field"><label>Nota</label><input id="purNote" placeholder="Opcional"></div>`,
    [{label:'Guardar',cls:'green',fn:()=>{
      if(!DB.purchases) DB.purchases=[];
      DB.purchases.push({id:uid(),date:consolDate,shift:$('#purShift').value,productId:$('#purProd').value,qty:parseFloat($('#purQty').value)||1,unit:$('#purUnit').value,note:$('#purNote').value});
      audit('Añadió compra manual',$('#purProd').selectedOptions[0].text); saveDB(); closeSheet(); renderConsol(); toast('Compra añadida');
    }}]);
}

function renderOrders(){
  if(typeof window._renderOrdersImpl==='function') return window._renderOrdersImpl();
}

function orderRowHTML(o){
  if(typeof window._orderRowHTML==='function') return window._orderRowHTML(o);
  normOrder(o);
  const c=DB.clients.find(x=>x.id===o.clientId)||{};
  const det=typeof orderPreview==='function'?orderPreview(o,4):(o.items||[]).length+' productos';
  const ch={app:'📱',voz:'🎙️',foto:'📸',manual:'✍️'}[o.channel]||'📱';
  return `<div class="list-row" style="cursor:pointer" onclick="openOrderDetail('${o.id}')">
    <span class="le">${c.emoji||'🏪'}</span>
    <div class="lt"><b>${c.name||'Cliente'} <small style="font-weight:700;color:var(--ink-soft)">${ch} ${fmtTime12(o.time)}</small></b>
      <span>${det}</span></div>
    <span class="chip ${statusChip(o.status)}">${statusLabel(o.status)}</span>
  </div>`;
}

function renderClientHistory(){
  const box=$('#histList'); box.innerHTML='';
  const mine=DB.orders.filter(o=>o.clientId===session.id&&o.status!=='anulado');
  if(!mine.length){box.innerHTML=`<div class="empty"><span class="ee">🧺</span><b class="display">Aún no tienes pedidos</b></div>`;return;}
  const byDate={}; mine.forEach(o=>{(byDate[o.date]=byDate[o.date]||[]).push(o);});
  Object.keys(byDate).sort().reverse().forEach((d,di)=>{
    const day=document.createElement('div'); day.className='hist-day'; day.style.animationDelay=(di*60)+'ms';
    day.innerHTML=`<h3>📅 ${fmtDate(d)}</h3>`;
    byDate[d].forEach(o=>{
      normOrder(o);
      const det=typeof orderPreview==='function'?orderPreview(o,4):o.items.length+' productos';
      const remNo=orderRemisionNo(o);
      day.innerHTML+=`<div class="list-row">
        <span class="le">🧾</span><div class="lt"><b>${fmtTime12(o.time)}${o.deliveryTime?' · entrega '+fmtTime12(o.deliveryTime):''}${o.description?' · '+o.description:''}</b><span>${det}</span>
        ${remNo?`<span style="color:var(--green);font-size:12px;font-weight:700">Remisión Nº ${remNo}</span>`:''}</div>
        <span class="chip ${statusChip(o.status)}">${statusLabel(o.status)}</span></div>`;
    });
    box.appendChild(day);
  });
}

function clientHistoryAdmin(cid){
  const c=DB.clients.find(x=>x.id===cid);
  const mine=DB.orders.filter(o=>o.clientId===cid&&o.status!=='anulado').slice(0,50);
  openSheet('📋 '+c.name,`
    ${mine.map(o=>{
      const remNo=orderRemisionNo(o);
      return `<div class="list-row">
      <div class="lt"><b>${fmtDate(o.date)} ${fmtTime12(o.time)}</b><span>${o.items.length} productos · ${statusLabel(o.status)}${remNo?' · Rem. '+remNo:''}</span></div>
      <button class="icon-btn" onclick="openOrderDetail('${o.id}')">👁️</button></div>`;
    }).join('')||'<div class="empty"><span class="ee">🧺</span><span>Sin pedidos</span></div>'}`,[]);
}
