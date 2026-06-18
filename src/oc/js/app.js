window._isAdmin=false;
var defaultOC=[
  {id:3,name:'박설',nameSub:'Park Seol',role:'착호갑사',category:'TRPG',subcat:'시나리오 1',faction:'',stars:4,tag:'seol',img:'',imgFit:'contain',imgPos:'center top',desc:'조선 시대 착호갑사.',profile:[{k:'직업',v:'착호갑사'}],story:'',gallery:[],novel:[],vnLines:[],theme:{title:'',artist:'',youtubeId:''},auVersions:[]}
];
var defaultCats=['세계관','TRPG'];
function getChars(){try{return JSON.parse(localStorage.getItem('oc_characters'))||defaultOC;}catch(e){return defaultOC;}}
function setChars(v){
  localStorage.setItem('oc_characters',JSON.stringify(v));
  // Firebase 쓰기 - _db 준비될 때까지 최대 5초 대기
  var _retry=0;
  (function _write(){
    if(window._db&&window._fbSet&&window._fbRef){
      window._fbSet(window._fbRef(window._db,'lhdata/oc_characters'),v)
        .then(function(){console.log('[Firebase] oc_characters 저장 성공');})
        .catch(function(e){console.error('[Firebase] oc_characters 저장 실패:', e);});
    } else if(_retry<50){
      _retry++;
      setTimeout(_write,100);
    } else {
      console.error('[Firebase] _db 초기화 실패 - 로그인 상태 확인 필요');
    }
  })();
}
function getCats(){try{return JSON.parse(localStorage.getItem('oc_categories'))||defaultCats;}catch(e){return defaultCats;}}

var activeCat='all',activeSub='all',currentChar=null,currentAuIdx=-1,epGalleryData=[],dragSrcIndex=null;
var themePlayer=null,themeIsPlaying=false;

function renderCategoryFilters(){
  var cats=getCats(),wrap=document.getElementById('category-filters');
  wrap.innerHTML='<button class="filter-btn'+(activeCat==='all'?' active':'')+'" onclick="setFilter(\'cat\',\'all\',this)">All</button>';
  cats.forEach(function(cat){
    wrap.innerHTML+='<button class="filter-btn'+(activeCat===cat?' active':'')+'" onclick="setFilter(\'cat\',\''+cat+'\',this)">'+cat+'</button>';
  });
}
function setFilter(type,val,btn){
  if(type==='cat'){activeCat=val;activeSub='all';document.querySelectorAll('#category-filters .filter-btn').forEach(function(b){b.classList.remove('active');});btn.classList.add('active');updateSubFilters();}
  else{activeSub=val;document.querySelectorAll('#sub-filters .filter-btn').forEach(function(b){b.classList.remove('active');});btn.classList.add('active');}
  renderGrid();
}
function updateSubFilters(){
  var chars=getChars(),wrap=document.getElementById('sub-filter-wrap'),group=document.getElementById('sub-filters');
  if(activeCat==='all'){wrap.style.display='none';return;}
  var subs=[...new Set(chars.filter(function(c){return c.category===activeCat;}).map(function(c){return c.subcat;}).filter(Boolean))];
  if(!subs.length){wrap.style.display='none';return;}
  wrap.style.display='block';
  document.getElementById('sub-filter-title').textContent=activeCat==='세계관'?'Universe':'Scenario';
  group.innerHTML='<button class="filter-btn active" onclick="setFilter(\'sub\',\'all\',this)">전체</button>';
  subs.forEach(function(s){group.innerHTML+='<button class="filter-btn" onclick="setFilter(\'sub\',\''+s+'\',this)">'+s+'</button>';});
}
function renderGrid(){
  var chars=getChars(),search=document.getElementById('search-input').value.toLowerCase();
  var filtered=chars.filter(function(c){
    if(activeCat!=='all'&&c.category!==activeCat)return false;
    if(activeSub!=='all'&&c.subcat!==activeSub)return false;
    if(search&&!c.name.toLowerCase().includes(search)&&!(c.nameSub||'').toLowerCase().includes(search))return false;
    return true;
  });
  document.getElementById('char-count').textContent=filtered.length+'개';
  var grid=document.getElementById('card-grid'),romans=['I','II','III','IV','V','VI','VII','VIII','IX','X'];
  grid.innerHTML='';
  if(!filtered.length){grid.innerHTML='<div style="grid-column:1/-1;text-align:center;padding:5rem;font-family:Playfair Display,serif;font-style:italic;font-size:20px;color:var(--text-muted);">— 캐릭터가 없습니다 —</div>';return;}
  filtered.forEach(function(c,i){
    var card=document.createElement('div');card.className='char-card';
    card.onclick=function(){openDetail(c,-1);};
    var stars='★'.repeat(c.stars||5)+'☆'.repeat(5-(c.stars||5));
    card.innerHTML=(c.img?'<img class="char-card-img" src="'+c.img+'" style="object-fit:'+(c.imgFit||'cover')+';object-position:'+(c.imgPos||'center top')+'" alt="">':'<div class="char-card-placeholder">'+(romans[i]||'')+'</div>')
      +'<div class="char-card-hover"><div class="hover-name">'+c.name+'</div>'+(c.nameSub?'<div class="hover-sub">'+c.nameSub+'</div>':'')+(c.tag?'<div class="hover-tag">'+c.tag+'</div>':'')+'</div>'
      +'<div class="char-card-bottom"><div class="char-card-stars">'+stars+'</div><div class="char-card-name">'+c.name+'</div><div class="char-card-role">'+c.role+'</div></div>';
    grid.appendChild(card);
  });
}

