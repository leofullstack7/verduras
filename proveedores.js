/* ============================================================
   FRUVER — Proveedores (admin + asignación en Compras)
   ============================================================ */

function ensureProveedoresDB(){
  if(!DB.proveedores) DB.proveedores=[];
  if(!DB.compraProveedorOverrides) DB.compraProveedorOverrides=[];
}

function normalizeWaPhone(raw){
  let d=(raw||'').replace(/\D/g,'');
  if(!d) return '+57';
  if(d.startsWith('57')) return '+'+d;
  if(d.length===10) return '+57'+d;
  return '+'+d;
}

function waDigits(phone){
  return normalizeWaPhone(phone).replace(/\D/g,'');
}

function proveedorName(id){
  const p=DB.proveedores.find(x=>x.id===id);
  return p?p.nombre:'—';
}

function overrideKey(pid,date,shift,u){
  return `${date}|${shift}|${pid}|${u||'kilo'}`;
}

function getProveedorOverride(pid,date,shift,u){
  ensureProveedoresDB();
  const k=overrideKey(pid,date,shift,u);
  const ov=DB.compraProveedorOverrides.find(x=>overrideKey(x.producto_id,x.fecha,x.shift,x.unidad||'kilo')===k);
  return ov?DB.proveedores.find(p=>p.id===ov.proveedor_id)||null:null;
}

function setProveedorOverride(pid,date,shift,u,proveedorId){
  ensureProveedoresDB();
  const k=overrideKey(pid,date,shift,u);
  let ov=DB.compraProveedorOverrides.find(x=>overrideKey(x.producto_id,x.fecha,x.shift,x.unidad||'kilo')===k);
  if(!ov){
    ov={id:uid(),producto_id:pid,fecha:date,shift,unidad:u||'kilo',proveedor_id:proveedorId,actualizadoEn:null};
    DB.compraProveedorOverrides.push(ov);
  }else ov.proveedor_id=proveedorId;
  ov.actualizadoEn=new Date().toISOString();
  saveDB();
}

function suggestProveedorForProduct(pid){
  ensureProveedoresDB();
  return DB.proveedores.find(p=>(p.productos||[]).includes(pid))||null;
}

function getProveedorForProduct(pid,date,shift,u){
  return getProveedorOverride(pid,date,shift,u)||suggestProveedorForProduct(pid);
}

function buildProveedorWaMessage(prov,items,date,shift){
  const lines=items.map(({pid,u,d,variacion})=>{
    const p=DB.products.find(x=>x.id===pid)||{};
    const nota=getCompraNota(pid,date,shift,u,variacion);
    const vl=variacion?` ${variacion}`:'';
    const ql=u==='valor'?'$'+fmtMoney(d.q):`${d.q} ${fmtUnit(u)}`;
    let line=`• ${ql} ${p.name||'producto'}${vl}`;
    if(nota?.descripcion) line+=` — ${nota.descripcion}`;
    return line;
  });
  return `Buenos días ${prov.nombre},\n\nPara hoy necesito:\n${lines.join('\n')}\n\nMuchas gracias.\n\n_By Distribuidora Inteligente_`;
}

function waMeLink(phone,text){
  return `https://wa.me/${waDigits(phone)}?text=${encodeURIComponent(text)}`;
}

function productPickerHTML(selectedIds,fieldId){
  const sel=new Set(selectedIds||[]);
  return `<div class="prov-prod-grid" id="${fieldId}">
    ${activeProducts().map(p=>`
      <label class="prov-prod-chip ${sel.has(p.id)?'on':''}">
        <input type="checkbox" value="${p.id}" ${sel.has(p.id)?'checked':''} onchange="this.closest('.prov-prod-chip').classList.toggle('on',this.checked)">
        ${p.emoji||'🥬'} ${p.name}
      </label>`).join('')}
  </div>`;
}

function readProductPicker(fieldId){
  return [...$$(`#${fieldId} input:checked`)].map(x=>x.value);
}

function renderProveedores(){
  ensureProveedoresDB();
  $('#adminBody').innerHTML=`
    <button class="btn green block pop" style="margin-bottom:10px" onclick="openProveedorForm()">➕ Nuevo proveedor</button>
    <p style="font-size:13px;color:var(--ink-soft);font-weight:700;margin-bottom:10px">Registra nombre y WhatsApp (+57). Opcionalmente indica qué productos del catálogo ofrece — en Compras se agruparán automáticamente.</p>
    ${DB.proveedores.length?DB.proveedores.map((p,i)=>`
      <div class="list-row pop" style="animation-delay:${i*40}ms">
        <span class="le">🚚</span>
        <div class="lt"><b>${p.nombre}</b>
          <span>📱 ${p.whatsapp||'—'}${(p.productos||[]).length?` · 🥬 ${(p.productos||[]).length} producto(s)`:' · sin catálogo asignado'}</span></div>
        <button class="icon-btn" onclick="openProveedorForm('${p.id}')" title="Editar">✏️</button>
      </div>`).join(''):'<div class="empty" style="padding:16px"><span class="ee">🚚</span><b class="display">Sin proveedores</b><span>Agrega el primero con el botón de arriba</span></div>'}`;
}

