/* ============================================================
   FRUVER — Interpretación de pedidos (instruccion1)
   Foto tabular Producto/Cantidad, vocabulario, resaltados
   ============================================================ */
const STD_UNITS=new Set(['kilo','gramo','unidad']);
const UNIT_ALIASES={
  kg:'kilo',k:'kilo',kls:'kilo',kilos:'kilo',kilogramo:'kilo',kilogramos:'kilo',kl:'kilo',
  g:'gramo',gr:'gramo',grs:'gramo',gramos:'gramo',gramo:'gramo',
  und:'unidad',ud:'unidad',uds:'unidad',unidad:'unidad',unidades:'unidad',un:'unidad',
  libra:'kilo',libras:'kilo',
};

function migrateInterpretDB(){
  if(!DB.vocabulario) DB.vocabulario=[];
  if(!DB.suscripciones) DB.suscripciones=[];
  DB.orders.forEach(o=>{
    if(!o.imagenOriginal) o.imagenOriginal=null;
    (o.items||[]).forEach(it=>{
      if(it.uCliente==null) it.uCliente=it.uText||null;
      if(it.equivNote==null) it.equivNote=it.equivNote||'';
    });
  });
}
if(typeof migrateDB==='function'){
  const _m=migrateDB;
  migrateDB=function(){_m();migrateInterpretDB();};
}

