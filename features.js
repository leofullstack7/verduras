/* ============================================================
   FRUVER PEDIDOS — extensiones: remisiones, operarios, compras
   ============================================================ */
const UNITS=[{id:'kilo',label:'Kilo',short:'kg'},{id:'gramo',label:'Gramo',short:'g'},{id:'unidad',label:'Unidad',short:'und'}];
const fmtUnit=u=>({kilo:'kg',gramo:'g',unidad:'und'}[u]||u);
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
  return (mins>=840&&mins<=1439)?'madrugada':'manana';
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
  if(it.priceUnit==null) it.priceUnit=it.u||'kilo';
  if(it.total==null) it.total=null;
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
  const p=DB.products.find(x=>x.id===it.p);
  const name=p?p.name:'—';
  const q=it.w!=null?it.w:it.q;
  const u=fmtUnit(it.w!=null?(it.wUnit||it.u):it.u);
  return `${name}: ${q} ${u}`;
}
function calcItemTotal(it){
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
function statusChip(st){
  const m={pendiente:'pend',pesado:'cons',facturado:'cons',consolidado:'cons',cerrado:'cerr',anulado:'anul'};
  return m[st]||'pend';
}
function statusLabel(st){
  return {pendiente:'Pendiente',pesado:'Pesado',facturado:'Facturado',consolidado:'Consolidado',cerrado:'Cerrado',anulado:'Anulado'}[st]||st;
}

/* ---------- operario ---------- */
function renderWorker(){
  const pending=DB.orders.filter(o=>o.status==='pendiente'&&o.status!=='anulado').sort((a,b)=>a.date.localeCompare(b.date)||a.time.localeCompare(b.time));
  $('#workerBody').innerHTML=`
    <p style="font-size:13px;color:var(--ink-soft);font-weight:700;margin-bottom:10px">Registra el peso real de cada producto antes de facturar.</p>
    ${pending.map(o=>workerOrderRow(o)).join('')||'<div class="empty"><span class="ee">✅</span><b class="display">Sin pedidos por pesar</b></div>'}`;
}
function workerOrderRow(o){
  const c=DB.clients.find(x=>x.id===o.clientId)||{};
  return `<div class="list-row pop" onclick="openWeighOrder('${o.id}')">
    <span class="le">${c.emoji||'🏪'}</span>
    <div class="lt"><b>${c.name||'—'}</b><span>${o.time} · ${shiftLabel(o.shift)} · ${o.items.length} productos${o.description?' · '+o.description:''}</span></div>
    <span class="chip pend">Pesar</span></div>`;
}
function openWeighOrder(id){
  const o=DB.orders.find(x=>x.id===id); if(!o)return;
  normOrder(o);
  const rows=o.items.map((it,i)=>{
    const p=DB.products.find(x=>x.id===it.p)||{};
    return `<div class="rev-row"><span class="re">${p.emoji||'🥬'}</span>
      <div class="rn"><b>${p.name}</b><span>Pedido: ${it.q} ${fmtUnit(it.u)}</span></div>
      <input class="qty-in" style="width:70px" inputmode="decimal" id="w_${i}" value="${it.w!=null?it.w:''}" placeholder="Peso">
      <select id="wu_${i}" style="border:2px solid var(--line);border-radius:10px;padding:7px;font-weight:700">
        ${UNITS.map(u=>`<option value="${u.id}" ${(it.wUnit||it.u)===u.id?'selected':''}>${u.short}</option>`).join('')}
      </select></div>`;
  }).join('');
  openSheet('⚖️ Pesar pedido — '+clientName(o.clientId),rows,
    [{label:'💾 Guardar pesos',cls:'green',fn:()=>{
      o.items.forEach((it,i)=>{
        const w=parseFloat($('#w_'+i).value);
        if(!isNaN(w)&&w>0){it.w=w;it.wUnit=$('#wu_'+i).value;}
      });
      o.status='pesado'; o.weighedBy=session.name; o.weighedAt=new Date().toISOString();
      audit('Pesó pedido',clientName(o.clientId)+' · '+o.date); saveDB(); closeSheet(); renderWorker(); toast('Pesos guardados ✅');
    }}]);
}

/* ---------- modal pedido admin ---------- */
function openOrderDetail(id){
  const o=DB.orders.find(x=>x.id===id); if(!o)return;
  normOrder(o);
  const c=DB.clients.find(x=>x.id===o.clientId)||{};
  const isAdmin=session.role==='admin';
  const canPrice=isAdmin&&o.status==='pesado';
  const canRemision=isAdmin&&o.status==='facturado'&&o.remisionNo;
  const rows=o.items.map((it,i)=>{
    const p=DB.products.find(x=>x.id===it.p)||{};
    const priced=it.unitPrice!=null;
    return `<div class="rev-row">
      <span class="re">${p.emoji||'🥬'}</span>
      <div class="rn"><b>${p.name}</b>
        <span>Pedido: ${it.q} ${fmtUnit(it.u)}${it.w!=null?' · Peso real: '+it.w+' '+fmtUnit(it.wUnit||it.u):''}</span>
        ${priced?`<span>💲 ${fmtMoney(it.unitPrice)}/${fmtUnit(it.priceUnit)} = <b>${fmtMoney(it.total)}</b></span>`:''}
      </div>
      ${canPrice?`<input class="qty-in" style="width:80px" id="pu_${i}" inputmode="decimal" value="${it.unitPrice||''}" placeholder="$/u">
        <select id="punit_${i}" style="border:2px solid var(--line);border-radius:10px;padding:6px;font-weight:700;font-size:12px">
          ${UNITS.map(u=>`<option value="${u.id}" ${(it.priceUnit||it.u)===u.id?'selected':''}>/${u.short}</option>`).join('')}
        </select>`:''}
    </div>`;
  }).join('');
  const btns=[];
  if(canPrice) btns.push({label:'💲 Guardar precios y facturar',cls:'green',fn:()=>{
    o.items.forEach((it,i)=>{
      const up=parseFloat($('#pu_'+i).value);
      if(!isNaN(up)&&up>=0){
        it.unitPrice=up; it.priceUnit=$('#punit_'+i).value;
        const w=it.w!=null?+it.w:+it.q;
        it.total=Math.round(w*up);
      }
    });
    o.remisionNo=nextRemisionNo();
    o.status='facturado'; o.pricedBy=session.name; o.pricedAt=new Date().toISOString();
    audit('Facturó pedido','Remisión '+o.remisionNo+' · '+c.name); saveDB(); closeSheet(); adminNav(adminTab); toast('Remisión #'+o.remisionNo+' generada');
  }});
  if(canRemision||o.remisionNo) btns.push({label:'📄 PDF remisión',cls:'yellow',fn:()=>{closeSheet();printRemision([o]);}});
  if(isAdmin&&o.status!=='anulado') btns.push({label:'🗑️ Anular',cls:'orange',fn:()=>voidOrder(o.id)});
  openSheet(`📦 Pedido — ${c.name}`,`
    <div style="font-size:13px;font-weight:700;color:var(--ink-soft);margin-bottom:10px">
      ${fmtDate(o.date)} · ${o.time} · ${shiftLabel(o.shift)} · Entrega: ${o.deliveryTime||'—'}
      ${o.description?'<br>📝 '+o.description:''}
      ${o.remisionNo?'<br>📄 Remisión Nº '+o.remisionNo:''}
      <br>Estado: <b>${statusLabel(o.status)}</b>${o.weighedBy?' · Pesado por '+o.weighedBy:''}
    </div>${rows}
    ${canPrice?'<p style="font-size:12px;color:var(--ink-soft);font-weight:700;margin-top:8px">Solo la administradora define precios del día.</p>':''}
    ${o.status==='facturado'?`<div style="text-align:right;font-family:Fredoka;font-size:22px;font-weight:700;color:var(--green);margin-top:10px">Total: $${fmtMoney(orderTotal(o))}</div>`:''}`,
    btns);
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
    const p=DB.products.find(x=>x.id===it.p)||{name:'—'};
    const cant=it.w!=null?it.w:it.q;
    const u=fmtUnit(it.wUnit||it.u);
    const unit=it.unitPrice!=null?fmtMoney(it.unitPrice):'';
    const tot=it.total!=null?fmtMoney(it.total):(it.unitPrice?fmtMoney(Math.round(cant*it.unitPrice)):'');
    return {name:p.name,cant:`${cant} ${u}`,unit,tot};
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
function mergeAndPrint(clientId,orderIds){
  const orders=orderIds.map(id=>DB.orders.find(x=>x.id===id)).filter(Boolean);
  if(!orders.length){toast('Selecciona al menos un pedido');return;}
  const no=nextRemisionNo();
  orders.forEach(o=>{if(!o.remisionNo)o.remisionNo=no;});
  saveDB();
  printRemision(orders,'Resumen de '+orders.length+' pedido(s)');
  audit('Generó resumen PDF','Remisión '+no+' · '+clientName(clientId));
}

/* ---------- compras / consolidado por turno ---------- */
function renderConsol(){
  const list=ordersOf(consolDate);
  const manana=list.filter(o=>o.shift==='manana');
  const madrugada=list.filter(o=>o.shift==='madrugada');
  const extra=(DB.purchases||[]).filter(p=>p.date===consolDate);
  const renderBlock=(orders,label)=>{
    const sum={};
    orders.forEach(o=>o.items.forEach(it=>{
      const k=it.p+'|'+(it.u||'kilo');
      sum[k]=sum[k]||{q:0,u:it.u||'kilo',clients:{}};
      sum[k].q+=+it.q||0;
      sum[k].clients[o.clientId]=(sum[k].clients[o.clientId]||0)+(+it.q||0);
    }));
    extra.filter(p=>p.shift===(label.includes('madrugada')?'madrugada':'manana')).forEach(p=>{
      const k=p.productId+'|'+(p.unit||'kilo');
      sum[k]=sum[k]||{q:0,u:p.unit||'kilo',clients:{},extra:true};
      sum[k].q+=+p.qty||0;
    });
    const rows=Object.entries(sum).sort((a,b)=>{
      const pa=DB.products.find(x=>x.id===a[0].split('|')[0]);
      const pb=DB.products.find(x=>x.id===b[0].split('|')[0]);
      return (pa?pa.name:'').localeCompare(pb?pb.name:'');
    }).map(([k,d],i)=>{
      const pid=k.split('|')[0]; const p=DB.products.find(x=>x.id===pid); if(!p)return'';
      const det=Object.entries(d.clients).map(([cid,q])=>`${clientName(cid)}: ${q}`).join(' · ');
      return `<div class="consol-row pop" style="animation-delay:${i*40}ms;flex-wrap:wrap" onclick="this.classList.toggle('open')">
        <span class="ce">${p.emoji||'🥬'}</span>
        <div class="cn"><b>${p.name}</b><span style="font-size:12px;color:var(--ink-soft);font-weight:700">${det||'Compra manual'}</span></div>
        <div class="cq">${d.q}<small>${fmtUnit(d.u)}</small></div>
        ${det?`<div class="detail-clients">👥 ${det}</div>`:''}</div>`;
    }).join('');
    return `<div class="card pop" style="padding:12px;margin-bottom:10px">
      <b class="display" style="font-size:16px">${label}</b>
      <span style="font-size:12px;color:var(--ink-soft);font-weight:700;display:block;margin:4px 0 8px">${orders.length} pedido(s)</span>
      ${rows||'<span style="color:var(--ink-soft);font-weight:700;font-size:13px">Sin acumulado</span>'}
    </div>`;
  };
  $('#adminBody').innerHTML=`
    <div class="card pop" style="padding:12px;margin-bottom:10px;display:flex;gap:10px;align-items:center;flex-wrap:wrap">
      <b class="display" style="font-size:17px">🧮 Lista de compra</b><div class="spacer"></div>
      <input type="date" value="${consolDate}" onchange="consolDate=this.value;renderConsol()" style="border:2px solid var(--line);border-radius:11px;padding:8px;font-weight:700">
    </div>
    <button class="btn orange block pop" style="margin-bottom:10px" onclick="openAddPurchase()">➕ Añadir compra manual</button>
    ${renderBlock(manana,'☀️ Turno mañana (pedidos antes de 2 pm)')}
    ${renderBlock(madrugada,'🌙 Compra madrugada (pedidos 2 pm – 11:59 pm → comprar 3–6 am)')}
    <div style="display:grid;gap:10px;grid-template-columns:1fr 1fr;margin-top:6px">
      <button class="btn yellow" onclick="printConsol()">🖨️ Imprimir / PDF</button>
      ${consolDate===todayStr()?`<button class="btn green" onclick="closeDay()">🔒 Cerrar el día</button>`:''}
    </div>`;
}
function openAddPurchase(){
  const opts=activeProducts().map(p=>`<option value="${p.id}">${p.name}</option>`).join('');
  openSheet('➕ Compra manual',`
    <div class="field"><label>Producto</label><select id="purProd">${opts}</select></div>
    <div class="field"><label>Cantidad</label><input id="purQty" inputmode="decimal" value="1"></div>
    <div class="field"><label>Unidad</label><select id="purUnit">${UNITS.map(u=>`<option value="${u.id}">${u.label}</option>`).join('')}</select></div>
    <div class="field"><label>Turno</label><select id="purShift"><option value="manana">Mañana</option><option value="madrugada">Madrugada (3–6 am)</option></select></div>
    <div class="field"><label>Nota</label><input id="purNote" placeholder="Opcional"></div>`,
    [{label:'Guardar',cls:'green',fn:()=>{
      if(!DB.purchases) DB.purchases=[];
      DB.purchases.push({id:uid(),date:consolDate,shift:$('#purShift').value,productId:$('#purProd').value,qty:parseFloat($('#purQty').value)||1,unit:$('#purUnit').value,note:$('#purNote').value});
      audit('Añadió compra manual',$('#purProd').selectedOptions[0].text); saveDB(); closeSheet(); renderConsol(); toast('Compra añadida');
    }}]);
}

function renderOrders(){
  const list=DB.orders.filter(o=>o.date===ordersDate&&!o.anulado).sort((a,b)=>b.time.localeCompare(a.time));
  $('#adminBody').innerHTML=`
    ${ORDER_GUIDE}
    <div class="card pop" style="padding:12px;margin-bottom:10px;display:flex;gap:10px;align-items:center;flex-wrap:wrap">
      <b class="display" style="font-size:17px">📦 Pedidos del día</b><div class="spacer"></div>
      <input type="date" value="${ordersDate}" onchange="ordersDate=this.value;renderOrders()" style="border:2px solid var(--line);border-radius:11px;padding:8px;font-weight:700">
    </div>
    <button class="btn orange block" style="margin-bottom:10px" onclick="openManualOrder()">✍️ Registrar pedido manual</button>
    ${list.map(o=>orderRowHTML(o)).join('')||`<div class="empty"><span class="ee">📭</span><b class="display">Sin pedidos ese día</b></div>`}`;
}

function orderRowHTML(o){
  normOrder(o);
  const c=DB.clients.find(x=>x.id===o.clientId)||{};
  const det=o.items.map(it=>itemLabel(it)).join(', ');
  const ch={app:'📱',voz:'🎙️',foto:'📸',manual:'✍️'}[o.channel]||'📱';
  return `<div class="list-row" style="cursor:pointer" onclick="openOrderDetail('${o.id}')">
    <span class="le">${c.emoji||'🏪'}</span>
    <div class="lt"><b>${c.name||'—'} <small style="font-weight:700;color:var(--ink-soft)">${ch} ${o.time}${o.deliveryTime?' · 🕐 '+o.deliveryTime:''}</small></b>
      <span>${det}${o.description?' · 📝 '+o.description:''}</span>
      ${o.remisionNo?`<span style="color:var(--green)">📄 Remisión ${o.remisionNo}</span>`:''}
    </div>
    <span class="chip ${statusChip(o.status)}">${statusLabel(o.status)}</span>
  </div>`;
}

function renderClientHistory(){
  const box=$('#histList'); box.innerHTML='';
  const mine=DB.orders.filter(o=>o.clientId===session.id&&o.status!=='anulado');
  if(!mine.length){box.innerHTML=`<div class="empty"><span class="ee">🧺</span><b class="display">Aún no tienes pedidos</b></div>`;return;}
  window.selectedOrders=new Set();
  const toolbar=`<div class="card pop" style="padding:10px;margin-bottom:10px;display:flex;gap:8px;flex-wrap:wrap;align-items:center">
    <span style="font-size:13px;font-weight:700;color:var(--ink-soft)">Selecciona pedidos para unificar factura</span>
    <button class="btn yellow sm" onclick="mergeClientOrders()">📄 Resumen PDF</button></div>`;
  box.innerHTML=toolbar;
  const byDate={}; mine.forEach(o=>{(byDate[o.date]=byDate[o.date]||[]).push(o);});
  Object.keys(byDate).sort().reverse().forEach((d,di)=>{
    const day=document.createElement('div'); day.className='hist-day'; day.style.animationDelay=(di*60)+'ms';
    day.innerHTML=`<h3>📅 ${fmtDate(d)}</h3>`;
    byDate[d].forEach(o=>{
      normOrder(o);
      const det=o.items.map(it=>itemLabel(it)).join(' · ');
      day.innerHTML+=`<div class="list-row">
        <input type="checkbox" style="width:20px;height:20px" onchange="toggleOrderSel('${o.id}',this.checked)">
        <span class="le">🧾</span><div class="lt"><b>${o.time}${o.deliveryTime?' · entrega '+o.deliveryTime:''}${o.description?' · '+o.description:''}</b><span>${det}</span>
        ${o.remisionNo?`<span style="color:var(--green);font-size:12px">Remisión ${o.remisionNo}</span>`:''}</div>
        <span class="chip ${statusChip(o.status)}">${statusLabel(o.status)}</span></div>`;
    });
    box.appendChild(day);
  });
}
function toggleOrderSel(id,on){if(on)selectedOrders.add(id);else selectedOrders.delete(id);}
function mergeClientOrders(){mergeAndPrint(session.id,[...selectedOrders]);}

function clientHistoryAdmin(cid){
  window.selectedOrders=new Set();
  window.mergeClientId=cid;
  const c=DB.clients.find(x=>x.id===cid);
  const mine=DB.orders.filter(o=>o.clientId===cid&&o.status!=='anulado').slice(0,50);
  openSheet('📋 '+c.name,`
    <button class="btn yellow sm block" style="margin-bottom:10px" onclick="mergeAndPrint(mergeClientId,[...selectedOrders]);closeSheet()">📄 Unificar seleccionados en PDF</button>
    ${mine.map(o=>`<div class="list-row"><input type="checkbox" style="width:20px;height:20px" onchange="toggleOrderSel('${o.id}',this.checked)">
      <div class="lt"><b>${fmtDate(o.date)} ${o.time}</b><span>${o.items.length} productos · ${statusLabel(o.status)}</span></div>
      <button class="icon-btn" onclick="openOrderDetail('${o.id}')">👁️</button></div>`).join('')||'<div class="empty"><span class="ee">🧺</span><span>Sin pedidos</span></div>'}`,[]);
}