function openProveedorForm(id,onSaved){
  ensureProveedoresDB();
  const p=id?DB.proveedores.find(x=>x.id===id):{nombre:'',whatsapp:'+57',productos:[]};
  openSheet(id?'✏️ Editar proveedor':'➕ Nuevo proveedor',`
    <div class="field"><label>Nombre</label><input id="pfName" value="${(p.nombre||'').replace(/"/g,'&quot;')}" placeholder="Ej.: David Piña"></div>
    <div class="field"><label>WhatsApp</label>
      <div style="display:flex;gap:8px;align-items:center">
        <span style="font-weight:800;color:var(--ink-soft)">+57</span>
        <input id="pfWa" inputmode="numeric" value="${(p.whatsapp||'+57').replace(/^\+57/,'')}" placeholder="3001234567" style="flex:1" oninput="this.value=this.value.replace(/[^0-9]/g,'')">
      </div></div>
    <div class="field"><label>Productos que ofrece <small style="font-weight:700;color:var(--ink-soft)">(opcional)</small></label>
      ${productPickerHTML(p.productos||[],'pfProds')}
    </div>`,
    [{label:'💾 Guardar',cls:'green',fn:()=>{
      const nombre=$('#pfName').value.trim();
      if(!nombre){toast('Escribe el nombre');return;}
      const wa=normalizeWaPhone('57'+($('#pfWa').value.trim()||''));
      if(wa.replace(/\D/g,'').length<12){toast('WhatsApp inválido — incluye el número completo');return;}
      const productos=readProductPicker('pfProds');
      const data={nombre,whatsapp:wa,productos};
      let savedId=id;
      if(id) Object.assign(p,data);
      else{savedId=uid();DB.proveedores.push({id:savedId,...data});}
      audit(id?'Editó proveedor':'Creó proveedor',nombre);
      flushSave().then(()=>{
        closeSheet();
        toast('Proveedor guardado ✅');
        if(typeof onSaved==='function') onSaved(savedId);
        else if(adminTab==='proveedores') renderProveedores();
        else if(typeof renderConsol==='function') renderConsol();
      });
    }}]);
}

function openCambiarProveedor(pid,unit,shift,date){
  ensureProveedoresDB();
  const p=DB.products.find(x=>x.id===pid)||{};
  const cur=getProveedorForProduct(pid,date,shift,unit);
  const opts=DB.proveedores.map(pr=>`<option value="${pr.id}" ${cur?.id===pr.id?'selected':''}>${pr.nombre}</option>`).join('');
  openSheet('🔄 Proveedor — '+p.name,`
    <p style="font-weight:700;margin-bottom:10px;font-size:13px;color:var(--ink-soft)">Actual: <b>${cur?cur.nombre:'Sin asignar'}</b></p>
    <div class="field"><label>Elegir proveedor</label>
      <select id="cpProv" style="width:100%">${opts||'<option value="">— Sin proveedores —</option>'}</select></div>
    <button class="btn ghost sm block" onclick="closeSheet();openQuickProveedorForProduct('${pid}','${unit}','${shift}','${date}')">➕ Registrar proveedor nuevo</button>`,
    [{label:'Guardar',cls:'green',fn:()=>{
      const nid=$('#cpProv').value;
      if(!nid){toast('Elige un proveedor');return;}
      setProveedorOverride(pid,date,shift,unit,nid);
      closeSheet(); renderConsol(); toast('Proveedor actualizado ✅');
    }}]);
}

function openQuickProveedorForProduct(pid,unit,shift,date){
  openProveedorForm(null,(nid)=>{
    setProveedorOverride(pid,date,shift,unit,nid);
    renderConsol();
  });
}

function openQuickProveedorForm(onSaved){
  openProveedorForm(null,onSaved);
}

window.renderProveedores=renderProveedores;
window.openProveedorForm=openProveedorForm;
window.openCambiarProveedor=openCambiarProveedor;
window.openQuickProveedorForProduct=openQuickProveedorForProduct;
window.openQuickProveedorForm=openQuickProveedorForm;
window.getProveedorForProduct=getProveedorForProduct;
window.buildProveedorWaMessage=buildProveedorWaMessage;
window.waMeLink=waMeLink;
window.setProveedorOverride=setProveedorOverride;
