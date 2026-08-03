/* ============================================================
   FRUVER — Compras (lista + checkboxes + gestión por proveedor)
   ============================================================ */

let compraCheckedKeys=null;

function ensureCompraNotas(){
  if(!DB.compraNotas) DB.compraNotas=[];
}

function compraNotaKey(pid,date,shift,u,variacion){
  return `${date}|${shift}|${pid}|${u||'kilo'}|${variacion||''}`;
}

function getCompraNota(pid,date,shift,u,variacion){
  ensureCompraNotas();
  const k=compraNotaKey(pid,date,shift,u,variacion);
  return DB.compraNotas.find(n=>compraNotaKey(n.producto_id,n.fecha,n.shift,n.unidad||'kilo',n.variacion||'')===k);
}

function setCompraNota(pid,date,shift,u,descripcion,variacion){
  ensureCompraNotas();
  const k=compraNotaKey(pid,date,shift,u,variacion);
  let n=DB.compraNotas.find(x=>compraNotaKey(x.producto_id,x.fecha,x.shift,x.unidad||'kilo',x.variacion||'')===k);
  if(!n){
    n={id:uid(),producto_id:pid,fecha:date,shift,unidad:u||'kilo',variacion:variacion||'',descripcion:'',actualizadoEn:null};
    DB.compraNotas.push(n);
  }
  n.descripcion=descripcion||'';
  n.actualizadoEn=new Date().toISOString();
  saveDB();
}

function ordersForCompras(date){
  return DB.orders.filter(o=>o.date===date&&o.status!=='anulado'&&o.status!=='por_confirmar');
}

function nextPurchaseShift(){
  const [h,m]=nowTime().split(':').map(Number);
  const mins=h*60+(m||0);
  if(mins>=840||mins<360) return 'madrugada';
  return 'manana';
}

function buildConsolSum(orders,shift,extraPurchases){
  const sum={};
  const add=(pid,u,q,variacion,extraMeta)=>{
    const k=pid+'|'+(u||'kilo')+'|'+(variacion||'');
    sum[k]=sum[k]||{q:0,u:u||'kilo',variacion:variacion||'',clients:{},lines:[],...(extraMeta||{})};
    sum[k].q+=+q||0;
  };
  orders.filter(o=>o.shift===shift).forEach(o=>{
    o.items.forEach(it=>{
      normItem(it);
      const u=it.u||'kilo';
      const eq=typeof effectiveQty==='function'?effectiveQty(it):+it.q||0;
      const dispU=it.u==='valor'&&it.qKg==null?u:(typeof effectiveUnit==='function'?effectiveUnit(it):u);
      const qty=it.u==='valor'&&it.qKg==null?(+it.q||0):eq;
      const pid=typeof comprasProductKey==='function'?comprasProductKey(it):it.p;
      add(pid,dispU,qty,it.variacion||'');
      const ck=pid+'|'+(dispU||'kilo')+'|'+(it.variacion||'');
      sum[ck].clients[o.clientId]=(sum[ck].clients[o.clientId]||0)+qty;
      sum[ck].lines.push({clientId:o.clientId,q:qty,u:dispU,variacion:it.variacion,orderId:o.id,time:o.time,rawU:u,nombreLibre:it.nombreLibre||''});
    });
  });
  (extraPurchases||[]).filter(p=>p.shift===shift).forEach(p=>{
    add(p.productId,p.unit||'kilo',+p.qty||0,'',{extra:true});
  });
  return sum;
}

function getCompraCheckedSet(date){
  if(!compraCheckedKeys) compraCheckedKeys=new Set();
  return compraCheckedKeys;
}

function consolRowMeta(k){
  const meta=typeof parseConsolKey==='function'?parseConsolKey(k):{pid:k.split('|')[0],u:k.split('|')[1]||'kilo',variacion:k.split('|')[2]||''};
  return {...meta,pidArg:meta.nombreLibre?`${meta.pid}|${meta.nombreLibre}`:meta.pid};
}

function itemMatchesConsolRow(it,pidArg,unit,variacion){
  normItem(it);
  const rowKey=typeof comprasProductKey==='function'?comprasProductKey(it):it.p;
  if(rowKey!==pidArg&&it.p!==pidArg) return false;
  if((it.variacion||'')!==(variacion||'')) return false;
  const u=it.u||'kilo';
  const dispU=it.u==='valor'&&it.qKg==null?u:(typeof effectiveUnit==='function'?effectiveUnit(it):u);
  const want=unit||'kilo';
  return dispU===want||(want==='kilo'&&it.u==='valor'&&it.qKg!=null);
}

