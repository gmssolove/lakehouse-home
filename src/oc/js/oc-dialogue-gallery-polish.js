(function(){
  function $(id){return document.getElementById(id)}
  function arr(a){return Array.isArray(a)?a:[]}
  function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}

  function dialogueList(c){
    c=c||window.currentChar;
    if(!c)return [];
    if(arr(c.dialogue).length)return arr(c.dialogue);
    if(arr(c.vnLines).length){
      return arr(c.vnLines).map(function(l,i){
        return {id:String(i+1),speaker:l.speaker||c.name||'',text:l.text||'',expression:l.expression||'',choices:arr(l.choices)};
      });
    }
    return [];
  }

  window.openGalleryLightbox=function(src){
    var old=document.querySelector('.lh-gallery-lightbox');
    if(old)old.remove();
    var box=document.createElement('div');
    box.className='lh-gallery-lightbox';
    box.innerHTML='<button type="button">닫기</button><img src="'+esc(src)+'" alt="gallery image">';
    document.body.appendChild(box);
    box.addEventListener('click',function(e){
      if(e.target===box||e.target.tagName==='BUTTON')box.remove();
    });
  };

  document.addEventListener('click',function(e){
    var img=e.target.closest&&e.target.closest('.game-gallery-item img');
    if(!img)return;
    e.preventDefault();
    e.stopPropagation();
    window.openGalleryLightbox(img.src);
  },true);

  var typingTimer=0,typingDone=true,dialoguePos=0;

  function typeText(el,text){
    if(!el)return;
    clearInterval(typingTimer);
    typingDone=false;
    el.classList.add('lh-typing');
    el.textContent='';
    el.setAttribute('aria-busy','true');
    var i=0;
    typingTimer=setInterval(function(){
      i++;
      el.textContent=text.slice(0,i);
      if(i>=text.length){
        clearInterval(typingTimer);
        el.classList.remove('lh-typing');
        el.removeAttribute('aria-busy');
        typingDone=true;
      }
    },42);
  }

  function nodeIndex(list,id){
    var idx=list.findIndex(function(n){return String(n.id)===String(id)});
    return idx>=0?idx:0;
  }

  function renderNext(node,list){
    var box=document.querySelector('.lh-vn-box');
    if(!box)return;
    var hasNext=!arr(node.choices).length&&dialoguePos<list.length-1;
    box.classList.toggle('has-next',hasNext);
    if(hasNext&&!box.querySelector('.lh-vn-next')){
      box.insertAdjacentHTML('beforeend','<span class="lh-vn-next" aria-hidden="true"></span>');
    }
  }

  window.startDialogue=function(){
    if(!window.currentChar)return;
    if(typeof window.ensureStage==='function')window.ensureStage();
    var c=window.currentChar,list=dialogueList(c);
    if(list.length)window.showDialogueNode(c.dialogueStart||list[0].id);
    else window.showDialogueNode();
  };

  window.showDialogueNode=function(id){
    if(typeof window.ensureStage==='function')window.ensureStage();
    var c=window.currentChar,box=$('lh-vn');
    if(!box||!c)return;
    var textEl=$('lh-vn-text');
    if(textEl){
      clearInterval(typingTimer);
      typingDone=false;
      textEl.textContent='';
      textEl.classList.add('lh-typing');
      textEl.setAttribute('aria-busy','true');
    }
    var list=dialogueList(c);
    if(!list.length){
      box.classList.add('active');
      $('lh-vn-speaker').textContent=c.name||'';
      typeText(textEl,c.desc||'...');
      $('lh-vn-choices').innerHTML='<button class="lh-vn-choice" onclick="closeDialogue()">닫기</button>';
      return;
    }
    dialoguePos=id?nodeIndex(list,id):nodeIndex(list,c.dialogueStart||list[0].id);
    var node=list[dialoguePos]||list[0];
    var img=$('game-char-img');
    if(node.expression&&img){
      img.src=node.expression;
      img.classList.remove('animate-in');
      void img.offsetWidth;
      img.classList.add('animate-in');
    }
    box.classList.add('active');
    $('lh-vn-speaker').textContent=node.speaker||(c.name||'');
    typeText(textEl,node.text||'');
    var choices=arr(node.choices);
    $('lh-vn-choices').innerHTML=choices.length?choices.map(function(ch){
      return '<button class="lh-vn-choice" onclick="showDialogueNode(\''+esc(ch.next||'')+'\')">'+esc(ch.label||'...')+'</button>';
    }).join(''):'';
    renderNext(node,list);
  };

  function advanceDialogue(){
    var box=$('lh-vn');
    if(!box||!box.classList.contains('active'))return;
    var list=dialogueList(),node=list[dialoguePos];
    if(!node){
      if(window.closeDialogue)window.closeDialogue();
      return;
    }
    if(!typingDone){
      clearInterval(typingTimer);
      $('lh-vn-text').textContent=node.text||'';
      $('lh-vn-text').classList.remove('lh-typing');
      typingDone=true;
      return;
    }
    if(arr(node.choices).length)return;
    if(dialoguePos<list.length-1)window.showDialogueNode(list[dialoguePos+1].id);
    else if(window.closeDialogue)window.closeDialogue();
  }

  document.addEventListener('click',function(e){
    var box=$('lh-vn');
    if(!box||!box.classList.contains('active'))return;
    if(e.target.closest('.lh-vn-choice,.lh-vn-close'))return;
    if(e.target.closest('#lh-vn')||e.target.closest('.game-left')){
      e.preventDefault();
      advanceDialogue();
    }
  },true);

  document.addEventListener('copy',function(e){
    if(e.target.closest&&e.target.closest('#lh-vn,.lh-vn-overlay')){
      e.preventDefault();
    }
  },true);

  document.addEventListener('contextmenu',function(e){
    if(e.target.closest&&e.target.closest('#lh-vn-text')){
      e.preventDefault();
    }
  },true);

  function retriggerInfoAnimations(){
    document.querySelectorAll('.game-info-block,.game-profile-table tr,.game-desc,.lh-side-panel .lh-profile-line,.lh-side-panel .lh-stat,.lh-side-panel .lh-chip,.lh-info-piece').forEach(function(el){
      el.style.animation='none';
      void el.offsetWidth;
      el.style.animation='';
    });
  }

  var oldOpen=window.openDetail;
  window.openDetail=function(c,auIdx){
    if(oldOpen)oldOpen(c,auIdx);
    setTimeout(retriggerInfoAnimations,0);
  };
})();
