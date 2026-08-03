/* ============================================================
   FRUVER — Interpretación de pedidos (instruccion1)
   Foto tabular Producto/Cantidad, vocabulario, resaltados
   ============================================================ */
const STD_UNITS=new Set(['kilo','gramo','unidad','libra','cuartilla','valor']);
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
    if(o.transcribeDraft==null) o.transcribeDraft=null;
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

IMPORTANTE SOBRE FOTOS:
- La foto puede incluir mesa, manos, piso, otros objetos, bordes oscuros o sombras ARRIBA y ABAJO de la hoja.
- Primero LOCALIZA el documento del pedido: hoja impresa, cuaderno, captura de Excel/WhatsApp o lista escrita a mano.
- IGNORA todo lo que no sea el listado de productos (logos decorativos, encabezados de empresa, pies de página, marcas de agua).
- Si hay varias hojas o listas, usa la más legible y completa.
- Enfócate en filas con nombre de producto + cantidad (y unidad si aparece).

Formatos posibles (cualquiera es válido — NO exijas un formato único):
1) HOJA TABULAR impresa: columnas Producto / Cantidad / Unidad.
2) Lista libre escrita a mano (una línea por producto).
3) Captura de pantalla de Excel, Google Sheets o tabla con filas y columnas (detecta encabezados como Producto, Item, Cantidad, Unidad, Qty, etc.).
4) Captura de WhatsApp, correo o PDF con listas numeradas o con viñetas.
5) Orden de compra (OC) con tabla de ítems, aunque tenga logo, totales o pie de página.
6) Foto inclinada, con sombra, bordes de pantalla o UI del teléfono — igual debes leer la tabla/lista central.

EXCEL Y TABLAS EN PANTALLA:
- Identifica columnas aunque tengan nombres distintos (Producto, Descripción, Item, Artículo, Insumo… / Cant, Cantidad, Qty… / Und, Unidad, U.M.).
- Ignora filas de totales, subtotales, IVA, encabezados de empresa y celdas vacías.
- Si hay celdas combinadas o varias pestañas visibles, extrae los ítems de la tabla principal del pedido.
- Montos en pesos ($) sin unidad de peso NO son cantidad en kg — puede ser precio referencial; prioriza columnas de cantidad/unidad.

TEXTO LARGO PEGADO:
- Si recibes texto multilínea (WhatsApp, Excel copiado, correo), divide en un ítem por línea o fila lógica.
- Tolera separadores: tabulaciones, comas, puntos y coma, guiones, numeración (1. 2. 3.).

Catálogo (match SOLO con estos ids cuando reconozcas el producto): ${JSON.stringify(catalog)}

REGLAS CRÍTICAS:
- NO conviertas unidades no estándar (manojo, bandeja, cabeza, caja, paquete, bulto…) a kg/g/unidad. Consérvalas en unidadTexto.
- Unidades estándar del sistema: kilo, gramo, unidad — solo si el cliente escribió kg/g/und/unidad/kilo/gramos explícitamente.
- Fracciones: "1/2", "1,5", "2 1/2" → cantidad numérica decimal.
- "4k", "8k" pegado al número = kilogramos.
- Si solo hay número sin unidad (ej. "Granadilla 10"), deja unidadSistema null y unidadTexto vacío; el sistema usará unidad_sugerida del catálogo.
- Si NO reconoces el producto, productId=null y productoReconocido=false.
- Si reconoces producto pero la unidad NO es estándar, productoReconocido=true, unidadReconocida=false.
- No inventes productos ni conversiones. Marca confianza baja (<0.7) ante ambigüedad.
- Si una línea tiene dos variantes (ej. cebolla roja 2 kilos x blanca 2 kilos), sepárala en DOS items.

