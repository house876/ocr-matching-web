import React, { useState } from 'react';
import axios from 'axios';
import Tesseract from 'tesseract.js';
import './App.css'; // ← 혹시 별도 CSS 파일을 쓰고 싶다면 임의로 추가

function App() {
  const [imageFile, setImageFile] = useState(null);
  const [ocrText, setOcrText] = useState('');
  const [tableData, setTableData] = useState([]); // OCR 파싱 결과
  const [matchedData, setMatchedData] = useState([]); // 최종 매칭 결과
  const [loading, setLoading] = useState(false);

  // ------------------------
  // 1) 이미지 파일 선택
  // ------------------------
  const handleImageChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      setImageFile(e.target.files[0]);
    }
  };

  // ------------------------
  // 2) 클립보드에서 이미지 붙여넣기
  // ------------------------
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

  // ------------------------
  // 3) OCR + 매칭 (버튼 하나로 통합)
  // ------------------------
  const handleOcrAndMatch = async () => {
    if (!imageFile) {
      alert('이미지를 먼저 선택하거나 붙여넣어주세요!');
      return;
    }
    setLoading(true);

    // (A) 먼저 OCR 처리
    try {
      const result = await Tesseract.recognize(imageFile, 'eng', {
        logger: (m) => console.log(m),
      });
      const text = result.data.text;
      setOcrText(text);
      console.log('OCR 추출 텍스트:', text);

      // OCR 결과 텍스트를 파싱해서 tableData 형태로 변환
      const lines = text.split('\n').map((line) => line.trim()).filter(Boolean);

      const parsedItems = [];
      lines.forEach((line) => {
        // BOM 헤더(예: '명칭','수량','규격' 등) 무시
        if (
          line.toLowerCase().includes('description') ||
          line.includes('명칭') ||
          line.includes('수량') ||
          line.includes('규격') ||
          line.includes('재료') ||
          line.includes('spec') 
        ) {
          return;
        }

        // 콤마/슬래시 구분
        const delimiters = /[,/]+/;
        const splitted = line.split(delimiters).map((x) => x.trim()).filter(Boolean);

        if (splitted.length > 1) {
          splitted.forEach((desc) => {
            parsedItems.push({
              description: desc,
              qty: 1,
              spec: 'No Spec',
            });
          });
        } else {
          parsedItems.push({
            description: line,
            qty: 1,
            spec: 'No Spec',
          });
        }
      });

      setTableData(parsedItems);

      // (B) OCR 파싱 결과를 서버에 매칭 요청
      try {
        const response = await axios.post('http://localhost:5000/api/match', {
          items: parsedItems,
        });
        // 서버 측에서 matchedResults = [{ description, qty, spec, excelItem, similarity }, ...]
        // 라고 돌려준다고 가정
        const { matchedResults } = response.data;

        // 매칭된 품목, 매칭 안 된 품목 다 합쳐서 한 테이블에 표시
        // 1) 매칭 성공 목록의 description을 키로 저장
        const successMap = {};
        matchedResults.forEach((m) => {
          successMap[m.description] = m;
        });

        // 2) 최종 결과 목록 만들기
        const finalResults = parsedItems.map((item) => {
          if (successMap[item.description]) {
            const successItem = successMap[item.description];
            return {
              excelPart: successItem.excelItem?.['품번'] || '(No Part)', 
              description: successItem.description,
              qty: successItem.qty,
              spec: successItem.spec,
              similarity: successItem.similarity, 
              matched: true,
            };
          } else {
            // 매칭 실패
            // 혹시 서버에서 "베스트 매치 스코어가 30%였다" 같은 정보를 보내주지 않는다면
            // 여기서는 '매칭 실패'라고만 표시할 수도 있음
            return {
              excelPart: '매칭실패',
              description: item.description,
              qty: item.qty,
              spec: item.spec,
              similarity: '유사도 <45%',
              matched: false,
            };
          }
        });

        setMatchedData(finalResults);
      } catch (matchErr) {
        console.error('매칭 요청 에러:', matchErr);
        alert('매칭 요청 중 오류가 발생했습니다 (콘솔 확인).');
      }
    } catch (error) {
      console.error('OCR 에러:', error);
      alert('OCR 처리 중 오류가 발생했습니다 (콘솔 확인).');
    }
    setLoading(false);
  };

  return (
    <div 
      onPaste={handlePaste}
      className="container"
      style={{
        backgroundColor: '#FFEFF6', // 파스텔 핑크 배경 예시
        minHeight: '100vh',
        padding: '20px',
        fontFamily: 'sans-serif',
      }}
    >
      {/* 5) 웹사이트 타이틀 변경 */}
      <h1 style={{ color: '#FF69B4' }}>윤성 구매품 품번박사🧓</h1>

      {/* 이미지 선택 + OCR + 매칭 합친 버튼 */}
      <div style={{ marginBottom: '10px' }}>
        <input type="file" accept="image/*" onChange={handleImageChange} />
        {/* 고양이 모양 이모지(또는 아이콘) + 버튼 디자인 */}
        <button
          onClick={handleOcrAndMatch}
          disabled={loading}
          style={{
            marginLeft: '10px',
            backgroundColor: '#FFC0CB',
            border: '2px solid #FF69B4',
            borderRadius: '20px',
            padding: '8px 16px',
            cursor: 'pointer',
            fontWeight: 'bold',
          }}
        >
          {loading ? '처리 중...' : 'OCR + 매칭 실행 🐱'}
        </button>
      </div>

      {/* OCR 추출 텍스트 박스 */}
      <div style={{ marginBottom: '10px' }}>
        <h3>OCR 결과</h3>
        <textarea
          rows="6"
          cols="60"
          value={ocrText}
          readOnly
          style={{ fontFamily: 'monospace' }}
          placeholder="OCR로 추출된 텍스트가 표시됩니다."
        />
      </div>

      {/* OCR 파싱 테이블 */}
      <div>
        <h3>OCR 파싱 테이블</h3>
        <table border="1" cellPadding="5" style={{ borderCollapse: 'collapse' }}>
          <thead style={{ backgroundColor: '#FFF0F5' }}>
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

      {/* 매칭 결과 테이블 (엑셀 품번이 제일 앞) */}
      <div style={{ marginTop: '20px' }}>
        <h3>매칭 결과</h3>
        <table border="1" cellPadding="5" style={{ borderCollapse: 'collapse' }}>
          <thead style={{ backgroundColor: '#FFF0F5' }}>
            <tr>
              <th>엑셀 품번</th>
              <th>명칭(DESCRIPTION)</th>
              <th>수량(Q.TY)</th>
              <th>규격(SPEC)</th>
              <th>유사도(%)</th>
            </tr>
          </thead>
          <tbody>
            {matchedData.map((item, idx) => (
              <tr key={idx} style={{ backgroundColor: item.matched ? '#ffffff' : '#ffd6d6' }}>
                <td>{item.excelPart}</td>
                <td>{item.description}</td>
                <td>{item.qty}</td>
                <td>{item.spec}</td>
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
