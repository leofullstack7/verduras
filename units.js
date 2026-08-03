/* Unidades de pedido compartidas (cliente, admin, operarios) */
const UNITS=[
  {id:'kilo',label:'Kilo',short:'kg'},
  {id:'gramo',label:'Gramo',short:'g'},
  {id:'unidad',label:'Unidad',short:'und'},
  {id:'libra',label:'Libra',short:'lb'},
  {id:'cuartilla',label:'Cuartilla',short:'crtl'},
  {id:'valor',label:'Valor $',short:'$'},
];

function fmtUnit(u){
  const m={kilo:'kg',gramo:'g',unidad:'und',libra:'lb',cuartilla:'cuartilla',valor:'$'};
  return m[u]||u||'kg';
}

const CUSTOM_PRODUCT_ID='__libre__';

function fmtMoneyInput(n){
  if(n==null||isNaN(n)||n==='') return '';
  return Number(n).toLocaleString('es-CO');
}

function parsePriceInput(s){
  return parseMoneyQty(s);
}

function comprasProductKey(it){
  const libre=typeof CUSTOM_PRODUCT_ID!=='undefined'?CUSTOM_PRODUCT_ID:'__libre__';
  if(it?.p===libre&&it.nombreLibre) return `${libre}|${it.nombreLibre}`;
  return it?.p||'';
}
function comprasProductDisplay(pidKey){
  const libre=typeof CUSTOM_PRODUCT_ID!=='undefined'?CUSTOM_PRODUCT_ID:'__libre__';
  if(String(pidKey).startsWith(libre+'|')) return {name:pidKey.slice(libre.length+1),emoji:'📝',id:libre};
  return DB.products.find(x=>x.id===pidKey)||{name:'Producto',emoji:'🥬',id:pidKey};
}
function itemProductName(it){
  if(it?.nombreLibre) return it.nombreLibre;
  const p=DB.products.find(x=>x.id===it?.p);
  return p?.name||'Producto';
}
function parseConsolKey(k){
  const parts=k.split('|');
  if(parts[0]==='__libre__'){
    return {pid:'__libre__',nombreLibre:parts[1]||'Producto',u:parts[2]||'kilo',variacion:parts.slice(3).join('|')||''};
  }
  return {pid:parts[0],u:parts[1]||'kilo',variacion:parts.slice(2).join('|')||''};
}

function parseQtyInput(s,u){
  if(u==='valor') return parseMoneyQty(s);
  return parseFloat(String(s).replace(',','.'))||0;
}

function parseMoneyQty(s){
  const t=String(s||'').trim();
  if(!t) return 0;
  if(t.includes(',')&&!t.includes('.')) return parseFloat(t.replace(',','.'))||0;
  return parseFloat(t.replace(/\./g,'').replace(',','.'))||0;
}

function clientUnitSelectHTML(selected,onchange,pid){
  const opts=UNITS.map(u=>{
    const lbl=u.id==='valor'?'Valor $':u.id==='kilo'?'kg':u.id==='gramo'?'g':u.id==='unidad'?'und':u.label;
    return `<option value="${u.id}" ${selected===u.id?'selected':''}>${lbl}</option>`;
  }).join('');
  return `<select class="unit-sel" aria-label="Unidad" onchange="${onchange}">${opts}</select>`;
}

function productVariations(p){
  return (p?.variaciones||p?.variations||[]).filter(Boolean);
}

function variationSelectHTML(pid,current,onchangeFn){
  const p=DB.products.find(x=>x.id===pid);
  const vars=productVariations(p);
  if(!vars.length) return `<input class="var-in" placeholder="Tipo (opcional)" value="${(current||'').replace(/"/g,'&quot;')}" oninput="setCartVariacion('${pid}',this.value)">`;
  const isCustom=current&&!vars.includes(current);
  return `<select class="var-sel" onchange="onCartVarSelect('${pid}',this)">
    <option value="">— Tipo —</option>
    ${vars.map(v=>`<option value="${v.replace(/"/g,'&quot;')}" ${current===v?'selected':''}>${v}</option>`).join('')}
    <option value="__otro__" ${isCustom?'selected':''}>✏️ Otro…</option>
  </select>
  <input class="var-in ${isCustom?'show':''}" id="varIn_${pid}" placeholder="Escribir tipo" value="${isCustom?(current||'').replace(/"/g,'&quot;'):''}" oninput="setCartVariacion('${pid}',this.value)" style="${isCustom?'':'display:none'}">`;
}

function itemQtyLabel(it){
  const u=it.u||'kilo';
  if(u==='valor') return '$'+fmtMoney(it.q||it.valorPedido||0);
  return `${it.q} ${it.uCliente||fmtUnit(u)}`;
}

function itemDisplayLine(it){
  let line=itemQtyLabel(it);
  if(it.variacion) line+=` · ${it.variacion}`;
  if(it.u==='valor'&&it.qKg!=null) line+=` → ${it.qKg} kg`;
  return `${itemProductName(it)}: ${line}`;
}

function clientUnitOptionsHTML(selected,uCliente){
  const isCustom=selected==='__otro__'||(!UNITS.some(u=>u.id===selected)&&uCliente);
  const opts=UNITS.map(u=>{
    const lbl=u.id==='valor'?'Valor $':u.id==='kilo'?'kg':u.id==='gramo'?'g':u.id==='unidad'?'und':u.short;
    return `<option value="${u.id}" ${!isCustom&&selected===u.id?'selected':''}>${lbl}</option>`;
  }).join('');
  return `${opts}<option value="__otro__" ${isCustom?'selected':''}>✏️ Otra unidad…</option>`;
}

function resolveValorToKg(it,pricePerKg){
  if(it.u!=='valor') return it;
  const valor=+it.q||+it.valorPedido||0;
  const price=+pricePerKg;
  if(valor>0&&price>0){
    it.qKg=Math.round((valor/price)*100)/100;
    it.priceUnit='kilo';
    it.valorPedido=valor;
  }
  return it;
}

function effectiveQty(it){
  if(it.u==='valor'&&it.qKg!=null) return it.qKg;
  return +it.q||0;
}

function effectiveUnit(it){
  if(it.u==='valor'&&it.qKg!=null) return 'kilo';
  return it.u||'kilo';
}

function consolItemKey(date,shift,pid,u,variacion){
  return `${date}|${shift}|${pid}|${u||'kilo'}|${variacion||''}`;
}

window.UNITS=UNITS;
