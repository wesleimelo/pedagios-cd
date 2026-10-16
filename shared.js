"use strict";
/* =====================================================================
   Pedágios CD · código compartilhado (portal do prestador e painel)
   ===================================================================== */

/* ---------- utilidades ---------- */
const $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>[...r.querySelectorAll(s)];
const uid=()=>(crypto.randomUUID?crypto.randomUUID():Date.now().toString(36)+Math.random().toString(36).slice(2,9));
const MONTHS=['JANEIRO','FEVEREIRO','MARÇO','ABRIL','MAIO','JUNHO','JULHO','AGOSTO','SETEMBRO','OUTUBRO','NOVEMBRO','DEZEMBRO'];
const cap=s=>s.charAt(0)+s.slice(1).toLowerCase();
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function fmt(c){const neg=c<0;c=Math.abs(Math.round(c));const r=String(c%100).padStart(2,'0');const i=String(Math.floor(c/100)).replace(/\B(?=(\d{3})+(?!\d))/g,'.');return (neg?'-':'')+i+','+r}
const brl=c=>'R$ '+fmt(c);
function parseMoney(s){s=String(s||'').replace(/R\$|\s/g,'');if(!s)return 0;if(s.includes(','))s=s.replace(/\./g,'').replace(',','.');const n=parseFloat(s);return isNaN(n)?0:Math.round(n*100)}
const fdate=d=>{const [y,m,dd]=d.split('-');return `${dd}/${m}/${y}`};
const fshort=d=>{const [,m,dd]=d.split('-');return `${dd}/${m}`};
const normPlate=s=>String(s||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
const plain=s=>String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase();
function normTime(s){s=String(s||'').trim();const d=s.replace(/\D/g,'');if(/^\d{3,4}$/.test(d)&&!s.includes(':')){const x=d.padStart(4,'0');return x.slice(0,2)+':'+x.slice(2)}return s}
function todayStr(){const n=new Date();return n.getFullYear()+'-'+String(n.getMonth()+1).padStart(2,'0')+'-'+String(n.getDate()).padStart(2,'0')}
const monthOf=d=>d.slice(0,7);
const monthLabel=m=>{const [y,mm]=m.split('-');return `${cap(MONTHS[+mm-1])}/${y}`};
const nextMonth=m=>{let [y,mm]=m.split('-').map(Number);mm++;if(mm>12){mm=1;y++}return y+'-'+String(mm).padStart(2,'0')};

function ensureUI(){
  if($('#toast'))return;
  document.body.insertAdjacentHTML('beforeend',`<div class="toast" id="toast" role="status"></div>
  <dialog id="cfm" style="max-width:440px"><div style="padding:18px"><p id="cfmMsg" style="margin:0 0 16px"></p>
  <div class="inline" style="justify-content:flex-end"><button class="btn" id="cfmNo">Cancelar</button><button class="btn primary" id="cfmOk">OK</button></div></div></dialog>`);
}
function toast(t){ensureUI();const el=$('#toast');el.textContent=t;el.classList.add('show');clearTimeout(toast.t);toast.t=setTimeout(()=>el.classList.remove('show'),3000)}
function ask(msg,ok='Confirmar',danger=false){ensureUI();return new Promise(res=>{const d=$('#cfm');$('#cfmMsg').textContent=msg;const b=$('#cfmOk');b.textContent=ok;b.className='btn '+(danger?'danger':'primary');const done=v=>{d.close();res(v)};b.onclick=()=>done(true);$('#cfmNo').onclick=()=>done(false);d.oncancel=()=>res(false);d.showModal()})}
async function copyText(t){try{await navigator.clipboard.writeText(t);toast('Copiado');return}catch(e){}
  const ta=document.createElement('textarea');ta.value=t;document.body.appendChild(ta);ta.select();let ok=false;try{ok=document.execCommand('copy')}catch(e){}ta.remove();toast(ok?'Copiado':'Não foi possível copiar: selecione o texto e use Ctrl+C')}
function download(blob,name){const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},1500)}
const errText=e=>{const m=String(e?.message||e||'');if(/Invalid login/i.test(m))return 'Usuário ou senha incorretos.';if(/fetch|network/i.test(m))return 'Sem conexão. Tente de novo.';return m||'Algo deu errado.'};