function openDetail(c,auIdx){
  currentChar=c; currentAuIdx=auIdx;
  // topbar
  document.getElementById('game-topbar-title').textContent=c.name+(c.nameSub?' · '+c.nameSub:'');
  document.getElementById('game-topbar-id').textContent=(c.tag||'').toUpperCase();
  // image — base or AU
  var imgSrc=c.img, imgFit=c.imgFit||'contain', imgPos=c.imgPos||'center bottom';
  if(auIdx>=0&&c.auVersions&&c.auVersions[auIdx]){
    imgSrc=c.auVersions[auIdx].img||c.img;
    imgFit=c.auVersions[auIdx].imgFit||imgFit;
    imgPos=c.auVersions[auIdx].imgPos||imgPos;
  }
  var img=document.getElementById('game-char-img');
  img.classList.remove('animate-in');
  void img.offsetWidth; // reflow
  if(imgSrc){img.src=imgSrc;img.style.setProperty('object-fit',imgFit,'important');img.style.setProperty('object-position',imgPos,'important');img.style.display='block';img.style.cursor='pointer';img.classList.add('animate-in');document.getElementById('game-placeholder').style.display='none';}
  else{img.style.display='none';document.getElementById('game-placeholder').style.display='flex';}
  // right info
  document.getElementById('game-file-id').textContent=(c.tag||'—').toUpperCase()+' · '+(c.category||'—');
  document.getElementById('game-role').textContent=c.role||'—';
  document.getElementById('game-role2').textContent=c.role||'—';
  document.getElementById('game-stars').textContent='★'.repeat(c.stars||5)+'☆'.repeat(5-(c.stars||5));
  document.getElementById('game-name').textContent=c.name;
  document.getElementById('game-sub').textContent=c.nameSub||'';
  var profile=Array.isArray(c.profile)?c.profile:Object.keys(c.profile||{}).map(function(k){return{k:k,v:c.profile[k]};});
  document.getElementById('game-profile-table').innerHTML=profile.map(function(p){return'<tr><td>'+p.k+'</td><td>'+p.v+'</td></tr>';}).join('')||'<tr><td colspan="2" style="color:var(--text-muted)">—</td></tr>';
  document.getElementById('game-desc').textContent=c.desc||'—';
  document.getElementById('game-story').textContent=c.story||'—';
  var gg=document.getElementById('game-gallery');
  gg.innerHTML=(c.gallery&&c.gallery.length)?c.gallery.map(function(g){return'<div class="game-gallery-item"><img src="'+g+'" alt=""></div>';}).join(''):'<div class="empty-msg">이미지가 없습니다.</div>';
  var nl=document.getElementById('game-novel');
  nl.innerHTML=(c.novel&&c.novel.length)?c.novel.map(function(n){return'<div class="game-novel-item"><div class="game-novel-title">'+n.title+'</div><div class="game-novel-preview">'+n.preview+'</div></div>';}).join(''):'<div class="empty-msg">등록된 소설이 없습니다.</div>';

  // AU buttons
  var auWrap=document.getElementById('au-buttons');
  auWrap.innerHTML='';
  if(c.auVersions&&c.auVersions.length){
    var baseBtn=document.createElement('button');
    baseBtn.className='au-btn'+(auIdx===-1?' active':'');
    baseBtn.textContent='Default';
    baseBtn.onclick=function(){openDetail(c,-1);};
    auWrap.appendChild(baseBtn);
    c.auVersions.forEach(function(au,i){
      var btn=document.createElement('button');
      btn.className='au-btn'+(auIdx===i?' active':'');
      btn.textContent=au.label||('Ver.'+(i+1));
      btn.onclick=function(){openDetail(c,i);};
      auWrap.appendChild(btn);
    });
  }

  // theme song
  var theme=c.theme||{};
  stopTheme();
  window._themeFileData=theme.fileData||'';
  window._themeAudio=null;
  if(theme.title||theme.youtubeId||theme.fileData){
    document.getElementById('theme-player').style.display='flex';
    document.getElementById('theme-title').textContent=theme.title||'테마곡';
    document.getElementById('theme-artist').textContent=theme.artist||'';
    document.getElementById('theme-play-btn').textContent='▶';
    themeIsPlaying=false;
    window._themeYtId=theme.youtubeId||'';
  } else {
    document.getElementById('theme-player').style.display='none';
    window._themeYtId='';
  }

  // animate info blocks
  document.querySelectorAll('.game-info-block').forEach(function(b,i){
    b.classList.remove('visible');
    setTimeout(function(){b.classList.add('visible');},100+i*120);
  });

  document.getElementById('btn-edit').style.display=window._isAdmin?'block':'none';
  switchTab('info',document.querySelector('.game-tab'));
  document.getElementById('detail-screen').classList.add('active');
}