Devuelve SOLO JSON válido sin markdown ni texto extra:
{"items":[{"texto":"literal","productId":"id|null","nombreDetectado":"string","cantidad":number,"unidadTexto":"como escribió el cliente","unidadSistema":"kilo|gramo|unidad|null","unidadReconocida":true|false,"productoReconocido":true|false,"confianza":0.0-1.0,"palabraResaltada":"unidad o frase a resaltar|null"}]}`;
}

function extractInterpretJSON(txt){
  const cleaned=(txt||'').replace(/```json\s*|```/g,'').trim();
  try{return JSON.parse(cleaned);}catch(e){}
  const m=cleaned.match(/\{[\s\S]*"items"\s*:\s*\[[\s\S]*\]\s*\}/);
  if(m) try{return JSON.parse(m[0]);}catch(e2){}
  return null;
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

function computeHighlightRange(it){
  const txt=it.texto||'';
  if(!txt||it.highlight==='none'||it.resolved) return null;
  if(it.highlight==='linea'||!it.productoReconocido){
    return {start:0,end:txt.length};
  }
  if(it.highlight==='unidad'&&it.unidadTexto){
    const u=it.unidadTexto.trim();
    const esc=u.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    const patterns=[
      new RegExp(`(\\d+[\\d,./\\s]*)\\s*(${esc})\\b`,'i'),
      new RegExp(`\\b(${esc})\\b`,'gi'),
    ];
    for(const re of patterns){
      const m=re.exec(txt);
      if(m){
        const unitPart=m[m.length-1];
        const start=txt.toLowerCase().lastIndexOf(unitPart.toLowerCase());
        if(start>=0) return {start,end:start+unitPart.length};
      }
    }
  }
  const w=(it.palabraResaltada||'').trim();
  if(w){
    const start=txt.toLowerCase().lastIndexOf(w.toLowerCase());
    if(start>=0) return {start,end:start+w.length};
  }
  return {start:0,end:txt.length};
}

function highlightHTML(it){
  if(it.highlight==='none'||it.resolved||!(it.texto||'').length) return esc(it.texto||'');
  const range=computeHighlightRange(it);
  if(!range) return esc(it.texto||'');
  const txt=it.texto;
  if(range.start===0&&range.end>=txt.length){
    return `<span class="hl-word hl-pulse" data-i="${it._i}" onclick="openHighlightMenu(${it._i},event)">${esc(txt)}</span>`;
  }
  const before=txt.slice(0,range.start);
  const mid=txt.slice(range.start,range.end);
  const after=txt.slice(range.end);
  return `${esc(before)}<span class="hl-word hl-pulse" data-i="${it._i}" onclick="openHighlightMenu(${it._i},event)">${esc(mid)}</span>${esc(after)}`;
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

function isManualOrderContext(){
  return !!window.manualOrderRegister||($('#v-manual-order')?.classList.contains('active')&&session?.role==='admin');
}
function syncManualOrderContext(){
  if($('#v-manual-order')?.classList.contains('active')&&session?.role==='admin'){
    window.manualOrderRegister=true;
    window.manualClientId=$('#manCli')?.value||window.manualClientId;
  }
}

function openPhoto(){
  window.pendingPhotoDataUrl=null;
  window.pendingPhotoB64=null;
  if(isManualOrderContext()){
    syncManualOrderContext();
    renderManualOrderPage();
    toast('Usa la sección de foto en el pedido manual');
    return;
  }
  renderPhotoSheet();
}

function renderPhotoSheet(){
  const isAdmin=session?.role==='admin';
  const firstTime=!isAdmin&&!hasSeenPhotoTutorial();
  const hasPhoto=!!window.pendingPhotoDataUrl;
  const tutorialBlock=firstTime?`
    <div class="photo-tutorial highlight pop">
      <p class="photo-tutorial-title">📋 Sugerencia: formato con Producto y Cantidad</p>
      <img src="${PHOTO_TUTORIAL}" alt="Formato sugerido de pedido" class="photo-tutorial-img" onclick="viewTutorialLarge()">
      <p class="photo-tutorial-hint">Este formato ayuda, pero <b>también aceptamos fotos de Excel, WhatsApp u hojas escrita a mano</b>. Usa buena luz al tomar la foto.</p>
      <button type="button" class="btn ghost sm block" style="margin-top:8px" onclick="dismissPhotoTutorial()">✅ Entendido</button>
    </div>`:(!hasPhoto&&!isAdmin?`<button type="button" class="photo-tutorial-link" onclick="viewTutorialLarge()">📋 Ver formato sugerido (opcional)</button>`:'');
  const captureBlock=`
    <input type="file" id="photoIn" accept="image/*" capture="environment" style="display:none" onchange="photoPicked(this)">
    <button type="button" class="btn yellow block" onclick="document.getElementById('photoIn').click()">${hasPhoto?'📷 Cambiar foto':'📷 Tomar o elegir foto'}</button>`;
  const previewBlock=hasPhoto?`
    <div class="photo-user-preview pop">
      <p class="photo-user-lbl">Tu foto del pedido · toca para ampliar</p>
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
    <img src="${window.pendingPhotoDataUrl}" alt="Tu pedido" class="photo-client-wide" style="margin-bottom:12px" onclick="viewPhotoLarge()">
    <div class="field"><label>Hora de entrega deseada</label><input type="time" id="photoDel" value="07:00"></div>
    <div class="field"><label>Nota (opcional)</label><input id="photoDesc" placeholder="Ej.: Pedido desayuno, pedido cena…"></div>`,
    [{label:'📤 Enviar foto',cls:'green',fn:()=>submitPhotoOnlyOrder($('#photoDel')?.value||'',$('#photoDesc')?.value||'')}]);
}

async function submitPhotoOnlyOrder(deliveryTime,description){
  const clientId=session?.role==='admin'?window.manualClientId:session.id;
  if(!clientId){toast('Selecciona un cliente');return;}
  const t=nowTime();
  DB.orders.unshift({
    id:uid(),clientId,date:todayStr(),time:t,channel:'foto',status:'por_confirmar',
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
  const isInlineAdmin=!!window.transcribingOrderId;
  const isManualInline=isManualOrderContext()&&!isInlineAdmin;
  if(isInlineAdmin){
    const panel=$('#orderTranscribePanel');
    if(panel) panel.innerHTML=`<div class="interp-loading"><div class="spin"></div><b class="display">Leyendo la foto…</b><br><span>Un momentico, estamos organizando el pedido</span></div>`;
  }else if(isManualInline){
    syncManualOrderContext();
    const panel=$('#manualInterpretPanel');
    if(panel) panel.innerHTML=`<div class="interp-loading"><div class="spin"></div><b class="display">${input.imageB64?'Analizando imagen…':'Analizando texto…'}</b><br><span>Detectando productos y cantidades</span></div>`;
  }else{
    openSheet(channel==='voz'?'🎙️ Interpretando tu pedido':'📸 Leyendo tu pedido',
      `<div style="text-align:center;padding:16px 0"><div class="spin"></div><b class="display">Un momentico…</b><br><span style="color:var(--ink-soft);font-weight:700">Estamos organizando tu pedido</span></div>`,[]);
  }
  const catalog=activeProducts().map(p=>({id:p.id,nombre:p.name,unidad_sugerida:p.unidad_sugerida||'kilo'}));
  const instr=buildInterpretPrompt(catalog);
  let userContent;
  let items=null;
  let lastError='';
  if(input.imageB64){
    if(!input.keepPhoto||!window.pendingPhotoDataUrl){
      window.pendingPhotoDataUrl='data:image/jpeg;base64,'+input.imageB64;
    }
    window.pendingPhotoB64=input.imageB64;
    userContent=[
      {type:'text',text:instr+'\n\nAnaliza la imagen completa. Detecta automáticamente si es Excel, WhatsApp, hoja impresa u OC.\nPaso 1: localiza la tabla o lista del pedido (ignora barras del teléfono, iconos y fondo).\nPaso 2: lee fila por fila producto + cantidad (+ unidad si existe).\nPaso 3: devuelve el JSON con todos los ítems legibles.'},
      {type:'image_url',image_url:{url:window.pendingPhotoDataUrl,detail:'high'}},
    ];
  }else{
    window.pendingPhotoDataUrl=null;
    userContent=instr+'\n\nPedido en texto (puede ser largo, multilínea, copiado de Excel o WhatsApp):\n"""'+input.text+'"""\n\nDivide en ítems y devuelve el JSON.';
  }
  try{
    const maxTok=input.imageB64?3000:4500;
    const txt=await callOpenAI([{role:'user',content:userContent}],maxTok);
    const parsed=extractInterpretJSON(txt);
    items=parsed?.items;
    if(!items?.length) lastError='La IA no devolvió productos legibles';
  }catch(e){
    console.error('interpretOrder',e);
    lastError=e.message||'Error de conexión con IA';
    if(input.text) items=localParse(input.text);
  }
  if(!items||!items.length){
    const detail=lastError?`<span style="display:block;margin-top:8px;font-size:12px;color:var(--ink-soft)">${esc(lastError)}</span>`:'';
    if(isInlineAdmin){
      const panel=$('#orderTranscribePanel');
      if(panel) panel.innerHTML=`<div class="empty" style="padding:10px"><span class="ee">🤔</span><b class="display">No pudimos leer el pedido</b><span>Intenta de nuevo con mejor luz.</span>${detail}</div>
        <button type="button" class="btn green block" style="margin-top:10px" onclick="startOrderPhotoInterpret('${window.transcribingOrderId}')">Reintentar con IA</button>`;
      return;
    }
    if(isManualInline){
      const panel=$('#manualInterpretPanel');
      if(panel) panel.innerHTML=`<div class="empty" style="padding:10px"><span class="ee">🤔</span><b class="display">No pudimos interpretar</b><span>Revisa el texto o la imagen e intenta de nuevo.</span>${detail}</div>
        <button type="button" class="btn green block" style="margin-top:10px" onclick="${channel==='foto'?'interpretManualPhoto()':'interpretManualText()'}">Reintentar</button>`;
      return;
    }
    openSheet('😕 No pudimos leer el pedido',`<div class="empty" style="padding:10px"><span class="ee">🤔</span><b class="display">Intenta de nuevo</b><span>Enfoca la hoja con buena luz. Puedes enviar solo la foto si prefieres.</span>${detail}</div>`,
      [{label:'Reintentar con IA',cls:'green',fn:()=>{if(channel==='foto'&&window.pendingPhotoB64)interpretOrder({imageB64:window.pendingPhotoB64,keepPhoto:true},'foto');else channel==='voz'?openVoice():openPhoto();}},
       {label:'Enviar solo foto',cls:'ghost',fn:()=>{closeSheet();renderPhotoSheet();}}]);
    return;
  }
  items=enrichInterpretedItems(items);
  showInterpretedReview(items,channel);
}

function photoPreviewBlock(compact){
  if(!window.pendingPhotoDataUrl) return '';
  const isAdmin=session?.role==='admin';
  const cls=isAdmin?(compact?'photo-user-thumb':'photo-review-img'):'photo-client-wide';
  return `<div class="photo-review-block pop">
    <p class="photo-user-lbl" style="margin-bottom:6px">${isAdmin?'Foto del pedido':'Tu foto · toca para ampliar'}</p>
    <img src="${window.pendingPhotoDataUrl}" alt="Foto del pedido" class="${cls}" onclick="viewPhotoLarge()">
  </div>`;
}

function showInterpretedReview(items,channel){
  items.forEach((it,i)=>{it._i=i;});
  window.pendingItems=items;
  window.pendingChannel=channel;
  window.interpretDraftKey='interpret_'+Date.now();
  try{localStorage.setItem(window.interpretDraftKey,JSON.stringify(items));}catch(e){}
  if(window.transcribingOrderId){
    renderInterpretInline('orderTranscribePanel');
    return;
  }
  if(isManualOrderContext()){
    closeSheet();
    renderInterpretInline('manualInterpretPanel');
    const body=$('#manualOrderBody');
    if(body) body.scrollTop=body.scrollHeight;
    return;
  }
  renderInterpretSheet();
}

function interpretReviewHTML(){
  const items=window.pendingItems||[];
  const isAdmin=session?.role==='admin';
  const uopts=UNITS||[{id:'kilo',short:'kg'},{id:'gramo',short:'g'},{id:'unidad',short:'und'}];
  const anyWarn=isAdmin&&items.some(it=>!it.removed&&(it.highlight!=='none'&&!it.resolved));
  const rows=items.filter(it=>!it.removed).map(it=>{
    const i=it._i;
    const p=DB.products.find(x=>x.id===it.productId);
    const unitLabel=it.uCliente||it.unidadTexto||(it.unidadSistema?(it.unidadSistema==='kilo'?'kg':it.unidadSistema==='gramo'?'g':'und'):'');
    if(!isAdmin){
      const label=p?.name||it.nombreDetectado||it.texto||'Producto';
      const uVal=it.uCliente||it.unidadSistema||it.unidad||'kilo';
      return `<div class="rev-row" data-ri="${i}">
        <span class="re">${p?.emoji||'🥬'}</span>
        <div class="rn" style="flex:1;min-width:0">
          <b>${esc(label)}</b>
          <input class="interp-text-edit" value="${esc(it.texto||label)}" placeholder="Texto leído" oninput="pendingItems[${i}].texto=this.value;pendingItems[${i}].nombreDetectado=this.value;draftInterpret()">
        </div>
        <select style="border:2px solid var(--line);border-radius:10px;padding:6px;font-weight:700;flex:none" onchange="pendingItems[${i}].unidad=this.value;pendingItems[${i}].unidadSistema=this.value;draftInterpret()">
          ${uopts.map(u=>`<option value="${u.id}" ${uVal===u.id?'selected':''}>${u.short}</option>`).join('')}
        </select>
        <input class="qty-in" style="width:52px;flex:none" inputmode="decimal" value="${it.cantidad||1}" oninput="pendingItems[${i}].cantidad=+this.value||1;draftInterpret()">
        <button type="button" class="icon-btn" onclick="pendingItems[${i}].removed=true;renderInterpretReview()">🗑️</button>
      </div>`;
    }
    const canEditProduct=!p;
    const prodSelect=`<select onchange="fixMatch(${i},this.value)" style="width:100%;margin-bottom:4px;border:2px solid var(--line);border-radius:10px;padding:6px;font-weight:700">
      <option value="">— Elige producto —</option>
      ${activeProducts().map(pr=>`<option value="${pr.id}" ${pr.id===it.productId?'selected':''}>${pr.name}</option>`).join('')}
    </select>`;
    return `<div class="rev-row ${it.highlight!=='none'&&!it.resolved?'warn':''}" data-ri="${i}">
      <span class="re">${p?.emoji||'❓'}</span>
      <div class="rn" style="flex:1;min-width:0">
        ${canEditProduct?prodSelect:`<b>${p.name}</b>`}
        <span class="interp-line">${highlightHTML(it)}</span>
        ${it.equivNote?`<span style="font-size:11px;color:var(--ink-soft);font-weight:700">📝 ${esc(it.equivNote)}</span>`:''}
      </div>
      ${it.uCliente?`<span class="chip exc" style="font-size:10px;flex:none">${esc(unitLabel)}</span>`:
        `<select style="border:2px solid var(--line);border-radius:10px;padding:6px;font-weight:700;flex:none" onchange="pendingItems[${i}].unidad=this.value;pendingItems[${i}].unidadSistema=this.value;draftInterpret()">
          ${uopts.map(u=>`<option value="${u.id}" ${(it.unidadSistema||it.unidad||'kilo')===u.id?'selected':''}>${u.short}</option>`).join('')}
        </select>`}
      <input class="qty-in" style="width:52px;flex:none" inputmode="decimal" value="${it.cantidad||1}" oninput="pendingItems[${i}].cantidad=+this.value||1;draftInterpret()">
      <button type="button" class="icon-btn" onclick="pendingItems[${i}].removed=true;renderInterpretReview()">🗑️</button>
    </div>`;
  }).join('');
  const adminTip=isAdmin?`<div class="admin-verify-tip">👩‍💼 <b>Olga:</b> verifica la transcripción. Corrige palabras y cantidades antes de confirmar.</div>`:'';
  const clientTip=!isAdmin?`<div class="hints" style="margin-bottom:10px">✏️ Revisa tu pedido transcrito. Puedes ajustar texto, cantidad o unidad antes de confirmar.</div>`:'';
  const warnTip=anyWarn?`<div class="interp-hint">
    <p>Algunas palabras aparecen en <span class="hl-word hl-static">naranja</span>.</p>
    <p>Tócalas para decidir qué hacer con cada una.</p>
    <p>Cuando termines, podrás confirmar el pedido.</p>
  </div>`:'';
  const foot=isAdmin?`<div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap">
    <button type="button" class="btn yellow" style="flex:1" onclick="saveInterpretDraft()">💾 Guardar borrador</button>
    <button type="button" class="btn green" style="flex:2" id="btnConfirmInterp" onclick="confirmInterpreted()" ${anyWarn?'disabled':''}>${window.transcribingOrderId?'✅ Guardar transcripción':'✅ Confirmar pedido'}</button>
  </div>`:'';
  return adminTip+clientTip+warnTip+rows+foot;
}

function renderInterpretReview(){
  if(window.transcribingOrderId) renderInterpretInline('orderTranscribePanel');
  else if(isManualOrderContext()) renderInterpretInline('manualInterpretPanel');
  else renderInterpretSheet();
}

function renderSavedTranscriptionHTML(draft){
  if(!draft?.length) return '';
  const rows=draft.filter(it=>!it.removed).map(it=>{
    const p=DB.products.find(x=>x.id===it.productId);
    const name=p?.name||it.nombreDetectado||it.texto||'—';
    const u=it.uCliente||it.unidadTexto||fmtUnit(it.unidadSistema||it.unidad||'kilo');
    const qty=it.cantidad||it.q||'—';
    return `<div class="rev-row"><span class="re">${p?.emoji||'📝'}</span><div class="rn"><b>${esc(name)}</b><span>${qty} ${esc(u)}${it.equivNote?' · 📝 '+esc(it.equivNote):''}${it.texto&&it.texto!==name?` · «${esc(it.texto)}»`:''}</span></div></div>`;
  }).join('');
  return `<div class="card pop" style="padding:12px;margin-bottom:12px;border:2px solid var(--green-soft)">
    <b class="display">✍️ Transcripción del pedido</b>
    <p style="font-size:12px;font-weight:700;color:var(--ink-soft);margin:6px 0 8px">Referencia corregida de la foto — se conserva permanentemente.</p>
    ${rows||'<p style="font-weight:700;color:var(--ink-soft)">Sin líneas transcritas</p>'}
  </div>`;
}
window.renderSavedTranscriptionHTML=renderSavedTranscriptionHTML;

function renderInterpretInline(panelId){
  const panel=$('#'+panelId);
  if(!panel) return;
  const photo=panelId==='manualInterpretPanel'&&window.pendingPhotoDataUrl
    ?`<div class="photo-user-preview pop" style="margin-bottom:10px"><img src="${window.pendingPhotoDataUrl}" alt="Referencia" class="photo-user-thumb" style="max-height:160px;width:100%;object-fit:contain" onclick="viewPhotoLarge()"></div>`:'';
  panel.innerHTML=`<div class="card pop" style="padding:12px"><b class="display">✍️ Resultado del análisis</b>
    ${photo}${interpretReviewHTML()}
    ${panelId==='manualInterpretPanel'?`<button type="button" class="btn ghost sm block" style="margin-top:8px" onclick="applyInterpretToManualRows()">📋 Copiar productos a la lista manual</button>`:''}
  </div>`;
  if(panelId==='orderTranscribePanel'&&typeof syncOrderDetailScrollPad==='function') syncOrderDetailScrollPad();
}

function renderInterpretSheet(){
  const isAdmin=session?.role==='admin';
  openSheet(isAdmin?'✅ Revisa la transcripción':'✅ Tu pedido transcrito',
    photoPreviewBlock(true)+interpretReviewHTML(),[]);
  if(!isAdmin){
    const f=$('#sheetFoot');
    const ok=document.createElement('button');
    ok.className='btn green'; ok.style.flex='2'; ok.textContent='✅ Confirmar pedido';
    ok.onclick=confirmInterpreted;
    f.appendChild(ok);
  }
}

function draftInterpret(){
  try{if(window.interpretDraftKey)localStorage.setItem(window.interpretDraftKey,JSON.stringify(window.pendingItems));}catch(e){}
}

function viewPhotoLarge(){
  if(!window.pendingPhotoDataUrl){toast('Sin foto');return;}
  openPhotoLightbox(window.pendingPhotoDataUrl);
}

function closeHighlightPopover(){
  const p=$('#hlPopover');
  if(p) p.remove();
  document.removeEventListener('click',closeHighlightPopoverOnOutside,true);
}
function closeHighlightPopoverOnOutside(e){
  if(e.target.closest('#hlPopover')||e.target.closest('.hl-word')) return;
  closeHighlightPopover();
}

function openHighlightMenu(i,ev){
  ev?.stopPropagation();
  if(session?.role!=='admin'){toast('Solo la administradora puede resolver palabras resaltadas');return;}
  const it=window.pendingItems?.[i];
  if(!it||it.resolved) return;
  closeHighlightPopover();
  const el=ev?.currentTarget||document.querySelector(`.hl-word[data-i="${i}"]`);
  const pop=document.createElement('div');
  pop.id='hlPopover';
  pop.className='hl-popover';
  pop.innerHTML=`
    <button type="button" onclick="hlActionNewText(${i})">✏️ Escribir otra palabra</button>
    <button type="button" onclick="hlActionUnit(${i})">📏 Asociar a unidad de medida</button>
    <button type="button" onclick="hlActionProduct(${i})">🥬 Asociar a producto</button>
    <button type="button" onclick="allowWord(${i})">✅ Permitir palabra</button>`;
  document.body.appendChild(pop);
  if(el){
    const r=el.getBoundingClientRect();
    const pw=pop.offsetWidth||200;
    let left=Math.min(Math.max(8,r.left+r.width/2-pw/2),window.innerWidth-pw-8);
    let top=r.top-8-pop.offsetHeight;
    if(top<8) top=r.bottom+8;
    pop.style.left=left+'px';
    pop.style.top=top+'px';
  }
  setTimeout(()=>document.addEventListener('click',closeHighlightPopoverOnOutside,true),0);
}

function hlActionNewText(i){
  closeHighlightPopover();
  const it=window.pendingItems[i];
  const range=computeHighlightRange(it);
  const current=range?it.texto.slice(range.start,range.end):(it.palabraResaltada||it.texto||'');
  const pop=document.createElement('div');
  pop.id='hlPopover';
  pop.className='hl-popover';
  pop.innerHTML=`
    <div class="hl-pop-field"><label style="font-size:12px;font-weight:800;color:var(--ink-soft)">Nueva palabra</label>
      <input id="hlNewText" value="${esc(current)}" placeholder="Escribe la corrección"></div>
    <div class="hl-pop-field"><label style="font-size:12px;font-weight:800;color:var(--ink-soft)">Nota (opcional)</label>
      <input id="hlNewNote" value="${esc(it.equivNote||'')}" placeholder='Ej.: "Un manojo son 200 g"'></div>
    <button type="button" onclick="applyHlNewText(${i})">Aplicar</button>`;
  document.body.appendChild(pop);
  const el=document.querySelector(`.hl-word[data-i="${i}"]`);
  if(el){
    const r=el.getBoundingClientRect();
    pop.style.left=Math.min(Math.max(8,r.left),window.innerWidth-220)+'px';
    pop.style.top=(r.top-8-pop.offsetHeight)+'px';
  }
  $('#hlNewText')?.focus();
}

function applyHlNewText(i){
  const it=window.pendingItems[i];
  const newText=$('#hlNewText')?.value?.trim();
  if(!newText){toast('Escribe una palabra');return;}
  const range=computeHighlightRange(it);
  if(range&&it.texto){
    it.texto=it.texto.slice(0,range.start)+newText+it.texto.slice(range.end);
  }else{
    it.texto=newText;
  }
  it.palabraResaltada=newText;
  it.equivNote=$('#hlNewNote')?.value||'';
  it.resolved=true;
  it.highlight='none';
  closeHighlightPopover();
  draftInterpret();
  renderInterpretReview();
  toast('Palabra actualizada');
}

function hlActionUnit(i){
  closeHighlightPopover();
  const it=window.pendingItems[i];
  const current=it.uCliente||it.unidadTexto||it.palabraResaltada||'';
  const pop=document.createElement('div');
  pop.id='hlPopover';
  pop.className='hl-popover';
  pop.innerHTML=`
    <div class="hl-pop-field"><label style="font-size:12px;font-weight:800;color:var(--ink-soft)">Unidad escrita por el cliente</label>
      <input id="hlUnitText" value="${esc(current)}" placeholder="Ej.: manojo, bandeja"></div>
    <div class="hl-pop-field"><label style="font-size:12px;font-weight:800;color:var(--ink-soft)">Nota de equivalencia</label>
      <input id="hlUnitNote" value="${esc(it.equivNote||'')}" placeholder='Ej.: "1 manojo ≈ 200 g"'></div>
    <button type="button" onclick="applyHlUnit(${i})">Guardar unidad</button>`;
  document.body.appendChild(pop);
  const el=document.querySelector(`.hl-word[data-i="${i}"]`);
  if(el){
    const r=el.getBoundingClientRect();
    pop.style.left=Math.min(Math.max(8,r.left),window.innerWidth-220)+'px';
    pop.style.top=(r.top-8-pop.offsetHeight)+'px';
  }
}

function applyHlUnit(i){
  const it=window.pendingItems[i];
  const unitText=$('#hlUnitText')?.value?.trim();
  if(!unitText){toast('Escribe la unidad');return;}
  it.uCliente=unitText;
  it.unidadTexto=unitText;
  it.equivNote=$('#hlUnitNote')?.value||'';
  learnVocab({tipo:'unidad',texto_alias:unitText,unidad_original:unitText});
  it.resolved=true;
  it.highlight='none';
  closeHighlightPopover();
  draftInterpret();
  renderInterpretReview();
  toast('Unidad asociada ✅');
}

function hlActionProduct(i){
  closeHighlightPopover();
  const it=window.pendingItems[i];
  const opts=activeProducts().map(p=>`<option value="${p.id}">${p.name}</option>`).join('');
  const alias=it.palabraResaltada||it.nombreDetectado||'';
  const pop=document.createElement('div');
  pop.id='hlPopover';
  pop.className='hl-popover';
  pop.innerHTML=`
    <div class="hl-pop-field"><input id="hlProdSearch" placeholder="🔍 Buscar producto…" oninput="filterHlProd(this.value)"></div>
    <div class="hl-pop-field"><select id="hlProd" size="5" style="height:110px">${opts}</select></div>
    <div class="hl-pop-field"><input id="hlProdNote" value="${esc(it.equivNote||'')}" placeholder="Nota opcional"></div>
    <button type="button" onclick="applyHlProduct(${i})">Asociar producto</button>`;
  document.body.appendChild(pop);
  const el=document.querySelector(`.hl-word[data-i="${i}"]`);
  if(el){
    const r=el.getBoundingClientRect();
    pop.style.left=Math.min(Math.max(8,r.left),window.innerWidth-220)+'px';
    pop.style.top=(r.top-8-pop.offsetHeight)+'px';
  }
  window._hlProdAlias=alias;
}

function filterHlProd(q){
  const sel=$('#hlProd'); if(!sel)return;
  const n=normTxt(q);
  [...sel.options].forEach(o=>{o.hidden=n&&!normTxt(o.text).includes(n);});
}

function applyHlProduct(i){
  const it=window.pendingItems[i];
  const pid=$('#hlProd')?.value;
  if(!pid){toast('Elige un producto');return;}
  it.productId=pid;
  it.productoReconocido=true;
  it.confianza=1;
  it.equivNote=$('#hlProdNote')?.value||'';
  const alias=window._hlProdAlias||it.palabraResaltada||it.nombreDetectado;
  if(alias) learnVocab({tipo:'producto',texto_alias:alias,producto_id:pid});
  it.resolved=true;
  it.highlight='none';
  closeHighlightPopover();
  draftInterpret();
  renderInterpretReview();
  toast('Producto asociado ✅');
}

function allowWord(i){
  closeHighlightPopover();
  const it=window.pendingItems[i];
  const pop=document.createElement('div');
  pop.id='hlPopover';
  pop.className='hl-popover';
  pop.innerHTML=`
    <div class="hl-pop-field"><label style="font-size:12px;font-weight:800;color:var(--ink-soft)">Nota de equivalencia (opcional)</label>
      <input id="eqNote" value="${esc(it.equivNote||'')}" placeholder='Ej.: "Un manojo son 200 gramos"'></div>
    <button type="button" onclick="applyAllowWord(${i})">✅ Permitir</button>`;
  document.body.appendChild(pop);
  const el=document.querySelector(`.hl-word[data-i="${i}"]`);
  if(el){
    const r=el.getBoundingClientRect();
    pop.style.left=Math.min(Math.max(8,r.left),window.innerWidth-220)+'px';
    pop.style.top=(r.top-8-pop.offsetHeight)+'px';
  }
}

function applyAllowWord(i){
  const it=window.pendingItems[i];
  it.allowed=true;
  it.resolved=true;
  it.highlight='none';
  it.equivNote=$('#eqNote')?.value||'';
  if(it.uCliente||it.unidadTexto){
    learnVocab({tipo:'unidad',texto_alias:it.uCliente||it.unidadTexto,unidad_original:it.uCliente||it.unidadTexto});
  }
  closeHighlightPopover();
  draftInterpret();
  renderInterpretReview();
  toast('Palabra permitida ✅');
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
  if(window.transcribingOrderId){
    const o=DB.orders.find(x=>x.id===window.transcribingOrderId);
    if(o){
      o.transcribeDraft=JSON.parse(JSON.stringify(window.pendingItems||[]));
      saveDB();
    }
  }
  flushSave().then(()=>toast('Borrador guardado 💾'));
}

async function startOrderPhotoInterpret(orderId){
  const o=DB.orders.find(x=>x.id===orderId);
  if(!o?.imagenOriginal){toast('Este pedido no tiene foto');return;}
  window.transcribingOrderId=orderId;
  window.manualClientId=o.clientId;
  window.pendingPhotoDataUrl=o.imagenOriginal;
  window.pendingPhotoB64=o.imagenOriginal.includes(',')?o.imagenOriginal.split(',')[1]:null;
  if(o.transcribeDraft?.length){
    window.pendingItems=o.transcribeDraft.map((it,i)=>({...it,_i:i}));
    renderOrderDetailPage(orderId);
    renderInterpretInline('orderTranscribePanel');
    return;
  }
  renderOrderDetailPage(orderId);
  if(window.pendingPhotoB64) await interpretOrder({imageB64:window.pendingPhotoB64,keepPhoto:true},'foto');
  else toast('No hay foto en este pedido');
}

function openManualOrderFromPhoto(o){
  startOrderPhotoInterpret(o.id);
}

/* ---------- Pedido manual admin: texto largo + foto inline ---------- */
function interpretManualText(){
  syncManualOrderContext();
  const text=$('#manText')?.value?.trim();
  if(!text){toast('Pega o escribe el pedido en el cuadro de texto');return;}
  if(!$('#manCli')?.value){toast('Selecciona un cliente primero');return;}
  closeSheet();
  interpretOrder({text},'texto');
}

function manualPhotoPicked(inp){
  const f=inp.files?.[0]; if(!f)return;
  const img=new Image();
  img.onload=()=>{
    const cv=document.createElement('canvas'); const max=1400;
    const sc=Math.min(1,max/Math.max(img.width,img.height));
    cv.width=img.width*sc; cv.height=img.height*sc;
    cv.getContext('2d').drawImage(img,0,0,cv.width,cv.height);
    const dataUrl=cv.toDataURL('image/jpeg',.88);
    window.pendingPhotoDataUrl=dataUrl;
    window.pendingPhotoB64=dataUrl.split(',')[1];
    const prev=$('#manPhotoPreview');
    if(prev) prev.innerHTML=`
      <div class="photo-user-preview pop" style="margin-top:10px">
        <p class="photo-user-lbl">Imagen del pedido · toca para ampliar</p>
        <img src="${dataUrl}" alt="Pedido" class="photo-user-thumb" style="max-height:220px;width:100%;object-fit:contain" onclick="viewPhotoLarge()">
      </div>`;
    const btn=$('#manPhotoAnalyzeBtn');
    if(btn) btn.style.display='block';
  };
  img.src=URL.createObjectURL(f);
}

function interpretManualPhoto(){
  syncManualOrderContext();
  if(!window.pendingPhotoB64){toast('Primero sube o toma una foto');return;}
  if(!$('#manCli')?.value){toast('Selecciona un cliente primero');return;}
  closeSheet();
  interpretOrder({imageB64:window.pendingPhotoB64,keepPhoto:true},'foto');
}

function applyInterpretToManualRows(){
  const items=(window.pendingItems||[]).filter(it=>!it.removed&&it.productId);
  if(!items.length){toast('No hay productos para cargar');return;}
  $('#manRows').innerHTML='';
  items.forEach(it=>{
    manAddRow(it.productId,it.cantidad||1,it.unidadSistema||it.unidad||'kilo');
  });
  toast('Productos cargados en la lista ✅');
}

function fixMatch(i,pid){
  pendingItems[i].productId=pid||null;
  pendingItems[i].productoReconocido=!!pid;
  pendingItems[i].confianza=pid?1:0.2;
  if(pid&&pendingItems[i].highlight==='linea'){pendingItems[i].resolved=true;pendingItems[i].highlight='none';}
  draftInterpret();
  renderInterpretReview();
}

function confirmInterpreted(){
  const items=(window.pendingItems||[]).filter(it=>!it.removed);
  const isAdmin=session?.role==='admin';
  if(isAdmin){
    const unresolved=items.filter(it=>it.highlight!=='none'&&!it.resolved);
    if(unresolved.length){
      toast('Revisa todas las palabras en naranja antes de confirmar');
      return;
    }
  }else{
    items.forEach(it=>{
      if(!it.productId){
        const m=matchProductByName(it.nombreDetectado||it.texto||'');
        if(m.product){
          it.productId=m.product.id;
          it.productoReconocido=true;
          it.confianza=Math.max(it.confianza||0,m.confianza);
        }
      }
    });
  }
  const missing=items.filter(it=>!it.productId);
  if(missing.length){
    if(isAdmin){toast('Hay productos sin identificar — elígelos o elimínalos');return;}
    toast('No pudimos identificar algunos productos. Ajusta el texto o contacta a Olga.');
    return;
  }
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
    const cid=(window.manualOrderRegister||$('#v-manual-order')?.classList.contains('active'))
      ?($('#manCli')?.value||window.manualClientId)
      :window.manualClientId;
    const ch=window.pendingChannel==='voz'?'voz':(window.pendingChannel==='texto'?'texto':'foto');
    submitInterpretedOrder(cid,ch,true);
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
  if(window.transcribingOrderId){
    const o=DB.orders.find(x=>x.id===window.transcribingOrderId);
    if(o){
      const clean=(window.pendingItems||[]).filter(it=>!it.removed).map(it=>({
        ...it,resolved:true,highlight:'none',
      }));
      o.items=items;
      o.photoOnly=false;
      o.transcribeDraft=JSON.parse(JSON.stringify(clean));
      o.transcripcionAplicadaEn=new Date().toISOString();
      audit('Transcribió pedido por foto',`${clientName(o.clientId)} · ${items.length} productos`);
      window.pendingPhotoDataUrl=null;
      window.pendingInterpretItems=null;
      window.pendingItems=null;
      const oid=window.transcribingOrderId;
      window.transcribingOrderId=null;
      closeSheet();
      await flushSave();
      toast('Transcripción guardada en el pedido ✅');
      renderOrderDetailPage(oid);
      return;
    }
  }
  if(window.manualOrderRegister||($('#v-manual-order')?.classList.contains('active')&&fromAdmin)){
    const cid=$('#manCli')?.value||clientId||window.manualClientId;
    if(!cid){toast('Selecciona un cliente');return;}
    const t=nowTime();
    const ch=channel==='texto'?'manual':(channel||'manual');
    DB.orders.unshift({
      id:uid(),clientId:cid,date:todayStr(),time:t,channel:ch,status:'por_confirmar',
      description:$('#manDesc')?.value||'',
      deliveryTime:$('#manDel')?.value||'',
      shift:orderShift(t),items,
      imagenOriginal:window.pendingPhotoDataUrl||null,
    });
    audit('Registró pedido manual (IA)',`${clientName(cid)} · ${items.length} productos · ${ch}`);
    window.pendingPhotoDataUrl=null;
    window.pendingPhotoB64=null;
    window.pendingInterpretItems=null;
    window.pendingItems=null;
    window.manualOrderRegister=false;
    closeSheet();
    await flushSave();
    toast('Pedido registrado ✅');
    if(typeof goBackNav==='function') goBackNav();
    else adminNav('orders');
    return;
  }
  const t=nowTime();
  DB.orders.unshift({
    id:uid(),clientId,date:todayStr(),time:t,channel,status:'por_confirmar',
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
  openPhotoLightbox(o.imagenOriginal);
}
function showOrderPhotoById(id){
  const o=DB.orders.find(x=>x.id===id);
  showOrderPhoto(o);
}
