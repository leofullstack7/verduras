/* Extensiones de catálogo: variaciones y productos nuevos */
const CATALOG_VARIATIONS={
  papa:['Lavada','Criolla','Pastusa','La fina'],
  pimenton:['Verde','Amarillo','Rojo'],
  limon:['Tahití','Mandarino','Pajarito'],
  manzana:['Roja','Verde'],
  uva:['Isabela','Red globe'],
  champinones:['Normal','Portobello'],
  pina:['Normal','Calada'],
  naranja:['Tangelo','Valencia'],
  guayaba:['Agria'],
};

const CATALOG_NEW_PRODUCTS=[
  {id:'ahuyama',name:'Ahuyama',categoria:'verdura',unidad_sugerida:'kilo',emoji:'🎃',tint:'#FFF6D9',edge:'#DDA400',active:true,img:'assets/productos/ahuyama.png'},
  {id:'tomate-rinon',name:'Tomate riñón',categoria:'verdura',unidad_sugerida:'kilo',emoji:'🍅',tint:'#E8F8EE',edge:'#1FA84D',active:true,img:'assets/productos/tomate-rinon.png'},
  {id:'repollo-morado',name:'Repollo morado',categoria:'verdura',unidad_sugerida:'unidad',emoji:'🥬',tint:'#E8F8EE',edge:'#1FA84D',active:true,img:'assets/productos/repollo-morado.png'},
  {id:'coco',name:'Coco',categoria:'fruta',unidad_sugerida:'unidad',emoji:'🥥',tint:'#FFF6D9',edge:'#DDA400',active:true,img:'assets/productos/coco.png'},
  {id:'borojo',name:'Borojó',categoria:'fruta',unidad_sugerida:'kilo',emoji:'🫐',tint:'#FFF6D9',edge:'#DDA400',active:true,img:'assets/productos/borojo.png'},
  {id:'cidra',name:'Cidra',categoria:'fruta',unidad_sugerida:'kilo',emoji:'🍈',tint:'#FFF6D9',edge:'#DDA400',active:true,img:'assets/productos/cidra.png'},
  {id:'jengibre',name:'Jengibre',categoria:'verdura',unidad_sugerida:'kilo',emoji:'🫚',tint:'#E8F8EE',edge:'#1FA84D',active:true,img:'assets/productos/jengibre.png'},
  {id:'rabano',name:'Rábano',categoria:'verdura',unidad_sugerida:'kilo',emoji:'🌱',tint:'#E8F8EE',edge:'#1FA84D',active:true,img:'assets/productos/rabano.png'},
  {id:'uchuva',name:'Uchuva',categoria:'fruta',unidad_sugerida:'kilo',emoji:'🟡',tint:'#FFF6D9',edge:'#DDA400',active:true,img:'assets/productos/uchuva.png'},
  {id:'arandano',name:'Arándano',categoria:'fruta',unidad_sugerida:'kilo',emoji:'🫐',tint:'#FFF6D9',edge:'#DDA400',active:true,img:'assets/productos/arandano.png'},
  {id:'agrass',name:'Agraz',categoria:'fruta',unidad_sugerida:'kilo',emoji:'🫐',tint:'#FFF6D9',edge:'#DDA400',active:true,img:'assets/productos/agraz.png'},
  {id:'zuchinni',name:'Zuchinni',categoria:'verdura',unidad_sugerida:'kilo',emoji:'🥒',tint:'#E8F8EE',edge:'#1FA84D',active:true,img:'assets/productos/zuchinni.png'},
  {id:'melocoton',name:'Melocotón',categoria:'fruta',unidad_sugerida:'kilo',emoji:'🍑',tint:'#FFF6D9',edge:'#DDA400',active:true,img:'assets/productos/melocoton.png'},
];

function applyCatalogExtensions(){
  if(!DB?.products) return;
  DB.products.forEach(p=>{
    if(CATALOG_VARIATIONS[p.id]&&!p.variaciones?.length) p.variaciones=CATALOG_VARIATIONS[p.id];
    if(!p.variaciones) p.variaciones=[];
  });
  CATALOG_NEW_PRODUCTS.forEach(np=>{
    let p=DB.products.find(x=>x.id===np.id);
    if(!p){
      DB.products.push({...np,variaciones:CATALOG_VARIATIONS[np.id]||[]});
    }else{
      Object.assign(p,np);
      if(CATALOG_VARIATIONS[np.id]) p.variaciones=CATALOG_VARIATIONS[np.id];
    }
  });
  if(CATALOG_VARIATIONS.repollo){
    const rep=DB.products.find(x=>x.id==='repollo');
    if(rep&&!rep.variaciones?.includes('Morado')) rep.variaciones=[...(rep.variaciones||[]),'Blanco','Morado'];
  }
}

window.applyCatalogExtensions=applyCatalogExtensions;