/* ---------- API (Supabase) ---------- */
function makeSupabaseAPI(){
  const C=window.CONFIG||{};
  const sb=window.supabase.createClient(C.SUPABASE_URL,C.SUPABASE_ANON_KEY,{auth:{persistSession:true,autoRefreshToken:true}});
  const ok=({data,error})=>{if(error)throw error;return data};
  const normTrip=r=>({id:r.id,plate:r.plate,date:r.trip_date,region:r.region,mode:r.mode,total:r.total_cents||0,status:r.status,note:r.note||'',adminNote:r.admin_note||'',createdAt:r.created_at,
    passages:[...(r.ped_passages||[])].sort((a,b)=>a.pos-b.pos).map(p=>({dir:p.dir,plaza:p.plaza,time:p.time||'',value:p.value_cents})),
    receipts:(r.ped_receipts||[]).map(x=>({id:x.id,path:x.path,name:x.name}))});
  return {
    async signIn(user,pass){
      const email=String(user).trim().toLowerCase().replace(/\s+/g,'')+'@'+C.EMAIL_DOMAIN;
      const {error}=await sb.auth.signInWithPassword({email,password:pass});if(error)throw error;return this.me();
    },
    async me(){
      const {data:{session}}=await sb.auth.getSession();if(!session)return null;
      const p=ok(await sb.from('ped_profiles').select('*').eq('user_id',session.user.id).maybeSingle());
      return p?{id:session.user.id,role:p.role,name:p.name,cnpj:p.cnpj||''}:{id:session.user.id,role:null,name:''};
    },
    async signOut(){await sb.auth.signOut()},
    async vehicles(){
      const d=ok(await sb.from('ped_vehicles').select('plate,kind,active,sort,prestador_id,prestador:ped_profiles(name,cnpj)').order('sort').order('plate'));
      return d.map(v=>({plate:v.plate,kind:v.kind,active:v.active,sort:v.sort,prestadorId:v.prestador_id,prestador:v.prestador?.name||'',cnpj:v.prestador?.cnpj||''}));
    },
    async regions(){
      const d=ok(await sb.from('ped_regions').select('id,name,sort,ped_region_plazas(dir,plaza,pos)').order('sort').order('name'));
      return d.map(r=>{const ps=[...(r.ped_region_plazas||[])].sort((a,b)=>a.pos-b.pos);return {id:r.id,name:r.name,ida:ps.filter(p=>p.dir==='Ida').map(p=>p.plaza),volta:ps.filter(p=>p.dir==='Volta').map(p=>p.plaza)}});
    },
    async trips(month){
      const d=ok(await sb.from('ped_trips').select('*,ped_passages(*),ped_receipts(*)').gte('trip_date',month+'-01').lt('trip_date',nextMonth(month)+'-01').order('trip_date').order('created_at'));
      return d.map(normTrip);
    },
    async saveTrip(t,newFiles=[],removedIds=[]){
      const base={plate:t.plate,trip_date:t.date,region:t.region,mode:t.mode,total_cents:t.total||0,note:t.note||null,status:t.status};
      if(t.status==='enviado')base.admin_note=null;
      let id=t.id;
      if(id){ok(await sb.from('ped_trips').update(base).eq('id',id))}
      else{id=ok(await sb.from('ped_trips').insert(base).select('id').single()).id}
      ok(await sb.from('ped_passages').delete().eq('trip_id',id));
      if(t.mode==='detail'&&t.passages.length)ok(await sb.from('ped_passages').insert(t.passages.map((p,i)=>({trip_id:id,dir:p.dir,plaza:p.plaza,time:p.time||null,value_cents:p.value,pos:i}))));
      if(removedIds.length){
        const rs=ok(await sb.from('ped_receipts').select('id,path').in('id',removedIds));
        if(rs.length)await sb.storage.from('comprovantes').remove(rs.map(r=>r.path));
        ok(await sb.from('ped_receipts').delete().in('id',removedIds));
      }
      for(const f of newFiles){
        const path=`${id}/${uid()}.jpg`;
        const up=await sb.storage.from('comprovantes').upload(path,f,{contentType:'image/jpeg',upsert:false});if(up.error)throw up.error;
        ok(await sb.from('ped_receipts').insert({trip_id:id,path,name:f.name||'comprovante.jpg'}));
      }
      return id;
    },
    async setStatus(id,status,adminNote){
      const patch={status,admin_note:adminNote||null,confirmed_at:status==='confirmado'?new Date().toISOString():null};
      ok(await sb.from('ped_trips').update(patch).eq('id',id));
    },
    async deleteTrip(id){
      const rs=ok(await sb.from('ped_receipts').select('path').eq('trip_id',id));
      if(rs.length)await sb.storage.from('comprovantes').remove(rs.map(r=>r.path));
      ok(await sb.from('ped_trips').delete().eq('id',id));
    },
    async receiptURL(path){const r=await sb.storage.from('comprovantes').createSignedUrl(path,3600);if(r.error)throw r.error;return r.data.signedUrl},
    async receiptBlob(path){const r=await sb.storage.from('comprovantes').download(path);if(r.error)throw r.error;return r.data},
    /* painel */
    async settings(){const d=ok(await sb.from('ped_settings').select('key,value'));const o={};d.forEach(r=>o[r.key]=r.value);return o},
    async setSetting(key,value){ok(await sb.from('ped_settings').upsert({key,value}))},
    async prestadores(){const d=ok(await sb.from('ped_profiles').select('*').eq('role','prestador').order('name'));return d.map(p=>({id:p.user_id,name:p.name,cnpj:p.cnpj||''}))},
    async savePrestador(p){ok(await sb.from('ped_profiles').update({name:p.name,cnpj:p.cnpj||null}).eq('user_id',p.id))},
    async saveVehicles(list){
      const rows=list.map((v,i)=>({plate:v.plate,kind:v.kind,prestador_id:v.prestadorId||null,active:v.active!==false,sort:i+1}));
      if(rows.length)ok(await sb.from('ped_vehicles').upsert(rows));
    },
    async saveRegions(list){
      ok(await sb.from('ped_regions').delete().neq('id',-1));
      for(let i=0;i<list.length;i++){
        const r=list[i];
        const row=ok(await sb.from('ped_regions').insert({name:r.name,sort:i+1}).select('id').single());
        const ps=[...r.ida.map(p=>({dir:'Ida',plaza:p})),...r.volta.map(p=>({dir:'Volta',plaza:p}))].map((p,k)=>({region_id:row.id,dir:p.dir,plaza:p.plaza,pos:k+1}));
        if(ps.length)ok(await sb.from('ped_region_plazas').insert(ps));
      }
    }
  };
}
const API=window.__API_OVERRIDE||(window.supabase?makeSupabaseAPI():null);

