(function (global) {
  if (global.LakeR2Upload && global.LakeR2Upload.__v === 4) return;

  var API_URL = '/api/r2-upload';
  var TOKEN_KEY = 'lakehouse_r2_upload_token';
  var MAX_IMAGE_BYTES = 10 * 1024 * 1024;
  var pending = [];

  function token() {
    return (localStorage.getItem(TOKEN_KEY) || global.LAKEHOUSE_R2_UPLOAD_TOKEN || '').trim();
  }

  function applyConfig(cfg) {
    cfg = cfg || {};
    if (cfg.token) localStorage.setItem(TOKEN_KEY, String(cfg.token).trim());
  }

  function isImageFile(file) {
    return (file.type || '').startsWith('image/') || /\.(jpe?g|png|gif|webp|bmp|svg|avif|heic)$/i.test(file.name || '');
  }

  function isDataUrl(s) {
    return typeof s === 'string' && /^data:(image|audio)\//i.test(s);
  }

  function isR2Url(s) {
    return typeof s === 'string' && (/\/file\//.test(s) || /lakehouse-r2-upload/i.test(s));
  }

  function readFile(file) {
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onload = function (e) { resolve(e.target.result); };
      r.onerror = reject;
      r.readAsDataURL(file);
    });
  }

  function dataUrlToFile(dataUrl, name) {
    var m = String(dataUrl).match(/^data:([^;,]+);base64,(.+)$/);
    if (!m) throw new Error('invalid data url');
    var bin = atob(m[2]);
    var arr = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    var ext = (m[1].split('/')[1] || 'png').replace(/[^a-z0-9]/gi, '');
    return new File([arr], name || ('migrated.' + ext), { type: m[1] });
  }

  function track(p) {
    pending.push(p);
    p.finally(function () {
      pending = pending.filter(function (x) { return x !== p; });
      if (typeof global.__lakehouseR2PendingChange === 'function') {
        try { global.__lakehouseR2PendingChange(pending.length); } catch (e) {}
      }
    });
    if (typeof global.__lakehouseR2PendingChange === 'function') {
      try { global.__lakehouseR2PendingChange(pending.length); } catch (e) {}
    }
    return p;
  }

  function waitPending() {
    return Promise.all(pending.slice());
  }

  function setStatus(el, text, busy) {
    if (!el) return;
    el.textContent = text || '';
    el.classList.toggle('is-busy', !!busy);
  }

  function rejectIfImageTooLarge(file, statusEl) {
    if (!isImageFile(file) || file.size <= MAX_IMAGE_BYTES) return;
    var msg = '이미지는 10MB 이하만 업로드할 수 있습니다.';
    setStatus(statusEl, msg, false);
    if (global.LakeDialog) global.LakeDialog.alert(msg);
    else alert(msg);
    throw new Error(msg);
  }

  async function postFile(file, folder) {
    var form = new FormData();
    form.append('file', file);
    form.append('folder', folder || 'lakehouse');
    var headers = {};
    var t = token();
    if (t) headers['X-Upload-Token'] = t;
    var res = await fetch(API_URL, { method: 'POST', body: form, headers: headers });
    var data = await res.json().catch(function () { return {}; });
    if (!res.ok) throw new Error(data.error || res.statusText || 'upload failed');
    if (!data.url) throw new Error('R2 응답에 url이 없습니다.');
    return data.url;
  }

  async function uploadDataUrl(dataUrl, folder, name) {
    if (!dataUrl || !isDataUrl(dataUrl) || isR2Url(dataUrl)) return dataUrl || '';
    var file = dataUrlToFile(dataUrl, name);
    rejectIfImageTooLarge(file);
    return postFile(file, folder);
  }

  async function uploadFile(file, folder, statusEl) {
    rejectIfImageTooLarge(file, statusEl);
    if (isImageFile(file)) return postFile(file, folder);
    return postFile(file, folder);
  }

  async function upload(file, folder, statusEl) {
    rejectIfImageTooLarge(file, statusEl);
    try {
      setStatus(statusEl, 'R2 업로드 중...', true);
      var out = await uploadFile(file, folder, statusEl);
      setStatus(statusEl, 'R2 업로드 완료', false);
      return out;
    } catch (e) {
      if (isImageFile(file)) throw e;
      setStatus(statusEl, 'R2 업로드 실패: 임시 data URL로 저장됨', false);
      return readFile(file);
    }
  }

  function saveConfig(urlInput, tokenInput) {
    if (tokenInput) localStorage.setItem(TOKEN_KEY, tokenInput.value.trim());
  }

  function wrapSave(fn) {
    if (!fn) return;
    global.saveChar = function () {
      var args = arguments;
      var ctx = this;
      return waitPending().then(function () { return fn.apply(ctx, args); });
    };
  }

  function notifyPreview(src) {
    if (typeof global.__lakehouseImgPreview === 'function') {
      try { global.__lakehouseImgPreview(src); } catch (e) {}
    }
  }

  function failUpload(statusEl, err, input) {
    if (input) input.value = '';
    var msg = (err && err.message) ? err.message : '업로드에 실패했습니다.';
    setStatus(statusEl, msg, false);
    if (global.LakeDialog) global.LakeDialog.alert(msg);
    else if (!statusEl) alert(msg);
  }

  function bindFile(input, folder, onUrl, statusEl) {
    var file = input.files && input.files[0];
    if (!file) return;
    var previewUrl = null;
    function revokePreview() {
      if (!previewUrl) return;
      URL.revokeObjectURL(previewUrl);
      previewUrl = null;
    }
    if (isImageFile(file)) {
      previewUrl = URL.createObjectURL(file);
      notifyPreview(previewUrl);
    }
    track(upload(file, folder, statusEl).then(function (url) {
      revokePreview();
      onUrl(url);
      input.value = '';
    }).catch(function (e) {
      failUpload(statusEl, e, input);
    }));
  }

  function bindFiles(input, folder, onUrls, statusEl) {
    var files = Array.prototype.slice.call(input.files || []);
    if (!files.length) return;
    track(Promise.all(files.map(function (f) { return upload(f, folder, statusEl); })).then(function (urls) {
      onUrls(urls);
      input.value = '';
    }).catch(function (e) {
      failUpload(statusEl, e, input);
    }));
  }

  global.LakeR2Upload = {
    __v: 4,
    upload: upload,
    uploadFile: uploadFile,
    uploadDataUrl: uploadDataUrl,
    pending: function () { return pending.slice(); },
    waitPending: waitPending,
    track: track,
    endpoint: function () { return API_URL; },
    token: token,
    applyConfig: applyConfig,
    isDataUrl: isDataUrl,
    saveConfig: saveConfig,
    wrapSave: wrapSave,
    bindFile: bindFile,
    bindFiles: bindFiles,
    setStatus: setStatus
  };
})(window);
