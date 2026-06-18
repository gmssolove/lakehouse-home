(function(){
  var UI_KEY='lh_bgm_ui_state';
  function read(){try{return JSON.parse(localStorage.getItem(UI_KEY)||'{}')}catch(e){return {}}}
  function save(el){var ui=read();ui.collapsed=el.classList.contains('collapsed');ui.posLeft=el.style.left||ui.posLeft||'';ui.posTop=el.style.top||ui.posTop||'';try{localStorage.setItem(UI_KEY,JSON.stringify(ui))}catch(e){}}
  function install(){
    var p=document.getElementById('bgm-player');if(!p||p.dataset.lhExpandFinal)return;p.dataset.lhExpandFinal='1';
    var moved=false,sx=0,sy=0,down=false;
    p.addEventListener('pointerdown',function(e){down=true;moved=false;sx=e.clientX;sy=e.clientY},{capture:true});
    document.addEventListener('pointermove',function(e){if(!down)return;if(Math.abs(e.clientX-sx)>5||Math.abs(e.clientY-sy)>5)moved=true},{capture:true});
    document.addEventListener('pointerup',function(){setTimeout(function(){down=false;moved=false},90)},{capture:true});
    function open(e){if(!p.classList.contains('collapsed'))return;if(moved)return;e.preventDefault();e.stopPropagation();p.classList.remove('collapsed');save(p)}
    p.addEventListener('click',open,true);
    p.addEventListener('dblclick',open,true);
    var x=document.getElementById('bgm-expand-btn');if(x)x.addEventListener('click',open,true);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install);else install();setTimeout(install,900);
})();
