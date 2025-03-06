// App.js
import React, { useState } from "react";
import axios from "axios";
import "bootstrap/dist/css/bootstrap.min.css";

/**
 * 주의:
 * - "Ctrl+V"로 이미지 붙여넣기할 수 있도록, div에 onPaste 이벤트를 달아놓았습니다.
 * - 붙여넣거나 파일 선택 중 하나만 사용하셔도 됩니다.
 * - 버튼 클릭 시 업로드 → /upload → 서버에서 OCR+매칭 → 결과를 표시
 */
function App() {
  const [image, setImage] = useState(null);
  const [preview, setPreview] = useState(null);

  const [matchedItems, setMatchedItems] = useState([]);
  const [unmatchedItems, setUnmatchedItems] = useState([]);

  // (A) 파일 선택
  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      setImage(file);
      setPreview(URL.createObjectURL(file));
    }
  };

  // (B) Ctrl+V로 이미지 붙여넣기
  const handlePaste = (e) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf("image") !== -1) {
        const blob = items[i].getAsFile();
        if (blob) {
          setImage(blob);
          setPreview(URL.createObjectURL(blob));
        }
      }
    }
  };

  // (C) 업로드 & OCR+매칭
  const handleUpload = async () => {
    if (!image) {
      alert("이미지를 선택하거나 붙여넣기 하세요!");
      return;
    }
    const formData = new FormData();
    formData.append("image", image);

    try {
      const res = await axios.post("http://localhost:3001/upload", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      // 서버 응답: { matchedItems, unmatchedItems }
      setMatchedItems(res.data.matchedItems || []);
      setUnmatchedItems(res.data.unmatchedItems || []);
    } catch (err) {
      alert("업로드 중 에러: " + err);
      console.error(err);
    }
  };

  return (
    <div
      className="container mt-5"
      onPaste={handlePaste}
      style={{ textAlign: "center" }}
    >
      <h2 style={{ color: "#FF69B4" }}>윤성 구매품 품번박사 🧓</h2>

      <div className="mb-3">
        <input type="file" accept="image/*" onChange={handleFileChange} />
      </div>

      {preview && (
        <div className="mb-3">
          <img
            src={preview}
            alt="preview"
            style={{ maxWidth: "300px", border: "1px solid #ccc" }}
          />
        </div>
      )}

      <button className="btn btn-warning mb-4" onClick={handleUpload}>
        OCR + 매칭 실행 (업로드)
      </button>

      {/* 매칭 성공 품목 테이블 */}
      {matchedItems.length > 0 && (
        <div className="mb-3">
          <h4 style={{ color: "green" }}>매칭 성공 품목</h4>
          <table className="table table-bordered">
            <thead>
              <tr style={{ backgroundColor: "#E0FFFF" }}>
                <th>순번</th>
                <th>품번</th>
                <th>명칭</th>
                <th>규격</th>
                <th>수량</th>
                <th>매칭률</th>
              </tr>
            </thead>
            <tbody>
              {matchedItems.map((item, idx) => (
                <tr key={idx}>
                  <td>{item.seq}</td>
                  <td>{item.pn}</td>
                  <td>{item.name}</td>
                  <td>{item.spec}</td>
                  <td>{item.quantity}</td>
                  <td>{item.matchRate}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 매칭 실패 품목 테이블 */}
      {unmatchedItems.length > 0 && (
        <div>
          <h4 style={{ color: "red" }}>매칭 실패 품목</h4>
          <table className="table table-bordered">
            <thead>
              <tr style={{ backgroundColor: "#ffecec" }}>
                <th>순번</th>
                <th>명칭</th>
                <th>규격</th>
                <th>수량</th>
                <th>못찾은 이유</th>
              </tr>
            </thead>
            <tbody>
              {unmatchedItems.map((item, idx) => (
                <tr key={idx}>
                  <td>{item.seq}</td>
                  <td>{item.name}</td>
                  <td>{item.spec}</td>
                  <td>{item.quantity}</td>
                  <td>{item.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default App;