/* ---------- regiões em texto ([Região] / Ida: / Volta:) ---------- */
function regionsToText(rs){return rs.map(r=>['['+r.name+']',...r.ida.map(p=>'Ida: '+p),...r.volta.map(p=>'Volta: '+p)].join('\n')).join('\n\n')}
function textToRegions(txt){const out=[];let cur=null;for(const raw of String(txt||'').split('\n')){const l=raw.trim();if(!l)continue;let m=l.match(/^\[(.+)\]$/);if(m){cur={name:m[1].trim(),ida:[],volta:[]};out.push(cur);continue}m=l.match(/^(ida|volta)\s*:\s*(.+)$/i);if(m&&cur)cur[m[1].toLowerCase()].push(m[2].trim())}return out}

/* ---------- imagens ---------- */
async function shrink(file,max=2000){
  const url=URL.createObjectURL(file);
  try{
    const im=new Image();im.src=url;await im.decode();
    const k=Math.min(1,max/Math.max(im.naturalWidth,im.naturalHeight));
    const c=document.createElement('canvas');c.width=Math.round(im.naturalWidth*k);c.height=Math.round(im.naturalHeight*k);
    const g=c.getContext('2d');g.fillStyle='#fff';g.fillRect(0,0,c.width,c.height);g.drawImage(im,0,0,c.width,c.height);
    const blob=await new Promise(r=>c.toBlob(r,'image/jpeg',.86));
    blob.name=(file.name||'comprovante').replace(/\.[^.]+$/,'')+'.jpg';
    return blob;
  }finally{URL.revokeObjectURL(url)}
}