function closeDetail(){document.getElementById('detail-screen').classList.remove('active');closeEditPanel();stopTheme();}
function switchTab(name,btn){
  document.querySelectorAll('.game-tab').forEach(function(t){t.classList.remove('active');});
  document.querySelectorAll('.game-tab-content').forEach(function(t){t.classList.remove('active');});
  if(btn)btn.classList.add('active');else document.querySelector('.game-tab').classList.add('active');
  document.getElementById('gtab-'+name).classList.add('active');
}

// THEME SONG
window._themeYtId='';
window._themeFileData='';
window._themeAudio=null;
function toggleTheme(){
  // 파일 기반 테마
  if(window._themeFileData){
    if(!window._themeAudio){
      window._themeAudio=new Audio(window._themeFileData);
      window._themeAudio.loop=true;
      window._themeAudio.volume=0.8;
    }
    if(themeIsPlaying){window._themeAudio.pause();themeIsPlaying=false;document.getElementById('theme-play-btn').textContent='▶';}
    else{window._themeAudio.play();themeIsPlaying=true;document.getElementById('theme-play-btn').textContent='⏸';}
    return;
  }
  if(!window._themeYtId)return;
  if(!themePlayer){
    document.getElementById('theme-yt-container').innerHTML='<div id="theme-yt-iframe"></div>';
    var s=document.createElement('script');s.src='https://www.youtube.com/iframe_api';
    s.onload=function(){};
    // check if already loaded
    if(window.YT&&window.YT.Player){
      themePlayer=new YT.Player('theme-yt-iframe',{height:'1',width:'1',videoId:window._themeYtId,playerVars:{autoplay:1,loop:1,playlist:window._themeYtId},events:{onReady:function(e){e.target.setVolume(80);}}});
    } else {
      var prevReady=window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady=function(){
        if(prevReady) prevReady();
        themePlayer=new YT.Player('theme-yt-iframe',{height:'1',width:'1',videoId:window._themeYtId,playerVars:{autoplay:1,loop:1,playlist:window._themeYtId},events:{onReady:function(e){e.target.setVolume(80);}}});
      };
      document.head.appendChild(s);
    }
    themeIsPlaying=true;document.getElementById('theme-play-btn').textContent='⏸';return;
  }
  if(themeIsPlaying){themePlayer.pauseVideo();themeIsPlaying=false;document.getElementById('theme-play-btn').textContent='▶';}
  else{themePlayer.playVideo();themeIsPlaying=true;document.getElementById('theme-play-btn').textContent='⏸';}
}
function stopTheme(){
  if(themePlayer){try{themePlayer.stopVideo();}catch(e){}}
  themePlayer=null;
  if(window._themeAudio){window._themeAudio.pause();window._themeAudio=null;}
  themeIsPlaying=false;
  document.getElementById('theme-yt-container').innerHTML='';
}

