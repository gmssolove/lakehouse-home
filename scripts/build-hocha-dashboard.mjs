import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import XLSX from 'xlsx';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const excelPath = process.argv[2] || 'C:/Users/user/Downloads/호차현황판_20260710.xlsx';
const outPath = process.argv[3] || 'C:/Users/user/Downloads/호차현황판.html';

const wb = XLSX.readFile(excelPath);
const sheetName = wb.SheetNames.find((n) => n === '호차현황' || n === '호차') || wb.SheetNames[0];
const raw = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { defval: '' });
const hocha = raw.filter(
  (r) =>
    String(r['호차번호'] || '').trim() &&
    (r['현재기사(이름)'] || r['현재동승자(이름)'] || r['현재차량(차량번호)'])
);

const BRANCHES = ['장안', '서수원', '수원', '운정1', '운정2', '남동탄'];
const DATA_DATE = '2026-07-10';

const html = `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>호차현황판</title>
<script src="https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js"><\/script>
<style>
:root{
  --navy:#24467D;--logobg:#2B2E33;--slate:#2E5395;--busyellow:#FFC72C;--busyellow-dark:#E6A800;
  --gold:#BF8F00;--red:#C0392B;--green:#2F9E44;--bg:#F3F4F7;--card:#FFFFFF;--border:#E1E4EA;
  --text:#1B1F27;--muted:#6B7280;--radius:14px;
}
*{box-sizing:border-box;}
body{margin:0;background:var(--bg);color:var(--text);font-family:"Pretendard","Noto Sans KR","Malgun Gothic","Apple SD Gothic Neo",sans-serif;-webkit-font-smoothing:antialiased;}
.topbar{background:var(--navy);color:#fff;padding:18px 28px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;}
.brand{display:flex;align-items:center;gap:12px;}
.brand-badge{width:40px;height:40px;border-radius:10px;background:var(--logobg);display:flex;align-items:center;justify-content:center;flex-shrink:0;}
.brand-badge svg{width:20px;height:27px;}
.brand h1{font-size:17px;margin:0;font-weight:800;letter-spacing:-0.3px;}
.brand p{margin:0;font-size:12px;color:#B9C4DC;}
.upload-wrap{display:flex;align-items:center;gap:10px;flex-wrap:wrap;}
.upload-btn{background:var(--busyellow);color:var(--navy);border:none;font-weight:700;font-size:13px;padding:10px 16px;border-radius:999px;cursor:pointer;}
.upload-btn:hover{background:var(--busyellow-dark);}
.upload-btn.secondary{background:transparent;color:#fff;border:1px solid rgba(255,255,255,.35);}
.file-status{font-size:12px;color:#CBD5EA;}
#fileInput{display:none;}
.tabs{display:flex;gap:6px;padding:14px 28px 0;background:var(--bg);border-bottom:1px solid var(--border);flex-wrap:wrap;}
.tab-btn{border:none;background:transparent;padding:12px 18px;font-size:14px;font-weight:700;color:var(--muted);cursor:pointer;border-bottom:3px solid transparent;border-radius:8px 8px 0 0;}
.tab-btn.active{color:var(--navy);border-bottom-color:var(--busyellow);background:var(--card);}
main{padding:24px 28px 60px;max-width:1200px;margin:0 auto;}
.view{display:none;}
.view.active{display:block;}
.stat-row{display:flex;gap:14px;flex-wrap:wrap;margin-bottom:20px;}
.stat-card{background:var(--card);border:1px solid var(--border);border-radius:var(--radius);padding:16px 20px;flex:1;min-width:140px;}
.stat-card .num{font-size:26px;font-weight:800;color:var(--navy);}
.stat-card .label{font-size:12px;color:var(--muted);margin-top:2px;}
.filter-row{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:18px;align-items:center;}
.chip{border:1px solid var(--border);background:var(--card);padding:7px 14px;border-radius:999px;font-size:13px;font-weight:600;color:var(--muted);cursor:pointer;}
.chip.active{background:var(--navy);color:#fff;border-color:var(--navy);}
.search-input{border:1px solid var(--border);border-radius:999px;padding:8px 16px;font-size:13px;min-width:200px;font-family:inherit;}
.hocha-badge{display:inline-flex;flex-direction:column;align-items:center;justify-content:center;background:var(--busyellow);color:var(--navy);border-radius:10px;padding:6px 10px;min-width:64px;box-shadow:inset 0 0 0 2px rgba(31,56,100,.25);}
.hocha-badge .num{font-size:16px;font-weight:800;line-height:1.1;}
.hocha-badge .branch{font-size:9px;font-weight:700;letter-spacing:.5px;}
.hocha-badge.retired{background:#DADFE6;color:#7A8291;}
.card-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:14px;}
.hocha-card{background:var(--card);border:1px solid var(--border);border-radius:var(--radius);padding:16px;display:flex;flex-direction:column;gap:10px;}
.hocha-card .head{display:flex;align-items:center;gap:10px;}
.hocha-card .head .meta{font-size:12px;color:var(--muted);}
.hocha-card dl{margin:0;font-size:13px;display:grid;grid-template-columns:56px 1fr;row-gap:6px;}
.hocha-card dt{color:var(--muted);}
.hocha-card dd{margin:0;font-weight:600;}
.tag{display:inline-block;background:#EEF0F3;color:var(--slate);font-size:11px;font-weight:700;padding:4px 8px;border-radius:6px;}
table{width:100%;border-collapse:collapse;background:var(--card);border-radius:var(--radius);overflow:hidden;}
thead th{background:var(--navy);color:#fff;font-size:12px;text-align:left;padding:11px 14px;font-weight:700;}
tbody td{padding:11px 14px;font-size:13px;border-bottom:1px solid var(--border);vertical-align:middle;}
tbody tr:last-child td{border-bottom:none;}
tbody tr:hover{background:#F8FAFD;}
.badge{display:inline-block;padding:4px 10px;border-radius:999px;font-size:11px;font-weight:700;}
.badge.green{background:#E7F6EC;color:var(--green);}
.badge.gray{background:#EEF0F3;color:var(--muted);}
.section-title{font-size:14px;font-weight:800;color:var(--navy);margin:26px 0 10px;display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;}
.export-btn{background:var(--card);border:1px solid var(--slate);color:var(--slate);font-weight:700;font-size:12.5px;padding:8px 14px;border-radius:999px;cursor:pointer;white-space:nowrap;}
.export-btn:hover{background:var(--slate);color:#fff;}
.empty{text-align:center;padding:80px 20px;color:var(--muted);}
.empty .icon{font-size:40px;margin-bottom:10px;}
footer{text-align:center;font-size:11px;color:var(--muted);padding:20px;}
@media (max-width:640px){
  .topbar,.tabs,main{padding-left:16px;padding-right:16px;}
  thead{display:none;}
  table,tbody,tr,td{display:block;width:100%;}
  tbody tr{border:1px solid var(--border);border-radius:10px;margin-bottom:10px;padding:8px;}
  tbody td{border-bottom:none;padding:6px 8px;}
  tbody td::before{content:attr(data-label);display:block;font-size:10px;color:var(--muted);font-weight:700;margin-bottom:2px;}
}
</style>
</head>
<body>
<header class="topbar">
  <div class="brand">
    <div class="brand-badge" aria-hidden="true">
      <svg viewBox="0 0 24 32" fill="none"><rect x="2" y="6" width="20" height="14" rx="3" fill="#FFC72C"/><rect x="4" y="8" width="6" height="5" rx="1" fill="#24467D"/><rect x="14" y="8" width="6" height="5" rx="1" fill="#24467D"/><circle cx="7" cy="24" r="3" fill="#fff"/><circle cx="17" cy="24" r="3" fill="#fff"/></svg>
    </div>
    <div>
      <h1>호차현황판</h1>
      <p>바론 셔틀 운영 대시보드 형식 · ${DATA_DATE} 기준 ${hocha.length}개 호차</p>
    </div>
  </div>
  <div class="upload-wrap">
    <span class="file-status" id="fileStatus">엑셀 자료 반영됨 (${hocha.length}호차)</span>
    <button type="button" class="upload-btn secondary" id="saveLocalBtn">💾 로컬 저장</button>
    <button type="button" class="upload-btn" id="uploadBtn">엑셀 업로드</button>
    <input type="file" id="fileInput" accept=".xlsx,.xls">
  </div>
</header>

<nav class="tabs" id="tabsBar"></nav>

<main>
  <section id="view-hocha" class="view active">
    <div id="hocha-stats" class="stat-row"></div>
    <div class="filter-row">
      <div id="branch-filter"></div>
      <input type="search" class="search-input" id="hocha-search" placeholder="호차번호·기사명 검색">
    </div>
    <div id="hocha-grid" class="card-grid"></div>
    <div class="section-title">
      <span>전체 목록 (표)</span>
      <button type="button" class="export-btn" id="hocha-export">⬇ 현재 목록 엑셀로 내보내기</button>
    </div>
    <div style="overflow-x:auto;">
      <table>
        <thead><tr>
          <th>호차</th><th>분원</th><th>기사</th><th>동승자</th><th>차량</th><th>업체</th><th>비고</th>
        </tr></thead>
        <tbody id="hocha-table-body"></tbody>
      </table>
    </div>
  </section>

  <section id="view-staff" class="view">
    <div id="staff-stats" class="stat-row"></div>
    <div class="filter-row">
      <button type="button" class="chip active" data-role="전체">전체</button>
      <button type="button" class="chip" data-role="기사">기사</button>
      <button type="button" class="chip" data-role="동승자">동승자</button>
      <input type="search" class="search-input" id="staff-search" placeholder="이름 검색">
    </div>
    <div class="section-title">
      <span>기사·동승자 목록</span>
      <button type="button" class="export-btn" id="staff-export">⬇ 엑셀 내보내기</button>
    </div>
    <div style="overflow-x:auto;">
      <table>
        <thead><tr>
          <th>이름</th><th>역할</th><th>배정호차</th><th>소속분원</th><th>소속업체</th>
        </tr></thead>
        <tbody id="staff-body"></tbody>
      </table>
    </div>
  </section>

  <section id="view-vehicle" class="view">
    <div id="vehicle-stats" class="stat-row"></div>
    <div class="section-title">
      <span>차량 목록</span>
      <button type="button" class="export-btn" id="vehicle-export">⬇ 차량 내보내기</button>
    </div>
    <div style="overflow-x:auto;margin-bottom:24px;">
      <table>
        <thead><tr>
          <th>차량번호</th><th>배정호차</th><th>소속분원</th><th>소유형태</th><th>업체</th>
        </tr></thead>
        <tbody id="vehicle-body"></tbody>
      </table>
    </div>
    <div class="section-title">
      <span>업체 목록</span>
      <button type="button" class="export-btn" id="company-export">⬇ 업체 내보내기</button>
    </div>
    <div style="overflow-x:auto;">
      <table>
        <thead><tr>
          <th>업체명</th><th>담당 호차 수</th><th>호차 목록</th>
        </tr></thead>
        <tbody id="company-body"></tbody>
      </table>
    </div>
  </section>
</main>

<footer>호차현황판 · ${DATA_DATE} 엑셀 자료 기반 · 엑셀 업로드로 최신화 가능</footer>

<script>
const BRANCHES = ${JSON.stringify(BRANCHES)};
const INITIAL_DATA = ${JSON.stringify(hocha)};
const STORAGE_KEY = 'hocha_dashboard_v1';

let state = { hocha: [] };
let activeTabKey = 'hocha';
let activeBranch = '전체';
let hochaSearchTerm = '';
let staffRoleFilter = '전체';
let staffSearchTerm = '';
const current = { hocha: [], staff: [], vehicle: [], company: [] };

const TABS = [
  { key: 'hocha', label: '호차현황판', view: 'view-hocha' },
  { key: 'staff', label: '기사·동승자현황', view: 'view-staff' },
  { key: 'vehicle', label: '차량·업체현황', view: 'view-vehicle' },
];

function loadState() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed.hocha) && parsed.hocha.length) {
        state = parsed;
        return;
      }
    }
  } catch (e) { console.warn(e); }
  state = { hocha: INITIAL_DATA.slice() };
}

function saveLocal() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  document.getElementById('fileStatus').textContent =
    '로컬 저장 완료 (' + state.hocha.length + '호차 · ' + new Date().toLocaleTimeString('ko-KR') + ')';
}

function todayStamp() {
  const d = new Date();
  return d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0');
}

function exportExcel(rows, sheetName, filenamePrefix) {
  if (!rows || !rows.length) { alert('내보낼 자료가 없습니다.'); return; }
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  XLSX.writeFile(wb, filenamePrefix + '_' + todayStamp() + '.xlsx');
}

function readHochaSheet(wb) {
  const name = wb.SheetNames.find(n => n === '호차현황' || n === '호차') || wb.SheetNames[0];
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[name], { defval: '' });
  return rows.filter(r =>
    String(r['호차번호'] || '').trim() &&
    (r['현재기사(이름)'] || r['현재동승자(이름)'] || r['현재차량(차량번호)'])
  );
}

function fmtDate(v) {
  if (!v) return '-';
  const d = new Date(v);
  return isNaN(d) ? String(v) : d.toISOString().slice(0, 10);
}

function renderTabs() {
  const bar = document.getElementById('tabsBar');
  bar.innerHTML = '';
  TABS.forEach(t => {
    const btn = document.createElement('button');
    btn.className = 'tab-btn' + (t.key === activeTabKey ? ' active' : '');
    btn.textContent = t.label;
    btn.addEventListener('click', () => {
      activeTabKey = t.key;
      renderTabs();
      document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
      document.getElementById(t.view).classList.add('active');
    });
    bar.appendChild(btn);
  });
}

function renderBranchFilter() {
  const wrap = document.getElementById('branch-filter');
  wrap.innerHTML = '';
  ['전체', ...BRANCHES].forEach(b => {
    const chip = document.createElement('button');
    chip.className = 'chip' + (b === activeBranch ? ' active' : '');
    chip.textContent = b;
    chip.addEventListener('click', () => { activeBranch = b; renderHocha(); });
    wrap.appendChild(chip);
  });
}

function deriveStaff() {
  const map = new Map();
  state.hocha.forEach(r => {
    const hocha = r['호차번호'] || '';
    const branch = r['소속분원'] || '';
    const company = r['현재업체'] || '';
    const driver = String(r['현재기사(이름)'] || '').trim();
    const attendant = String(r['현재동승자(이름)'] || '').trim();
    if (driver) {
      const key = '기사|' + driver;
      if (!map.has(key)) map.set(key, { 이름: driver, 역할: '기사', 배정호차: hocha, 소속분원: branch, 소속업체: company });
      else {
        const ex = map.get(key);
        ex.배정호차 += ', ' + hocha;
      }
    }
    if (attendant) {
      const key = '동승자|' + attendant;
      if (!map.has(key)) map.set(key, { 이름: attendant, 역할: '동승자', 배정호차: hocha, 소속분원: branch, 소속업체: company });
      else {
        const ex = map.get(key);
        ex.배정호차 += ', ' + hocha;
      }
    }
  });
  return [...map.values()].sort((a, b) => a.이름.localeCompare(b.이름, 'ko'));
}

function deriveVehicles() {
  const map = new Map();
  state.hocha.forEach(r => {
    const car = String(r['현재차량(차량번호)'] || '').trim();
    if (!car) return;
    map.set(car, {
      '차량번호': car,
      '배정호차': r['호차번호'] || '',
      '소속분원': r['소속분원'] || '',
      '소유형태': r['비고'] || '',
      '업체': r['현재업체'] || '',
    });
  });
  return [...map.values()].sort((a, b) => a['차량번호'].localeCompare(b['차량번호'], 'ko'));
}

function deriveCompanies() {
  const map = new Map();
  state.hocha.forEach(r => {
    const name = String(r['현재업체'] || '').trim();
    if (!name) return;
    if (!map.has(name)) map.set(name, { '업체명': name, count: 0, hochas: [] });
    const ex = map.get(name);
    ex.count++;
    ex.hochas.push(r['호차번호'] || '');
  });
  return [...map.values()]
    .map(c => ({ '업체명': c['업체명'], '담당 호차 수': c.count, '호차 목록': c.hochas.join(', ') }))
    .sort((a, b) => a['업체명'].localeCompare(b['업체명'], 'ko'));
}

function renderHocha() {
  const rows = state.hocha;
  const active = rows.filter(r => !r['폐지일']);
  const byBranch = {};
  BRANCHES.forEach(b => { byBranch[b] = active.filter(r => r['소속분원'] === b).length; });

  document.getElementById('hocha-stats').innerHTML =
    '<div class="stat-card"><div class="num">' + active.length + '</div><div class="label">운행중 호차</div></div>' +
    BRANCHES.map(b => '<div class="stat-card"><div class="num">' + byBranch[b] + '</div><div class="label">' + b + '</div></div>').join('');

  renderBranchFilter();
  let filtered = rows;
  if (activeBranch !== '전체') filtered = filtered.filter(r => r['소속분원'] === activeBranch);
  if (hochaSearchTerm) {
    const t = hochaSearchTerm.toLowerCase();
    filtered = filtered.filter(r =>
      String(r['호차번호']).toLowerCase().includes(t) ||
      String(r['현재기사(이름)']).toLowerCase().includes(t) ||
      String(r['현재동승자(이름)']).toLowerCase().includes(t)
    );
  }
  current.hocha = filtered;

  const grid = document.getElementById('hocha-grid');
  grid.innerHTML = filtered.length ? filtered.map(r => {
    const retired = !!r['폐지일'];
    return '<div class="hocha-card">' +
      '<div class="head">' +
        '<div class="hocha-badge' + (retired ? ' retired' : '') + '">' +
          '<span class="num">' + (r['호차번호'] || '-') + '</span>' +
          '<span class="branch">' + (r['소속분원'] || '') + '</span>' +
        '</div>' +
        '<div class="meta">' + (retired ? '폐지됨 · ' + fmtDate(r['폐지일']) : (r['개설일'] ? '개설 ' + fmtDate(r['개설일']) : '운행중')) + '</div>' +
      '</div>' +
      '<dl>' +
        '<dt>기사</dt><dd>' + (r['현재기사(이름)'] || '-') + '</dd>' +
        '<dt>동승자</dt><dd>' + (r['현재동승자(이름)'] || '-') + '</dd>' +
        '<dt>차량</dt><dd>' + (r['현재차량(차량번호)'] || '-') + '</dd>' +
        '<dt>업체</dt><dd>' + (r['현재업체'] || '-') + '</dd>' +
      '</dl>' +
      (r['비고'] ? '<span class="tag">' + r['비고'] + '</span>' : '') +
    '</div>';
  }).join('') : '<div class="empty"><div class="icon">🚌</div>조건에 맞는 호차가 없습니다.</div>';

  document.getElementById('hocha-table-body').innerHTML = filtered.map(r =>
    '<tr>' +
      '<td data-label="호차">' + (r['호차번호'] || '-') + '</td>' +
      '<td data-label="분원">' + (r['소속분원'] || '-') + '</td>' +
      '<td data-label="기사">' + (r['현재기사(이름)'] || '-') + '</td>' +
      '<td data-label="동승자">' + (r['현재동승자(이름)'] || '-') + '</td>' +
      '<td data-label="차량">' + (r['현재차량(차량번호)'] || '-') + '</td>' +
      '<td data-label="업체">' + (r['현재업체'] || '-') + '</td>' +
      '<td data-label="비고">' + (r['비고'] || '-') + '</td>' +
    '</tr>'
  ).join('');
}

function renderStaff() {
  let rows = deriveStaff();
  if (staffRoleFilter !== '전체') rows = rows.filter(r => r.역할 === staffRoleFilter);
  if (staffSearchTerm) {
    const t = staffSearchTerm.toLowerCase();
    rows = rows.filter(r => String(r.이름).toLowerCase().includes(t));
  }
  current.staff = rows;
  const all = deriveStaff();
  document.getElementById('staff-stats').innerHTML =
    '<div class="stat-card"><div class="num">' + all.length + '</div><div class="label">전체 인원</div></div>' +
    '<div class="stat-card"><div class="num">' + all.filter(r => r.역할 === '기사').length + '</div><div class="label">기사</div></div>' +
    '<div class="stat-card"><div class="num">' + all.filter(r => r.역할 === '동승자').length + '</div><div class="label">동승자</div></div>';

  document.getElementById('staff-body').innerHTML = rows.length ? rows.map(r =>
    '<tr>' +
      '<td data-label="이름">' + r.이름 + '</td>' +
      '<td data-label="역할"><span class="badge gray">' + r.역할 + '</span></td>' +
      '<td data-label="배정호차">' + r.배정호차 + '</td>' +
      '<td data-label="소속분원">' + r.소속분원 + '</td>' +
      '<td data-label="소속업체">' + (r.소속업체 || '-') + '</td>' +
    '</tr>'
  ).join('') : '<tr><td colspan="5" style="text-align:center;color:var(--muted);">조건에 맞는 인원이 없습니다.</td></tr>';
}

function renderVehicleCompany() {
  const vehicles = deriveVehicles();
  const companies = deriveCompanies();
  current.vehicle = vehicles;
  current.company = companies;

  document.getElementById('vehicle-stats').innerHTML =
    '<div class="stat-card"><div class="num">' + vehicles.length + '</div><div class="label">전체 차량</div></div>' +
    '<div class="stat-card"><div class="num">' + companies.length + '</div><div class="label">전체 업체</div></div>' +
    '<div class="stat-card"><div class="num">' + vehicles.filter(v => v['소유형태'] === '전세').length + '</div><div class="label">전세 차량</div></div>';

  document.getElementById('vehicle-body').innerHTML = vehicles.map(v =>
    '<tr>' +
      '<td data-label="차량번호">' + v['차량번호'] + '</td>' +
      '<td data-label="배정호차">' + v['배정호차'] + '</td>' +
      '<td data-label="소속분원">' + v['소속분원'] + '</td>' +
      '<td data-label="소유형태">' + (v['소유형태'] || '-') + '</td>' +
      '<td data-label="업체">' + (v['업체'] || '-') + '</td>' +
    '</tr>'
  ).join('');

  document.getElementById('company-body').innerHTML = companies.length ? companies.map(c =>
    '<tr>' +
      '<td data-label="업체명">' + c['업체명'] + '</td>' +
      '<td data-label="담당 호차 수">' + c['담당 호차 수'] + '</td>' +
      '<td data-label="호차 목록">' + c['호차 목록'] + '</td>' +
    '</tr>'
  ).join('') : '<tr><td colspan="3" style="text-align:center;color:var(--muted);">등록된 업체가 없습니다 (개인·지입 호차는 업체 미기재)</td></tr>';
}

function renderAll() {
  renderHocha();
  renderStaff();
  renderVehicleCompany();
}

document.getElementById('uploadBtn').addEventListener('click', () => document.getElementById('fileInput').click());
document.getElementById('saveLocalBtn').addEventListener('click', saveLocal);
document.getElementById('fileInput').addEventListener('change', e => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    try {
      const wb = XLSX.read(ev.target.result, { type: 'array', cellDates: true });
      state.hocha = readHochaSheet(wb);
      document.getElementById('fileStatus').textContent = '"' + file.name + '" 반영됨 (' + state.hocha.length + '호차)';
      renderAll();
    } catch (err) {
      console.error(err);
      alert('업로드 실패: 호차현황 시트 형식을 확인해주세요.');
    }
  };
  reader.readAsArrayBuffer(file);
  e.target.value = '';
});

document.getElementById('hocha-search').addEventListener('input', e => {
  hochaSearchTerm = e.target.value.trim();
  renderHocha();
});
document.querySelectorAll('#view-staff [data-role]').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#view-staff [data-role]').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    staffRoleFilter = btn.dataset.role;
    renderStaff();
  });
});
document.getElementById('staff-search').addEventListener('input', e => {
  staffSearchTerm = e.target.value.trim();
  renderStaff();
});

document.getElementById('hocha-export').addEventListener('click', () => exportExcel(current.hocha, '호차현황', '호차현황판'));
document.getElementById('staff-export').addEventListener('click', () => exportExcel(current.staff, '기사동승자현황', '기사동승자현황'));
document.getElementById('vehicle-export').addEventListener('click', () => exportExcel(current.vehicle, '차량현황', '차량현황'));
document.getElementById('company-export').addEventListener('click', () => exportExcel(current.company, '업체현황', '업체현황'));

loadState();
renderTabs();
renderAll();
<\/script>
</body>
</html>`;

fs.writeFileSync(outPath, html, 'utf8');
console.log('Written:', outPath, '(' + hocha.length + ' hocha records)');