function initCompraChecks(date,shift,sum){
  const set=getCompraCheckedSet(date);
  const flag='_init_'+date+'|'+shift;
  if(set.has(flag)) return;
  Object.keys(sum).forEach(k=>{
    const {pidArg,u,variacion}=consolRowMeta(k);
    set.add(consolItemKey(date,shift,pidArg,u,variacion||''));
  });
  set.add(flag);
}

function toggleCompraCheck(date,shift,pid,u,variacion,checked){
  const ck=consolItemKey(date,shift,pid,u,variacion);
  const set=getCompraCheckedSet(date);
  if(checked) set.add(ck); else set.delete(ck);
  updateCompraActionBar(date,shift);
}

function isCompraChecked(date,shift,pid,u,variacion){
  return getCompraCheckedSet(date).has(consolItemKey(date,shift,pid,u,variacion));
}

function getSelectedCompraItems(date,shift,sum){
  const set=getCompraCheckedSet(date);
  return Object.entries(sum).filter(([k])=>{
    const {pidArg,u,variacion}=consolRowMeta(k);
    return set.has(consolItemKey(date,shift,pidArg,u,variacion||''));
  }).map(([k,d])=>{
    const {pidArg,u,variacion}=consolRowMeta(k);
    return {k,d,pid:pidArg,u,variacion};
  });
}

function updateCompraActionBar(date,shift){
  const bar=$('#compraActionBar_'+shift);
  if(!bar) return;
  const n=bar.dataset.total?getSelectedCompraItems(date,shift,JSON.parse(bar.dataset.sum||'{}')).length:0;
  const cnt=getSelectedCompraItems(date,shift,window['_compraSum_'+shift]||{}).length;
  const btn=$('#btnGestionar_'+shift);
  const btnProv=$('#btnCambiarProv_'+shift);
  if(btn) btn.textContent=`🛒 Gestionar compra (${cnt})`;
  if(btnProv) btnProv.disabled=cnt!==1;
}

function consolListRowHTML(k,d,i,shift,date){
  const {pid,u,variacion,nombreLibre,pidArg}=consolRowMeta(k);
  const p=nombreLibre?{name:nombreLibre,emoji:'📝',id:'__libre__'}:DB.products.find(x=>x.id===pid);
  if(!p&&!nombreLibre) return '';
  const checked=isCompraChecked(date,shift,pidArg,u,variacion);
  const nClients=Object.keys(d.clients).length;
  const qtyLbl=u==='valor'&&!d.lines?.some(l=>l.rawU!=='valor')?'$'+fmtMoney(d.q):`${d.q} ${fmtUnit(u)}`;
  const varLbl=variacion?` · ${variacion}`:'';
  const nk=`cn_${shift}_${pidArg}_${u}_${variacion}`.replace(/[^a-z0-9_]/gi,'_');
  const nota=getCompraNota(pidArg,date,shift,u,variacion);
  return `<div class="consol-list-row pop ${checked?'on':''}" style="animation-delay:${i*25}ms" data-key="${k.replace(/"/g,'&quot;')}">
    <label class="consol-chk-wrap" onclick="event.stopPropagation()">
      <input type="checkbox" ${checked?'checked':''} onchange="toggleCompraCheck('${date}','${shift}','${pidArg.replace(/'/g,"\\'")}','${u}','${variacion.replace(/'/g,"\\'")}',this.checked);this.closest('.consol-list-row').classList.toggle('on',this.checked)">
    </label>
    <div class="consol-list-main" onclick="openConsolProductDetail('${pidArg.replace(/'/g,"\\'")}','${u}','${shift}','${date}','${variacion.replace(/'/g,"\\'")}')">
      <span class="ce">${typeof productThumbHTML==='function'?productThumbHTML(p,28):p.emoji||'🥬'}</span>
      <div class="cn"><b>${p.name}${varLbl}</b>
        <span>${nClients} cliente(s) · toca para detalle</span></div>
      <div class="cq">${qtyLbl}</div>
    </div>
    <input class="consol-nota-in slim" id="${nk}" placeholder="Nota proveedor (opc.)"
      value="${(nota?.descripcion||'').replace(/"/g,'&quot;')}"
      onchange="setCompraNota('${pidArg.replace(/'/g,"\\'")}','${date}','${shift}','${u}',this.value,'${variacion.replace(/'/g,"\\'")}')"
      onclick="event.stopPropagation()">
  </div>`;
}

function groupConsolByProveedor(items,date,shift){
  const groups={};
  items.forEach(({k,d,pid,u,variacion})=>{
    const prov=typeof getProveedorForProduct==='function'?getProveedorForProduct(pid,date,shift,u):null;
    const gid=prov?.id||'_sin';
    groups[gid]=groups[gid]||{proveedor:prov,items:[]};
    groups[gid].items.push({k,d,pid,u,variacion});
  });
  return Object.entries(groups).sort((a,b)=>{
    if(a[0]==='_sin') return 1;
    if(b[0]==='_sin') return -1;
    return (a[1].proveedor?.nombre||'').localeCompare(b[1].proveedor?.nombre||'');
  });
}

