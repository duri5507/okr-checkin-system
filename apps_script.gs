// ============================================================
// HUNET 조직 성과 체크인 시스템 — Google Apps Script
//
// [설치 방법]
// 1. Google Sheets 새 파일 생성
// 2. 상단 메뉴 → 확장 프로그램 → Apps Script
// 3. 기존 코드 전체 삭제 후 이 파일 내용 붙여넣기
// 4. 저장 (Ctrl+S)
// 5. 배포 → 새 배포 → 웹 앱
//    - 다음 사용자로 실행: 나 (본인 계정)
//    - 액세스 권한: 모든 사용자
// 6. 배포 후 나오는 URL을 HTML 시스템에 입력
// ============================================================

const SS = SpreadsheetApp.getActiveSpreadsheet();
const ROUND_SHEET   = '회차관리';
const CHECKIN_SHEET = '체크인데이터';

// ── 시트 초기화 ──────────────────────────────────────────────
function initSheets() {
  let rs = SS.getSheetByName(ROUND_SHEET);
  if (!rs) {
    rs = SS.insertSheet(ROUND_SHEET);
    rs.appendRow(['회차명','기간/설명','활성여부','생성일시']);
    rs.getRange(1,1,1,4).setFontWeight('bold')
      .setBackground('#1e3a5f').setFontColor('white');
    rs.setColumnWidth(1,200); rs.setColumnWidth(2,250);
  }
  let cs = SS.getSheetByName(CHECKIN_SHEET);
  if (!cs) {
    cs = SS.insertSheet(CHECKIN_SHEET);
    cs.appendRow(['회차','본부','팀명','제출일시','데이터(JSON)']);
    cs.getRange(1,1,1,5).setFontWeight('bold')
      .setBackground('#1e3a5f').setFontColor('white');
    cs.setColumnWidth(5,600);
  }
}

// ── GET 요청 ─────────────────────────────────────────────────
function doGet(e) {
  try {
    initSheets();
    const action = (e.parameter && e.parameter.action) || '';
    const cb     = (e.parameter && e.parameter.callback) || '';
    let result;

    if      (action === 'getRounds')   result = getRoundsData();
    else if (action === 'getCheckins') result = getCheckinsData(e.parameter.round || '');
    else                               result = {error: 'Unknown action'};

    const json = JSON.stringify(result);
    if (cb) {
      return ContentService.createTextOutput(cb + '(' + json + ')')
        .setMimeType(ContentService.MimeType.JAVASCRIPT);
    }
    return ContentService.createTextOutput(json)
      .setMimeType(ContentService.MimeType.JSON);
  } catch(err) {
    return ContentService.createTextOutput(JSON.stringify({error: err.toString()}))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// ── POST 요청 ────────────────────────────────────────────────
function doPost(e) {
  try {
    initSheets();
    const body = JSON.parse(e.postData.contents);
    let result;

    if      (body.action === 'submitCheckin') result = saveCheckin(body.data);
    else if (body.action === 'addRound')      result = addRound(body.data);
    else if (body.action === 'toggleRound')   result = toggleRound(body.name, body.active);
    else if (body.action === 'deleteRound')   result = deleteRound(body.name);
    else                                      result = {error: 'Unknown action'};

    return ContentService.createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);
  } catch(err) {
    return ContentService.createTextOutput(JSON.stringify({error: err.toString()}))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// ── 회차 관련 ────────────────────────────────────────────────
function getRoundsData() {
  const sheet = SS.getSheetByName(ROUND_SHEET);
  const last  = sheet.getLastRow();
  if (last <= 1) return [];
  return sheet.getRange(2,1,last-1,4).getValues()
    .filter(r => r[0])
    .map(r => ({
      name:      r[0].toString(),
      period:    r[1].toString(),
      active:    r[2] === true || r[2].toString().toLowerCase() === 'true',
      createdAt: r[3].toString()
    }));
}

function addRound(data) {
  if (getRoundsData().find(r => r.name === data.name))
    return {success:false, error:'동일한 이름의 회차가 이미 있습니다.'};
  const sheet = SS.getSheetByName(ROUND_SHEET);
  const nextRow = sheet.getLastRow() + 1;
  sheet.appendRow([data.name, data.period||'', data.active, new Date().toLocaleString('ko-KR')]);
  // 기간 셀을 텍스트 형식으로 강제 지정 (구글 시트 자동 날짜 변환 방지)
  sheet.getRange(nextRow, 2).setNumberFormat('@');
  return {success:true};
}

function toggleRound(name, active) {
  const sheet = SS.getSheetByName(ROUND_SHEET);
  const last  = sheet.getLastRow();
  if (last <= 1) return {success:false};
  const rows = sheet.getRange(2,1,last-1,1).getValues();
  for (let i=0; i<rows.length; i++) {
    if (rows[i][0] === name) {
      sheet.getRange(i+2,3).setValue(active);
      return {success:true};
    }
  }
  return {success:false, error:'회차를 찾을 수 없습니다.'};
}

function deleteRound(name) {
  const sheet = SS.getSheetByName(ROUND_SHEET);
  const last  = sheet.getLastRow();
  if (last <= 1) return {success:false};
  const rows = sheet.getRange(2,1,last-1,1).getValues();
  for (let i=0; i<rows.length; i++) {
    if (rows[i][0] === name) { sheet.deleteRow(i+2); return {success:true}; }
  }
  return {success:false, error:'회차를 찾을 수 없습니다.'};
}

// ── 체크인 관련 ──────────────────────────────────────────────
function getCheckinsData(round) {
  const sheet = SS.getSheetByName(CHECKIN_SHEET);
  const last  = sheet.getLastRow();
  if (last <= 1) return {};
  const rows   = sheet.getRange(2,1,last-1,5).getValues();
  const result = {};
  rows.forEach(r => {
    if (!r[0] || !r[2]) return;
    if (round && r[0] !== round) return;
    try { result[r[2].toString()] = JSON.parse(r[4].toString()); } catch(e){}
  });
  return result;
}

function saveCheckin(data) {
  const sheet = SS.getSheetByName(CHECKIN_SHEET);
  const last  = sheet.getLastRow();
  const json  = JSON.stringify(data);
  if (last > 1) {
    const rows = sheet.getRange(2,1,last-1,3).getValues();
    for (let i=0; i<rows.length; i++) {
      if (rows[i][0]===data.round && rows[i][2]===data.team) {
        sheet.getRange(i+2,1,1,5).setValues([[
          data.round, data.bunbu, data.team, data.submittedAt, json
        ]]);
        return {success:true, action:'updated'};
      }
    }
  }
  sheet.appendRow([data.round, data.bunbu, data.team, data.submittedAt, json]);
  return {success:true, action:'inserted'};
}