// IMAGE UPLOAD
function previewUrl(url){updateImgPreview(url);}
function updateImgPreview(src){var preview=document.getElementById('ep-img-preview');var fit=document.getElementById('ep-img-fit').value;var pos=document.getElementById('ep-img-pos').value;if(src)preview.innerHTML='<img src="'+src+'" style="width:100%;height:100%;object-fit:'+fit+';object-position:'+pos+'">';else preview.innerHTML='이미지 없음';}
window.updateImgPreview=updateImgPreview;
function updateImgStyle(){var src=document.getElementById('ep-img-data').value.trim();if(src)updateImgPreview(src);}
function renderGalleryList(){
  var el=document.getElementById('ep-gallery-list');if(!el)return;
  el.innerHTML='';
  if(!epGalleryData.length){el.innerHTML='<div style="font-size:11px;color:var(--text-muted);padding:4px;">갤러리 없음</div>';return;}
  var wrap=document.createElement('div');
  wrap.style.cssText='display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-top:4px;';
  epGalleryData.forEach(function(src,i){
    var cell=document.createElement('div');
    cell.style.cssText='position:relative;aspect-ratio:2/3;background:var(--bg3);border:1px solid var(--border);overflow:hidden;';
    var img=document.createElement('img');img.src=src;img.style.cssText='width:100%;height:100%;object-fit:cover;object-position:top;';
    var btn=document.createElement('button');btn.textContent='✕';
    btn.style.cssText='position:absolute;top:2px;right:2px;background:rgba(0,0,0,.65);border:none;color:#fff;width:20px;height:20px;cursor:pointer;font-size:11px;border-radius:50%;padding:0;line-height:1;';
    btn.onclick=function(){epGalleryData.splice(i,1);renderGalleryList();};
    cell.appendChild(img);cell.appendChild(btn);wrap.appendChild(cell);
  });
  el.appendChild(wrap);
}
function removeGalleryItem(i){epGalleryData.splice(i,1);renderGalleryList();}

// AU VERSIONS
var epAuData=[];
function renderAUList(){
  document.getElementById('ep-au-list').innerHTML='';
  epAuData.forEach(function(au,i){
    var item=document.createElement('div');item.className='au-edit-item';
    item.innerHTML='<div style="display:flex;align-items:center;gap:6px;"><input class="form-input au-label" placeholder="버전 이름 (예: 여름 ver)" value="'+(au.label||'')+'"><button class="btn-del" onclick="removeAU('+i+')" style="padding:4px 8px;flex-shrink:0;">✕</button></div>'
      +'<label class="file-input-label">📁 파일 선택<input type="file" accept="image/*" data-au-idx="'+i+'" onchange="handleAUImgUpload(this,'+i+')"></label>'
      +'<input class="form-input au-img" placeholder="또는 이미지 URL" value="'+(au.img||'')+'" oninput="updateAUPreview('+i+',this.value)">'
      +'<div style="height:60px;background:var(--bg3);border:1px solid var(--border);overflow:hidden;" id="au-preview-'+i+'">'+(au.img?'<img src="'+au.img+'" style="width:100%;height:100%;object-fit:cover;">':'')+'</div>'
      +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;">'
      +'<select class="form-input au-fit"><option value="contain"'+(au.imgFit==='contain'?' selected':'')+'>Contain</option><option value="cover"'+(au.imgFit==='cover'?' selected':'')+'>Cover</option></select>'
      +'<select class="form-input au-pos"><option value="center top"'+(au.imgPos==='center top'?' selected':'')+'>위쪽</option><option value="center center"'+(au.imgPos==='center center'?' selected':'')+'>중앙</option><option value="center bottom"'+(au.imgPos==='center bottom'?' selected':'')+'>아래</option></select>'
      +'</div>';
    document.getElementById('ep-au-list').appendChild(item);
  });
}
function addAUItem(){epAuData.push({label:'',img:'',imgFit:'contain',imgPos:'center top'});renderAUList();}
function removeAU(i){epAuData.splice(i,1);renderAUList();}
function updateAUPreview(i,src){var el=document.getElementById('au-preview-'+i);if(el)el.innerHTML=src?'<img src="'+src+'" style="width:100%;height:100%;object-fit:cover;">':'';}

