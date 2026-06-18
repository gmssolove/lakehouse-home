(function(){
  var STATE_KEY='lh_bgm_shared_state';
  function read(){try{return JSON.parse(localStorage.getItem(STATE_KEY)||'{}')}catch(e){return {}}}
  function write(v){try{localStorage.setItem(STATE_KEY,JSON.stringify(Object.assign(read(),v||{},{updatedAt:Date.now()})))}catch(e){}}
  function remember(){
    if(!window.LakeBGM||!LakeBGM.getState)return;
    var s=LakeBGM.getState();
    if(s&&(s.id||s.ytId||s.fileData))write({kind:s.kind,id:s.id||s.ytId||s.fileData,ytId:s.kind==='youtube'?(s.id||s.ytId):'',fileData:s.kind==='file'?(s.id||s.fileData):'',title:s.title,artist:s.artist,scope:s.scope,playing:!!s.playing,currentTime:s.currentTime||0,volume:s.volume});
  }
  window.addEventListener('pagehide',remember,{capture:true});
  window.addEventListener('beforeunload',remember,{capture:true});
  document.addEventListener('visibilitychange',function(){if(document.visibilityState==='hidden')remember()},{capture:true});
})();
