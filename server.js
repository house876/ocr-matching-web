/**
 * server.js
 * 
 * 주요 기능 요약:
 *  - 이미지 업로드(파일 또는 붙여넣기) → 서버에 전달
 *  - sharp로 흑백+threshold 전처리
 *  - Tesseract.js로 OCR 후, "명칭 / 재질 / 수량 / 규격" 파싱
 *  - 콤마/슬래시 분할, 수량은 숫자만 추출
 *  - 다중 시트 엑셀(mydata.xlsx)과 fuzzy match(40% 기준)
 *  - 결과를 matchedItems / unmatchedItems로 구분하여 응답
 */

const express = require('express');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
const path = require('path');

const sharp = require('sharp');
const Tesseract = require('tesseract.js');
const XLSX = require('xlsx');
const stringSimilarity = require('string-similarity');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ------------------------------------------------------
// [A] multer 설정: 업로드 폴더 & 파일이름
// ------------------------------------------------------
const storage = multer.diskStorage({
  destination: './uploads',
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  },
});
const upload = multer({ storage });

// ------------------------------------------------------
// [B] 여러 시트 엑셀 로딩 (mydata.xlsx)
//     시트마다 어떤 열이 있는지는 실제 파일에 맞춰 수정 필요
// ------------------------------------------------------
let multiSheetData = [];
try {
  const workbook = XLSX.readFile('./mydata.xlsx'); // 현재 폴더 기준 (조정 가능)
  const sheetNames = workbook.SheetNames;
  
  sheetNames.forEach(sheetName => {
    const ws = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(ws); // 각 행을 JS 객체로
    multiSheetData.push({
      sheetName,
      data: rows
    });
  });

  console.log('✅ [윤성 구매품 품번박사🧓] 엑셀 로딩 완료:', multiSheetData.length, '개 시트');
} catch (err) {
  console.error('❌ 엑셀(mydata.xlsx) 로딩 실패:', err);
}

// ------------------------------------------------------
// [C] 이미지 전처리: 흑백 + threshold
// ------------------------------------------------------
async function preprocessImage(inputPath, outputPath) {
  await sharp(inputPath)
    .grayscale()
    .threshold(180) // 필요시 값 조정
    .toFile(outputPath);
}

// ------------------------------------------------------
// [D] OCR 수행 (Tesseract.js)
// ------------------------------------------------------
async function performOCR(originalPath) {
  try {
    const ext = path.extname(originalPath);
    const processedPath = originalPath.replace(ext, `_processed${ext}`);

    // 1) 전처리
    await preprocessImage(originalPath, processedPath);

    // 2) OCR
    const { data: { text } } = await Tesseract.recognize(processedPath, 'eng', {
      logger: (m) => console.log('[OCR 진행]', m),
    });
    console.log('🔎 OCR 결과:\n', text);
    return text;
  } catch (err) {
    console.error('❌ OCR 실패:', err);
    return '';
  }
}

// ------------------------------------------------------
// [E] 문자열 전처리(유사도용)
// ------------------------------------------------------
function normalizeStr(str) {
  return str
    .toUpperCase()
    .replace(/[^A-Z0-9가-힣]/g, '')
    .trim();
}

// ------------------------------------------------------
// [F] 수량에서 숫자만 추출
// ------------------------------------------------------
function extractDigits(str) {
  const digits = str.replace(/\D/g, ''); // 숫자 이외 제거
  return digits || '0'; // 없으면 '0'
}

// ------------------------------------------------------
// [G] 명칭 분리/치환 (콤마/슬래시)
// ------------------------------------------------------
const nameReplacements = {
  'HEX SOCKET HEAD BOLT': 'HEX BOLT',
  'SW': 'SW (SPRING WASHER)',
  'PW': 'PW (PLAIN WASHER)',
  'NUT': 'NUT',
  // 필요시 추가
};
function splitName(rawName, rawMaterial, rawQuantity, rawSpec) {
  // 콤마(/)나 슬래시(/)로 분리
  const parts = rawName.split(/[,/]+/).map(x => x.trim()).filter(Boolean);
  const results = [];

  parts.forEach((part) => {
    const upper = part.toUpperCase();
    if (nameReplacements[upper]) {
      results.push({
        name: nameReplacements[upper],
        material: rawMaterial,
        quantity: rawQuantity,
        spec: rawSpec
      });
    } else {
      // 치환 테이블에 없는 경우 그대로
      results.push({
        name: part,
        material: rawMaterial,
        quantity: rawQuantity,
        spec: rawSpec
      });
    }
  });

  return results;
}

