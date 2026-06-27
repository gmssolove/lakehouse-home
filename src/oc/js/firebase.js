import{initializeApp}from"https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import{getAuth,onAuthStateChanged}from"https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import{getDatabase,ref,get,set,onValue,runTransaction}from"https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";
const ADMIN_USERNAME="gmssolove";
const ADMIN_EMAIL="gmssolove@naver.com";
function ensureOCAdminProfile(user){
  return new Promise(function(resolve){
    if(!user||!user.email||user.email.toLowerCase()!==ADMIN_EMAIL.toLowerCase()){resolve();return;}
    var key=ADMIN_USERNAME;
    get(ref(db,'lhdata/users_by_username/'+key)).then(function(mapSnap){
      if(mapSnap.exists()&&mapSnap.val()!==user.uid){resolve();return;}
      return get(ref(db,'lhdata/users/'+user.uid)).then(function(profSnap){
        var profile=profSnap.exists()?profSnap.val():null;
        if(profile&&String(profile.username||'').toLowerCase()===ADMIN_USERNAME){resolve();return;}
        var saveProfile=function(){
          return set(ref(db,'lhdata/users/'+user.uid),{
            username:ADMIN_USERNAME,
            nickname:(profile&&profile.nickname)||user.displayName||ADMIN_USERNAME,
            email:user.email,
            createdAt:(profile&&profile.createdAt)||new Date().toISOString()
          }).then(resolve);
        };
        if(mapSnap.exists())return saveProfile();
        return runTransaction(ref(db,'lhdata/users_by_username/'+key),function(cur){
          if(cur===null)return user.uid;return;
        }).then(function(tx){
          if(!tx.committed){resolve();return;}
          return saveProfile();
        });
      });
    }).catch(function(){resolve();});
  });
}
const cfg={apiKey:"AIzaSyAdyaVA95hYEbPDfCRwNI0mretcowocGfM",authDomain:"llikebread.firebaseapp.com",databaseURL:"https://llikebread-default-rtdb.asia-southeast1.firebasedatabase.app",projectId:"llikebread",storageBucket:"llikebread.firebasestorage.app",messagingSenderId:"227317366345",appId:"1:227317366345:web:472530c2616612899e0998"};
const app=initializeApp(cfg);
const auth=getAuth(app);
const db=getDatabase(app);
window._db=db;
window._fbSet=set;
window._fbRef=ref;
window._fbGet=get;
function refreshOCFromSync(){
  if(typeof renderCategoryFilters==='function')renderCategoryFilters();
  if(typeof renderGrid==='function')renderGrid();
  if(window.currentChar&&typeof openDetail==='function'){
    try{
      var chars=JSON.parse(localStorage.getItem('oc_characters')||'[]');
      var updated=chars.find(function(c){return String(c.id)===String(window.currentChar.id)});
      if(updated)openDetail(updated,typeof window.currentAuIdx==='number'?window.currentAuIdx:-1);
    }catch(e){}
  }
}
var ocBooted=false;
function bootOCOnce(){
  if(ocBooted)return;
  ocBooted=true;
  refreshOCFromSync();
  if(typeof window.__lakehouseOCBoot==='function'){window.__lakehouseOCBoot();window.__lakehouseOCBoot=null;}
}
function applySnap(key,snap){
  if(!snap.exists())return;
  localStorage.setItem(key,JSON.stringify(snap.val()));
  bootOCOnce();
}
onValue(ref(db,'lhdata/oc_characters'),function(snap){applySnap('oc_characters',snap)});
onValue(ref(db,'lhdata/oc_categories'),function(snap){applySnap('oc_categories',snap)});
onValue(ref(db,'site/r2Upload'),function(snap){
  if(!snap.exists())return;
  var d=snap.val()||{};
  if(window.LakeR2Upload&&window.LakeR2Upload.applyConfig)window.LakeR2Upload.applyConfig(d);
  else{if(d.url)localStorage.setItem('lakehouse_r2_upload_url',d.url);if(d.token)localStorage.setItem('lakehouse_r2_upload_token',d.token)}
});
onAuthStateChanged(auth,function(user){
  if(!user){window._isAdmin=false;var btn=document.getElementById('btn-edit');if(btn)btn.style.display='none';return;}
  ensureOCAdminProfile(user).then(function(){
    get(ref(db,'lhdata/users/'+user.uid)).then(function(snap){
      var profile=snap.exists()?snap.val():null;
      window._isAdmin=!!(profile&&String(profile.username||'').toLowerCase()===ADMIN_USERNAME)||(user.email&&user.email.toLowerCase()===ADMIN_EMAIL.toLowerCase());
      var btn=document.getElementById('btn-edit');
      if(btn)btn.style.display=window._isAdmin?'block':'none';
    });
  });
});