/* ---------- formulário de viagem ---------- */
/* o.vehicles, o.regions, o.trip (opcional), o.isAdmin, o.onSave(result), o.onCancel, o.saveLabel, o.extra (html dos botões extras) */
function mountTripForm(el,o){
  const vehicles=o.vehicles.filter(v=>v.active!==false||(o.trip&&o.trip.plate===v.plate)),regions=o.regions,t=o.trip;
  const S={id:t?.id||null,plate:t?.plate||(vehicles.length===1?vehicles[0].plate:''),date:t?.date||todayStr(),region:'',custom:'',mode:t?.mode||'detail',
    totalTxt:t&&t.total?fmt(t.total):'',note:t?.note||'',
    passages:t?.passages?.length?t.passages.map(p=>({dir:p.dir,plaza:p.plaza,time:p.time,valueTxt:fmt(p.value)})):[],
    receipts:[...(t?.receipts||[])],newFiles:[],removed:[],status:t?.status||'enviado'};
  if(t){if(regions.some(r=>r.name===t.region))S.region=t.region;else{S.region='__outro';S.custom=t.region}}
  const regionObj=()=>regions.find(r=>r.name===S.region);
  const hasValues=()=>S.passages.some(p=>p.valueTxt.trim())||S.totalTxt.trim();

  el.innerHTML=`<div class="tf">
    <div class="two">
      <div class="field"><label for="tfPlate">Placa</label><select id="tfPlate" data-f="plate"><option value="">Escolha…</option>${vehicles.map(v=>`<option value="${esc(v.plate)}">${esc(v.kind)} ${esc(v.plate)}</option>`).join('')}</select></div>
      <div class="field"><label for="tfDate">Data da viagem</label><input type="date" id="tfDate" data-f="date" ${o.isAdmin?'':`max="${todayStr()}"`}></div>
      <div class="field"><label for="tfRegion">Região / destino</label><select id="tfRegion" data-f="region"><option value="">Escolha…</option>${regions.map(r=>`<option value="${esc(r.name)}">${esc(r.name)}</option>`).join('')}<option value="__outro">Outro destino…</option></select></div>
    </div>
    <div class="field" id="tfOther" hidden><label for="tfCustom">Nome do destino</label><input type="text" id="tfCustom" data-f="custom" placeholder="Ex.: Marechal Cândido Rondon"></div>
    <div class="field"><label>Como informar os valores</label>
      <div class="seg"><label><input type="radio" name="tfMode" value="detail"><span>Por passagem</span></label><label><input type="radio" name="tfMode" value="total"><span>Valor total da viagem</span></label></div></div>
    <div id="tfDetail">
      <div class="field"><label>Passagens (praça · hora · valor)</label><div id="tfRows"></div></div>
      <div class="inline"><button class="btn sm" type="button" data-a="add">+ passagem</button><button class="btn sm" type="button" data-a="fill">Preencher praças da região</button></div>
    </div>
    <div id="tfTotal" hidden><div class="field"><label for="tfTotalIn">Valor total (R$)</label><input type="text" id="tfTotalIn" data-f="totalTxt" inputmode="decimal" placeholder="0,00" style="max-width:180px"></div></div>
    <div class="live-total">Total: <span id="tfLive">R$ 0,00</span></div>
    <div class="field"><label>Comprovantes (prints ou fotos)</label>
      <div class="strip" id="tfFiles"></div>
      <div class="drop" id="tfDrop"><span class="muted">Toque para escolher, arraste ou cole (Ctrl+V) os prints</span><label class="btn">Escolher imagens<input type="file" id="tfFile" accept="image/*" multiple hidden></label></div></div>
    <div class="field"><label for="tfNote">Observação (opcional)</label><input type="text" id="tfNote" data-f="note" placeholder="Ex.: comprovante molhado, mas legível"></div>
    <div class="err" id="tfErr" role="alert"></div>
  </div>`;
  const q=s=>$(s,el);
  q('#tfPlate').value=S.plate;q('#tfDate').value=S.date;q('#tfRegion').value=S.region;q('#tfCustom').value=S.custom;q('#tfTotalIn').value=S.totalTxt;q('#tfNote').value=S.note;

  function drawModes(){
    $$('input[name=tfMode]',el).forEach(r=>r.checked=r.value===S.mode);
    q('#tfDetail').hidden=S.mode!=='detail';q('#tfTotal').hidden=S.mode==='detail';q('#tfOther').hidden=S.region!=='__outro';
  }
  function drawRows(){
    q('#tfRows').innerHTML=S.passages.length?S.passages.map((p,i)=>`<div class="prow" data-i="${i}">
      <select data-k="dir" aria-label="Ida ou volta"><option${p.dir==='Ida'?' selected':''}>Ida</option><option${p.dir==='Volta'?' selected':''}>Volta</option></select>
      <input type="text" data-k="plaza" value="${esc(p.plaza)}" placeholder="Praça / base" aria-label="Praça">
      <input type="text" data-k="time" value="${esc(p.time)}" placeholder="hh:mm" inputmode="numeric" aria-label="Hora">
      <input type="text" data-k="valueTxt" value="${esc(p.valueTxt)}" placeholder="0,00" inputmode="decimal" aria-label="Valor">
      <button class="btn sm danger" type="button" data-a="del" data-i="${i}" aria-label="Remover passagem">✕</button></div>`).join(''):`<p class="hint">Escolha a região para as praças aparecerem, ou use “+ passagem”.</p>`;
  }
  async function drawFiles(){
    const th=[];
    for(const r of S.receipts)th.push(`<div class="mini"><img data-path="${esc(r.path)}" alt="comprovante"><button type="button" data-a="rm-old" data-id="${esc(r.id)}" aria-label="Remover comprovante">✕</button></div>`);
    S.newFiles.forEach((f,i)=>th.push(`<div class="mini"><img src="${f.url}" alt="novo comprovante"><button type="button" data-a="rm-new" data-i="${i}" aria-label="Remover comprovante">✕</button></div>`));
    q('#tfFiles').innerHTML=th.join('');
    for(const img of $$('img[data-path]',el)){API.receiptURL(img.dataset.path).then(u=>img.src=u).catch(()=>{})}
  }
  function live(){const tot=S.mode==='total'?parseMoney(S.totalTxt):S.passages.reduce((s,p)=>s+parseMoney(p.valueTxt),0);q('#tfLive').textContent=brl(tot)}
  function fillRegion(force){
    const r=regionObj();
    if(!r||!(r.ida.length||r.volta.length)){if(S.region&&!hasValues())S.mode='total';drawModes();drawRows();live();return}
    if(!force&&hasValues()){drawModes();return}
    S.mode='detail';S.passages=[...r.ida.map(p=>({dir:'Ida',plaza:p,time:'',valueTxt:''})),...r.volta.map(p=>({dir:'Volta',plaza:p,time:'',valueTxt:''}))];
    drawModes();drawRows();live();
    const first=$$('#tfRows input[data-k=valueTxt]',el)[0];if(first&&!t)first.focus();
  }
  function addFiles(files){
    const imgs=[...files].filter(f=>f.type.startsWith('image/'));if(!imgs.length){toast('Escolha imagens (PNG ou JPG).');return}
    for(const f of imgs)S.newFiles.push({file:f,url:URL.createObjectURL(f)});drawFiles();
  }

  el.addEventListener('input',e=>{
    const x=e.target;
    if(x.dataset.f&&x.dataset.f!=='region'&&x.dataset.f!=='plate'){S[x.dataset.f]=x.value;if(x.dataset.f==='totalTxt')live();return}
    if(x.name==='tfMode'){S.mode=x.value;drawModes();live();return}
    const row=x.closest('.prow');if(row&&x.dataset.k){S.passages[+row.dataset.i][x.dataset.k]=x.value;live()}
  });
  el.addEventListener('change',e=>{
    const x=e.target;
    if(x.dataset.f==='plate'){S.plate=x.value;return}
    if(x.dataset.f==='region'){S.region=x.value;drawModes();if(S.region==='__outro'){if(!hasValues())S.mode='total';drawModes();live()}else fillRegion(false);return}
    if(x.dataset.f==='date'){S.date=x.value;return}
    if(x.id==='tfFile'){addFiles(x.files);x.value='';return}
    const row=x.closest('.prow');if(!row)return;const p=S.passages[+row.dataset.i];
    if(x.dataset.k==='time'){x.value=p.time=normTime(x.value)}
    if(x.dataset.k==='valueTxt'&&x.value){x.value=p.valueTxt=fmt(parseMoney(x.value));live()}
  });
  el.addEventListener('keydown',e=>{
    if(e.key==='Enter'&&e.target.dataset.k==='valueTxt'){e.preventDefault();const i=+e.target.closest('.prow').dataset.i;
      const rows=$$('#tfRows .prow',el);
      if(i<rows.length-1)$('[data-k=valueTxt]',rows[i+1]).focus();
    }
  });
  el.addEventListener('click',e=>{
    const a=e.target.closest('[data-a]');if(!a)return;
    switch(a.dataset.a){
      case 'add':{const l=S.passages.at(-1);S.passages.push({dir:l?l.dir:'Ida',plaza:'',time:'',valueTxt:''});S.mode='detail';drawModes();drawRows();$$('#tfRows .prow',el).at(-1).querySelector('[data-k=plaza]').focus()}break;
      case 'del':S.passages.splice(+a.dataset.i,1);drawRows();live();break;
      case 'fill':if(!regionObj()){toast('Escolha primeiro uma região cadastrada.');break}fillRegion(true);break;
      case 'rm-old':S.removed.push(a.dataset.id);S.receipts=S.receipts.filter(r=>r.id!==a.dataset.id);drawFiles();break;
      case 'rm-new':URL.revokeObjectURL(S.newFiles[+a.dataset.i].url);S.newFiles.splice(+a.dataset.i,1);drawFiles();break;
    }
  });
  const drop=q('#tfDrop');
  ['dragover','dragenter'].forEach(ev=>drop.addEventListener(ev,e=>{e.preventDefault();drop.classList.add('over')}));
  ['dragleave','drop'].forEach(ev=>drop.addEventListener(ev,e=>{e.preventDefault();drop.classList.remove('over')}));
  drop.addEventListener('drop',e=>{if(e.dataTransfer?.files?.length)addFiles(e.dataTransfer.files)});
  const pasteH=e=>{const f=[...(e.clipboardData?.files||[])];if(f.length&&el.isConnected){e.preventDefault();addFiles(f)}};
  document.addEventListener('paste',pasteH);

  drawModes();drawRows();drawFiles();live();

  const ctl={
    setError(m){q('#tfErr').textContent=m||''},
    receiptsCount:()=>S.receipts.length+S.newFiles.length,
    /* valida e devolve {trip,newFiles,removed} ou null */
    async collect(){
      const err=m=>{ctl.setError(m);return null};
      if(!S.plate)return err('Escolha a placa.');
      if(!S.date)return err('Informe a data.');
      if(!o.isAdmin&&S.date>todayStr())return err('A data não pode ser futura.');
      const region=S.region==='__outro'?S.custom.trim():S.region;
      if(!region)return err('Escolha a região ou informe o destino.');
      let passages=[],total=0;
      if(S.mode==='detail'){
        const rows=S.passages.filter(p=>p.plaza.trim()||p.valueTxt.trim()||p.time.trim());
        for(const p of rows){if(!p.plaza.trim())return err('Toda passagem precisa da praça.');if(parseMoney(p.valueTxt)<=0)return err('Preencha o valor de “'+p.plaza.trim()+'” ou remova a linha.')}
        if(!rows.length)return err('Informe ao menos uma passagem.');
        passages=rows.map(p=>({dir:p.dir,plaza:p.plaza.trim(),time:normTime(p.time),value:parseMoney(p.valueTxt)}));
      }else{total=parseMoney(S.totalTxt);if(total<=0)return err('Informe o valor total da viagem.')}
      if(!o.isAdmin&&!S.receipts.length&&!S.newFiles.length)return err('Anexe ao menos um comprovante.');
      ctl.setError('');
      const files=[];for(const f of S.newFiles){try{files.push(await shrink(f.file))}catch(e){return err('Não consegui ler uma das imagens. Tente outra.')}}
      return {trip:{id:S.id,plate:S.plate,date:S.date,region,mode:S.mode,total,passages,note:S.note.trim(),status:S.status},newFiles:files,removed:S.removed};
    },
    destroy(){document.removeEventListener('paste',pasteH);S.newFiles.forEach(f=>URL.revokeObjectURL(f.url))}
  };
  return ctl;
}