function openGestionarCompra(date,shift){
  const sum=window['_compraSum_'+shift];
  if(!sum){toast('Sin productos');return;}
  const selected=getSelectedCompraItems(date,shift,sum);
  if(!selected.length){toast('Marca al menos un producto para comprar');return;}
  const groups=groupConsolByProveedor(selected,date,shift);
  const body=groups.map(([gid,g])=>{
    const prov=g.proveedor;
    const title=prov?`🚚 ${prov.nombre}`:'📦 Sin proveedor';
    const waBtn=prov?`<a class="btn green sm wa-order-btn" target="_blank" rel="noopener"
      href="${waMeLink(prov.whatsapp,buildProveedorWaMessage(prov,g.items.map(x=>({pid:x.pid,u:x.u,d:x.d,variacion:x.variacion})),date,shift))}">💬 Hacerle pedido</a>`:'';
    const rows=g.items.map(x=>{
      const meta=typeof parseConsolKey==='function'?parseConsolKey(x.k):{pid:x.pid,u:x.u,variacion:x.variacion};
      const p=meta.nombreLibre?{name:meta.nombreLibre,emoji:'📝'}:(DB.products.find(pr=>pr.id===x.pid)||{});
      const vl=x.variacion?` (${x.variacion})`:'';
      const ql=x.u==='valor'?'$'+fmtMoney(x.d.q):`${x.d.q} ${fmtUnit(x.u)}`;
      return `<div class="list-row"><span class="le">${p.emoji||'🥬'}</span><div class="lt"><b>${p.name||meta.nombreLibre||'Producto'}${vl}</b><span>${ql}</span></div></div>`;
    }).join('');
    return `<div class="prov-group-card card" style="padding:12px;margin-bottom:10px">
      <div class="prov-group-head"><b class="display">${title}</b>${waBtn}</div>${rows}</div>`;
  }).join('');
  openSheet('🛒 Gestionar compra — '+shiftLabel(shift),`
    <p style="font-weight:700;font-size:13px;color:var(--ink-soft);margin-bottom:12px">${selected.length} producto(s) seleccionado(s), agrupados por proveedor:</p>
    ${body}`,[{label:'Cerrar',cls:'ghost',fn:()=>closeSheet()}]);
}

function openCambiarProveedorSeleccionado(date,shift){
  const sum=window['_compraSum_'+shift]||{};
  const selected=getSelectedCompraItems(date,shift,sum);
  if(selected.length!==1){toast('Selecciona exactamente un producto');return;}
  const {pid,u,variacion}=selected[0];
  openCambiarProveedor(pid,u,shift,date);
}

function openConsolProductDetail(pid,unit,shift,date,variacion){
  const list=ordersForCompras(date||consolDate).filter(o=>o.shift===shift);
  const rows=[];
  list.forEach(o=>{
    o.items.filter(it=>itemMatchesConsolRow(it,pid,unit,variacion)).forEach(it=>{
      const c=DB.clients.find(x=>x.id===o.clientId)||{};
      const ql=it.u==='valor'?'$'+fmtMoney(it.q)+(it.qKg!=null?` → ${it.qKg} kg`:''):`${effectiveQty(it)} ${it.uCliente||fmtUnit(it.u)}`;
      rows.push({client:c.name||'Cliente',emoji:c.emoji||'🏪',q:ql,time:o.time,orderId:o.id});
    });
  });
  const isLibre=String(pid).startsWith('__libre__|');
  const p=isLibre?{name:pid.slice('__libre__|'.length),emoji:'📝'}:(DB.products.find(x=>x.id===pid)||{name:'Producto',emoji:'🥬'});
  const body=rows.length?rows.map(r=>`
    <div class="list-row" style="cursor:pointer" onclick="closeSheet();openOrderDetail('${r.orderId}')">
      <span class="le">${r.emoji}</span>
      <div class="lt"><b>${r.client}</b><span>${r.q} · pedido ${fmtTime12(r.time)}</span></div>
    </div>`).join(''):'<div class="empty" style="padding:12px"><span class="ee">—</span><span>Sin pedidos</span></div>';
  openSheet(`${p.emoji||'🥬'} ${p.name}${variacion?' · '+variacion:''}`,`
    <p style="font-size:13px;color:var(--ink-soft);font-weight:700;margin-bottom:12px">Detalle por restaurante / cliente:</p>
    ${body}
    <button class="btn ghost sm block" style="margin-top:10px" onclick="closeSheet();openCambiarProveedor('${pid}','${unit}','${shift}','${date}')">🔄 Cambiar de proveedor</button>`,[]);
}

