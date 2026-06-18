(function(){
  var R=window.LakeR2Upload,$=function(id){return document.getElementById(id)},st=function(){return $('ep-img-upload-status')};
  if(!R){console.error('[Lakehouse R2] lakehouse-r2.js 로드 실패');return}
  window.__lakehouseImgPreview=function(src){if(typeof window.updateImgPreview==='function')window.updateImgPreview(src)};
  function syncSaveBtn(busy){
    var btn=$('ep-save-btn');
    if(!btn)return;
    btn.disabled=!!busy;
    btn.textContent=busy?'업로드 중...':'저장';
  }
  window.__lakehouseR2PendingChange=function(n){syncSaveBtn(n>0)};
  window.handleImgUpload=function(input){R.bindFile(input,'oc/main',function(url){if($('ep-img-data'))$('ep-img-data').value=url;if(typeof window.updateImgPreview==='function')window.updateImgPreview(url);R.setStatus(st(),'업로드 완료',false)},st())};
  window.handleGalleryUpload=function(input){R.bindFiles(input,'oc/gallery',function(urls){window.epGalleryData=Array.isArray(window.epGalleryData)?window.epGalleryData:[];urls.forEach(function(url){epGalleryData.push(url)});if(typeof renderGalleryList==='function')renderGalleryList();R.setStatus(st(),'갤러리 업로드 완료',false)},st())};
  window.handleAUImgUpload=function(input,i){var files=Array.prototype.slice.call(input.files||[]);if(!files.length)return;var preview=(files[0].type||'').startsWith('image/')?URL.createObjectURL(files[0]):'';if(preview)window.__lakehouseImgPreview(preview);R.track(Promise.all(files.map(function(f){return R.upload(f,'oc/au',st())})).then(function(urls){if(preview)URL.revokeObjectURL(preview);window.epAuData=Array.isArray(window.epAuData)?window.epAuData:[];urls.forEach(function(url,idx){if(idx===0&&window.epAuData[i])window.epAuData[i].img=url;else window.epAuData.push({label:'Version '+(window.epAuData.length+1),img:url,imgFit:'contain',imgPos:'center top'})});if(typeof renderAUList==='function')renderAUList();input.value='';R.setStatus(st(),'AU 이미지 업로드 완료',false)}).catch(function(e){input.value='';var msg=(e&&e.message)?e.message:'업로드에 실패했습니다.';R.setStatus(st(),msg,false);if(window.LakeDialog)LakeDialog.alert(msg);else alert(msg)}))};
  if(window.saveChar){
    var baseSave=window.saveChar;
    window.saveChar=function(){
      var args=arguments,ctx=this;
      return R.waitPending().then(function(){
        var img=(($('ep-img-data')&&$('ep-img-data').value)||'').trim();
        var previewImg=$('ep-img-preview')&&$('ep-img-preview').querySelector('img');
        var previewSrc=previewImg&&previewImg.src||'';
        if(previewSrc.indexOf('blob:')===0&&(!img||img.indexOf('http')!==0)){throw new Error('이미지 업로드가 끝난 뒤 저장해 주세요.')}
        return baseSave.apply(ctx,args);
      }).catch(function(e){
        var msg=(e&&e.message)?e.message:'저장할 수 없습니다.';
        R.setStatus(st(),msg,false);
        if(window.LakeDialog)LakeDialog.alert(msg);else alert(msg);
      }).finally(function(){syncSaveBtn(false)});
    };
  }
})();