/* ---------- regras de conferência, mensagem e PDF ---------- */
const tripTotal=t=>t.mode==='total'?(t.total||0):t.passages.reduce((s,p)=>s+(p.value||0),0);
function vehicleName(vehicles,plate){const v=vehicles.find(x=>x.plate===plate);return (v?v.kind+' ':'')+plate}
function platesOrder(vehicles,trips){const have=new Set(trips.map(t=>t.plate));const o=vehicles.map(v=>v.plate).filter(p=>have.has(p));for(const p of have)if(!o.includes(p))o.push(p);return o}

function conferir(trips,vehicles){
  const W=[],seen=new Map();
  for(const t of trips){
    const id=t.id,tag=`${fshort(t.date)} · ${vehicleName(vehicles,t.plate)} · ${t.region}`;
    if(t.status==='enviado')W.push({lvl:'warn',id,text:`${tag}: aguardando sua confirmação.`});
    if(t.status==='devolvido')W.push({lvl:'info',id,text:`${tag}: devolvido ao prestador${t.adminNote?' ('+t.adminNote+')':''}.`});
    if(!t.receipts.length)W.push({lvl:'warn',id,text:`${tag}: sem comprovante anexado.`});
    if(tripTotal(t)<=0)W.push({lvl:'warn',id,text:`${tag}: sem valor.`});
    if(t.note)W.push({lvl:'info',id,text:`${tag}: observação do prestador: ${t.note}`});
    if(t.mode==='detail'){
      const i=t.passages.filter(p=>p.dir==='Ida').length,v=t.passages.filter(p=>p.dir==='Volta').length;
      if(i!==v)W.push({lvl:'warn',id,text:`${tag}: ${i} passagem(ns) de ida e ${v} de volta. Falta alguma?`});
      for(const p of t.passages){const k=[t.plate,t.date,p.plaza,p.time].join('|');if(p.time&&seen.has(k))W.push({lvl:'warn',id,text:`${tag}: passagem repetida (${p.plaza}, ${p.time}).`});seen.set(k,1)}
    }
  }
  const by={};for(const t of trips)(by[t.plate+t.date]??=[]).push(t);
  for(const k in by)if(by[k].length>1){const t=by[k][0];W.push({lvl:'info',id:t.id,text:`${fshort(t.date)} · ${vehicleName(vehicles,t.plate)}: mais de uma viagem no mesmo dia.`})}
  return W;
}