function normTxt(s){
  return (s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();
}

function lookupVocabProducto(texto){
  const t=normTxt(texto);
  return (DB.vocabulario||[]).find(v=>v.tipo==='producto'&&normTxt(v.texto_alias)===t);
}
function lookupVocabUnidad(texto){
  const t=normTxt(texto);
  return (DB.vocabulario||[]).find(v=>v.tipo==='unidad'&&normTxt(v.unidad_original||v.texto_alias)===t);
}

function matchProductByName(name){
  const t=normTxt(name);
  const vocab=lookupVocabProducto(name);
  if(vocab?.producto_id){
    const p=DB.products.find(x=>x.id===vocab.producto_id);
    if(p) return {product:p,confianza:0.98,via:'vocabulario'};
  }
  let best=null,score=0;
  activeProducts().forEach(p=>{
    const pn=normTxt(p.name);
    if(t===pn||t.includes(pn)||pn.includes(t)){
      const s=Math.min(t.length,pn.length)/Math.max(t.length,pn.length);
      if(s>score){score=s;best=p;}
    }else{
      const words=pn.split(/\s+/).filter(w=>w.length>3);
      const hit=words.filter(w=>t.includes(w)).length/Math.max(words.length,1);
      if(hit>score){score=hit;best=p;}
    }
  });
  return best?{product:best,confianza:score>=0.8?0.95:0.72,via:'catalogo'}:{product:null,confianza:0.2,via:null};
}

function parseUnitToken(raw){
  const t=normTxt(raw);
  if(!t) return {sistema:null,reconocida:false,texto:raw||''};
  if(UNIT_ALIASES[t]) return {sistema:UNIT_ALIASES[t],reconocida:true,texto:raw};
  if(STD_UNITS.has(t)) return {sistema:t,reconocida:true,texto:raw};
  return {sistema:null,reconocida:false,texto:raw};
}

function buildInterpretPrompt(catalog){
  return `Eres el intérprete de pedidos de Distribuidora L y O (fruver, Manizales, Colombia).

La imagen o texto puede ser:
1) HOJA TABULAR impresa: dos columnas principales — columna izquierda NOMBRE DEL PRODUCTO, columna derecha CANTIDAD (a veces cantidad+unidad juntas, ej. "2 kg", "12 manojos", "1/2 libra").
2) Lista libre escrita a mano (una línea por producto).
3) Captura de Excel o WhatsApp.

Catálogo (match SOLO con estos ids cuando reconozcas el producto): ${JSON.stringify(catalog)}

REGLAS CRÍTICAS:
- NO conviertas unidades no estándar (manojo, bandeja, cabeza, caja, paquete, bulto…) a kg/g/unidad. Consérvalas en unidadTexto.
- Unidades estándar del sistema: kilo, gramo, unidad — solo si el cliente escribió kg/g/und/unidad/kilo/gramos explícitamente.
- Fracciones: "1/2", "1,5", "2 1/2" → cantidad numérica decimal.
- "4k", "8k" pegado al número = kilogramos.
- Si solo hay número sin unidad (ej. "Granadilla 10"), deja unidadSistema null y unidadTexto vacío; el sistema usará unidad_sugerida del catálogo.
- Si NO reconoces el producto, productId=null y productoReconocido=false.
- Si reconoces producto pero la unidad NO es estándar, productoReconocido=true, unidadReconocida=false.
- No inventes productos ni conversiones. Marca confianza baja (<0.7) ante ambigüedad (ej. "1K1 uchuva").
- Si una línea tiene dos variantes (ej. cebolla roja 2 kilos x blanca 2 kilos), sepárala en DOS items.

Devuelve SOLO JSON válido sin markdown:
{"items":[{"texto":"literal","productId":"id|null","nombreDetectado":"string","cantidad":number,"unidadTexto":"como escribió el cliente","unidadSistema":"kilo|gramo|unidad|null","unidadReconocida":true|false,"productoReconocido":true|false,"confianza":0.0-1.0,"palabraResaltada":"unidad o frase a resaltar|null"}]}`;
}

function enrichInterpretedItems(rawItems){
  return rawItems.map(it=>{
    const nombre=it.nombreDetectado||it.texto||'';
    let productId=it.productId||null;
    let confianza=it.confianza??0.5;
    let productoReconocido=it.productoReconocido;
    if(productId){
      productoReconocido=!!DB.products.find(p=>p.id===productId);
    }else if(productoReconocido!==false){
      const m=matchProductByName(nombre);
      if(m.product){productId=m.product.id;confianza=Math.max(confianza,m.confianza);productoReconocido=true;}
      else productoReconocido=false;
    }
    const uRaw=it.unidadTexto||'';
    let unidadSistema=it.unidadSistema||null;
    let unidadReconocida=!!it.unidadReconocida;
    if(uRaw){
      const pu=parseUnitToken(uRaw);
      if(pu.reconocida){unidadSistema=pu.sistema;unidadReconocida=true;}
      else{
        unidadSistema=null;
        unidadReconocida=false;
        const vu=lookupVocabUnidad(uRaw);
        if(vu) unidadReconocida=true; // aceptada previamente, pero seguimos mostrando texto original
      }
    }else if(unidadSistema&&STD_UNITS.has(unidadSistema)){
      unidadReconocida=true;
    }else if(productId&&!uRaw){
      const p=DB.products.find(x=>x.id===productId);
      unidadSistema=p?.unidad_sugerida||'kilo';
      unidadReconocida=true;
    }
    let highlight='none';
    let palabraResaltada=it.palabraResaltada||null;
    if(!productoReconocido){highlight='linea';palabraResaltada=palabraResaltada||it.texto||nombre;}
    else if(!unidadReconocida&&uRaw){highlight='unidad';palabraResaltada=palabraResaltada||uRaw;}
    return {
      ...it,
      productId,
      nombreDetectado:nombre,
      cantidad:+it.cantidad||1,
      unidadTexto:uRaw,
      unidadSistema,
      unidadReconocida,
      productoReconocido:!!productoReconocido,
      confianza,
      highlight,
      palabraResaltada,
      uCliente:unidadReconocida?null:(uRaw||null),
      unidad:unidadSistema||'kilo',
      resolved:false,
      allowed:false,
      equivNote:'',
      removed:false,
    };
  });
}

function highlightHTML(it){
  if(!it.palabraResaltada||it.highlight==='none'||it.resolved) return esc(it.texto||'');
  const txt=it.texto||'';
  const w=it.palabraResaltada;
  const idx=txt.toLowerCase().indexOf(w.toLowerCase());
  if(it.highlight==='linea'||idx<0){
    return `<span class="hl-word" data-i="${it._i}" onclick="openHighlightMenu(${it._i})">${esc(txt)}</span>`;
  }
  const before=txt.slice(0,idx);
  const mid=txt.slice(idx,idx+w.length);
  const after=txt.slice(idx+w.length);
  return `${esc(before)}<span class="hl-word" data-i="${it._i}" onclick="openHighlightMenu(${it._i})">${esc(mid)}</span>${esc(after)}`;
}
function esc(s){return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');}

/* ---------- Pedido por foto: instructivo + envío opcional ---------- */
const PHOTO_TUTORIAL='assets/instructivos/formato-pedido.png';
const PHOTO_TUTORIAL_KEY='fruver_photo_tutorial_v1';

function hasSeenPhotoTutorial(){
  try{return localStorage.getItem(PHOTO_TUTORIAL_KEY)==='1';}catch(e){return false;}
}
function markPhotoTutorialSeen(){
  try{localStorage.setItem(PHOTO_TUTORIAL_KEY,'1');}catch(e){}
}

function openPhoto(){
  window.pendingPhotoDataUrl=null;
  window.pendingPhotoB64=null;
  renderPhotoSheet();
}

function renderPhotoSheet(){
  const firstTime=!hasSeenPhotoTutorial();
  const hasPhoto=!!window.pendingPhotoDataUrl;
  const tutorialBlock=firstTime?`
    <div class="photo-tutorial highlight pop">
      <p class="photo-tutorial-title">📋 Así escribe tu pedido en casa</p>
      <img src="${PHOTO_TUTORIAL}" alt="Formato recomendado: Producto y Cantidad" class="photo-tutorial-img" onclick="viewTutorialLarge()">
      <p class="photo-tutorial-hint">Escribe en dos columnas: <b>Producto</b> a la izquierda y <b>Cantidad</b> a la derecha. Usa letra clara y buena luz al tomar la foto.</p>
      <button type="button" class="btn ghost sm block" style="margin-top:8px" onclick="dismissPhotoTutorial()">✅ Entendido</button>
    </div>`:(!hasPhoto?`<button type="button" class="photo-tutorial-link" onclick="viewTutorialLarge()">📋 Ver formato recomendado de pedido</button>`:'');
  const captureBlock=`
    <input type="file" id="photoIn" accept="image/*" capture="environment" style="display:none" onchange="photoPicked(this)">
    <button type="button" class="btn yellow block" onclick="document.getElementById('photoIn').click()">${hasPhoto?'📷 Cambiar foto':'📷 Tomar o elegir foto'}</button>`;
  const previewBlock=hasPhoto?`
    <div class="photo-user-preview pop">
      <p class="photo-user-lbl">Tu foto del pedido</p>
      <img src="${window.pendingPhotoDataUrl}" alt="Tu pedido" class="photo-user-thumb" onclick="viewPhotoLarge()">
    </div>`:'';
  const actionBlock=hasPhoto?`
    <div class="photo-actions">
      <button type="button" class="btn green block" onclick="startPhotoInterpret()">✨ Ver interpretación con IA</button>
      <button type="button" class="btn ghost block" onclick="confirmPhotoOnly()">📤 Enviar solo la foto</button>
      <p class="photo-actions-hint">Puedes enviar la foto sin transcribir — Olga la revisará y armará el pedido manualmente.</p>
    </div>`:'';
  openSheet('📸 Pedido por foto',
    `<div class="photo-sheet">${tutorialBlock}${captureBlock}${previewBlock}${actionBlock}</div>`,[]);
}

function dismissPhotoTutorial(){
  markPhotoTutorialSeen();
  renderPhotoSheet();
}

function viewTutorialLarge(){
  openSheet('📋 Formato de pedido','<img src="'+PHOTO_TUTORIAL+'" style="max-width:100%;border-radius:14px">',[]);
}

function photoPicked(inp){
  const f=inp.files[0]; if(!f)return;
  const img=new Image();
  img.onload=()=>{
    const cv=document.createElement('canvas'); const max=1100;
    const sc=Math.min(1,max/Math.max(img.width,img.height));
    cv.width=img.width*sc; cv.height=img.height*sc;
    cv.getContext('2d').drawImage(img,0,0,cv.width,cv.height);
    const dataUrl=cv.toDataURL('image/jpeg',.85);
    window.pendingPhotoDataUrl=dataUrl;
    window.pendingPhotoB64=dataUrl.split(',')[1];
    renderPhotoSheet();
  };
  img.src=URL.createObjectURL(f);
}

function startPhotoInterpret(){
  if(!window.pendingPhotoB64){toast('Primero toma o elige la foto');return;}
  interpretOrder({imageB64:window.pendingPhotoB64,keepPhoto:true},'foto');
}

function confirmPhotoOnly(){
  if(!window.pendingPhotoDataUrl){toast('Primero toma o elige la foto');return;}
  openSheet('📤 Enviar pedido con foto',`
    <p style="font-weight:700;margin-bottom:10px;line-height:1.4">Olga recibirá tu foto y armará el pedido. No hace falta transcribir con IA.</p>
    <img src="${window.pendingPhotoDataUrl}" alt="Tu pedido" class="photo-user-thumb" style="margin-bottom:12px">
    <div class="field"><label>Hora de entrega deseada</label><input type="time" id="photoDel" value="07:00"></div>
    <div class="field"><label>Nota (opcional)</label><input id="photoDesc" placeholder="Ej.: Pedido desayuno, pedido cena…"></div>`,
    [{label:'📤 Enviar foto',cls:'green',fn:()=>submitPhotoOnlyOrder($('#photoDel')?.value||'',$('#photoDesc')?.value||'')}]);
}

async function submitPhotoOnlyOrder(deliveryTime,description){
  const clientId=session?.role==='admin'?window.manualClientId:session.id;
  if(!clientId){toast('Selecciona un cliente');return;}
  const t=nowTime();
  DB.orders.unshift({
    id:uid(),clientId,date:todayStr(),time:t,channel:'foto',status:'pendiente',
    photoOnly:true,
    description:description||'Pedido por foto — pendiente de transcribir',
    deliveryTime:deliveryTime||'',
    shift:orderShift(t),items:[],
    imagenOriginal:window.pendingPhotoDataUrl,
  });
  audit('Pedido por foto (sin IA)',clientName(clientId));
  window.pendingPhotoDataUrl=null;
  window.pendingPhotoB64=null;
  closeSheet();
  await flushSave();
  if(session.role==='admin'){toast('Foto registrada ✅');adminNav('orders');}
  else{
    $('#successMsg').textContent='¡Foto enviada! Olga revisará tu pedido y te confirmará.';
    launchConfetti(); showView('v-success');
  }
}

async function interpretOrder(input,channel){
  openSheet(channel==='voz'?'🎙️ Interpretando tu pedido':'📸 Leyendo tu pedido',
    `<div style="text-align:center;padding:16px 0"><div class="spin"></div><b class="display">Un momentico…</b><br><span style="color:var(--ink-soft);font-weight:700">Estamos organizando tu pedido</span></div>`,[]);
  const catalog=activeProducts().map(p=>({id:p.id,nombre:p.name,unidad_sugerida:p.unidad_sugerida||'kilo'}));
  const instr=buildInterpretPrompt(catalog);
  let userContent;
  if(input.imageB64){
    if(!input.keepPhoto||!window.pendingPhotoDataUrl){
      window.pendingPhotoDataUrl='data:image/jpeg;base64,'+input.imageB64;
    }
    window.pendingPhotoB64=input.imageB64;
    userContent=[
      {type:'text',text:instr+'\nAnaliza la imagen. Si ves columnas Producto y Cantidad, lee fila por fila de arriba hacia abajo.'},
      {type:'image_url',image_url:{url:window.pendingPhotoDataUrl}},
    ];
  }else{
    window.pendingPhotoDataUrl=null;
    userContent=instr+'\nPedido dictado: "'+input.text+'"';
  }
  let items=null;
  try{
    const txt=await callOpenAI([{role:'user',content:userContent}]);
    items=JSON.parse(txt.replace(/```json|```/g,'').trim()).items;
  }catch(e){
    if(input.text) items=localParse(input.text);
  }
  if(!items||!items.length){
    openSheet('😕 No entendimos el pedido',`<div class="empty" style="padding:10px"><span class="ee">🤔</span><b class="display">Intenta de nuevo</b><span>Si usas la hoja con columnas Producto y Cantidad, asegúrate de que se vean claras en la foto.</span></div>`,
      [{label:'Reintentar',cls:'orange',fn:()=>{if(channel==='foto'&&window.pendingPhotoDataUrl)renderPhotoSheet();else channel==='voz'?openVoice():openPhoto();}}]);
    return;
  }
  items=enrichInterpretedItems(items);
  showInterpretedReview(items,channel);
}

function photoPreviewBlock(compact){
  if(!window.pendingPhotoDataUrl) return '';
  const cls=compact?'photo-user-thumb':'photo-review-img';
  return `<div class="photo-review-block pop">
    <button type="button" class="btn ghost sm block" style="margin-bottom:8px" onclick="viewPhotoLarge()">🔍 Ver foto en grande</button>
    <img src="${window.pendingPhotoDataUrl}" alt="Foto del pedido" class="${cls}">
  </div>`;
}

function showInterpretedReview(items,channel){
  items.forEach((it,i)=>{it._i=i;});
  window.pendingItems=items;
  window.pendingChannel=channel;
  window.interpretDraftKey='interpret_'+Date.now();
  try{localStorage.setItem(window.interpretDraftKey,JSON.stringify(items));}catch(e){}
  renderInterpretSheet();
}

function renderInterpretSheet(){
  const items=window.pendingItems||[];
  const channel=window.pendingChannel;
  const isAdmin=session?.role==='admin';
  const uopts=UNITS||[{id:'kilo',short:'kg'},{id:'gramo',short:'g'},{id:'unidad',short:'und'}];
  const anyWarn=items.some(it=>!it.removed&&(it.highlight!=='none'&&!it.resolved));
  const rows=items.filter(it=>!it.removed).map(it=>{
    const i=it._i;
    const p=DB.products.find(x=>x.id===it.productId);
    const unitLabel=it.uCliente||it.unidadTexto||(it.unidadSistema?(it.unidadSistema==='kilo'?'kg':it.unidadSistema==='gramo'?'g':'und'):'—');
    const canEditProduct=!isAdmin||!p;
    const prodSelect=`<select onchange="fixMatch(${i},this.value)" style="width:100%;margin-bottom:4px;border:2px solid var(--line);border-radius:10px;padding:6px;font-weight:700">
      <option value="">— Elige producto —</option>
      ${activeProducts().map(pr=>`<option value="${pr.id}" ${pr.id===it.productId?'selected':''}>${pr.name}</option>`).join('')}
    </select>`;
    return `<div class="rev-row ${it.highlight!=='none'&&!it.resolved?'warn':''}" data-ri="${i}">
      <span class="re">${p?.emoji||'❓'}</span>
      <div class="rn" style="flex:1;min-width:0">
        ${canEditProduct?prodSelect:`<b>${p.name}</b>`}
        ${!isAdmin?`<input class="interp-text-edit" value="${esc(it.texto||'')}" placeholder="Texto leído" oninput="pendingItems[${i}].texto=this.value;pendingItems[${i}].nombreDetectado=this.value;draftInterpret()">`:
          `<span class="interp-line">${highlightHTML(it)}</span>`}
        ${it.equivNote?`<span style="font-size:11px;color:var(--ink-soft);font-weight:700">📝 ${esc(it.equivNote)}</span>`:''}
      </div>
      ${isAdmin&&it.uCliente?`<span class="chip exc" style="font-size:10px;flex:none">${esc(unitLabel)}</span>`:
        `<select style="border:2px solid var(--line);border-radius:10px;padding:6px;font-weight:700;flex:none;${it.uCliente?'display:none':''}" onchange="pendingItems[${i}].unidad=this.value;pendingItems[${i}].unidadSistema=this.value;draftInterpret()">
          ${uopts.map(u=>`<option value="${u.id}" ${(it.unidadSistema||it.unidad||'kilo')===u.id?'selected':''}>${u.short}</option>`).join('')}
        </select>`}
      <input class="qty-in" style="width:52px;flex:none" inputmode="decimal" value="${it.cantidad||1}" oninput="pendingItems[${i}].cantidad=+this.value||1;draftInterpret()">
      <button type="button" class="icon-btn" onclick="pendingItems[${i}].removed=true;renderInterpretSheet()">🗑️</button>
    </div>`;
  }).join('');
  const adminTip=isAdmin?`<div class="admin-verify-tip">👩‍💼 <b>Olga:</b> verifica la transcripción de la IA. Corrige palabras y cantidades que hayas entendido mejor antes de confirmar.</div>`:'';
  const clientTip=!isAdmin?`<div class="hints" style="margin-bottom:10px">✏️ Puedes editar el texto, la cantidad o el producto antes de confirmar.</div>`:'';
  const btns=[{label:'✅ Confirmar pedido',cls:'green',fn:confirmInterpreted}];
  if(isAdmin) btns.unshift({label:'💾 Guardar revisión',cls:'yellow',fn:saveInterpretDraft});
  openSheet('✅ Revisa tu pedido',
    photoPreviewBlock(true)+adminTip+clientTip+
    (anyWarn?`<div class="warn-note"><span class="wi">⚠️</span>Las palabras en <span class="hl-word" style="cursor:default">naranja</span> necesitan revisión. ${isAdmin?'Tócalas para cambiar o permitir.':'Elige el producto correcto si aplica.'}</div>`:'')+
    rows, btns);
}

function draftInterpret(){
  try{if(window.interpretDraftKey)localStorage.setItem(window.interpretDraftKey,JSON.stringify(window.pendingItems));}catch(e){}
}

function viewPhotoLarge(){
  if(!window.pendingPhotoDataUrl){toast('Sin foto');return;}
  openSheet('📷 Foto original','<img src="'+window.pendingPhotoDataUrl+'" style="max-width:100%;border-radius:14px">',[]);
}

function openHighlightMenu(i){
  if(session?.role!=='admin'){toast('Solo la administradora puede resolver palabras resaltadas');return;}
  const it=window.pendingItems[i]; if(!it)return;
  openSheet('🔶 Palabra resaltada','<p style="font-weight:700;margin-bottom:10px">“'+esc(it.palabraResaltada||it.texto)+'”</p>',[
    {label:'✏️ Cambiar palabra',cls:'orange',fn:()=>openChangeWord(i)},
    {label:'✅ Permitir palabra',cls:'green',fn:()=>allowWord(i)},
  ]);
}

function openChangeWord(i){
  const it=window.pendingItems[i];
  const opts=activeProducts().map(p=>`<option value="${p.id}">${p.name}</option>`).join('');
  openSheet('✏️ Cambiar palabra',`
    <div class="field"><label>Texto corregido</label><input id="cwText" value="${esc(it.palabraResaltada||it.texto||'')}"></div>
    <div class="field"><label>O asociar a producto del catálogo</label>
      <input id="cwSearch" placeholder="🔍 Buscar producto…" oninput="filterCwProd(this.value)">
      <select id="cwProd" size="5" style="height:120px;margin-top:6px">${opts}</select></div>
    <div class="field"><label>Nota de equivalencia (opcional)</label>
      <input id="cwNote" placeholder='Ej.: "Un manojo son 200 gramos"' value="${esc(it.equivNote||'')}"></div>`,
    [{label:'Aplicar',cls:'green',fn:()=>{
      const pid=$('#cwProd')?.value;
      const note=$('#cwNote')?.value||'';
      if(pid){
        it.productId=pid; it.productoReconocido=true;
        learnVocab({tipo:'producto',texto_alias:it.palabraResaltada||it.nombreDetectado,producto_id:pid});
      }
      it.equivNote=note;
      it.resolved=true; it.highlight='none';
      draftInterpret(); renderInterpretSheet(); closeSheet(); toast('Actualizado');
    }}]);
}

function filterCwProd(q){
  const sel=$('#cwProd'); if(!sel)return;
  const n=normTxt(q);
  [...sel.options].forEach(o=>{o.hidden=n&&!normTxt(o.text).includes(n);});
}

function allowWord(i){
  const it=window.pendingItems[i];
  it.allowed=true; it.resolved=true; it.highlight='none';
  if(it.uCliente||it.unidadTexto){
    learnVocab({tipo:'unidad',texto_alias:it.uCliente||it.unidadTexto,unidad_original:it.uCliente||it.unidadTexto});
  }
  openSheet('📝 Nota de equivalencia (opcional)',
    `<input id="eqNote" placeholder='Ej.: "Un manojo son 200 gramos"' value="${esc(it.equivNote||'')}">`,
    [{label:'Guardar',cls:'green',fn:()=>{it.equivNote=$('#eqNote').value||'';draftInterpret();renderInterpretSheet();toast('Unidad permitida ✅');}}]);
}

function learnVocab(entry){
  if(!DB.vocabulario) DB.vocabulario=[];
  const key=normTxt(entry.texto_alias);
  const existing=DB.vocabulario.find(v=>normTxt(v.texto_alias)===key&&v.tipo===entry.tipo);
  if(existing){
    if(entry.tipo==='producto'&&existing.producto_id&&entry.producto_id&&existing.producto_id!==entry.producto_id){
      existing.conflicto=true;
    }else{
      existing.veces_usado=(existing.veces_usado||0)+1;
      if(entry.producto_id) existing.producto_id=entry.producto_id;
    }
    existing.actualizadoEn=new Date().toISOString();
  }else{
    DB.vocabulario.push({
      id:uid(),texto_alias:entry.texto_alias,tipo:entry.tipo,
      producto_id:entry.producto_id||null,
      unidad_original:entry.unidad_original||null,
      origen:'aprendido',veces_usado:1,conflicto:false,
      creadoEn:new Date().toISOString(),actualizadoEn:new Date().toISOString(),
    });
  }
  saveDB();
}

function saveInterpretDraft(){
  draftInterpret();
  flushSave().then(()=>toast('Borrador guardado 💾'));
}

function fixMatch(i,pid){
  pendingItems[i].productId=pid||null;
  pendingItems[i].productoReconocido=!!pid;
  pendingItems[i].confianza=pid?1:0.2;
  if(pid&&pendingItems[i].highlight==='linea'){pendingItems[i].resolved=true;pendingItems[i].highlight='none';}
  draftInterpret();
  renderInterpretSheet();
}

function confirmInterpreted(){
  const items=(window.pendingItems||[]).filter(it=>!it.removed);
  const missing=items.filter(it=>!it.productId);
  if(missing.length){toast('Hay productos sin identificar — elígelos o elimínalos');return;}
  if(!items.length){toast('El pedido quedó vacío');return;}
  window.pendingInterpretItems=items.map(it=>({
    productId:it.productId,
    cantidad:it.cantidad,
    unidad:it.unidadSistema||it.unidad||'kilo',
    uCliente:it.uCliente||it.unidadTexto||null,
    equivNote:it.equivNote||'',
    texto:it.texto,
  }));
  if(session.role==='admin'){
    submitInterpretedOrder(window.manualClientId,window.pendingChannel==='voz'?'voz':'foto',true);
  }else{
    submitInterpretedOrder(session.id,window.pendingChannel);
  }
}

async function submitInterpretedOrder(clientId,channel,fromAdmin=false){
  const items=window.pendingInterpretItems.map(it=>({
    p:it.productId,q:+it.cantidad,u:it.unidad||'kilo',
    uCliente:it.uCliente||null,equivNote:it.equivNote||'',
    w:null,unitPrice:null,priceUnit:it.unidad||'kilo',total:null,
  }));
  const t=nowTime();
  DB.orders.unshift({
    id:uid(),clientId,date:todayStr(),time:t,channel,status:'pendiente',
    description:'',deliveryTime:'',shift:orderShift(t),items,
    imagenOriginal:window.pendingPhotoDataUrl||null,
  });
  audit('Creó pedido (interpretado)',`${clientName(clientId)} · ${items.length} productos`);
  window.pendingPhotoDataUrl=null;
  window.pendingInterpretItems=null;
  closeSheet();
  await flushSave();
  if(fromAdmin){toast('Pedido registrado ✅');adminNav('orders');}
  else{
    $('#successMsg').textContent='Pedido registrado desde foto/voz. Puedes hacer otro pedido hoy si lo necesitas.';
    launchConfetti(); showView('v-success');
  }
}

/* ---------- Panel Vocabulario (admin) ---------- */
let vocabFilter='producto';
function renderVocabulario(){
  if(!DB.vocabulario) DB.vocabulario=[];
  const list=DB.vocabulario.filter(v=>v.tipo===vocabFilter);
  $('#adminBody').innerHTML=`
    <div class="seg">
      <button class="${vocabFilter==='producto'?'on':''}" onclick="vocabFilter='producto';renderVocabulario()">🥬 Sinónimos</button>
      <button class="${vocabFilter==='unidad'?'on':''}" onclick="vocabFilter='unidad';renderVocabulario()">📏 Unidades</button>
    </div>
    <button class="btn green block pop" style="margin-bottom:10px" onclick="openVocabForm()">➕ Agregar palabra</button>
    <div class="field"><input placeholder="🔍 Buscar…" oninput="filterVocabList(this.value)"></div>
    <div id="vocabList">${vocabListHTML(list)}</div>`;
}

function vocabListHTML(list){
  return list.map(v=>{
    const p=v.producto_id?DB.products.find(x=>x.id===v.producto_id):null;
    const sub=v.tipo==='producto'
      ?(p?`→ ${p.emoji||''} ${p.name}`:'→ (sin producto)')
      :`Unidad: ${v.unidad_original||v.texto_alias} · usada ${v.veces_usado||0}×`;
    return `<div class="list-row ${v.conflicto?'warn':''}" style="border-color:${v.conflicto?'var(--orange)':'var(--line)'}">
      <span class="le">${v.tipo==='producto'?(p?.emoji||'📚'):'📏'}</span>
      <div class="lt"><b>${v.texto_alias}</b><span>${sub}${v.conflicto?' · ⚠️ conflicto':''}</span></div>
      <button class="icon-btn" onclick="deleteVocab('${v.id}')">🗑️</button></div>`;
  }).join('')||'<div class="empty" style="padding:16px"><span class="ee">📚</span><span>Sin entradas aún — se aprenden al revisar pedidos por foto</span></div>';
}

function filterVocabList(q){
  const n=normTxt(q);
  const list=(DB.vocabulario||[]).filter(v=>v.tipo===vocabFilter&&(!n||normTxt(v.texto_alias).includes(n)));
  $('#vocabList').innerHTML=vocabListHTML(list);
}

function openVocabForm(){
  const opts=activeProducts().map(p=>`<option value="${p.id}">${p.name}</option>`).join('');
  openSheet('➕ Agregar al vocabulario',`
    <div class="field"><label>Tipo</label><select id="vfTipo"><option value="producto">Sinónimo de producto</option><option value="unidad">Unidad aceptada</option></select></div>
    <div class="field"><label>Palabra / alias</label><input id="vfAlias" placeholder="Ej.: manojo, rúgula"></div>
    <div class="field" id="vfProdWrap"><label>Producto</label><select id="vfProd">${opts}</select></div>`,
    [{label:'Guardar',cls:'green',fn:()=>{
      const tipo=$('#vfTipo').value;
      learnVocab({tipo,texto_alias:$('#vfAlias').value.trim(),producto_id:tipo==='producto'?$('#vfProd').value:null,unidad_original:tipo==='unidad'?$('#vfAlias').value.trim():null});
      closeSheet(); renderVocabulario(); toast('Palabra guardada');
    }}]);
}

function deleteVocab(id){
  DB.vocabulario=DB.vocabulario.filter(v=>v.id!==id);
  saveDB(); renderVocabulario();
}

function showOrderPhoto(o){
  if(!o?.imagenOriginal){toast('Este pedido no tiene foto guardada');return;}
  openSheet('📷 Foto original del pedido',`<img src="${o.imagenOriginal}" style="max-width:100%;border-radius:14px">`,[]);
}
function showOrderPhotoById(id){
  const o=DB.orders.find(x=>x.id===id);
  showOrderPhoto(o);
}
function openManualOrderFromPhoto(o){
  window.manualClientId=o.clientId;
  window.pendingPhotoDataUrl=o.imagenOriginal;
  window.pendingPhotoB64=o.imagenOriginal?.includes(',')?o.imagenOriginal.split(',')[1]:null;
  if(window.pendingPhotoB64) startPhotoInterpret();
  else toast('No hay foto en este pedido');
}