// PROFILE DRAG
function renderProfileRows(profile){document.getElementById('ep-profile-rows').innerHTML='';profile.forEach(function(p){addProfileRowWithVal(p.k,p.v);});}
function addProfileRow(){addProfileRowWithVal('','');}
function addProfileRowWithVal(k,v){
  var container=document.getElementById('ep-profile-rows');
  var item=document.createElement('div');item.className='profile-drag-item';item.draggable=true;
  item.innerHTML='<span class="drag-handle">⠿</span><input class="form-input prof-key" placeholder="항목명" value="'+k+'" style="flex:1;padding:4px 6px;"><input class="form-input prof-val" placeholder="내용" value="'+v+'" style="flex:2;padding:4px 6px;"><button class="btn-del" onclick="this.parentNode.remove()" style="padding:4px 8px;">✕</button>';
  item.addEventListener('dragstart',function(e){dragSrcIndex=Array.from(container.children).indexOf(item);e.dataTransfer.effectAllowed='move';});
  item.addEventListener('dragover',function(e){e.preventDefault();item.classList.add('drag-over');});
  item.addEventListener('dragleave',function(){item.classList.remove('drag-over');});
  item.addEventListener('drop',function(e){e.preventDefault();item.classList.remove('drag-over');var ti=Array.from(container.children).indexOf(item);if(dragSrcIndex===null||dragSrcIndex===ti)return;var src=Array.from(container.children)[dragSrcIndex];if(dragSrcIndex<ti)container.insertBefore(src,item.nextSibling);else container.insertBefore(src,item);dragSrcIndex=null;});
  container.appendChild(item);
}
function renderVNRows(lines){document.getElementById('ep-vn-rows').innerHTML='';lines.forEach(function(l){addVNRowVal(l.speaker||'',l.text||'');});}
function addVNRow(){addVNRowVal('','');}
function addVNRowVal(sp,tx){var row=document.createElement('div');row.className='vn-row';row.innerHTML='<input class="form-input vn-speaker" placeholder="화자" value="'+sp+'"><textarea class="form-input vn-text" rows="2" placeholder="대사">'+tx+'</textarea><button class="btn-del" onclick="this.parentNode.remove()" style="align-self:flex-start;padding:4px 10px;">삭제</button>';document.getElementById('ep-vn-rows').appendChild(row);}