function buildMessage({month,trips,vehicles,intro,recipients,obs}){
  const L=[],SEP='────────────────────────';
  const [y,mm]=month.split('-'),tag=`${MONTHS[+mm-1]}/${y}`;
  L.push('Olá, tudo bem?','');
  L.push(intro,'');
  if((obs||'').trim())L.push('Obs: '+obs.trim(),'');
  const seenP=new Set();
  for(const v of vehicles){
    if(!v.prestador||seenP.has(v.prestador))continue;seenP.add(v.prestador);
    const pl=vehicles.filter(x=>x.prestador===v.prestador).map(x=>x.plate).join('/');
    L.push('Prestador - '+v.prestador,'CNPJ - '+(v.cnpj||''),'PLACAS: '+pl,'');
  }
  let grand=0;const plates=platesOrder(vehicles,trips);
  for(const pl of plates){
    L.push(`${vehicleName(vehicles,pl)}  — ${tag}`,'');
    let sub=0;
    for(const t of trips.filter(t=>t.plate===pl)){
      const tot=tripTotal(t);sub+=tot;
      if(t.mode==='total'){L.push(`${fdate(t.date)} — ${t.region} — ${brl(tot)}`,'');continue}
      L.push(`${fdate(t.date)} — ${t.region}`);
      for(const dir of ['Ida','Volta']){
        const ps=t.passages.filter(p=>p.dir===dir);if(!ps.length)continue;
        if(ps.length>1&&ps.every(p=>p.time))ps.sort((a,b)=>a.time.localeCompare(b.time));
        L.push(dir+':');
        for(const p of ps)L.push(`    ${p.plaza}${p.time?', '+p.time:''} — ${brl(p.value)}`);
      }
      L.push(`Total: ${brl(tot)}`,'');
    }
    grand+=sub;
    L.push(`Total geral ${vehicleName(vehicles,pl)}: ${brl(sub)}`,SEP,'');
  }
  L.push(plates.length===1?`Total geral da placa: ${brl(grand)}`:`Total geral das ${plates.length} placas: ${brl(grand)}`);
  return L.join('\n');
}

