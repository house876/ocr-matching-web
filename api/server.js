// server.js
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const XLSX = require('xlsx');
const stringSimilarity = require('string-similarity');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

// 엑셀 파일 로드 (예: mydata.xlsx)
let workbook;
try {
  // 실제로는 프로젝트 루트나, 서버(api) 폴더에 mydata.xlsx를 두고 경로를 맞춰주세요.
  const excelFilePath = path.join(__dirname, 'mydata.xlsx');
  workbook = XLSX.readFile(excelFilePath);
  console.log('엑셀 파일 로드 성공');
} catch (error) {
  console.error('엑셀 파일 로드 실패:', error);
}

const worksheet = workbook ? workbook.Sheets[workbook.SheetNames[0]] : null;
// 엑셀을 JS 객체로 변환
const excelData = worksheet ? XLSX.utils.sheet_to_json(worksheet) : [];

// 이미지 업로드를 위한 multer 설정 (필요 시)
const upload = multer({ dest: 'uploads/' });

// 문자열 유사도 측정 함수
function getSimilarity(str1, str2) {
  // 예시로 string-similarity 라이브러리를 사용
  // 결과값(0~1 범위)을 %로 환산하여 100 * value
  const value = stringSimilarity.compareTwoStrings(str1.toLowerCase(), str2.toLowerCase());
  return value * 100; 
}

// 명칭 치환 (예시: 'SW' -> 'SW (SPRING WASHER)' 등)
function convertName(name) {
  let trimmed = name.trim().toUpperCase();
  if (trimmed === 'SW') return 'SW (SPRING WASHER)';
  if (trimmed === 'PW') return 'PW (PLAIN WASHER)';
  if (trimmed === 'HEX SOCKET HEAD BOLT') return 'HEX BOLT';
  return name; // 변환 규칙 없으면 그대로
}

// OCR 결과를 받고, 엑셀과 매칭하는 라우트
app.post('/api/match', (req, res) => {
  /**
   * 프론트엔드에서 OCR 결과를 JSON 형태로 보내온다고 가정.
   * req.body.items = [
   *   { description: "HEX BOLT", qty: 5, spec: "M10 x 30" },
   *   ...
   * ]
   */

  const { items } = req.body;
  if (!items || !Array.isArray(items)) {
    return res.status(400).json({ message: 'Invalid data' });
  }

  const matchedResults = [];

  items.forEach((item) => {
    const { description, qty, spec } = item;
    let bestMatchRow = null;
    let bestMatchScore = 0;

    // 엑셀데이터(excelData) 반복하면서 유사도 계산
    excelData.forEach((row) => {
      // row 예시: { 품번: 'ABC123', 명칭: 'HEX BOLT', 규격: 'M10 x 30', ... }
      const nameInExcel = row['명칭']; 
      if (!nameInExcel) return;

      const similarity = getSimilarity(description, nameInExcel);
      if (similarity > bestMatchScore) {
        bestMatchScore = similarity;
        bestMatchRow = row;
      }
    });

    if (bestMatchScore >= 45) {
      // 45% 이상이면 매칭 성공
      matchedResults.push({
        description,
        qty,
        spec,
        excelItem: bestMatchRow,
        similarity: bestMatchScore.toFixed(2) + '%',
      });
    }
  });

  res.json({ matchedResults });
});

// 서버 실행
const PORT = 5000; // 포트번호는 원하는 것으로
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