function consolBlockHTML(orders,shift,label,date,isNext){
  const extra=(DB.purchases||[]).filter(p=>p.date===date);
  const sum=buildConsolSum(orders,shift,extra);
  window['_compraSum_'+shift]=sum;
  initCompraChecks(date,shift,sum);
  const entries=Object.entries(sum).sort((a,b)=>{
    const ma=typeof parseConsolKey==='function'?parseConsolKey(a[0]):{pid:a[0].split('|')[0]};
    const mb=typeof parseConsolKey==='function'?parseConsolKey(b[0]):{pid:b[0].split('|')[0]};
    const na=ma.nombreLibre||DB.products.find(x=>x.id===ma.pid)?.name||'';
    const nb=mb.nombreLibre||DB.products.find(x=>x.id===mb.pid)?.name||'';
    return na.localeCompare(nb);
  });
  const rows=entries.map(([k,d],i)=>consolListRowHTML(k,d,i,shift,date)).join('');
  const orderCount=orders.filter(o=>o.shift===shift).length;
  const selCount=getSelectedCompraItems(date,shift,sum).length;
  return `<div class="card pop consol-shift-card ${isNext?'consol-shift-next':''}" style="padding:12px;margin-bottom:12px">
    <div class="consol-shift-head">
      <b class="display" style="font-size:16px">${label}</b>
      ${isNext?'<span class="chip exc">Próxima compra</span>':''}
    </div>
    <span style="font-size:12px;color:var(--ink-soft);font-weight:700;display:block;margin:4px 0 8px">${orderCount} pedido(s) · marca lo que hay que comprar</span>
    <div class="consol-action-bar" id="compraActionBar_${shift}">
      <button class="btn green sm" id="btnGestionar_${shift}" onclick="openGestionarCompra('${date}','${shift}')">🛒 Gestionar compra (${selCount})</button>
      <button class="btn ghost sm" id="btnCambiarProv_${shift}" onclick="openCambiarProveedorSeleccionado('${date}','${shift}')" ${selCount===1?'':'disabled'}>🔄 Cambiar proveedor</button>
    </div>
    <div class="consol-list">${rows||'<span style="color:var(--ink-soft);font-weight:700;font-size:13px">Sin acumulado aún</span>'}</div>
  </div>`;
}

function renderConsol(){
  compraCheckedKeys=null;
  const date=consolDate;
  const list=ordersForCompras(date);
  const next=nextPurchaseShift();
  const blocks=[
    {shift:'madrugada',label:'🌙 Compra madrugada (pedidos 2 pm – 12 am → comprar 3–6 am)'},
    {shift:'manana',label:'☀️ Turno mañana (pedidos antes de 2 pm)'},
  ];
  blocks.sort((a,b)=>a.shift===next?-1:b.shift===next?1:0);
  const pendingConfirm=DB.orders.filter(o=>o.date===date&&o.status==='por_confirmar').length;
  const provCount=(DB.proveedores||[]).length;
  const body=$('#adminBody');
  if(!body){console.error('renderConsol: #adminBody no encontrado');return;}
  body.innerHTML=`
    <div class="card pop" style="padding:12px;margin-bottom:10px;display:flex;gap:10px;align-items:center;flex-wrap:wrap">
      <b class="display" style="font-size:17px">🧮 Lista de compra</b><div class="spacer"></div>
      <input type="date" value="${date}" onchange="consolDate=this.value;renderConsol()" style="border:2px solid var(--line);border-radius:11px;padding:8px;font-weight:700">
    </div>
    ${!provCount?`<div class="photo-info-banner" style="margin-bottom:10px">🚚 <a href="#" onclick="event.preventDefault();adminNav('proveedores')">Registra proveedores</a> para enviar pedidos por WhatsApp.</div>`:''}
    ${pendingConfirm?`<div class="photo-info-banner" style="margin-bottom:10px">📋 <b>${pendingConfirm} por confirmar</b> — no suman aquí.</div>`:''}
    <button class="btn orange block pop" style="margin-bottom:10px" onclick="openAddPurchase()">➕ Añadir compra manual</button>
    ${blocks.map(b=>consolBlockHTML(list,b.shift,b.label,date,b.shift===next)).join('')}
    <div style="display:grid;gap:10px;grid-template-columns:1fr 1fr;margin-top:6px">
      <button class="btn yellow" onclick="printConsol()">🖨️ Imprimir / PDF</button>
      ${date===todayStr()?`<button class="btn green" onclick="closeDay()">🔒 Cerrar el día</button>`:''}
    </div>`;
  renderNotifFab();
}

window._renderConsolImpl=renderConsol;
window._renderConsol=renderConsol;
window.toggleCompraCheck=toggleCompraCheck;
window.openGestionarCompra=openGestionarCompra;
window.openCambiarProveedorSeleccionado=openCambiarProveedorSeleccionado;