async function blobToJpeg(blob,max=1800){
  const url=URL.createObjectURL(blob);
  try{
    const im=new Image();im.src=url;await im.decode();
    const k=Math.min(1,max/Math.max(im.naturalWidth,im.naturalHeight));
    const c=document.createElement('canvas');c.width=Math.round(im.naturalWidth*k);c.height=Math.round(im.naturalHeight*k);
    const g=c.getContext('2d');g.fillStyle='#fff';g.fillRect(0,0,c.width,c.height);g.drawImage(im,0,0,c.width,c.height);
    return {url:c.toDataURL('image/jpeg',.88),w:c.width,h:c.height};
  }finally{URL.revokeObjectURL(url)}
}
async function makePdf({month,trips,vehicles,plates,onProgress}){
  if(!window.jspdf)throw new Error('A biblioteca de PDF não carregou. Recarregue a página.');
  const list=[];
  for(const pl of plates)for(const t of trips.filter(t=>t.plate===pl))t.receipts.forEach((r,i)=>list.push({pl,t,r,i,n:t.receipts.length}));
  if(!list.length)return null;
  const {jsPDF}=window.jspdf,doc=new jsPDF({unit:'mm',format:'a4'});
  const W=210,H=297,mx=10,top=24,bw=W-2*mx,bh=H-top-10,asc=s=>String(s).replace(/—/g,'-');
  let first=true,n=0;
  for(const it of list){
    onProgress&&onProgress(++n,list.length);
    let im;try{im=await blobToJpeg(await API.receiptBlob(it.r.path))}catch(e){continue}
    if(!first)doc.addPage();first=false;
    doc.setFont('helvetica','bold');doc.setFontSize(13);
    doc.text(asc(`${vehicleName(vehicles,it.pl)} - ${fdate(it.t.date)} - ${it.t.region}`),mx,12);
    doc.setFont('helvetica','normal');doc.setFontSize(9);doc.setTextColor(100);
    doc.text(asc(`Total da viagem: ${brl(tripTotal(it.t))}   |   comprovante ${it.i+1} de ${it.n}   |   ${monthLabel(month)}`),mx,18);
    doc.setTextColor(0);
    const k=Math.min(bw/im.w,bh/im.h),w=im.w*k,h=im.h*k;
    doc.addImage(im.url,'JPEG',mx+(bw-w)/2,top,w,h);
  }
  const [y,mm]=month.split('-');
  const name=plates.length===1?`Comprovantes_${plates[0]}_${MONTHS[+mm-1]}_${y}.pdf`:`Comprovantes_Pedagios_${MONTHS[+mm-1]}_${y}.pdf`;
  return {blob:doc.output('blob'),name};
}