// ------------------------------------------------------
// [H] OCR 텍스트 → 행 단위 파싱
//     "명칭, 재질, 수량, 규격" 순서를 가정
//     표 헤더나 무관행(순번, 비고, remarks 등)은 무시
// ------------------------------------------------------
function parseOCRText(fullText) {
  const lines = fullText
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0);

  const filtered = lines.filter(line => {
    const lower = line.toLowerCase();
    // "명칭 재료 수량 규격", "p.no", "비고", "remarks" 등 무시
    if (
      lower.includes('명칭') && lower.includes('재료') && lower.includes('수량') && lower.includes('규격')
    ) return false;
    if (lower.includes('p.no') || lower.includes('비고') || lower.includes('remarks')) return false;
    return true;
  });

  const parsedItems = [];
  filtered.forEach((line) => {
    const tokens = line.split(/\s+/);
    if (tokens.length < 4) {
      // 최소 4토큰: [명칭, 재질, 수량, 규격...]
      parsedItems.push({
        parseError: true,
        rawLine: line,
        reason: '토큰부족',
      });
      return;
    }

    // 순서대로
    const [rawName, rawMaterial, rawQty, ...rest] = tokens;
    const rawSpec = rest.join(' ');

    // 수량에서 숫자만
    const quantity = extractDigits(rawQty);

    // 콤마/슬래시로 분리 치환
    const splitted = splitName(rawName, rawMaterial, quantity, rawSpec);
    splitted.forEach((s) => {
      parsedItems.push({
        parseError: false,
        name: s.name,
        material: s.material,
        quantity: s.quantity,
        spec: s.spec
      });
    });
  });

  return parsedItems;
}

// ------------------------------------------------------
// [I] 유사도 계산 로직
//     multiSheetData를 순회하며 최고 유사도를 찾는다
// ------------------------------------------------------
function calcSimilarity(ocrItem, rowData) {
  // 엑셀 열 이름을 실제로 맞추세요 (예: '명칭', '재질', '사양'...)
  // 여기선 가정으로 '자재명', '재질', '규격', '품번' ... etc
  const rowString = `
    ${rowData['자재명'] || ''} 
    ${rowData['재질'] || ''} 
    ${rowData['규격'] || ''} 
    ${rowData['품번'] || ''}
  `;
  const rowNorm = normalizeStr(rowString);

  const ocrNorm = normalizeStr(`${ocrItem.name} ${ocrItem.material} ${ocrItem.spec}`);
  return stringSimilarity.compareTwoStrings(ocrNorm, rowNorm);
}

function findBestMatch(ocrItem) {
  let bestScore = 0;
  let bestSheet = null;
  let bestRow = null;

  for (const sheet of multiSheetData) {
    for (const row of sheet.data) {
      const sim = calcSimilarity(ocrItem, row);
      if (sim > bestScore) {
        bestScore = sim;
        bestSheet = sheet.sheetName;
        bestRow = row;
      }
    }
  }

  // 매칭률 40% 미만 → null
  if (bestScore < 0.40) return null;

  return {
    sheetName: bestSheet,
    rowData: bestRow,
    score: bestScore
  };
}

// ------------------------------------------------------
// [J] /upload - 이미지 업로드 → OCR → 파싱 → 매칭
// ------------------------------------------------------
app.post('/upload', upload.single('image'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: '이미지 파일이 없습니다.' });
  }
  try {
    // 1) OCR
    const text = await performOCR(req.file.path);

    // 2) 파싱
    const parsed = parseOCRText(text);

    // 3) 매칭 수행
    const matchedItems = [];
    const unmatchedItems = [];

    parsed.forEach((item, idx) => {
      const seq = idx + 1;

      // 파싱 오류
      if (item.parseError) {
        unmatchedItems.push({
          seq,
          name: item.rawLine,
          spec: '-',
          quantity: '-',
          reason: `파싱오류(${item.reason})`
        });
        return;
      }

      // 매칭
      const best = findBestMatch(item);
      if (!best) {
        // 매칭률 40% 미만
        unmatchedItems.push({
          seq,
          name: item.name,
          spec: item.spec,
          quantity: item.quantity,
          reason: '매칭률 40% 미만',
        });
      } else {
        // 매칭 성공
        const row = best.rowData;
        const pn = row['품번'] || '(품번없음)';
        matchedItems.push({
          seq,
          pn,
          name: item.name,
          spec: item.spec,
          quantity: item.quantity,
          matchRate: (best.score * 100).toFixed(0) + '%',
        });
      }
    });

    // 업로드 파일 정리(선택적으로 파일 삭제)
    fs.unlink(req.file.path, () => { /* 무시 */ });

    // 응답
    res.json({ matchedItems, unmatchedItems });
  } catch (err) {
    console.error('❌ 서버 오류:', err);
    res.status(500).json({ error: '서버 내부 오류' });
  }
});

// ------------------------------------------------------
// [K] 서버 실행
// ------------------------------------------------------
const PORT = 3001;
app.listen(PORT, () => {
  console.log(`🚀 [윤성 구매품 품번박사🧓] 서버 시작: http://localhost:${PORT}`);
});
