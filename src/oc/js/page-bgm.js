(function(){
  function hasSavedSource(){try{var s=JSON.parse(localStorage.getItem('lh_bgm_shared_state')||'{}');return !!(s.id||s.ytId||s.fileData)}catch(e){return false}}
  function applyMainBGM(bgm){if(!bgm||!window.LakeBGM||hasSavedSource())return;LakeBGM.setSource({youtubeId:bgm.youtubeId||'',title:bgm.title||'BGM',artist:bgm.artist||'',scope:'main'},{autoplay:false})}
  function tryLoad(n){if(hasSavedSource())return;if(window._db&&window._fbGet&&window._fbRef){window._fbGet(window._fbRef(window._db,'site/bgm')).then(function(s){if(s&&s.exists())applyMainBGM(s.val())}).catch(function(){})}else if(n<20){setTimeout(function(){tryLoad(n+1)},250)}}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',function(){tryLoad(0)});else tryLoad(0);
})();