/* ---------- seletor de mês ---------- */
function mountMonthPicker(selMonth,selYear,get,set){
  selMonth.innerHTML=MONTHS.map((n,i)=>`<option value="${i+1}">${cap(n)}</option>`).join('');
  const sync=()=>{const [y,m]=get().split('-');selMonth.value=String(+m);selYear.value=y};
  const on=()=>{set(`${selYear.value||new Date().getFullYear()}-${String(selMonth.value).padStart(2,'0')}`)};
  selMonth.addEventListener('change',on);selYear.addEventListener('change',on);sync();return sync;
}
const STATUS={enviado:['A confirmar',''],confirmado:['Confirmado','ok'],devolvido:['Devolvido','bad']};
const pillOf=s=>`<span class="pill ${STATUS[s][1]}">${STATUS[s][0]}</span>`;
function loginView(host,onLogin,title){
  host.innerHTML=`<div class="card pad narrow"><h2 style="margin-top:0">${esc(title||'Entrar')}</h2>
    <form id="lgForm"><div class="field"><label for="lgUser">Usuário</label><input type="text" id="lgUser" autocomplete="username" autocapitalize="none" required></div>
    <div class="field"><label for="lgPass">Senha</label><input type="password" id="lgPass" autocomplete="current-password" required></div>
    <div class="err" id="lgErr" role="alert"></div><button class="btn primary" style="width:100%" id="lgBtn">Entrar</button></form></div>`;
  $('#lgForm').addEventListener('submit',async e=>{
    e.preventDefault();const b=$('#lgBtn');b.disabled=true;b.textContent='Entrando…';$('#lgErr').textContent='';
    try{await onLogin($('#lgUser').value,$('#lgPass').value)}catch(er){$('#lgErr').textContent=errText(er);b.disabled=false;b.textContent='Entrar'}
  });
}
