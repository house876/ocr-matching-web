// App.js
import React, { useState } from 'react';
import axios from 'axios';
import Tesseract from 'tesseract.js';

function App() {
  const [imageFile, setImageFile] = useState(null);
  const [ocrText, setOcrText] = useState('');
  const [tableData, setTableData] = useState([]); // OCR 파싱 결과
  const [matchedData, setMatchedData] = useState([]); // 서버 매칭 결과
  const [loading, setLoading] = useState(false);

  // 이미지 파일 선택
  const handleImageChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      setImageFile(e.target.files[0]);
    }
  };

  // 클립보드로부터 이미지 붙여넣기
  const handlePaste = (e) => {
    const items = e.clipboardData.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        const blob = items[i].getAsFile();
        setImageFile(blob);
      }
    }
  };

  // OCR 실행
  const handleOcr = async () => {
    if (!imageFile) {
      alert('이미지를 먼저 선택하거나 붙여넣어주세요!');
      return;
    }
    setLoading(true);
    try {
      const result = await Tesseract.recognize(imageFile, 'eng', {
        // lang 세팅 (기본 eng)
        logger: (m) => console.log(m),
      });
      const text = result.data.text;
      setOcrText(text);
      console.log('OCR 추출 텍스트:', text);

      // OCR 텍스트를 파싱하여 tableData 형태로 변환
      // 예: 라인별로 분해 후, 헤더("명칭 재료 수량 규격" 등)는 제외
      const lines = text.split('\n').map((line) => line.trim()).filter(Boolean);

      // 간단한 파싱 로직 예시
      const parsedItems = [];
      lines.forEach((line) => {
        // 헤더 문자열 포함 여부 체크 (예: "명칭", "재료", "수량", "규격" 등)
        if (
          line.includes('명칭') ||
          line.includes('DESCRIPTION') ||
          line.includes('재료') ||
          line.includes('수량') ||
          line.includes('규격') ||
          line.includes('SPECS')
        ) {
          // 표 헤더로 간주 → 무시
          return;
        }

        // 쉼표(,) 또는 슬래시(/)가 있다면 여러 품목으로 분리
        // 예) "HEX SOCKET HEAD BOLT/SW/PW,NUT"
        const delimiters = /[,/]+/; // , 또는 /로 split
        const splitted = line.split(delimiters).map((x) => x.trim()).filter(Boolean);

        if (splitted.length > 1) {
          // 예: "HEX SOCKET HEAD BOLT", "SW", "PW", "NUT" ...
          splitted.forEach((desc) => {
            // 일단 여기서는 규격, 수량 등을 단순하게 가정
            // 실제론 OCR 결과가 여러 줄에 나올 수도 있어서, 맞춤 처리 필요
            parsedItems.push({
              description: desc,
              qty: 1, // 임의
              spec: 'No Spec', // 임의
            });
          });
        } else {
          // 구분자가 없을 경우 한 품목으로 처리
          parsedItems.push({
            description: line,
            qty: 1, 
            spec: 'No Spec',
          });
        }
      });

      setTableData(parsedItems);
    } catch (error) {
      console.error('OCR 에러:', error);
      alert('OCR 처리 중 오류가 발생했습니다. 콘솔을 확인하세요.');
    }
    setLoading(false);
  };

  // 서버 매칭 요청
  const handleMatch = async () => {
    if (tableData.length === 0) {
      alert('OCR로 추출된 항목이 없습니다. 먼저 OCR을 실행해주세요!');
      return;
    }
    try {
      const response = await axios.post('http://localhost:5000/api/match', {
        items: tableData,
      });
      setMatchedData(response.data.matchedResults);
    } catch (error) {
      console.error('매칭 요청 에러:', error);
    }
  };

  return (
    <div onPaste={handlePaste} style={{ padding: '20px' }}>
      <h1>이미지 OCR + 엑셀 매칭 예제</h1>
      <div style={{ marginBottom: '10px' }}>
        <input type="file" accept="image/*" onChange={handleImageChange} />
        <button onClick={handleOcr} disabled={loading}>
          {loading ? 'OCR 처리 중...' : 'OCR 실행'}
        </button>
        <button onClick={handleMatch}>매칭 실행</button>
      </div>

      <div style={{ marginBottom: '10px' }}>
        <h3>OCR 결과</h3>
        <textarea
          rows="10"
          cols="50"
          value={ocrText}
          readOnly
          placeholder="OCR 추출 텍스트가 표시됩니다."
        />
      </div>

      <div>
        <h3>OCR 파싱 테이블</h3>
        <table border="1" cellPadding="5">
          <thead>
            <tr>
              <th>명칭(DESCRIPTION)</th>
              <th>수량(Q.TY)</th>
              <th>규격(SPEC)</th>
            </tr>
          </thead>
          <tbody>
            {tableData.map((item, idx) => (
              <tr key={idx}>
                <td>{item.description}</td>
                <td>{item.qty}</td>
                <td>{item.spec}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: '20px' }}>
        <h3>매칭 결과</h3>
        <table border="1" cellPadding="5">
          <thead>
            <tr>
              <th>명칭(DESCRIPTION)</th>
              <th>수량(Q.TY)</th>
              <th>규격(SPEC)</th>
              <th>엑셀 품번</th>
              <th>유사도(%)</th>
            </tr>
          </thead>
          <tbody>
            {matchedData.map((item, idx) => (
              <tr key={idx}>
                <td>{item.description}</td>
                <td>{item.qty}</td>
                <td>{item.spec}</td>
                <td>{item.excelItem ? item.excelItem['품번'] : ''}</td>
                <td>{item.similarity}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default App;