// EDIT
function openEditPanel(){
  if(!currentChar||!window._isAdmin)return;
  var c=currentChar;
  document.getElementById('ep-name').value=c.name;document.getElementById('ep-namesub').value=c.nameSub||'';document.getElementById('ep-role').value=c.role||'';document.getElementById('ep-faction').value=c.faction||'';
  var sel=document.getElementById('ep-category');sel.innerHTML=getCats().map(function(ct){return'<option value="'+ct+'"'+(ct===c.category?' selected':'')+'>'+ct+'</option>';}).join('');
  document.getElementById('ep-subcat').value=c.subcat||'';document.getElementById('ep-tag').value=c.tag||'';document.getElementById('ep-stars').value=c.stars||5;
  var theme=c.theme||{};
  document.getElementById('ep-theme-title').value=theme.title||'';
  document.getElementById('ep-theme-artist').value=theme.artist||'';
  document.getElementById('ep-theme-yt').value=theme.youtubeId||'';
  document.getElementById('ep-theme-file-data').value=theme.fileData||'';
  document.getElementById('theme-file-name').textContent=theme.fileData?'✓ 파일 등록됨':'';
  setThemeSrc(theme.fileData?'file':'yt');
  document.getElementById('ep-img-fit').value=c.imgFit||'contain';document.getElementById('ep-img-pos').value=c.imgPos||'center top';
  var imgVal=c.img||'';document.getElementById('ep-img-data').value=imgVal;updateImgPreview(imgVal);
  document.getElementById('ep-desc').value=c.desc||'';
  var profile=Array.isArray(c.profile)?c.profile:Object.keys(c.profile||{}).map(function(k){return{k:k,v:c.profile[k]};});
  renderProfileRows(profile);document.getElementById('ep-story').value=c.story||'';
  epGalleryData=c.gallery?[...c.gallery]:[];renderGalleryList();
  renderVNRows(c.vnLines||[]);
  epAuData=c.auVersions?JSON.parse(JSON.stringify(c.auVersions)):[];renderAUList();
  document.getElementById('edit-panel').classList.add('active');
}
function closeEditPanel(){document.getElementById('edit-panel').classList.remove('active');}
function setThemeSrc(src){
  document.getElementById('theme-yt-input').style.display = src==='yt' ? 'block' : 'none';
  document.getElementById('theme-file-input').style.display = src==='file' ? 'block' : 'none';
  document.getElementById('theme-src-yt').classList.toggle('active', src==='yt');
  document.getElementById('theme-src-file').classList.toggle('active', src==='file');
}
function handleThemeFileUpload(input){
  var file=input.files[0]; if(!file) return;
  var reader=new FileReader();
  reader.onload=function(e){
    document.getElementById('ep-theme-file-data').value=e.target.result;
    document.getElementById('theme-file-name').textContent='✓ '+file.name;
  };
  reader.readAsDataURL(file);
}
// ===== BGM PLAYER =====
// BGM 컨트롤은 lakehouse-bgm-js(LakeBGM)에서 전담. 여기선 변수 선언만.
var ytPlayer=null;
window._bgmYtId='';
window._bgmIsPlaying=false;

// 초기 렌더 (activeCat='all' 디폴트)
activeCat='all';
function doInitRender(){
  renderCategoryFilters();
  renderGrid();
  var allBtn=document.querySelector('#category-filters .filter-btn');
  if(allBtn)allBtn.classList.add('active');
}
window.__lakehouseOCBoot=doInitRender;
setTimeout(function(){if(window.__lakehouseOCBoot){doInitRender();window.__lakehouseOCBoot=null;}},5000);

Object.assign(window, {renderCategoryFilters:renderCategoryFilters,setFilter:setFilter,updateSubFilters:updateSubFilters,renderGrid:renderGrid,openDetail:openDetail,closeDetail:closeDetail,switchTab:switchTab,toggleTheme:toggleTheme,stopTheme:stopTheme,previewUrl:previewUrl,updateImgPreview:updateImgPreview,updateImgStyle:updateImgStyle,renderGalleryList:renderGalleryList,removeGalleryItem:removeGalleryItem,addAUItem:addAUItem,removeAU:removeAU,updateAUPreview:updateAUPreview,renderProfileRows:renderProfileRows,addProfileRow:addProfileRow,addProfileRowWithVal:addProfileRowWithVal,renderVNRows:renderVNRows,addVNRow:addVNRow,addVNRowVal:addVNRowVal,openEditPanel:openEditPanel,closeEditPanel:closeEditPanel,setThemeSrc:setThemeSrc,handleThemeFileUpload:handleThemeFileUpload,getChars:getChars,setChars:setChars,getCats:getCats, epGalleryData, epAuData, activeCat, activeSub, currentChar, currentAuIdx, themeIsPlaying, dragSrcIndex });
