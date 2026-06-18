(function(){
  var UI_KEY='lh_bgm_ui_state';
  function read(){try{return JSON.parse(localStorage.getItem(UI_KEY)||'{}')}catch(e){return {}}}
  function save(extra){try{localStorage.setItem(UI_KEY,JSON.stringify(Object.assign(read(),extra||{})))}catch(e){}}
  function install(){
    var p=document.getElementById('bgm-player');
    if(!p)return;
    var expand=document.getElementById('bgm-expand-btn');
    if(expand&&!expand.dataset.lhDoubleOnly){
      var clone=expand.cloneNode(true);
      clone.dataset.lhDoubleOnly='1';
      clone.style.pointerEvents='none';
      expand.parentNode.replaceChild(clone,expand);
    }
    if(p.dataset.lhDoubleClickFinal)return;
    p.dataset.lhDoubleClickFinal='1';
    p.addEventListener('click',function(e){
      if(p.classList.contains('collapsed')){
        e.preventDefault();
        e.stopPropagation();
      }
    },true);
    p.addEventListener('dblclick',function(e){
      if(!p.classList.contains('collapsed'))return;
      e.preventDefault();
      e.stopPropagation();
      p.classList.remove('collapsed');
      save({collapsed:false,posLeft:p.style.left||'',posTop:p.style.top||''});
    },true);
    var collapse=document.getElementById('bgm-toggle-collapse');
    if(collapse&&!collapse.dataset.lhRightFold){
      collapse.dataset.lhRightFold='1';
      collapse.addEventListener('click',function(){
        var r=p.getBoundingClientRect();
        setTimeout(function(){
          if(!p.classList.contains('collapsed'))return;
          var left=Math.max(0,Math.min(window.innerWidth-52,r.right-52));
          var top=Math.max(0,Math.min(window.innerHeight-52,r.top));
          p.style.right='auto';
          p.style.bottom='auto';
          p.style.left=left+'px';
          p.style.top=top+'px';
          save({collapsed:true,posLeft:p.style.left,posTop:p.style.top});
        },0);
      },true);
    }
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install);else install();
  setTimeout(install,300);
  setTimeout(install,1200);
})();
